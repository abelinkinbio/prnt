import { corsHeaders, jsonResponse } from './utils.js';

// --- Core handlers ---
import { handleItemsList } from './handlers/items.js';
import { handleItemGet, handleItemUpdate, handleItemDelete } from './handlers/item.js';
import { handleIngest } from './handlers/ingest.js';
import { handleSummary } from './handlers/summary.js';
import { handleGoogleAuth, handleGoogleCallback, handleGoogleStatus, handleGoogleDisconnect } from './handlers/auth.js';

// --- Plugin system handlers ---
import { handleCommandsList } from './handlers/commands.js';
import { handleBookmarksList, handleBookmarkDelete } from './handlers/bookmarks.js';
import { handleInput } from './handlers/input.js';
import {
  handleQuotesList,
  handleQuotesCreate,
  handleQuoteGet,
  handleQuoteUpdate,
  handleQuoteDelete
} from './handlers/quotes.js';

function handleOptions() {
  return new Response(null, { headers: corsHeaders() });
}

function matchRoute(path, pattern) {
  const pathParts = path.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);

  if (pathParts.length !== patternParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ---- CORS preflight ----
    if (method === 'OPTIONS') {
      return handleOptions();
    }

    try {
      // ============================================
      // CORE ROUTES
      // ============================================

      // --- Items (list). Creates go through POST /api/input. ---
      if (path === '/api/items' && method === 'GET') {
        return await handleItemsList(env);
      }

      // --- Single item (get, update, delete) ---
      const itemParams = matchRoute(path, '/api/items/:id');
      if (itemParams) {
        if (method === 'GET') return await handleItemGet(env, itemParams.id);
        if (method === 'PATCH') return await handleItemUpdate(request, env, ctx, itemParams.id);
        if (method === 'DELETE') return await handleItemDelete(env, ctx, itemParams.id);
      }

      // --- Ingest (external input from Raycast, iOS, email) ---
      // Already routes through plugin system for $commands
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

      // ============================================
      // PLUGIN SYSTEM ROUTES
      // ============================================

      // --- Commands (autocomplete list for $ prefix) ---
      if (path === '/api/commands' && method === 'GET') {
        return await handleCommandsList(env);
      }

      // --- Input (web app universal entry point) ---
      // All web app input goes here → plugin router
      // detects $commands and dispatches accordingly.
      // Normal text falls through to default handler.
      if (path === '/api/input' && method === 'POST') {
        return await handleInput(request, env, ctx);
      }

      // --- Bookmarks ---
      if (path === '/api/bookmarks') {
        if (method === 'GET') return await handleBookmarksList(env);
        if (method === 'DELETE') return await handleBookmarkDelete(request, env);
      }

      // --- Quotes ---
      const quoteParams = matchRoute(path, '/api/quotes/:id');
      if (quoteParams) {
        if (method === 'GET') return await handleQuoteGet(env, quoteParams.id);
        if (method === 'PATCH') return await handleQuoteUpdate(request, env, quoteParams.id);
        if (method === 'DELETE') return await handleQuoteDelete(env, quoteParams.id);
      }

      if (path === '/api/quotes') {
        if (method === 'GET') return await handleQuotesList(request, env);
        if (method === 'POST') return await handleQuotesCreate(request, env);
      }

      // ---- Static Assets (fallback) ----
      return env.ASSETS.fetch(request);

    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  }
};
