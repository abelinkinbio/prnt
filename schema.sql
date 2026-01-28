-- PRNT Database Schema
-- Run this to initialize a fresh D1 database:
-- npx wrangler d1 execute YOUR_DB_NAME --file=./schema.sql

-- Items table: stores tasks and notes
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  raw_input TEXT,
  type TEXT DEFAULT 'note' CHECK (type IN ('task', 'note')),
  priority INTEGER CHECK (priority IS NULL OR priority BETWEEN 0 AND 3),
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

-- Tags table: stores tags for items (many-to-many relationship)
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- Google auth table: stores OAuth tokens (single row with id='default')
CREATE TABLE IF NOT EXISTS google_auth (
  id TEXT PRIMARY KEY DEFAULT 'default',
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
CREATE INDEX IF NOT EXISTS idx_items_priority ON items(priority);
CREATE INDEX IF NOT EXISTS idx_items_due_date ON items(due_date);
CREATE INDEX IF NOT EXISTS idx_items_completed ON items(completed);
CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deleted);
CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at);
CREATE INDEX IF NOT EXISTS idx_tags_item_id ON tags(item_id);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
