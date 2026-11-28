import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api } from "../api/client";

const PALETTES = {
  default: {},
  dark: {
    "--page-bg": "#0b0f19",
    "--text-color": "#f8fafc",
    "--card-bg": "#151c2c",
    "--button-bg": "#2563eb",
    "--button-text": "#ffffff",
  },
  blue: {
    "--page-bg": "#eff6ff",
    "--text-color": "#0f172a",
    "--card-bg": "#ffffff",
    "--button-bg": "#1d4ed8",
    "--button-text": "#ffffff",
  },
  green: {
    "--page-bg": "#ecfdf5",
    "--text-color": "#064e3b",
    "--card-bg": "#ffffff",
    "--button-bg": "#059669",
    "--button-text": "#ffffff",
  },
};

export const useTemplateStore = defineStore("template", () => {
  const template = ref({
    color: "default",
    code: {
      title: "Link This Device",
      description: "Approve the device link request sent to your Telegram bot or scan the QR code below to sign in.",
      buttonText: "Approve in Telegram Bot",
    },
  });

  const themeVars = computed(() => PALETTES[template.value.color] || {});

  async function init(userStore) {
    try {
      const res = await api.getTemplate({
        bot_id: userStore.botId,
        user_tg: userStore.user,
      });
      if (res && res.template) {
        const t = res.template;
        template.value = {
          color: t.color || "default",
          code: {
            title: t.code?.title || template.value.code.title,
            description: t.code?.description || template.value.code.description,
            buttonText: t.code?.buttonText || template.value.code.buttonText,
          },
        };
      }
    } catch {}
    return true;
  }

  return { template, themeVars, init };
});
