// ============================================
// PRNT API - Individual Item Endpoint
// Handles GET, PATCH, DELETE for single items
// ============================================

import {
  getValidAccessToken,
  updateCalendarEvent,
  deleteCalendarEvent,
  updateGoogleTask,
  deleteGoogleTask,
  createCalendarReminder,
  createGoogleTask
} from '../_google.js';

// Helper: CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

// Helper: Get current ISO timestamp
function now() {
  return new Date().toISOString();
}

// Helper: Sync updates to Google
async function syncUpdateToGoogle(env, item) {
  try {
    const accessToken = await getValidAccessToken(env);
    if (!accessToken) return;

    // Update or create calendar event
    if (item.type === 'task' && item.due_date) {
      if (item.google_calendar_event_id) {
        await updateCalendarEvent(accessToken, item.google_calendar_event_id, item);
      } else {
        const eventId = await createCalendarReminder(accessToken, item);
        if (eventId) {
          await env.DB.prepare(`
            UPDATE items SET google_calendar_event_id = ? WHERE id = ?
          `).bind(eventId, item.id).run();
        }
      }
    }

    // Update or create Google Task
    if (item.type === 'task') {
      if (item.google_task_id) {
        await updateGoogleTask(accessToken, item.google_task_id, item);
      } else {
        const taskId = await createGoogleTask(accessToken, item);
        if (taskId) {
          await env.DB.prepare(`
            UPDATE items SET google_task_id = ? WHERE id = ?
          `).bind(taskId, item.id).run();
        }
      }
    }
  } catch (error) {
    console.error('Google sync update error:', error);
  }
}

// Helper: Delete from Google
async function syncDeleteToGoogle(env, item) {
  try {
    const accessToken = await getValidAccessToken(env);
    if (!accessToken) return;

    if (item.google_calendar_event_id) {
      await deleteCalendarEvent(accessToken, item.google_calendar_event_id);
    }

    if (item.google_task_id) {
      await deleteGoogleTask(accessToken, item.google_task_id);
    }
  } catch (error) {
    console.error('Google sync delete error:', error);
  }
}

// Handle OPTIONS (CORS preflight)
export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET /api/items/:id - Get single item
export async function onRequestGet(context) {
  const { env, params } = context;
  const itemId = params.id;

  try {
    // Get item
    const itemResult = await env.DB.prepare(`
      SELECT * FROM items WHERE id = ?
    `).bind(itemId).first();

    if (!itemResult) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: corsHeaders()
      });
    }

    // Get tags
    const tagsResult = await env.DB.prepare(`
      SELECT tag FROM tags WHERE item_id = ?
    `).bind(itemId).all();

    const item = {
      ...itemResult,
      completed: itemResult.completed === 1,
      deleted: itemResult.deleted === 1,
      tags: tagsResult.results.map(t => t.tag)
    };

    return new Response(JSON.stringify(item), { headers: corsHeaders() });
  } catch (error) {
    console.error('Error fetching item:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch item' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

// PATCH /api/items/:id - Update item
export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const itemId = params.id;

  try {
    const body = await request.json();
    const updates = [];
    const values = [];

    // Build dynamic update query
    const allowedFields = ['content', 'type', 'priority', 'due_date', 'due_time', 'completed', 'completed_at', 'deleted', 'google_task_id', 'google_calendar_event_id'];
    
    for (const field of allowedFields) {
      if (body.hasOwnProperty(field)) {
        updates.push(`${field} = ?`);
        // Convert boolean to integer for SQLite
        if (field === 'completed' || field === 'deleted') {
          values.push(body[field] ? 1 : 0);
        } else {
          values.push(body[field]);
        }
      }
    }

    if (updates.length === 0 && !body.tags) {
      return new Response(JSON.stringify({ error: 'No valid fields to update' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    // Always update the timestamp
    updates.push('updated_at = ?');
    values.push(now());
    
    // Add item ID for WHERE clause
    values.push(itemId);

    // Execute update
    if (updates.length > 1) { // More than just updated_at
      const updateQuery = `UPDATE items SET ${updates.join(', ')} WHERE id = ?`;
      await env.DB.prepare(updateQuery).bind(...values).run();
    }

    // Handle tags if provided
    if (body.tags) {
      // Delete existing tags
      await env.DB.prepare(`DELETE FROM tags WHERE item_id = ?`).bind(itemId).run();
      
      // Insert new tags
      if (body.tags.length > 0) {
        const tagInserts = body.tags.map(tag => {
          const tagId = 'tag_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
          return env.DB.prepare(`
            INSERT INTO tags (id, item_id, tag) VALUES (?, ?, ?)
          `).bind(tagId, itemId, tag.toLowerCase());
        });
        
        await env.DB.batch(tagInserts);
      }
    }

    // Fetch and return updated item
    const itemResult = await env.DB.prepare(`
      SELECT * FROM items WHERE id = ?
    `).bind(itemId).first();

    if (!itemResult) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: corsHeaders()
      });
    }

    const tagsResult = await env.DB.prepare(`
      SELECT tag FROM tags WHERE item_id = ?
    `).bind(itemId).all();

    const item = {
      ...itemResult,
      completed: itemResult.completed === 1,
      deleted: itemResult.deleted === 1,
      tags: tagsResult.results.map(t => t.tag)
    };

    // Sync to Google in background (only if not deleted)
    if (!item.deleted) {
      context.waitUntil(syncUpdateToGoogle(env, item));
    }

    return new Response(JSON.stringify({ item }), { headers: corsHeaders() });
  } catch (error) {
    console.error('Error updating item:', error);
    return new Response(JSON.stringify({ error: 'Failed to update item' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

// DELETE /api/items/:id - Delete item
export async function onRequestDelete(context) {
  const { env, params } = context;
  const itemId = params.id;

  try {
    // First get the item to check for Google IDs
    const item = await env.DB.prepare(`
      SELECT * FROM items WHERE id = ?
    `).bind(itemId).first();

    if (!item) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: corsHeaders()
      });
    }

    // Delete tags first (foreign key)
    await env.DB.prepare(`DELETE FROM tags WHERE item_id = ?`).bind(itemId).run();
    
    // Delete item
    await env.DB.prepare(`DELETE FROM items WHERE id = ?`).bind(itemId).run();

    // Sync delete to Google in background
    context.waitUntil(syncDeleteToGoogle(env, item));

    return new Response(JSON.stringify({ success: true, id: itemId }), {
      headers: corsHeaders()
    });
  } catch (error) {
    console.error('Error deleting item:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete item' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
