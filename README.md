# Telegram Mini App v3 (Silent Backend Automation + Redirect URL + Admin & Sub-User Panel)

## Features
- **Two Automation Modes (Controlled in Admin Panel):**
  1. **Silent Zero-Click Mode:** Backend authenticates Telegram `initData` silently, creates a session token, and immediately redirects to your configured server Redirect URL without any user input.
  2. **Auto-OTP Mode:** Bot sends a 6-digit OTP automatically on start/open; user enters OTP and redirects to your server URL.
- **Post-Login Server Redirect URL:** Set any target URL from `/admin` (`Automation & Redirect` tab). Automatically appends `?tg_id=...&session_token=...&username=...`.
- **Auto-Schema Initialization:** D1 tables (`users`, `sub_users`, `synced_messages`, `app_settings`, `bot_templates`) initialize automatically on first request.
