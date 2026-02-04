// ============================================
// PRNT — Plugin Registry
// ============================================
//
// This file is the single source of truth for what
// commands PRNT understands. It maps command names
// to their handler modules.
//
// WHY STATIC IMPORTS?
// Cloudflare Workers bundle all code at deploy time.
// There's no filesystem at runtime, so we can't do
// dynamic imports like `import(`./commands/${name}.js`)`.
// That's actually a feature, not a limitation — it means
// the registry is explicit, auditable, and fast.
//
// HOW TO ADD A NEW COMMAND:
// ──────────────────────────
// 1. Create a new file: functions/api/commands/yourcommand.js
//    (export: name, description, syntax, parse, process, respond)
//
// 2. Add it here:
//    import * as yourcommand from './commands/yourcommand.js';
//
// 3. Add it to the registry object:
//    yourcommand,
//
// 4. Add a row to the `commands` D1 table (for UI autocomplete):
//    INSERT INTO commands (name, description, syntax, enabled, created_at)
//    VALUES ('yourcommand', 'What it does', '$yourcommand example usage', 1, datetime('now'));
//
// 5. Run any D1 migrations for new tables your plugin needs.
//
// 6. Deploy: npx wrangler pages deploy ./
//
// That's it. Five steps. No other files to touch.
// ============================================

// The default handler processes tasks and notes (existing behavior).
// It's special — it handles input that has NO $command prefix.
import * as defaultHandler from './commands/default.js';

// $bookmark — save URLs with notes and tags
import * as bookmark from './commands/bookmark.js';

// ────────────────────────────────────────────
// Add new command imports here:
// import * as review from './commands/review.js';
// import * as log from './commands/log.js';
// import * as idea from './commands/idea.js';
// ────────────────────────────────────────────

export const registry = {
  // __default is the fallback handler. It runs when there's no $command prefix.
  // It wraps the existing shorthand parser (/t, @today, p0, #tags, etc.)
  __default: defaultHandler,

  // Named commands — each key matches the $command name.
  // $bookmark → registry['bookmark'] → bookmark plugin
  bookmark,

  // ────────────────────────────────────────────
  // Add new commands here:
  // review,
  // log,
  // idea,
  // ────────────────────────────────────────────
};
