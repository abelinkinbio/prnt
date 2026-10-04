// ============================================
// PRNT - Input Handler
// ============================================
// POST /api/input — the single entry point for
// all user input from the web app.
//
// This replaces the old pattern where the frontend
// posted directly to /api/items. Now ALL input
// goes through the plugin router, which detects
// $commands and dispatches to the right handler.
//
// Normal text (no $ prefix) still creates tasks
// and notes exactly like before — the default
// plugin handles that.
// ============================================

import { jsonResponse } from '../utils.js';
import { routeInput } from '../plugins/router.js';
import { syncToGoogle } from '../google.js';

// Shared create path for POST /api/input and POST /api/ingest.
// Tasks schedule Google Calendar/Tasks sync after the response.
// syncToGoogle returns immediately when Google is not connected.
export async function routeAndSyncInput(raw, env, ctx) {
  const result = await routeInput(raw, env);

  if (result.item && result.item.type === 'task') {
    ctx.waitUntil(syncToGoogle(env, result.item));
  }

  return result;
}

// POST /api/input — route input through the plugin system
export async function handleInput(request, env, ctx) {
  try {
    const body = await request.json();
    const { raw } = body;

    if (!raw || !raw.trim()) {
      return jsonResponse({ error: 'Text is required' }, 400);
    }

    const result = await routeAndSyncInput(raw.trim(), env, ctx);

    return jsonResponse(result, 201);
  } catch (error) {
    console.error('Input handler error:', error);
    return jsonResponse({ error: 'Failed to process input' }, 500);
  }
}
