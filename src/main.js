import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import { api } from "./api/client";

const app = createApp(App);
app.use(createPinia());
app.use(router);

app.config.errorHandler = (err, _instance, info) => {
  console.error("[Vue Error]", err, info);
  api.logClientError({
    where: `vue:${info || ""}`,
    message: err?.message || String(err),
    stack: err?.stack ? String(err.stack).slice(0, 1800) : "",
    url: window.location.href,
    ua: navigator.userAgent,
  });
};

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  api.logClientError({
    where: "unhandledrejection",
    message: reason?.message || String(reason),
    stack: reason?.stack ? String(reason.stack).slice(0, 1800) : "",
    url: window.location.href,
    ua: navigator.userAgent,
  });
});

window.addEventListener("error", (event) => {
  api.logClientError({
    where: "window.error",
    message: event.message || "Unknown error",
    stack: event.error?.stack ? String(event.error.stack).slice(0, 1800) : "",
    url: window.location.href,
    ua: navigator.userAgent,
  });
});

app.mount("#app");
