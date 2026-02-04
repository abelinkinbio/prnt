// ============================================
// PRNT — Default Command Plugin
// The fallback handler for input WITHOUT a $command prefix.
//
// This plugin IS the original PRNT behavior:
// it parses shorthand like /t, @today, @eod, p0-p3,
// #tags, and creates tasks or notes in the items table.
//
// HISTORY:
// This parsing logic used to live in TWO places:
//   1. ingest.js (server-side, for external channels)
//   2. index.html (client-side, for the web app)
//
// Having two copies meant bugs in one weren't fixed
// in the other. Now there's ONE source of truth: this
// file. The server always does the real parsing.
// The frontend keeps a lightweight preview parser
// for UX, but the final result comes from here.
//
// ARCHITECTURE:
// Every plugin exports the same three functions:
//   parse(envelope)        → extract structured data
//   process(parsed, env, ctx) → write to DB, call APIs
//   respond(result)        → format the response
// ============================================

import {
  getValidAccessToken,
  createCalendarReminder,
  createGoogleTask
} from '../_google.js';

// ─── Plugin Metadata ───
export const name = 'default';
export const description = 'Create a task or note using shorthand';

// ─── Helpers ───

function generateId() {
  return 'item_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function now() {
  return new Date().toISOString();
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Get today's date in Lisbon timezone.
 * 
 * WHY LISBON?
 * PRNT was built for use in Lisbon, Portugal.
 * All date shortcuts (@today, @eod, @tmrw) resolve
 * relative to Lisbon time, not UTC or the server's
 * timezone. Cloudflare Workers run at the edge and
 * don't have a consistent timezone, so we explicitly
 * use Intl.DateTimeFormat to get Lisbon's "today".
 */
function getLisbonToday() {
  const now = new Date();
  const lisbon = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = lisbon.formatToParts(now);
  return new Date(
    parseInt(parts.find(p => p.type === 'year').value),
    parseInt(parts.find(p => p.type === 'month').value) - 1,
    parseInt(parts.find(p => p.type === 'day').value)
  );
}

// ─── 1. PARSE ───
// Extract structured fields from raw text.
// This is the consolidated shorthand parser.

export function parse(envelope) {
  let content = envelope.raw.trim();
  let type = 'note';
  let priority = null;
  let dueDate = null;
  let dueTime = null;
  const tags = [];

  // /t → force this to be a task (even without a date or priority)
  if (content.includes('/t')) {
    type = 'task';
    content = content.replace(/\/t\s*/g, '');
  }

  // p0, p1, p2, p3 → priority level
  // Uses word boundaries (\b) so "p0" matches but "app0" doesn't
  const priorityMatch = content.match(/\bp([0-3])\b/i);
  if (priorityMatch) {
    priority = parseInt(priorityMatch[1]);
    content = content.replace(/\bp[0-3]\b/gi, '');
  }

  // #word → tags (can have multiple)
  const tagMatches = content.match(/#(\w+)/g);
  if (tagMatches) {
    tagMatches.forEach(tag => {
      tags.push(tag.substring(1).toLowerCase());
    });
    content = content.replace(/#\w+/g, '');
  }

  // ─── Date shortcuts ───
  // All dates resolve relative to Lisbon time.
  // Having a due date automatically makes the item a task.
  const lisbonDate = getLisbonToday();

  // @today → due today
  if (content.match(/@today\b/i)) {
    dueDate = formatDate(lisbonDate);
    content = content.replace(/@today\b/gi, '');
    type = 'task';
  }

  // @eod → due today at 6pm (end of day)
  if (content.match(/@eod\b/i)) {
    dueDate = formatDate(lisbonDate);
    dueTime = '18:00';
    content = content.replace(/@eod\b/gi, '');
    type = 'task';
  }

  // @tomorrow or @tmrw → due tomorrow
  if (content.match(/@(tomorrow|tmrw)\b/i)) {
    const tomorrow = new Date(lisbonDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dueDate = formatDate(tomorrow);
    content = content.replace(/@(tomorrow|tmrw)\b/gi, '');
    type = 'task';
  }

  // @friday or @eow → due this Friday (end of week)
  if (content.match(/@(friday|eow)\b/i)) {
    const friday = new Date(lisbonDate);
    const dayOfWeek = friday.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
    friday.setDate(friday.getDate() + daysUntilFriday);
    dueDate = formatDate(friday);
    content = content.replace(/@(friday|eow)\b/gi, '');
    type = 'task';
  }

  // @jan-25, @feb-14, etc. → specific date
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
      // If the date is in the past, assume next year
      if (targetDate < lisbonDate) {
        targetDate.setFullYear(targetDate.getFullYear() + 1);
      }
      dueDate = formatDate(targetDate);
      content = content.replace(/@[a-z]{3}-\d{1,2}\b/gi, '');
      type = 'task';
    }
  }

  // Clean up whitespace (multiple spaces → single space, trim edges)
  content = content.replace(/\s+/g, ' ').trim();

  return {
    content,
    raw_input: envelope.raw,
    source: envelope.source || 'web',
    type,
    priority,
    due_date: dueDate,
    due_time: dueTime,
    tags
  };
}

// ─── 2. PROCESS ───
// Write to D1 and sync to Google.
// This is the "do the work" step.

export async function process(parsed, env, ctx) {
  const id = generateId();
  const timestamp = now();

  // Insert the item into D1
  await env.DB.prepare(`
    INSERT INTO items (id, content, raw_input, type, priority, due_date, due_time, completed, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).bind(
    id,
    parsed.content,
    parsed.raw_input,
    parsed.type,
    parsed.priority,
    parsed.due_date,
    parsed.due_time,
    timestamp,
    timestamp
  ).run();

  // Insert tags (if any)
  if (parsed.tags.length > 0) {
    const tagInserts = parsed.tags.map(tag => {
      const tagId = 'tag_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      return env.DB.prepare(`
        INSERT INTO tags (id, item_id, tag) VALUES (?, ?, ?)
      `).bind(tagId, id, tag.toLowerCase());
    });
    await env.DB.batch(tagInserts);
  }

  // Build the item object to return
  const newItem = {
    id,
    content: parsed.content,
    raw_input: parsed.raw_input,
    type: parsed.type,
    priority: parsed.priority,
    due_date: parsed.due_date,
    due_time: parsed.due_time,
    completed: false,
    deleted: false,
    completed_at: null,
    google_task_id: null,
    google_calendar_event_id: null,
    created_at: timestamp,
    updated_at: timestamp,
    tags: parsed.tags
  };

  // ─── Google Sync (deferred) ───
  // We use ctx.waitUntil() to sync to Google Calendar
  // and Tasks WITHOUT blocking the response to the user.
  //
  // WHY waitUntil?
  // Cloudflare Workers have a 30-second CPU time limit.
  // The Google API calls can take a few seconds each.
  // By deferring them, the user gets an instant response
  // while the sync happens in the background.
  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(syncToGoogle(env, newItem));
  }

  return { success: true, item: newItem };
}

// ─── 3. RESPOND ───
// Format the response for the caller.

export function respond(result) {
  const type = result.item.type === 'task' ? 'Task' : 'Note';
  return {
    command: 'default',
    message: `${type} added`,
    item: result.item
  };
}

// ─── Google Sync Helper ───
// Extracted from items.js. Creates calendar events
// and Google Tasks for tasks with due dates.

async function syncToGoogle(env, item) {
  try {
    const accessToken = await getValidAccessToken(env);
    if (!accessToken) return;

    let calendarEventId = null;
    let googleTaskId = null;

    // Calendar reminder for tasks with due dates
    if (item.type === 'task' && item.due_date) {
      try {
        calendarEventId = await createCalendarReminder(accessToken, item);
      } catch (e) {
        console.error('Calendar sync error:', e);
      }
    }

    // Google Task for all tasks
    if (item.type === 'task') {
      try {
        googleTaskId = await createGoogleTask(accessToken, item);
      } catch (e) {
        console.error('Tasks sync error:', e);
      }
    }

    // Store Google IDs back in D1
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
