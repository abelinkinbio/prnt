// ============================================
// PRNT - Commands Handler
// ============================================
// Returns the list of available $commands.
// The frontend calls GET /api/commands when you
// type "$" in the input terminal, so it knows
// what autocomplete suggestions to show.
//
// This reads from the "commands" table in D1.
// To add a new command to autocomplete, just
// INSERT a row into that table — no code change.
// ============================================

import { jsonResponse } from '../utils.js';

// GET /api/commands — list all enabled commands
export async function handleCommandsList(env) {
  try {
    const result = await env.DB.prepare(`
      SELECT name, description, syntax 
      FROM commands 
      WHERE enabled = 1
      ORDER BY name ASC
    `).all();

    return jsonResponse({
      commands: result.results.map(cmd => ({
        name: cmd.name,
        description: cmd.description,
        syntax: cmd.syntax
      }))
    });
  } catch (error) {
    console.error('Error fetching commands:', error);
    return jsonResponse({ error: 'Failed to fetch commands' }, 500);
  }
}
