// 증강 효과 유틸: 선택된 증강의 경제, 시너지, 전투 보정값을 계산합니다.

export function augmentEffects(state, type = "") {
  return (state.selectedAugments || [])
    .map((augment) => augment?.effect)
    .filter((effect) => effect && (!type || effect.type === type));
}

export function hasAugmentEffect(state, type) {
  return augmentEffects(state, type).length > 0;
}

export function unitTraits(unit) {
  const traits = Array.isArray(unit?.traits) && unit.traits.length ? unit.traits : [unit?.trait];
  return Array.from(new Set(traits.filter(Boolean)));
}

export function applyStatPatch(stats, patch = {}) {
  if (!stats || !patch) return stats;
  const pairs = [
    ["hp", "hpMultiply", "hpMultiplyAdd", "hpAdd"],
    ["atk", "atkMultiply", "atkMultiplyAdd", "atkAdd"],
    ["skillAmp", "skillAmpMultiply", "skillAmpMultiplyAdd", "skillAmpAdd"],
    ["defense", "defenseMultiply", "defenseMultiplyAdd", "defenseAdd"],
    ["speed", "speedMultiply", "speedMultiplyAdd", "speedAdd"],
    ["heal", "healMultiply", "healMultiplyAdd", "healAdd"],
    ["manaGain", "manaGainMultiply", "manaGainMultiplyAdd", "manaGainAdd"],
  ];
  for (const [stat, multiplyKey, multiplyAddKey, addKey] of pairs) {
    if (!(stat in stats)) continue;
    if (Number.isFinite(patch[multiplyKey])) stats[stat] *= patch[multiplyKey];
    if (Number.isFinite(patch[multiplyAddKey])) stats[stat] *= 1 + patch[multiplyAddKey];
    if (Number.isFinite(patch[addKey])) stats[stat] += patch[addKey];
  }
  const additive = [
    ["critChance", "critChanceAdd"],
    ["critDamage", "critDamageAdd"],
    ["openingCritMultiplier", "openingCritMultiplierAdd"],
    ["lifeSteal", "lifeStealAdd"],
    ["lifeSteal", "lifestealAdd"],
    ["damageReduction", "damageReductionAdd"],
    ["rangeBonus", "rangeBonusAdd"],
    ["maxManaReduction", "maxManaReductionAdd"],
    ["basicAttackExtraTargets", "basicAttackExtraTargetsAdd"],
    ["openingMana", "openingManaAdd"],
    ["manaOnHitBonus", "manaOnHitBonusAdd"],
  ];
  for (const [stat, key] of additive) {
    if (stat in stats && Number.isFinite(patch[key])) stats[stat] += patch[key];
  }
  if (Number.isFinite(patch.maxManaSet)) stats.maxMana = patch.maxManaSet;
  return stats;
}

export function fourStarAscensionStats(effect, unit) {
  const stats = { ...(effect?.stats || {}) };
  const promotionOrder = Math.max(1, Math.round(Number(unit?.fourStarPromotionOrder) || 1));
  const increase = Math.max(0, Number(effect?.multiplierIncreasePerPromotion) || 0);
  const bonus = (promotionOrder - 1) * increase;
  if (!bonus) return stats;
  for (const key of Object.keys(stats)) {
    if (key.endsWith("Multiply") && Number.isFinite(stats[key])) stats[key] += bonus;
  }
  return stats;
}

function scaledStatPatch(patch = {}, ratio = 1) {
  if (ratio >= 0.999) return patch;
  const scaled = {};
  for (const [key, value] of Object.entries(patch || {})) {
    if (!Number.isFinite(value)) {
      scaled[key] = value;
      continue;
    }
    if (key.endsWith("Multiply")) scaled[key] = 1 + (value - 1) * ratio;
    else if (key.endsWith("MultiplyAdd") || key.endsWith("Add")) scaled[key] = value * ratio;
    else scaled[key] = value;
  }
  return scaled;
}

export function augmentBoardLimitAdd(state) {
  return augmentEffects(state)
    .reduce((sum, effect) => sum + (Number(effect.boardLimitAdd) || (effect.type === "boardLimit" ? Number(effect.add) || 0 : 0)), 0);
}

export function augmentShopSize(state, baseSize, maxSize) {
  const setSize = augmentEffects(state).find((effect) => Number.isFinite(effect.shopSizeSet))?.shopSizeSet;
  const add = augmentEffects(state, "shopSize").reduce((sum, effect) => sum + (Number(effect.add) || 0), 0);
  if (Number.isFinite(setSize)) return Math.max(1, Math.round(setSize));
  return Math.min(maxSize + add, baseSize + add);
}

export function augmentShopOddsLevel(state, level, maxLevel) {
  const add = augmentEffects(state, "shopOddsLevelBonus").reduce((sum, effect) => sum + (Number(effect.add) || 0), 0);
  return Math.max(1, Math.min(maxLevel, level + add));
}

export function augmentMaxLevelShopRerolls(state, level, maxLevel) {
  if (level < maxLevel) return 0;
  return augmentEffects(state, "shopOddsLevelBonus").reduce((sum, effect) => sum + (Number(effect.add) || 0), 0);
}

export function augmentUnitCost(state, unit) {
  const override = augmentEffects(state).find((effect) => Number.isFinite(effect.unitCostOverride))?.unitCostOverride;
  return Math.max(0, Math.round(Number.isFinite(override) ? override : unit?.cost || 0));
}

export function augmentSellValue(state, baseValue) {
  if (hasAugmentEffect(state, "contractFreeUnitsNoSell")) return 0;
  const multiply = augmentEffects(state, "sellValueBonus").reduce((value, effect) => value * (Number(effect.multiply) || 1), 1);
  return Math.max(0, Math.round(baseValue * multiply));
}

export function augmentCanSell(state) {
  return !augmentEffects(state).some((effect) => effect.disableSell);
}

export function augmentCanRerollShop(state) {
  return !augmentEffects(state).some((effect) => effect.disableReroll);
}

export function augmentInterestCap(state, baseCap) {
  return baseCap + augmentEffects(state, "interestCapBonus").reduce((sum, effect) => sum + (Number(effect.add) || 0), 0);
}

export function augmentStreakCapAdd(state) {
  return augmentEffects(state, "streakIncomeBonus").reduce((sum, effect) => sum + (Number(effect.capAdd) || 0), 0);
}

export function augmentTemporaryBoostConfig(state, baseConfig) {
  const effects = augmentEffects(state, "temporaryBoostTuning");
  const costAdd = effects.reduce((sum, effect) => sum + (Number(effect.costAdd) || 0), 0);
  const amountAdd = effects.reduce((sum, effect) => sum + (Number(effect.amountAdd) || 0), 0);
  return {
    ...baseConfig,
    cost: Math.max(0, (baseConfig.cost ?? 20) + costAdd),
    amount: Math.max(0, (baseConfig.amount ?? 0.1) + amountAdd),
  };
}

export function applyImmediateAugmentEffect(state, augment, addLog) {
  const effect = augment?.effect || {};
  if (effect.type === "instantGold") {
    const amount = Math.max(0, Math.round(Number(effect.add) || 0));
    state.gold += amount;
    addLog?.(`[증강] ${augment.name}: ${amount}크레딧 획득.`, { force: true });
  }
  if (effect.type === "playerHp") {
    if (Number.isFinite(effect.setTo)) {
      const before = state.hp;
      state.hp = Math.max(state.hp, Math.round(effect.setTo));
      addLog?.(`[증강] ${augment.name}: 체력 ${before} → ${state.hp}.`, { force: true });
    } else {
      const amount = Math.round(Number(effect.add) || 0);
      state.hp = Math.max(0, state.hp + amount);
      addLog?.(`[증강] ${augment.name}: 체력 ${amount >= 0 ? "+" : ""}${amount}.`, { force: true });
    }
  }
}

export function augmentTraitCountAdditions(state) {
  const additions = {};
  for (const effect of augmentEffects(state)) {
    if (!["traitCount", "virtualTraitCount", "traitCrown"].includes(effect.type)) continue;
    if (!effect.trait) continue;
    additions[effect.trait] = (additions[effect.trait] || 0) + (Number(effect.add) || 0);
  }
  return additions;
}

export function applyAugmentStatsToUnit(state, unit, stats, context = {}) {
  if (!unit || (unit.side !== "ally" && !context.playerControlled)) return stats;
  const traits = unitTraits(unit);
  for (const effect of augmentEffects(state, "traitStat")) {
    if (traits.includes(effect.trait)) applyStatPatch(stats, effect.stats);
  }
  for (const effect of augmentEffects(state, "threeStarStat")) {
    if ((unit.tier || 1) >= 3) applyStatPatch(stats, effect.stats);
  }
  for (const effect of augmentEffects(state, "fourStarAscension")) {
    if (unit.fourStarAscended) applyStatPatch(stats, fourStarAscensionStats(effect, unit));
  }
  for (const effect of augmentEffects(state, "teamStat")) applyStatPatch(stats, effect.stats);
  for (const effect of augmentEffects(state, "goldHeldTeamStat")) {
    const goldPerStack = Math.max(1, Number(effect.goldPerStack) || 10);
    const maxStacks = Math.max(0, Number(effect.maxStacks) || 0);
    const stacks = Math.min(maxStacks, Math.floor((Number(state.gold) || 0) / goldPerStack));
    const perStack = effect.statsPerStack || {};
    applyStatPatch(stats, {
      hpMultiplyAdd: (Number(perStack.hpMultiplyAdd) || 0) * stacks,
      atkMultiplyAdd: (Number(perStack.atkMultiplyAdd) || 0) * stacks,
      skillAmpMultiplyAdd: (Number(perStack.skillAmpMultiplyAdd) || 0) * stacks,
      defenseMultiplyAdd: (Number(perStack.defenseMultiplyAdd) || 0) * stacks,
    });
  }
  for (const effect of augmentEffects(state, "threeStarCollector")) {
    const countBench = effect.countBench !== false;
    const units = countBench ? [...(state.board || []), ...(state.bench || [])] : (state.board || []);
    const count = units.filter((candidate) => candidate?.tier >= 3).length;
    const per = effect.perThreeStar || {};
    applyStatPatch(stats, {
      hpMultiplyAdd: (Number(per.hpMultiplyAdd) || 0) * count,
      atkMultiplyAdd: (Number(per.atkMultiplyAdd) || 0) * count,
      skillAmpMultiplyAdd: (Number(per.skillAmpMultiplyAdd) || 0) * count,
    });
  }
  for (const effect of augmentEffects(state, "contractEliteSquad")) applyStatPatch(stats, effect.stats);
  for (const effect of augmentEffects(state, "contractMassTactics")) applyStatPatch(stats, effect.stats);
  for (const effect of augmentEffects(state, "positionStat")) {
    if (isInRows(unit, effect.rows, context)) applyStatPatch(stats, effect.stats);
  }
  for (const effect of augmentEffects(state, "frontlineShieldAndDefense")) {
    if (isInRows(unit, effect.rows, context)) applyStatPatch(stats, { defenseMultiply: effect.defenseMultiply });
  }
  for (const effect of augmentEffects(state, "adjacentAllyStat")) {
    if ((context.adjacentAllyCount?.(unit) || 0) >= (effect.minAdjacentAllies || 1)) applyStatPatch(stats, effect.stats);
  }
  for (const effect of augmentEffects(state, "isolatedAllyStat")) {
    if ((context.adjacentAllyCount?.(unit, effect.range || 1) || 0) === 0) {
      applyStatPatch(stats, effect.stats || { atkMultiply: effect.atkMultiply, skillAmpMultiply: effect.skillAmpMultiply });
    }
  }
  for (const effect of augmentEffects(state, "splitPositionStat")) {
    const patch = isInRows(unit, "front2", context) ? effect.frontStats : effect.backStats;
    applyStatPatch(stats, patch);
  }
  for (const effect of augmentEffects(state, "activeTraitPairStat")) {
    const counts = context.traitCounts || {};
    const rules = context.traitRules || {};
    const active = traits.filter((trait) => {
      const firstNeed = rules[trait]?.tiers?.[0]?.need;
      return Number.isFinite(firstNeed) && (counts[trait] || 0) >= firstNeed;
    });
    const hasMajor = active.some((trait) => rules[trait]?.category === "major");
    const hasMinor = active.some((trait) => rules[trait]?.category === "minor");
    if (hasMajor && hasMinor) applyStatPatch(stats, effect.stats);
  }
  for (const augment of state.selectedAugments || []) {
    const effect = augment?.effect;
    if (effect?.type !== "transcendThreeStar") continue;
    const targetId = augment.targetUnitId || state.augmentTranscendTargetId;
    if (!targetId || unit.id !== targetId) continue;
    const efficiency = augment.targetReduced ? Number(effect.absorbedEfficiency) || 0.5 : 1;
    applyStatPatch(stats, scaledStatPatch(effect.stats, efficiency));
  }
  return stats;
}

export function augmentOvercapEffects(state, traitRules, counts) {
  const patchesByTrait = {};
  for (const effect of augmentEffects(state, "traitCrown")) {
    const trait = effect.trait;
    const rule = traitRules?.[trait];
    const lastNeed = rule?.tiers?.at(-1)?.need || 0;
    const over = Math.max(0, (counts?.[trait] || 0) - lastNeed);
    if (!trait || !over || !effect.overcap) continue;
    patchesByTrait[trait] ||= {};
    for (const [key, value] of Object.entries(effect.overcap)) {
      patchesByTrait[trait][key] = (patchesByTrait[trait][key] || 0) + Number(value || 0) * over;
    }
  }
  return patchesByTrait;
}

function isInRows(unit, rows, { slotOf, allyStartRow = 0 } = {}) {
  const slot = slotOf?.(unit);
  if (!slot) return false;
  if (rows === "front2") return slot.y <= allyStartRow + 1;
  if (rows === "back2") return slot.y >= allyStartRow + 2;
  return false;
}
