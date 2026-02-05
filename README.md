# PRNT — Personal Runtime

The thinnest possible layer between your thoughts and the systems you need them in.

PRNT is a personal productivity tool that acts as middleware between your brain and everything else. Tasks, notes, bookmarks, quotes — all driven by shorthand commands, all entering through the same pipeline. Type it in the web app, fire it from Raycast, send it from an iOS Shortcut, or email it in. PRNT parses the shorthand and routes it to the right place.

It's part container, part router. Plain text becomes tasks and notes. `$commands` trigger plugins that store, transform, or push content to external systems. The plugin architecture means adding a new command is a single file and one line in the registry. ⚡

```
┌─────────────────────────────────────────┐
│  CAPTURE                                │
│  Web App · Raycast · iOS · Email        │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│  ROUTE                                  │
│  $command → plugin · plain text → default│
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│  EXECUTE                                │
│  parse → process → respond              │
└─────────────────────────────────────────┘
```

Every input channel, every command type — same pipeline.

Powered by Cloudflare Workers, D1, Email Workers, and Workers Assets.

## 📖 Shorthand

```
Review PR from UX @today p0 #frontend      → P0 task, due today, tagged
Ideas for Q2 roadmap #planning              → note (no date = note)
$bookmark https://example.com — great read  → saved bookmark
$quotes The obstacle is the way - Marcus    → saved quote
```

| Shorthand | What it does |
|-----------|-------------|
| `p0` `p1` `p2` `p3` | Priority (Eisenhower quadrants) |
| `@today` `@tmrw` `@eow` | Due dates |
| `@eod` | End of day (6pm) |
| `@jan-25` | Specific date |
| `#tag` | Tags |
| `/t` | Force to task |
| `$bookmark` | Save a URL |
| `$quotes` | Save a quote |

## 🗂 Project Structure

```
prnt/
├── public/
│   ├── index.html              # Main app
│   └── quotes/index.html       # Quotes page
├── src/
│   ├── index.js                # Worker entry — all routes
│   ├── google.js               # Google API utilities
│   ├── utils.js                # Shared helpers
│   ├── handlers/
│   │   ├── items.js            # GET/POST /api/items
│   │   ├── item.js             # GET/PATCH/DELETE /api/items/:id
│   │   ├── input.js            # POST /api/input (universal entry)
│   │   ├── ingest.js           # POST /api/ingest (external channels)
│   │   ├── commands.js         # GET /api/commands
│   │   ├── bookmarks.js        # GET/DELETE /api/bookmarks
│   │   ├── quotes.js           # CRUD /api/quotes
│   │   ├── summary.js          # POST /api/summary
│   │   └── auth.js             # Google OAuth
│   └── plugins/
│       ├── router.js           # $command detection + dispatch
│       ├── registry.js         # Plugin registry (static imports)
│       └── commands/
│           ├── default.js      # Tasks and notes
│           ├── bookmark.js     # $bookmark
│           └── quotes.js       # $quotes
├── migrations/
│   └── 001-plugin-system.sql
├── wrangler.jsonc
└── package.json
```

## ⚙️ Setup

```bash
npm install
```

### Environment Variables

Set in Cloudflare Dashboard → Workers → prnt → Settings → Variables:

| Variable | Required | Purpose |
|----------|----------|---------|
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth |
| `PRNT_API_KEY` | Optional | External input auth (Raycast, iOS, email) |
| `ANTHROPIC_API_KEY` | Optional | Weekly summaries |

The D1 binding (`DB`) is configured in `wrangler.jsonc`.

### Deploy

```bash
npm run deploy
```

### Local Dev

```bash
npm run dev
```

## 🔌 Plugin System

Adding a new `$command`:

1. Create `src/plugins/commands/yourcommand.js` — export `name`, `parse()`, `process()`, `respond()`
2. Import and register in `src/plugins/registry.js`
3. Write a D1 migration for any new tables
4. Run migration, deploy

See [PLUGINS.md](PLUGINS.md) for the full guide.

## License

MIT
