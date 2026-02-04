// ============================================
// PRNT API - Ingest Endpoint
// Universal input handler for all external sources:
// - Email Worker
// - Raycast extension  
// - iOS Shortcuts
// 
// This is the "router" - it looks at incoming text and decides
// whether it's a task, note, quote, or other command.
//
// Protected by API key (set PRNT_API_KEY env var)
// ============================================

import { 
  getValidAccessToken, 
  createCalendarReminder, 
  createGoogleTask 
} from './_google.js';

// Helper: Generate unique ID
function generateId(prefix = 'item') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Helper: Get current ISO timestamp
function now() {
  return new Date().toISOString();
}

// Helper: Format date
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Helper: CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Content-Type': 'application/json'
  };
}

// ============================================
// COMMAND DETECTION
// Check if the input is a special $ command
// Returns: { command: 'quotes'|null, raw: string }
// ============================================
function detectCommand(text) {
  const trimmed = text.trim();
  
  // $quotes or $quote command
  if (trimmed.match(/^\$quotes?\s/i)) {
    return { command: 'quotes', raw: trimmed };
  }
  
  // Add more commands here as you build them:
  // if (trimmed.match(/^\$read\s/i)) return { command: 'read', raw: trimmed };
  // if (trimmed.match(/^\$inspo\s/i)) return { command: 'inspo', raw: trimmed };
  
  // Not a special command - treat as regular item
  return { command: null, raw: trimmed };
}

// ============================================
// QUOTE PARSER
// Parses $quotes command into structured data
// ============================================
function parseQuoteInput(raw) {
  // Remove the $quotes command prefix
  let text = raw.replace(/^\$quotes?\s*/i, '').trim();
  
  // Remove surrounding quotes if present
  if ((text.startsWith('"') && text.includes('"')) || 
      (text.startsWith("'") && text.includes("'"))) {
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
  
  // Extract source in parentheses: ... (Book Name)
  const sourceMatch = text.match(/\(([^)]+)\)\s*$/);
  if (sourceMatch) {
    source = sourceMatch[1].trim();
    text = text.replace(/\(([^)]+)\)\s*$/, '').trim();
  }
  
  // Extract attribution after dash: ... - Author Name
  const attributionPatterns = [
    /\s+[-–—~]\s+([^(-]+)$/,
    /\s+[-–—~]\s*$/,
  ];
  
  for (const pattern of attributionPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      attribution = match[1].trim();
      quoteText = text.replace(pattern, '').trim();
      break;
    }
  }
  
  if (!attribution) {
    quoteText = text;
  }
  
  // Clean up
  quoteText = quoteText.replace(/^["'"']|["'"']$/g, '').trim();
  
  return { quote_text: quoteText, attribution, source, raw_input: raw };
}

// ============================================
// AI ATTRIBUTION
// Uses Workers AI to identify unknown quotes
// ============================================
async function tryAiAttribution(env, quoteText) {
  if (!env.AI) return null;
  
  try {
    const prompt = `You are a quote attribution expert. Given this quote, identify who said it and the source if known.

Quote: "${quoteText}"

Respond ONLY in JSON format:
{"attribution": "Name or null", "source": "Book/speech or null", "confidence": "high/medium/low"}`;

    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt,
      max_tokens: 150
    });
    
    const text = response.response || response;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.confidence === 'high' || parsed.confidence === 'medium') {
        return { attribution: parsed.attribution, source: parsed.source };
      }
    }
  } catch (error) {
    console.error('AI attribution error:', error);
  }
  
  return null;
}

// ============================================
// QUOTE CREATION
// Saves quote to the quotes table
// ============================================
async function createQuote(env, quoteData, source) {
  const id = generateId('quote');
  const timestamp = now();
  
  // Try AI attribution if no attribution provided
  let aiAttributed = false;
  if (!quoteData.attribution && env.AI) {
    const aiResult = await tryAiAttribution(env, quoteData.quote_text);
    if (aiResult) {
      quoteData.attribution = aiResult.attribution;
      quoteData.source = quoteData.source || aiResult.source;
      aiAttributed = true;
    }
  }
  
  await env.DB.prepare(`
    INSERT INTO quotes (
      id, quote_text, attribution, source, favorite, ai_attributed,
      source_input, raw_input, created_at, updated_at, deleted
    ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0)
  `).bind(
    id,
    quoteData.quote_text,
    quoteData.attribution,
    quoteData.source,
    aiAttributed ? 1 : 0,
    source,
    quoteData.raw_input + ` [via ${source}]`,
    timestamp,
    timestamp
  ).run();
  
  return {
    id,
    quote_text: quoteData.quote_text,
    attribution: quoteData.attribution,
    source: quoteData.source,
    favorite: false,
    ai_attributed: aiAttributed,
    source_input: source,
    created_at: timestamp
  };
}

// ============================================
// ITEM SHORTHAND PARSER
// For regular tasks and notes
// ============================================
function parseShorthand(raw) {
  let content = raw.trim();
  let type = 'note';
  let priority = null;
  let dueDate = null;
  let dueTime = null;
  const tags = [];

  // Check for /t command (task conversion)
  if (content.includes('/t')) {
    type = 'task';
    content = content.replace(/\/t\s*/g, '');
  }

  // Extract priority (p0, p1, p2, p3)
  const priorityMatch = content.match(/\bp([0-3])\b/i);
  if (priorityMatch) {
    priority = parseInt(priorityMatch[1]);
    content = content.replace(/\bp[0-3]\b/gi, '');
  }

  // Extract tags (#tag)
  const tagMatches = content.match(/#(\w+)/g);
  if (tagMatches) {
    tagMatches.forEach(tag => {
      tags.push(tag.substring(1).toLowerCase());
    });
    content = content.replace(/#\w+/g, '');
  }

  // Get current date in Lisbon timezone
  const nowDate = new Date();
  const lisbon = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const lisbonParts = lisbon.formatToParts(nowDate);
  const lisbonDate = new Date(
    parseInt(lisbonParts.find(p => p.type === 'year').value),
    parseInt(lisbonParts.find(p => p.type === 'month').value) - 1,
    parseInt(lisbonParts.find(p => p.type === 'day').value)
  );

  // @today
  if (content.match(/@today\b/i)) {
    dueDate = formatDate(lisbonDate);
    content = content.replace(/@today\b/gi, '');
    type = 'task';
  }

  // @eod (end of day - 6pm Lisbon)
  if (content.match(/@eod\b/i)) {
    dueDate = formatDate(lisbonDate);
    dueTime = '18:00';
    content = content.replace(/@eod\b/gi, '');
    type = 'task';
  }

  // @tomorrow or @tmrw
  if (content.match(/@(tomorrow|tmrw)\b/i)) {
    const tomorrow = new Date(lisbonDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dueDate = formatDate(tomorrow);
    content = content.replace(/@(tomorrow|tmrw)\b/gi, '');
    type = 'task';
  }

  // @friday or @eow (end of week)
  if (content.match(/@(friday|eow)\b/i)) {
    const friday = new Date(lisbonDate);
    const dayOfWeek = friday.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
    friday.setDate(friday.getDate() + daysUntilFriday);
    dueDate = formatDate(friday);
    content = content.replace(/@(friday|eow)\b/gi, '');
    type = 'task';
  }

  // @jan-25 style dates
  const dateMatch = content.match(/@([a-z]{3})-(\d{1,2})\b/i);
  if (dateMatch) {
    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const month = months[dateMatch[1].toLowerCase()];
    const day = parseInt(dateMatch[2]);
    if (month !== undefined && day >= 1 && day <= 31) {
      const targetDate = new Date(lisbonDate.getFullYear(), month, day);
      if (targetDate < lisbonDate) {
        targetDate.setFullYear(targetDate.getFullYear() + 1);
      }
      dueDate = formatDate(targetDate);
      content = content.replace(/@[a-z]{3}-\d{1,2}\b/gi, '');
      type = 'task';
    }
  }

  // Clean up content
  content = content.replace(/\s+/g, ' ').trim();

  return {
    content,
    raw_input: raw,
    type,
    priority,
    due_date: dueDate,
    due_time: dueTime,
    tags
  };
}

// Helper: Sync task to Google (non-blocking)
async function syncToGoogle(env, item) {
  try {
    const accessToken = await getValidAccessToken(env);
    if (!accessToken) return;

    let calendarEventId = null;
    let googleTaskId = null;

    if (item.type === 'task' && item.due_date) {
      try {
        calendarEventId = await createCalendarReminder(accessToken, item);
      } catch (e) {
        console.error('Calendar sync error:', e);
      }
    }

    if (item.type === 'task') {
      try {
        googleTaskId = await createGoogleTask(accessToken, item);
      } catch (e) {
        console.error('Tasks sync error:', e);
      }
    }

    if (calendarEventId || googleTaskId) {
      await env.DB.prepare(`
        UPDATE items 
        SET google_calendar_event_id = ?, google_task_id = ?
        WHERE id = ?
      `).bind(calendarEventId, googleTaskId, item.id).run();
    }
  } catch (error) {
    console.error('Google sync error:', error);
  }
}

// Handle OPTIONS (CORS preflight)
export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// POST /api/ingest - Universal input handler
export async function onRequestPost(context) {
  const { request, env } = context;

  // Check API key
  const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (!env.PRNT_API_KEY) {
    return new Response(JSON.stringify({ 
      error: 'API key not configured',
      message: 'Set PRNT_API_KEY environment variable'
    }), {
      status: 500,
      headers: corsHeaders()
    });
  }

  if (apiKey !== env.PRNT_API_KEY) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), {
      status: 401,
      headers: corsHeaders()
    });
  }

  try {
    const body = await request.json();
    const { text, source = 'api' } = body;

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: 'Text is required' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    // ============================================
    // COMMAND ROUTING
    // Check if this is a special $ command
    // ============================================
    const { command, raw } = detectCommand(text);
    
    // Handle $quotes command
    if (command === 'quotes') {
      const quoteData = parseQuoteInput(raw);
      const quote = await createQuote(env, quoteData, source);
      
      return new Response(JSON.stringify({
        success: true,
        type: 'quote',
        quote
      }), {
        status: 201,
        headers: corsHeaders()
      });
    }
    
    // ============================================
    // DEFAULT: Create item (task or note)
    // ============================================
    const parsed = parseShorthand(text);
    const id = generateId('item');
    const timestamp = now();

    await env.DB.prepare(`
      INSERT INTO items (id, content, raw_input, type, priority, due_date, due_time, completed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).bind(
      id,
      parsed.content,
      parsed.raw_input + ` [via ${source}]`,
      parsed.type,
      parsed.priority,
      parsed.due_date,
      parsed.due_time,
      timestamp,
      timestamp
    ).run();

    // Insert tags
    if (parsed.tags.length > 0) {
      const tagInserts = parsed.tags.map(tag => {
        const tagId = 'tag_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        return env.DB.prepare(`
          INSERT INTO tags (id, item_id, tag) VALUES (?, ?, ?)
        `).bind(tagId, id, tag.toLowerCase());
      });
      await env.DB.batch(tagInserts);
    }

    // Build response item
    const newItem = {
      id,
      content: parsed.content,
      raw_input: parsed.raw_input,
      type: parsed.type,
      priority: parsed.priority,
      due_date: parsed.due_date,
      due_time: parsed.due_time,
      completed: false,
      tags: parsed.tags,
      source,
      created_at: timestamp
    };

    // Sync to Google in background
    context.waitUntil(syncToGoogle(env, newItem));

    return new Response(JSON.stringify({
      success: true,
      type: parsed.type,
      item: newItem
    }), {
      status: 201,
      headers: corsHeaders()
    });

  } catch (error) {
    console.error('Ingest error:', error);
    return new Response(JSON.stringify({ error: 'Failed to create item' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
