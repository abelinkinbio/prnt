-- ============================================
-- PRNT Migration 001: Plugin System
-- 
-- This migration adds the foundation for the
-- $command plugin system. It creates:
--
-- 1. commands table — stores metadata about each
--    available $command (name, description, syntax).
--    This powers the frontend autocomplete and
--    the GET /api/commands endpoint.
--
-- 2. bookmarks table — the first real plugin's
--    data store. Proves the architecture works.
--
-- 3. bookmark_tags table — tags for bookmarks,
--    mirroring how the existing tags table works
--    for items.
--
-- Run with:
--   npx wrangler d1 execute prnt-db --file=./migrations/001-plugin-system.sql
-- ============================================

-- ─────────────────────────────────────────────
-- COMMANDS TABLE
-- The "menu" of available $commands. The frontend
-- reads this to build autocomplete suggestions and
-- the Quick Reference panel. Plugins don't NEED a
-- row here to work (the registry is the source of
-- truth for routing), but the row is what makes
-- the command discoverable in the UI.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS commands (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  syntax TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

-- Seed the default command (task/note shorthand)
-- This isn't a $command users type — it's the
-- fallback handler when no $prefix is present.
-- We store it so the UI can show its syntax too.
INSERT OR IGNORE INTO commands (name, description, syntax, enabled, created_at)
VALUES (
  'default',
  'Create a task or note using shorthand',
  'Review PR @today p0 #frontend',
  1,
  datetime('now')
);

-- Seed the bookmark command
INSERT OR IGNORE INTO commands (name, description, syntax, enabled, created_at)
VALUES (
  'bookmark',
  'Save a URL with optional notes and tags',
  '$bookmark https://example.com — description #tag',
  1,
  datetime('now')
);

-- ─────────────────────────────────────────────
-- BOOKMARKS TABLE
-- Each $bookmark command creates a row here.
-- Separate from the items table because bookmarks
-- have different fields (url, title, note) than
-- tasks/notes (priority, due_date, completed).
-- 
-- This is the pattern for all future plugins:
-- each command owns its own table(s).
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  note TEXT,
  source TEXT DEFAULT 'web',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmark_tags (
  id TEXT PRIMARY KEY,
  bookmark_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
);

-- Indexes for bookmarks
CREATE INDEX IF NOT EXISTS idx_bookmarks_created_at ON bookmarks(created_at);
CREATE INDEX IF NOT EXISTS idx_bookmark_tags_bookmark_id ON bookmark_tags(bookmark_id);
CREATE INDEX IF NOT EXISTS idx_bookmark_tags_tag ON bookmark_tags(tag);
