# PRNT Plugin System — Author Guide

## How $commands work

Every piece of input flows through three layers:

```
CAPTURE → ROUTE → EXECUTE
```

1. **Capture**: Input arrives from any channel (web, iOS, Raycast, email).

2. **Route**: The router (`src/plugins/router.js`) checks if the text starts with `$commandname`. Match → dispatch to plugin. No match → fall through to default handler (tasks/notes).

3. **Execute**: The plugin runs three functions: `parse()` → `process()` → `respond()`.

## Adding a new command

Let's walk through adding `$log` — a daily check-in logger.

### Step 1: Create the plugin file

Create `src/plugins/commands/log.js`:

```js
// ============================================
// PRNT — $log Command Plugin
// ============================================

export const name = 'log';
export const description = 'Daily check-in with mood, energy, and sleep';
export const syntax = '$log mood:8 energy:7 sleep:6.5 — went for a run';

function generateId() {
  return 'log_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Step 1: Parse — extract structured data from raw input
export function parse(envelope) {
  let content = envelope.raw.trim();

  const mood = content.match(/mood:(\d+\.?\d*)/i);
  const energy = content.match(/energy:(\d+\.?\d*)/i);
  const sleep = content.match(/sleep:(\d+\.?\d*)/i);

  content = content.replace(/\b(mood|energy|sleep):\d+\.?\d*/gi, '');

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
  const timestamp = new Date().toISOString();

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

In `src/plugins/registry.js`, add two lines:

```js
import * as log from './commands/log.js';

export const registry = {
  __default,
  bookmark,
  quotes,
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
VALUES ('log', 'Daily check-in with mood, energy, and sleep',
        '$log mood:8 energy:7 sleep:6.5 — went for a run', 1, datetime('now'));
```

### Step 4: Run the migration

```bash
npx wrangler d1 execute prnt-db --remote --file=./migrations/002-log-plugin.sql
```

### Step 5: Deploy

```bash
npm run deploy
```

That's it. `$log mood:8 energy:7` now works from every input channel.

---

## The plugin contract

Every plugin must export:

| Export | Type | Purpose |
|--------|------|---------|
| `name` | `string` | Command name (matches `$name`) |
| `description` | `string` | Human-readable (shown in UI) |
| `syntax` | `string` | Example usage |
| `parse(envelope)` | `function` | Extract structured data from raw text |
| `process(parsed, env, ctx)` | `async function` | Do the work (DB writes, API calls) |
| `respond(result)` | `function` | Format the JSON response |

### The envelope

```js
{
  raw: "text after $command was stripped",
  source: "web" | "ios-shortcut" | "raycast" | "email" | "api",
  command: "bookmark",
  meta: { ... }  // optional channel-specific context
}
```

### The response

```js
{
  status: 201,
  body: {
    item: { ... },
    command: "bookmark",
    message: "Bookmark saved"
  }
}
```

## Tips

- **Keep plugins simple.** One command, one job.
- **Use `ctx.waitUntil()` for slow work.** DB write first, then background tasks.
- **Prefix your IDs.** `bk_`, `log_`, `rev_` — easy to identify at a glance.
- **Follow existing patterns.** Copy `default.js` or `bookmark.js`. Don't invent.
