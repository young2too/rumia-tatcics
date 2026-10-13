import { allAugments, augmentPools, augmentSettings, balance, bgmConfig, bossPatterns, bossRoster, communityBoardConfig, communityBoardStorageKey, gameSaveStorageKey, hiddenTraitRules, lumiShopConfig, patchNotesConfig, patchNotesStorageKey, presenceConfig, pushConfig, pvpRoomsConfig, rankingConfig, rankingStorageKey, roster, traitRules } from "./src/core/data.js";
import { createGameState } from "./src/core/state.js";
import { createStableHash } from "./src/core/rng.js";
import { createSaveController } from "./src/core/save.js";
import { createUnitPool, makeUnit as createUnit, poolBackedCopyCount, poolExemptCopyCount, sample, sellValue, sleep } from "./src/core/units.js";
import { createCombatController } from "./src/systems/combat.js";
import { createProgressionController } from "./src/systems/progression.js";
import { createAugmentController } from "./src/systems/augments.js";
import { augmentBoardLimitAdd, augmentCanRerollShop, augmentTemporaryBoostConfig } from "./src/systems/augmentEffects.js";
import { createHiddenTraitController } from "./src/systems/hiddenTraits.js";
import { createShopController } from "./src/systems/shop.js";
import { createLumiShopController } from "./src/systems/lumiShop.js";
import { createTraitController } from "./src/systems/traits.js";
import { createAudioController } from "./src/ui/audio.js";
import { createCommunityBoardController } from "./src/ui/communityBoard.js";
import { $, createRefs } from "./src/ui/dom.js";
import { bindUiEvents } from "./src/ui/events.js";
import { createPatchNotesController } from "./src/ui/patchNotes.js";
import { createPresenceController } from "./src/ui/presence.js";
import { createGlobalChat } from "./src/ui/globalChat.js";
import { createRankingController } from "./src/ui/ranking.js";
import { createBattlefieldView } from "./src/ui/views/battlefieldView.js";
import { createGameView } from "./src/ui/views/gameView.js";
import { createOverlayView } from "./src/ui/views/overlayView.js";
import { createShopView } from "./src/ui/views/shopView.js";
import { createTraitView } from "./src/ui/views/traitView.js";
import { createUnitView } from "./src/ui/views/unitView.js";
import { createLumiShopView } from "./src/ui/views/lumiShopView.js";
import { createSkillEffectRenderer } from "./src/ui/skillEffects.js";
import { installCombatStressTools } from "./src/systems/combat/debugStress.js";
import { claimPvpLumiShopProduct, enqueueAsyncPvpMatch, ensurePvpSession, getLatestPvpReplay, getOwnPvpRoomPlayer, getPvpLumiShopClaims, getPvpPlayerSnapshot, getPvpRoom, getPvpRoomPlayers, getPvpRoundMatch, getPvpUnitPool, preparePvpLumiShop, preparePvpRound, reportPvpMatch, reportPvpRealtimePveRound, returnPvpUnit, submitPvpPveSnapshot, submitPvpRoundSnapshot, syncPvpRealtimeSnapshot, syncPvpUnitHoldings, takePvpUnit, tickPvpRoom } from "./src/pvp/api.js";
import { createPvpSocialPanel } from "./src/pvp/socialPanel.js";
import { createPvpNotificationController } from "./src/pvp/notifications.js";

const searchParams = new URLSearchParams(location.search);
const pvpRoomId = searchParams.get("pvpRoom") || "";
const pvpQueueId = searchParams.get("pvpQueue") || "";
const pvpQueueNickname = (searchParams.get("nickname") || "").trim().slice(0, 12);
const lumiShopDebugRound = Number(searchParams.get("lumiShop")) || 0;
const modeEntryStorageKey = "lumia-tactics-mode-entry-seen";
const { state, syncLocalTestGold } = createGameState({
  balance,
  roster,
  createUnitPool,
  communityBoardConfig,
  pvpRoomsConfig,
  gameMode: pvpRoomId || pvpQueueId ? "pvp" : "pve",
  pvpRoomId,
  pvpQueueId,
  pvpQueueNickname,
});
const refs = createRefs();
document.body.classList.toggle("pvp-battlefield-theme", state.gameMode === "pvp");
document.body.classList.toggle("pvp-queue-preparation", state.pvpQueuePreparation);
const pvpQueuePrepBanner = document.querySelector("#pvpQueuePrepBanner");
const pvpQueuePrepProgress = document.querySelector("#pvpQueuePrepProgress");
const pvpQueueExit = document.querySelector("#pvpQueueExit");
const arenaTitle = document.querySelector("#arenaTitle");
if (pvpQueuePrepBanner) pvpQueuePrepBanner.hidden = !state.pvpQueuePreparation;
if (arenaTitle && state.pvpQueuePreparation) arenaTitle.textContent = "매칭 덱 준비 전장";
const pvpRoomLink = document.querySelector(".pvp-rooms-button");
if (state.gameMode === "pvp" && pvpRoomLink) {
  pvpRoomLink.href = "./pvp.html";
}
const pvpNotifications = createPvpNotificationController({
  config: pushConfig,
  onAttentionChange: ({ count }) => {
    if (!pvpRoomLink) return;
    const badge = pvpRoomLink.querySelector(".pvp-rooms-alert");
    const hasAttention = count > 0;
    pvpRoomLink.classList.toggle("has-active-games", hasAttention);
    badge?.toggleAttribute("hidden", !hasAttention);
    if (badge) badge.textContent = count > 9 ? "9+" : String(count);
    const label = hasAttention ? `진행이 필요한 PvP 게임 ${count}개` : "PvP 방 목록 보기";
    pvpRoomLink.title = label;
    pvpRoomLink.setAttribute("aria-label", label);
  },
});
const pvpSocial = state.gameMode === "pvp"
  && state.pvpRoomId
  ? createPvpSocialPanel({
    roomId: state.pvpRoomId,
    roster,
    getMode: () => state.pvpMode,
    maxHealth: Number(balance.player.startHp) || 100,
  })
  : null;
refs.log?.closest(".log-wrap")?.toggleAttribute("hidden", !state.debugMode);
const boardUnits = () => state.board.filter(Boolean);
const ownedUnits = () => [...state.board, ...state.bench].filter(Boolean);
const boardLimit = () => Math.max(1, state.level + augmentBoardLimitAdd(state));
const makeUnit = (base, tier = 1) => createUnit(base, balance, tier);
const temporaryBoostConfig = () => augmentTemporaryBoostConfig(state, balance.battle.temporaryBoosts || { cost: 20, amount: 0.1, stats: [] });
const temporaryBoostPercent = (stat) => Math.round((state.temporaryBoosts?.[stat] || 0) * 100);
const canModifyPvpLineup = () => state.gameMode !== "pvp"
  || (state.pvpMode === "realtime"
    ? (state.pvpRoomPhase === "pve" && !state.busy && !state.pvpRealtimePveWaiting)
      || (state.pvpRoomPhase === "planning" && !state.pvpSnapshotSubmitted)
    : ["pve", "planning"].includes(state.pvpRoomPhase) && !state.pvpSnapshotSubmitted);
const rosterByName = new Map(roster.map((unit) => [unit.name, unit]));
const augmentById = new Map(allAugments.map((augment) => [augment.id, augment]));

function ownedUnitCounts() {
  const counts = {};
  for (const unit of ownedUnits()) {
    const copies = poolBackedCopyCount(unit);
    if (copies <= 0) continue;
    counts[unit.name] = (counts[unit.name] || 0) + copies;
  }
  return counts;
}

async function refreshPvpSharedPool() {
  if (state.gameMode !== "pvp" || !state.pvpRoomId) return;
  await ensurePvpSession();
  const rows = await getPvpUnitPool(state.pvpRoomId);
  if (!rows.length) throw new Error("PvP 공유 기물 풀이 준비되지 않았습니다.");
  state.pool = Object.fromEntries(roster.map((unit) => [unit.name, 0]));
  for (const row of rows) state.pool[row.unit_name] = Number(row.remaining_count) || 0;
}

async function refreshPvpPlayers() {
  if (state.gameMode !== "pvp" || !state.pvpRoomId) return [];
  const players = await getPvpRoomPlayers(state.pvpRoomId);
  state.pvpPlayers = players.filter((player) => player.status === "active");
  state.pvpActivePlayerCount = state.pvpPlayers.length;
  render();
  return state.pvpPlayers;
}

async function refreshPvpLumiShopClaims(round = state.lumiShopRound) {
  if (state.gameMode !== "pvp" || !state.pvpRoomId || !Number(round)) return [];
  state.pvpLumiShopClaims = await getPvpLumiShopClaims(state.pvpRoomId, round);
  render();
  return state.pvpLumiShopClaims;
}

async function prepareSharedPvpLumiShop(round, productIds) {
  try {
    await preparePvpLumiShop(state.pvpRoomId, round, productIds);
    await Promise.all([refreshPvpPlayers(), refreshPvpLumiShopClaims(round)]);
  } catch (error) {
    addLog(`[루미 상점] 공동 상품 준비 실패: ${String(error?.message || error)}`, { force: true });
  }
}

async function claimSharedPvpLumiProduct(round, productId) {
  try {
    const claim = await claimPvpLumiShopProduct(state.pvpRoomId, round, productId);
    await refreshPvpLumiShopClaims(round);
    return Boolean(claim?.product_id);
  } catch (error) {
    await refreshPvpLumiShopClaims(round).catch(() => {});
    const message = /already claimed|duplicate key|already selected/i.test(String(error?.message || error))
      ? "다른 참가자가 먼저 구매했습니다."
      : String(error?.message || error);
    addLog(`[루미 상점] 구매 실패: ${message}`, { force: true });
    return false;
  }
}

async function reserveSharedPoolUnit(unit, count) {
  await ensurePvpSession();
  const result = await takePvpUnit(state.pvpRoomId, unit.name, count);
  return Number(result?.pool_remaining);
}

async function releaseSharedPoolUnit(unit, count) {
  await ensurePvpSession();
  const result = await returnPvpUnit(state.pvpRoomId, unit.name, count);
  return Number(result?.pool_remaining);
}

async function syncOwnedUnitsToSharedPool() {
  if (state.gameMode !== "pvp" || !state.pvpRoomId) return;
  await ensurePvpSession();
  await syncPvpUnitHoldings(state.pvpRoomId, ownedUnitCounts());
  await refreshPvpSharedPool();
}

function hasPendingAugmentChoice() {
  return !state.augmentOpen
    && (state.augmentChoices || []).length > 0
    && !(state.selectedAugments || []).some((augment) => augment.stage === state.augmentStage);
}

function hasPendingAugmentTarget() {
  return Boolean(state.pendingAugmentTarget);
}

function exposeLocalDebug(name, value) {
  try {
    if (Object.isExtensible(window)) window[name] = value;
  } catch {
    // Some embedded browser test contexts freeze window; debug globals are optional.
  }
}

function trainingDummy() {
  return {
    id: crypto.randomUUID(),
    name: "훈련 더미",
    cost: 1,
    tier: 1,
    role: "방패",
    trait: "수호",
    traits: ["수호"],
    weapon: "훈련",
    color: "#82909a",
    maxHp: 10000,
    hp: 10000,
    atk: 0,
    speed: 1,
    skillAmp: 0,
    defense: 0,
    skill: "행동 없음",
    skillTooltip: "로컬 스킬 테스트용 고정 표적",
    art: "",
    trainingDummy: true,
    side: "enemy",
  };
}

function placeDebugDummy(index) {
  if (!state.debugMode || state.busy || !state.debugDummyPlacement) return;
  state.debugDummies[index] = state.debugDummies[index] ? null : trainingDummy();
  render();
}

function toggleDebugDummyPlacement() {
  if (!state.debugMode || state.busy) return;
  state.debugDummyPlacement = !state.debugDummyPlacement;
  render();
}

function clearDebugDummies() {
  if (!state.debugMode || state.busy) return;
  state.debugDummies = Array(balance.battle.enemySlots).fill(null);
  render();
}

function debugJumpRound(value) {
  if (!state.debugMode || state.busy) return;
  const targetRound = Math.max(1, Math.min(999, Math.round(Number(value) || state.round)));
  state.round = targetRound;
  state.phase = "";
  state.lastCombatSeed = "";
  state.lastCombatResult = null;
  state.enemies = [];
  state.combatGrid = null;
  if (refs.debugRoundInput) refs.debugRoundInput.value = String(targetRound);
  addLog(`[디버그] ${targetRound}라운드로 이동.`);
  if (!state.shopLocked) rollShop();
  render();
}

function pvpUnitSnapshot(unit, index, source) {
  if (!unit) return null;
  const baseStats = unit.pvpBaseStats || currentPvpBaseStats(unit);
  const tier = Math.max(1, Math.min(3, Math.round(Number(unit.tier) || 1)));
  return {
    source,
    index,
    name: unit.name,
    displayName: displayNameFor(unit),
    tier,
    fourStarAscended: Boolean(unit.fourStarAscended),
    fourStarPromotionOrder: Math.max(0, Number(unit.fourStarPromotionOrder) || 0),
    cost: Math.max(1, Math.min(5, Math.round(Number(unit.cost) || 1))),
    art: unit.art,
    color: unit.color,
    role: unit.role,
    trait: unit.trait,
    traits: Array.isArray(unit.traits) ? unit.traits.slice() : [unit.trait].filter(Boolean),
    weapon: unit.weapon,
    maxHp: unit.maxHp,
    atk: unit.atk,
    speed: unit.speed,
    skillAmp: unit.skillAmp,
    defense: unit.defense,
    skill: unit.skill,
    skillTooltip: unit.skillTooltip,
    poolExemptCopies: poolExemptCopyCount({ ...unit, tier }),
    statBonuses: {
      maxHp: Math.max(0, Number(unit.maxHp) - baseStats.maxHp),
      atk: Math.max(0, Number(unit.atk) - baseStats.atk),
      speed: Math.max(0, Number(unit.speed) - baseStats.speed),
      skillAmp: Math.max(0, Number(unit.skillAmp) - baseStats.skillAmp),
      defense: Math.max(0, Number(unit.defense) - baseStats.defense),
    },
  };
}

function currentPvpBaseStats(unit) {
  const base = rosterByName.get(unit?.name);
  if (!base) return {
    maxHp: Number(unit?.maxHp) || 1,
    atk: Number(unit?.atk) || 1,
    speed: Number(unit?.speed) || 1,
    skillAmp: Number(unit?.skillAmp) || 0,
    defense: Number(unit?.defense) || 0,
  };
  const current = createUnit(base, balance, Math.max(1, Math.min(3, Number(unit?.tier) || 1)));
  return Object.fromEntries(["maxHp", "atk", "speed", "skillAmp", "defense"].map((stat) => [stat, Number(current[stat]) || 0]));
}

function normalizeLocalPvpUnit(unit) {
  if (!unit) return null;
  const currentBase = currentPvpBaseStats(unit);
  const previousBase = unit.pvpBaseStats;
  for (const stat of ["maxHp", "atk", "speed", "skillAmp", "defense"]) {
    const bonus = previousBase
      ? Math.max(0, (Number(unit[stat]) || 0) - (Number(previousBase[stat]) || 0))
      : Math.max(0, (Number(unit[stat]) || 0) - currentBase[stat]);
    unit[stat] = currentBase[stat] + bonus;
  }
  unit.hp = unit.maxHp;
  unit.pvpBaseStats = currentBase;
  return unit;
}

function normalizeLocalPvpUnits() {
  if (state.gameMode !== "pvp") return;
  [...state.board, ...state.bench].filter(Boolean).forEach(normalizeLocalPvpUnit);
}

async function submitPvpPreparation() {
  if (state.gameMode !== "pvp" || (!state.pvpRoomId && !state.pvpQueuePreparation) || state.pvpSnapshotSubmitted || state.pvpSnapshotSubmitting) return;
  if (state.round < 5 || !(state.selectedAugments || []).some((augment) => Number(augment.stage) === 1)) return;
  state.pvpSnapshotSubmitting = true;
  state.pvpSnapshotError = "";
  refs.phase.textContent = "PvP 준비 덱을 제출하는 중입니다.";
  render();
  const snapshot = createPvpSnapshot(0);
  try {
    await ensurePvpSession();
    if (state.pvpQueuePreparation) {
      const result = await enqueueAsyncPvpMatch({
        ticketId: state.pvpQueueId,
        nickname: state.pvpQueueNickname || "플레이어",
        gameVersion: `${String(rankingConfig.majorVersion || "dev")}${state.debugMode ? "-local-test" : ""}`,
        snapshot,
        initialPool: createUnitPool(roster, balance),
      });
      state.pvpSnapshotSubmitted = true;
      refs.phase.textContent = result?.queue_status === "matched"
        ? "비동기 매칭 완료. PvP 게임으로 이동합니다."
        : `비동기 매칭 등록 완료. 같은 조건의 덱을 기다립니다. (${result?.queued_count || 1}/8)`;
      addLog(refs.phase.textContent, { force: true });
      saveController?.clearSave();
      render();
      window.setTimeout(() => {
        location.replace(result?.matched_room_id
          ? `./index.html?pvpRoom=${encodeURIComponent(result.matched_room_id)}`
          : "./pvp.html?tab=joined");
      }, 700);
      return;
    }
    const result = await submitPvpPveSnapshot(state.pvpRoomId, snapshot);
    const enteredFirstPlanning = result?.room_phase === "planning";
    state.pvpSnapshotSubmitted = !enteredFirstPlanning;
    state.pvpCurrentRound = result?.room_phase === "planning" ? 1 : 0;
    if (enteredFirstPlanning) {
      state.pvpRoomPhase = "planning";
      ignoredStalePvpReadyKey = "planning:1";
    }
    state.streakType = null;
    state.streakCount = 0;
    state.pvpStreakInitialized = true;
    refs.phase.textContent = result?.room_phase === "planning"
      ? state.pvpMode === "realtime"
        ? "첫 PvP 준비 시간이 시작되었습니다. 제한 시간 후 자동으로 전투합니다."
        : "전원 준비 완료. 첫 PvP 라운드가 열렸습니다."
      : `덱 제출 완료. 다른 참가자를 기다리는 중입니다. (${result?.ready_count || 0}/${result?.active_count || 0})`;
    addLog("PvP 준비 덱 제출 완료.", { force: true });
    await refreshPvpSharedPool();
    if (state.pvpSnapshotSubmitted) await refreshPvpMatch();
  } catch (error) {
    state.pvpSnapshotError = String(error?.message || error || "PvP 덱 제출 실패");
    refs.phase.textContent = `PvP 덱 제출 실패: ${state.pvpSnapshotError}`;
    addLog(`PvP 덱 제출 실패: ${state.pvpSnapshotError}`, { force: true });
  } finally {
    state.pvpSnapshotSubmitting = false;
    render();
  }
}

async function runRealtimePveRound() {
  const roomRound = Number(state.pvpCurrentRound) || 0;
  if (state.gameMode !== "pvp"
    || state.pvpMode !== "realtime"
    || state.pvpRoomPhase !== "pve"
    || roomRound < 1
    || roomRound > 4
    || state.pvpRealtimePveStarting
    || state.pvpRealtimePveWaiting
    || state.busy
    || roomRound <= Number(state.pvpRealtimePveCompletedRound || 0)) return;
  if (!state.pvpPhaseDeadline || new Date(state.pvpPhaseDeadline).getTime() > Date.now()) return;

  state.pvpRealtimePveStarting = true;
  refs.phase.textContent = `실시간 PvE ${roomRound}/4 전투를 시작합니다.`;
  render();
  try {
    state.round = roomRound;
    const result = await combat.simulate({
      seed: `${state.pvpRoomId}:realtime-pve:${roomRound}`,
    });
    if (!result) return;
    state.pvpRealtimePveCompletedRound = roomRound;
    state.pvpRealtimePveWaiting = true;
    const progress = await reportPvpRealtimePveRound(state.pvpRoomId, roomRound, result);
    state.pvpCurrentRound = Number(progress?.room_round) || roomRound;
    state.pvpRoomPhase = progress?.room_phase || "pve";
    state.pvpPhaseDeadline = progress?.phase_deadline || null;
    if (state.pvpCurrentRound > roomRound) state.pvpRealtimePveWaiting = false;
    refs.phase.textContent = state.pvpCurrentRound === 5
      ? "첫 증강을 선택하세요. 제한 시간이 끝나면 자동으로 선택됩니다."
      : state.pvpCurrentRound > roomRound
        ? `실시간 PvE ${state.pvpCurrentRound}/4 준비 단계입니다.`
        : `실시간 PvE ${roomRound}/4 완료. 다른 참가자를 기다리는 중입니다.`;
  } catch (error) {
    state.pvpRealtimePveWaiting = false;
    state.pvpSnapshotError = String(error?.message || error || "실시간 PvE 결과 저장 실패");
    refs.phase.textContent = `실시간 PvE 진행 실패: ${state.pvpSnapshotError}`;
    addLog(refs.phase.textContent, { force: true });
  } finally {
    state.pvpRealtimePveStarting = false;
    render();
  }
}

async function advanceRealtimeAugmentChoice() {
  const initialChoice = state.pvpRoomPhase === "pve" && Number(state.pvpCurrentRound) === 5;
  const offeredStage = Number(state.augmentStage) || 0;
  const unresolvedLaterChoice = offeredStage > 1
    && (state.augmentChoices || []).length > 0
    && !(state.selectedAugments || []).some((augment) => Number(augment.stage) === offeredStage);
  const laterChoice = state.pvpRoomPhase === "planning" && (unresolvedLaterChoice || hasPendingAugmentTarget());
  if (state.gameMode !== "pvp"
    || state.pvpMode !== "realtime"
    || (!initialChoice && !laterChoice)
    || state.pvpSnapshotSubmitted
    || state.pvpSnapshotSubmitting
    || state.pvpRealtimeAugmentAutoPicking) return;

  const targetStage = initialChoice ? 1 : Number(state.augmentStage) || 1;
  const alreadyPicked = (state.selectedAugments || []).some((augment) => Number(augment.stage) === targetStage);
  if (initialChoice && !alreadyPicked && !state.augmentOpen && !hasPendingAugmentTarget()) {
    augments.openAugments(1, { force: true });
  }
  if (initialChoice && alreadyPicked && !state.pendingAugmentTarget) {
    await submitPvpPreparation();
    return;
  }
  if (laterChoice && alreadyPicked && !state.pendingAugmentTarget) return;
  if (!state.pvpPhaseDeadline || new Date(state.pvpPhaseDeadline).getTime() > Date.now() + 2000) return;

  state.pvpRealtimeAugmentAutoPicking = true;
  try {
    if (!(state.selectedAugments || []).some((augment) => Number(augment.stage) === targetStage)) {
      const choice = (state.augmentChoices || []).find((augment) => augment.effect?.type !== "transcendThreeStar")
        || state.augmentChoices?.[0];
      if (choice) augments.selectAugment(choice.id);
      if (state.pendingAugmentTarget) {
        const source = state.board.some((unit) => unit?.tier >= 3) ? "board" : "bench";
        const index = state[source].findIndex((unit) => unit?.tier >= 3);
        if (index >= 0) augments.selectAugmentTarget(source, index);
      }
    }
  } finally {
    state.pvpRealtimeAugmentAutoPicking = false;
  }
}

function createPvpSnapshot(snapshotRound) {
  normalizeLocalPvpUnits();
  const board = state.board.map((unit, index) => pvpUnitSnapshot(unit, index, "board")).filter(Boolean);
  const bench = state.bench.map((unit, index) => pvpUnitSnapshot(unit, index, "bench")).filter(Boolean);
  const augments = (state.selectedAugments || []).map((augment) => ({
    id: augment.id,
    name: augment.name,
    rarity: augment.rarity,
    stage: augment.stage,
    targetUnitName: augment.targetUnitName || null,
  }));
  const traits = activeTraits();
  const economy = {
    hp: state.hp,
    gold: state.gold,
    level: state.level,
    xp: state.xp,
    round: snapshotRound,
    fourStarPromotionCount: Math.max(0, Number(state.fourStarPromotionCount) || 0),
    nextAugmentRarity: state.nextAugmentRarity || "",
    nextAugmentChoiceBonus: Math.max(0, Number(state.nextAugmentChoiceBonus) || 0),
    nextAugmentRerollPerCardBonus: Math.max(0, Number(state.nextAugmentRerollPerCardBonus) || 0),
    lumiIceShieldReady: Boolean(state.lumiIceShieldReady),
  };
  const checksum = createStableHash({ board, bench, augments, traits, economy });
  return { board, bench, augments, traits, economy, checksum };
}

async function submitPvpRoundPreparation() {
  if (state.gameMode !== "pvp" || !state.pvpRoomId || state.pvpSnapshotSubmitted || state.pvpSnapshotSubmitting) return;
  if (state.round < 5 || hasPendingAugmentChoice() || hasPendingAugmentTarget()) return;
  state.pvpSnapshotSubmitting = true;
  state.pvpSnapshotError = "";
  let deadlineExpired = false;
  refs.phase.textContent = "현재 덱을 PvP 라운드에 등록하는 중입니다.";
  render();
  try {
    await ensurePvpSession();
    const snapshot = createPvpSnapshot(state.pvpCurrentRound || 1);
    const result = await submitPvpRoundSnapshot(state.pvpRoomId, snapshot);
    state.pvpSnapshotSubmitted = true;
    state.pvpCurrentRound = Number(result?.room_round) || state.pvpCurrentRound || 1;
    refs.phase.textContent = Number(result?.ready_count) === Number(result?.active_count)
      ? `${state.pvpCurrentRound}라운드 대진을 준비하고 있습니다.`
      : `준비 완료. 다른 참가자를 기다리는 중입니다. (${result?.ready_count || 0}/${result?.active_count || 0})`;
    addLog(`PvP ${state.pvpCurrentRound}라운드 덱 제출 완료.`, { force: true });
    await refreshPvpSharedPool();
    await refreshPvpMatch();
  } catch (error) {
    const message = String(error?.message || error || "PvP 라운드 덱 제출 실패");
    deadlineExpired = /planning deadline has expired/i.test(message);
    state.pvpSnapshotError = deadlineExpired ? "준비 시간이 끝나 이전 라운드 덱으로 자동 제출합니다." : message;
    refs.phase.textContent = `PvP 준비 완료 실패: ${state.pvpSnapshotError}`;
    addLog(refs.phase.textContent, { force: true });
  } finally {
    state.pvpSnapshotSubmitting = false;
    render();
    if (deadlineExpired) pollPvpProgress();
  }
}

function hydratePvpUnit(snapshot) {
  const base = rosterByName.get(snapshot?.name);
  if (!base) return null;
  const unit = createUnit(base, balance, Math.max(1, Math.min(3, Number(snapshot.tier) || 1)));
  const currentBase = currentPvpBaseStats(unit);
  for (const stat of ["maxHp", "atk", "speed", "skillAmp", "defense"]) {
    const bonus = Math.max(0, Number(snapshot?.statBonuses?.[stat]) || 0);
    unit[stat] = currentBase[stat] + bonus;
  }
  unit.hp = unit.maxHp;
  unit.pvpBaseStats = currentBase;
  unit.traits = Array.isArray(snapshot.traits) ? snapshot.traits.slice() : [snapshot.trait].filter(Boolean);
  unit.poolExemptCopies = poolExemptCopyCount({ ...unit, poolExemptCopies: snapshot.poolExemptCopies });
  unit.fourStarAscended = Boolean(snapshot.fourStarAscended);
  unit.fourStarPromotionOrder = Math.max(0, Number(snapshot.fourStarPromotionOrder) || 0);
  return unit;
}

function hydratePvpAugments(snapshot, units) {
  return (snapshot?.augments || []).map((saved) => {
    const definition = augmentById.get(saved.id) || {};
    const target = units.find((unit) => unit.name === saved.targetUnitName);
    return {
      ...structuredClone(definition),
      ...saved,
      effect: structuredClone(definition.effect || saved.effect || {}),
      targetUnitId: target?.id || null,
    };
  });
}

function applyOwnPvpSnapshot(snapshot) {
  if (!snapshot) return;
  const board = Array(state.board.length).fill(null);
  const bench = Array(state.bench.length).fill(null);
  for (const saved of snapshot.board || []) {
    const index = Math.max(0, Math.min(board.length - 1, Number(saved.index) || 0));
    board[index] = hydratePvpUnit(saved);
  }
  for (const saved of snapshot.bench || []) {
    const index = Math.max(0, Math.min(bench.length - 1, Number(saved.index) || 0));
    bench[index] = hydratePvpUnit(saved);
  }
  const units = [...board, ...bench].filter(Boolean);
  state.board = board;
  state.bench = bench;
  state.selectedAugments = hydratePvpAugments(snapshot, units);
  state.gold = Math.max(0, Number(snapshot.economy?.gold) || 0);
  state.level = Math.max(1, Number(snapshot.economy?.level) || 1);
  state.xp = Math.max(0, Number(snapshot.economy?.xp) || 0);
  state.fourStarPromotionCount = Math.max(0, Number(snapshot.economy?.fourStarPromotionCount) || 0);
  state.nextAugmentRarity = snapshot.economy?.nextAugmentRarity || "";
  state.nextAugmentChoiceBonus = Math.max(0, Number(snapshot.economy?.nextAugmentChoiceBonus) || 0);
  state.nextAugmentRerollPerCardBonus = Math.max(0, Number(snapshot.economy?.nextAugmentRerollPerCardBonus) || 0);
  state.lumiIceShieldReady = Boolean(snapshot.economy?.lumiIceShieldReady);
  state.selected = null;
}

function createPvpEnemySetup(snapshot) {
  const enemies = Array(balance.battle.enemySlots).fill(null);
  const originalBoard = Array(32).fill(null);
  for (const saved of snapshot?.board || []) {
    const unit = hydratePvpUnit(saved);
    if (!unit) continue;
    const ownIndex = Math.max(0, Math.min(31, Number(saved.index) || 0));
    originalBoard[ownIndex] = unit;
    enemies[31 - ownIndex] = unit;
  }
  const bench = (snapshot?.bench || []).map(hydratePvpUnit).filter(Boolean);
  const units = originalBoard.filter(Boolean);
  const botLumiProducts = Array.isArray(snapshot?.economy?.botLumiProducts)
    ? snapshot.economy.botLumiProducts
    : [];
  const leadUnit = units.slice().sort((left, right) => Number(right.cost) - Number(left.cost) || Number(right.tier) - Number(left.tier))[0];
  const multiplyStat = (unit, stat, ratio) => {
    if (!unit) return;
    unit[stat] = Math.max(0, Math.round((Number(unit[stat]) || 0) * (1 + ratio) * 100) / 100);
    if (stat === "maxHp") unit.hp = unit.maxHp;
  };
  for (const productId of botLumiProducts) {
    if (productId === "attack-module") multiplyStat(leadUnit, "atk", 0.15);
    if (productId === "amplification-module") multiplyStat(leadUnit, "skillAmp", 0.18);
    if (productId === "survival-module") {
      multiplyStat(leadUnit, "maxHp", 0.15);
      multiplyStat(leadUnit, "defense", 0.10);
    }
    if (productId === "team-calibration") {
      units.forEach((unit) => {
        multiplyStat(unit, "atk", 0.06);
        multiplyStat(unit, "skillAmp", 0.06);
      });
    }
  }
  return {
    enemies,
    traits: snapshot?.traits || {},
    playerState: {
      selectedAugments: hydratePvpAugments(snapshot, [...units, ...bench]),
      gold: Number(snapshot?.economy?.gold) || 0,
      board: units,
      bench,
      temporaryBoosts: { hp: 0, atk: 0, skillAmp: 0 },
      augmentTranscendTargetId: null,
      fourStarPromotionCount: Math.max(0, Number(snapshot?.economy?.fourStarPromotionCount) || 0),
    },
  };
}

async function refreshPvpShopForNewRound(completedRound) {
  if (state.gameMode !== "pvp") return;
  state.shopTransactionPending = true;
  render();
  try {
    await refreshPvpSharedPool();
    if (state.shopLocked) {
      addLog("상점 잠금 유지: 현재 상점을 보존합니다.", { force: true });
      return;
    }
    rollShop();
    addLog(`PvP ${completedRound + 1}라운드 상점이 갱신되었습니다.`, { force: true });
  } catch (error) {
    addLog(`새 라운드 상점 갱신 실패: ${String(error?.message || error)}`, { force: true });
  } finally {
    state.shopTransactionPending = false;
    render();
  }
}

function enterNextPvpPlanning(roomRound) {
  const completedRound = Number(state.pvpMatch?.match_round) || Math.max(0, Number(roomRound) - 1);
  if (completedRound > (Number(state.pvpLastRewardedRound) || 0)) {
    grantRoundIncome(Boolean(state.pvpPendingResultWin));
    addXp(balance.player.combatXp, "PvP 전투 보상");
    if (lumiShop.openForRound(completedRound)) void refreshPvpPlayers();
    if (completedRound === 10) augments.offerForRound(14);
    if (completedRound === 20) augments.offerForRound(24);
    state.round = Math.max(state.round, 5 + completedRound);
    state.pvpLastRewardedRound = completedRound;
    void refreshPvpShopForNewRound(completedRound);
  }
  state.pvpCurrentRound = Math.max(1, Number(roomRound) || completedRound + 1);
  state.pvpSnapshotSubmitted = false;
  state.pvpRoomPhase = "planning";
  state.pvpPhaseDeadline = null;
  state.pvpRealtimeSnapshotChecksum = "";
  state.pvpMatchResolved = false;
  state.pvpMatch = null;
  state.pvpMatchError = "";
  state.pvpPendingResultWin = null;
  refs.phase.textContent = state.pvpMode === "realtime"
    ? `${state.pvpCurrentRound}라운드 준비가 시작되었습니다. 제한 시간 후 자동으로 전투합니다.`
    : `${state.pvpCurrentRound}라운드 준비: 덱을 강화한 뒤 준비 완료를 눌러주세요.`;
  addLog(`PvP ${state.pvpCurrentRound}라운드 준비가 시작되었습니다.`, { force: true });
}

function pvpDeadlineLabel(deadline) {
  const remainingSeconds = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = String(remainingSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

async function syncRealtimePvpDraft() {
  if (state.gameMode !== "pvp"
    || state.pvpMode !== "realtime"
    || !["pve", "planning"].includes(state.pvpRoomPhase)
    || state.pvpCurrentRound < 1
    || state.pvpSnapshotSubmitted
    || state.pvpRealtimeSnapshotSyncing
    || state.busy
    || hasPendingAugmentChoice()
    || hasPendingAugmentTarget()) return;
  const snapshotRound = state.pvpRoomPhase === "pve" ? 0 : state.pvpCurrentRound;
  const snapshot = createPvpSnapshot(snapshotRound);
  if (snapshot.checksum === state.pvpRealtimeSnapshotChecksum) return;
  state.pvpRealtimeSnapshotSyncing = true;
  try {
    const result = await syncPvpRealtimeSnapshot(state.pvpRoomId, snapshot);
    state.pvpRealtimeSnapshotChecksum = snapshot.checksum;
    state.pvpPhaseDeadline = result?.phase_deadline || state.pvpPhaseDeadline;
  } catch (error) {
    const message = String(error?.message || error);
    if (!/planning deadline has expired|not accepting realtime snapshots/i.test(message)) {
      state.pvpMatchError = message;
    }
  } finally {
    state.pvpRealtimeSnapshotSyncing = false;
  }
}

let pvpTickLoading = false;
let ignoredStalePvpReadyKey = "";
async function pollPvpProgress() {
  if (state.gameMode !== "pvp" || !state.pvpRoomId || state.busy || state.pvpFinished || pvpTickLoading) return;
  pvpTickLoading = true;
  try {
    await ensurePvpSession();
    const tick = await tickPvpRoom(state.pvpRoomId);
    if (tick) {
      const roomRound = Number(tick.room_round) || 0;
      const previousRoomRound = Number(state.pvpCurrentRound) || 0;
      state.pvpCurrentRound = state.pvpMode === "realtime" && tick.room_phase === "planning"
        ? roomRound
        : Math.max(state.pvpCurrentRound || 0, roomRound);
      state.pvpRoomPhase = tick.room_phase || state.pvpRoomPhase;
      state.pvpPhaseDeadline = tick.phase_deadline || null;
      if (state.pvpMode === "realtime" && tick.room_phase === "pve") {
        if (roomRound >= 1 && roomRound <= 4 && tick.caller_ready) {
          state.pvpRealtimePveCompletedRound = Math.max(Number(state.pvpRealtimePveCompletedRound) || 0, roomRound);
          state.pvpRealtimePveWaiting = true;
        } else if (roomRound > Number(state.pvpRealtimePveCompletedRound || 0)) {
          state.pvpRealtimePveWaiting = false;
        }
        if (roomRound === 5 && tick.caller_ready) state.pvpSnapshotSubmitted = true;
        if (roomRound >= 1 && roomRound <= 4 && tick.phase_deadline) {
          refs.phase.textContent = `실시간 PvE ${roomRound}/4: 자동 전투까지 ${pvpDeadlineLabel(tick.phase_deadline)}`;
        } else if (roomRound === 5 && tick.phase_deadline) {
          refs.phase.textContent = `첫 증강 선택: 자동 선택까지 ${pvpDeadlineLabel(tick.phase_deadline)}`;
        }
      }
      let callerSubmitted = Boolean(tick.caller_ready);
      const readyKey = `${tick.room_phase || ""}:${roomRound}`;
      if (state.pvpMode === "async" && readyKey === ignoredStalePvpReadyKey) {
        callerSubmitted = false;
      }
      if (tick.room_phase === "planning") {
        const completedMatchRound = Number(state.pvpMatch?.match_round) || previousRoomRound;
        if (state.pvpMatchResolved && roomRound > completedMatchRound) {
          enterNextPvpPlanning(roomRound);
        } else {
          state.pvpSnapshotSubmitted = callerSubmitted;
        }
      }
      if (callerSubmitted && tick.room_phase !== "pve" && !state.pvpSnapshotSubmitted) {
        state.pvpSnapshotSubmitted = true;
        if (tick.caller_auto_readied) {
          addLog(state.pvpMode === "realtime"
            ? "준비 시간이 끝나 현재 덱이 자동 확정되었습니다."
            : "준비 시간이 끝나 이전 라운드 덱이 자동 제출되었습니다.", { force: true });
        }
      }
      if (!state.pvpSnapshotSubmitted && tick.room_phase === "planning" && tick.phase_deadline) {
        refs.phase.textContent = state.pvpMode === "realtime"
          ? `${roomRound}라운드 준비: 자동 전투까지 ${pvpDeadlineLabel(tick.phase_deadline)}`
          : `${roomRound}라운드 준비: 자동 제출까지 ${pvpDeadlineLabel(tick.phase_deadline)}`;
      }
    }
  } catch (error) {
    state.pvpMatchError = String(error?.message || error || "PvP 진행 상태 확인 실패");
  } finally {
    pvpTickLoading = false;
  }
  await runRealtimePveRound();
  await advanceRealtimeAugmentChoice();
  await refreshPvpMatch();
}

async function refreshPvpMatch() {
  if (state.gameMode !== "pvp" || !state.pvpRoomId || !state.pvpSnapshotSubmitted || state.busy || state.pvpMatchLoading || state.pvpFinished) return;
  state.pvpMatchLoading = true;
  try {
    await ensurePvpSession();
    const room = await getPvpRoom(state.pvpRoomId);
    state.pvpMode = room?.mode || state.pvpMode;
    state.pvpRoomPhase = room?.phase || state.pvpRoomPhase;
    state.pvpPhaseDeadline = room?.phase_deadline || null;
    state.pvpCurrentRound = Number(room?.current_round) || state.pvpCurrentRound || 0;
    if (room?.phase === "finished" || room?.status === "finished") {
      state.pvpFinished = true;
      state.pvpMatchResolved = true;
      refs.phase.textContent = state.hp > 0 ? "PvP 게임이 종료되었습니다." : "PvP에서 탈락했습니다.";
      return;
    }
    if (state.pvpMatchResolved) {
      if (room?.phase === "planning" && Number(room.current_round) > Number(state.pvpMatch?.match_round || 0)) {
        enterNextPvpPlanning(room.current_round);
      } else {
        refs.phase.textContent = "다른 대진의 전투 결과를 기다리는 중입니다.";
      }
      return;
    }
    if (room?.phase === "pve") {
      refs.phase.textContent = state.pvpMode === "realtime"
        ? Number(room.current_round) === 5
          ? `첫 증강 선택: 자동 선택까지 ${pvpDeadlineLabel(room.phase_deadline)}`
          : `실시간 PvE ${room.current_round}/4: 자동 전투까지 ${pvpDeadlineLabel(room.phase_deadline)}`
        : "다른 참가자의 4라운드 PvE 완료를 기다리는 중입니다.";
      return;
    }
    let match = await preparePvpRound(state.pvpRoomId);
    if (!match) {
      const ownPlayer = await getOwnPvpRoomPlayer(state.pvpRoomId);
      if (ownPlayer?.id) {
        match = await getPvpRoundMatch(state.pvpRoomId, Number(room.current_round) || state.pvpCurrentRound, ownPlayer.id);
      }
    }
    if (!match) {
      refs.phase.textContent = room?.phase === "planning" && room?.phase_deadline
        ? `다른 참가자를 기다리는 중입니다. 자동 제출까지 ${pvpDeadlineLabel(room.phase_deadline)}`
        : "다른 참가자의 준비 완료를 기다리는 중입니다.";
      return;
    }
    if (match.match_status === "finished") {
      state.pvpMatch = match;
      state.pvpMatchResolved = true;
      refs.phase.textContent = "내 전투 결과가 확정되었습니다. 다른 대진을 기다리는 중입니다.";
      return;
    }
    const ownPlayerId = match.reporter_is_home ? match.home_player_id : match.away_player_id;
    const [opponentSnapshot, ownSnapshot] = await Promise.all([
      getPvpPlayerSnapshot(state.pvpRoomId, match.opponent_player_id),
      getPvpPlayerSnapshot(state.pvpRoomId, ownPlayerId),
    ]);
    if (ownSnapshot) applyOwnPvpSnapshot(ownSnapshot);
    state.pvpMatch = opponentSnapshot && ownSnapshot ? { ...match, opponentSnapshot, ownSnapshot } : null;
    state.pvpMatchError = !ownSnapshot
      ? "내 확정 덱 스냅샷을 기다리는 중입니다."
      : opponentSnapshot ? "" : "상대 덱 스냅샷을 기다리는 중입니다.";
    refs.phase.textContent = state.pvpMatch
      ? `${match.opponent_nickname || "상대"}와의 ${match.match_round}라운드 전투가 준비되었습니다.`
      : state.pvpMatchError;
  } catch (error) {
    state.pvpMatchError = String(error?.message || error || "PvP 대진을 불러오지 못했습니다.");
    refs.phase.textContent = `PvP 대진 준비 실패: ${state.pvpMatchError}`;
  } finally {
    state.pvpMatchLoading = false;
    render();
  }
  if (state.pvpMatch?.opponentSnapshot && !state.pvpMatchResolved) {
    await startPvpBattle();
  }
}

async function startPvpBattle() {
  const match = state.pvpMatch;
  if (!match?.opponentSnapshot || state.pvpMatchResolved || state.pvpAutoBattleStarting) return;
  state.pvpAutoBattleStarting = true;
  state.pvpRoomPhase = "combat";
  applyOwnPvpSnapshot(match.ownSnapshot);
  normalizeLocalPvpUnits();
  state.pvpLastReplay = structuredClone({
    matchId: match.match_id,
    round: match.match_round,
    seed: match.match_seed,
    opponentName: match.opponent_nickname || "상대",
    ownSnapshot: match.ownSnapshot,
    opponentSnapshot: match.opponentSnapshot,
  });
  const enemy = createPvpEnemySetup(match.opponentSnapshot);
  try {
    const result = await combat.simulate({
      mode: "pvp",
      round: match.match_round,
      seed: match.match_seed,
      enemies: enemy.enemies,
      enemyTraits: enemy.traits,
      enemyState: enemy.playerState,
      opponentName: match.opponent_nickname,
    });
    if (!result) return;
    const nextStreakType = result.win ? "win" : "loss";
    if (state.streakType === nextStreakType) state.streakCount += 1;
    else {
      state.streakType = nextStreakType;
      state.streakCount = 1;
    }
    const report = await reportPvpMatch(match.match_id, {
      won: result.win,
      damage: result.damage,
      battleResult: result,
    });
    if (Number.isFinite(Number(report?.reporter_health))) state.hp = Number(report.reporter_health);
    state.pvpMatchResolved = true;
    state.pvpPendingResultWin = result.win;
    state.pvpMatch = {
      ...match,
      match_status: report?.match_status || "finished",
      opponent_health: Number.isFinite(Number(report?.opponent_health))
        ? Number(report.opponent_health)
        : match.opponent_health,
    };
    refs.phase.textContent = report?.match_status === "resolving"
      ? "전투 결과를 제출했습니다. 상대 결과를 확인하는 중입니다."
      : result.win
        ? `PvP 승리! 상대에게 ${result.damage} 피해를 입혔습니다.`
        : `PvP 패배. 체력이 ${result.damage} 감소했습니다.`;
    addLog(refs.phase.textContent, { force: true });
    if (report?.room_phase === "planning") enterNextPvpPlanning(report.room_round);
    if (report?.room_phase === "finished") {
      state.pvpFinished = true;
      refs.phase.textContent = state.hp > 0 ? "최후의 생존자로 PvP에서 승리했습니다!" : "PvP에서 탈락했습니다.";
    }
  } catch (error) {
    state.pvpMatchError = String(error?.message || error || "PvP 결과 저장 실패");
    refs.phase.textContent = `PvP 결과 저장 실패: ${state.pvpMatchError}`;
    addLog(refs.phase.textContent, { force: true });
  } finally {
    state.pvpAutoBattleStarting = false;
    render();
  }
}

async function replayLastPvpBattle() {
  const replay = state.pvpLastReplay;
  if (state.gameMode !== "pvp" || !replay?.ownSnapshot || !replay?.opponentSnapshot || state.busy || state.pvpReplaying) return;
  const currentSnapshot = createPvpSnapshot(state.pvpCurrentRound || 0);
  state.pvpReplaying = true;
  try {
    applyOwnPvpSnapshot(structuredClone(replay.ownSnapshot));
    normalizeLocalPvpUnits();
    const enemy = createPvpEnemySetup(structuredClone(replay.opponentSnapshot));
    refs.phase.textContent = `${replay.opponentName}와의 ${replay.round}라운드 전투를 다시 재생합니다.`;
    render();
    await combat.simulate({
      mode: "pvp",
      replay: true,
      round: replay.round,
      seed: replay.seed,
      enemies: enemy.enemies,
      enemyTraits: enemy.traits,
      enemyState: enemy.playerState,
      opponentName: replay.opponentName,
    });
  } finally {
    applyOwnPvpSnapshot(currentSnapshot);
    state.pvpReplaying = false;
    refs.phase.textContent = `${replay.opponentName}와의 ${replay.round}라운드 이전 전투 재생 완료.`;
    addLog(`PvP ${replay.round}라운드 이전 전투를 다시 봤습니다.`, { force: true });
    render();
  }
}

let gameView;
let overlayView;
let combat;
let saveController;
function renderPvpQueuePreparation() {
  if (!state.pvpQueuePreparation || !pvpQueuePrepProgress) return;
  const stage = Math.max(1, Math.min(4, Number(state.round) || 1));
  const choosingAugment = Number(state.round) >= 5;
  pvpQueuePrepProgress.textContent = choosingAugment ? "첫 증강 선택" : `준비 ${stage}/4`;
}
const render = () => {
  gameView?.render();
  renderPvpQueuePreparation();
  saveController?.saveNow();
};
const renderCombatFrame = () => gameView?.renderCombatFrame();
const renderRanking = () => overlayView?.renderRanking();

function addLog(text, options = {}) {
  if (!state.debugMode && !options.force && !state.forceBattleLog) return;
  if (options.force) {
    state.forceBattleLog = true;
    refs.log?.closest(".log-wrap")?.removeAttribute("hidden");
  }
  const item = document.createElement("div");
  item.textContent = text;
  refs.log.prepend(item);
  while (refs.log.children.length > 9) refs.log.lastChild.remove();
}

saveController = createSaveController({
  state,
  balance,
  storageKey: state.pvpQueuePreparation
    ? `${gameSaveStorageKey}:pvp-queue:${state.pvpQueueId}`
    : state.gameMode === "pvp" ? `${gameSaveStorageKey}:pvp:${state.pvpRoomId}` : gameSaveStorageKey,
  addLog,
  autoRestore: () => state.gameMode === "pvp",
  shouldOfferRestore: () => !searchParams.has("pixi-benchmark")
    && !searchParams.has("combat-stress")
    && !searchParams.has("combat-determinism"),
});
pvpQueueExit?.addEventListener("click", () => {
  try {
    localStorage.removeItem(`${gameSaveStorageKey}:pvp-queue:${state.pvpQueueId}`);
  } catch {
    // Returning to the lobby must still work when local storage is unavailable.
  }
  location.href = "./pvp.html?tab=joined";
});
const restoredGame = saveController.restoreSave();
if (restoredGame) {
  state.selectedAugments = (state.selectedAugments || []).map((saved) => {
    const definition = augmentById.get(saved?.id);
    if (!definition) return saved;
    return {
      ...structuredClone(definition),
      ...saved,
      effect: structuredClone(definition.effect || saved.effect || {}),
    };
  });
  const ascendedUnits = [...state.board, ...state.bench].filter((unit) => unit?.fourStarAscended);
  const usedOrders = new Set(ascendedUnits
    .map((unit) => Math.max(0, Math.round(Number(unit.fourStarPromotionOrder) || 0)))
    .filter(Boolean));
  let fallbackOrder = 1;
  for (const unit of ascendedUnits) {
    if (Number(unit.fourStarPromotionOrder) > 0) continue;
    while (usedOrders.has(fallbackOrder)) fallbackOrder += 1;
    unit.fourStarPromotionOrder = fallbackOrder;
    usedOrders.add(fallbackOrder);
  }
}
if (state.gameMode === "pvp") normalizeLocalPvpUnits();
if (state.gameMode === "pvp" && state.pvpSnapshotSubmitted && !state.pvpStreakInitialized) {
  state.streakType = null;
  state.streakCount = 0;
  state.pvpStreakInitialized = true;
}

const audio = createAudioController({ state, refs, bgmConfig });
const presence = createPresenceController({ refs, presenceConfig, rankingConfig });
const globalChat = createGlobalChat({ presenceConfig, rankingConfig });
const ranking = createRankingController({ state, refs, rankingConfig, rankingStorageKey, renderRanking, render });
const { captureDeathRecord, loadRankings, submitRanking } = ranking;
const patchNotes = createPatchNotesController({ state, patchNotesConfig, patchNotesStorageKey, render });
const { closePatchNotes, initPatchNotes, openPatchNotes } = patchNotes;
const communityBoard = createCommunityBoardController({
  state,
  refs,
  boardConfig: communityBoardConfig,
  storageKey: communityBoardStorageKey,
  render,
});
const augments = createAugmentController({
  state,
  augmentSettings,
  augmentPools,
  roster,
  makeUnit,
  ownedUnits,
  render,
  addLog,
  triggerRounds: state.gameMode === "pvp" ? { 1: 4, 2: 14, 3: 24 } : augmentSettings.triggerRounds,
  sharedRaritySeed: state.gameMode === "pvp" ? (state.pvpRoomId || state.pvpQueueId) : "",
  canModify: canModifyPvpLineup,
  onSelectionComplete: async () => {
    try {
      await syncOwnedUnitsToSharedPool();
      const initialPreparationComplete = state.pvpMode === "realtime"
        ? state.pvpRoomPhase === "pve" && Number(state.pvpCurrentRound) === 5
        : Number(state.pvpCurrentRound) === 0;
      if (!state.pvpSnapshotSubmitted && initialPreparationComplete) await submitPvpPreparation();
    } catch (error) {
      addLog(`공유 기물 풀 동기화 실패: ${String(error?.message || error)}`, { force: true });
    }
  },
});
const progression = createProgressionController({ state, balance, addLog, render, boardLimit });
const { addXp, buyXp, grantRoundIncome, levelXpLabel, xpToNextLevel } = progression;
const traits = createTraitController({ state, traitRules, boardUnits });
const { activeTraits, activeTraitTier, applySynergy, nextTraitNeed } = traits;
const hiddenTraits = createHiddenTraitController({ hiddenTraitRules, boardUnits });
const skillEffects = createSkillEffectRenderer();
skillEffects.setTimeScale?.(1);
const isLowSpecEffectMode = () => {
  const mobile = balance.battle.effectBudget?.mobileLowSpec || {};
  const maxWidth = mobile.maxWidth ?? 760;
  return window.innerWidth <= maxWidth || window.matchMedia?.("(pointer: coarse)")?.matches;
};
const effectiveEffectBudget = () => {
  const budget = balance.battle.effectBudget || {};
  if (!isLowSpecEffectMode()) return budget;
  return { ...budget, ...(budget.mobileLowSpec || {}) };
};
const playBudgetedSkillVisual = (spec) => {
  const budget = effectiveEffectBudget();
  const max = budget.maxConcurrentSkillEffects ?? 18;
  const current = skillEffects.activeCount?.() ?? 0;
  const important = ["fate-absorb", "shoichi-dagger-ride", "zahir-vayvayastra", "bianca-reign", "yuki-cast", "yuki-bloom"].includes(spec?.type);
  if (!important && current >= max) return;
  skillEffects.play(spec);
};
if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
  exposeLocalDebug("__rumiaSkillEffects", skillEffects);
  if (searchParams.has("pixi-benchmark")) {
    window.setTimeout(async () => {
      const allTypes = skillEffects.effectTypes || ["zahir-vayvayastra", "elena-danse-macabre", "priya-earth-echo", "bianca-reign"];
      const types = searchParams.get("pixi-benchmark") === "all" ? allTypes : ["zahir-vayvayastra", "elena-danse-macabre", "priya-earth-echo", "bianca-reign"];
      const requestedCount = Number(searchParams.get("pixi-count"));
      const results = [];
      for (const type of types) {
        const count = Number.isFinite(requestedCount) && requestedCount > 0 ? requestedCount : type === "zahir-vayvayastra" ? 8 : 6;
        const pixi = await skillEffects.benchmark({ renderer: "pixi", type, count, samples: searchParams.get("pixi-benchmark") === "all" ? 20 : 45 });
        const legacy = searchParams.get("pixi-benchmark") === "all"
          ? null
          : await skillEffects.benchmark({ renderer: "legacy", type, count, samples: 45 });
        results.push({ type, pixi, legacy });
        console.info("[rumia-pixi-benchmark-step]", JSON.stringify({ type, pixi, legacy }));
      }
      console.info("[rumia-pixi-benchmark]", JSON.stringify(results));
    }, 800);
  }
}
const {
  activeHiddenTraits,
  applyAbsorbedStats,
  combatAbsorptions,
  prepareDefeatEffects,
  prepareKillEffects,
  prepareOpeningEffects,
  markPaintTarget,
  consumePaintDetonation,
  triggerFeastEffects,
  triggerKillUtilities,
  triggerExclusiveRescue,
  triggerDefeatEffects,
  triggerKillEffects,
  displayNameFor,
} = hiddenTraits;
const shop = createShopController({
  state,
  balance,
  roster,
  makeUnit,
  sample,
  boardUnits,
  boardLimit,
  addLog,
  render,
  reservePoolUnit: state.pvpRoomId ? reserveSharedPoolUnit : null,
  releasePoolUnit: state.pvpRoomId ? releaseSharedPoolUnit : null,
  syncPoolHoldings: state.pvpRoomId ? syncOwnedUnitsToSharedPool : null,
  canModify: canModifyPvpLineup,
});
const { buyUnit, debugRecruitUnit, grantBonusUnit, moveSelected, moveUnit, rollShop, sellSelectedUnit } = shop;

const lumiShop = createLumiShopController({
  state,
  balance,
  config: lumiShopConfig,
  roster,
  ownedUnits,
  grantBonusUnit,
  addLog,
  render,
  canModify: canModifyPvpLineup,
  prepareSharedOffers: state.pvpRoomId ? prepareSharedPvpLumiShop : null,
  claimSharedProduct: state.pvpRoomId ? claimSharedPvpLumiProduct : null,
});

const unitView = createUnitView({
  state,
  refs,
  balance,
  sellValue,
  activeTraits,
  applySynergy,
  displayNameFor,
  render,
  selectAugmentTarget: augments.selectAugmentTarget,
  selectLumiShopTarget: lumiShop.selectTarget,
});
const shopView = createShopView({
  state,
  refs,
  balance,
  roster,
  buyUnit,
  displayNameFor,
  augmentPools,
  canModify: canModifyPvpLineup,
});
const traitView = createTraitView({ state, refs, roster, traitRules, hiddenTraitRules, ownedUnits, activeTraits, activeHiddenTraits, activeTraitTier, nextTraitNeed, displayNameFor });
overlayView = createOverlayView({ state, refs, rankingConfig, patchNotesConfig, augmentSettings });
const battlefieldView = createBattlefieldView({
  state,
  refs,
  balance,
  unitNode: unitView.unitNode,
  moveUnit,
  moveSelected,
  placeDebugDummy,
  previewBossEnemies: () => combat.previewBossEnemies(),
  temporaryBoostConfig,
  temporaryBoostPercent,
  fourStarPromotionStatus: augments.fourStarPromotionStatus,
});
const lumiShopView = createLumiShopView({ state, refs });

combat = createCombatController({
  state,
  balance,
  bossRoster,
  bossPatterns,
  roster,
  refs,
  sample,
  boardUnits,
  boardLimit,
  addLog,
  activeTraits,
  applySynergy,
  applyAbsorbedStats,
  combatAbsorptions,
  prepareDefeatEffects,
  prepareKillEffects,
  prepareOpeningEffects,
  markPaintTarget,
  consumePaintDetonation,
  triggerFeastEffects,
  triggerKillUtilities,
  triggerExclusiveRescue,
  triggerDefeatEffects,
  triggerKillEffects,
  playSkillVisual: playBudgetedSkillVisual,
  clearSkillVisuals: skillEffects.clear,
  setCombatTimeScale: skillEffects.setTimeScale,
  render,
  renderCombatFrame,
  rollShop,
  addXp,
  grantRoundIncome,
  captureDeathRecord,
  offerAugments: augments.offerForRound,
  offerLumiShop: lumiShop.openForRound,
  sleep,
});

installCombatStressTools({ state, balance, roster, makeUnit, render, combat, searchParams });

gameView = createGameView({
  state,
  refs,
  balance,
  audio,
  combat,
  boardUnits,
  boardLimit,
  levelXpLabel,
  xpToNextLevel,
  syncLocalTestGold,
  views: { battlefield: battlefieldView, lumiShop: lumiShopView, overlays: overlayView, shop: shopView, traits: traitView, unit: unitView },
  renderCommunityBoard: communityBoard.renderCommunityBoard,
});

function buyTemporaryBoost(stat) {
  if (!canModifyPvpLineup()) return;
  const config = temporaryBoostConfig();
  const boost = (config.stats || []).find((item) => item.id === stat);
  const cost = config.cost ?? 20;
  const amount = config.amount ?? 0.1;
  if (!boost || state.busy) return;
  if (state.gold < cost) return addLog(`${boost.label} 강화에는 ${cost}크레딧이 필요합니다.`);
  state.gold -= cost;
  state.temporaryBoosts[stat] = (state.temporaryBoosts[stat] || 0) + amount;
  addLog(`${boost.label} 강화 구매: 다음 전투 ${boost.label} +${temporaryBoostPercent(stat)}%.`);
  render();
}

async function rerollShop() {
  if (state.busy || state.shopTransactionPending || !canModifyPvpLineup()) return;
  if (!augmentCanRerollShop(state)) return addLog("상점 리롤을 사용할 수 없습니다.");
  const free = Math.max(0, state.freeShopRerollsRemaining || 0);
  const cost = free > 0 ? 0 : balance.shop.rerollCost;
  if (state.gold < cost) return addLog(`새로고침에는 ${cost} 크레딧이 필요합니다.`);
  if (state.gameMode === "pvp") {
    state.shopTransactionPending = true;
    render();
    try {
      await refreshPvpSharedPool();
    } catch (error) {
      addLog(`공유 재고 확인 실패: ${String(error?.message || error)}`, { force: true });
      render();
      return;
    } finally {
      state.shopTransactionPending = false;
      render();
    }
  }
  if (free > 0) {
    state.freeShopRerollsRemaining -= 1;
    if (state.shopOddsMaxLevelRerollsRemaining > 0) state.shopOddsMaxLevelRerollsRemaining -= 1;
  }
  else state.gold -= cost;
  addLog(cost ? `상점 새로고침: ${cost} 크레딧 사용.` : "상점 새로고침: 무료 리롤 사용.");
  rollShop();
}

function setRankingSort(sortBy) {
  if (state.rankingSortBy === sortBy) state.rankingSortOrder = state.rankingSortOrder === "desc" ? "asc" : "desc";
  else {
    state.rankingSortBy = sortBy;
    state.rankingSortOrder = "desc";
  }
  render();
  loadRankings(true);
}

function setRankingVersionFilter(version) {
  state.rankingVersionFilter = version || "all";
  state.rankingLoaded = false;
  render();
  loadRankings(true);
}

function setShopPanelTab(tab) {
  state.shopPanelTab = tab === "metrics" ? "metrics" : "shop";
  render();
}

function setCombatMetricMode(mode) {
  if (!["damageDone", "damageTaken", "healingDone"].includes(mode)) return;
  state.combatMetricMode = mode;
  state.shopPanelTab = "metrics";
  render();
}

exposeLocalDebug("__rumiaSetShopPanelTab", setShopPanelTab);
exposeLocalDebug("__rumiaSetCombatMetricMode", setCombatMetricMode);

function setTraitModal(type, open, trait = "") {
  if (type === "roster") {
    state.traitRosterTrait = trait;
    state.traitRosterOpen = open;
  } else state.traitTableOpen = open;
  render();
}

function toggleActiveAugments() {
  state.activeAugmentsCollapsed = !state.activeAugmentsCollapsed;
  render();
}

bindUiEvents({
  $,
  refs,
  state,
  balance,
  actions: {
    addLog,
    setShopPanelTab,
    setCombatMetricMode,
    debugRecruitUnit,
    debugSelectAugment: augments.debugSelectAugment,
    toggleDebugDummyPlacement,
    clearDebugDummies,
    debugJumpRound,
    openAugments: augments.openAugments,
    openAugmentDetail: augments.openAugmentDetail,
    toggleActiveAugments,
    reopenAugments: augments.reopenAugments,
    closeAugments: augments.closeAugments,
    rerollAugments: augments.rerollAugments,
    rerollAugmentSlot: augments.rerollAugmentSlot,
    selectAugment: augments.selectAugment,
    reopenLumiShop: lumiShop.reopen,
    closeLumiShop: lumiShop.close,
    skipLumiShop: lumiShop.skip,
    buyLumiShopProduct: lumiShop.buy,
    cancelLumiShopTarget: lumiShop.cancelTarget,
    beginFourStarPromotion: augments.beginFourStarPromotion,
    buyTemporaryBoost,
    rerollShop,
    rollShop,
    render,
    simulate: async () => {
      if (state.gameMode === "pvp" && state.pvpFinished) return;
      if (lumiShop.isPending()) {
        addLog("[루미 상점] 구매하거나 건너뛰어야 다음 전투를 시작할 수 있습니다.", { force: true });
        if (state.lumiShopPendingProductId) lumiShop.cancelTarget();
        else lumiShop.reopen();
        return;
      }
      if (state.gameMode === "pvp" && state.pvpMode === "realtime" && state.pvpRoomPhase === "pve") return;
      if (state.gameMode === "pvp" && state.pvpSnapshotSubmitted) {
        if (!state.pvpMatch?.opponentSnapshot) {
          await refreshPvpMatch();
          return;
        }
        await startPvpBattle();
        return;
      }
      if (state.gameMode === "pvp" && state.pvpCurrentRound > 0) {
        if (hasPendingAugmentChoice()) {
          addLog("[증강] 증강을 선택해야 PvP 준비를 완료할 수 있습니다.", { force: true });
          augments.reopenAugments();
          return;
        }
        if (hasPendingAugmentTarget()) {
          addLog("[증강] 대상을 선택해야 PvP 준비를 완료할 수 있습니다.", { force: true });
          render();
          return;
        }
        await submitPvpRoundPreparation();
        return;
      }
      if (hasPendingAugmentChoice()) {
        addLog("[증강] 증강을 선택해야 다음 전투를 시작할 수 있습니다.", { force: true });
        augments.reopenAugments();
        return;
      }
      if (hasPendingAugmentTarget()) {
        addLog("[증강] 초월 대상을 선택해야 다음 전투를 시작할 수 있습니다.", { force: true });
        render();
        return;
      }
      saveController?.saveNow();
      combat.simulate();
    },
    replayLastPvpBattle,
    buyXp: () => {
      if (canModifyPvpLineup()) buyXp();
    },
    sellSelectedUnit,
    toggleBgm: audio.toggleBgm,
    loadRankings,
    submitRanking,
    setRankingSort,
    setRankingVersionFilter,
    closePatchNotes,
    openPatchNotes,
    openTraitRoster: (trait) => setTraitModal("roster", true, trait),
    closeTraitRoster: () => setTraitModal("roster", false),
    openTraitTable: () => setTraitModal("table", true),
    closeTraitTable: () => setTraitModal("table", false),
  },
});

communityBoard.bindCommunityBoardEvents();
addLog("상점에서 캐릭터를 영입하고 보드로 드래그하세요.");
loadRankings();
presence.start();
globalChat.start();
pvpSocial?.start();
void pvpNotifications.start();
if (state.gameMode === "pvp") {
  let slowPollTicks = 0;
  window.setInterval(() => {
    const lumiShopWasPending = lumiShop.isPending();
    if (lumiShopWasPending) lumiShop.expireIfNeeded();
    if (document.hidden) return;
    slowPollTicks += 1;
    if (state.pvpMode === "realtime" || slowPollTicks % 5 === 0) pollPvpProgress();
    if (lumiShopWasPending && slowPollTicks % 2 === 0) void refreshPvpLumiShopClaims();
    if ((state.pvpMode === "realtime" && ["pve", "planning"].includes(state.pvpRoomPhase)) || lumiShopWasPending) render();
  }, 1000);
  window.setInterval(() => {
    if (!document.hidden) syncRealtimePvpDraft();
  }, 500);
  window.setInterval(() => {
    if (document.hidden || state.pvpMode !== "realtime" || !state.pvpPhaseDeadline) return;
    const remainingMs = new Date(state.pvpPhaseDeadline).getTime() - Date.now();
    if (state.pvpRoomPhase === "pve") {
      if (remainingMs <= 0) runRealtimePveRound();
      if (remainingMs <= 2000) advanceRealtimeAugmentChoice();
    } else if (state.pvpRoomPhase === "planning") {
      if (remainingMs <= 2000) advanceRealtimeAugmentChoice();
      if (remainingMs <= 0 && !state.pvpSnapshotSubmitted) pollPvpProgress();
    }
  }, 100);
}
function initializeModeEntry() {
  if (state.gameMode === "pvp") return false;
  let alreadySeen = false;
  try {
    alreadySeen = window.localStorage.getItem(modeEntryStorageKey) === "1";
  } catch {
    alreadySeen = false;
  }
  if (alreadySeen) return false;
  const modal = document.getElementById("modeEntryModal");
  const pveButton = document.getElementById("modeEntryPve");
  const pvpButton = document.getElementById("modeEntryPvp");
  if (!modal || !pveButton || !pvpButton) return false;
  const remember = () => {
    try {
      window.localStorage.setItem(modeEntryStorageKey, "1");
    } catch {
      // Storage may be unavailable in private browsing; the choice still works for this visit.
    }
  };
  modal.hidden = false;
  pveButton.addEventListener("click", () => {
    remember();
    modal.hidden = true;
    initPatchNotes();
  }, { once: true });
  pvpButton.addEventListener("click", () => {
    remember();
    window.location.href = "./pvp.html";
  }, { once: true });
  window.requestAnimationFrame(() => pveButton.focus());
  return true;
}

if (state.gameMode !== "pvp" && !lumiShopDebugRound && !initializeModeEntry()) initPatchNotes();
if (state.gameMode === "pvp") {
  refs.phase.textContent = state.pvpSnapshotSubmitted
    ? "PvP 준비 덱 제출 완료."
    : state.pvpQueuePreparation ? "비동기 PvP 준비: 4라운드 후 첫 증강을 선택하세요." : "PvP 방 정보를 불러오는 중입니다.";
}
if (state.gameMode === "pvp" && state.pvpRoomId) pollPvpProgress();
async function runPvpInitStep(label, task) {
  try {
    return await task();
  } catch (error) {
    throw new Error(`${label}: ${String(error?.message || error)}`, { cause: error });
  }
}

function hasSubmittedCurrentPvpSnapshot(room, player, snapshot) {
  if (!room || !player || !["pve", "planning"].includes(room.phase)) return false;
  const requiredRound = room.phase === "pve" ? 0 : Math.max(1, Number(room.current_round) || 1);
  return Boolean(player.ready) && Number(snapshot?.round) === requiredRound;
}

async function initializeGameShop() {
  if (state.gameMode === "pvp") state.shopTransactionPending = true;
  try {
    if (state.pvpQueuePreparation) {
      await runPvpInitStep("비동기 매칭 인증 실패", ensurePvpSession);
      state.pvpMode = "async";
      state.pvpRoomPhase = "pve";
      state.pvpCurrentRound = 0;
    } else if (state.gameMode === "pvp") {
      const room = await runPvpInitStep("PvP 방 조회 실패", () => getPvpRoom(state.pvpRoomId));
      state.pvpMode = room?.mode || "async";
      state.pvpRoomPhase = room?.phase || state.pvpRoomPhase;
      state.pvpPhaseDeadline = room?.phase_deadline || null;
      state.pvpCurrentRound = state.pvpMode === "realtime"
        ? Number(room?.current_round) || 0
        : Math.max(state.pvpCurrentRound || 0, Number(room?.current_round) || 0);
      state.pvpFinished = room?.phase === "finished" || room?.status === "finished";
      const ownPlayer = await runPvpInitStep("PvP 참가자 조회 실패", () => getOwnPvpRoomPlayer(state.pvpRoomId));
      if (!ownPlayer) throw new Error("PvP room membership not found");
      await runPvpInitStep("PvP 참가자 목록 조회 실패", refreshPvpPlayers);
      state.pvpOwnPlayerId = ownPlayer.id;
      if (Number.isFinite(Number(ownPlayer.health))) state.hp = Number(ownPlayer.health);
      const latestSnapshot = ownPlayer.id
        ? await runPvpInitStep("PvP 덱 조회 실패", () => getPvpPlayerSnapshot(state.pvpRoomId, ownPlayer.id))
        : null;
      if (state.pvpMode === "async") {
        if (!restoredGame && latestSnapshot) {
          applyOwnPvpSnapshot(latestSnapshot);
          state.round = Math.max(5, Number(latestSnapshot?.economy?.round) || 5);
        }
        const acceptsLineupChanges = ["pve", "planning"].includes(room.phase);
        state.pvpSnapshotSubmitted = !acceptsLineupChanges
          || hasSubmittedCurrentPvpSnapshot(room, ownPlayer, latestSnapshot);
        if (acceptsLineupChanges && ownPlayer.ready && !state.pvpSnapshotSubmitted) {
          ignoredStalePvpReadyKey = `${room.phase}:${Number(room.current_round) || 0}`;
        }
      }
      if (state.pvpMode === "realtime") {
        if (latestSnapshot) applyOwnPvpSnapshot(latestSnapshot);
        state.round = room?.phase === "pve"
          ? Math.max(1, Math.min(5, Number(room.current_round) || 1))
          : Math.max(5, (Number(room?.current_round) || 1) + 4);
        const openingPveRound = room?.phase === "pve" && Number(room.current_round) >= 1 && Number(room.current_round) <= 4;
        if (openingPveRound && ownPlayer?.ready) {
          state.pvpRealtimePveCompletedRound = Number(room.current_round);
          state.pvpRealtimePveWaiting = true;
        }
        state.pvpSnapshotSubmitted = openingPveRound ? false : Boolean(ownPlayer?.ready);
      }
      lumiShop.resolveIfStale({
        roomPhase: room?.phase,
        currentRound: room?.current_round,
        snapshotSubmitted: state.pvpSnapshotSubmitted,
      });
      if (!state.pvpLastReplay) {
        state.pvpLastReplay = await runPvpInitStep("PvP 리플레이 조회 실패", () => getLatestPvpReplay(state.pvpRoomId));
      }
      await runPvpInitStep("PvP 공유 기물 풀 조회 실패", refreshPvpSharedPool);
    }
    state.shopTransactionPending = false;
    if (restoredGame && state.shop.some(Boolean)) render();
    else rollShop();
  } catch (error) {
    state.shopTransactionPending = false;
    state.pvpSnapshotError = String(error?.message || error || "PvP 공유 기물 풀을 불러오지 못했습니다.");
    if (/PvP room membership not found/i.test(state.pvpSnapshotError)) {
      window.location.replace("./pvp.html?notice=membership");
      return;
    }
    refs.phase.textContent = state.pvpSnapshotError;
    addLog(state.pvpSnapshotError, { force: true });
    render();
  }
}

initializeGameShop().then(() => {
  if (state.debugMode && lumiShopDebugRound) lumiShop.openForRound(lumiShopDebugRound, { force: true });
});
