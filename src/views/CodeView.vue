<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "../stores/userStore";
import { useTemplateStore } from "../stores/templateStore";
import { api } from "../api/client";

const router = useRouter();
const userStore = useUserStore();
const templateStore = useTemplateStore();

const code = ref("");
const manualPairInput = ref("");
const showManualEntry = ref(false);
const loading = ref(false);
const copied = ref(false);
const errorMsg = ref("");
const infoMsg = ref("Waiting for approval in your Telegram bot chat...");
let pollTimer = null;

// ============================================================================
// Pure-JS ISO/IEC 18004 QR Code SVG Generator (Versions 1..10, ECC L)
// ============================================================================
const VERSION_SPECS = {
  1: [26, 19, 7, 1, []],
  2: [44, 34, 10, 1, [6, 18]],
  3: [70, 55, 15, 1, [6, 22]],
  4: [100, 80, 20, 1, [6, 26]],
  5: [134, 108, 26, 1, [6, 30]],
  6: [172, 136, 18, 2, [6, 34]],
  7: [196, 156, 20, 2, [6, 22, 38]],
  8: [242, 194, 24, 2, [6, 24, 42]],
  9: [292, 232, 30, 2, [6, 26, 46]],
  10: [346, 274, 18, 4, [6, 28, 50]],
};

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGenPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, eccLen) {
  const gen = rsGenPoly(eccLen);
  const rem = [...data, ...new Array(eccLen).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = rem[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) {
        rem[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return rem.slice(data.length);
}

const FORMAT_INFO_L = [0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976];
const VERSION_INFO = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3 };

function buildQrSvg(text) {
  if (!text) return "";
  try {
    const raw = new TextEncoder().encode(text);
    const length = raw.length;
    let ver = null;
    for (let v = 1; v <= 10; v++) {
      const dataCw = VERSION_SPECS[v][1];
      const headerBits = 4 + (v <= 9 ? 8 : 16);
      if (headerBits + length * 8 <= dataCw * 8) {
        ver = v;
        break;
      }
    }
    if (!ver) return "";

    const [, dataCw, eccPerBlock, numBlocks, alignCenters] = VERSION_SPECS[ver];
    const bits = [];
    const pushBits = (val, count) => {
      for (let i = count - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };

    pushBits(0b0100, 4);
    pushBits(length, ver <= 9 ? 8 : 16);
    for (const b of raw) pushBits(b, 8);

    const capBits = dataCw * 8;
    const term = Math.min(4, capBits - bits.length);
    pushBits(0, term);
    while (bits.length % 8 !== 0) bits.push(0);

    const dataBytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      dataBytes.push(byte);
    }

    const padBytes = [0xec, 0x11];
    let idx = 0;
    while (dataBytes.length < dataCw) {
      dataBytes.push(padBytes[idx % 2]);
      idx++;
    }

    const shortLen = Math.floor(dataCw / numBlocks);
    const longBlocks = dataCw % numBlocks;
    const shortBlocks = numBlocks - longBlocks;

    const dataBlocks = [];
    const eccBlocks = [];
    let offset = 0;
    for (let b = 0; b < numBlocks; b++) {
      const blen = shortLen + (b >= shortBlocks ? 1 : 0);
      const blk = dataBytes.slice(offset, offset + blen);
      offset += blen;
      dataBlocks.push(blk);
      eccBlocks.push(rsEncode(blk, eccPerBlock));
    }

    const codewords = [];
    const maxDataLen = shortLen + (longBlocks > 0 ? 1 : 0);
    for (let i = 0; i < maxDataLen; i++) {
      for (let b = 0; b < numBlocks; b++) {
        if (i < dataBlocks[b].length) codewords.push(dataBlocks[b][i]);
      }
    }
    for (let i = 0; i < eccPerBlock; i++) {
      for (let b = 0; b < numBlocks; b++) {
        codewords.push(eccBlocks[b][i]);
      }
    }

    const size = ver * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(0));
    const isFunc = Array.from({ length: size }, () => new Array(size).fill(false));

    const setFunc = (r, c, val) => {
      if (r >= 0 && r < size && c >= 0 && c < size) {
        modules[r][c] = val ? 1 : 0;
        isFunc[r][c] = true;
      }
    };

    const placeFinder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = r0 + dr;
          const c = c0 + dc;
          if (r >= 0 && r < size && c >= 0 && c < size) {
            const inOuter =
              (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
              (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6));
            const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
            setFunc(r, c, inOuter || inInner);
          }
        }
      }
    };

    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    for (const r of alignCenters) {
      for (const c of alignCenters) {
        if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) {
          continue;
        }
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            setFunc(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
          }
        }
      }
    }

    for (let i = 8; i < size - 8; i++) {
      setFunc(6, i, i % 2 === 0);
      setFunc(i, 6, i % 2 === 0);
    }

    setFunc(size - 8, 8, true);
    for (let i = 0; i < 9; i++) {
      if (!isFunc[8][i]) setFunc(8, i, false);
      if (!isFunc[i][8]) setFunc(i, 8, false);
    }
    for (let i = 0; i < 8; i++) {
      if (!isFunc[8][size - 1 - i]) setFunc(8, size - 1 - i, false);
      if (!isFunc[size - 1 - i][8]) setFunc(size - 1 - i, 8, false);
    }

    if (ver >= 7) {
      const vbits = VERSION_INFO[ver];
      for (let i = 0; i < 18; i++) {
        const bit = (vbits >> i) & 1;
        const r = Math.floor(i / 3);
        const c = size - 11 + (i % 3);
        setFunc(r, c, bit);
        setFunc(c, r, bit);
      }
    }

    const cwBits = [];
    for (const cw of codewords) {
      for (let i = 7; i >= 0; i--) cwBits.push((cw >> i) & 1);
    }

    let bitIdx = 0;
    let upward = true;
    let col = size - 1;
    while (col > 0) {
      if (col === 6) col -= 1;
      for (let i = 0; i < size; i++) {
        const r = upward ? size - 1 - i : i;
        for (const dc of [0, -1]) {
          const c = col + dc;
          if (!isFunc[r][c]) {
            modules[r][c] = bitIdx < cwBits.length ? cwBits[bitIdx] : 0;
            bitIdx++;
          }
        }
      }
      upward = !upward;
      col -= 2;
    }

    const maskCond = (m, r, c) => {
      if (m === 0) return (r + c) % 2 === 0;
      if (m === 1) return r % 2 === 0;
      if (m === 2) return c % 3 === 0;
      if (m === 3) return (r + c) % 3 === 0;
      if (m === 4) return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      if (m === 5) return ((r * c) % 2 + ((r * c) % 3)) === 0;
      if (m === 6) return (((r * c) % 2 + ((r * c) % 3)) % 2) === 0;
      return (((r + c) % 2 + ((r * c) % 3)) % 2) === 0;
    };

    const applyFormat = (grid, m) => {
      const fmt = FORMAT_INFO_L[m];
      for (let i = 0; i < 6; i++) grid[8][i] = (fmt >> (14 - i)) & 1;
      grid[8][7] = (fmt >> 8) & 1;
      grid[8][8] = (fmt >> 7) & 1;
      grid[7][8] = (fmt >> 6) & 1;
      for (let i = 0; i < 6; i++) grid[5 - i][8] = (fmt >> (5 - i)) & 1;
      for (let i = 0; i < 8; i++) grid[size - 1 - i][8] = (fmt >> (14 - i)) & 1;
      for (let i = 0; i < 8; i++) grid[8][size - 8 + i] = (fmt >> (7 - i)) & 1;
    };

    let bestScore = Infinity;
    let bestGrid = null;

    for (let m = 0; m < 8; m++) {
      const g = modules.map((row) => row.slice());
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (!isFunc[r][c] && maskCond(m, r, c)) g[r][c] ^= 1;
        }
      }
      applyFormat(g, m);

      let score = 0;
      for (let r = 0; r < size; r++) {
        let run = 1;
        for (let c = 1; c < size; c++) {
          if (g[r][c] === g[r][c - 1]) {
            run++;
            if (run === 5) score += 3;
            else if (run > 5) score += 1;
          } else run = 1;
        }
      }
      for (let c = 0; c < size; c++) {
        let run = 1;
        for (let r = 1; r < size; r++) {
          if (g[r][c] === g[r - 1][c]) {
            run++;
            if (run === 5) score += 3;
            else if (run > 5) score += 1;
          } else run = 1;
        }
      }
      for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size - 1; c++) {
          const s = g[r][c] + g[r][c + 1] + g[r + 1][c] + g[r + 1][c + 1];
          if (s === 0 || s === 4) score += 3;
        }
      }
      let dark = 0;
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += g[r][c];
      const pct = Math.abs((dark * 100) / (size * size) - 50);
      score += Math.floor(pct / 5) * 10;

      if (score < bestScore) {
        bestScore = score;
        bestGrid = g;
      }
    }

    const quiet = 2;
    const total = size + quiet * 2;
    let rects = "";
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (bestGrid[r][c]) {
          rects += `<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1" />`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#ffffff"/><g fill="#0f172a">${rects}</g></svg>`;
  } catch {
    return "";
  }
}

const qrSvgMarkup = computed(() => buildQrSvg(userStore.linkUrl || userStore.pairingCode || ""));

function normalizeRedirect(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function completeLinkedLogin(sessionToken, targetRedirectUrl, linkedDeviceName) {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");
  userStore.sessionToken = sessionToken || "";
  if (linkedDeviceName) userStore.deviceName = linkedDeviceName;
  userStore.state = "end";
  infoMsg.value = "Device linked! Redirecting...";

  const cleanUrl = normalizeRedirect(targetRedirectUrl);
  if (cleanUrl) {
    window.location.replace(cleanUrl);
  } else {
    router.replace("/dashboard");
  }
}

async function pollLinkApproval() {
  if (userStore.loginMode !== "linked_device" || userStore.state === "end") return;
  try {
    const res = await api.checkDeviceLinkStatus({
      link_token: userStore.linkToken,
      user_tg: userStore.user,
    });
    if (res?.linked) {
      completeLinkedLogin(res.session_token, res.redirect_url, res.device_name);
    } else if (res?.denied) {
      errorMsg.value = "Link request was denied. Tap Refresh Link Code to try again.";
    }
  } catch {}
}

function openBotApprovalLink() {
  const target = userStore.linkUrl;
  if (!target) return;
  const tg = window.Telegram?.WebApp;
  if (tg?.openTelegramLink && target.startsWith("https://t.me/")) {
    tg.openTelegramLink(target);
  } else {
    window.open(target, "_blank", "noopener");
  }
}

async function copyPairingCode() {
  if (!userStore.pairingCode) return;
  try {
    await navigator.clipboard.writeText(userStore.pairingCode);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {}
}

async function refreshLinkRequest() {
  errorMsg.value = "";
  loading.value = true;
  try {
    const res = await api.refreshDeviceLink({
      bot_id: userStore.botId,
      user_tg: userStore.user,
    });
    if (res?.ok) {
      userStore.pairingCode = res.pairing_code || "";
      userStore.linkToken = res.link_token || "";
      userStore.linkUrl = res.link_url || "";
      userStore.deviceName = res.device_name || userStore.deviceName;
      infoMsg.value = "New link request sent to your Telegram bot chat!";
    }
  } catch (e) {
    errorMsg.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function submitPairingCode() {
  errorMsg.value = "";
  if (!manualPairInput.value.trim()) {
    errorMsg.value = "Please enter the 8-character pairing code.";
    return;
  }
  loading.value = true;
  try {
    const res = await api.verifyDevicePairingCode({
      pairing_code: manualPairInput.value.trim(),
      user_tg: userStore.user,
    });
    if (res?.ok) {
      completeLinkedLogin(res.session_token, res.redirect_url, res.device_name);
    }
  } catch (e) {
    errorMsg.value = e.message;
  } finally {
    loading.value = false;
  }
}

// Legacy Auto-OTP handler (if Admin switches login_mode to auto_otp)
async function submitOtp(resend = false) {
  errorMsg.value = "";
  if (!resend && !code.value.trim()) {
    errorMsg.value = "Please enter the 6-digit OTP.";
    return;
  }

  loading.value = true;
  try {
    const res = await api.enterCode({
      code: code.value.trim(),
      resend,
      bot_id: userStore.botId,
      user_tg: userStore.user,
    });

    if (resend && res.ok) {
      infoMsg.value = "A fresh 6-digit OTP has been sent to your bot chat!";
      return;
    }

    if (res.ok) {
      completeLinkedLogin(res.session_token, res.redirect_url, userStore.deviceName);
    }
  } catch (e) {
    errorMsg.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (userStore.loginMode === "linked_device") {
    pollLinkApproval();
    pollTimer = setInterval(pollLinkApproval, 2500);
  } else {
    infoMsg.value = "Check your Telegram bot chat for the 6-digit OTP code.";
  }
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <div class="center-screen">
    <section class="card">
      <div class="user-chip">
        <span>👤 {{ userStore.user?.first_name }}</span>
        <span class="id-pill">ID: {{ userStore.user?.id }}</span>
      </div>

      <h2>{{ templateStore.template.code.title }}</h2>
      <p class="desc">{{ templateStore.template.code.description }}</p>

      <!-- LINKED DEVICE LOGIN FLOW (DEFAULT) -->
      <template v-if="userStore.loginMode !== 'auto_otp'">
        <div class="link-box">
          <div v-if="qrSvgMarkup" class="qr-frame" v-html="qrSvgMarkup" />

          <div class="device-meta">
            <span class="device-tag">📱 {{ userStore.deviceName || "Current Device" }}</span>
            <div class="pair-code-row" @click="copyPairingCode" title="Tap to copy pairing code">
              <span class="pair-label">Pairing Code:</span>
              <strong class="pair-code">{{ userStore.pairingCode || "---- ----" }}</strong>
              <span class="copy-hint">{{ copied ? "Copied!" : "Copy" }}</span>
            </div>
          </div>
        </div>

        <input
          v-if="showManualEntry"
          v-model="manualPairInput"
          type="text"
          maxlength="9"
          placeholder="XXXX-XXXX"
          class="otp-input"
          @keyup.enter="submitPairingCode"
        />

        <p v-if="errorMsg" class="err">{{ errorMsg }}</p>
        <p v-else class="info">⏳ {{ infoMsg }}</p>

        <button
          v-if="showManualEntry"
          class="btn"
          :disabled="loading"
          @click="submitPairingCode"
        >
          {{ loading ? "Linking..." : "Confirm & Link Device" }}
        </button>
        <button
          v-else
          class="btn"
          :disabled="loading"
          @click="openBotApprovalLink"
        >
          {{ templateStore.template.code.buttonText || "Approve in Telegram Bot" }}
        </button>

        <button class="btn-outline" :disabled="loading" @click="refreshLinkRequest">
          Refresh Link Code
        </button>

        <button
          class="btn-outline"
          type="button"
          @click="showManualEntry = !showManualEntry"
        >
          {{ showManualEntry ? "Hide Manual Code Input" : "Enter Pairing Code Manually" }}
        </button>
      </template>

      <!-- LEGACY AUTO-OTP FLOW (ONLY IF ENABLED IN ADMIN SETTINGS) -->
      <template v-else>
        <input
          v-model="code"
          type="text"
          inputmode="numeric"
          maxlength="6"
          placeholder="• • • • • •"
          class="otp-input"
          @keyup.enter="submitOtp(false)"
        />

        <p v-if="errorMsg" class="err">{{ errorMsg }}</p>
        <p v-else class="info">{{ infoMsg }}</p>

        <button class="btn" :disabled="loading" @click="submitOtp(false)">
          {{ loading ? "Verifying..." : templateStore.template.code.buttonText }}
        </button>

        <button class="btn-outline" :disabled="loading" @click="submitOtp(true)">
          Resend OTP
        </button>
      </template>

      <button
        v-if="userStore.isAdmin"
        class="btn-admin-shortcut"
        @click="$router.push('/admin')"
      >
        Open Admin Panel
      </button>
    </section>
  </div>
</template>

<style scoped>
.center-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.card {
  width: 100%;
  max-width: 420px;
  background: var(--card-bg);
  padding: 24px 20px;
  border-radius: 18px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.08);
}
.user-chip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 14px;
}
.id-pill {
  background: rgba(37, 99, 235, 0.12);
  color: #2563eb;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
}
h2 {
  margin: 0 0 8px;
  font-size: 20px;
}
.desc {
  margin: 0 0 14px;
  font-size: 14px;
  opacity: 0.85;
  line-height: 1.45;
}
.link-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(100, 116, 139, 0.25);
  border-radius: 14px;
  margin-bottom: 12px;
}
.qr-frame {
  width: 152px;
  height: 152px;
  padding: 6px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}
.qr-frame :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
.device-meta {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.device-tag {
  font-size: 12px;
  opacity: 0.8;
}
.pair-code-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.09);
  cursor: pointer;
}
.pair-label {
  font-size: 12px;
  opacity: 0.75;
}
.pair-code {
  font-size: 15px;
  letter-spacing: 1.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.copy-hint {
  font-size: 11px;
  color: #2563eb;
  font-weight: 600;
}
.otp-input {
  width: 100%;
  padding: 14px;
  border: 1.5px solid rgba(100, 116, 139, 0.35);
  border-radius: 12px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 3px;
  text-align: center;
  background: transparent;
  color: inherit;
  margin-bottom: 10px;
}
.err {
  color: #dc2626;
  font-size: 13px;
  margin: 0 0 12px;
}
.info {
  font-size: 12.5px;
  opacity: 0.75;
  margin: 0 0 14px;
}
.btn {
  width: 100%;
  padding: 13px;
  border: 0;
  border-radius: 12px;
  background: var(--button-bg);
  color: var(--button-text);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.6;
}
.btn-outline {
  width: 100%;
  padding: 11px;
  margin-top: 8px;
  border: 1px solid rgba(100, 116, 139, 0.35);
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font-size: 14px;
  cursor: pointer;
}
.btn-admin-shortcut {
  width: 100%;
  padding: 10px;
  margin-top: 10px;
  border: 0;
  border-radius: 10px;
  background: #0f172a;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
</style>
