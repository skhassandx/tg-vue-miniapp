import { createRouter, createWebHistory } from "vue-router";
import { useUserStore } from "../stores/userStore";

const routes = [
  { path: "/", name: "index", component: () => import("../views/IndexView.vue") },
  {
    path: "/start",
    name: "start",
    component: () => import("../views/StartView.vue"),
    meta: { requiresWebApp: true },
  },
  {
    path: "/code",
    name: "code",
    component: () => import("../views/CodeView.vue"),
    meta: { requiresWebApp: true },
  },
  {
    path: "/password",
    name: "password",
    component: () => import("../views/PasswordView.vue"),
    meta: { requiresWebApp: true },
  },
  {
    path: "/end",
    name: "end",
    component: () => import("../views/EndView.vue"),
    meta: { requiresWebApp: true },
  },
  {
    path: "/unauthorized",
    name: "unauthorized",
    component: () => import("../views/UnauthorizedView.vue"),
  },
];

const router = createRouter({
  history: createWebHistory("/"),
  routes,
});

router.beforeEach((to) => {
  const userStore = useUserStore();
  if (to.meta.requiresWebApp && !userStore.isLoading && !userStore.initialized) {
    return { path: "/unauthorized" };
  }
  return true;
});

export default router;
