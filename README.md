# Telegram Mini App v3 (Linked Device Login + Redirect URL + Admin & Sub-User Panel)

## Features
- **Linked Device Login Process (Default):**
  - Generates a unique scannable QR Code, an 8-character Device Pairing Code (`XXXX-XXXX`), and sends a 1-tap **Approve & Link Device** request to the user's Telegram Bot chat.
  - Auto-detects approval in real time and redirects immediately to your configured server Redirect URL (or Mini App Dashboard).
- **Additional Automation Modes (Controlled in Admin Panel):**
  1. **Linked Device Mode (Default):** QR / Pairing Code & 1-Tap Bot Device Approval -> Redirect.
  2. **Auto-OTP Mode:** Bot sends a 6-digit OTP automatically on start/open.
  3. **Silent Zero-Click Mode:** Backend authenticates Telegram `initData` silently and redirects immediately.
- **Post-Login Server Redirect URL:** Set any target URL from `/admin` (`Automation & Redirect` tab). Automatically normalizes `https://` and appends `?tg_id=...&session_token=...&username=...`.
- **Auto-Schema Initialization:** D1 tables (`users`, `linked_devices`, `sub_users`, `synced_messages`, `app_settings`, `bot_templates`) initialize automatically on first request.
