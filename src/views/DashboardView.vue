<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "../stores/userStore";
import { api } from "../api/client";

const router = useRouter();
const userStore = useUserStore();

const messages = ref([]);
const newMessage = ref("");
const sending = ref(false);
let pollTimer = null;

async function fetchMessages() {
  try {
    const res = await api.getUserMessages({ user_tg: userStore.user });
    if (res.ok) {
      messages.value = res.messages || [];
    }
  } catch {}
}

async function sendMessage() {
  const text = newMessage.value.trim();
  if (!text) return;

  sending.value = true;
  try {
    const res = await api.sendUserMessage({
      text,
      user_tg: userStore.user,
    });
    if (res.ok) {
      newMessage.value = "";
      await fetchMessages();
    }
  } finally {
    sending.value = false;
  }
}

async function handleLogout() {
  await api.logout({ user_tg: userStore.user });
  userStore.sessionToken = "";
  userStore.state = "link_device";
  await userStore.init();
  router.replace("/code");
}

onMounted(() => {
  fetchMessages();
  pollTimer = setInterval(fetchMessages, 3500);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <div class="portal-wrap">
    <header class="portal-header">
      <div>
        <h3>{{ userStore.user?.first_name }}</h3>
        <span class="status-dot">● Device Linked & Active</span>
      </div>
      <div class="header-actions">
        <button v-if="userStore.isAdmin" class="btn-sm dark" @click="$router.push('/admin')">
          Admin
        </button>
        <button class="btn-sm" @click="handleLogout">Logout</button>
      </div>
    </header>

    <section class="session-card">
      <div class="row">
        <span>Telegram ID</span>
        <strong>{{ userStore.user?.id }}</strong>
      </div>
      <div class="row">
        <span>Linked Device</span>
        <strong>{{ userStore.deviceName || "Verified Device" }}</strong>
      </div>
      <div class="row">
        <span>Session Token</span>
        <code>{{ userStore.sessionToken.slice(0, 16) }}...</code>
      </div>
      <div v-if="userStore.subUserRef" class="row">
        <span>Assigned Agent</span>
        <strong>{{ userStore.subUserRef }}</strong>
      </div>
    </section>

    <section class="chat-card">
      <div class="chat-top">
        <strong>Live Synced Messages</strong>
        <span class="live-badge">Auto-Sync ON</span>
      </div>

      <div class="msg-list">
        <p v-if="!messages.length" class="empty">
          Send a message here or in the Telegram bot — everything syncs live with Admin.
        </p>
        <div
          v-for="m in messages"
          :key="m.id"
          :class="['msg-bubble', m.sender_type === 'user' ? 'mine' : 'theirs']"
        >
          <div class="msg-meta">
            {{ m.sender_type === "user" ? "You" : m.sender_name || "Admin" }} • {{ m.source }}
          </div>
          <div>{{ m.message_text }}</div>
        </div>
      </div>

      <div class="chat-input-row">
        <input
          v-model="newMessage"
          type="text"
          placeholder="Type a message..."
          @keyup.enter="sendMessage"
        />
        <button :disabled="sending" @click="sendMessage">Send</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.portal-wrap {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
}
.portal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.portal-header h3 {
  margin: 0;
  font-size: 18px;
}
.status-dot {
  font-size: 12px;
  color: #10b981;
  font-weight: 600;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.btn-sm {
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid rgba(100, 116, 139, 0.35);
  background: transparent;
  color: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.btn-sm.dark {
  background: #0f172a;
  color: #fff;
  border: 0;
}
.session-card,
.chat-card {
  background: var(--card-bg);
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
}
.row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(100, 116, 139, 0.12);
}
.row:last-child {
  border-bottom: 0;
}
.chat-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
}
.live-badge {
  background: rgba(16, 185, 129, 0.15);
  color: #059669;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.msg-list {
  max-height: 290px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.empty {
  text-align: center;
  font-size: 13px;
  opacity: 0.65;
  padding: 20px 0;
}
.msg-bubble {
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13.5px;
  max-width: 85%;
}
.msg-bubble.mine {
  align-self: flex-end;
  background: var(--button-bg);
  color: var(--button-text);
}
.msg-bubble.theirs {
  align-self: flex-start;
  background: rgba(100, 116, 139, 0.14);
}
.msg-meta {
  font-size: 10.5px;
  opacity: 0.75;
  margin-bottom: 3px;
}
.chat-input-row {
  display: flex;
  gap: 8px;
}
.chat-input-row input {
  flex: 1;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(100, 116, 139, 0.35);
  background: transparent;
  color: inherit;
}
.chat-input-row button {
  padding: 10px 16px;
  border: 0;
  border-radius: 10px;
  background: var(--button-bg);
  color: var(--button-text);
  font-weight: 600;
  cursor: pointer;
}
</style>
