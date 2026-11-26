<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "../stores/userStore";
import { useTemplateStore } from "../stores/templateStore";
import { api } from "../api/client";

const router = useRouter();
const userStore = useUserStore();
const templateStore = useTemplateStore();
const loggingOut = ref(false);

async function handleLogout() {
  loggingOut.value = true;
  try {
    await api.logout({
      bot_user_id: userStore.uId,
      bot_id: userStore.botId,
      user_tg: userStore.user,
    });
    userStore.sessionToken = "";
    userStore.state = "need_phone";
    router.replace("/start");
  } finally {
    loggingOut.value = false;
  }
}

function closeMiniApp() {
  window.Telegram?.WebApp?.close?.();
}
</script>

<template>
  <section class="card">
    <span class="info-badge">Active Session</span>
    <h2>{{ templateStore.template.end.title || "Verified & Logged In" }}</h2>
    <p>
      {{
        templateStore.template.end.description ||
        "Your login session is active in Cloudflare D1."
      }}
    </p>
    <p v-if="userStore.phoneNumber">Phone: <strong>{{ userStore.phoneNumber }}</strong></p>

    <button class="btn" @click="closeMiniApp">
      {{ templateStore.template.end.buttonText || "Done" }}
    </button>
    <button class="btn-secondary" :disabled="loggingOut" @click="handleLogout">
      {{ loggingOut ? "Signing out..." : "Log Out Session" }}
    </button>
  </section>
</template>
