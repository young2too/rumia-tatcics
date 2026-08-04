const SAVE_FORMAT_VERSION = 1;

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
  "freeShopRerollsRemaining",
  "augmentTranscendTargetId",
  "deathRecord",
  "rankingSubmitted",
  "showHiddenTraits",
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
  "hiddenAbsorbed",
  "hiddenDefeatHandled",
  "hiddenDefeatEffects",
  "hiddenKillEffects",
  "hiddenFeastEffects",
  "hiddenPaintMarker",
  "hiddenPaintDetonator",
  "hiddenKillBlink",
  "hiddenTacticalGrowth",
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
  "lukeCleaningBoost",
  "sevenElixirUsed",
  "theodoreAssistReadyAt",
  "trainingDummy",
]);

function normalizeUnit(unit) {
  if (!unit) return null;
  const copy = {};
  for (const [key, value] of Object.entries(unit)) {
    if (!UNIT_RUNTIME_FIELDS.has(key)) copy[key] = value;
  }
  copy.hp = copy.maxHp;
  copy.mana = 0;
  return copy;
}

function normalizeUnitArray(units, size) {
  const source = Array.isArray(units) ? units : [];
  return Array.from({ length: size }, (_, index) => normalizeUnit(source[index]));
}

function normalizeSaveData(data, balance) {
  const boardSize = 32;
  const benchSize = 8;
  const enemySize = balance.battle.enemySlots || 32;
  return {
    ...data,
    combatGrid: null,
    enemies: [],
    busy: false,
    augmentOpen: false,
    augmentChoices: [],
    augmentStage: 0,
    augmentRerollsRemaining: 0,
    augmentOfferSeed: "",
    augmentOfferRarity: "",
    augmentOfferRerollIndex: 0,
    augmentRerolledSlots: [],
    dragging: null,
    selected: null,
    board: normalizeUnitArray(data.board, boardSize),
    bench: normalizeUnitArray(data.bench, benchSize),
    shop: (Array.isArray(data.shop) ? data.shop : []).map(normalizeUnit).filter(Boolean).slice(0, balance.shop.maxSize ?? 5),
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

export function createSaveController({ state, balance, storageKey, addLog, shouldOfferRestore = () => true }) {
  function canSave() {
    return !state.busy && !state.combatGrid && hasMeaningfulProgress(state);
  }

  function snapshot() {
    const data = {};
    for (const field of GAMEPLAY_FIELDS) data[field] = state[field];
    const normalized = normalizeSaveData(data, balance);
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
    const savedDate = new Date(saved.savedAt || Date.now()).toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const wantsRestore = window.confirm(`저장된 게임을 이어서 할까요?\n라운드 ${saved.data.round || 1} · 레벨 ${saved.data.level || 1} · ${savedDate}`);
    if (!wantsRestore) {
      clearSave();
      return false;
    }
    Object.assign(state, normalizeSaveData(saved.data, balance));
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
