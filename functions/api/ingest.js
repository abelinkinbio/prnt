// ============================================
// PRNT API - Ingest Endpoint
// Accepts items from external sources:
// - Email Worker
// - Raycast extension
// - iOS Shortcuts
// 
// Protected by API key (set PRNT_API_KEY env var)
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

// Helper: Format date
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Helper: CORS headers
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Content-Type': 'application/json'
  };
}

// Helper: Parse shorthand from raw text
function parseShorthand(raw) {
  let content = raw.trim();
  let type = 'note';
  let priority = null;
  let dueDate = null;
  let dueTime = null;
  const tags = [];

  // Check for /t command (task conversion)
  if (content.includes('/t')) {
    type = 'task';
    content = content.replace(/\/t\s*/g, '');
  }

  // Extract priority (p0, p1, p2, p3)
  const priorityMatch = content.match(/\bp([0-3])\b/i);
  if (priorityMatch) {
    priority = parseInt(priorityMatch[1]);
    content = content.replace(/\bp[0-3]\b/gi, '');
  }

  // Extract tags (#tag)
  const tagMatches = content.match(/#(\w+)/g);
  if (tagMatches) {
    tagMatches.forEach(tag => {
      tags.push(tag.substring(1).toLowerCase());
    });
    content = content.replace(/#\w+/g, '');
  }

  // Get current date in Lisbon timezone
  const nowDate = new Date();
  const lisbon = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const lisbonParts = lisbon.formatToParts(nowDate);
  const lisbonDate = new Date(
    parseInt(lisbonParts.find(p => p.type === 'year').value),
    parseInt(lisbonParts.find(p => p.type === 'month').value) - 1,
    parseInt(lisbonParts.find(p => p.type === 'day').value)
  );

  // @today
  if (content.match(/@today\b/i)) {
    dueDate = formatDate(lisbonDate);
    content = content.replace(/@today\b/gi, '');
    type = 'task';
  }

  // @eod (end of day - 6pm Lisbon)
  if (content.match(/@eod\b/i)) {
    dueDate = formatDate(lisbonDate);
    dueTime = '18:00';
    content = content.replace(/@eod\b/gi, '');
    type = 'task';
  }

  // @tomorrow or @tmrw
  if (content.match(/@(tomorrow|tmrw)\b/i)) {
    const tomorrow = new Date(lisbonDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dueDate = formatDate(tomorrow);
    content = content.replace(/@(tomorrow|tmrw)\b/gi, '');
    type = 'task';
  }

  // @friday or @eow (end of week)
  if (content.match(/@(friday|eow)\b/i)) {
    const friday = new Date(lisbonDate);
    const dayOfWeek = friday.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
    friday.setDate(friday.getDate() + daysUntilFriday);
    dueDate = formatDate(friday);
    content = content.replace(/@(friday|eow)\b/gi, '');
    type = 'task';
  }

  // @jan-25 style dates
  const dateMatch = content.match(/@([a-z]{3})-(\d{1,2})\b/i);
  if (dateMatch) {
    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const month = months[dateMatch[1].toLowerCase()];
    const day = parseInt(dateMatch[2]);
    if (month !== undefined && day >= 1 && day <= 31) {
      const targetDate = new Date(lisbonDate.getFullYear(), month, day);
      if (targetDate < lisbonDate) {
        targetDate.setFullYear(targetDate.getFullYear() + 1);
      }
      dueDate = formatDate(targetDate);
      content = content.replace(/@[a-z]{3}-\d{1,2}\b/gi, '');
      type = 'task';
    }
  }

  // Clean up content
  content = content.replace(/\s+/g, ' ').trim();

  return {
    content,
    raw_input: raw,
    type,
    priority,
    due_date: dueDate,
    due_time: dueTime,
    tags
  };
}

// Helper: Sync task to Google (non-blocking)
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

// POST /api/ingest - Create item from external source
export async function onRequestPost(context) {
  const { request, env } = context;

  // Check API key
  const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (!env.PRNT_API_KEY) {
    return new Response(JSON.stringify({ 
      error: 'API key not configured',
      message: 'Set PRNT_API_KEY environment variable'
    }), {
      status: 500,
      headers: corsHeaders()
    });
  }

  if (apiKey !== env.PRNT_API_KEY) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), {
      status: 401,
      headers: corsHeaders()
    });
  }

  try {
    const body = await request.json();
    const { text, source = 'api' } = body;

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: 'Text is required' }), {
        status: 400,
        headers: corsHeaders()
      });
    }

    // Parse the shorthand
    const parsed = parseShorthand(text);

    // Create item
    const id = generateId();
    const timestamp = now();

    await env.DB.prepare(`
      INSERT INTO items (id, content, raw_input, type, priority, due_date, due_time, completed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).bind(
      id,
      parsed.content,
      parsed.raw_input + ` [via ${source}]`,
      parsed.type,
      parsed.priority,
      parsed.due_date,
      parsed.due_time,
      timestamp,
      timestamp
    ).run();

    // Insert tags
    if (parsed.tags.length > 0) {
      const tagInserts = parsed.tags.map(tag => {
        const tagId = 'tag_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        return env.DB.prepare(`
          INSERT INTO tags (id, item_id, tag) VALUES (?, ?, ?)
        `).bind(tagId, id, tag.toLowerCase());
      });
      await env.DB.batch(tagInserts);
    }

    // Build response item
    const newItem = {
      id,
      content: parsed.content,
      raw_input: parsed.raw_input,
      type: parsed.type,
      priority: parsed.priority,
      due_date: parsed.due_date,
      due_time: parsed.due_time,
      completed: false,
      tags: parsed.tags,
      source,
      created_at: timestamp
    };

    // Sync to Google in background
    context.waitUntil(syncToGoogle(env, newItem));

    return new Response(JSON.stringify({
      success: true,
      item: newItem
    }), {
      status: 201,
      headers: corsHeaders()
    });

  } catch (error) {
    console.error('Ingest error:', error);
    return new Response(JSON.stringify({ error: 'Failed to create item' }), {
      status: 500,
      headers: corsHeaders()
    });
  }
}
