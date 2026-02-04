// ============================================
// PRNT — Main Worker Entry Point
// ============================================
//
// In Cloudflare Pages, each file in functions/ became a route
// automatically. In Workers, we define routes explicitly.
//
// This is actually better because:
// 1. You can see ALL your routes in one place
// 2. You can add middleware (like auth checks) easily
// 3. You have full control over request/response flow
// 4. You can add scheduled triggers, WebSockets, etc.
//
// How it works:
// - Every HTTP request hits the fetch() handler below
// - We match the URL path to the right handler function
// - If no API route matches, Workers Assets serves static files
// ============================================

import { handleItemsList, handleItemsCreate } from './handlers/items.js';
import { handleItemGet, handleItemUpdate, handleItemDelete } from './handlers/item.js';
import { handleIngest } from './handlers/ingest.js';
import { handleSummary } from './handlers/summary.js';
import { handleGoogleAuth, handleGoogleCallback, handleGoogleStatus, handleGoogleDisconnect } from './handlers/auth.js';

// ============================================
// CORS Helper
// ============================================
// CORS (Cross-Origin Resource Sharing) headers let your
// frontend talk to your API. Since both live on the same
// domain, this is mainly needed for local development and
// external API clients (Raycast, iOS Shortcuts, etc.)

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Content-Type': 'application/json'
  };
}

// Handle CORS preflight requests
// Browsers send an OPTIONS request before the real request
// to check if the server allows cross-origin requests
function handleOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// ============================================
// JSON Response Helper
// ============================================
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders()
  });
}

// ============================================
// Route Matching Helper
// ============================================
// Matches URL patterns like /api/items/:id
// Returns the matched parameters (e.g., { id: "item_abc123" })

function matchRoute(path, pattern) {
  const pathParts = path.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);

  if (pathParts.length !== patternParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      // This is a dynamic segment (like :id)
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null; // Static segment doesn't match
    }
  }
  return params;
}

// ============================================
// Main Worker Export
// ============================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ---- CORS preflight ----
    if (method === 'OPTIONS') {
      return handleOptions();
    }

    // ---- API Routes ----
    // These replace your old functions/ directory structure:
    //
    // OLD (Pages Functions):              NEW (Workers Router):
    // functions/api/items.js         →    /api/items
    // functions/api/items/[id].js    →    /api/items/:id
    // functions/api/ingest.js        →    /api/ingest
    // functions/api/summary.js       →    /api/summary
    // functions/api/auth/google/     →    /api/auth/google/*

    try {
      // --- Items (list + create) ---
      if (path === '/api/items') {
        if (method === 'GET') return await handleItemsList(env);
        if (method === 'POST') return await handleItemsCreate(request, env, ctx);
      }

      // --- Single item (get, update, delete) ---
      const itemParams = matchRoute(path, '/api/items/:id');
      if (itemParams) {
        if (method === 'GET') return await handleItemGet(env, itemParams.id);
        if (method === 'PATCH') return await handleItemUpdate(request, env, ctx, itemParams.id);
        if (method === 'DELETE') return await handleItemDelete(env, ctx, itemParams.id);
      }

      // --- Ingest (external input from Raycast, iOS, email) ---
      if (path === '/api/ingest' && method === 'POST') {
        return await handleIngest(request, env, ctx);
      }

      // --- AI Summary ---
      if (path === '/api/summary' && method === 'POST') {
        return await handleSummary(env);
      }

      // --- Google OAuth ---
      if (path === '/api/auth/google' && method === 'GET') {
        return await handleGoogleAuth(request, env);
      }
      if (path === '/api/auth/google/callback' && method === 'GET') {
        return await handleGoogleCallback(request, env);
      }
      if (path === '/api/auth/google/status') {
        if (method === 'GET') return await handleGoogleStatus(env);
        if (method === 'DELETE') return await handleGoogleDisconnect(env);
      }

      // ---- Static Assets (fallback) ----
      // If no API route matched, let Workers Assets serve the
      // static files from the public/ directory. This replaces
      // the automatic static file serving that Pages did.
      //
      // The ASSETS binding is provided by the "assets" config
      // in wrangler.jsonc. It knows how to serve index.html
      // for the root path, handle content types, etc.
      return env.ASSETS.fetch(request);

    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  }
};
