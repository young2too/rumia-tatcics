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

const { state, syncLocalTestGold } = createGameState({ balance, roster, createUnitPool, communityBoardConfig });
const refs = createRefs();
const boardUnits = () => state.board.filter(Boolean);
const ownedUnits = () => [...state.board, ...state.bench].filter(Boolean);
const boardLimit = () => state.level;
const makeUnit = (base, tier = 1) => createUnit(base, balance, tier);
const temporaryBoostConfig = () => balance.battle.temporaryBoosts || { cost: 20, amount: 0.1, stats: [] };
const temporaryBoostPercent = (stat) => Math.round((state.temporaryBoosts?.[stat] || 0) * 100);

let gameView;
let overlayView;
let combat;
let saveController;
const render = () => {
  gameView?.render();
  saveController?.saveNow();
};
const renderRanking = () => overlayView?.renderRanking();

function addLog(text) {
  const item = document.createElement("div");
  item.textContent = text;
  refs.log.prepend(item);
  while (refs.log.children.length > 9) refs.log.lastChild.remove();
}

saveController = createSaveController({ state, balance, storageKey: gameSaveStorageKey, addLog });
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
  render,
  rollShop,
  addXp,
  grantRoundIncome,
  captureDeathRecord,
  sleep,
});

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
    debugRecruitUnit,
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
