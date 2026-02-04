// ============================================
// PRNT API - Random Quote Endpoint
// Returns a single random quote for daily inspiration
// ============================================

// Helper: CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

// Handle OPTIONS (CORS preflight)
export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET /api/quotes/random - Get a random quote
// 
// Why random selection in SQLite?
// SQLite's ORDER BY RANDOM() is perfect for small-to-medium datasets.
// For your quotes collection (likely <1000 quotes), this is efficient.
// If you had millions of quotes, we'd use a different strategy.
export async function onRequestGet(context) {
  const { env, request } = context;
  
  try {
    const url = new URL(request.url);
    const favoritesOnly = url.searchParams.get('favorites') === 'true';
    
    // Build query - randomly select one non-deleted quote
    let query = 'SELECT * FROM quotes WHERE deleted = 0';
    
    if (favoritesOnly) {
      query += ' AND favorite = 1';
    }
    
    // ORDER BY RANDOM() picks a random row
    // LIMIT 1 ensures we only get one quote
    query += ' ORDER BY RANDOM() LIMIT 1';
    
    const result = await env.DB.prepare(query).first();
    
    if (!result) {
      return new Response(JSON.stringify({ 
        error: 'No quotes found',
        message: favoritesOnly 
          ? 'No favorite quotes yet. Add some favorites first!' 
          : 'No quotes yet. Add your first quote with $quotes'
      }), {
        status: 404,
        headers: corsHeaders()
      });
    }
    
    // Format the quote
    const quote = {
      ...result,
      favorite: result.favorite === 1,
      ai_attributed: result.ai_attributed === 1,
      deleted: result.deleted === 1
    };
    
    return new Response(JSON.stringify({ quote }), { headers: corsHeaders() });
    
  } catch (error) {
    console.error('Error fetching random quote:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch random quote' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
