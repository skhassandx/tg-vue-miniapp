import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api } from "../api/client";

const THEME_PALETTES = {
  default: {},
  white: {
    "--page-bg": "#f7f9fd",
    "--text-color": "#0d1117",
    "--card-bg": "rgba(255,255,255,0.94)",
    "--button-bg": "#0f7cff",
    "--button-text": "#ffffff",
  },
  black: {
    "--page-bg": "#0b0f19",
    "--text-color": "#ffffff",
    "--card-bg": "rgba(20,24,34,0.82)",
    "--button-bg": "#1f2937",
    "--button-text": "#f4f6ff",
  },
  blue: {
    "--page-bg": "#3b63d9",
    "--text-color": "#ffffff",
    "--card-bg": "rgba(25,42,95,0.72)",
    "--button-bg": "#1d4ed8",
    "--button-text": "#e8f0ff",
  },
  green: {
    "--page-bg": "#12b16a",
    "--text-color": "#ffffff",
    "--card-bg": "rgba(12,95,58,0.72)",
    "--button-bg": "#0f9b5c",
    "--button-text": "#eafff5",
  },
};

function normalizeStep(step) {
  const s = step && typeof step === "object" ? step : {};
  return {
    title: s.title || "",
    description: s.description || "",
    buttonText: s.buttonText || "Continue",
  };
}

function normalizeTemplate(raw) {
  const t = raw && typeof raw === "object" ? raw : {};
  return {
    color: t.color || "default",
    backgroundUrl: t.backgroundUrl || "",
    backgroundBlur: Number(t.backgroundBlur) || 0,
    start: normalizeStep(t.start),
    code: normalizeStep(t.code),
    pass: normalizeStep(t.pass),
    end: normalizeStep(t.end),
  };
}

export const useTemplateStore = defineStore("template", () => {
  const template = ref(normalizeTemplate({}));

  const themeVars = computed(() => {
    const key = (template.value.color || "default").toLowerCase();
    return THEME_PALETTES[key] || {};
  });

  async function init(userStore) {
    const res = await api.getTemplate({
      bot_id: userStore.botId,
      user_tg: userStore.user,
      bot_user_id: userStore.uId,
    });

    if (res && res.template) {
      template.value = normalizeTemplate(res.template);
      return true;
    }
    return false;
  }

  return { template, themeVars, init };
});
