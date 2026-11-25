<script setup>
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "../stores/userStore";

const router = useRouter();
const userStore = useUserStore();

onMounted(() => {
  if (!userStore.initialized) {
    router.replace("/unauthorized");
  } else if (userStore.state === "end") {
    router.replace("/end");
  } else if (userStore.state === "enter_code") {
    router.replace("/code");
  } else if (userStore.state === "enter_twoFA") {
    router.replace("/password");
  } else {
    router.replace("/start");
  }
});
</script>

<template>
  <div />
</template>
