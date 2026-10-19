// ============================================
// PRNT — Single Item Handler
// ============================================
// Replaces: functions/api/items/[id].js
// Routes:   GET/PATCH /api/items/:id
//
// In Pages, the [id] in the filename was "dynamic routing"
// magic. In Workers, we extract :id from the URL ourselves
// (see matchRoute() in src/index.js).

import { jsonResponse, generateId, now } from '../utils.js';
import {
  getValidAccessToken, updateCalendarEvent, deleteCalendarEvent,
  updateGoogleTask, deleteGoogleTask, createCalendarReminder, createGoogleTask
} from '../google.js';

// ---- Sync updates to Google ----

async function syncUpdateToGoogle(env, item) {
  try {
    const accessToken = await getValidAccessToken(env);
    if (!accessToken) return;

    if (item.type === 'task' && item.due_date) {
      if (item.google_calendar_event_id) {
        await updateCalendarEvent(accessToken, item.google_calendar_event_id, item);
      } else {
        const eventId = await createCalendarReminder(accessToken, item);
        if (eventId) {
          await env.DB.prepare(`UPDATE items SET google_calendar_event_id = ? WHERE id = ?`).bind(eventId, item.id).run();
        }
      }
    }

    if (item.type === 'task') {
      if (item.google_task_id) {
        await updateGoogleTask(accessToken, item.google_task_id, item);
      } else {
        const taskId = await createGoogleTask(accessToken, item);
        if (taskId) {
          await env.DB.prepare(`UPDATE items SET google_task_id = ? WHERE id = ?`).bind(taskId, item.id).run();
        }
      }
    }
  } catch (error) {
    console.error('Google sync update error:', error);
  }
}

async function syncDeleteToGoogle(env, item) {
  try {
    const accessToken = await getValidAccessToken(env);
    if (!accessToken) return;
    if (item.google_calendar_event_id) await deleteCalendarEvent(accessToken, item.google_calendar_event_id);
    if (item.google_task_id) await deleteGoogleTask(accessToken, item.google_task_id);
  } catch (error) {
    console.error('Google sync delete error:', error);
  }
}

// ---- Helper: Fetch item with tags ----

async function getItemWithTags(env, itemId) {
  const itemResult = await env.DB.prepare(`SELECT * FROM items WHERE id = ? AND deleted = 0`).bind(itemId).first();
  if (!itemResult) return null;

  const tagsResult = await env.DB.prepare(`SELECT tag FROM tags WHERE item_id = ?`).bind(itemId).all();

  return {
    ...itemResult,
    completed: itemResult.completed === 1,
    deleted: itemResult.deleted === 1,
    tags: tagsResult.results.map(t => t.tag)
  };
}

// ---- GET /api/items/:id ----

export async function handleItemGet(env, itemId) {
  try {
    const item = await getItemWithTags(env, itemId);
    if (!item) return jsonResponse({ error: 'Item not found' }, 404);
    return jsonResponse(item);
  } catch (error) {
    console.error('Error fetching item:', error);
    return jsonResponse({ error: 'Failed to fetch item' }, 500);
  }
}

// ---- PATCH /api/items/:id ----

export async function handleItemUpdate(request, env, ctx, itemId) {
  try {
    const body = await request.json();
    const updates = [];
    const values = [];

    // Build dynamic SQL update — only update fields that were sent
    const allowedFields = [
      'content', 'type', 'priority', 'due_date', 'due_time',
      'completed', 'completed_at', 'deleted',
      'google_task_id', 'google_calendar_event_id'
    ];

    for (const field of allowedFields) {
      if (body.hasOwnProperty(field)) {
        updates.push(`${field} = ?`);
        // SQLite stores booleans as 0/1
        if (field === 'completed' || field === 'deleted') {
          values.push(body[field] ? 1 : 0);
        } else {
          values.push(body[field]);
        }
      }
    }

    if (updates.length === 0 && !body.tags) {
      return jsonResponse({ error: 'No valid fields to update' }, 400);
    }

    const prior = body.deleted ? await getItemWithTags(env, itemId) : null;
    if (body.deleted && !prior) return jsonResponse({ error: 'Item not found' }, 404);
    if (body.deleted) {
      updates.push('google_calendar_event_id = NULL', 'google_task_id = NULL');
    }

    // Always update the timestamp
    updates.push('updated_at = ?');
    values.push(now());
    values.push(itemId);

    if (updates.length > 1) {
      await env.DB.prepare(`UPDATE items SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    }

    // Handle tags if provided
    if (body.tags) {
      await env.DB.prepare(`DELETE FROM tags WHERE item_id = ?`).bind(itemId).run();
      if (body.tags.length > 0) {
        const tagInserts = body.tags.map(tag => {
          const tagId = generateId('tag');
          return env.DB.prepare(`INSERT INTO tags (id, item_id, tag) VALUES (?, ?, ?)`).bind(tagId, itemId, tag.toLowerCase());
        });
        await env.DB.batch(tagInserts);
      }
    }

    if (body.deleted) {
      ctx.waitUntil(syncDeleteToGoogle(env, prior));
      return jsonResponse({ item: { ...prior, deleted: true } });
    }

    const item = await getItemWithTags(env, itemId);
    if (!item) return jsonResponse({ error: 'Item not found' }, 404);
    ctx.waitUntil(syncUpdateToGoogle(env, item));
    return jsonResponse({ item });
  } catch (error) {
    console.error('Error updating item:', error);
    return jsonResponse({ error: 'Failed to update item' }, 500);
  }
}
