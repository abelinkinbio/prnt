# PRNT Plugin System — Author Guide

## How $commands work

Every piece of input flows through three layers:

```
CAPTURE → ROUTE → EXECUTE
```

1. **Capture**: Input arrives from any channel (web, iOS, Raycast, email) and is wrapped in a standard "envelope" shape: `{ raw, source, meta }`.

2. **Route**: The router (`_router.js`) checks if the raw text starts with `$commandname`. If it matches a registered plugin, it dispatches to that plugin. If not, it falls through to the default handler (tasks/notes).

3. **Execute**: The plugin runs three functions: `parse(envelope)` → `process(parsed, env, ctx)` → `respond(result)`.

## Adding a new command (5 steps)

Let's walk through adding `$log` — a daily check-in logger.

### Step 1: Create the plugin file

Create `functions/api/commands/log.js`:

```js
// ============================================
// PRNT — $log Command Plugin
// ============================================
//
// Daily check-in: mood, energy, sleep, and a note.
// Format: $log mood:8 energy:7 sleep:6.5 — went for a run
// ============================================

export const name = 'log';
export const description = 'Daily check-in with mood, energy, and sleep';
export const syntax = '$log mood:8 energy:7 sleep:6.5 — went for a run';

function generateId() {
  return 'log_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function now() {
  return new Date().toISOString();
}

// Step 1: Parse — extract structured data from raw input
export function parse(envelope) {
  let content = envelope.raw.trim();
  
  // Extract key:value pairs
  const mood = content.match(/mood:(\d+\.?\d*)/i);
  const energy = content.match(/energy:(\d+\.?\d*)/i);
  const sleep = content.match(/sleep:(\d+\.?\d*)/i);

  // Remove the key:value pairs from content
  content = content.replace(/\b(mood|energy|sleep):\d+\.?\d*/gi, '');

  // Extract note (everything after — or --)
  let note = '';
  const dashSplit = content.split(/\s*(?:—|--)\s*/);
  if (dashSplit.length > 1) {
    note = dashSplit.slice(1).join(' — ').trim();
  } else {
    note = content.trim();
  }

  return {
    mood: mood ? parseFloat(mood[1]) : null,
    energy: energy ? parseFloat(energy[1]) : null,
    sleep: sleep ? parseFloat(sleep[1]) : null,
    note: note || null,
    source: envelope.source || 'web'
  };
}

// Step 2: Process — write to the database
export async function process(parsed, env, ctx) {
  const id = generateId();
  const timestamp = now();

  await env.DB.prepare(`
    INSERT INTO daily_logs (id, mood, energy, sleep, note, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, parsed.mood, parsed.energy, parsed.sleep, parsed.note, parsed.source, timestamp).run();

  return {
    success: true,
    item: { id, ...parsed, created_at: timestamp }
  };
}

// Step 3: Respond — format the response
export function respond(result) {
  if (!result.success) {
    return { status: 400, body: { error: result.error, command: 'log' } };
  }
  return {
    status: 201,
    body: {
      item: result.item,
      command: 'log',
      message: 'Check-in logged'
    }
  };
}
```

### Step 2: Register it

In `functions/api/_registry.js`, add two lines:

```js
import * as log from './commands/log.js';

export const registry = {
  __default: defaultHandler,
  bookmark,
  log,          // ← Add this
};
```

### Step 3: Write the D1 migration

Create `migrations/002-log-plugin.sql`:

```sql
CREATE TABLE IF NOT EXISTS daily_logs (
  id TEXT PRIMARY KEY,
  mood REAL,
  energy REAL,
  sleep REAL,
  note TEXT,
  source TEXT DEFAULT 'web',
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO commands (name, description, syntax, enabled, created_at)
VALUES ('log', 'Daily check-in with mood, energy, and sleep', '$log mood:8 energy:7 sleep:6.5 — went for a run', 1, datetime('now'));
```

### Step 4: Run the migration

```bash
npx wrangler d1 execute prnt-db --remote --file=./migrations/002-log-plugin.sql
```

### Step 5: Deploy

```bash
npx wrangler pages deploy ./
```

That's it. Now `$log mood:8 energy:7` works from every input channel.

---

## The plugin contract

Every plugin must export these:

| Export | Type | Purpose |
|--------|------|---------|
| `name` | `string` | The command name (matches `$name`) |
| `description` | `string` | Human-readable description (shown in UI) |
| `syntax` | `string` | Example usage (shown in Quick Reference) |
| `parse(envelope)` | `function` | Extract structured data from raw text |
| `process(parsed, env, ctx)` | `async function` | Do the work (DB writes, API calls) |
| `respond(result)` | `function` | Format the JSON response |

### The envelope

Every plugin receives an envelope:

```js
{
  raw: "the text after $command was stripped",
  source: "web" | "ios-shortcut" | "raycast" | "email" | "api",
  command: "bookmark",  // the command name
  meta: { ... }         // optional channel-specific context
}
```

### The response

Every plugin must return:

```js
{
  status: 201,  // HTTP status code
  body: {
    item: { ... },       // the created item
    command: "bookmark",  // the command name
    message: "Bookmark saved"  // optional toast message
  }
}
```

## Tips

- **Keep plugins simple.** A plugin should do one thing well. If it's getting complicated, it might be two plugins.

- **Use `ctx.waitUntil()` for slow work.** If your plugin needs to call an external API (like fetching a page title), do the DB write first, then use `ctx.waitUntil()` to do the slow work in the background.

- **Prefix your IDs.** Use `bk_`, `log_`, `rev_` etc. to make it easy to identify what kind of item an ID belongs to.

- **Follow the existing patterns.** Look at `default.js` and `bookmark.js` for the canonical patterns. Copy, don't invent.

- **The frontend doesn't need to know.** The beauty of the plugin system is that the UI doesn't need custom code for every command. It sends raw text, the server handles it. If you want a custom tab for your command's data, add a GET endpoint and a render function, following the bookmarks pattern.
