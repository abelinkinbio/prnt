// ============================================
// PRNT Plugin - Default (Tasks & Notes)
// ============================================
// This is the fallback handler. When the user
// types something WITHOUT a $command prefix,
// the router sends it here. It uses the same
// parseShorthand() logic for p0, @today, #tags, etc.
//
// This is a "plugin" in the sense that it has
// the same shape as every other command:
//   name, description, parse(), process(), respond()
//
// But it's special — it's the only plugin that
// runs when NO $command is detected.
// ============================================

import { parseShorthand, generateId, now } from '../../utils.js';

export const name = 'default';
export const description = 'Tasks and notes with shorthand commands';

// Parse raw text into structured task/note data
// This is the existing shorthand parser (p0, @today, #tags, /t)
export function parse(raw) {
  return parseShorthand(raw);
}

// Save the parsed item to D1
export async function process(parsed, env) {
  const id = generateId('item');
  const timestamp = now();

  // Insert the item
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

  // Insert tags
  if (parsed.tags && parsed.tags.length > 0) {
    const tagInserts = parsed.tags.map(tag => {
      const tagId = generateId('tag');
      return env.DB.prepare(
        `INSERT INTO tags (id, item_id, tag) VALUES (?, ?, ?)`
      ).bind(tagId, id, tag.toLowerCase());
    });
    await env.DB.batch(tagInserts);
  }

  return {
    id,
    content: parsed.content,
    raw_input: parsed.raw_input,
    type: parsed.type,
    priority: parsed.priority,
    due_date: parsed.due_date,
    due_time: parsed.due_time,
    completed: false,
    tags: parsed.tags || [],
    created_at: timestamp,
    updated_at: timestamp
  };
}

// Format the response
export function respond(result) {
  const type = result.type === 'task' ? 'Task' : 'Note';
  return {
    command: 'default',
    message: `${type} added`,
    item: result
  };
}
