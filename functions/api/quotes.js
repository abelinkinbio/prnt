// ============================================
// PRNT API - Quotes Endpoint
// Save and retrieve quotes for daily inspiration
// ============================================

// Helper: Generate unique ID for quotes
function generateId() {
  return 'quote_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Helper: Get current ISO timestamp
function now() {
  return new Date().toISOString();
}

// Helper: CORS headers (allows requests from any origin)
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
    'Content-Type': 'application/json'
  };
}

// Helper: Parse quote input from $quotes command
// Handles formats like:
//   $quotes The unexamined life is not worth living - Socrates
//   $quotes "Be yourself" - Oscar Wilde (De Profundis)
//   $quotes This is a quote without attribution
function parseQuoteInput(raw) {
  // Remove the $quotes command prefix if present
  let text = raw.replace(/^\$quotes?\s*/i, '').trim();
  
  // Remove surrounding quotes if present
  if ((text.startsWith('"') && text.includes('"')) || 
      (text.startsWith("'") && text.includes("'"))) {
    // Find the closing quote
    const quoteChar = text[0];
    const closeIndex = text.indexOf(quoteChar, 1);
    if (closeIndex > 0) {
      const quoted = text.substring(1, closeIndex);
      const rest = text.substring(closeIndex + 1).trim();
      text = quoted + ' ' + rest;
    }
  }
  
  let quoteText = text;
  let attribution = null;
  let source = null;
  
  // Try to extract source in parentheses first
  // Pattern: ... (Source Name)
  const sourceMatch = text.match(/\(([^)]+)\)\s*$/);
  if (sourceMatch) {
    source = sourceMatch[1].trim();
    text = text.replace(/\(([^)]+)\)\s*$/, '').trim();
  }
  
  // Try to extract attribution after a dash/hyphen
  // Pattern: quote text - Attribution Name
  // We look for common attribution markers: -, –, —, ~
  const attributionPatterns = [
    /\s+[-–—~]\s+([^(-]+)$/,     // dash followed by name
    /\s+[-–—~]\s*$/,              // trailing dash (incomplete)
  ];
  
  for (const pattern of attributionPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      attribution = match[1].trim();
      quoteText = text.replace(pattern, '').trim();
      break;
    }
  }
  
  // If no attribution found via dash, the whole text is the quote
  if (!attribution) {
    quoteText = text;
  }
  
  // Clean up any remaining quotes around the quote text
  quoteText = quoteText.replace(/^["'"']|["'"']$/g, '').trim();
  
  return {
    quote_text: quoteText,
    attribution: attribution,
    source: source,
    raw_input: raw
  };
}

// Helper: Try to attribute a quote using Workers AI
// Workers AI is Cloudflare's serverless AI inference platform
// It lets you run AI models at the edge without managing infrastructure
async function tryAiAttribution(env, quoteText) {
  // Only attempt if Workers AI is configured
  if (!env.AI) {
    return null;
  }
  
  try {
    const prompt = `You are a quote attribution expert. Given the following quote, identify who said it and from what source (book, speech, etc.) if known.

Quote: "${quoteText}"

Respond ONLY in this JSON format, nothing else:
{"attribution": "Name of person or null", "source": "Name of book/speech or null", "confidence": "high/medium/low"}

If you're not confident about the attribution, set the values to null.`;

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt: prompt,
      max_tokens: 150
    });
    
    // Parse the AI response
    const text = response.response || response;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Only return if confidence is medium or high
      if (parsed.confidence === 'high' || parsed.confidence === 'medium') {
        return {
          attribution: parsed.attribution,
          source: parsed.source
        };
      }
    }
  } catch (error) {
    console.error('AI attribution error:', error);
  }
  
  return null;
}

// Handle OPTIONS (CORS preflight)
export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET /api/quotes - List all quotes
export async function onRequestGet(context) {
  const { env, request } = context;
  
  try {
    const url = new URL(request.url);
    const showDeleted = url.searchParams.get('deleted') === 'true';
    const favoritesOnly = url.searchParams.get('favorites') === 'true';
    
    // Build query based on filters
    let query = 'SELECT * FROM quotes WHERE deleted = ?';
    const params = [showDeleted ? 1 : 0];
    
    if (favoritesOnly) {
      query += ' AND favorite = 1';
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await env.DB.prepare(query).bind(...params).all();
    
    // Format the results
    const quotes = result.results.map(q => ({
      ...q,
      favorite: q.favorite === 1,
      ai_attributed: q.ai_attributed === 1,
      deleted: q.deleted === 1
    }));
    
    return new Response(JSON.stringify({ 
      quotes,
      count: quotes.length 
    }), { headers: corsHeaders() });
    
  } catch (error) {
    console.error('Error fetching quotes:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch quotes' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

// POST /api/quotes - Create a new quote
export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const body = await request.json();
    
    // Handle both direct API calls and $quotes command input
    let quoteData;
    
    if (body.raw_input && body.raw_input.toLowerCase().includes('$quote')) {
      // Parse from $quotes command
      quoteData = parseQuoteInput(body.raw_input);
      quoteData.source_input = body.source || 'api';
    } else if (body.text) {
      // Direct $quotes command text
      quoteData = parseQuoteInput(body.text);
      quoteData.source_input = body.source || 'api';
    } else {
      // Direct quote object
      quoteData = {
        quote_text: body.quote_text,
        attribution: body.attribution || null,
        source: body.source || null,
        raw_input: body.raw_input || body.quote_text,
        source_input: body.source_input || 'api'
      };
    }
    
    // Validate
    if (!quoteData.quote_text || !quoteData.quote_text.trim()) {
      return new Response(JSON.stringify({ error: 'Quote text is required' }), {
        status: 400,
        headers: corsHeaders()
      });
    }
    
    // If no attribution, try AI attribution
    let aiAttributed = false;
    if (!quoteData.attribution && env.AI) {
      const aiResult = await tryAiAttribution(env, quoteData.quote_text);
      if (aiResult) {
        quoteData.attribution = aiResult.attribution;
        quoteData.source = quoteData.source || aiResult.source;
        aiAttributed = true;
      }
    }
    
    // Generate ID and timestamps
    const id = generateId();
    const timestamp = now();
    
    // Insert into database
    await env.DB.prepare(`
      INSERT INTO quotes (
        id, quote_text, attribution, source, favorite, ai_attributed,
        source_input, raw_input, created_at, updated_at, deleted
      ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0)
    `).bind(
      id,
      quoteData.quote_text.trim(),
      quoteData.attribution,
      quoteData.source,
      aiAttributed ? 1 : 0,
      quoteData.source_input,
      quoteData.raw_input,
      timestamp,
      timestamp
    ).run();
    
    // Return the created quote
    const newQuote = {
      id,
      quote_text: quoteData.quote_text.trim(),
      attribution: quoteData.attribution,
      source: quoteData.source,
      favorite: false,
      ai_attributed: aiAttributed,
      source_input: quoteData.source_input,
      raw_input: quoteData.raw_input,
      created_at: timestamp,
      updated_at: timestamp,
      deleted: false
    };
    
    return new Response(JSON.stringify({ 
      success: true,
      quote: newQuote,
      ai_attributed: aiAttributed
    }), {
      status: 201,
      headers: corsHeaders()
    });
    
  } catch (error) {
    console.error('Error creating quote:', error);
    return new Response(JSON.stringify({ error: 'Failed to create quote' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
