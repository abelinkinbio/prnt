-- ============================================
-- PRNT Database Schema
-- Base tables for the Task Architecture System
-- ============================================

-- Items: Tasks and Notes
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  raw_input TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'note',
  priority INTEGER,
  due_date TEXT,
  due_time TEXT,
  completed INTEGER DEFAULT 0,
  completed_at TEXT,
  deleted INTEGER DEFAULT 0,
  google_task_id TEXT,
  google_calendar_event_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Tags: Many-to-many relationship for items
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- Google Auth: OAuth tokens storage
CREATE TABLE IF NOT EXISTS google_auth (
  id TEXT PRIMARY KEY DEFAULT 'default',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Sync Log: Track Google sync operations
CREATE TABLE IF NOT EXISTS sync_log (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  sync_type TEXT NOT NULL,
  google_id TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);
