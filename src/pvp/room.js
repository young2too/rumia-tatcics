// Owns the persistent PvP waiting-room UI and ready/start lifecycle.
import {
  addPvpBot,
  ensurePvpSession,
  getPvpRoom,
  getPvpRoomPlayers,
  getPvpUnitPool,
  leavePvpRoom,
  removePvpBot,
  setPvpReady,
  startPvpRoom,
  submitPvpBotSnapshot,
  tickPvpRoom,
} from "./api.js";
import { buildInitialBotSnapshot } from "./bots.js";
import { balance, presenceConfig, rankingConfig, roster } from "../core/data.js";
import { createGlobalChat } from "../ui/globalChat.js";

const roomId = new URLSearchParams(location.search).get("room") || "";
const state = {
  user: null,
  room: null,
  players: [],
  loading: true,
  working: false,
  error: "",
  notice: "",
};

const refs = {
  refresh: document.querySelector("#refreshPvpRoom"),
  status: document.querySelector("#pvpRoomStatus"),
  panel: document.querySelector("#pvpRoomPanel"),
};

let refreshTimer = 0;
const globalChat = createGlobalChat({ presenceConfig, rankingConfig });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function modeLabel(mode) {
  return mode === "realtime" ? "실시간" : "비동기";
}

function timingLabel(room) {
  if (room.mode === "realtime") return `준비시간 ${Number(room.planning_seconds) || 60}초`;
  const minutes = Number(room.async_turn_minutes) || 720;
  return `턴 제한 ${minutes >= 60 ? `${minutes / 60}시간` : `${minutes}분`}`;
}

function phaseLabel(phase) {
  return {
    lobby: "참가자 모집",
    pve: "PvE 준비전",
    planning: "배치 준비",
    locked: "배치 확정",
    combat: "전투 중",
    result: "결과 확인",
    finished: "게임 종료",
  }[phase] || phase;
}

function deadlineLabel(deadline) {
  if (!deadline) return "제한 시간 없음";
  const remainingSeconds = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = String(remainingSeconds % 60).padStart(2, "0");
  return remainingSeconds > 0 ? `자동 제출까지 ${minutes}:${seconds}` : "자동 제출 처리 중";
}

function friendlyError(error) {
  const message = String(error?.message || error || "알 수 없는 오류");
  if (/invalid input syntax for type uuid/i.test(message)) return "잘못된 PvP 방 주소입니다.";
  if (/0 rows|JSON object requested|not found/i.test(message)) return "방을 찾을 수 없거나 참가 권한이 없습니다.";
  if (/jsonb_object_length/i.test(message)) {
    return "Supabase의 PvP 시작 함수가 구버전입니다. 최신 PvP 로비 마이그레이션 SQL을 다시 적용해주세요.";
  }
  if (/pvp_start_room.*target_room_id.*schema cache/i.test(message)) {
    return "구버전 PvP 페이지가 열려 있습니다. 페이지를 강력 새로고침한 뒤 다시 시작해주세요.";
  }
  if (/pvp_start_room|pvp_leave_room|function.*does not exist/i.test(message)) return "PvP 로비 마이그레이션 SQL을 먼저 적용해주세요.";
  if (/only the room host/i.test(message)) return "방장만 게임을 시작할 수 있습니다.";
  if (/at least 2 players/i.test(message)) return "2명 이상 참가해야 시작할 수 있습니다.";
  if (/every player must be ready/i.test(message)) return "모든 참가자가 준비해야 시작할 수 있습니다.";
  return message;
}

function currentPlayer() {
  return state.players.find((player) => player.user_id === state.user?.id) || null;
}

function renderPlayer(player) {
  const isMe = player.user_id === state.user?.id;
  const isHost = player.user_id === state.room?.host_user_id;
  const eliminated = player.status === "eliminated";
  const isBot = Boolean(player.is_bot);
  return `
    <article class="pvp-lobby-player ${player.ready ? "ready" : ""} ${isMe ? "me" : ""} ${eliminated ? "eliminated" : ""}">
      <span class="pvp-player-seat">${Number(player.seat)}</span>
      <div>
        <strong>${escapeHtml(player.nickname)}${isMe ? " (나)" : ""}</strong>
        <small>${isHost ? "방장" : isBot ? `${player.bot_difficulty === "hard" ? "어려움" : "보통"} · 준비 완료` : eliminated ? "탈락" : player.ready ? "준비 완료" : "준비 중"}</small>
      </div>
      ${isBot ? `<em class="pvp-bot-badge">BOT</em>` : ""}
      ${isHost ? `<em class="pvp-host-badge">HOST</em>` : ""}
      ${isBot && state.room?.status === "waiting" && state.room?.host_user_id === state.user?.id ? `<button class="pvp-remove-bot" type="button" data-remove-bot="${escapeHtml(player.id)}" title="봇 제거" aria-label="${escapeHtml(player.nickname)} 제거">×</button>` : ""}
      <i class="pvp-ready-light" aria-label="${player.ready ? "준비 완료" : "준비 중"}"></i>
    </article>
  `;
}

function renderEmptySeat(seat) {
  return `
    <article class="pvp-lobby-player empty">
      <span class="pvp-player-seat">${seat}</span>
      <div><strong>빈 자리</strong><small>참가자 대기 중</small></div>
    </article>
  `;
}

function renderStarted() {
  const room = state.room;
  const preparing = room.phase === "pve";
  return `
    <section class="pvp-room-started">
      <span>${escapeHtml(phaseLabel(room.phase))}</span>
      <h1>${escapeHtml(room.name)}</h1>
      <p>${room.mode === "realtime"
        ? "실시간 방이 시작되었습니다. 서버 타이머에 맞춰 PvE와 전투가 자동 진행됩니다."
        : "비동기 방이 시작되었습니다. 각자 4라운드 PvE와 첫 증강을 마친 뒤 덱을 제출하세요."}</p>
      <dl>
        <div><dt>진행 방식</dt><dd>${escapeHtml(modeLabel(room.mode))}</dd></div>
        <div><dt>현재 라운드</dt><dd>${Number(room.current_round) || 0}</dd></div>
        <div><dt>참가자</dt><dd>${state.players.length}명</dd></div>
        ${room.phase === "planning" ? `<div><dt>준비 마감</dt><dd>${escapeHtml(deadlineLabel(room.phase_deadline))}</dd></div>` : ""}
      </dl>
      <a class="pvp-enter-game" href="./index.html?pvpRoom=${encodeURIComponent(room.id)}">${preparing
        ? room.mode === "realtime" ? "실시간 전장 입장" : "4라운드 PvE 시작"
        : "PvP 전장 입장"}</a>
    </section>
  `;
}

function renderLobby() {
  const room = state.room;
  const me = currentPlayer();
  const activePlayers = state.players.filter((player) => player.status === "active");
  const readyCount = activePlayers.filter((player) => player.ready).length;
  const isHost = room.host_user_id === state.user?.id;
  const canStart = activePlayers.length >= 2 && readyCount === activePlayers.length;
  const seats = Array.from({ length: Number(room.max_players) || 8 }, (_, index) => {
    const player = state.players.find((entry) => Number(entry.seat) === index + 1);
    return player ? renderPlayer(player) : renderEmptySeat(index + 1);
  }).join("");

  return `
    <header class="pvp-lobby-head">
      <div>
        <span class="pvp-mode-badge ${escapeHtml(room.mode)}">${escapeHtml(modeLabel(room.mode))}</span>
        <h1>${escapeHtml(room.name)}</h1>
        <p>${escapeHtml(timingLabel(room))} · 버전 ${escapeHtml(room.game_version)} · ${escapeHtml(phaseLabel(room.phase))}</p>
      </div>
      <button class="pvp-room-code" type="button" data-copy-code="${escapeHtml(room.code)}" title="방 코드 복사">
        <small>방 코드</small><strong>${escapeHtml(room.code)}</strong>
      </button>
    </header>

    <div class="pvp-lobby-grid">
      <section class="pvp-lobby-players">
        <header>
          <h2>참가자</h2>
          <div>
            <span>${activePlayers.length}/${room.max_players} · 준비 ${readyCount}/${activePlayers.length}</span>
            ${isHost && activePlayers.length < room.max_players ? `
              <select data-bot-difficulty aria-label="봇 난이도">
                <option value="normal">봇 보통</option>
                <option value="hard">봇 어려움</option>
              </select>
              <button type="button" data-add-bot>봇 추가</button>
              <button type="button" data-fill-bots>빈자리 채우기</button>
            ` : ""}
          </div>
        </header>
        <div>${seats}</div>
      </section>

      <aside class="pvp-lobby-guide">
        <span>게임 흐름</span>
        <ol>
          <li class="active"><b>1</b><div><strong>로비 준비</strong><small>전원이 준비하면 방장이 시작합니다.</small></div></li>
          <li><b>2</b><div><strong>4라운드 PvE</strong><small>${room.mode === "realtime" ? "서버 타이머에 맞춰 자동 전투합니다." : "각자 완료한 뒤 첫 덱을 제출합니다."}</small></div></li>
          <li><b>3</b><div><strong>PvP 진행</strong><small>${room.mode === "realtime" ? "정비와 전투가 시간에 맞춰 자동 진행됩니다." : "각자 덱을 제출한 뒤 전투합니다."}</small></div></li>
          <li><b>4</b><div><strong>최후의 1인</strong><small>체력이 남은 마지막 플레이어가 승리합니다.</small></div></li>
        </ol>
      </aside>
    </div>

    <footer class="pvp-lobby-actions">
      <button type="button" data-leave-room>방 나가기</button>
      <div>
        ${isHost ? `<small>${canStart ? "시작할 수 있습니다." : "2명 이상, 전원 준비가 필요합니다."}</small>` : `<small>방장이 게임을 시작할 때까지 기다려주세요.</small>`}
        <button class="primary" type="button" data-toggle-ready ${state.working ? "disabled" : ""}>${me?.ready ? "준비 취소" : "준비"}</button>
        ${isHost ? `<button class="start" type="button" data-start-room ${canStart && !state.working ? "" : "disabled"}>게임 시작</button>` : ""}
      </div>
    </footer>
  `;
}

function render() {
  refs.refresh.disabled = state.loading || state.working;
  refs.status.className = `statistics-status ${state.error ? "error" : state.loading ? "loading" : "ready"}`;
  refs.status.textContent = state.error
    || state.notice
    || (state.loading ? "대기실 정보를 불러오는 중입니다." : "서버와 연결되었습니다.");

  if (state.error && !state.room) {
    refs.panel.innerHTML = `<section class="pvp-room-fatal"><strong>대기실을 열 수 없습니다.</strong><p>${escapeHtml(state.error)}</p><a href="./pvp.html">방 목록으로</a></section>`;
    return;
  }
  if (!state.room) {
    refs.panel.innerHTML = `<div class="pvp-room-loading">참가자 정보를 확인하고 있습니다.</div>`;
    return;
  }
  refs.panel.innerHTML = state.room.status === "waiting" && state.room.phase === "lobby"
    ? renderLobby()
    : renderStarted();
}

async function loadRoom({ quiet = false } = {}) {
  if (!roomId) {
    state.loading = false;
    state.error = "PvP 방 주소에 room 값이 없습니다.";
    render();
    return;
  }
  if (!quiet) {
    state.loading = true;
    state.error = "";
    render();
  }
  try {
    state.user ||= await ensurePvpSession();
    await tickPvpRoom(roomId);
    const [room, players] = await Promise.all([
      getPvpRoom(roomId),
      getPvpRoomPlayers(roomId),
    ]);
    state.room = room;
    state.players = players;
    if (!currentPlayer()) throw new Error("이 방의 참가자가 아닙니다.");
    if (room.status !== "waiting" || room.phase !== "lobby") {
      state.room = null;
      location.replace(`./index.html?pvpRoom=${encodeURIComponent(room.id)}`);
      return;
    }
    state.error = "";
  } catch (error) {
    state.error = friendlyError(error);
  } finally {
    state.loading = false;
    render();
  }
}

async function toggleReady() {
  const me = currentPlayer();
  if (!me || state.working) return;
  state.working = true;
  state.notice = me.ready ? "준비를 취소하는 중입니다." : "준비 상태를 저장하는 중입니다.";
  render();
  try {
    await setPvpReady(roomId, !me.ready);
    state.notice = "";
    await loadRoom({ quiet: true });
  } catch (error) {
    state.error = friendlyError(error);
  } finally {
    state.working = false;
    render();
  }
}

async function startRoom() {
  if (state.working) return;
  state.working = true;
  state.notice = "게임을 시작하는 중입니다.";
  render();
  try {
    const unitPool = Object.fromEntries(roster.map((unit) => [
      unit.name,
      Number(balance.shop.stockByCost[unit.cost]) || 0,
    ]).filter(([, count]) => count > 0));
    await startPvpRoom(roomId, unitPool);
    const sharedPool = Object.fromEntries((await getPvpUnitPool(roomId)).map((entry) => [
      entry.unit_name,
      Number(entry.remaining_count) || 0,
    ]));
    const bots = state.players.filter((player) => player.status === "active" && player.is_bot);
    for (const bot of bots) {
      const snapshot = buildInitialBotSnapshot({ room: state.room, player: bot, availableCounts: sharedPool });
      await submitPvpBotSnapshot(bot.id, snapshot);
      for (const unit of [...snapshot.board, ...snapshot.bench]) {
        const copies = unit.tier >= 3 ? 9 : unit.tier >= 2 ? 3 : 1;
        sharedPool[unit.name] = Math.max(0, (sharedPool[unit.name] || 0) - copies);
      }
    }
    state.notice = "PvP 방이 시작되었습니다.";
    location.href = `./index.html?pvpRoom=${encodeURIComponent(roomId)}`;
    return;
  } catch (error) {
    console.error("[PvP 방 시작 오류]", JSON.stringify({
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    }));
    state.error = friendlyError(error);
  } finally {
    state.working = false;
    render();
  }
}

async function leaveRoom() {
  if (state.working || !confirm("이 PvP 방에서 나갈까요?")) return;
  state.working = true;
  state.notice = "방에서 나가는 중입니다.";
  render();
  try {
    await leavePvpRoom(roomId);
    location.href = "./pvp.html";
  } catch (error) {
    state.error = friendlyError(error);
    state.working = false;
    render();
  }
}

async function addBot(fill = false) {
  if (state.working) return;
  const difficulty = refs.panel.querySelector("[data-bot-difficulty]")?.value || "normal";
  const activeCount = state.players.filter((player) => player.status === "active").length;
  const openSeats = Math.max(0, Number(state.room?.max_players) - activeCount);
  const count = fill ? openSeats : Math.min(1, openSeats);
  if (!count) return;
  state.working = true;
  state.notice = fill ? "빈자리를 봇으로 채우는 중입니다." : "봇을 추가하는 중입니다.";
  render();
  try {
    for (let index = 0; index < count; index += 1) await addPvpBot(roomId, difficulty);
    state.notice = "";
    await loadRoom({ quiet: true });
  } catch (error) {
    state.error = friendlyError(error);
  } finally {
    state.working = false;
    render();
  }
}

async function removeBot(playerId) {
  if (!playerId || state.working) return;
  state.working = true;
  state.notice = "봇을 제거하는 중입니다.";
  render();
  try {
    await removePvpBot(playerId);
    state.notice = "";
    await loadRoom({ quiet: true });
  } catch (error) {
    state.error = friendlyError(error);
  } finally {
    state.working = false;
    render();
  }
}

async function copyRoomCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    state.notice = `방 코드 ${code}를 복사했습니다.`;
  } catch {
    state.notice = `방 코드: ${code}`;
  }
  render();
}

refs.refresh.addEventListener("click", () => loadRoom());
refs.panel.addEventListener("click", (event) => {
  const readyButton = event.target.closest("[data-toggle-ready]");
  if (readyButton) return toggleReady();
  const startButton = event.target.closest("[data-start-room]");
  if (startButton) return startRoom();
  const leaveButton = event.target.closest("[data-leave-room]");
  if (leaveButton) return leaveRoom();
  const addBotButton = event.target.closest("[data-add-bot]");
  if (addBotButton) return addBot(false);
  const fillBotsButton = event.target.closest("[data-fill-bots]");
  if (fillBotsButton) return addBot(true);
  const removeBotButton = event.target.closest("[data-remove-bot]");
  if (removeBotButton) return removeBot(removeBotButton.dataset.removeBot);
  const codeButton = event.target.closest("[data-copy-code]");
  if (codeButton) copyRoomCode(codeButton.dataset.copyCode || "");
});

window.addEventListener("beforeunload", () => clearInterval(refreshTimer));
globalChat.start();
window.addEventListener("beforeunload", () => globalChat.stop(), { once: true });
loadRoom().then(() => {
  refreshTimer = window.setInterval(() => {
    if (!document.hidden && !state.working) loadRoom({ quiet: true });
  }, 5000);
});
