# PRNT Plugin System — Local Testing Guide

## Setup

```bash
cd ~/prnt-project/prnt

# 1. Install dependencies
npm install

# 2. Run original schema on local DB (if not already done)
npx wrangler d1 execute prnt-db --local --file=./schema.sql

# 3. Run plugin system migration on local DB
npx wrangler d1 execute prnt-db --local --file=./migrations/001-plugin-system.sql

# 4. Start local dev server
npm run dev
```

Open: http://localhost:8788

---

## Test Checklist

Work through each test. If something fails, note the error and stop — 
fixing issues in order is easier than debugging everything at once.

### Phase 1: Existing Features (Nothing Should Be Broken)

- [ ] **Page loads** — PRNT logo, grid background, no console errors
- [ ] **Create a note** — Type `Hello world` and press Enter
      → Should appear in Notes tab
- [ ] **Create a task** — Type `Test task @today p0 #testing`
      → Should appear in Matrix view, P0 quadrant
      → Should show #testing tag, "Today" due badge
- [ ] **Create task with other priorities** — Try `p1 task`, `p2 task`, `p3 task`
      → Each should land in correct quadrant
- [ ] **Live preview works** — Type `Review PR @tmrw p1 #work`
      → Preview bar should show: TASK, P1, tomorrow's date, #work
- [ ] **Edit a task** — Click the pencil icon (✎) on any task
      → Modal should open, edit content, save
- [ ] **Complete a task** — Click the check icon (✓)
      → Task should show as completed (strikethrough)
- [ ] **Delete a task** — Click the ✕ icon
      → Task disappears, "Undo" toast appears
- [ ] **Undo delete** — Click "Undo" on the toast
      → Task comes back
- [ ] **Tag filtering** — Click on a #tag
      → Switches to List view, filtered to that tag
      → "Clear" button removes filter
- [ ] **View tabs** — Click Matrix, List, Notes, Wrapped
      → Each view renders correctly
- [ ] **Drag and drop** — In Matrix view, drag a task to a different quadrant
      → Priority updates
- [ ] **Theme toggle** — Click "◐ Toggle Theme"
      → Switches between light and dark
- [ ] **Keyboard shortcuts** — Cmd+K focuses input, Cmd+1-4 switches tabs

### Phase 2: Plugin System (New Features)

- [ ] **$command detection** — Type `$` in the input
      → Border should turn purple (command mode)
      → Suggestions dropdown should appear with available commands
- [ ] **$command autocomplete** — Type `$bo`
      → Should show `$bookmark` in suggestions
      → Tab or click to complete
- [ ] **$bookmark creation** — Type: `$bookmark https://example.com — A test bookmark #reading`
      → Press Enter
      → Should get success toast: "Bookmark saved"
- [ ] **Bookmarks tab** — Click the Bookmarks tab (or Cmd+5)
      → Should show the bookmark you just created
      → URL, note, tag should all display correctly
- [ ] **Bookmark deletion** — Click delete (✕) on a bookmark
      → Should disappear
- [ ] **Quick Reference** — Scroll down in sidebar
      → Should see "$Commands" section with $bookmark listed
- [ ] **Normal input still works** — After testing $commands, type a regular task
      → `Buy groceries @today p2 #personal`
      → Should create task normally (not treated as command)

### Phase 3: API Endpoints (Use Browser Console or curl)

Open browser DevTools console (F12) and test the API directly:

```javascript
// Test GET /api/items — should return your test items
fetch('/api/items').then(r => r.json()).then(d => console.log(d));

// Test GET /api/commands — should return default + bookmark
fetch('/api/commands').then(r => r.json()).then(d => console.log(d));

// Test GET /api/bookmarks — should return your bookmarks
fetch('/api/bookmarks').then(r => r.json()).then(d => console.log(d));

// Test POST /api/input — universal endpoint
fetch('/api/input', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ raw: 'API test task @today p1 #api', source: 'test' })
}).then(r => r.json()).then(d => console.log(d));

// Test POST /api/input with $command
fetch('/api/input', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ raw: '$bookmark https://test.com — API test', source: 'test' })
}).then(r => r.json()).then(d => console.log(d));
```

### Phase 4: Edge Cases

- [ ] **Empty input** — Press Enter with nothing typed → nothing happens
- [ ] **Just spaces** — Type `   ` and Enter → nothing happens
- [ ] **Unknown command** — Type `$nonexistent hello`
      → Should fall through to default handler (creates note/task)
- [ ] **Bookmark without URL** — Type `$bookmark no url here`
      → Should get error: "URL is required"
- [ ] **Bookmark without note** — Type `$bookmark https://example.com`
      → Should work (note is optional)
- [ ] **Special characters** — Type `Test "quotes" & <angles> @today`
      → Should handle gracefully, no XSS

---

## Troubleshooting

### "Table not found" errors
Your local DB is missing tables. Re-run the migrations:
```bash
npx wrangler d1 execute prnt-db --local --file=./schema.sql
npx wrangler d1 execute prnt-db --local --file=./migrations/001-plugin-system.sql
```

### Port already in use
Kill the old process or specify a different port:
```bash
npx wrangler pages dev ./ --d1 DB=prnt-db --port 8789
```

### Google OAuth won't work locally
This is expected. Google OAuth needs a public callback URL. 
The Google status will show as disconnected (○) locally — that's fine.
Test Google sync only in production after deploying.

### Changes not showing up
Wrangler hot-reloads, but sometimes you need to:
1. Hard refresh the browser (Cmd+Shift+R)
2. Restart the dev server (Ctrl+C, then `npm run dev`)

### Console errors about imports
Check that all file paths are correct. Common issue:
- `_router.js` imports from `./commands/default.js` — make sure the file exists
- `_registry.js` imports use relative paths from `functions/api/`

---

## When Everything Passes

Once all checklist items pass locally:

```bash
# Deploy to production
npx wrangler pages deploy ./
```

Your production D1 already has the migration applied, so no additional 
database steps needed — just deploy the code.
