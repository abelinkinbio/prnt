// ============================================
// PRNT - Plugin Router
// ============================================
// Takes raw input text and routes it to the
// correct plugin. This is the "Route" layer
// in the capture → route → execute model.
//
// If the text starts with "$commandname",
// it looks up that command in the registry
// and runs its parse → process → respond chain.
//
// If there's no $ prefix, it falls through to
// the __default plugin (normal task/note handling).
// ============================================

import { registry } from './registry.js';

// Detect if input starts with a $command
// Returns { command: 'bookmark', rest: 'https://...' }
// or { command: null } if no $command detected
function detectCommand(text) {
  const trimmed = text.trim();

  // Check for $ prefix
  if (!trimmed.startsWith('$')) {
    return { command: null };
  }

  // Extract the command name (first word after $)
  const match = trimmed.match(/^\$(\w+)/);
  if (!match) {
    return { command: null };
  }

  const commandName = match[1].toLowerCase();

  // Check if this command exists in the registry
  if (registry[commandName]) {
    return {
      command: commandName,
      rest: trimmed // full text including $command prefix
    };
  }

  // Unknown $command — fall through to default
  return { command: null };
}

// Main routing function
// Takes raw text and env, returns a response object
export async function routeInput(raw, env) {
  const { command } = detectCommand(raw);

  // Pick the right plugin
  const plugin = command
    ? registry[command]
    : registry.__default;

  if (!plugin) {
    throw new Error('No default plugin registered');
  }

  // Run the plugin's three-step chain:
  // 1. parse() — extract structured data from raw text
  // 2. process() — save to D1 (and any side effects)
  // 3. respond() — format the API response
  const parsed = plugin.parse(raw);
  const result = await plugin.process(parsed, env);
  const response = plugin.respond(result);

  return response;
}
