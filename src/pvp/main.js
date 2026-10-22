// Renders the PvP lobby and connects room creation/join flows to Supabase RPCs.
import { gameSaveStorageKey, presenceConfig, pushConfig, rankingConfig } from "../core/data.js";
import { createGlobalChat } from "../ui/globalChat.js";
import { createPvpNotificationController } from "./notifications.js";
import {
  cancelAsyncPvpMatch,
  createPvpRoom,
  ensurePvpSession,
  fillAsyncPvpQueueWithTestBots,
  getJoinedPvpRoomByCode,
  joinPvpRoom,
  listOwnAsyncMatchQueue,
  listJoinedPvpRooms,
  listPvpRooms,
  pvpBackendAvailable,
  reserveAsyncPvpMatch,
} from "./api.js";

const nicknameStorageKey = "lumia-tactics-pvp-nickname";
const pageNotice = new URLSearchParams(location.search).get("notice") === "membership"
  ? "현재 브라우저의 참가 정보가 없는 방입니다. 참가 중인 게임은 내 게임 탭에서 입장해주세요."
  : "";
const state = {
  rooms: [],
  joinedRooms: [],
  queueEntries: [],
  activeRoomTab: new URLSearchParams(location.search).get("tab") === "joined" ? "joined" : "recruiting",
  attentionCount: 0,
  user: null,
  loading: true,
  error: "",
  notice: pageNotice,
};
const debugMode = ["127.0.0.1", "localhost", "::1"].includes(location.hostname);

const refs = {
  refresh: document.querySelector("#refreshPvpRooms"),
  rulesToggle: document.querySelector("#pvpRulesToggle"),
  rulesPanel: document.querySelector("#pvpRulesPanel"),
  status: document.querySelector("#pvpRoomsStatus"),
  panel: document.querySelector("#pvpRoomsPanel"),
  createButton: document.querySelector("#createPvpRoomButton"),
  asyncButton: document.querySelector("#startAsyncMatchButton"),
  joinButton: document.querySelector("#joinPvpRoomButton"),
  createModal: document.querySelector("#pvpCreateModal"),
  asyncModal: document.querySelector("#pvpAsyncModal"),
  joinModal: document.querySelector("#pvpJoinModal"),
  createForm: document.querySelector("#pvpCreateForm"),
  asyncForm: document.querySelector("#pvpAsyncForm"),
  joinForm: document.querySelector("#pvpJoinForm"),
  createError: document.querySelector("#pvpCreateError"),
  asyncError: document.querySelector("#pvpAsyncError"),
  joinError: document.querySelector("#pvpJoinError"),
  notificationsToggle: document.querySelector("#pvpNotificationsToggle"),
};
const globalChat = createGlobalChat({ presenceConfig, rankingConfig });
const pvpNotifications = createPvpNotificationController({
  config: pushConfig,
  button: refs.notificationsToggle,
  onAttentionChange: ({ count }) => {
    if (state.attentionCount === count) return;
    state.attentionCount = count;
    render();
  },
});

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
    running: "진행 중",
    finished: "종료",
    abandoned: "중단",
  }[status] || "대기";
}

function modeLabel(mode) {
  return mode === "realtime" ? "실시간" : "비실시간";
}

function timingLabel(room) {
  if (room.mode === "realtime") return `준비 ${Number(room.planningSeconds) || 30}초`;
  const minutes = Number(room.asyncTurnMinutes) || 720;
  return `턴 ${minutes >= 60 ? `${minutes / 60}시간` : `${minutes}분`}`;
}

function roomDestination(room) {
  const inLobby = room.status === "waiting" && room.phase === "lobby";
  return inLobby
    ? `./pvp-room.html?room=${encodeURIComponent(room.id)}`
    : `./index.html?pvpRoom=${encodeURIComponent(room.id)}`;
}

function joinedRoomLocalProgress(room) {
  try {
    const saved = JSON.parse(localStorage.getItem(`${gameSaveStorageKey}:pvp:${room.id}`) || "null");
    return saved?.data || null;
  } catch {
    return null;
  }
}

function pendingAugmentStage(room, progress) {
  if (!progress) return 0;
  let stage = 0;
  if (room.phase === "pve" && (Number(room.round) >= 5 || Number(progress.round) >= 5)) stage = 1;
  if (room.phase === "planning" && Number(room.round) === 11) stage = 2;
  if (room.phase === "planning" && Number(room.round) === 21) stage = 3;
  if (!stage) return 0;
  const selectedStages = new Set((progress.selectedAugments || []).map((augment) => Number(augment.stage)));
  return selectedStages.has(stage) ? 0 : stage;
}

function joinedRoomActivity(room) {
  if (room.status === "waiting" && room.phase === "lobby") return { label: "참가자 대기 중", kind: "waiting" };
  if (room.status === "finished" || room.phase === "finished") return { label: "게임 종료", kind: "finished" };
  const progress = joinedRoomLocalProgress(room);
  const augmentStage = pendingAugmentStage(room, progress);
  if (augmentStage || progress?.pendingAugmentTarget) {
    return { label: augmentStage ? `${augmentStage}단계 증강 선택 중` : "증강 대상 선택 중", kind: "augment" };
  }
  const activeLumiShopRound = Number(progress?.lumiShopRound) || 0;
  const isCurrentLumiShop = room.phase === "planning"
    && Number(room.round) === activeLumiShopRound + 1
    && !room.membership?.ready;
  if (progress && progress.lumiShopResolved === false && activeLumiShopRound > 0 && isCurrentLumiShop) {
    return { label: "루미 상점 선택 중", kind: "lumi-shop" };
  }
  if (room.phase === "pve") return { label: "PvE 진행 중", kind: "running" };
  if (room.phase === "planning") {
    if (room.mode === "realtime") return { label: "정비 중", kind: "running" };
    return room.membership?.ready
      ? { label: "상대 덱 제출 대기 중", kind: "running" }
      : { label: "덱 제출 필요", kind: "action-required" };
  }
  if (room.phase === "locked") return { label: "덱 제출 완료", kind: "running" };
  if (room.phase === "combat") return { label: "전투 진행 중", kind: "running" };
  if (room.phase === "result") return { label: "전투 결과 처리 중", kind: "running" };
  return { label: statusLabel(room.status), kind: "running" };
}

function joinedRoomVisualState(room, activity) {
  if (room.mode === "realtime") return "realtime";
  return activity.kind;
}

function roomFromRow(row) {
  return {
    id: row.room_id,
    code: row.room_code,
    name: row.room_name,
    mode: row.mode,
    status: row.status,
    players: Number(row.player_count) || 0,
    maxPlayers: Number(row.max_players) || 8,
    round: Number(row.current_round) || 0,
    asyncTurnMinutes: row.async_turn_minutes == null ? null : Number(row.async_turn_minutes),
    planningSeconds: row.planning_seconds == null ? null : Number(row.planning_seconds),
    gameVersion: row.game_version || "",
  };
}

function joinedRoomFromRow(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    mode: row.mode,
    status: row.status,
    phase: row.phase,
    players: Number(row.player_count) || 0,
    maxPlayers: Number(row.max_players) || 8,
    round: Number(row.current_round) || 0,
    asyncTurnMinutes: row.async_turn_minutes == null ? null : Number(row.async_turn_minutes),
    planningSeconds: row.planning_seconds == null ? null : Number(row.planning_seconds),
    gameVersion: row.game_version || "",
    membership: row.membership || null,
    snapshot: row.snapshot || null,
  };
}

function storedNickname() {
  try {
    return localStorage.getItem(nicknameStorageKey) || "";
  } catch {
    return "";
  }
}

function rememberNickname(nickname) {
  try {
    localStorage.setItem(nicknameStorageKey, nickname);
  } catch {
    // Storage can be unavailable in embedded browsers.
  }
  globalChat.setNickname(nickname);
}

function renderRoomCard(room) {
  const locked = room.status !== "waiting" || room.players >= room.maxPlayers;
  return `
    <article class="pvp-room-card ${locked ? "locked" : ""}">
      <div class="pvp-room-main">
        <div>
          <span class="pvp-mode-badge ${escapeHtml(room.mode)}">${escapeHtml(modeLabel(room.mode))}</span>
          <strong>${escapeHtml(room.name || "이름 없는 방")}</strong>
        </div>
        <span>${escapeHtml(statusLabel(room.status))} · ${room.players}/${room.maxPlayers}</span>
      </div>
      <p>${escapeHtml(timingLabel(room))} · ${escapeHtml(room.gameVersion || "버전 미상")} · 코드 ${escapeHtml(room.code)}</p>
      ${debugMode ? `<small class="pvp-room-seed">room ${escapeHtml(String(room.id).slice(0, 8))}</small>` : ""}
      <button type="button" data-join-room="${escapeHtml(room.code)}" ${locked ? "disabled" : ""}>${locked ? "참가 불가" : "참가"}</button>
    </article>
  `;
}

function renderJoinedRoomCard(room) {
  const inLobby = room.status === "waiting" && room.phase === "lobby";
  const destination = roomDestination(room);
  const actionLabel = inLobby ? "대기실" : "게임 계속";
  const activity = joinedRoomActivity(room);
  const visualState = joinedRoomVisualState(room, activity);
  const progress = !inLobby
    ? `${Math.max(1, room.round)}라운드 · 체력 ${Number(room.membership?.health) || 0}`
    : `${room.players}/${room.maxPlayers}명 참가`;
  const summarySource = room.snapshot || joinedRoomLocalProgress(room);
  return `
    <article class="pvp-room-card joined state-${visualState}">
      <div class="pvp-room-main">
        <div>
          <span class="pvp-mode-badge ${escapeHtml(room.mode)}">${escapeHtml(modeLabel(room.mode))}</span>
          <strong>${escapeHtml(room.name || "이름 없는 방")}</strong>
        </div>
        <span class="pvp-room-state-badge status-${activity.kind}">${escapeHtml(activity.label)}</span>
      </div>
      <p><strong class="pvp-room-progress">${escapeHtml(progress)}</strong> · ${escapeHtml(timingLabel(room))} · ${escapeHtml(room.gameVersion || "버전 미상")} · 코드 ${escapeHtml(room.code)}</p>
      ${renderGameSummary(summarySource, room.membership?.credits, room.membership?.credits)}
      <a class="pvp-room-enter" href="${destination}">${actionLabel}</a>
    </article>
  `;
}

function rarityLabel(rarity) {
  return { silver: "실버", gold: "골드", prismatic: "프리즘" }[rarity] || "등급 확인 중";
}

function normalizeGameSummary(source, fallbackCredits = 0, creditsOverride) {
  if (!source) return { units: [], augments: [], credits: Math.max(0, Number(fallbackCredits) || 0) };
  const units = (Array.isArray(source.board) ? source.board : []).filter(Boolean);
  const augments = (Array.isArray(source.augments) ? source.augments : source.selectedAugments || []).filter(Boolean);
  const credits = creditsOverride ?? source.economy?.gold ?? source.gold ?? fallbackCredits;
  return { units, augments, credits: Math.max(0, Number(credits) || 0) };
}

function renderGameSummary(source, fallbackCredits = 0, creditsOverride) {
  const summary = normalizeGameSummary(source, fallbackCredits, creditsOverride);
  const units = summary.units.length
    ? summary.units.map((unit) => {
      const name = unit.displayName || unit.name || "유닛";
      const tier = unit.fourStarAscended ? 4 : Math.max(1, Math.min(3, Number(unit.tier) || 1));
      return `<span class="pvp-summary-unit" title="${escapeHtml(`${name} ${tier}성`)}">
        ${unit.art ? `<img src="${escapeHtml(unit.art)}" alt="">` : `<b>${escapeHtml(name.slice(0, 1))}</b>`}
        <i>${"★".repeat(tier)}</i>
      </span>`;
    }).join("")
    : `<span class="pvp-summary-empty">제출된 덱 없음</span>`;
  const augments = summary.augments.length
    ? summary.augments.map((augment) => `<span class="pvp-summary-augment" title="${escapeHtml(augment.name || "증강")}">${escapeHtml(augment.name || "증강")}</span>`).join("")
    : `<span class="pvp-summary-empty">증강 없음</span>`;
  return `
    <div class="pvp-game-summary" aria-label="제출 덱 요약">
      <div class="pvp-summary-units">${units}</div>
      <div class="pvp-summary-meta">
        <span class="pvp-summary-credits">크레딧 <strong>${summary.credits}</strong></span>
        <div class="pvp-summary-augments">${augments}</div>
      </div>
    </div>
  `;
}

function renderQueueCard(entry) {
  const matched = entry.status === "matched" && entry.matched_room_id;
  const queuedCount = Math.max(1, Math.min(8, Number(entry.queued_count) || 1));
  return `
    <article class="pvp-room-card joined state-${matched ? "running" : "waiting"}">
      <div class="pvp-room-main">
        <div>
          <span class="pvp-mode-badge async">비실시간</span>
          <strong>${escapeHtml(entry.nickname)}의 준비 덱</strong>
        </div>
        <span class="pvp-room-state-badge status-${matched ? "running" : "waiting"}">${matched ? "매칭 완료" : `비실시간 매칭 중 ${queuedCount}/8`}</span>
      </div>
      <p>${escapeHtml(rarityLabel(entry.augment_rarity))} 증강 · ${escapeHtml(entry.game_version || "버전 미상")}</p>
      ${renderGameSummary(entry, entry.economy?.gold)}
      ${matched
        ? `<a class="pvp-room-enter" href="./index.html?pvpRoom=${encodeURIComponent(entry.matched_room_id)}">게임 입장</a>`
        : `<div class="pvp-queue-actions">
            ${debugMode ? `<button type="button" data-fill-queue="${escapeHtml(entry.id)}">봇으로 채우기</button>` : ""}
            <button type="button" data-cancel-queue="${escapeHtml(entry.id)}">매칭 취소</button>
          </div>`}
    </article>
  `;
}

function renderRoomGroup({ title, description, rooms, content, empty }) {
  return `
    <section class="pvp-room-group">
      <header>
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(description)}</p>
        </div>
        <strong>${rooms.length}</strong>
      </header>
      <div class="pvp-rooms-list page-list">
        ${rooms.length ? content : `<div class="pvp-rooms-empty">${escapeHtml(empty)}</div>`}
      </div>
    </section>
  `;
}

function render() {
  refs.refresh.disabled = state.loading;
  refs.createButton.disabled = state.loading || !pvpBackendAvailable;
  refs.asyncButton.disabled = state.loading || !pvpBackendAvailable;
  refs.joinButton.disabled = state.loading || !pvpBackendAvailable;
  refs.status.className = `statistics-status ${state.error ? "error" : state.loading ? "loading" : "ready"}`;
  refs.status.textContent = state.error
    || state.notice
    || (state.loading ? "PvP 서버에 연결하는 중입니다." : `모집 중인 PvP 방 ${state.rooms.length}개`);
  const recruiting = state.activeRoomTab === "recruiting";
  const activeQueueEntries = state.queueEntries.filter((entry) => {
    if (entry.status !== "matched") return true;
    return !state.joinedRooms.some((room) => room.id === entry.matched_room_id);
  });
  const myGameItems = [...activeQueueEntries, ...state.joinedRooms];
  const queuedMatches = activeQueueEntries.filter((entry) => entry.status === "queued").length;
  const activeGroup = recruiting
    ? renderRoomGroup({
      title: "모집 중인 방",
      description: "실시간 게임에 참가하거나 코드를 입력해 비공개 방으로 들어갈 수 있습니다.",
      rooms: state.rooms,
      content: state.rooms.map(renderRoomCard).join(""),
      empty: "현재 모집 중인 공개 PvP 방이 없습니다.",
    })
    : renderRoomGroup({
      title: "내 게임",
      description: "매칭을 기다리는 준비 덱과 진행 중인 게임을 확인합니다.",
      rooms: myGameItems,
      content: `${activeQueueEntries.map(renderQueueCard).join("")}${state.joinedRooms.map(renderJoinedRoomCard).join("")}`,
      empty: "대기 중인 덱이나 진행 중인 PvP 게임이 없습니다.",
    });
  refs.panel.innerHTML = `
    <div class="pvp-room-tabs" role="tablist" aria-label="PvP 방 목록 구분">
      <button type="button" role="tab" data-room-tab="recruiting" aria-selected="${recruiting}" class="${recruiting ? "active" : ""}">
        모집 중인 방 <span>${state.rooms.length}</span>
      </button>
      <button type="button" role="tab" data-room-tab="joined" aria-selected="${!recruiting}" class="${!recruiting ? "active" : ""}">
        내 게임 <span>${state.attentionCount > 0 ? `${state.attentionCount} 필요` : queuedMatches > 0 ? `매칭 ${queuedMatches}` : myGameItems.length}</span>
      </button>
    </div>
    <div class="pvp-room-tab-content" role="tabpanel">
      ${activeGroup}
    </div>
  `;
}

function friendlyError(error) {
  const message = String(error?.message || error || "알 수 없는 오류");
  if (/anonymous sign-ins/i.test(message)) return "Supabase에서 Anonymous Sign-Ins를 활성화해주세요.";
  if (/pvp_.*does not exist|function.*does not exist/i.test(message)) return "PvP 스키마가 아직 적용되지 않았습니다.";
  if (/already joined/i.test(message)) return "이미 참가한 방입니다.";
  if (/room is full/i.test(message)) return "방이 가득 찼습니다.";
  if (/room not found/i.test(message)) return "방 코드를 확인해주세요.";
  if (/no longer accepting/i.test(message)) return "이미 게임이 시작된 방입니다.";
  return message;
}

async function loadRooms({ keepNotice = false } = {}) {
  state.loading = true;
  state.error = "";
  if (!keepNotice) state.notice = "";
  render();
  try {
    state.user = await ensurePvpSession();
    const [listedRows, joinedRows, queueRows] = await Promise.all([
      listPvpRooms("realtime"),
      listJoinedPvpRooms(),
      listOwnAsyncMatchQueue(),
    ]);
    state.joinedRooms = joinedRows.map(joinedRoomFromRow);
    state.queueEntries = queueRows;
    const joinedRoomIds = new Set(state.joinedRooms.map((room) => room.id));
    state.rooms = listedRows.map(roomFromRow).filter((room) => !joinedRoomIds.has(room.id));
  } catch (error) {
    state.rooms = [];
    state.joinedRooms = [];
    state.queueEntries = [];
    state.error = friendlyError(error);
  } finally {
    state.loading = false;
    render();
  }
}

function setFormError(node, error = "") {
  node.textContent = error;
  node.hidden = !error;
}

function openModal(modal) {
  const nickname = storedNickname();
  const nicknameInput = modal.querySelector('[name="nickname"]');
  if (nicknameInput && !nicknameInput.value) nicknameInput.value = nickname;
  modal.hidden = false;
  document.body.classList.add("pvp-modal-open");
  requestAnimationFrame(() => modal.querySelector("input")?.focus());
}

function closeModals() {
  refs.createModal.hidden = true;
  refs.asyncModal.hidden = true;
  refs.joinModal.hidden = true;
  setFormError(refs.createError);
  setFormError(refs.asyncError);
  setFormError(refs.joinError);
  document.body.classList.remove("pvp-modal-open");
}

async function submitCreate(event) {
  event.preventDefault();
  setFormError(refs.createError);
  const form = new FormData(refs.createForm);
  const submit = refs.createForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const nickname = String(form.get("nickname") || "").trim();
    const mode = "realtime";
    const result = await createPvpRoom({
      name: String(form.get("roomName") || "").trim(),
      nickname,
      mode,
      visibility: String(form.get("visibility") || "public"),
      maxPlayers: Number(form.get("maxPlayers")) || 8,
      asyncTurnMinutes: 720,
      planningSeconds: Number(form.get("planningSeconds")) || 30,
      gameVersion: String(rankingConfig.majorVersion || "dev"),
    });
    rememberNickname(nickname);
    if (!result?.room_id) throw new Error("생성된 방 정보를 받지 못했습니다.");
    location.href = `./pvp-room.html?room=${encodeURIComponent(result.room_id)}`;
  } catch (error) {
    setFormError(refs.createError, friendlyError(error));
  } finally {
    submit.disabled = false;
  }
}

async function submitAsyncPreparation(event) {
  event.preventDefault();
  setFormError(refs.asyncError);
  const form = new FormData(refs.asyncForm);
  const submit = refs.asyncForm.querySelector('[type="submit"]');
  const nickname = String(form.get("nickname") || "").trim();
  if (!nickname || nickname.length > 12) {
    setFormError(refs.asyncError, "닉네임은 1~12자로 입력해주세요.");
    return;
  }
  submit.disabled = true;
  try {
    rememberNickname(nickname);
    const ticketId = crypto.randomUUID();
    const gameVersion = `${String(rankingConfig.majorVersion || "dev")}${debugMode ? "-local-test" : ""}`;
    const reservation = await reserveAsyncPvpMatch({ ticketId, nickname, gameVersion });
    if (!reservation?.queue_id || !reservation?.augment_rarity || !reservation?.batch_id) {
      throw new Error("비실시간 매칭 자리를 예약하지 못했습니다.");
    }
    const params = new URLSearchParams({
      pvpQueue: reservation.queue_id,
      pvpBatch: reservation.batch_id,
      augmentRarity: reservation.augment_rarity,
      nickname,
    });
    location.href = `./index.html?${params}`;
  } catch (error) {
    setFormError(refs.asyncError, friendlyError(error));
  } finally {
    submit.disabled = false;
  }
}

async function submitJoin(event) {
  event.preventDefault();
  setFormError(refs.joinError);
  const form = new FormData(refs.joinForm);
  const submit = refs.joinForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const nickname = String(form.get("nickname") || "").trim();
    const code = String(form.get("roomCode") || "").trim().toUpperCase();
    const result = await joinPvpRoom({ code, nickname });
    rememberNickname(nickname);
    if (!result?.room_id) throw new Error("참가한 방 정보를 받지 못했습니다.");
    location.href = `./pvp-room.html?room=${encodeURIComponent(result.room_id)}`;
  } catch (error) {
    if (/already joined/i.test(String(error?.message || error))) {
      const code = String(form.get("roomCode") || "").trim().toUpperCase();
      try {
        const room = await getJoinedPvpRoomByCode(code);
        if (room?.id) {
          location.href = roomDestination(room);
          return;
        }
      } catch {
        // Fall through to the original join error when the existing room cannot be read.
      }
    }
    setFormError(refs.joinError, friendlyError(error));
  } finally {
    submit.disabled = false;
  }
}

refs.refresh.addEventListener("click", () => loadRooms());
refs.rulesToggle.addEventListener("click", () => {
  const open = refs.rulesPanel.hidden;
  refs.rulesPanel.hidden = !open;
  refs.rulesToggle.classList.toggle("active", open);
  refs.rulesToggle.textContent = open ? "규칙서 닫기" : "규칙서";
});
refs.createButton.addEventListener("click", () => openModal(refs.createModal));
refs.asyncButton.addEventListener("click", () => openModal(refs.asyncModal));
refs.joinButton.addEventListener("click", () => openModal(refs.joinModal));
refs.createForm.addEventListener("submit", submitCreate);
refs.asyncForm.addEventListener("submit", submitAsyncPreparation);
refs.joinForm.addEventListener("submit", submitJoin);
refs.panel.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-room-tab]");
  if (tab) {
    state.activeRoomTab = tab.dataset.roomTab === "joined" ? "joined" : "recruiting";
    render();
    return;
  }
  const button = event.target.closest("[data-join-room]");
  if (button && !button.disabled) {
    refs.joinForm.elements.roomCode.value = button.dataset.joinRoom || "";
    openModal(refs.joinModal);
    return;
  }
  const cancelButton = event.target.closest("[data-cancel-queue]");
  const fillButton = event.target.closest("[data-fill-queue]");
  if (fillButton && !fillButton.disabled) {
    fillButton.disabled = true;
    state.notice = "테스트 봇을 채우고 8인 매칭을 생성하는 중입니다.";
    render();
    void fillAsyncPvpQueueWithTestBots(fillButton.dataset.fillQueue)
      .then((result) => {
        if (!result?.matched_room_id) throw new Error("테스트 매칭 방이 생성되지 않았습니다.");
        location.href = `./index.html?pvpRoom=${encodeURIComponent(result.matched_room_id)}`;
      })
      .catch((error) => {
        state.error = friendlyError(error);
        render();
      });
    return;
  }
  if (!cancelButton || cancelButton.disabled) return;
  cancelButton.disabled = true;
  void cancelAsyncPvpMatch(cancelButton.dataset.cancelQueue)
    .then(() => {
      try {
        localStorage.removeItem(`${gameSaveStorageKey}:pvp-queue:${cancelButton.dataset.cancelQueue}`);
      } catch {
        // Queue cancellation still succeeds when local storage is unavailable.
      }
      state.notice = "비실시간 매칭을 취소했습니다.";
      return loadRooms({ keepNotice: true });
    })
    .catch((error) => {
      state.error = friendlyError(error);
      render();
    });
});
document.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-pvp-modal]")) closeModals();
  if (event.target.classList.contains("pvp-page-modal")) closeModals();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModals();
});

globalChat.start();
void pvpNotifications.start();
window.addEventListener("beforeunload", () => {
  globalChat.stop();
  pvpNotifications.stop();
}, { once: true });
loadRooms({ keepNotice: Boolean(pageNotice) });
