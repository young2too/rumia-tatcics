// PvP notification controller: tracks actionable games and manages web-push subscriptions.
import { listJoinedPvpRooms, removePvpPushSubscription, savePvpPushSubscription } from "./api.js";

const notificationStateKey = "lumia-tactics-pvp-notification-state";

function decodeApplicationServerKey(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function roomAttention(room) {
  if (!room || room.status !== "running") return null;
  if (room.mode === "realtime") return null;
  const round = Math.max(0, Number(room.current_round) || 0);
  if (room.phase === "pve") {
    return {
      key: `${room.id}:pve:${round}`,
      title: "비실시간 PvP 매칭 완료",
      body: `${room.name || "PvP 게임"}에서 초기 덱을 준비해 주세요.`,
    };
  }
  if (room.phase === "planning" && !room.membership?.ready) {
    return {
      key: `${room.id}:planning:${round}`,
      title: "PvP 진행 필요",
      body: `${room.name || "PvP 게임"} ${round}라운드 덱을 정비하고 제출해 주세요.`,
    };
  }
  return null;
}

function readNotifiedKeys() {
  try {
    return JSON.parse(localStorage.getItem(notificationStateKey) || "{}") || {};
  } catch {
    return {};
  }
}

function writeNotifiedKeys(value) {
  try {
    localStorage.setItem(notificationStateKey, JSON.stringify(value));
  } catch {
    // Notifications still work for the current page when storage is unavailable.
  }
}

function showToast({ title, body, url }) {
  let root = document.querySelector("#pvpNotificationToasts");
  if (!root) {
    root = document.createElement("div");
    root.id = "pvpNotificationToasts";
    root.className = "pvp-notification-toasts";
    root.setAttribute("aria-live", "polite");
    document.body.append(root);
  }
  const toast = document.createElement("a");
  toast.className = "pvp-notification-toast";
  toast.href = url;
  toast.innerHTML = `<strong></strong><span></span>`;
  toast.querySelector("strong").textContent = title;
  toast.querySelector("span").textContent = body;
  root.append(toast);
  window.setTimeout(() => toast.classList.add("visible"), 20);
  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => toast.remove(), 180);
  }, 7000);
}

export function createPvpNotificationController({
  config = {},
  button = null,
  onAttentionChange = () => {},
} = {}) {
  let registration = null;
  let timer = 0;
  let checking = false;
  let started = false;
  const originalTitle = document.title.replace(/^\(\d+\)\s*/, "");

  function needsIosHomeScreen() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches
      || navigator.standalone === true;
    return ios && !standalone;
  }

  function supported() {
    return config.enabled !== false
      && "serviceWorker" in navigator
      && "Notification" in window
      && "PushManager" in window;
  }

  async function ensureRegistration() {
    if (!supported()) return null;
    registration ||= await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return registration;
  }

  async function currentSubscription() {
    const worker = await ensureRegistration();
    return worker?.pushManager.getSubscription() || null;
  }

  async function updateButton() {
    if (!button) return;
    if (needsIosHomeScreen()) {
      button.hidden = false;
      button.classList.remove("active");
      button.textContent = "홈 화면 추가 후 알림";
      button.title = "아이폰에서는 홈 화면에 추가한 뒤 알림을 켤 수 있습니다.";
      return;
    }
    if (!supported()) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    const subscription = Notification.permission === "granted" ? await currentSubscription().catch(() => null) : null;
    button.classList.toggle("active", Boolean(subscription));
    button.textContent = Notification.permission === "denied"
      ? "알림 차단됨"
      : subscription ? "알림 켜짐" : "알림 받기";
    button.title = subscription ? "PvP 푸시 알림 끄기" : "매칭 완료, 전원 준비, 진행 필요 알림 받기";
  }

  async function toggle() {
    if (needsIosHomeScreen()) {
      showToast({
        title: "아이폰 알림 설정",
        body: "공유 메뉴에서 홈 화면에 추가한 뒤 루미아 택틱스를 다시 열어주세요.",
        url: "./pvp.html",
      });
      return;
    }
    if (!supported()) return;
    const existing = await currentSubscription();
    if (existing) {
      await removePvpPushSubscription(existing.endpoint).catch(() => {});
      await existing.unsubscribe();
      await updateButton();
      showToast({ title: "PvP 알림 꺼짐", body: "이 기기로 푸시 알림을 보내지 않습니다.", url: "./pvp.html?tab=joined" });
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      await updateButton();
      return;
    }
    const worker = await ensureRegistration();
    const subscription = await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeApplicationServerKey(String(config.vapidPublicKey || "")),
    });
    try {
      await savePvpPushSubscription(subscription);
    } catch (error) {
      await subscription.unsubscribe().catch(() => {});
      throw error;
    }
    await updateButton();
    showToast({ title: "PvP 알림 켜짐", body: "매칭 완료, 실시간 방 전원 준비, 진행 필요 상태를 이 기기로 알려드립니다.", url: "./pvp.html?tab=joined" });
  }

  async function notifyAttention(attention, room) {
    const url = `./index.html?pvpRoom=${encodeURIComponent(room.id)}`;
    showToast({ ...attention, url });
    if (Notification.permission !== "granted") return;
    const worker = await ensureRegistration().catch(() => null);
    await worker?.showNotification(attention.title, {
      body: attention.body,
      icon: "/assets/characters/000_Dr.Nadja.png",
      badge: "/assets/characters/000_Dr.Nadja.png",
      tag: attention.key,
      data: { url },
    });
  }

  async function checkNow({ quiet = false } = {}) {
    if (checking) return [];
    checking = true;
    try {
      const rooms = await listJoinedPvpRooms();
      const actionable = rooms.map((room) => ({ room, attention: roomAttention(room) })).filter((entry) => entry.attention);
      onAttentionChange({ count: actionable.length, rooms, actionable });
      document.title = actionable.length ? `(${actionable.length}) ${originalTitle}` : originalTitle;
      if (!quiet) {
        const notified = readNotifiedKeys();
        for (const { room, attention } of actionable) {
          if (notified[room.id] === attention.key) continue;
          notified[room.id] = attention.key;
          await notifyAttention(attention, room);
        }
        writeNotifiedKeys(notified);
      }
      return rooms;
    } catch {
      return [];
    } finally {
      checking = false;
    }
  }

  async function start() {
    if (started) return;
    started = true;
    button?.addEventListener("click", () => toggle().catch(() => updateButton()));
    await ensureRegistration().catch(() => null);
    await updateButton();
    await checkNow();
    timer = window.setInterval(() => checkNow(), Math.max(10, Number(config.pollSeconds) || 30) * 1000);
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    timer = 0;
  }

  return { checkNow, start, stop, toggle };
}
