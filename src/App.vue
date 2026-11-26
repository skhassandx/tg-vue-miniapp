<script setup>
import { onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "./stores/userStore";
import { useTemplateStore } from "./stores/templateStore";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const templateStore = useTemplateStore();

const isAdminRoute = computed(() => route.path.startsWith("/admin"));

function navigateByState(currentState) {
  if (currentState === "end") {
    router.replace("/dashboard");
  } else if (currentState === "enter_twoFA") {
    router.replace("/password");
  } else if (currentState === "enter_code") {
    router.replace("/code");
  } else {
    router.replace("/unauthorized");
  }
}

onMounted(async () => {
  // If user directly opens /admin in browser or Telegram, let AdminView handle auth
  if (window.location.pathname.startsWith("/admin")) {
    userStore.isLoading = false;
    return;
  }

  const tg = window.Telegram?.WebApp;
  tg?.ready?.();
  tg?.expand?.();

  if (tg?.themeParams?.bg_color) {
    document.body.style.backgroundColor = tg.themeParams.bg_color;
  }

  const ok = await userStore.init();
  if (!ok) {
    router.replace("/unauthorized");
    return;
  }

  await templateStore.init(userStore);
  navigateByState(userStore.state);
});
</script>

<template>
  <div class="app-root" :style="isAdminRoute ? {} : templateStore.themeVars">
    <div v-if="!isAdminRoute && userStore.isLoading" class="loader-wrap">
      <div class="spinner" />
      <p>Preparing your session...</p>
    </div>
    <router-view v-else />
  </div>
</template>

<style>
:root {
  --page-bg: var(--tg-theme-bg-color, #f1f5f9);
  --text-color: var(--tg-theme-text-color, #0f172a);
  --card-bg: var(--tg-theme-secondary-bg-color, #ffffff);
  --button-bg: var(--tg-theme-button-color, #2563eb);
  --button-text: var(--tg-theme-button-text-color, #ffffff);
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--page-bg);
  color: var(--text-color);
}
.app-root {
  min-height: 100vh;
}
.loader-wrap {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(100, 116, 139, 0.25);
  border-top-color: var(--button-bg);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
