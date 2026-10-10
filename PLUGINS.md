# PRNT Plugin System — Author Guide

## How $commands work

```
CAPTURE → ROUTE → EXECUTE
```

1. **Capture**: `POST /api/input` and `POST /api/ingest` pass the raw string to the router.
2. **Route**: `src/plugins/router.js` looks up a leading `$commandname` in the registry. A known command is dispatched to that plugin. Anything else, including an unknown `$command`, falls through to `__default` (tasks and notes).
3. **Execute**: `parse(raw)` → `process(parsed, env)` → `respond(result)`. `POST /api/input` returns that object with HTTP 201.

## Adding a new command

`$log` is a daily check-in. Copy the shape of `src/plugins/commands/bookmark.js`.

### Step 1: Create the plugin file

Create `src/plugins/commands/log.js`:

```js
import { generateId, now } from '../../utils.js';

export const name = 'log';
export const description = 'Daily check-in with mood, energy, and sleep';
export const syntax = '$log mood:8 energy:7 sleep:6.5 — went for a run';

// `raw` is the full input, including "$log". Strip the prefix here.
export function parse(raw) {
  let text = raw.replace(/^\$log\s+/i, '').trim();

  const mood = text.match(/mood:(\d+\.?\d*)/i);
  const energy = text.match(/energy:(\d+\.?\d*)/i);
  const sleep = text.match(/sleep:(\d+\.?\d*)/i);

  text = text.replace(/\b(mood|energy|sleep):\d+\.?\d*/gi, '');

  let note = null;
  const dashSplit = text.split(/\s[—\-]\s/);
  if (dashSplit.length > 1) {
    note = dashSplit.slice(1).join(' — ').trim() || null;
  }

  return {
    mood: mood ? parseFloat(mood[1]) : null,
    energy: energy ? parseFloat(energy[1]) : null,
    sleep: sleep ? parseFloat(sleep[1]) : null,
    note,
    raw_input: raw
  };
}

export async function process(parsed, env) {
  const id = generateId('log');
  const timestamp = now();

  await env.DB.prepare(`
    INSERT INTO daily_logs (id, mood, energy, sleep, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    parsed.mood,
    parsed.energy,
    parsed.sleep,
    parsed.note,
    timestamp
  ).run();

  return {
    id,
    mood: parsed.mood,
    energy: parsed.energy,
    sleep: parsed.sleep,
    note: parsed.note,
    created_at: timestamp
  };
}

export function respond(result) {
  return {
    command: 'log',
    message: 'Check-in logged',
    item: result
  };
}
```

### Step 2: Register it

Registration is two edits in `src/plugins/registry.js`: an import at the top of the file, and a key on the registry object.

```js
import * as __default from './commands/default.js';
import * as bookmark from './commands/bookmark.js';
import * as quotes from './commands/quotes.js';
import * as log from './commands/log.js';

export const registry = {
  __default,
  bookmark,
  quotes,
  log,
};
```

The registry key is the command name (`$log` → `log`). `GET /api/commands` lists commands from this object and skips `__default`.

### Step 3: Write the D1 migration

Add a top-level file next to `migrations/0001_schema.sql`, numbered the same way:

`migrations/0002_daily_logs.sql`

```sql
CREATE TABLE IF NOT EXISTS daily_logs (
  id TEXT PRIMARY KEY,
  mood REAL,
  energy REAL,
  sleep REAL,
  note TEXT,
  created_at TEXT NOT NULL
);
```

### Step 4: Apply the migration

```bash
npm run db:migrate
```

That script runs `wrangler d1 migrations apply prnt-db`.

### Step 5: Deploy

```bash
npm run deploy
```

`$log mood:8 energy:7` then goes through the same router.

## The plugin contract

| Export | Purpose |
|--------|---------|
| `name` | Command name, lowercase, no `$` |
| `description` | Autocomplete text. `GET /api/commands` returns it |
| `syntax` | Example usage. The same endpoint returns it, and the input preview shows it |
| `parse(raw)` | Strip `$command` and return structured data. `raw` is the full string |
| `process(parsed, env)` | Persist or call out. Arguments are the parsed object and `env` |
| `respond(result)` | Return `{ command, message, item }`. `POST /api/input` sends that body with HTTP 201 |

Copy `bookmark.js`. Prefix ids with `generateId()` from `src/utils.js`.
