// ============================================
// PRNT - Ingest Handler (Updated)
// ============================================
// POST /api/ingest — accepts items from external
// sources (Raycast, iOS Shortcuts, Email Worker).
//
// WHAT CHANGED:
// Previously, this used parseShorthand() directly,
// which meant $commands like $bookmark and $quotes
// were ignored from external channels. Now it
// routes through the plugin system, so ALL input
// channels get $command support for free.
//
// The API key check remains — this endpoint is
// for authenticated external tools, not the web UI.
// ============================================

import { jsonResponse, generateId, now } from '../utils.js';
import { routeInput } from '../plugins/router.js';
import {
  getValidAccessToken,
  createCalendarReminder,
  createGoogleTask
} from '../google.js';

// Google sync for default items (tasks/notes created via ingest)
async function syncToGoogle(env, item) {
  try {
    const accessToken = await getValidAccessToken(env);
    if (!accessToken) return;

    let calendarEventId = null;
    let googleTaskId = null;

    if (item.type === 'task' && item.due_date) {
      try {
        calendarEventId = await createCalendarReminder(accessToken, item);
      } catch (e) {
        console.error('Calendar sync error:', e);
      }
    }

    if (item.type === 'task') {
      try {
        googleTaskId = await createGoogleTask(accessToken, item);
      } catch (e) {
        console.error('Tasks sync error:', e);
      }
    }

    if (calendarEventId || googleTaskId) {
      await env.DB.prepare(`
        UPDATE items SET google_calendar_event_id = ?, google_task_id = ? WHERE id = ?
      `).bind(calendarEventId, googleTaskId, item.id).run();
    }
  } catch (error) {
    console.error('Google sync error:', error);
  }
}

// POST /api/ingest
export async function handleIngest(request, env, ctx) {
  // --- API key check ---
  const apiKey = request.headers.get('X-API-Key')
    || request.headers.get('Authorization')?.replace('Bearer ', '');

  if (!env.PRNT_API_KEY) {
    return jsonResponse({
      error: 'API key not configured',
      message: 'Set PRNT_API_KEY environment variable'
    }, 500);
  }

  if (apiKey !== env.PRNT_API_KEY) {
    return jsonResponse({ error: 'Invalid API key' }, 401);
  }

  try {
    const body = await request.json();
    const { text, source = 'api' } = body;

    if (!text || !text.trim()) {
      return jsonResponse({ error: 'Text is required' }, 400);
    }

    // Route through the plugin system
    // This handles $bookmark, $quotes, and regular tasks/notes
    const result = await routeInput(text.trim(), env);

    // If the result contains an item (from the default plugin),
    // sync it to Google Calendar/Tasks in the background
    if (result.item && result.item.type === 'task') {
      ctx.waitUntil(syncToGoogle(env, result.item));
    }

    return jsonResponse({
      ...result,
      source
    }, 201);
  } catch (error) {
    console.error('Ingest error:', error);
    return jsonResponse({ error: 'Failed to create item' }, 500);
  }
}
