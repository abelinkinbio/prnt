// ============================================
// PRNT — Plugin Registry
// The master list of all available $commands.
//
// WHY STATIC IMPORTS?
// Cloudflare Workers (which power Pages Functions)
// bundle all code at deploy time. There's no way
// to dynamically load modules at runtime like you
// can in Node.js. This means every plugin must be
// imported here with a regular `import` statement.
//
// This is actually a feature, not a limitation:
// it means the registry is explicit, auditable,
// and you can see every command at a glance.
//
// ────────────────────────────────────────────
// HOW TO ADD A NEW COMMAND:
//
//   1. Create functions/api/_commands/yourcommand.js
//      (export: name, description, parse, process, respond)
//
//   2. Add a static import below:
//      import * as yourcommand from './_commands/yourcommand.js';
//
//   3. Add one line to the registry object:
//      yourcommand,
//
//   4. Add a row to the commands table in D1:
//      INSERT INTO commands (name, description, syntax, enabled, created_at)
//      VALUES ('yourcommand', 'What it does', '$yourcommand example syntax', 1, datetime('now'));
//
//   5. Deploy: npx wrangler pages deploy ./
//
// That's it. Five steps, one new file.
// ────────────────────────────────────────────
// ============================================

// ─── Plugin Imports ───
// The __default handler is special: it runs when
// NO $command prefix is present. It handles the
// existing task/note shorthand (p0, @today, #tag).
import * as __default from './_commands/default.js';

// $bookmark — save URLs with notes and tags
import * as bookmark from './_commands/bookmark.js';

// ─── The Registry ───
// Keys are command names (lowercase, no $ prefix).
// Values are plugin modules that export:
//   name, description, parse(), process(), respond()
//
// __default is special — it's the fallback when no
// $command is detected. Don't remove it.
export const registry = {
  __default,
  bookmark,

  // ─── Add new commands below this line ───
  // example:
  //   import * as review from './_commands/review.js';
  //   review,
  //
  //   import * as log from './_commands/log.js';
  //   log,
};
