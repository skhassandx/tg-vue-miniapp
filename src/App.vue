<script setup>
import { onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "./stores/userStore";
import { useTemplateStore } from "./stores/templateStore";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const templateStore = useTemplateStore();

// Synchronously detect /admin so it NEVER triggers Mini App Telegram auth
const isAdminRoute = computed(
  () => route.path.startsWith("/admin") || window.location.pathname.startsWith("/admin")
);

function normalizeRedirectUrl(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function performPostLoginAction(targetRedirectUrl) {
  const cleanUrl = normalizeRedirectUrl(targetRedirectUrl);
  if (cleanUrl) {
    window.location.replace(cleanUrl);
  } else {
    router.replace("/dashboard");
  }
}

onMounted(async () => {
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

  if (userStore.state === "end") {
    performPostLoginAction(userStore.redirectUrl);
  } else {
    router.replace("/code");
  }
});
</script>

<template>
  <div class="app-root" :style="isAdminRoute ? {} : templateStore.themeVars">
    <div v-if="!isAdminRoute && userStore.isLoading" class="loader-wrap">
      <div class="spinner" />
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
  align-items: center;
  justify-content: center;
}
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(100, 116, 139, 0.25);
  border-top-color: var(--button-bg);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
