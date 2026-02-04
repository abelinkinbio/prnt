// ============================================
// PRNT — Central Router
// Layer 2 of the Capture → Route → Execute model
//
// This is the traffic cop. Every piece of input —
// from the web app, iOS, Raycast, email, or API —
// flows through this single function.
//
// It does exactly one thing:
//   1. Look at the raw text for a $command prefix
//   2. If found, hand it to that plugin
//   3. If not found, hand it to the default handler
//      (which does the existing task/note parsing)
//
// The router never changes when you add commands.
// Adding a new command means adding a plugin file
// and one line to _registry.js. That's it.
// ============================================

import { registry } from './_registry.js';

/**
 * Route an envelope to the correct plugin handler.
 *
 * @param {Object} envelope - The standard input format:
 *   {
 *     raw: "the full text the user typed",
 *     source: "web" | "ios-shortcut" | "raycast" | "email" | "api",
 *     meta: { ... }   // optional channel-specific context
 *   }
 * @param {Object} env - Cloudflare environment bindings (DB, secrets, etc.)
 * @param {Object} ctx - Cloudflare execution context (for waitUntil)
 *
 * @returns {Object} - The plugin's response:
 *   {
 *     command: "default" | "bookmark" | ...,
 *     message: "Task added" | "Bookmark saved" | ...,
 *     item: { ... }   // the created entity
 *   }
 */
export async function routeEnvelope(envelope, env, ctx) {
  // ─── Step 1: Check for $command prefix ───
  //
  // We match: $word (at the start, followed by space or end of string)
  // The (.*) captures everything after the command name.
  // The /s flag makes . match newlines too (for multi-line input).
  const match = envelope.raw.trim().match(/^\$(\w+)(?:\s+([\s\S]*))?$/);

  if (match) {
    const commandName = match[1].toLowerCase();
    const plugin = registry[commandName];

    if (plugin) {
      // ─── Step 2a: Known $command → dispatch to plugin ───
      //
      // We strip the "$command " prefix from the raw text
      // before handing it to the plugin's parser.
      // This way, the plugin only sees its own content.
      const strippedEnvelope = {
        ...envelope,
        raw: (match[2] || '').trim(),
        command: commandName
      };

      const parsed = plugin.parse(strippedEnvelope);
      const result = await plugin.process(parsed, env, ctx);
      return plugin.respond(result);
    }

    // ─── Step 2b: Unknown $command → fall through ───
    //
    // If someone types "$asdf hello world", we don't crash.
    // We just treat the whole thing as regular input and
    // let the default handler deal with it. The "$asdf"
    // becomes part of the item content.
  }

  // ─── Step 3: No $command → default handler ───
  //
  // This is where "Review PR @today p0 #frontend" goes.
  // The default plugin preserves all existing behavior:
  // /t, @today, @eod, @tmrw, p0-p3, #tags, markdown.
  const parsed = registry.__default.parse(envelope);
  const result = await registry.__default.process(parsed, env, ctx);
  return registry.__default.respond(result);
}
