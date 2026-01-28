// ============================================
// PRNT API - Items Endpoint
// Handles CRUD operations for notes and tasks
// ============================================

import { 
  getValidAccessToken, 
  createCalendarReminder, 
  createGoogleTask 
} from './_google.js';

// Helper: Generate unique ID
function generateId() {
  return 'item_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Helper: Get current ISO timestamp
function now() {
  return new Date().toISOString();
}

// Helper: CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

// Helper: Sync task to Google (non-blocking)
async function syncToGoogle(env, item) {
  try {
    const accessToken = await getValidAccessToken(env);
    if (!accessToken) return; // Google not connected

    let calendarEventId = null;
    let googleTaskId = null;

    // Create calendar reminder if task has due date
    if (item.type === 'task' && item.due_date) {
      try {
        calendarEventId = await createCalendarReminder(accessToken, item);
      } catch (e) {
        console.error('Calendar sync error:', e);
      }
    }

    // Create Google Task for all tasks
    if (item.type === 'task') {
      try {
        googleTaskId = await createGoogleTask(accessToken, item);
      } catch (e) {
        console.error('Tasks sync error:', e);
      }
    }

    // Update item with Google IDs
    if (calendarEventId || googleTaskId) {
      await env.DB.prepare(`
        UPDATE items 
        SET google_calendar_event_id = ?, google_task_id = ?
        WHERE id = ?
      `).bind(calendarEventId, googleTaskId, item.id).run();
    }

  } catch (error) {
    console.error('Google sync error:', error);
  }
}

// Handle OPTIONS (CORS preflight)
export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET /api/items - List all items
export async function onRequestGet(context) {
  const { env } = context;
  
  try {
    // Get all items
    const itemsResult = await env.DB.prepare(`
      SELECT * FROM items 
      ORDER BY 
        CASE WHEN completed = 1 THEN 1 ELSE 0 END,
        priority ASC NULLS LAST,
        due_date ASC NULLS LAST,
        created_at DESC
    `).all();

    // Get all tags
    const tagsResult = await env.DB.prepare(`
      SELECT item_id, tag FROM tags
    `).all();

    // Create a map of item_id -> tags
    const tagsByItem = {};
    for (const row of tagsResult.results) {
      if (!tagsByItem[row.item_id]) {
        tagsByItem[row.item_id] = [];
      }
      tagsByItem[row.item_id].push(row.tag);
    }

    // Attach tags to items
    const items = itemsResult.results.map(item => ({
      ...item,
      completed: item.completed === 1,
      deleted: item.deleted === 1,
      tags: tagsByItem[item.id] || []
    }));

    return new Response(JSON.stringify({ items }), { headers: corsHeaders() });
  } catch (error) {
    console.error('Error fetching items:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch items' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}

// POST /api/items - Create new item
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const {
      content,
      raw_input,
      type = 'note',
      priority = null,
      due_date = null,
      due_time = null,
      tags = []
    } = body;

    // Validate required fields
    if (!content || !content.trim()) {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    // Validate type
    const validTypes = ['task', 'note'];
    if (!validTypes.includes(type)) {
      return new Response(JSON.stringify({ error: 'Invalid type. Must be "task" or "note"' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    // Validate priority
    const validPriorities = [0, 1, 2, 3, null];
    if (!validPriorities.includes(priority)) {
      return new Response(JSON.stringify({ error: 'Invalid priority. Must be 0, 1, 2, 3, or null' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    // Validate tags (must be array of strings)
    if (!Array.isArray(tags) || tags.some(t => typeof t !== 'string')) {
      return new Response(JSON.stringify({ error: 'Tags must be an array of strings' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    const id = generateId();
    const timestamp = now();

    // Insert item
    await env.DB.prepare(`
      INSERT INTO items (id, content, raw_input, type, priority, due_date, due_time, completed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).bind(id, content.trim(), raw_input || content, type, priority, due_date, due_time, timestamp, timestamp).run();

    // Insert tags
    if (tags.length > 0) {
      const tagInserts = tags.map(tag => {
        const tagId = 'tag_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        return env.DB.prepare(`
          INSERT INTO tags (id, item_id, tag) VALUES (?, ?, ?)
        `).bind(tagId, id, tag.toLowerCase());
      });
      
      await env.DB.batch(tagInserts);
    }

    // Return created item with tags
    const newItem = {
      id,
      content: content.trim(),
      raw_input: raw_input || content,
      type,
      priority,
      due_date,
      due_time,
      completed: false,
      deleted: false,
      completed_at: null,
      google_task_id: null,
      google_calendar_event_id: null,
      created_at: timestamp,
      updated_at: timestamp,
      tags
    };

    // Sync to Google in background (don't await to keep response fast)
    context.waitUntil(syncToGoogle(env, newItem));

    return new Response(JSON.stringify({ item: newItem }), {
      status: 201,
      headers: corsHeaders()
    });
  } catch (error) {
    console.error('Error creating item:', error);
    return new Response(JSON.stringify({ error: 'Failed to create item' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
