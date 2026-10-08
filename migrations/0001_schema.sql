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

CREATE INDEX IF NOT EXISTS idx_items_completed ON items(completed);
CREATE INDEX IF NOT EXISTS idx_items_due_date ON items(due_date);
CREATE INDEX IF NOT EXISTS idx_items_priority ON items(priority);
CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);

-- Tags: Many-to-many relationship for items
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tags_item_id ON tags(item_id);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);

-- Google Auth: OAuth tokens storage
CREATE TABLE IF NOT EXISTS google_auth (
  id TEXT PRIMARY KEY DEFAULT 'default',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Bookmarks
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

-- Quotes
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  quote_text TEXT NOT NULL,
  attribution TEXT,
  source TEXT,
  favorite INTEGER DEFAULT 0,
  ai_attributed INTEGER DEFAULT 0,
  source_input TEXT,
  raw_input TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at);
CREATE INDEX IF NOT EXISTS idx_quotes_deleted ON quotes(deleted);
CREATE INDEX IF NOT EXISTS idx_quotes_favorite ON quotes(favorite);
