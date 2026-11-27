/**
 * Cloudflare Pages Functions API (v3):
 * - Auto-ensures D1 schema on boot (zero manual SQL errors)
 * - Supports both Silent Zero-Click Auto-Login & Auto-OTP modes
 * - Admin-configurable Post-Login Server Redirect URL with signed user/session params
 * - Real-Time User <-> Admin / Sub-User Message Sync & Telegram Bot Webhook
 */

let schemaReady = false;

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
        state TEXT DEFAULT 'enter_code',
        otp_code TEXT DEFAULT '',
        otp_expires_at INTEGER DEFAULT 0,
        twofa_enabled INTEGER DEFAULT 0,
        twofa_pin_hash TEXT DEFAULT '',
        twofa_hint TEXT DEFAULT '',
        session_token TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
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
    await db.prepare(`ALTER TABLE users ADD COLUMN sub_user_ref TEXT DEFAULT ''`).run().catch(() => {});
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

function generateToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
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

async function getSettingsMap(db) {
  const map = {
    login_mode: "auto_otp",
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

function buildFinalRedirectUrl(settings, userRow, sessionToken) {
  const raw = (settings.redirect_url || "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return "";
  if (settings.pass_user_params === "0") return raw;

  try {
    const u = new URL(raw);
    u.searchParams.set("tg_id", String(userRow.tg_id));
    u.searchParams.set("session_token", String(sessionToken || userRow.session_token || ""));
    if (userRow.username) u.searchParams.set("username", String(userRow.username));
    if (userRow.first_name) u.searchParams.set("first_name", String(userRow.first_name));
    if (userRow.sub_user_ref) u.searchParams.set("sub_ref", String(userRow.sub_user_ref));
    return u.toString();
  } catch {
    return raw;
  }
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
    return jsonResponse({ ok: true, service: "tg-vue3-pinia-admin-v3" });
  }

  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};

  // =========================================================================
  // 1. TELEGRAM BOT WEBHOOK (Silent background OTP + Live Message Sync)
  // =========================================================================
  if (path === "/api/webhook") {
    const msg = body.message;
    if (msg && msg.from && msg.text && env.DB) {
      const tgId = String(msg.from.id);
      const text = String(msg.text);
      const firstName = String(msg.from.first_name || "");
      const username = String(msg.from.username || "");

      let subRef = "";
      if (text.startsWith("/start ")) {
        const param = text.slice(7).trim();
        if (param.startsWith("sub_")) subRef = param.replace("sub_", "");
      }

      await env.DB.prepare(
        `INSERT OR IGNORE INTO users (tg_id, first_name, last_name, username, sub_user_ref, state)
         VALUES (?, ?, ?, ?, ?, 'enter_code')`
      )
        .bind(tgId, firstName, String(msg.from.last_name || ""), username, subRef)
        .run();

      const existing = await env.DB.prepare(`SELECT * FROM users WHERE tg_id = ?`).bind(tgId).first();
      const settings = await getSettingsMap(env.DB);

      if (text.startsWith("/start")) {
        const appUrl = url.origin;
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
        } else {
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
      const loginMode = body.login_mode === "silent_auto" ? "silent_auto" : "auto_otp";
      const redirectUrl = String(body.redirect_url || "").trim();
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
      await env.DB.prepare(
        `UPDATE users SET session_token = '', state = 'enter_code', updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`
      )
        .bind(String(body.tg_id))
        .run();
      return jsonResponse({ ok: true });
    }

    if (path === "/api/admin/users/delete" && auth.role === "admin") {
      await env.DB.prepare(`DELETE FROM users WHERE tg_id = ?`).bind(String(body.tg_id)).run();
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
  // 3. MINI APP USER ROUTES (Silent Auto-Login / Auto-OTP + Redirect)
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

  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (tg_id, first_name, last_name, username, bot_id, sub_user_ref, state)
     VALUES (?, ?, ?, ?, ?, ?, 'enter_code')`
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

  if (path === "/api/auto-init") {
    // 1) If Silent Zero-Click Auto-Login mode is active OR user already logged in
    if (settings.login_mode === "silent_auto" || (userRow.state === "end" && userRow.session_token)) {
      const token = userRow.session_token || generateToken();
      if (userRow.state !== "end" || !userRow.session_token) {
        await env.DB.prepare(
          `UPDATE users SET state = 'end', session_token = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`
        )
          .bind(token, tgId)
          .run();
      }
      const finalRedirect = buildFinalRedirectUrl(settings, userRow, token);
      return jsonResponse({
        ok: true,
        u_id: userRow.id,
        state: "end",
        session_token: token,
        redirect_url: finalRedirect,
        is_admin: isAdminUser,
      });
    }

    // 2) Auto-OTP mode: generate OTP silently & send via Bot without asking phone number
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
      otp_sent: otpSent,
      is_admin: isAdminUser,
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
      `UPDATE users SET session_token = '', otp_code = '', state = 'enter_code', updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`
    )
      .bind(tgId)
      .run();
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: false, error: "Not found" }, 404);
}
