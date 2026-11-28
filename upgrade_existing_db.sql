ALTER TABLE users ADD COLUMN sub_user_ref TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN device_id TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN device_name TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN device_ip TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN pairing_code TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN link_token TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN link_expires_at INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN linked_at TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS linked_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_name TEXT DEFAULT '',
  device_ip TEXT DEFAULT '',
  pairing_code TEXT DEFAULT '',
  link_token TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  session_token TEXT DEFAULT '',
  linked_at TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

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

UPDATE app_settings SET setting_value = 'linked_device' WHERE setting_key = 'login_mode';
