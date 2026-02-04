// ============================================
// PRNT — Central Router
// ============================================
//
// This is the heart of the plugin system.
// Every piece of input — from the web app, iOS, Raycast,
// email, or any future channel — flows through here.
//
// The router follows the three-layer model:
//
//   CAPTURE (done by the caller — items.js, ingest.js, input.js)
//     ↓  produces an "envelope" — a standard input shape
//   ROUTE (this file)
//     ↓  inspects the raw text for a $command prefix
//     ↓  looks up the command in the Plugin Registry
//     ↓  dispatches to the right plugin handler
//   EXECUTE (the plugin's parse → process → respond)
//     ↓  returns a result to the caller
//
// The router itself never changes when you add new commands.
// You just add a new plugin file and register it.
// ============================================

import { registry } from './_registry.js';

/**
 * Route an envelope through the plugin system.
 *
 * An "envelope" is the standard input shape that every channel produces:
 * {
 *   raw: "the full raw text",
 *   source: "web" | "ios-shortcut" | "raycast" | "email" | "api",
 *   meta: { ... }   // optional channel-specific context
 * }
 *
 * The router:
 * 1. Checks if the raw text starts with $command
 * 2. If yes, looks up that command in the registry
 * 3. If found, dispatches to the plugin's parse → process → respond
 * 4. If not found (or no $command), falls through to the default handler
 *    (which is the existing task/note shorthand parser)
 *
 * @param {Object} envelope - The standard input shape
 * @param {Object} env - Cloudflare environment (DB, secrets, etc.)
 * @param {Object} ctx - Cloudflare execution context (for waitUntil)
 * @returns {Object} - { status, body } where body is the JSON response
 */
export async function routeEnvelope(envelope, env, ctx) {
  // Step 1: Check for a $command prefix
  // The regex matches: $commandname followed by optional text
  // The /s flag makes . match newlines too (for multi-line input)
  const match = envelope.raw.trim().match(/^\$(\w+)\s*([\s\S]*)/);

  if (match) {
    const commandName = match[1].toLowerCase();
    const plugin = registry[commandName];

    if (plugin) {
      // We found a registered plugin for this command.
      // Strip the $command prefix from the raw text before passing
      // to the plugin — the plugin only cares about the content after $command.
      const strippedEnvelope = {
        ...envelope,
        raw: match[2].trim(),
        command: commandName
      };

      // Execute the three-step plugin pipeline: parse → process → respond
      const parsed = plugin.parse(strippedEnvelope);
      const result = await plugin.process(parsed, env, ctx);
      return plugin.respond(result);
    }

    // If we get here, the user typed $something but it's not a registered command.
    // We fall through to the default handler, which will treat the entire raw text
    // (including the $unknown prefix) as a regular task/note.
    // This is a design choice: unknown $commands don't error, they just become notes.
  }

  // Step 2: No $command prefix (or unknown command) → default handler
  // This is the existing task/note shorthand parser.
  // "Review PR @today p0 #frontend" ends up here.
  const parsed = registry.__default.parse(envelope);
  const result = await registry.__default.process(parsed, env, ctx);
  return registry.__default.respond(result);
}
