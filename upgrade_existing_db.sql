ALTER TABLE users ADD COLUMN sub_user_ref TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS sub_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  ref_code TEXT UNIQUE NOT NULL,
  can_sync_messages INTEGER DEFAULT 1,
  can_revoke_session INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS synced_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id TEXT NOT NULL,
  sub_user_ref TEXT DEFAULT '',
  sender_type TEXT NOT NULL,
  sender_name TEXT DEFAULT '',
  source TEXT DEFAULT 'miniapp',
  message_text TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
