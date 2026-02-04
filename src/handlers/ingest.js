// ============================================
// PRNT — Ingest Handler
// ============================================
// Replaces: functions/api/ingest.js
// Route:    POST /api/ingest
//
// Accepts items from external sources (Raycast, iOS
// Shortcuts, email worker) protected by API key.

import { jsonResponse, generateId, now, parseShorthand } from '../utils.js';
import { getValidAccessToken, createCalendarReminder, createGoogleTask } from '../google.js';

// ---- Sync to Google (background) ----

async function syncToGoogle(env, item) {
  try {
    const accessToken = await getValidAccessToken(env);
    if (!accessToken) return;

    let calendarEventId = null;
    let googleTaskId = null;

    if (item.type === 'task' && item.due_date) {
      try { calendarEventId = await createCalendarReminder(accessToken, item); }
      catch (e) { console.error('Calendar sync error:', e); }
    }

    if (item.type === 'task') {
      try { googleTaskId = await createGoogleTask(accessToken, item); }
      catch (e) { console.error('Tasks sync error:', e); }
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

// ---- POST /api/ingest ----

export async function handleIngest(request, env, ctx) {
  // Check API key
  const apiKey = request.headers.get('X-API-Key') ||
    request.headers.get('Authorization')?.replace('Bearer ', '');

  if (!env.PRNT_API_KEY) {
    return jsonResponse({ error: 'API key not configured', message: 'Set PRNT_API_KEY environment variable' }, 500);
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

    const parsed = parseShorthand(text);
    const id = generateId();
    const timestamp = now();

    await env.DB.prepare(`
      INSERT INTO items (id, content, raw_input, type, priority, due_date, due_time, completed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).bind(id, parsed.content, parsed.raw_input + ` [via ${source}]`, parsed.type, parsed.priority, parsed.due_date, parsed.due_time, timestamp, timestamp).run();

    if (parsed.tags.length > 0) {
      const tagInserts = parsed.tags.map(tag => {
        const tagId = generateId('tag');
        return env.DB.prepare(`INSERT INTO tags (id, item_id, tag) VALUES (?, ?, ?)`).bind(tagId, id, tag.toLowerCase());
      });
      await env.DB.batch(tagInserts);
    }

    const newItem = {
      id, content: parsed.content, raw_input: parsed.raw_input,
      type: parsed.type, priority: parsed.priority,
      due_date: parsed.due_date, due_time: parsed.due_time,
      completed: false, tags: parsed.tags, source, created_at: timestamp
    };

    ctx.waitUntil(syncToGoogle(env, newItem));

    return jsonResponse({ success: true, item: newItem }, 201);
  } catch (error) {
    console.error('Ingest error:', error);
    return jsonResponse({ error: 'Failed to create item' }, 500);
  }
}
