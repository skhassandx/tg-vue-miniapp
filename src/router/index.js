import { createRouter, createWebHistory } from "vue-router";

const routes = [
  { path: "/", name: "index", component: () => import("../views/IndexView.vue") },
  { path: "/code", name: "code", component: () => import("../views/CodeView.vue") },
  { path: "/dashboard", name: "dashboard", component: () => import("../views/DashboardView.vue") },
  { path: "/admin", name: "admin", component: () => import("../views/AdminView.vue") },
  { path: "/unauthorized", name: "unauthorized", component: () => import("../views/UnauthorizedView.vue") },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export default createRouter({
  history: createWebHistory("/"),
  routes,
});
