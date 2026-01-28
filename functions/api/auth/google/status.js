// ============================================
// PRNT API - Google OAuth Status
// Check if Google account is connected
// ============================================

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET - Check connection status
export async function onRequestGet(context) {
  const { env } = context;

  try {
    const auth = await env.DB.prepare(`
      SELECT token_expiry, updated_at FROM google_auth WHERE id = 'default'
    `).first();

    if (!auth) {
      return new Response(JSON.stringify({
        connected: false,
        message: 'Google account not connected'
      }), { headers: corsHeaders() });
    }

    const expiry = new Date(auth.token_expiry);
    const isExpired = expiry < new Date();

    return new Response(JSON.stringify({
      connected: true,
      tokenExpiry: auth.token_expiry,
      isExpired,
      lastUpdated: auth.updated_at
    }), { headers: corsHeaders() });

  } catch (error) {
    console.error('Error checking auth status:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to check status' 
    }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

// DELETE - Disconnect Google account
export async function onRequestDelete(context) {
  const { env } = context;

  try {
    await env.DB.prepare(`DELETE FROM google_auth WHERE id = 'default'`).run();

    return new Response(JSON.stringify({
      success: true,
      message: 'Google account disconnected'
    }), { headers: corsHeaders() });

  } catch (error) {
    console.error('Error disconnecting:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to disconnect' 
    }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
