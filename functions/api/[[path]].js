/**
 * Cloudflare Pages Functions API (v3 - Linked Device Login Process):
 * - Auto-ensures D1 schema & Linked Device columns on boot
 * - Linked Device Login Process: QR Code, 8-char Pairing Code (XXXX-XXXX), & 1-Tap Bot Approval
 * - Supports Silent Zero-Click Auto-Login & Auto-OTP fallback modes in Admin Panel
 * - Admin-configurable Post-Login Server Redirect URL with signed user/session params
 * - Real-Time User <-> Admin / Sub-User Message Sync & Telegram Bot Webhook
 */

let schemaReady = false;
let cachedBotUsername = "";

async function ensureSchema(db) {
  if (!db || schemaReady) return;
  try {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS users (
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
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS linked_devices (
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
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS sub_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        ref_code TEXT UNIQUE NOT NULL,
        can_sync_messages INTEGER DEFAULT 1,
        can_revoke_session INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS synced_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tg_id TEXT NOT NULL,
        sub_user_ref TEXT DEFAULT '',
        sender_type TEXT NOT NULL,
        sender_name TEXT DEFAULT '',
        source TEXT DEFAULT 'miniapp',
        message_text TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS app_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS bot_templates (
        bot_id TEXT PRIMARY KEY,
        color TEXT DEFAULT 'default',
        background_url TEXT DEFAULT '',
        background_blur INTEGER DEFAULT 0,
        config_json TEXT NOT NULL
      )`),
    ]);

    const alterCols = [
      `ALTER TABLE users ADD COLUMN sub_user_ref TEXT DEFAULT ''`,
      `ALTER TABLE users ADD COLUMN device_id TEXT DEFAULT ''`,
      `ALTER TABLE users ADD COLUMN device_name TEXT DEFAULT ''`,
      `ALTER TABLE users ADD COLUMN device_ip TEXT DEFAULT ''`,
      `ALTER TABLE users ADD COLUMN pairing_code TEXT DEFAULT ''`,
      `ALTER TABLE users ADD COLUMN link_token TEXT DEFAULT ''`,
      `ALTER TABLE users ADD COLUMN link_expires_at INTEGER DEFAULT 0`,
      `ALTER TABLE users ADD COLUMN linked_at TEXT DEFAULT ''`,
    ];
    for (const sql of alterCols) {
      await db.prepare(sql).run().catch(() => {});
    }

    await db.prepare(
      `INSERT OR IGNORE INTO app_settings (setting_key, setting_value) VALUES ('login_mode', 'linked_device')`
    ).run().catch(() => {});

    // Upgrade legacy default 'auto_otp' to 'linked_device' automatically
    await db.prepare(
      `UPDATE app_settings SET setting_value = 'linked_device' WHERE setting_key = 'login_mode' AND setting_value = 'auto_otp'`
    ).run().catch(() => {});

    // Upgrade legacy default OTP template copy if untouched
    const existingTpl = await db.prepare(`SELECT config_json FROM bot_templates WHERE bot_id = 'default'`).first().catch(() => null);
    if (existingTpl?.config_json && existingTpl.config_json.includes("Auto OTP Verification")) {
      const linkedTpl = JSON.stringify({
        code: {
          title: "Link This Device",
          description: "Approve the device link request sent to your Telegram bot or scan the QR code below to sign in.",
          buttonText: "Approve in Telegram Bot",
        },
      });
      await db.prepare(`UPDATE bot_templates SET config_json = ? WHERE bot_id = 'default'`).bind(linkedTpl).run().catch(() => {});
    }

    schemaReady = true;
  } catch (e) {
    console.error("Schema init error:", e);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Init-Data, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

async function hmacSha256(keyBytes, message) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(new Uint8Array(digest));
}

async function verifyTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken.trim());
  const computedHash = toHex(await hmacSha256(secretKey, dataCheckString));
  if (computedHash !== hash) return null;

  const userRaw = params.get("user");
  return userRaw ? JSON.parse(userRaw) : null;
}

function generateOtp() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(100000 + (arr[0] % 900000));
}

function generatePairingCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (let i = 0; i < 8; i++) {
    raw += chars[bytes[i] % chars.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

function generateToken(byteLen = 24) {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function detectDeviceInfo(request) {
  const ua = request.headers.get("User-Agent") || "";
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "Unknown IP";
  const country = request.cf?.country || "";

  let os = "Unknown OS";
  if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone/i.test(ua)) os = "iPhone";
  else if (/iPad/i.test(ua)) os = "iPad";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let client = "Web Browser";
  if (/Telegram/i.test(ua)) client = "Telegram App";
  else if (/Edg\//i.test(ua)) client = "Edge";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) client = "Chrome";
  else if (/Firefox\//i.test(ua)) client = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) client = "Safari";

  const label = country ? `${os} • ${client} (${country})` : `${os} • ${client}`;
  return { deviceName: label, deviceIp: ip };
}

async function getBotUsername(botToken) {
  if (cachedBotUsername) return cachedBotUsername;
  if (!botToken) return "";
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/getMe`).then((r) => r.json());
    if (res?.ok && res?.result?.username) {
      cachedBotUsername = res.result.username;
      return cachedBotUsername;
    }
  } catch {}
  return "";
}

async function sendTelegramBotMessage(botToken, chatId, text, replyMarkup = null) {
  if (!botToken || !chatId) return;
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;

  await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

async function answerCallbackQuery(botToken, callbackQueryId, text = "") {
  if (!botToken || !callbackQueryId) return;
  await fetch(`https://api.telegram.org/bot${botToken.trim()}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    }),
  }).catch(() => {});
}

async function editTelegramMessageText(botToken, chatId, messageId, text) {
  if (!botToken || !chatId || !messageId) return;
  await fetch(`https://api.telegram.org/bot${botToken.trim()}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
    }),
  }).catch(() => {});
}

async function getSettingsMap(db) {
  const map = {
    login_mode: "linked_device",
    redirect_url: "",
    pass_user_params: "1",
  };
  if (!db) return map;
  const res = await db.prepare(`SELECT setting_key, setting_value FROM app_settings`).all().catch(() => ({ results: [] }));
  for (const row of res.results || []) {
    map[row.setting_key] = row.setting_value;
  }
  return map;
}

function normalizeUrl(rawUrl) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function buildFinalRedirectUrl(settings, userRow, sessionToken) {
  const raw = normalizeUrl(settings.redirect_url);
  if (!raw) return "";
  if (settings.pass_user_params === "0") return raw;

  try {
    const u = new URL(raw);
    u.searchParams.set("tg_id", String(userRow.tg_id));
    u.searchParams.set("session_token", String(sessionToken || userRow.session_token || ""));
    if (userRow.username) u.searchParams.set("username", String(userRow.username));
    if (userRow.first_name) u.searchParams.set("first_name", String(userRow.first_name));
    if (userRow.sub_user_ref) u.searchParams.set("sub_ref", String(userRow.sub_user_ref));
    if (userRow.device_name) u.searchParams.set("device", String(userRow.device_name));
    return u.toString();
  } catch {
    return raw;
  }
}

async function approveDeviceLink(db, tgId, linkToken, deviceNameOverride = "") {
  const nowIso = new Date().toISOString();
  const sessionToken = generateToken(24);

  let devRow = null;
  if (linkToken) {
    devRow = await db.prepare(`SELECT * FROM linked_devices WHERE link_token = ?`).bind(linkToken).first().catch(() => null);
  }
  if (!devRow && tgId) {
    devRow = await db.prepare(
      `SELECT * FROM linked_devices WHERE tg_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`
    ).bind(tgId).first().catch(() => null);
  }

  const resolvedTgId = String(tgId || devRow?.tg_id || "");
  if (!resolvedTgId) return null;

  const finalDeviceName = deviceNameOverride || devRow?.device_name || "Linked Device";

  if (devRow) {
    await db.prepare(
      `UPDATE linked_devices
       SET status = 'linked', session_token = ?, linked_at = ?
       WHERE id = ?`
    ).bind(sessionToken, nowIso, devRow.id).run();
  }

  await db.prepare(
    `UPDATE users
     SET state = 'end',
         session_token = ?,
         device_name = ?,
         linked_at = ?,
         pairing_code = '',
         link_token = '',
         otp_code = '',
         updated_at = CURRENT_TIMESTAMP
     WHERE tg_id = ?`
  ).bind(sessionToken, finalDeviceName, nowIso, resolvedTgId).run();

  const updatedUser = await db.prepare(`SELECT * FROM users WHERE tg_id = ?`).bind(resolvedTgId).first();
  return { user: updatedUser, sessionToken, deviceName: finalDeviceName, linkedAt: nowIso };
}

async function signPanelToken(payloadObj, secret) {
  const payloadB64 = btoa(JSON.stringify(payloadObj));
  const sig = toHex(await hmacSha256(new TextEncoder().encode((secret || "fallback").trim()), payloadB64));
  return `${payloadB64}.${sig}`;
}

async function verifyPanelToken(authHeader, secret) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;

  const expected = toHex(await hmacSha256(new TextEncoder().encode((secret || "fallback").trim()), payloadB64));
  if (expected !== sig) return null;

  try {
    const data = JSON.parse(atob(payloadB64));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  await ensureSchema(env.DB);

  if (path === "/api/health") {
    return jsonResponse({ ok: true, service: "tg-vue3-pinia-admin-v3-linked-device" });
  }

  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};

  // =========================================================================
  // 1. TELEGRAM BOT WEBHOOK (Linked Device Approval + QR Deep Link + Sync)
  // =========================================================================
  if (path === "/api/webhook") {
    // A) Handle Inline Button Clicks ("Approve & Link Device" / "Deny")
    if (body.callback_query && env.DB) {
      const cq = body.callback_query;
      const data = String(cq.data || "");
      const fromId = String(cq.from?.id || "");
      const chatId = cq.message?.chat?.id || fromId;
      const messageId = cq.message?.message_id;

      if (data.startsWith("approve_link:")) {
        const token = data.slice("approve_link:".length).trim();
        const dev = await env.DB.prepare(
          `SELECT * FROM linked_devices WHERE link_token = ? AND tg_id = ?`
        ).bind(token, fromId).first();

        if (!dev || dev.status === "revoked") {
          await answerCallbackQuery(env.BOT_TOKEN, cq.id, "Link request expired or invalid.");
          return jsonResponse({ ok: true });
        }

        const approved = await approveDeviceLink(env.DB, fromId, token);
        await answerCallbackQuery(env.BOT_TOKEN, cq.id, "✅ Device Linked!");
        if (chatId && messageId) {
          await editTelegramMessageText(
            env.BOT_TOKEN,
            chatId,
            messageId,
            `✅ <b>Device Linked Successfully!</b>\n\n📱 <b>Device:</b> ${approved?.deviceName || dev.device_name}\n🌐 <b>IP:</b> <code>${dev.device_ip}</code>\n\nYour Mini App session is now active.`
          );
        }
        return jsonResponse({ ok: true });
      }

      if (data.startsWith("deny_link:")) {
        const token = data.slice("deny_link:".length).trim();
        await env.DB.prepare(
          `UPDATE linked_devices SET status = 'revoked' WHERE link_token = ? AND tg_id = ?`
        ).bind(token, fromId).run();
        await env.DB.prepare(
          `UPDATE users SET pairing_code = '', link_token = '', link_expires_at = 0 WHERE tg_id = ? AND link_token = ?`
        ).bind(fromId, token).run();

        await answerCallbackQuery(env.BOT_TOKEN, cq.id, "❌ Link request denied.");
        if (chatId && messageId) {
          await editTelegramMessageText(
            env.BOT_TOKEN,
            chatId,
            messageId,
            `❌ <b>Device Link Request Denied</b>\n\nThe login attempt was blocked.`
          );
        }
        return jsonResponse({ ok: true });
      }

      await answerCallbackQuery(env.BOT_TOKEN, cq.id);
      return jsonResponse({ ok: true });
    }

    // B) Handle Bot Messages (/start, /start link_<token>, /link <CODE>, & Live Sync)
    const msg = body.message;
    if (msg && msg.from && msg.text && env.DB) {
      const tgId = String(msg.from.id);
      const text = String(msg.text).trim();
      const firstName = String(msg.from.first_name || "");
      const username = String(msg.from.username || "");

      let subRef = "";
      if (text.startsWith("/start ")) {
        const param = text.slice(7).trim();
        if (param.startsWith("sub_")) subRef = param.replace("sub_", "");
      }

      await env.DB.prepare(
        `INSERT OR IGNORE INTO users (tg_id, first_name, last_name, username, sub_user_ref, state)
         VALUES (?, ?, ?, ?, ?, 'link_device')`
      )
        .bind(tgId, firstName, String(msg.from.last_name || ""), username, subRef)
        .run();

      const existing = await env.DB.prepare(`SELECT * FROM users WHERE tg_id = ?`).bind(tgId).first();
      const settings = await getSettingsMap(env.DB);
      const appUrl = url.origin;

      // QR Code / Deep-link approval: /start link_<token>
      if (text.startsWith("/start link_")) {
        const linkToken = text.slice("/start link_".length).trim();
        const dev = await env.DB.prepare(
          `SELECT * FROM linked_devices WHERE link_token = ? AND tg_id = ? AND status = 'pending'`
        ).bind(linkToken, tgId).first();

        if (dev) {
          const approved = await approveDeviceLink(env.DB, tgId, linkToken);
          await sendTelegramBotMessage(
            env.BOT_TOKEN,
            tgId,
            `✅ <b>Device Linked Successfully!</b>\n\n📱 <b>Device:</b> ${approved?.deviceName || dev.device_name}\nYou can return to the Mini App now or tap below:`,
            {
              inline_keyboard: [[{ text: "🚀 Continue", web_app: { url: appUrl } }]],
            }
          );
        } else {
          await sendTelegramBotMessage(
            env.BOT_TOKEN,
            tgId,
            `⚠️ This device link QR/token has already been used or expired. Open the Mini App to generate a new link:`,
            {
              inline_keyboard: [[{ text: "🔗 Open Mini App", web_app: { url: appUrl } }]],
            }
          );
        }
        return jsonResponse({ ok: true });
      }

      // Manual pairing code approval in bot chat: /link XXXX-XXXX or direct XXXX-XXXX
      const cleanCodeCandidate = text.replace(/^\/link\s+/i, "").trim().toUpperCase();
      if (/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(cleanCodeCandidate)) {
        const normalizedCode = cleanCodeCandidate.includes("-")
          ? cleanCodeCandidate
          : `${cleanCodeCandidate.slice(0, 4)}-${cleanCodeCandidate.slice(4, 8)}`;

        const dev = await env.DB.prepare(
          `SELECT * FROM linked_devices WHERE tg_id = ? AND pairing_code = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`
        ).bind(tgId, normalizedCode).first();

        if (dev && Date.now() <= Number(existing?.link_expires_at || Date.now() + 60000)) {
          const approved = await approveDeviceLink(env.DB, tgId, dev.link_token);
          await sendTelegramBotMessage(
            env.BOT_TOKEN,
            tgId,
            `✅ <b>Device Linked via Pairing Code!</b>\n\n📱 <b>Device:</b> ${approved?.deviceName || dev.device_name}\n🔑 <b>Code:</b> <code>${normalizedCode}</code>`,
            {
              inline_keyboard: [[{ text: "🚀 Continue", web_app: { url: appUrl } }]],
            }
          );
          return jsonResponse({ ok: true });
        }
      }

      if (text.startsWith("/start")) {
        if (settings.login_mode === "silent_auto") {
          const token = existing?.session_token || generateToken();
          await env.DB.prepare(
            `UPDATE users SET state = 'end', session_token = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`
          )
            .bind(token, tgId)
            .run();

          await sendTelegramBotMessage(
            env.BOT_TOKEN,
            tgId,
            `✅ Welcome <b>${firstName}</b>! Your session is ready. Tap below to continue:`,
            {
              inline_keyboard: [[{ text: "🚀 Continue", web_app: { url: appUrl } }]],
            }
          );
        } else if (settings.login_mode === "auto_otp") {
          const otp = generateOtp();
          const expiresAt = Date.now() + 10 * 60 * 1000;
          await env.DB.prepare(
            `UPDATE users SET otp_code = ?, otp_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`
          )
            .bind(otp, expiresAt, tgId)
            .run();

          await sendTelegramBotMessage(
            env.BOT_TOKEN,
            tgId,
            `🔐 Your Login OTP: <b><code>${otp}</code></b>\nOpen the app below and enter this code:`,
            {
              inline_keyboard: [[{ text: "🚀 Open Mini App", web_app: { url: appUrl } }]],
            }
          );
        } else {
          // Linked Device Mode
          await sendTelegramBotMessage(
            env.BOT_TOKEN,
            tgId,
            `🔗 <b>Linked Device Login Ready</b>\n\nWelcome <b>${firstName}</b>! Open the Mini App below to link your device via 1-Tap Bot Approval or QR Code:`,
            {
              inline_keyboard: [[{ text: "🔗 Link Device & Sign In", web_app: { url: appUrl } }]],
            }
          );
        }
      } else {
        // Sync every user message sent to the bot directly to Admin Panel
        await env.DB.prepare(
          `INSERT INTO synced_messages (tg_id, sub_user_ref, sender_type, sender_name, source, message_text)
           VALUES (?, ?, 'user', ?, 'telegram_bot', ?)`
        )
          .bind(tgId, existing?.sub_user_ref || subRef, firstName || username || tgId, text)
          .run();
      }
    }
    return jsonResponse({ ok: true });
  }

  // =========================================================================
  // 2. ADMIN & SUB-USER PANEL AUTHENTICATION
  // =========================================================================
  if (path === "/api/admin/login") {
    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();
    const secretA = (env.ADMIN_SECRET || "").trim();
    const secretB = (env.BOT_TOKEN || "").trim();

    if (
      username.toLowerCase() === "admin" &&
      password &&
      ((secretA && password === secretA) || (secretB && password === secretB))
    ) {
      const token = await signPanelToken(
        { role: "admin", name: "Super Admin", exp: Date.now() + 7 * 24 * 3600 * 1000 },
        env.BOT_TOKEN
      );
      return jsonResponse({
        ok: true,
        token,
        role: "admin",
        profile: { name: "Super Admin" },
      });
    }

    if (env.DB) {
      const passHash = await sha256Hex(password);
      const sub = await env.DB.prepare(
        `SELECT * FROM sub_users WHERE username = ? AND password_hash = ? AND is_active = 1`
      )
        .bind(username, passHash)
        .first();

      if (sub) {
        const token = await signPanelToken(
          {
            role: "sub_user",
            id: sub.id,
            name: sub.name,
            ref_code: sub.ref_code,
            exp: Date.now() + 7 * 24 * 3600 * 1000,
          },
          env.BOT_TOKEN
        );
        return jsonResponse({
          ok: true,
          token,
          role: "sub_user",
          profile: { id: sub.id, name: sub.name, ref_code: sub.ref_code },
        });
      }
    }

    return jsonResponse(
      { ok: false, error: "Invalid credentials. Use username 'admin' and your ADMIN_SECRET or BOT_TOKEN." },
      401
    );
  }

  if (path === "/api/admin/tg-login") {
    const initData = request.headers.get("X-Telegram-Init-Data") || "";
    const verifiedUser = await verifyTelegramInitData(initData, env.BOT_TOKEN);
    const adminTgId = String(env.ADMIN_TG_ID || "").trim();

    if (!verifiedUser || !adminTgId || String(verifiedUser.id) !== adminTgId) {
      return jsonResponse(
        { ok: false, error: "Your Telegram ID is not set in ADMIN_TG_ID variable." },
        403
      );
    }

    const token = await signPanelToken(
      { role: "admin", name: verifiedUser.first_name || "Super Admin", exp: Date.now() + 7 * 24 * 3600 * 1000 },
      env.BOT_TOKEN
    );
    return jsonResponse({
      ok: true,
      token,
      role: "admin",
      profile: { name: verifiedUser.first_name || "Super Admin" },
    });
  }

  if (path.startsWith("/api/admin/")) {
    const auth = await verifyPanelToken(request.headers.get("Authorization"), env.BOT_TOKEN);
    if (!auth) {
      return jsonResponse({ ok: false, error: "Session expired. Please sign in again." }, 401);
    }

    if (path === "/api/admin/overview") {
      let usersList = [];
      if (auth.role === "admin") {
        const res = await env.DB.prepare(`SELECT * FROM users ORDER BY updated_at DESC`).all();
        usersList = res.results || [];
      } else {
        const res = await env.DB.prepare(
          `SELECT * FROM users WHERE sub_user_ref = ? ORDER BY updated_at DESC`
        )
          .bind(auth.ref_code)
          .all();
        usersList = res.results || [];
      }

      const subRes =
        auth.role === "admin"
          ? await env.DB.prepare(`SELECT id, name, username, ref_code, is_active FROM sub_users ORDER BY id DESC`).all()
          : { results: [] };

      const msgCountRow = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM synced_messages`).first();
      const settings = await getSettingsMap(env.DB);
      const tpl = await env.DB.prepare(`SELECT * FROM bot_templates WHERE bot_id = 'default'`).first();
      let parsedTpl = {};
      try {
        parsedTpl = tpl?.config_json ? JSON.parse(tpl.config_json) : {};
      } catch {}

      return jsonResponse({
        ok: true,
        role: auth.role,
        profile: auth,
        users: usersList,
        sub_users: subRes.results || [],
        settings,
        stats: {
          totalUsers: usersList.length,
          activeSessions: usersList.filter((u) => u.state === "end").length,
          totalMessages: msgCountRow?.cnt || 0,
        },
        template: {
          color: tpl?.color || "default",
          ...parsedTpl,
        },
      });
    }

    if (path === "/api/admin/settings/save" && auth.role === "admin") {
      const allowedModes = ["linked_device", "auto_otp", "silent_auto"];
      const loginMode = allowedModes.includes(body.login_mode) ? body.login_mode : "linked_device";
      const redirectUrl = normalizeUrl(body.redirect_url);
      const passParams = body.pass_user_params === "0" ? "0" : "1";

      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO app_settings (setting_key, setting_value) VALUES ('login_mode', ?)
           ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`
        ).bind(loginMode),
        env.DB.prepare(
          `INSERT INTO app_settings (setting_key, setting_value) VALUES ('redirect_url', ?)
           ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`
        ).bind(redirectUrl),
        env.DB.prepare(
          `INSERT INTO app_settings (setting_key, setting_value) VALUES ('pass_user_params', ?)
           ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`
        ).bind(passParams),
      ]);

      return jsonResponse({ ok: true });
    }

    if (path === "/api/admin/sub-users/create" && auth.role === "admin") {
      const name = String(body.name || "").trim();
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const refCode =
        String(body.ref_code || "").trim() || username.toLowerCase().replace(/[^a-z0-9]/g, "");

      if (!name || !username || !password) {
        return jsonResponse({ ok: false, error: "All fields are required" }, 400);
      }

      const passHash = await sha256Hex(password);
      await env.DB.prepare(
        `INSERT INTO sub_users (name, username, password_hash, ref_code) VALUES (?, ?, ?, ?)`
      )
        .bind(name, username, passHash, refCode)
        .run();

      return jsonResponse({ ok: true });
    }

    if (path === "/api/admin/sub-users/toggle" && auth.role === "admin") {
      await env.DB.prepare(`UPDATE sub_users SET is_active = ? WHERE id = ?`)
        .bind(Number(body.is_active) ? 1 : 0, Number(body.id))
        .run();
      return jsonResponse({ ok: true });
    }

    if (path === "/api/admin/sub-users/delete" && auth.role === "admin") {
      await env.DB.prepare(`DELETE FROM sub_users WHERE id = ?`).bind(Number(body.id)).run();
      return jsonResponse({ ok: true });
    }

    if (path === "/api/admin/users/assign" && auth.role === "admin") {
      await env.DB.prepare(`UPDATE users SET sub_user_ref = ? WHERE tg_id = ?`)
        .bind(String(body.sub_user_ref || ""), String(body.tg_id))
        .run();
      return jsonResponse({ ok: true });
    }

    if (path === "/api/admin/users/revoke") {
      const targetTgId = String(body.tg_id);
      await env.DB.prepare(
        `UPDATE linked_devices SET status = 'revoked' WHERE tg_id = ? AND status = 'linked'`
      ).bind(targetTgId).run();
      await env.DB.prepare(
        `UPDATE users SET session_token = '', device_name = '', linked_at = '', state = 'link_device', updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`
      )
        .bind(targetTgId)
        .run();
      return jsonResponse({ ok: true });
    }

    if (path === "/api/admin/users/delete" && auth.role === "admin") {
      const targetTgId = String(body.tg_id);
      await env.DB.prepare(`DELETE FROM linked_devices WHERE tg_id = ?`).bind(targetTgId).run();
      await env.DB.prepare(`DELETE FROM users WHERE tg_id = ?`).bind(targetTgId).run();
      return jsonResponse({ ok: true });
    }

    if (path === "/api/admin/messages/list") {
      const tgId = String(body.tg_id || "");
      const res = await env.DB.prepare(
        `SELECT * FROM synced_messages WHERE tg_id = ? ORDER BY id ASC LIMIT 200`
      )
        .bind(tgId)
        .all();
      return jsonResponse({ ok: true, messages: res.results || [] });
    }

    if (path === "/api/admin/messages/send") {
      const tgId = String(body.tg_id || "");
      const text = String(body.text || "").trim();
      if (!tgId || !text) {
        return jsonResponse({ ok: false, error: "Recipient and message text required" }, 400);
      }

      const targetUser = await env.DB.prepare(`SELECT * FROM users WHERE tg_id = ?`).bind(tgId).first();
      const senderLabel = auth.role === "admin" ? "Admin" : auth.name;

      await env.DB.prepare(
        `INSERT INTO synced_messages (tg_id, sub_user_ref, sender_type, sender_name, source, message_text)
         VALUES (?, ?, 'admin', ?, 'admin_panel', ?)`
      )
        .bind(tgId, targetUser?.sub_user_ref || "", senderLabel, text)
        .run();

      await sendTelegramBotMessage(env.BOT_TOKEN, tgId, `💬 <b>${senderLabel}:</b>\n${text}`);
      return jsonResponse({ ok: true });
    }

    if (path === "/api/admin/template/save" && auth.role === "admin") {
      const current = await env.DB.prepare(`SELECT * FROM bot_templates WHERE bot_id = 'default'`).first();
      let cfg = {};
      try {
        cfg = current?.config_json ? JSON.parse(current.config_json) : {};
      } catch {}

      if (body.code) cfg.code = body.code;

      await env.DB.prepare(
        `INSERT INTO bot_templates (bot_id, color, config_json)
         VALUES ('default', ?, ?)
         ON CONFLICT(bot_id) DO UPDATE SET color = excluded.color, config_json = excluded.config_json`
      )
        .bind(String(body.color || "default"), JSON.stringify(cfg))
        .run();

      return jsonResponse({ ok: true });
    }

    if (path === "/api/admin/webhook/setup" && auth.role === "admin") {
      const webhookUrl = String(body.webhook_url || "").trim();
      const tgRes = await fetch(
        `https://api.telegram.org/bot${env.BOT_TOKEN.trim()}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
      ).then((r) => r.json());
      return jsonResponse({
        ok: Boolean(tgRes.ok),
        message: tgRes.description || "Webhook updated",
      });
    }
  }

  // =========================================================================
  // 3. MINI APP USER ROUTES (Linked Device Login + Silent/OTP + Redirect)
  // =========================================================================
  const initData = request.headers.get("X-Telegram-Init-Data") || "";
  const verifiedUser = await verifyTelegramInitData(initData, env.BOT_TOKEN);

  if (!verifiedUser) {
    return jsonResponse({ ok: false, error: "Invalid Telegram initData signature" }, 401);
  }

  const tgId = String(verifiedUser.id);
  const botId = String(body.bot_id || "default");
  const subRef = String(body.sub_user_ref || "");
  const isAdminUser = env.ADMIN_TG_ID && String(env.ADMIN_TG_ID).trim() === tgId;
  const deviceInfo = detectDeviceInfo(request);
  const clientDeviceId = String(body.device_id || "").trim() || (await sha256Hex(`${tgId}:${deviceInfo.deviceName}:${deviceInfo.deviceIp}`)).slice(0, 16);

  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (tg_id, first_name, last_name, username, bot_id, sub_user_ref, state)
     VALUES (?, ?, ?, ?, ?, ?, 'link_device')`
  )
    .bind(
      tgId,
      String(verifiedUser.first_name || ""),
      String(verifiedUser.last_name || ""),
      String(verifiedUser.username || ""),
      botId,
      subRef
    )
    .run();

  if (subRef) {
    await env.DB.prepare(
      `UPDATE users SET sub_user_ref = ? WHERE tg_id = ? AND (sub_user_ref IS NULL OR sub_user_ref = '')`
    )
      .bind(subRef, tgId)
      .run();
  }

  const userRow = await env.DB.prepare(`SELECT * FROM users WHERE tg_id = ?`).bind(tgId).first();
  const settings = await getSettingsMap(env.DB);

  // Helper to create a fresh Linked Device request & push approval card to Telegram Bot
  async function createAndDispatchDeviceLink() {
    const pairingCode = generatePairingCode();
    const linkToken = generateToken(16);
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const botUsername = await getBotUsername(env.BOT_TOKEN);
    const linkUrl = botUsername
      ? `https://t.me/${botUsername}?start=link_${linkToken}`
      : `${url.origin}/?startapp=link_${linkToken}`;

    await env.DB.prepare(
      `UPDATE linked_devices SET status = 'expired' WHERE tg_id = ? AND status = 'pending'`
    ).bind(tgId).run();

    await env.DB.prepare(
      `INSERT INTO linked_devices (tg_id, device_id, device_name, device_ip, pairing_code, link_token, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`
    ).bind(tgId, clientDeviceId, deviceInfo.deviceName, deviceInfo.deviceIp, pairingCode, linkToken).run();

    await env.DB.prepare(
      `UPDATE users
       SET state = 'link_device',
           device_id = ?,
           device_name = ?,
           device_ip = ?,
           pairing_code = ?,
           link_token = ?,
           link_expires_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE tg_id = ?`
    ).bind(clientDeviceId, deviceInfo.deviceName, deviceInfo.deviceIp, pairingCode, linkToken, expiresAt, tgId).run();

    await sendTelegramBotMessage(
      env.BOT_TOKEN,
      tgId,
      `🔗 <b>New Linked Device Request</b>\n\n📱 <b>Device:</b> ${deviceInfo.deviceName}\n🌐 <b>IP:</b> <code>${deviceInfo.deviceIp}</code>\n🔑 <b>Pairing Code:</b> <code>${pairingCode}</code>\n\nTap <b>Approve & Link Device</b> below to sign in:`,
      {
        inline_keyboard: [
          [
            { text: "✅ Approve & Link Device", callback_data: `approve_link:${linkToken}` },
            { text: "❌ Deny", callback_data: `deny_link:${linkToken}` },
          ],
        ],
      }
    );

    return {
      pairingCode,
      linkToken,
      linkUrl,
      botUsername,
      deviceName: deviceInfo.deviceName,
      deviceIp: deviceInfo.deviceIp,
      expiresAt,
      linkSent: true,
    };
  }

  if (path === "/api/auto-init") {
    // 1) If Silent Zero-Click Auto-Login mode is active OR user already has an active linked session
    if (settings.login_mode === "silent_auto" || (userRow.state === "end" && userRow.session_token)) {
      const token = userRow.session_token || generateToken();
      const linkedDeviceName = userRow.device_name || deviceInfo.deviceName;
      if (userRow.state !== "end" || !userRow.session_token) {
        await env.DB.prepare(
          `UPDATE users SET state = 'end', session_token = ?, device_name = ?, linked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`
        )
          .bind(token, linkedDeviceName, tgId)
          .run();
      }
      const updatedUser = { ...userRow, device_name: linkedDeviceName };
      const finalRedirect = buildFinalRedirectUrl(settings, updatedUser, token);
      return jsonResponse({
        ok: true,
        u_id: userRow.id,
        state: "end",
        login_mode: settings.login_mode,
        session_token: token,
        device_name: linkedDeviceName,
        linked_at: userRow.linked_at || new Date().toISOString(),
        redirect_url: finalRedirect,
        is_admin: isAdminUser,
      });
    }

    // 2) Auto-OTP mode (only if explicitly enabled in Admin Panel)
    if (settings.login_mode === "auto_otp") {
      let otp = userRow.otp_code;
      let otpSent = false;
      const isExpired = !otp || Date.now() > Number(userRow.otp_expires_at || 0);

      if (isExpired) {
        otp = generateOtp();
        const expiresAt = Date.now() + 10 * 60 * 1000;
        await env.DB.prepare(
          `UPDATE users SET otp_code = ?, otp_expires_at = ?, state = 'enter_code', updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`
        )
          .bind(otp, expiresAt, tgId)
          .run();

        await sendTelegramBotMessage(
          env.BOT_TOKEN,
          tgId,
          `🔐 <b>Your Login OTP:</b> <code>${otp}</code>\nEnter this 6-digit code in the Mini App to continue.`
        );
        otpSent = true;
      }

      return jsonResponse({
        ok: true,
        u_id: userRow.id,
        state: "enter_code",
        login_mode: "auto_otp",
        otp_sent: otpSent,
        is_admin: isAdminUser,
      });
    }

    // 3) Default: Linked Device Process (QR Code + 8-char Pairing Code + 1-Tap Bot Approval)
    const hasValidPending =
      userRow.pairing_code &&
      userRow.link_token &&
      Date.now() < Number(userRow.link_expires_at || 0);

    if (hasValidPending) {
      const botUsername = await getBotUsername(env.BOT_TOKEN);
      const linkUrl = botUsername
        ? `https://t.me/${botUsername}?start=link_${userRow.link_token}`
        : `${url.origin}/?startapp=link_${userRow.link_token}`;

      return jsonResponse({
        ok: true,
        u_id: userRow.id,
        state: "link_device",
        login_mode: "linked_device",
        pairing_code: userRow.pairing_code,
        link_token: userRow.link_token,
        link_url: linkUrl,
        bot_username: botUsername,
        device_name: userRow.device_name || deviceInfo.deviceName,
        device_ip: userRow.device_ip || deviceInfo.deviceIp,
        link_sent: false,
        is_admin: isAdminUser,
      });
    }

    const linkData = await createAndDispatchDeviceLink();
    return jsonResponse({
      ok: true,
      u_id: userRow.id,
      state: "link_device",
      login_mode: "linked_device",
      pairing_code: linkData.pairingCode,
      link_token: linkData.linkToken,
      link_url: linkData.linkUrl,
      bot_username: linkData.botUsername,
      device_name: linkData.deviceName,
      device_ip: linkData.deviceIp,
      link_sent: linkData.linkSent,
      is_admin: isAdminUser,
    });
  }

  // Poll Linked Device approval status
  if (path === "/api/device-link/status") {
    const token = String(body.link_token || "").trim();
    const freshUser = await env.DB.prepare(`SELECT * FROM users WHERE tg_id = ?`).bind(tgId).first();

    if (freshUser && freshUser.state === "end" && freshUser.session_token) {
      const finalRedirect = buildFinalRedirectUrl(settings, freshUser, freshUser.session_token);
      return jsonResponse({
        ok: true,
        linked: true,
        session_token: freshUser.session_token,
        device_name: freshUser.device_name || deviceInfo.deviceName,
        linked_at: freshUser.linked_at || new Date().toISOString(),
        redirect_url: finalRedirect,
      });
    }

    if (token) {
      const dev = await env.DB.prepare(
        `SELECT * FROM linked_devices WHERE link_token = ? AND tg_id = ?`
      ).bind(token, tgId).first();

      if (dev?.status === "revoked") {
        return jsonResponse({ ok: true, linked: false, denied: true });
      }
    }

    return jsonResponse({ ok: true, linked: false, pending: true });
  }

  // Refresh Linked Device QR & Pairing Code
  if (path === "/api/device-link/refresh") {
    const linkData = await createAndDispatchDeviceLink();
    return jsonResponse({
      ok: true,
      pairing_code: linkData.pairingCode,
      link_token: linkData.linkToken,
      link_url: linkData.linkUrl,
      bot_username: linkData.botUsername,
      device_name: linkData.deviceName,
      device_ip: linkData.deviceIp,
    });
  }

  // Manual Pairing Code verification inside Mini App
  if (path === "/api/device-link/verify-code") {
    const rawCode = String(body.pairing_code || "").trim().toUpperCase().replace(/\s+/g, "");
    const normalized = rawCode.length === 8 && !rawCode.includes("-")
      ? `${rawCode.slice(0, 4)}-${rawCode.slice(4, 8)}`
      : rawCode;

    if (!normalized || normalized !== String(userRow.pairing_code || "").toUpperCase()) {
      return jsonResponse({ ok: false, error: "Invalid device pairing code." }, 400);
    }
    if (Date.now() > Number(userRow.link_expires_at || 0)) {
      return jsonResponse({ ok: false, error: "Pairing code expired. Tap Refresh Link Code." }, 400);
    }

    const approved = await approveDeviceLink(env.DB, tgId, userRow.link_token, deviceInfo.deviceName);
    await sendTelegramBotMessage(
      env.BOT_TOKEN,
      tgId,
      `🔗 <b>New Device Linked</b>\n\n📱 <b>Device:</b> ${approved?.deviceName || deviceInfo.deviceName}\n🌐 <b>IP:</b> <code>${deviceInfo.deviceIp}</code>`
    );

    const finalRedirect = buildFinalRedirectUrl(settings, approved.user, approved.sessionToken);
    return jsonResponse({
      ok: true,
      next_state: "end",
      session_token: approved.sessionToken,
      device_name: approved.deviceName,
      linked_at: approved.linkedAt,
      redirect_url: finalRedirect,
    });
  }

  if (path === "/api/template") {
    const tpl = await env.DB.prepare(`SELECT * FROM bot_templates WHERE bot_id = 'default'`).first();
    let parsed = {};
    try {
      parsed = tpl?.config_json ? JSON.parse(tpl.config_json) : {};
    } catch {}
    return jsonResponse({
      ok: true,
      template: {
        color: tpl?.color || "default",
        ...parsed,
      },
    });
  }

  if (path === "/api/enter-code") {
    if (body.resend) {
      const otp = generateOtp();
      const expiresAt = Date.now() + 10 * 60 * 1000;
      await env.DB.prepare(
        `UPDATE users SET otp_code = ?, otp_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`
      )
        .bind(otp, expiresAt, tgId)
        .run();

      await sendTelegramBotMessage(
        env.BOT_TOKEN,
        tgId,
        `🔄 <b>New Login OTP:</b> <code>${otp}</code>`
      );
      return jsonResponse({ ok: true, resent: true });
    }

    const inputCode = String(body.code || "").trim();
    if (!userRow.otp_code || inputCode !== userRow.otp_code) {
      return jsonResponse({ ok: false, error: "Invalid OTP code. Check your bot chat." }, 400);
    }
    if (Date.now() > Number(userRow.otp_expires_at || 0)) {
      return jsonResponse({ ok: false, error: "OTP expired. Tap Resend OTP." }, 400);
    }

    const token = generateToken();
    await env.DB.prepare(
      `UPDATE users SET otp_code = '', state = 'end', session_token = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`
    )
      .bind(token, tgId)
      .run();

    const finalRedirect = buildFinalRedirectUrl(settings, userRow, token);
    return jsonResponse({
      ok: true,
      next_state: "end",
      session_token: token,
      redirect_url: finalRedirect,
    });
  }

  if (path === "/api/user/messages") {
    if (userRow.state !== "end") {
      return jsonResponse({ ok: false, error: "Active session required" }, 403);
    }
    const res = await env.DB.prepare(
      `SELECT * FROM synced_messages WHERE tg_id = ? ORDER BY id ASC LIMIT 200`
    )
      .bind(tgId)
      .all();
    return jsonResponse({ ok: true, messages: res.results || [] });
  }

  if (path === "/api/user/send-message") {
    if (userRow.state !== "end") {
      return jsonResponse({ ok: false, error: "Active session required" }, 403);
    }
    const text = String(body.text || "").trim();
    if (!text) return jsonResponse({ ok: false, error: "Empty message" }, 400);

    await env.DB.prepare(
      `INSERT INTO synced_messages (tg_id, sub_user_ref, sender_type, sender_name, source, message_text)
       VALUES (?, ?, 'user', ?, 'miniapp', ?)`
    )
      .bind(tgId, userRow.sub_user_ref || "", userRow.first_name || tgId, text)
      .run();

    return jsonResponse({ ok: true });
  }

  if (path === "/api/logout") {
    await env.DB.prepare(
      `UPDATE linked_devices SET status = 'revoked' WHERE tg_id = ? AND status = 'linked'`
    ).bind(tgId).run();
    await env.DB.prepare(
      `UPDATE users SET session_token = '', otp_code = '', pairing_code = '', link_token = '', device_name = '', linked_at = '', state = 'link_device', updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`
    )
      .bind(tgId)
      .run();
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: false, error: "Not found" }, 404);
}
