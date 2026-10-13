// Global chat: exchanges short-lived messages between currently connected players via Supabase Realtime Broadcast.
import { createClient } from "@supabase/supabase-js";

const nicknameStorageKey = "lumia-tactics-global-chat-nickname";
const senderStorageKey = "lumia-tactics-global-chat-sender";
const sessionMessagesStorageKey = "lumia-tactics-global-chat-session-messages";
const messageLimit = 60;
const historyLimit = 30;
const sendCooldownMs = 1200;

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

function loadSessionMessages() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(sessionMessagesStorageKey) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-messageLimit).map((message) => ({
      id: String(message?.id || ""),
      senderId: String(message?.senderId || ""),
      nickname: cleanNickname(message?.nickname) || "익명",
      text: String(message?.text || "").trim().slice(0, 120),
      sentAt: message?.sentAt || new Date().toISOString(),
    })).filter((message) => message.id && message.text);
  } catch {
    return [];
  }
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
  const messages = loadSessionMessages();
  const seenIds = new Set(messages.map((message) => message.id));

  function storeSessionMessages() {
    try { sessionStorage.setItem(sessionMessagesStorageKey, JSON.stringify(messages)); } catch { /* Browser storage can be unavailable. */ }
  }

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
    if (unreadNode) {
      unreadNode.hidden = unread <= 0;
      unreadNode.textContent = "!";
      unreadNode.title = `읽지 않은 광장 채팅 ${unread}개`;
    }
  }

  function setOpen(next) {
    opened = Boolean(next);
    panel.hidden = !opened;
    root.classList.toggle("open", opened);
    toggle.setAttribute("aria-expanded", String(opened));
    if (opened) {
      unread = 0;
      renderUnread();
      renderMessages();
      window.setTimeout(() => input.focus(), 0);
    }
  }

  function receive(raw, { historical = false, deferRender = false } = {}) {
    const message = raw?.payload || raw;
    const id = String(message?.id || "");
    const text = String(message?.text || "").trim().slice(0, 120);
    const messageNickname = cleanNickname(message?.nickname) || "익명";
    if (!id || !text || seenIds.has(id)) return;
    seenIds.add(id);
    messages.push({
      id,
      senderId: String(message.senderId || ""),
      nickname: messageNickname,
      text,
      sentAt: message.sentAt || new Date().toISOString(),
    });
    while (messages.length > messageLimit) {
      const removed = messages.shift();
      if (removed) seenIds.delete(removed.id);
    }
    storeSessionMessages();
    if (!historical && !opened && message.senderId !== senderId) {
      unread += 1;
      renderUnread();
    }
    if (opened && !deferRender) renderMessages();
  }

  async function requestRecentMessages() {
    if (!channel) return;
    await channel.send({
      type: "broadcast",
      event: "history-request",
      payload: { requesterId: senderId },
    });
  }

  function respondWithRecentMessages(raw) {
    const requesterId = String(raw?.payload?.requesterId || "");
    if (!requesterId || requesterId === senderId || !messages.length || !channel) return;
    window.setTimeout(() => {
      channel?.send({
        type: "broadcast",
        event: "history-response",
        payload: {
          requesterId,
          responderId: senderId,
          messages: messages.slice(-historyLimit),
        },
      });
    }, 120 + Math.floor(Math.random() * 280));
  }

  function receiveRecentMessages(raw) {
    const payload = raw?.payload || {};
    if (String(payload.requesterId || "") !== senderId || !Array.isArray(payload.messages)) return;
    for (const message of payload.messages.slice(-historyLimit)) {
      receive(message, { historical: true, deferRender: true });
    }
    messages.sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime());
    if (opened) renderMessages();
  }

  async function sendMessage() {
    const text = String(input.value || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!text || !connected || !channel) return;
    const now = Date.now();
    if (now - lastSentAt < sendCooldownMs) {
      setStatus("메시지는 잠시 간격을 두고 보내주세요.", "warning");
      return;
    }
    lastSentAt = now;
    input.disabled = true;
    const payload = {
      id: crypto.randomUUID(),
      senderId,
      nickname: nickname || "익명",
      text,
      sentAt: new Date(now).toISOString(),
    };
    try {
      const result = await channel.send({ type: "broadcast", event: "message", payload });
      if (result !== "ok") throw new Error(String(result || "send failed"));
      // Some Realtime deployments do not echo broadcasts back to the sender even with self enabled.
      // Add the acknowledged message locally; an eventual echo is ignored by its id.
      receive(payload);
      input.value = "";
      setStatus("현재 접속 중", "connected");
    } catch {
      setStatus("전송에 실패했습니다. 연결을 확인해주세요.", "error");
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  function bindEvents() {
    toggle.addEventListener("click", () => setOpen(!opened));
    close?.addEventListener("click", () => setOpen(false));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      sendMessage();
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
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 3 } },
    });
    channel = client.channel("lumia-global-chat", {
      config: { broadcast: { self: true, ack: true } },
    });
    channel
      .on("broadcast", { event: "message" }, receive)
      .on("broadcast", { event: "history-request" }, respondWithRecentMessages)
      .on("broadcast", { event: "history-response" }, receiveRecentMessages)
      .subscribe((status) => {
        connected = status === "SUBSCRIBED";
        input.disabled = !connected;
        setStatus(connected ? "현재 접속 중" : status === "CHANNEL_ERROR" ? "연결 실패" : "채팅 연결 중", connected ? "connected" : "connecting");
        if (connected) requestRecentMessages();
      });
  }

  async function stop() {
    connected = false;
    if (client && channel) await client.removeChannel(channel);
  }

  function setNickname(value) {
    nickname = cleanNickname(value) || fallbackNickname;
    if (nicknameInput) nicknameInput.value = nickname;
    try { localStorage.setItem(nicknameStorageKey, nickname); } catch { /* Browser storage can be unavailable. */ }
  }

  return { start, stop, setNickname };
}
