// ============================================
// PRNT API - Google OAuth Initiation
// Redirects user to Google consent screen
// ============================================

import { getAuthUrl, GOOGLE_SCOPES } from '../../_google.js';

export async function onRequestGet(context) {
  const { env, request } = context;

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  // Check if required env vars are set
  if (!env.GOOGLE_CLIENT_ID) {
    return new Response(JSON.stringify({ 
      error: 'Google OAuth not configured',
      message: 'GOOGLE_CLIENT_ID environment variable is missing'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const authUrl = getAuthUrl(env.GOOGLE_CLIENT_ID, redirectUri);
  
  // Redirect to Google
  return Response.redirect(authUrl, 302);
}
