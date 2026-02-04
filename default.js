// ============================================
// PRNT — Default Command Plugin
// ============================================
//
// This is the most important plugin. It handles ALL input
// that doesn't start with a $command prefix — which means
// it handles the existing task/note shorthand system:
//
//   /t           → force item to be a task
//   p0, p1, p2, p3 → set priority (Eisenhower matrix)
//   @today       → due today
//   @eod         → end of day (6pm Lisbon)
//   @tmrw        → due tomorrow
//   @friday/@eow → due this Friday
//   @jan-25      → specific date
//   #tag         → add a tag
//   **bold**     → markdown bold
//   *italic*     → markdown italic
//
// This parser previously existed in TWO places:
//   1. ingest.js (server-side, for external channels)
//   2. index.html (client-side, for live preview)
//
// Now it lives here as the single source of truth for
// server-side parsing. The frontend keeps a lightweight
// copy for live preview (since we can't import from the
// server), but the REAL parsing always happens here.
//
// ARCHITECTURE:
// This file exports three functions that follow the
// plugin contract:
//   parse(envelope)       → extract structured data
//   process(parsed, env)  → write to D1, sync to Google
//   respond(result)       → format the response
// ============================================

import {
  getValidAccessToken,
  createCalendarReminder,
  createGoogleTask
} from '../_google.js';

// ── Plugin Metadata ──────────────────────────
export const name = 'default';
export const description = 'Tasks and notes with shorthand commands (/t, @today, p0-p3, #tags)';
export const syntax = 'Review PR @today p0 #frontend';

// ── Helpers ──────────────────────────────────

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
 * PRNT uses Europe/Lisbon as the reference timezone for all
 * date calculations — @today, @eod, @tomorrow all resolve
 * relative to Lisbon time, not UTC or the user's browser timezone.
 */
function getLisbonToday() {
  const nowDate = new Date();
  const lisbon = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = lisbon.formatToParts(nowDate);
  return new Date(
    parseInt(parts.find(p => p.type === 'year').value),
    parseInt(parts.find(p => p.type === 'month').value) - 1,
    parseInt(parts.find(p => p.type === 'day').value)
  );
}

// ── Step 1: PARSE ────────────────────────────
// Extract structured data from the raw input text.
// This is a pure function — no side effects, no DB calls.

export function parse(envelope) {
  let content = envelope.raw.trim();
  let type = 'note';
  let priority = null;
  let dueDate = null;
  let dueTime = null;
  const tags = [];

  // /t → force this item to be a task
  if (content.includes('/t')) {
    type = 'task';
    content = content.replace(/\/t\s*/g, '');
  }

  // p0, p1, p2, p3 → set priority level
  // Uses word boundary (\b) so "up0" doesn't match
  const priorityMatch = content.match(/\bp([0-3])\b/i);
  if (priorityMatch) {
    priority = parseInt(priorityMatch[1]);
    content = content.replace(/\bp[0-3]\b/gi, '');
  }

  // #tag → extract tags (can have multiple)
  const tagMatches = content.match(/#(\w+)/g);
  if (tagMatches) {
    tagMatches.forEach(tag => {
      tags.push(tag.substring(1).toLowerCase());
    });
    content = content.replace(/#\w+/g, '');
  }

  // ── Date commands ──
  // All dates resolve relative to Lisbon timezone.
  const lisbonDate = getLisbonToday();

  // @today → due today
  if (content.match(/@today\b/i)) {
    dueDate = formatDate(lisbonDate);
    content = content.replace(/@today\b/gi, '');
    type = 'task';
  }

  // @eod → end of day (sets due time to 6pm Lisbon)
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

  // @jan-25 style → specific month and day
  // If the date has already passed this year, it rolls to next year.
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

  // Clean up whitespace (collapse multiple spaces, trim)
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

// ── Step 2: PROCESS ──────────────────────────
// Do the actual work: write to D1, sync to Google.
// This is where side effects happen.

export async function process(parsed, env, ctx) {
  const id = generateId();
  const timestamp = now();

  // Write the item to D1
  await env.DB.prepare(`
    INSERT INTO items (id, content, raw_input, type, priority, due_date, due_time, completed, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).bind(
    id,
    parsed.content,
    parsed.source !== 'web' ? parsed.raw_input + ` [via ${parsed.source}]` : parsed.raw_input,
    parsed.type,
    parsed.priority,
    parsed.due_date,
    parsed.due_time,
    timestamp,
    timestamp
  ).run();

  // Write tags to D1
  if (parsed.tags.length > 0) {
    const tagInserts = parsed.tags.map(tag => {
      const tagId = 'tag_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      return env.DB.prepare(`
        INSERT INTO tags (id, item_id, tag) VALUES (?, ?, ?)
      `).bind(tagId, id, tag.toLowerCase());
    });
    await env.DB.batch(tagInserts);
  }

  // Build the complete item for the response
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

  // Sync to Google Calendar + Tasks in the background.
  // ctx.waitUntil() tells Cloudflare: "don't kill this Worker
  // until this async work finishes, but don't block the response."
  // This keeps the response fast while sync happens in parallel.
  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(syncToGoogle(env, newItem));
  }

  return { success: true, item: newItem };
}

// ── Step 3: RESPOND ──────────────────────────
// Format the result for the API response.

export function respond(result) {
  return {
    status: 201,
    body: {
      item: result.item,
      command: 'default'
    }
  };
}

// ── Google Sync (deferred work) ──────────────

async function syncToGoogle(env, item) {
  try {
    const accessToken = await getValidAccessToken(env);
    if (!accessToken) return;

    let calendarEventId = null;
    let googleTaskId = null;

    // Only create calendar events for tasks with due dates
    if (item.type === 'task' && item.due_date) {
      try {
        calendarEventId = await createCalendarReminder(accessToken, item);
      } catch (e) {
        console.error('Calendar sync error:', e);
      }
    }

    // Create Google Task for all tasks (even without due dates)
    if (item.type === 'task') {
      try {
        googleTaskId = await createGoogleTask(accessToken, item);
      } catch (e) {
        console.error('Tasks sync error:', e);
      }
    }

    // Store the Google IDs back in D1 so we can update/delete them later
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
