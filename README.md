# Telegram Mini App Pro (Auto-OTP + Admin & Sub-User Panel + Message Sync)

## Key Features
1. **Zero-Phone Auto-OTP Login:** When a user opens the Mini App inside Telegram, `initData` automatically identifies their `tg_id`, generates a 6-digit OTP, sends it to their Telegram chat via the Bot, and opens the OTP verification screen directly.
2. **Super Admin & Sub-User Panel (`/admin`):**
   - Create **Sub-Users** with custom login credentials and referral codes (`sub_<code>`).
   - Assign users to specific Sub-Users so each Sub-User only manages their assigned users.
   - View active sessions (`session_token`) and revoke sessions anytime.
3. **Real-Time Message Sync:** Once a user logs in, messages sent by the user (either via the Mini App or directly to the Telegram Bot via `/api/webhook`) automatically sync into the Admin Panel, and replies from Admin/Sub-Users deliver directly to the user's Telegram chat and Mini App dashboard.
