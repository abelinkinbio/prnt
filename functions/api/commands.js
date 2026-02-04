// ============================================
// PRNT API — Commands Endpoint
// GET /api/commands
//
// Returns the list of available $commands.
// The frontend uses this to build autocomplete
// suggestions and the Quick Reference panel.
//
// WHY STORE COMMANDS IN D1?
// The router uses the registry (JS imports) to
// know which plugins exist. But the frontend needs
// to know too — for autocomplete and help text.
// Fetching from a database is cleaner than hardcoding
// command names in the HTML. When you add a new plugin,
// you seed its metadata into D1 alongside the code.
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

// GET /api/commands — List all available commands
export async function onRequestGet(context) {
  const { env } = context;

  try {
    const result = await env.DB.prepare(`
      SELECT name, description, syntax, enabled
      FROM commands
      WHERE enabled = 1
      ORDER BY name ASC
    `).all();

    return new Response(JSON.stringify({
      commands: result.results
    }), { headers: corsHeaders() });

  } catch (error) {
    console.error('Error fetching commands:', error);

    // If the commands table doesn't exist yet (migration
    // hasn't been run), return an empty list gracefully
    // instead of crashing.
    return new Response(JSON.stringify({
      commands: []
    }), { headers: corsHeaders() });
  }
}
