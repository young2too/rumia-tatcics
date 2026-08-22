// Tracks recent online visitors with a lightweight Supabase heartbeat.
const visitorStorageKey = "lumia-tactics-visitor-id";

function clampSeconds(value, fallback, min = 30) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(min, Math.round(seconds)) : fallback;
}

function getVisitorId() {
  try {
    const existing = localStorage.getItem(visitorStorageKey);
    if (existing) return existing;
    const next = crypto.randomUUID();
    localStorage.setItem(visitorStorageKey, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

export function createPresenceController({ refs, presenceConfig = {}, rankingConfig = {} }) {
  const globalConfig = window.LUMIA_TACTICS_CONFIG || {};
  const presenceNode = refs.onlinePresence || document.getElementById("onlinePresence");
  const table = presenceConfig.table || globalConfig.presence?.table || "online_presence";
  const heartbeatSeconds = clampSeconds(presenceConfig.heartbeatSeconds, 120);
  const onlineWindowSeconds = clampSeconds(presenceConfig.onlineWindowSeconds, 180);
  const refreshSeconds = clampSeconds(presenceConfig.refreshSeconds, Math.min(60, heartbeatSeconds), 15);
  const url = presenceConfig.url || rankingConfig.url || globalConfig.supabase?.url || "";
  const anonKey = presenceConfig.anonKey || rankingConfig.anonKey || globalConfig.supabase?.anonKey || "";
  const enabled = presenceConfig.enabled !== false && Boolean(url && anonKey && table && presenceNode);
  const visitorId = getVisitorId();
  let heartbeatTimer = 0;
  let refreshTimer = 0;
  let stopped = false;

  function endpoint(query = "") {
    return `${url.replace(/\/$/, "")}/rest/v1/${table}${query}`;
  }

  function headers(extra = {}) {
    return {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  function renderCount(count) {
    if (!presenceNode) return;
    if (!Number.isFinite(count)) {
      presenceNode.hidden = true;
      return;
    }
    presenceNode.hidden = false;
    presenceNode.textContent = `접속 ${Math.max(0, count)}명`;
    presenceNode.title = `최근 ${Math.round(onlineWindowSeconds / 60)}분 접속자`;
  }

  async function sendHeartbeat() {
    if (!enabled || stopped) return false;
    try {
      const response = await fetch(endpoint("?on_conflict=visitor_id"), {
        method: "POST",
        headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify({
          visitor_id: visitorId,
          page: "game",
          version: String(rankingConfig.majorVersion || window.LUMIA_TACTICS_CONFIG?.patchNotes?.version || ""),
          last_seen: new Date().toISOString(),
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function loadOnlineCount() {
    if (!enabled || stopped) return;
    const cutoff = new Date(Date.now() - onlineWindowSeconds * 1000).toISOString();
    try {
      const response = await fetch(endpoint(`?select=visitor_id&last_seen=gt.${encodeURIComponent(cutoff)}&limit=1`), {
        headers: headers({
          Prefer: "count=exact",
        }),
      });
      if (!response.ok) throw new Error(`presence count failed (${response.status})`);
      const range = response.headers.get("content-range") || "";
      const total = Number(range.split("/")[1]);
      if (Number.isFinite(total)) {
        renderCount(total);
        return;
      }
      const rows = await response.json();
      renderCount(Array.isArray(rows) ? rows.length : 0);
    } catch {
      renderCount(NaN);
    }
  }

  async function tick() {
    const sent = await sendHeartbeat();
    if (sent) await loadOnlineCount();
  }

  function start() {
    if (!enabled) return;
    stopped = false;
    presenceNode.hidden = false;
    presenceNode.textContent = "접속 확인";
    tick();
    heartbeatTimer = window.setInterval(sendHeartbeat, heartbeatSeconds * 1000);
    refreshTimer = window.setInterval(loadOnlineCount, refreshSeconds * 1000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", tick);
  }

  function stop() {
    stopped = true;
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    if (refreshTimer) window.clearInterval(refreshTimer);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("focus", tick);
  }

  function handleVisibilityChange() {
    if (!document.hidden) tick();
  }

  return {
    loadOnlineCount,
    sendHeartbeat,
    start,
    stop,
  };
}
