const SAVE_FORMAT_VERSION = 2;
const SAVE_SEASON_ID = "synergy-rework-261109";
export function resetGameSavesForCurrentSeason(storageKey) {
  if (!storageKey) return false;
  const markerKey = `${storageKey}:season`;
  try {
    if (localStorage.getItem(markerKey) === SAVE_SEASON_ID) return false;
    const staleKeys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key === storageKey || key?.startsWith(`${storageKey}:`)) staleKeys.push(key);
    }
    staleKeys.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(markerKey, SAVE_SEASON_ID);
    return staleKeys.length > 0;
  } catch {
    return false;
  }
}

const GAMEPLAY_FIELDS = [
  "round",
  "hp",
  "gold",
  "level",
  "xp",
  "shop",
  "pool",
  "shopLocked",
  "streakType",
  "streakCount",
  "lastIncome",
  "bench",
  "board",
  "temporaryBoosts",
  "selectedAugments",
  "nextAugmentRarity",
  "nextAugmentChoiceBonus",
  "nextAugmentRerollPerCardBonus",
  "lumiShopRound",
  "lumiShopOffers",
  "lumiShopOfferSeed",
  "lumiShopResolved",
  "lumiShopPendingProductId",
  "lumiShopDeadline",
  "lumiShopHistory",
  "lumiIceShieldReady",
  "pendingAugmentTarget",
  "fourStarPromotionCount",
  "freeShopRerollsRemaining",
  "shopOddsMaxLevelRerollsRemaining",
  "augmentTranscendTargetId",
  "deathRecord",
  "rankingSubmitted",
  "showHiddenTraits",
  "pvpSnapshotSubmitted",
  "pvpStreakInitialized",
  "pvpCurrentRound",
  "pvpLastRewardedRound",
  "pvpPendingResultWin",
  "pvpFinished",
  "pvpLastReplay",
];

const UNIT_RUNTIME_FIELDS = new Set([
  "combatBase",
  "status",
  "side",
  "mana",
  "shield",
  "leniShield",
  "stunRemainingMs",
  "stunDurationMs",
  "actionLockRemainingMs",
  "actionLockDurationMs",
  "rootRemainingMs",
  "rootDurationMs",
  "immuneRemainingMs",
  "immuneDurationMs",
  "actionCooldownMs",
  "healReduction",
  "healReductionRemainingMs",
  "healReductionDurationMs",
  "focusTargetId",
  "forcedFocusTargetId",
  "tacticalTarget",
  "lenoxPulledTarget",
  "hiddenAbsorbed",
  "hiddenDefeatHandled",
  "hiddenDefeatEffects",
  "hiddenKillEffects",
  "hiddenFeastEffects",
  "hiddenPaintMarker",
  "hiddenPaintDetonator",
  "hiddenKillBlink",
  "hiddenTacticalGrowth",
  "hiddenLenoxPullGrowth",
  "hiddenKillGrowth",
  "hiddenCloneSummon",
  "hiddenExclusiveRescue",
  "hiddenExclusivePartnerId",
  "hiddenExclusiveRescueState",
  "fusedSkillRole",
  "fusedSkillName",
  "hasPickedOpeningTarget",
  "hasUsedOpeningCrit",
  "augmentBasicAttackStacks",
  "augmentAmpRelayBonus",
  "augmentAmpRelayDurationMs",
  "augmentAmpRelayRemainingMs",
  "augmentChainLightningReadyAt",
  "augmentCorrosionHits",
  "augmentCurseStacks",
  "augmentDamageTakenAdd",
  "augmentFirstAttackDone",
  "augmentKillCombatStacks",
  "augmentLastSurvivorApplied",
  "augmentLowHpBuff:lowHpOnceBuff:0.35",
  "augmentLowHpHeal:lowHpHealPulse",
  "augmentManaShareReadyAt",
  "augmentSameTargetStacks",
  "augmentThreeStarRevived",
  "augmentWarmupStacks",
  "dualContract",
  "dualContractBroken",
  "dualContractSurvivorDurationMs",
  "dualContractSurvivorReduction",
  "dualContractSurvivorRemainingMs",
  "lukeCleaningBoost",
  "theodoreAssistReadyAt",
  "trainingDummy",
]);

function normalizeUnit(unit) {
  if (!unit) return null;
  const copy = {};
  for (const [key, value] of Object.entries(unit)) {
    const traitRuntime = key.startsWith("trait") && key !== "trait" && key !== "traits";
    if (!UNIT_RUNTIME_FIELDS.has(key) && !traitRuntime) copy[key] = value;
  }
  copy.hp = copy.maxHp;
  copy.mana = 0;
  return copy;
}

function normalizeUnitArray(units, size) {
  const source = Array.isArray(units) ? units : [];
  return Array.from({ length: size }, (_, index) => normalizeUnit(source[index]));
}

function reconcileUnit(unit, rosterByName) {
  if (!unit) return null;
  const base = rosterByName?.get(unit.name);
  if (!base) return unit;
  return {
    ...unit,
    cost: base.cost,
    role: base.role,
    weapon: base.weapon,
    trait: base.trait,
    traits: [...(base.traits || [base.trait])],
    skill: base.skill,
    skillId: base.skillId,
    skillTooltip: base.skillTooltip,
  };
}

function normalizeSaveData(data, balance, rosterByName = null) {
  const boardSize = 32;
  const benchSize = 8;
  const enemySize = balance.battle.enemySlots || 32;
  return {
    ...data,
    combatGrid: null,
    combatAugmentCooldowns: {},
    enemies: [],
    busy: false,
    augmentOpen: false,
    augmentChoices: [],
    augmentDetailOpen: false,
    augmentDetailIndex: -1,
    augmentStage: 0,
    augmentRerollsRemaining: 0,
    augmentOfferSeed: "",
    augmentOfferRarity: "",
    augmentOfferRerollIndex: 0,
    augmentRerolledSlots: [],
    augmentRerollsPerSlot: 1,
    augmentSeenIds: [],
    lumiShopOpen: false,
    lumiShopPendingProductId: "",
    activeAugmentsCollapsed: Boolean(data.activeAugmentsCollapsed),
    dragging: null,
    selected: null,
    board: normalizeUnitArray(data.board, boardSize).map((unit) => reconcileUnit(unit, rosterByName)),
    bench: normalizeUnitArray(data.bench, benchSize).map((unit) => reconcileUnit(unit, rosterByName)),
    shop: (Array.isArray(data.shop) ? data.shop : []).map(normalizeUnit).map((unit) => reconcileUnit(unit, rosterByName)).filter(Boolean).slice(0, balance.shop.maxSize ?? 5),
    selectedAugments: structuredClone(data.selectedAugments || []),
    debugDummies: normalizeUnitArray(data.debugDummies, enemySize),
    temporaryBoosts: {
      hp: Number(data.temporaryBoosts?.hp) || 0,
      atk: Number(data.temporaryBoosts?.atk) || 0,
      skillAmp: Number(data.temporaryBoosts?.skillAmp) || 0,
    },
  };
}

function hasMeaningfulProgress(data) {
  const hasUnits = [...(data.board || []), ...(data.bench || [])].some(Boolean);
  const hasBoosts = Object.values(data.temporaryBoosts || {}).some((value) => Number(value) > 0);
  return Boolean(
    hasUnits ||
      hasBoosts ||
      data.round > 1 ||
      data.level > 1 ||
      data.xp > 0 ||
      data.hp < 100 ||
      data.deathRecord ||
      data.rankingSubmitted
  );
}

export function createSaveController({ state, balance, roster = [], storageKey, addLog, shouldOfferRestore = () => true, autoRestore = () => false }) {
  const rosterByName = new Map(roster.map((unit) => [unit.name, unit]));
  function canSave() {
    return !state.busy && !state.combatGrid && !state.pvpReplaying && hasMeaningfulProgress(state);
  }

  function snapshot() {
    const data = {};
    for (const field of GAMEPLAY_FIELDS) data[field] = state[field];
    const normalized = normalizeSaveData(data, balance, rosterByName);
    return {
      formatVersion: SAVE_FORMAT_VERSION,
      savedAt: Date.now(),
      data: normalized,
    };
  }

  function saveNow() {
    if (!canSave()) return false;
    try {
      localStorage.setItem(storageKey, JSON.stringify(snapshot()));
      return true;
    } catch {
      return false;
    }
  }

  function clearSave() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore unavailable storage.
    }
  }

  function readSave() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!parsed || parsed.formatVersion !== SAVE_FORMAT_VERSION || !parsed.data) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function restoreSave() {
    if (!shouldOfferRestore()) return false;
    const saved = readSave();
    if (!saved) return false;
    if (!hasMeaningfulProgress(saved.data)) {
      clearSave();
      return false;
    }
    let wantsRestore = autoRestore();
    if (!wantsRestore) {
      const savedDate = new Date(saved.savedAt || Date.now()).toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      wantsRestore = window.confirm(`저장된 게임을 이어서 할까요?\n라운드 ${saved.data.round || 1} · 레벨 ${saved.data.level || 1} · ${savedDate}`);
    }
    if (!wantsRestore) {
      clearSave();
      return false;
    }
    Object.assign(state, normalizeSaveData(saved.data, balance, rosterByName));
    addLog?.("저장된 게임을 불러왔습니다.");
    return true;
  }

  window.addEventListener("beforeunload", saveNow);

  return {
    clearSave,
    restoreSave,
    saveNow,
  };
}
