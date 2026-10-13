// PvP scouting panel: renders opponents' latest submitted board snapshots.
import {
  ensurePvpSession,
  getPvpRoomPlayers,
  getPvpSquadSnapshots,
} from "./api.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function friendlyError(error) {
  const message = String(error?.message || error || "PvP 정찰 정보를 불러오지 못했습니다.");
  if (/active human room membership|not.*member|0 rows/i.test(message)) return "이 PvP 방의 참가자만 정찰할 수 있습니다.";
  return message;
}

function latestSnapshots(rows) {
  const byPlayer = new Map();
  for (const snapshot of rows || []) {
    if (!byPlayer.has(snapshot.player_id)) byPlayer.set(snapshot.player_id, snapshot);
  }
  return byPlayer;
}

export function createPvpSocialPanel({ roomId, roster = [], getMode = () => "async", maxHealth = 100 }) {
  const root = document.querySelector("#pvpSocial");
  const panel = document.querySelector("#pvpSocialPanel");
  const body = document.querySelector("#pvpSocialBody");
  const title = document.querySelector("#pvpSocialTitle");
  const meta = document.querySelector("#pvpSocialMeta");
  const close = document.querySelector("#pvpSocialClose");
  const rosterByName = new Map(roster.map((unit) => [unit.name, unit]));
  const state = {
    user: null,
    players: [],
    snapshots: new Map(),
    open: false,
    selectedPlayerId: "",
    loading: false,
    error: "",
    timer: 0,
  };

  function displayArt(unit) {
    return unit?.art || rosterByName.get(unit?.name)?.art || "./assets/characters/000_Dr.Nadja.png";
  }

  function renderUnit(unit, bench = false) {
    if (!unit) return `<span class="pvp-scout-empty" aria-hidden="true"></span>`;
    const traits = Array.isArray(unit.traits) ? unit.traits.join(", ") : unit.trait || "";
    const stars = unit.fourStarAscended ? 4 : Math.max(1, Math.min(3, Number(unit.tier) || 1));
    return `
      <article class="pvp-scout-unit ${bench ? "bench" : ""}" title="${escapeHtml(`${unit.displayName || unit.name} · ${unit.tier || 1}성 · ${traits}`)}">
        <img src="${escapeHtml(displayArt(unit))}" alt="" />
        <strong>${escapeHtml(unit.displayName || unit.name)}</strong>
        <span>${"★".repeat(stars)}</span>
      </article>
    `;
  }

  function renderBoard(snapshot) {
    const slots = Array(32).fill(null);
    for (const unit of snapshot?.board || []) {
      const index = Math.max(0, Math.min(31, Number(unit.index) || 0));
      slots[index] = unit;
    }
    return `<div class="pvp-scout-board">${slots.map((unit) => renderUnit(unit)).join("")}</div>`;
  }

  function renderScout() {
    const opponents = state.players.filter((player) => player.user_id !== state.user?.id && player.status !== "left");
    const selected = opponents.find((player) => player.id === state.selectedPlayerId) || opponents[0] || null;
    if (selected && selected.id !== state.selectedPlayerId) state.selectedPlayerId = selected.id;
    const snapshot = selected ? state.snapshots.get(selected.id) : null;
    const realtime = getMode() === "realtime";
    title.textContent = "상대 정찰";
    meta.textContent = realtime ? "준비 시간 동안 상대의 현재 진영이 갱신됩니다." : "상대가 마지막으로 제출한 진영입니다.";

    if (state.error) {
      body.innerHTML = `<div class="pvp-social-empty">${escapeHtml(state.error)}</div>`;
      return;
    }
    if (!opponents.length) {
      body.innerHTML = `<div class="pvp-social-empty">정찰할 상대가 없습니다.</div>`;
      return;
    }

    const playerButtons = opponents.map((player) => {
      const health = Math.max(0, Number(player.health) || 0);
      const healthPercent = Math.max(0, Math.min(100, (health / Math.max(1, Number(maxHealth) || 100)) * 100));
      const playerSnapshot = state.snapshots.get(player.id);
      const hasIceShield = Boolean(
        playerSnapshot?.economy?.lumiIceShieldReady
        || playerSnapshot?.economy?.botLumiProducts?.includes?.("ice-shield"),
      );
      return `
      <button type="button" class="${player.id === selected?.id ? "active" : ""}" data-pvp-scout-player="${escapeHtml(player.id)}">
        <span class="pvp-scout-health ${hasIceShield ? "ice-shield" : ""}" style="--health-percent:${healthPercent}%" title="체력 ${health}${hasIceShield ? " · 얼음 방패 보유" : ""}">
          <b>${health}</b>
        </span>
        <strong>${escapeHtml(player.nickname)}</strong>
        <small>${player.is_bot ? "BOT" : realtime ? "배치 중" : player.ready ? "준비 완료" : "준비 중"}</small>
      </button>
    `;
    }).join("");
    const content = snapshot ? `
      <section class="pvp-scout-summary">
        <div><strong>${escapeHtml(selected.nickname)}</strong><span>체력 ${Number(selected.health)} · Lv.${Number(selected.level)} · ${Number(selected.credits)}크레딧</span></div>
        <small>${Number(snapshot.round)}라운드 ${realtime ? "현재 배치" : "제출 덱"}</small>
      </section>
      ${renderBoard(snapshot)}
      <section class="pvp-scout-section">
        <h3>벤치</h3>
        <div class="pvp-scout-bench">${(snapshot.bench || []).length ? snapshot.bench.map((unit) => renderUnit(unit, true)).join("") : `<span>비어 있음</span>`}</div>
      </section>
      <section class="pvp-scout-section">
        <h3>시너지</h3>
        <div class="pvp-scout-tags">${Object.entries(snapshot.traits || {}).length ? Object.entries(snapshot.traits || {}).map(([trait, count]) => `<span>${escapeHtml(trait)} <b>${Number(count)}</b></span>`).join("") : `<span>활성 시너지 없음</span>`}</div>
      </section>
      <section class="pvp-scout-section">
        <h3>증강</h3>
        <div class="pvp-scout-augments">${(snapshot.augments || []).length ? snapshot.augments.map((augment) => `<span class="${escapeHtml(augment.rarity || "silver")}">${escapeHtml(augment.name)}</span>`).join("") : `<span>선택한 증강 없음</span>`}</div>
      </section>
    ` : `<div class="pvp-social-empty"><strong>${escapeHtml(selected.nickname)}</strong><span>아직 덱을 제출하지 않았습니다.</span></div>`;
    body.innerHTML = `<nav class="pvp-scout-players">${playerButtons}</nav><div class="pvp-scout-content">${content}</div>`;
  }

  function render() {
    if (!root) return;
    root.hidden = false;
    panel.hidden = !state.open;
    root.classList.toggle("open", state.open);
    const button = root.querySelector("[data-pvp-social-tab=\"scout\"]");
    button?.classList.toggle("active", state.open);
    button?.setAttribute("aria-selected", String(state.open));
    if (!state.open) return;
    if (state.loading && !state.players.length) {
      body.innerHTML = `<div class="pvp-social-empty">불러오는 중입니다.</div>`;
      return;
    }
    renderScout();
  }

  async function refresh({ quiet = false } = {}) {
    if (!roomId || state.loading) return;
    state.loading = true;
    if (!quiet) render();
    try {
      state.user ||= await ensurePvpSession();
      const [players, snapshots] = await Promise.all([
        getPvpRoomPlayers(roomId),
        getPvpSquadSnapshots(roomId),
      ]);
      state.players = players;
      state.snapshots = latestSnapshots(snapshots);
      state.error = "";
    } catch (error) {
      state.error = friendlyError(error);
    } finally {
      state.loading = false;
      if (state.open || !quiet) render();
    }
  }

  function bindEvents() {
    root?.addEventListener("click", (event) => {
      if (event.target.closest("[data-pvp-social-tab=\"scout\"]")) {
        state.open = !state.open;
        render();
        if (state.open) refresh({ quiet: true });
        return;
      }
      const playerButton = event.target.closest("[data-pvp-scout-player]");
      if (playerButton) {
        state.selectedPlayerId = playerButton.dataset.pvpScoutPlayer || "";
        renderScout();
      }
    });
    close?.addEventListener("click", () => {
      state.open = false;
      render();
    });
  }

  function start() {
    if (!root || !roomId) return;
    bindEvents();
    render();
    refresh();
    let slowTicks = 0;
    state.timer = window.setInterval(() => {
      if (document.hidden) return;
      slowTicks += 1;
      if (getMode() === "realtime" || slowTicks % 5 === 0) refresh({ quiet: true });
    }, 1000);
    window.addEventListener("beforeunload", () => window.clearInterval(state.timer), { once: true });
  }

  return { start, refresh };
}
