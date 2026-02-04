// ============================================
// PRNT API — Commands Endpoint
// ============================================
//
// GET /api/commands — List available $commands
//
// Returns the list of registered commands from the D1
// `commands` table. The frontend uses this for:
//   - $ autocomplete in the input terminal
//   - Quick Reference sidebar section
//   - Help text when typing $commands
//
// The `commands` table is populated by D1 migrations
// when new plugins are added. It's the "documentation"
// layer — the actual routing logic lives in _registry.js.
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

    // Convert to a cleaner format for the frontend
    const commands = result.results.map(cmd => ({
      name: cmd.name,
      description: cmd.description,
      syntax: cmd.syntax,
      enabled: cmd.enabled === 1,
      // The frontend uses this to decide whether to show
      // the command in $autocomplete. 'default' is special —
      // it handles input without a $ prefix, so it shouldn't
      // appear in the $ suggestion list.
      isDefault: cmd.name === 'default'
    }));

    return new Response(JSON.stringify({ commands }), {
      headers: corsHeaders()
    });
  } catch (error) {
    console.error('Error fetching commands:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch commands' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
