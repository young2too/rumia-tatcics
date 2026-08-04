import { pvpPendingSquadStorageKey, pvpRoomsConfig, pvpRoomsStorageKey } from "../core/data.js";
import { createPvpMatchSeed } from "../core/rng.js";

const state = {
  rooms: Array.isArray(pvpRoomsConfig.rooms) ? pvpRoomsConfig.rooms.map((room) => ({ ...room })) : [],
  pendingSquad: null,
  loading: true,
  error: "",
};
const debugMode = ["127.0.0.1", "localhost", "::1"].includes(location.hostname);

const refs = {
  refresh: document.querySelector("#refreshPvpRooms"),
  rulesToggle: document.querySelector("#pvpRulesToggle"),
  rulesPanel: document.querySelector("#pvpRulesPanel"),
  status: document.querySelector("#pvpRoomsStatus"),
  panel: document.querySelector("#pvpRoomsPanel"),
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function statusLabel(status) {
  return {
    waiting: "모집 중",
    preparing: "준비 중",
    locked: "잠김",
    running: "진행 중",
    finished: "종료",
  }[status] || "대기";
}

function seedRooms() {
  return (pvpRoomsConfig.rooms || []).map((room) => ({ ...room }));
}

function loadLocalRooms() {
  try {
    const parsed = JSON.parse(localStorage.getItem(pvpRoomsStorageKey) || "null");
    return Array.isArray(parsed) ? parsed : seedRooms();
  } catch {
    return seedRooms();
  }
}

function loadPendingSquad() {
  try {
    const parsed = JSON.parse(localStorage.getItem(pvpPendingSquadStorageKey) || "null");
    if (!parsed || !Array.isArray(parsed.board)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function renderSquadUnits(units = []) {
  return units.length
    ? units.map((unit) => `
      <span class="pvp-squad-unit" style="--accent: ${escapeHtml(unit.color || "#6aa9ff")}" title="${escapeHtml(unit.displayName || unit.name || "유닛")}">
        ${unit.art ? `<img src="${escapeHtml(unit.art)}" alt="">` : escapeHtml((unit.displayName || unit.name || "?").slice(0, 1))}
        <i>${"★".repeat(Math.max(1, Math.min(3, Number(unit.tier) || 1)))}</i>
      </span>
    `).join("")
    : `<span class="pvp-squad-empty">등록 가능한 보드 기물이 없습니다.</span>`;
}

function renderPendingSquad() {
  const squad = state.pendingSquad;
  if (!squad) {
    return `
      <section class="pvp-pending-squad empty">
        <div>
          <strong>등록 후보 덱 없음</strong>
          <p>PvE에서 15라 보스를 클리어하면 현재 덱을 PvP 참가 후보로 가져올 수 있습니다.</p>
        </div>
        <a href="./index.html">PvE 진행하기</a>
      </section>
    `;
  }
  const savedAt = squad.savedAt ? new Date(squad.savedAt).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }) : "";
  return `
    <section class="pvp-pending-squad">
      <header>
        <div>
          <span>현재 PvP 등록 후보 덱</span>
          <strong>${Number(squad.stage) || 15}라 클리어 · 레벨 ${Number(squad.level) || 1} · ${Number(squad.gold) || 0}크레딧</strong>
        </div>
        <em>${escapeHtml(savedAt)}</em>
      </header>
      ${debugMode ? `<dl class="pvp-seed-meta">
        <div>
          <dt>스냅샷</dt>
          <dd>${escapeHtml(shortId(squad.snapshotId || squad.lineupHash || "local"))}</dd>
        </div>
        <div>
          <dt>라인업</dt>
          <dd>${escapeHtml(shortId(squad.lineupHash || "pending"))}</dd>
        </div>
      </dl>` : ""}
      <div class="pvp-squad-board">${renderSquadUnits(squad.board)}</div>
      ${squad.bench?.length ? `<div class="pvp-squad-bench"><span>벤치</span>${renderSquadUnits(squad.bench)}</div>` : ""}
      <div class="pvp-squad-actions">
        <button type="button" disabled>이 덱으로 방 참가 준비 중</button>
        <small>다음 단계에서 방 선택 후 이 스냅샷을 등록합니다.</small>
      </div>
    </section>
  `;
}

function shortId(value) {
  return String(value || "").replace(/^.+:/, "").slice(0, 8) || "-";
}

function renderRoomCard(room) {
  const locked = ["locked", "running", "finished"].includes(room.status);
  const playerText = `${room.players || 0}/${room.maxPlayers || 8}`;
  const seedPreview = createPvpMatchSeed({
    roomId: room.id,
    pvpRound: Math.max(1, Number(room.round) || 1),
    pairIndex: 0,
    homeSnapshotId: state.pendingSquad?.snapshotId || "pending-home",
    awaySnapshotId: `${room.id}-sample-away`,
  });
  return `
    <article class="pvp-room-card ${locked ? "locked" : ""}">
      <div>
        <strong>${escapeHtml(room.name || "이름 없는 방")}</strong>
        <span>${escapeHtml(statusLabel(room.status))} · 참가자 ${escapeHtml(playerText)} · PvP ${Number(room.round) || 0}라운드</span>
      </div>
      <p>${escapeHtml(room.description || "15라 보스 클리어 후 덱을 등록하고 준비를 누르는 비동기 PvP 방입니다.")}</p>
      ${debugMode ? `<small class="pvp-room-seed">seed ${escapeHtml(shortId(seedPreview))}</small>` : ""}
      <button type="button" disabled>${locked ? "참가 불가" : "참가 준비 중"}</button>
    </article>
  `;
}

function render() {
  refs.refresh.disabled = state.loading;
  refs.status.className = `statistics-status ${state.error ? "error" : state.loading ? "loading" : "ready"}`;
  refs.status.textContent = state.error || (state.loading ? "방 목록을 불러오는 중입니다." : `로컬 PvP 방 ${state.rooms.length}개`);
  refs.panel.innerHTML = `
    ${renderPendingSquad()}
    <div class="pvp-rooms-list page-list">
      ${state.rooms.length
        ? state.rooms.map(renderRoomCard).join("")
        : `<div class="pvp-rooms-empty">열린 PvP 방이 없습니다.</div>`}
    </div>
    <div class="pvp-rooms-note">
      지금은 로컬 UI 초안입니다. 다음 단계에서 방 생성, 15라 덱 등록, 준비 상태 저장을 연결합니다.
    </div>
  `;
}

function loadRooms() {
  state.loading = true;
  state.error = "";
  state.pendingSquad = loadPendingSquad();
  render();
  try {
    state.rooms = loadLocalRooms();
  } catch {
    state.rooms = seedRooms();
    state.error = "방 목록을 불러오지 못해 샘플 목록을 표시합니다.";
  } finally {
    state.loading = false;
    render();
  }
}

refs.refresh.addEventListener("click", loadRooms);
refs.rulesToggle.addEventListener("click", () => {
  const open = refs.rulesPanel.hidden;
  refs.rulesPanel.hidden = !open;
  refs.rulesToggle.classList.toggle("active", open);
  refs.rulesToggle.textContent = open ? "규칙서 닫기" : "규칙서";
});
loadRooms();
