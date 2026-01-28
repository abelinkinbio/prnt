// ============================================
// PRNT API - Google OAuth Callback
// Handles the redirect from Google with auth code
// ============================================

import { exchangeCodeForTokens } from '../../_google.js';

export async function onRequestGet(context) {
  const { env, request } = context;

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  // Handle errors from Google
  if (error) {
    return new Response(renderErrorPage(error), {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  if (!code) {
    return new Response(renderErrorPage('No authorization code received'), {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  try {
    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(
      code,
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const now = new Date().toISOString();
    const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Store tokens in database (upsert)
    await env.DB.prepare(`
      INSERT INTO google_auth (id, access_token, refresh_token, token_expiry, created_at, updated_at)
      VALUES ('default', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, google_auth.refresh_token),
        token_expiry = excluded.token_expiry,
        updated_at = excluded.updated_at
    `).bind(
      tokens.access_token,
      tokens.refresh_token || '',
      expiry,
      now,
      now
    ).run();

    // Redirect back to app with success
    return new Response(renderSuccessPage(), {
      headers: { 'Content-Type': 'text/html' }
    });

  } catch (err) {
    console.error('OAuth error:', err);
    return new Response(renderErrorPage(err.message), {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

function renderSuccessPage() {
  return `
<!DOCTYPE html>
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
      background: #0a1628;
      color: #e8f1ff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background-image: 
        linear-gradient(#0f2847 1px, transparent 1px),
        linear-gradient(90deg, #0f2847 1px, transparent 1px);
      background-size: 20px 20px;
    }
    .container {
      text-align: center;
      padding: 40px;
      border: 1px solid #1e4976;
      background: rgba(10, 22, 40, 0.9);
      max-width: 400px;
    }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { font-size: 18px; letter-spacing: 4px; margin-bottom: 10px; color: #6bcf6b; }
    p { font-size: 12px; color: #3d8eff; margin-bottom: 20px; }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      background: #3d8eff;
      color: #0a1628;
      text-decoration: none;
      font-family: inherit;
      font-size: 12px;
      letter-spacing: 2px;
      text-transform: uppercase;
      border: none;
      cursor: pointer;
    }
    .btn:hover { background: #5ba0ff; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✓</div>
    <h1>CONNECTED</h1>
    <p>Google Calendar and Tasks are now synced with PRNT</p>
    <a href="/" class="btn">Return to PRNT</a>
  </div>
  <script>
    // Auto-redirect after 3 seconds
    setTimeout(() => { window.location.href = '/'; }, 3000);
  </script>
</body>
</html>
  `;
}

function renderErrorPage(errorMessage) {
  return `
<!DOCTYPE html>
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
      background: #0a1628;
      color: #e8f1ff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background-image: 
        linear-gradient(#0f2847 1px, transparent 1px),
        linear-gradient(90deg, #0f2847 1px, transparent 1px);
      background-size: 20px 20px;
    }
    .container {
      text-align: center;
      padding: 40px;
      border: 1px solid #1e4976;
      background: rgba(10, 22, 40, 0.9);
      max-width: 400px;
    }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { font-size: 18px; letter-spacing: 4px; margin-bottom: 10px; color: #ff6b6b; }
    p { font-size: 11px; color: #e8f1ff; margin-bottom: 20px; opacity: 0.7; }
    .error { 
      font-size: 10px; 
      padding: 10px; 
      background: rgba(255, 107, 107, 0.1); 
      border: 1px solid #ff6b6b;
      margin-bottom: 20px;
      word-break: break-all;
    }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      background: #3d8eff;
      color: #0a1628;
      text-decoration: none;
      font-family: inherit;
      font-size: 12px;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
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
</html>
  `;
}
