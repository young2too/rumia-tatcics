// Global chat: stores short-lived messages and receives new ones through Supabase Postgres Realtime.
import { getSharedSupabaseClient } from "../core/supabase.js";

const nicknameStorageKey = "lumia-tactics-global-chat-nickname";
const senderStorageKey = "lumia-tactics-global-chat-sender";
const lastReadStorageKey = "lumia-tactics-global-chat-last-read-at";
const tableName = "global_chat_messages";
const messageLimit = 60;
const historyLimit = 30;
const retentionMs = 10 * 60 * 1000;
const sendCooldownMs = 1200;
const recoveryRefreshMs = 10000;
const localHostnames = new Set(["127.0.0.1", "localhost", "::1"]);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function storageValue(storage, key, fallback) {
  try {
    const value = storage.getItem(key);
    if (value) return value;
    storage.setItem(key, fallback);
    return fallback;
  } catch {
    return fallback;
  }
}

function cleanNickname(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 12);
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function normalizeMessage(row) {
  return {
    id: String(row?.id || ""),
    senderId: String(row?.sender_id || row?.senderId || ""),
    nickname: cleanNickname(row?.nickname) || "익명",
    text: String(row?.body || row?.text || "").trim().slice(0, 120),
    sentAt: row?.created_at || row?.sentAt || new Date().toISOString(),
  };
}

export function createGlobalChat({ presenceConfig = {}, rankingConfig = {} } = {}) {
  const root = document.querySelector("#globalChat");
  const toggle = document.querySelector("#globalChatToggle");
  const unreadNode = document.querySelector("#globalChatUnread");
  const panel = document.querySelector("#globalChatPanel");
  const close = document.querySelector("#globalChatClose");
  const messagesNode = document.querySelector("#globalChatMessages");
  const form = document.querySelector("#globalChatForm");
  const input = document.querySelector("#globalChatInput");
  const nicknameInput = document.querySelector("#globalChatNickname");
  const statusNode = document.querySelector("#globalChatStatus");
  const url = String(presenceConfig.url || rankingConfig.url || "").trim();
  const anonKey = String(presenceConfig.anonKey || rankingConfig.anonKey || "").trim();
  const localChat = localHostnames.has(location.hostname);
  const environment = localChat ? "local" : "production";
  const enabled = Boolean(root && toggle && panel && messagesNode && form && input && nicknameInput && url && anonKey);
  const senderId = storageValue(sessionStorage, senderStorageKey, crypto.randomUUID());
  const fallbackNickname = `생존자 ${Math.floor(1000 + Math.random() * 9000)}`;
  let nickname = cleanNickname(storageValue(localStorage, nicknameStorageKey, fallbackNickname));
  let client = null;
  let channel = null;
  let connected = false;
  let opened = false;
  let unread = 0;
  let lastSentAt = 0;
  let recoveryTimer = 0;
  let reconnectTimer = 0;
  let reconnecting = false;
  let stopped = false;
  let historyLoaded = false;
  let lastReadAt = Number(storageValue(localStorage, lastReadStorageKey, String(Date.now()))) || Date.now();
  const messages = [];
  const seenIds = new Set();

  function setStatus(text, state = "") {
    if (!statusNode) return;
    statusNode.textContent = text;
    statusNode.dataset.state = state;
  }

  function renderMessages() {
    if (!messages.length) {
      messagesNode.innerHTML = `<div class="global-chat-empty"><strong>현재 접속자에게 말을 걸어보세요.</strong></div>`;
      return;
    }
    messagesNode.innerHTML = messages.map((message) => `
      <article class="${message.senderId === senderId ? "mine" : ""}">
        <header><strong>${escapeHtml(message.nickname)}</strong><time>${escapeHtml(formatTime(message.sentAt))}</time></header>
        <p>${escapeHtml(message.text)}</p>
      </article>
    `).join("");
    messagesNode.scrollTop = messagesNode.scrollHeight;
  }

  function renderUnread() {
    toggle.classList.toggle("has-unread", unread > 0);
    if (!unreadNode) return;
    unreadNode.hidden = unread <= 0;
    unreadNode.textContent = "!";
    unreadNode.title = `읽지 않은 광장 채팅 ${unread}개`;
  }

  function markRead(at = Date.now()) {
    lastReadAt = Math.max(lastReadAt, Number(at) || Date.now());
    try { localStorage.setItem(lastReadStorageKey, String(lastReadAt)); } catch { /* Browser storage can be unavailable. */ }
  }

  function isActivelyReading() {
    return opened && document.visibilityState === "visible" && document.hasFocus();
  }

  function setOpen(next) {
    opened = Boolean(next);
    panel.hidden = !opened;
    root.classList.toggle("open", opened);
    toggle.setAttribute("aria-expanded", String(opened));
    if (!opened) return;
    unread = 0;
    markRead();
    renderUnread();
    renderMessages();
    void loadRecentMessages();
    window.setTimeout(() => input.focus(), 0);
  }

  function receive(row, { historical = false, deferRender = false } = {}) {
    const message = normalizeMessage(row);
    if (!message.id || !message.text || seenIds.has(message.id)) return;
    seenIds.add(message.id);
    messages.push(message);
    messages.sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime());
    while (messages.length > messageLimit) {
      const removed = messages.shift();
      if (removed) seenIds.delete(removed.id);
    }

    const sentAt = new Date(message.sentAt).getTime();
    if (message.senderId !== senderId) {
      if (isActivelyReading()) {
        markRead(sentAt);
      } else if (!historical || sentAt > lastReadAt) {
        unread += 1;
        renderUnread();
      }
      const latencyMs = Date.now() - sentAt;
      if (localChat && historyLoaded && Number.isFinite(latencyMs) && latencyMs >= 0 && latencyMs < 60000) {
        const latencyLabel = latencyMs < 1000 ? `${latencyMs}ms` : `${(latencyMs / 1000).toFixed(1)}초`;
        setStatus(`현재 접속 중 · ${historical ? "복구" : "실시간"} ${latencyLabel}`, historical ? "warning" : "connected");
      }
    }
    if (opened && !deferRender) renderMessages();
  }

  async function loadRecentMessages() {
    if (!client) return;
    const cutoff = new Date(Date.now() - retentionMs).toISOString();
    const { data, error } = await client
      .from(tableName)
      .select("id, sender_id, nickname, body, created_at")
      .eq("environment", environment)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(historyLimit);
    if (error) {
      setStatus("채팅 DB 설정 필요", "error");
      return;
    }
    for (const row of [...(data || [])].reverse()) receive(row, { historical: true, deferRender: true });
    historyLoaded = true;
    if (opened) renderMessages();
  }

  function scheduleReconnect(delay = 800) {
    if (stopped || reconnecting || reconnectTimer) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = 0;
      void reconnectChannel();
    }, delay);
  }

  function subscribeChannel() {
    channel = client
      .channel(`lumia-global-chat-db-${environment}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: tableName,
        filter: `environment=eq.${environment}`,
      }, (payload) => receive(payload.new))
      .subscribe((status) => {
        connected = status === "SUBSCRIBED";
        input.disabled = !connected;
        setStatus(connected ? "현재 접속 중" : status === "CHANNEL_ERROR" ? "연결 실패" : "채팅 연결 중", connected ? "connected" : "connecting");
        if (connected) void loadRecentMessages();
        else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) scheduleReconnect();
      });
  }

  async function reconnectChannel() {
    if (stopped || reconnecting || !client) return;
    reconnecting = true;
    connected = false;
    input.disabled = true;
    setStatus("채팅 재연결 중", "connecting");
    const previousChannel = channel;
    channel = null;
    try {
      if (previousChannel) await client.removeChannel(previousChannel);
      if (!stopped) subscribeChannel();
    } finally {
      reconnecting = false;
    }
  }

  async function sendMessage() {
    const text = String(input.value || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!text || !connected || !client) return;
    const now = Date.now();
    if (now - lastSentAt < sendCooldownMs) {
      setStatus("메시지는 잠시 간격을 두고 보내주세요.", "warning");
      return;
    }
    lastSentAt = now;
    input.disabled = true;
    const row = {
      id: crypto.randomUUID(),
      environment,
      sender_id: senderId,
      nickname: nickname || "익명",
      body: text,
      created_at: new Date(now).toISOString(),
    };
    try {
      const { error } = await client.from(tableName).insert(row);
      if (error) throw error;
      receive(row);
      input.value = "";
      setStatus("현재 접속 중", "connected");
    } catch {
      setStatus("전송에 실패했습니다. DB 설정을 확인해주세요.", "error");
    } finally {
      input.disabled = !connected;
      input.focus();
    }
  }

  function refreshWhenVisible() {
    if (document.visibilityState !== "visible") return;
    if (connected) void loadRecentMessages();
    else scheduleReconnect(0);
  }

  function bindEvents() {
    toggle.addEventListener("click", () => setOpen(!opened));
    close?.addEventListener("click", () => setOpen(false));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void sendMessage();
    });
    nicknameInput.addEventListener("input", () => {
      nickname = cleanNickname(nicknameInput.value) || fallbackNickname;
    });
    nicknameInput.addEventListener("change", () => {
      nickname = cleanNickname(nicknameInput.value) || fallbackNickname;
      nicknameInput.value = nickname;
      try { localStorage.setItem(nicknameStorageKey, nickname); } catch { /* Browser storage can be unavailable. */ }
    });
  }

  function start() {
    if (!enabled) {
      root?.setAttribute("hidden", "");
      return;
    }
    root.hidden = false;
    nicknameInput.value = nickname;
    bindEvents();
    renderMessages();
    renderUnread();
    setStatus("채팅 연결 중", "connecting");
    client = getSharedSupabaseClient(url, anonKey);
    subscribeChannel();
    recoveryTimer = window.setInterval(refreshWhenVisible, recoveryRefreshMs);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("online", refreshWhenVisible);
    window.addEventListener("pageshow", refreshWhenVisible);
  }

  async function stop() {
    stopped = true;
    connected = false;
    window.clearInterval(recoveryTimer);
    window.clearTimeout(reconnectTimer);
    recoveryTimer = 0;
    reconnectTimer = 0;
    document.removeEventListener("visibilitychange", refreshWhenVisible);
    window.removeEventListener("online", refreshWhenVisible);
    window.removeEventListener("pageshow", refreshWhenVisible);
    if (client && channel) await client.removeChannel(channel);
  }

  function setNickname(value) {
    nickname = cleanNickname(value) || fallbackNickname;
    if (nicknameInput) nicknameInput.value = nickname;
    try { localStorage.setItem(nicknameStorageKey, nickname); } catch { /* Browser storage can be unavailable. */ }
  }

  return { start, stop, setNickname };
}
