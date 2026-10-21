import { corsHeaders, jsonResponse } from './utils.js';

import { handleItemsList } from './handlers/items.js';
import { handleItemGet, handleItemUpdate } from './handlers/item.js';
import { handleIngest } from './handlers/ingest.js';
import { handleSummary } from './handlers/summary.js';
import { handleGoogleAuth, handleGoogleCallback, handleGoogleStatus, handleGoogleDisconnect } from './handlers/auth.js';

import { handleCommandsList } from './handlers/commands.js';
import { handleBookmarksList, handleBookmarkDelete } from './handlers/bookmarks.js';
import { handleInput } from './handlers/input.js';
import {
  handleQuotesList,
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

    if (method === 'OPTIONS') {
      return handleOptions();
    }

    try {
      // --- Items (list). Creates go through POST /api/input. ---
      if (path === '/api/items' && method === 'GET') {
        return await handleItemsList(env);
      }

      const itemParams = matchRoute(path, '/api/items/:id');
      if (itemParams) {
        if (method === 'GET') return await handleItemGet(env, itemParams.id);
        if (method === 'PATCH') return await handleItemUpdate(request, env, ctx, itemParams.id);
      }

      if (path === '/api/ingest' && method === 'POST') {
        return await handleIngest(request, env, ctx);
      }

      if (path === '/api/summary' && method === 'POST') {
        return await handleSummary(env);
      }

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

      if (path === '/api/commands' && method === 'GET') {
        return await handleCommandsList();
      }

      if (path === '/api/input' && method === 'POST') {
        return await handleInput(request, env, ctx);
      }

      if (path === '/api/bookmarks') {
        if (method === 'GET') return await handleBookmarksList(env);
        if (method === 'DELETE') return await handleBookmarkDelete(request, env);
      }

      const quoteParams = matchRoute(path, '/api/quotes/:id');
      if (quoteParams) {
        if (method === 'PATCH') return await handleQuoteUpdate(request, env, quoteParams.id);
        if (method === 'DELETE') return await handleQuoteDelete(env, quoteParams.id);
      }

      if (path === '/api/quotes' && method === 'GET') {
        return await handleQuotesList(env);
      }

      return env.ASSETS.fetch(request);

    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  }
};
