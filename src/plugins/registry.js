// ============================================
// PRNT - Plugin Registry
// ============================================
// This is the single source of truth for which
// $commands exist. Each key is a command name
// (lowercase, no $ prefix). Each value is a
// plugin module that exports:
//   name, description, parse(), process(), respond()
//   and, for every real $command, syntax
//
// __default is special — it's the fallback when
// NO $command prefix is detected. It handles the
// existing task/note shorthand (p0, @today, #tag).
//
// WHY STATIC IMPORTS?
// Cloudflare Workers bundle code at deploy time.
// There's no filesystem to dynamically load from
// at runtime. This file IS the configuration.
// This is actually a feature: it's explicit,
// auditable, and fast. No runtime overhead.
//
// TO ADD A NEW COMMAND:
// 1. Create src/plugins/commands/yourcommand.js
// 2. Import it here
// 3. Add it to the registry object
// 4. Redeploy
// ============================================

import * as __default from './commands/default.js';
import * as bookmark from './commands/bookmark.js';
import * as quotes from './commands/quotes.js';

export const registry = {
  __default,
  bookmark,
  quotes,

  // ─── Add new commands below this line ───
  // import * as review from './commands/review.js';
  // review,
};
