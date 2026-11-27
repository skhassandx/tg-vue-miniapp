<template>
  <div class="center-box">
    <section class="card">
      <h2>Open Inside Telegram Bot</h2>
      <p>
        Please launch this Mini App from your Telegram Bot menu button or inline Launch button so your session can verify automatically.
      </p>
      <router-link to="/admin" class="admin-link">Open Admin Control Panel →</router-link>
    </section>
  </div>
</template>

<style scoped>
.center-box {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.card {
  max-width: 400px;
  background: var(--card-bg);
  padding: 24px;
  border-radius: 16px;
  text-align: center;
}
.admin-link {
  display: inline-block;
  margin-top: 12px;
  color: #2563eb;
  font-size: 13px;
  text-decoration: none;
  font-weight: 600;
}
</style>
