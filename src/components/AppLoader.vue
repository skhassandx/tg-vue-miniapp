<script setup>
import { ref, onMounted } from "vue";

defineProps({
  visible: { type: Boolean, default: true },
});

const bgColor = ref("#ffffff");
const accentColor = ref("#2481cc");

onMounted(() => {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  tg.ready?.();
  if (tg.themeParams?.bg_color) bgColor.value = tg.themeParams.bg_color;
  if (tg.themeParams?.button_color) accentColor.value = tg.themeParams.button_color;
});
</script>

<template>
  <div v-if="visible" class="loader-overlay" :style="{ backgroundColor: bgColor }">
    <div class="spinner" :style="{ borderTopColor: accentColor }" />
  </div>
</template>

<style scoped>
.loader-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
}
.spinner {
  width: 38px;
  height: 38px;
  border: 3px solid rgba(128, 128, 128, 0.25);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
