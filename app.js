import { balance, bgmConfig, bossPatterns, bossRoster, communityBoardConfig, communityBoardStorageKey, gameSaveStorageKey, hiddenTraitRules, patchNotesConfig, patchNotesStorageKey, rankingConfig, rankingStorageKey, roster, traitRules } from "./src/core/data.js";
import { createGameState } from "./src/core/state.js";
import { createSaveController } from "./src/core/save.js";
import { createUnitPool, makeUnit as createUnit, sample, sellValue, sleep } from "./src/core/units.js";
import { createCombatController } from "./src/systems/combat.js";
import { createProgressionController } from "./src/systems/progression.js";
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

const { state, syncLocalTestGold } = createGameState({ balance, roster, createUnitPool, communityBoardConfig });
const refs = createRefs();
refs.log?.closest(".log-wrap")?.toggleAttribute("hidden", !state.debugMode);
const boardUnits = () => state.board.filter(Boolean);
const ownedUnits = () => [...state.board, ...state.bench].filter(Boolean);
const boardLimit = () => state.level;
const makeUnit = (base, tier = 1) => createUnit(base, balance, tier);
const temporaryBoostConfig = () => balance.battle.temporaryBoosts || { cost: 20, amount: 0.1, stats: [] };
const temporaryBoostPercent = (stat) => Math.round((state.temporaryBoosts?.[stat] || 0) * 100);
const searchParams = new URLSearchParams(location.search);

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

function addLog(text) {
  if (!state.debugMode) return;
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
  shouldOfferRestore: () => !searchParams.has("pixi-benchmark") && !searchParams.has("combat-stress"),
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
const progression = createProgressionController({ state, balance, addLog, render, boardLimit });
const { addXp, buyXp, grantRoundIncome, levelXpLabel, xpToNextLevel } = progression;
const traits = createTraitController({ state, traitRules, boardUnits });
const { activeTraits, activeTraitTier, applySynergy, nextTraitNeed } = traits;
const hiddenTraits = createHiddenTraitController({ hiddenTraitRules, boardUnits });
const skillEffects = createSkillEffectRenderer();
const playBudgetedSkillVisual = (spec) => {
  const budget = balance.battle.effectBudget || {};
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

const unitView = createUnitView({ state, refs, balance, sellValue, activeTraits, applySynergy, displayNameFor, render });
const shopView = createShopView({ state, refs, balance, roster, buyUnit, displayNameFor });
const traitView = createTraitView({ state, refs, roster, traitRules, hiddenTraitRules, ownedUnits, activeTraits, activeHiddenTraits, activeTraitTier, nextTraitNeed, displayNameFor });
overlayView = createOverlayView({ state, refs, rankingConfig, patchNotesConfig });
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
    toggleDebugDummyPlacement,
    clearDebugDummies,
    buyTemporaryBoost,
    rollShop,
    render,
    simulate: () => {
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
