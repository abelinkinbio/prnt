# PRNT — Task Architecture System

A Blueprint-styled productivity application combining notes, tasks, bookmarks, and an Eisenhower matrix visualization with Google Calendar & Tasks integration. Extensible via a **plugin system** that lets you add new `$commands` without touching core code.

## 🏗 Architecture: Capture → Route → Execute

Every piece of input flows through three layers:

```
┌─────────────────────────────────────────────────┐
│  CAPTURE                                         │
│  Web App / iOS / Raycast / Email → Envelope      │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  ROUTE                                           │
│  Check for $command → dispatch to plugin          │
│  No $command → fall through to default (task/note)│
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  EXECUTE                                         │
│  Plugin: parse → process → respond               │
└─────────────────────────────────────────────────┘
```

## 🔧 Setup & Deployment

### Prerequisites
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed
- Cloudflare account with Pages enabled
- Google Cloud Console account (for Calendar/Tasks sync)

### Database (Already Created)
The D1 database `prnt-db` has been created with ID: `f4974a76-0ae1-4447-8d0a-e268f1dbd4f8`

### Deploy to Cloudflare Pages

1. **Clone/download this project** and navigate to the folder

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run D1 migrations:**
   ```bash
   npx wrangler d1 execute prnt-db --remote --file=./migrations/001-plugin-system.sql
   ```

4. **Deploy:**
   ```bash
   npx wrangler pages deploy ./
   ```

5. **Add bindings in Dashboard:**
   
   Go to Cloudflare Dashboard → Pages → prnt → Settings → Functions
   
   **D1 database binding:**
   - Variable name: `DB`
   - D1 database: `prnt-db`
   
   **Environment variables (for Google OAuth):**
   - `GOOGLE_CLIENT_ID`: Your Google OAuth client ID
   - `GOOGLE_CLIENT_SECRET`: Your Google OAuth client secret
   - `PRNT_API_KEY`: Your API key for external input channels

### Deployment Checklist (Plugin System Update)

If updating from a pre-plugin version:

```bash
# 1. Run the plugin system migration
npx wrangler d1 execute prnt-db --remote --file=./migrations/001-plugin-system.sql

# 2. Deploy all files
npx wrangler pages deploy ./

# 3. Verify it works
# - Open prnt.abelinkinbio.com
# - Type "hello" and press Enter → should create a note (default handler)
# - Type "$bookmark https://example.com — test" → should create a bookmark
# - Click the Bookmarks tab → should see the bookmark
# - Type "Review PR @today p0 #test" → should create a P0 task due today
# - Check Matrix view → task should be in P0 quadrant
```

No new environment variables or bindings are needed. The plugin system uses the existing D1 database.

### Google OAuth Setup

1. **Create a Google Cloud Project:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project (or use existing)
   - Enable these APIs:
     - Google Calendar API
     - Google Tasks API

2. **Create OAuth Credentials:**
   - Go to APIs & Services → Credentials
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: Web application
   - Name: PRNT
   - Authorized redirect URIs: `https://prnt.abelinkinbio.com/api/auth/google/callback`

3. **Configure OAuth Consent Screen:**
   - User type: External (or Internal if using Workspace)
   - Add scopes: `calendar`, `tasks`
   - Add your email as a test user

4. **Copy credentials to Cloudflare:**
   - Copy Client ID → `GOOGLE_CLIENT_ID` env var
   - Copy Client Secret → `GOOGLE_CLIENT_SECRET` env var

### Local Development
```bash
npm run dev
```

## 📖 Shorthand Reference

### Task Conversion
| Command | Effect |
|---------|--------|
| `/t` | Convert to task |

### Priority Levels
| Command | Matrix Position |
|---------|-----------------|
| `p0` | Urgent + Important (top-left) |
| `p1` | Important, Not Urgent (top-right) |
| `p2` | Urgent, Not Important (bottom-left) |
| `p3` | Neither (bottom-right) |

### Due Dates
| Command | Effect |
|---------|--------|
| `@today` | Due today |
| `@eod` | End of day (6pm Lisbon) |
| `@tomorrow` / `@tmrw` | Due tomorrow |
| `@friday` / `@eow` | End of week |
| `@jan-25` | Specific date (Jan 25) |

### Tags
| Command | Effect |
|---------|--------|
| `#frontend` | Add tag |
| `#aj #chris` | Multiple tags |

### $commands
| Command | Effect |
|---------|--------|
| `$bookmark URL — note` | Save a bookmark |

See [PLUGINS.md](PLUGINS.md) for how to add new commands.

### Markdown
| Syntax | Effect |
|--------|--------|
| `**text**` | **Bold** |
| `*text*` | *Italic* |
| `` `code` `` | `Inline code` |
| `[text](url)` | Link |

## 🎨 Examples

```
Review PR from AJ #frontend #aj @today p0
```
→ Creates a P0 task tagged with #frontend and #aj, due today

```
$bookmark https://example.com/article — great read about system design #design
```
→ Saves a bookmark with a note and #design tag

```
Ideas for Q2 roadmap #planning
```
→ Creates a note tagged #planning

## 📂 Project Structure

```
prnt/
├── index.html                    # Main application (frontend)
├── functions/
│   └── api/
│       ├── _router.js            # Central dispatch (Capture → Route → Execute)
│       ├── _registry.js          # Plugin registry (static imports)
│       ├── _google.js            # Google API utilities
│       ├── input.js              # POST /api/input (universal endpoint)
│       ├── items.js              # GET/POST /api/items
│       ├── items/
│       │   └── [id].js           # GET/PATCH/DELETE single item
│       ├── ingest.js             # POST /api/ingest (external channels)
│       ├── commands.js           # GET /api/commands
│       ├── bookmarks.js          # GET/DELETE /api/bookmarks
│       ├── summary.js            # POST /api/summary (AI weekly summary)
│       ├── commands/
│       │   ├── default.js        # Default handler (tasks/notes)
│       │   └── bookmark.js       # $bookmark plugin
│       └── auth/
│           └── google/
│               ├── index.js      # OAuth initiation
│               ├── callback.js   # OAuth callback
│               └── status.js     # Connection status
├── migrations/
│   └── 001-plugin-system.sql     # Plugin tables + bookmarks
├── PLUGINS.md                    # Plugin author guide
├── wrangler.toml                 # Cloudflare configuration
└── package.json                  # Project metadata
```

## 🔌 Plugin System

Adding a new `$command` takes 5 steps:

1. Create `functions/api/commands/yourcommand.js` (parse, process, respond)
2. Add one import + one line to `_registry.js`
3. Write a D1 migration for any new tables
4. Run the migration
5. Deploy

See [PLUGINS.md](PLUGINS.md) for the full guide with a worked example.

## 🔔 Google Integration

### Calendar Reminders
Tasks with due dates automatically create calendar events with reminders.

### Google Tasks
All tasks sync to a "PRNT" task list in Google Tasks.

## 📧 Email Input

Send emails to `abe@abelinkinbio.com` to create items. Full shorthand and `$command` support.

## 🔍 Raycast Extension

Add items to PRNT directly from Raycast. Set up the API key and URL in Raycast preferences.

## 📱 iOS Shortcuts

Send POST requests to `https://prnt.abelinkinbio.com/api/ingest` with your API key. Full shorthand and `$command` support.

## 🔑 API Key Security

External inputs require an API key. Generate one with `openssl rand -hex 32` and add it as the `PRNT_API_KEY` environment variable.
