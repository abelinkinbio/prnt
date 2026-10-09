import { jsonResponse, htmlResponse } from '../utils.js';
import { getAuthUrl, exchangeCodeForTokens } from '../google.js';

// ---- GET /api/auth/google ----
// Redirects user to Google's consent screen

export async function handleGoogleAuth(request, env) {
  if (!env.GOOGLE_CLIENT_ID) {
    return jsonResponse({
      error: 'Google OAuth not configured',
      message: 'GOOGLE_CLIENT_ID environment variable is missing'
    }, 500);
  }

  const url = new URL(request.url);
  const redirectUri = `${url.protocol}//${url.host}/api/auth/google/callback`;
  const authUrl = getAuthUrl(env.GOOGLE_CLIENT_ID, redirectUri);

  return Response.redirect(authUrl, 302);
}

// ---- GET /api/auth/google/callback ----
// Handles the redirect from Google with the auth code

export async function handleGoogleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) return htmlResponse(renderErrorPage(error));
  if (!code) return htmlResponse(renderErrorPage('No authorization code received'));

  try {
    const redirectUri = `${url.protocol}//${url.host}/api/auth/google/callback`;

    const tokens = await exchangeCodeForTokens(
      code, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri
    );

    const timestamp = new Date().toISOString();
    const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Store tokens (upsert — insert or update if exists)
    await env.DB.prepare(`
      INSERT INTO google_auth (id, access_token, refresh_token, token_expiry, created_at, updated_at)
      VALUES ('default', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, google_auth.refresh_token),
        token_expiry = excluded.token_expiry,
        updated_at = excluded.updated_at
    `).bind(tokens.access_token, tokens.refresh_token || '', expiry, timestamp, timestamp).run();

    return htmlResponse(renderSuccessPage());
  } catch (err) {
    console.error('OAuth error:', err);
    return htmlResponse(renderErrorPage(err.message));
  }
}

// ---- GET /api/auth/google/status ----

export async function handleGoogleStatus(env) {
  try {
    const auth = await env.DB.prepare(
      `SELECT token_expiry, updated_at FROM google_auth WHERE id = 'default'`
    ).first();

    if (!auth) {
      return jsonResponse({ connected: false, message: 'Google account not connected' });
    }

    const isExpired = new Date(auth.token_expiry) < new Date();
    return jsonResponse({
      connected: true,
      tokenExpiry: auth.token_expiry,
      isExpired,
      lastUpdated: auth.updated_at
    });
  } catch (error) {
    console.error('Error checking auth status:', error);
    return jsonResponse({ error: 'Failed to check status' }, 500);
  }
}

// ---- DELETE /api/auth/google/status ----

export async function handleGoogleDisconnect(env) {
  try {
    await env.DB.prepare(`DELETE FROM google_auth WHERE id = 'default'`).run();
    return jsonResponse({ success: true, message: 'Google account disconnected' });
  } catch (error) {
    console.error('Error disconnecting:', error);
    return jsonResponse({ error: 'Failed to disconnect' }, 500);
  }
}

// ---- HTML Templates ----

function renderSuccessPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PRNT - Connected</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'JetBrains Mono', monospace;
      background: #0a1628; color: #e8f1ff;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background-image: linear-gradient(#0f2847 1px, transparent 1px), linear-gradient(90deg, #0f2847 1px, transparent 1px);
      background-size: 20px 20px;
    }
    .container { text-align: center; padding: 40px; border: 1px solid #1e4976; background: rgba(10, 22, 40, 0.9); max-width: 400px; }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { font-size: 18px; letter-spacing: 4px; margin-bottom: 10px; color: #6bcf6b; }
    p { font-size: 12px; color: #3d8eff; margin-bottom: 20px; }
    .btn { display: inline-block; padding: 12px 24px; background: #3d8eff; color: #0a1628; text-decoration: none; font-family: inherit; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
    .btn:hover { background: #5ba0ff; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✔</div>
    <h1>CONNECTED</h1>
    <p>Google Calendar and Tasks are now synced with PRNT</p>
    <a href="/" class="btn">Return to PRNT</a>
  </div>
  <script>setTimeout(() => { window.location.href = '/'; }, 3000);</script>
</body>
</html>`;
}

function renderErrorPage(errorMessage) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PRNT - Error</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'JetBrains Mono', monospace;
      background: #0a1628; color: #e8f1ff;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background-image: linear-gradient(#0f2847 1px, transparent 1px), linear-gradient(90deg, #0f2847 1px, transparent 1px);
      background-size: 20px 20px;
    }
    .container { text-align: center; padding: 40px; border: 1px solid #1e4976; background: rgba(10, 22, 40, 0.9); max-width: 400px; }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { font-size: 18px; letter-spacing: 4px; margin-bottom: 10px; color: #ff6b6b; }
    p { font-size: 11px; color: #e8f1ff; margin-bottom: 20px; opacity: 0.7; }
    .error { font-size: 10px; padding: 10px; background: rgba(255, 107, 107, 0.1); border: 1px solid #ff6b6b; margin-bottom: 20px; word-break: break-all; }
    .btn { display: inline-block; padding: 12px 24px; background: #3d8eff; color: #0a1628; text-decoration: none; font-family: inherit; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✕</div>
    <h1>CONNECTION FAILED</h1>
    <p>Unable to connect to Google</p>
    <div class="error">${errorMessage}</div>
    <a href="/" class="btn">Return to PRNT</a>
  </div>
</body>
</html>`;
}
