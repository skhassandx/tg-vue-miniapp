import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../api/client";

function getOrCreateClientDeviceId() {
  try {
    let id = localStorage.getItem("tg_linked_device_id");
    if (!id) {
      id = "dev_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem("tg_linked_device_id", id);
    }
    return id;
  } catch {
    return "";
  }
}

export const useUserStore = defineStore("user", () => {
  const initialized = ref(false);
  const isLoading = ref(true);
  const user = ref(null);
  const state = ref("unauthorized"); // unauthorized | link_device | enter_code | end
  const loginMode = ref("linked_device"); // linked_device | auto_otp | silent_auto
  const uId = ref(null);
  const botId = ref("default");
  const subUserRef = ref("");
  const sessionToken = ref("");
  const redirectUrl = ref("");
  const otpAutoSent = ref(false);
  const isAdmin = ref(false);

  // Linked Device metadata
  const pairingCode = ref("");
  const linkToken = ref("");
  const linkUrl = ref("");
  const botUsername = ref("");
  const deviceName = ref("");
  const deviceIp = ref("");
  const linkedAt = ref("");
  const linkAutoSent = ref(false);

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
    } else if (startParam && !startParam.startsWith("link_")) {
      botId.value = startParam;
    }

    if (params.get("ref")) subUserRef.value = params.get("ref");
    if (params.get("b")) botId.value = params.get("b");

    try {
      const res = await api.autoInit({
        bot_id: botId.value,
        sub_user_ref: subUserRef.value,
        user_tg: user.value,
        device_id: getOrCreateClientDeviceId(),
      });

      if (res && res.ok) {
        uId.value = res.u_id;
        state.value = res.state || "link_device";
        loginMode.value = res.login_mode || "linked_device";
        sessionToken.value = res.session_token || "";
        redirectUrl.value = res.redirect_url || "";
        otpAutoSent.value = Boolean(res.otp_sent);
        isAdmin.value = Boolean(res.is_admin);

        pairingCode.value = res.pairing_code || "";
        linkToken.value = res.link_token || "";
        linkUrl.value = res.link_url || "";
        botUsername.value = res.bot_username || "";
        deviceName.value = res.device_name || "";
        deviceIp.value = res.device_ip || "";
        linkedAt.value = res.linked_at || "";
        linkAutoSent.value = Boolean(res.link_sent);

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
    loginMode,
    uId,
    botId,
    subUserRef,
    sessionToken,
    redirectUrl,
    otpAutoSent,
    isAdmin,
    pairingCode,
    linkToken,
    linkUrl,
    botUsername,
    deviceName,
    deviceIp,
    linkedAt,
    linkAutoSent,
    init,
  };
});
