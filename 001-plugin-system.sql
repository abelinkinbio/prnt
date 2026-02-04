-- ============================================
-- PRNT — Plugin System Migration
-- ============================================
--
-- This migration adds:
-- 1. `commands` table — metadata about available $commands
--    (used by the frontend for autocomplete and help text)
-- 2. `bookmarks` table — stores saved bookmarks ($bookmark)
-- 3. `bookmark_tags` table — tags for bookmarks
--
-- RUN THIS WITH:
--   npx wrangler d1 execute prnt-db --file=./migrations/001-plugin-system.sql
--
-- Or for remote (production):
--   npx wrangler d1 execute prnt-db --remote --file=./migrations/001-plugin-system.sql
-- ============================================

-- ────────────────────────────────────────────
-- Table 1: commands
-- ────────────────────────────────────────────
-- This table stores metadata about each registered $command.
-- The router doesn't read from this table — it uses the
-- static JS registry. This table exists so the FRONTEND
-- can fetch the list of available commands for autocomplete,
-- help text, and the Quick Reference sidebar.
--
-- Think of it as the "documentation" for each command,
-- stored where the UI can easily access it.

CREATE TABLE IF NOT EXISTS commands (
  name TEXT PRIMARY KEY,           -- 'bookmark', 'review', etc.
  description TEXT NOT NULL,       -- Human-readable: "Save a URL with notes"
  syntax TEXT NOT NULL,            -- Example: "$bookmark https://... — note"
  enabled INTEGER DEFAULT 1,      -- 1 = active, 0 = disabled
  created_at TEXT NOT NULL
);

-- Seed the commands table with the initial commands.
-- The 'default' command represents the existing task/note behavior.
-- It's here for documentation, but won't show in $command autocomplete
-- (the UI filters it out since you don't type $default).

INSERT OR IGNORE INTO commands (name, description, syntax, enabled, created_at) VALUES
  ('default', 'Tasks and notes with shorthand commands', 'Review PR @today p0 #frontend', 1, datetime('now')),
  ('bookmark', 'Save a URL with optional notes and tags', '$bookmark https://example.com — great article', 1, datetime('now'));

-- ────────────────────────────────────────────
-- Table 2: bookmarks
-- ────────────────────────────────────────────
-- Stores URLs saved via the $bookmark command.
-- The `title` field is nullable — it can be populated later
-- (e.g., by fetching the page's <title> tag, or via AI).

CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,                      -- Can be auto-populated later
  note TEXT,                       -- User's annotation
  source TEXT DEFAULT 'web',       -- Which channel created this
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ────────────────────────────────────────────
-- Table 3: bookmark_tags
-- ────────────────────────────────────────────
-- Tags for bookmarks, same pattern as the existing `tags` table.

CREATE TABLE IF NOT EXISTS bookmark_tags (
  id TEXT PRIMARY KEY,
  bookmark_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
);
