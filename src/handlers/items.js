// ============================================
// PRNT — Items Handler (List + Create)
// ============================================
// Replaces: functions/api/items.js
// Routes:   GET /api/items, POST /api/items

import { jsonResponse, generateId, now } from '../utils.js';
import { getValidAccessToken, createCalendarReminder, createGoogleTask } from '../google.js';

// ---- Sync to Google (runs in background) ----

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

// ---- GET /api/items ----

export async function handleItemsList(env) {
  try {
    const itemsResult = await env.DB.prepare(`
      SELECT * FROM items 
      ORDER BY 
        CASE WHEN completed = 1 THEN 1 ELSE 0 END,
        priority ASC NULLS LAST,
        due_date ASC NULLS LAST,
        created_at DESC
    `).all();

    const tagsResult = await env.DB.prepare(`SELECT item_id, tag FROM tags`).all();

    // Build a lookup: item_id → [tags]
    const tagsByItem = {};
    for (const row of tagsResult.results) {
      if (!tagsByItem[row.item_id]) tagsByItem[row.item_id] = [];
      tagsByItem[row.item_id].push(row.tag);
    }

    const items = itemsResult.results.map(item => ({
      ...item,
      completed: item.completed === 1,
      deleted: item.deleted === 1,
      tags: tagsByItem[item.id] || []
    }));

    return jsonResponse({ items });
  } catch (error) {
    console.error('Error fetching items:', error);
    return jsonResponse({ error: 'Failed to fetch items' }, 500);
  }
}

// ---- POST /api/items ----

export async function handleItemsCreate(request, env, ctx) {
  try {
    const body = await request.json();
    const {
      content, raw_input, type = 'note',
      priority = null, due_date = null, due_time = null, tags = []
    } = body;

    if (!content || !content.trim()) {
      return jsonResponse({ error: 'Content is required' }, 400);
    }

    const id = generateId();
    const timestamp = now();

    await env.DB.prepare(`
      INSERT INTO items (id, content, raw_input, type, priority, due_date, due_time, completed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).bind(id, content.trim(), raw_input || content, type, priority, due_date, due_time, timestamp, timestamp).run();

    // Insert tags
    if (tags.length > 0) {
      const tagInserts = tags.map(tag => {
        const tagId = generateId('tag');
        return env.DB.prepare(`INSERT INTO tags (id, item_id, tag) VALUES (?, ?, ?)`).bind(tagId, id, tag.toLowerCase());
      });
      await env.DB.batch(tagInserts);
    }

    const newItem = {
      id, content: content.trim(), raw_input: raw_input || content,
      type, priority, due_date, due_time,
      completed: false, deleted: false,
      completed_at: null, google_task_id: null, google_calendar_event_id: null,
      created_at: timestamp, updated_at: timestamp, tags
    };

    // Sync to Google in the background using ctx.waitUntil
    // This is a Workers feature that keeps the worker alive
    // after sending the response, so the user doesn't wait
    ctx.waitUntil(syncToGoogle(env, newItem));

    return jsonResponse({ item: newItem }, 201);
  } catch (error) {
    console.error('Error creating item:', error);
    return jsonResponse({ error: 'Failed to create item' }, 500);
  }
}
