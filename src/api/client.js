export async function postJson(path, payload = {}, extraHeaders = {}) {
  const initData = window.Telegram?.WebApp?.initData || "";
  const adminToken = localStorage.getItem("tg_admin_token") || "";

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  return data;
}

export const api = {
  // User Mini App endpoints
  autoInit: (data) => postJson("/api/auto-init", data),
  getTemplate: (data) => postJson("/api/template", data),
  enterCode: (data) => postJson("/api/enter-code", data),
  getUserMessages: (data) => postJson("/api/user/messages", data),
  sendUserMessage: (data) => postJson("/api/user/send-message", data),
  logout: (data) => postJson("/api/logout", data),

  // Admin & Sub-user endpoints
  adminLogin: (data) => postJson("/api/admin/login", data),
  adminTelegramLogin: (data) => postJson("/api/admin/tg-login", data),
  adminOverview: (data) => postJson("/api/admin/overview", data),
  adminSaveSettings: (data) => postJson("/api/admin/settings/save", data),
  adminCreateSubUser: (data) => postJson("/api/admin/sub-users/create", data),
  adminToggleSubUser: (data) => postJson("/api/admin/sub-users/toggle", data),
  adminDeleteSubUser: (data) => postJson("/api/admin/sub-users/delete", data),
  adminAssignUser: (data) => postJson("/api/admin/users/assign", data),
  adminRevokeSession: (data) => postJson("/api/admin/users/revoke", data),
  adminDeleteUser: (data) => postJson("/api/admin/users/delete", data),
  adminGetMessages: (data) => postJson("/api/admin/messages/list", data),
  adminSendMessage: (data) => postJson("/api/admin/messages/send", data),
  adminSaveTemplate: (data) => postJson("/api/admin/template/save", data),
  adminSetupWebhook: (data) => postJson("/api/admin/webhook/setup", data),
};
