import { augmentPools, augmentSettings, balance, bgmConfig, bossPatterns, bossRoster, communityBoardConfig, communityBoardStorageKey, gameSaveStorageKey, hiddenTraitRules, patchNotesConfig, patchNotesStorageKey, pvpRoomsConfig, pvpPendingSquadStorageKey, rankingConfig, rankingStorageKey, roster, traitRules } from "./src/core/data.js";
import { createGameState } from "./src/core/state.js";
import { createPvpSnapshotId, createStableHash } from "./src/core/rng.js";
import { createSaveController } from "./src/core/save.js";
import { createUnitPool, makeUnit as createUnit, sample, sellValue, sleep } from "./src/core/units.js";
import { createCombatController } from "./src/systems/combat.js";
import { createProgressionController } from "./src/systems/progression.js";
import { createAugmentController } from "./src/systems/augments.js";
import { augmentBoardLimitAdd, augmentCanRerollShop, augmentTemporaryBoostConfig } from "./src/systems/augmentEffects.js";
import { createHiddenTraitController } from "./src/systems/hiddenTraits.js";
import { createShopController } from "./src/systems/shop.js";
import { createTraitController } from "./src/systems/traits.js";
import { createAudioController } from "./src/ui/audio.js";
import { createCommunityBoardController } from "./src/ui/communityBoard.js";
import { $, createRefs } from "./src/ui/dom.js";
import { bindUiEvents } from "./src/ui/events.js";
import { createPatchNotesController } from "./src/ui/patchNotes.js";
import { createRankingController } from "./src/ui/ranking.js";
import { createBattlefieldView } from "./src/ui/views/battlefieldView.js";
import { createGameView } from "./src/ui/views/gameView.js";
import { createOverlayView } from "./src/ui/views/overlayView.js";
import { createShopView } from "./src/ui/views/shopView.js";
import { createTraitView } from "./src/ui/views/traitView.js";
import { createUnitView } from "./src/ui/views/unitView.js";
import { createSkillEffectRenderer } from "./src/ui/skillEffects.js";
import { installCombatStressTools } from "./src/systems/combat/debugStress.js";

const { state, syncLocalTestGold } = createGameState({ balance, roster, createUnitPool, communityBoardConfig, pvpRoomsConfig });
const refs = createRefs();
refs.log?.closest(".log-wrap")?.toggleAttribute("hidden", !state.debugMode);
const boardUnits = () => state.board.filter(Boolean);
const ownedUnits = () => [...state.board, ...state.bench].filter(Boolean);
const boardLimit = () => Math.max(1, state.level + augmentBoardLimitAdd(state));
const makeUnit = (base, tier = 1) => createUnit(base, balance, tier);
const temporaryBoostConfig = () => augmentTemporaryBoostConfig(state, balance.battle.temporaryBoosts || { cost: 20, amount: 0.1, stats: [] });
const temporaryBoostPercent = (stat) => Math.round((state.temporaryBoosts?.[stat] || 0) * 100);
const searchParams = new URLSearchParams(location.search);

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
  return {
    source,
    index,
    name: unit.name,
    displayName: displayNameFor(unit),
    tier: unit.tier,
    cost: unit.cost,
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
  };
}

function savePvpPendingSquad(stage, board = state.board) {
  const payload = {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    stage,
    round: state.round,
    hp: state.hp,
    level: state.level,
    gold: state.gold,
    board: board.map((unit, index) => pvpUnitSnapshot(unit, index, "board")).filter(Boolean),
    bench: state.bench.map((unit, index) => pvpUnitSnapshot(unit, index, "bench")).filter(Boolean),
  };
  payload.lineupHash = createStableHash({
    board: payload.board.map(({ name, tier, index, source }) => ({ name, tier, index, source })),
    bench: payload.bench.map(({ name, tier, index, source }) => ({ name, tier, index, source })),
  });
  payload.snapshotId = createPvpSnapshotId(payload);
  localStorage.setItem(pvpPendingSquadStorageKey, JSON.stringify(payload));
  return payload;
}

function offerPvpEntry(stage, board = state.board) {
  if (pvpRoomsConfig.enabled === false) return;
  if (stage !== balance.battle.bossInterval) return;
  const wantsPvp = window.confirm("15라 보스를 격파했습니다.\n현재 덱으로 비동기 PvP 방 목록으로 이동할까요?");
  if (!wantsPvp) return;
  savePvpPendingSquad(stage, board);
  window.location.href = "./pvp.html";
}

let gameView;
let overlayView;
let combat;
let saveController;
const render = () => {
  gameView?.render();
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
  storageKey: gameSaveStorageKey,
  addLog,
  shouldOfferRestore: () => !searchParams.has("pixi-benchmark") && !searchParams.has("combat-stress") && !searchParams.has("combat-determinism"),
});
const restoredGame = saveController.restoreSave();

const audio = createAudioController({ state, refs, bgmConfig });
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
});
const progression = createProgressionController({ state, balance, addLog, render, boardLimit });
const { addXp, buyXp, grantRoundIncome, levelXpLabel, xpToNextLevel } = progression;
const traits = createTraitController({ state, traitRules, boardUnits });
const { activeTraits, activeTraitTier, applySynergy, nextTraitNeed } = traits;
const hiddenTraits = createHiddenTraitController({ hiddenTraitRules, boardUnits });
const skillEffects = createSkillEffectRenderer();
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
const shop = createShopController({ state, balance, roster, makeUnit, sample, boardUnits, boardLimit, addLog, render });
const { buyUnit, debugRecruitUnit, moveSelected, moveUnit, rollShop, sellSelectedUnit } = shop;

const unitView = createUnitView({ state, refs, balance, sellValue, activeTraits, applySynergy, displayNameFor, render, selectAugmentTarget: augments.selectAugmentTarget });
const shopView = createShopView({ state, refs, balance, roster, buyUnit, displayNameFor, augmentPools });
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
});

combat = createCombatController({
  state,
  balance,
  bossRoster,
  bossPatterns,
  roster,
  refs,
  sample,
  boardUnits,
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
  render,
  renderCombatFrame,
  rollShop,
  addXp,
  grantRoundIncome,
  captureDeathRecord,
  offerAugments: augments.offerForRound,
  offerPvpEntry,
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
  views: { battlefield: battlefieldView, overlays: overlayView, shop: shopView, traits: traitView, unit: unitView },
  renderCommunityBoard: communityBoard.renderCommunityBoard,
});

function buyTemporaryBoost(stat) {
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

function rerollShop() {
  if (state.busy) return;
  if (!augmentCanRerollShop(state)) return addLog("상점 리롤을 사용할 수 없습니다.");
  const free = Math.max(0, state.freeShopRerollsRemaining || 0);
  const cost = free > 0 ? 0 : balance.shop.rerollCost;
  if (state.gold < cost) return addLog(`새로고침에는 ${cost} 크레딧이 필요합니다.`);
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
    buyTemporaryBoost,
    rerollShop,
    rollShop,
    render,
    simulate: () => {
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
    buyXp,
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
initPatchNotes();
if (restoredGame) render();
else rollShop();
