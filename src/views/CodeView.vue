<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "../stores/userStore";
import { useTemplateStore } from "../stores/templateStore";
import { api } from "../api/client";

const router = useRouter();
const userStore = useUserStore();
const templateStore = useTemplateStore();

const code = ref("");
const loading = ref(false);
const errorMsg = ref("");
const infoMsg = ref(
  userStore.otpAutoSent
    ? "OTP automatically sent to your Telegram bot chat!"
    : "Enter the 6-digit OTP from your Telegram bot chat."
);

async function submitOtp(resend = false) {
  errorMsg.value = "";
  if (!resend && !code.value.trim()) {
    errorMsg.value = "Please enter the 6-digit OTP.";
    return;
  }

  loading.value = true;
  try {
    const res = await api.enterCode({
      code: code.value.trim(),
      resend,
      bot_id: userStore.botId,
      user_tg: userStore.user,
    });

    if (resend && res.ok) {
      infoMsg.value = "A fresh 6-digit OTP has been sent to your Telegram chat!";
      return;
    }

    if (res.ok && res.next_state === "enter_twoFA") {
      userStore.passwordHint = res.password_hint || "";
      userStore.state = "enter_twoFA";
      router.replace("/password");
    } else if (res.ok) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");
      userStore.sessionToken = res.session_token || "";
      userStore.state = "end";
      router.replace("/dashboard");
    }
  } catch (e) {
    errorMsg.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="center-screen">
    <section class="card">
      <div class="user-chip">
        <span>👤 {{ userStore.user?.first_name }}</span>
        <span class="id-pill">ID: {{ userStore.user?.id }}</span>
      </div>

      <h2>{{ templateStore.template.code.title }}</h2>
      <p class="desc">{{ templateStore.template.code.description }}</p>

      <div class="auto-banner">
        ✅ No phone number needed — check your bot message for the OTP.
      </div>

      <input
        v-model="code"
        type="text"
        inputmode="numeric"
        maxlength="6"
        placeholder="• • • • • •"
        class="otp-input"
        @keyup.enter="submitOtp(false)"
      />

      <p v-if="errorMsg" class="err">{{ errorMsg }}</p>
      <p v-else class="info">{{ infoMsg }}</p>

      <button class="btn" :disabled="loading" @click="submitOtp(false)">
        {{ loading ? "Verifying..." : templateStore.template.code.buttonText }}
      </button>

      <button class="btn-outline" :disabled="loading" @click="submitOtp(true)">
        Resend OTP to Bot
      </button>

      <button
        v-if="userStore.isAdmin"
        class="btn-admin-shortcut"
        @click="$router.push('/admin')"
      >
        Open Admin Panel
      </button>
    </section>
  </div>
</template>

<style scoped>
.center-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.card {
  width: 100%;
  max-width: 420px;
  background: var(--card-bg);
  padding: 24px 20px;
  border-radius: 18px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.08);
}
.user-chip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 14px;
}
.id-pill {
  background: rgba(37, 99, 235, 0.12);
  color: #2563eb;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
}
h2 {
  margin: 0 0 8px;
  font-size: 20px;
}
.desc {
  margin: 0 0 14px;
  font-size: 14px;
  opacity: 0.85;
  line-height: 1.45;
}
.auto-banner {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12.5px;
  margin-bottom: 14px;
  font-weight: 500;
}
.otp-input {
  width: 100%;
  padding: 14px;
  border: 1.5px solid rgba(100, 116, 139, 0.35);
  border-radius: 12px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 6px;
  text-align: center;
  background: transparent;
  color: inherit;
  margin-bottom: 10px;
}
.err {
  color: #dc2626;
  font-size: 13px;
  margin: 0 0 12px;
}
.info {
  font-size: 12.5px;
  opacity: 0.75;
  margin: 0 0 14px;
}
.btn {
  width: 100%;
  padding: 13px;
  border: 0;
  border-radius: 12px;
  background: var(--button-bg);
  color: var(--button-text);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.6;
}
.btn-outline {
  width: 100%;
  padding: 11px;
  margin-top: 8px;
  border: 1px solid rgba(100, 116, 139, 0.35);
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font-size: 14px;
  cursor: pointer;
}
.btn-admin-shortcut {
  width: 100%;
  padding: 10px;
  margin-top: 10px;
  border: 0;
  border-radius: 10px;
  background: #0f172a;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
</style>
