// 전투 컨트롤러: 전투 상태 생성, 전투 루프, 캐릭터 스킬 실행을 조립합니다.
import { createCombatSeed, createSeededRng } from "../../core/rng.js";
import { tierStatMultiplier } from "../../core/tier.js";
import { makeUnit, stockLimit, unitCopyCount } from "../../core/units.js";
import { applyAugmentStatsToUnit, applyStatPatch, augmentEffects, unitTraits } from "../augmentEffects.js";

import { createSkillTimeline } from "./timeline.js";

export function createCombatController(context) {
  const {
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
    playSkillVisual,
    clearSkillVisuals,
    render,
    renderCombatFrame = render,
    rollShop,
    addXp,
    grantRoundIncome,
    captureDeathRecord,
    offerAugments,
    offerPvpEntry,
    sleep,
  } = context;

const skillTimeline = createSkillTimeline();
let combatElapsedMs = 0;
let combatRng = createSeededRng("combat-bootstrap");

function random() {
  return combatRng.random();
}

function randomChoice(items) {
  return combatRng.choice(items);
}

function combatId(prefix) {
  return combatRng.id(prefix);
}

const SUPPORT_ROLE = "\uc9c0\uc6d0";

const statusTurnMs = () => balance.battle.statusTurnMs ?? 500;
const durationFromTurns = (turns) => Math.max(0, Number(turns) || 0) * statusTurnMs();
const attackIntervalMs = (unit) => Math.max(
  balance.battle.minimumAttackIntervalMs ?? 140,
  (balance.battle.baseAttackIntervalMs ?? 500) / Math.max(0.1, unit.speed || 1)
);

const skillOutputMultiplier = (unit) => {
  if (!unit || unit.boss) return 1;
  return attackIntervalMs(unit) / (balance.battle.legacySkillActionIntervalMs ?? 520);
};

const skillOutput = (unit, amount) => amount * skillOutputMultiplier(unit);

function enemyRows() {
  return Math.ceil((balance.battle.enemySlots || 0) / balance.battle.columns);
}

function allyRows() {
  return Math.ceil((state.board?.length || 0) / balance.battle.columns);
}

function totalRows() {
  return enemyRows() + allyRows();
}

function allyStartRow() {
  return enemyRows();
}

function combatGridSize() {
  return (balance.battle.enemySlots || 0) + (state.board?.length || 0);
}

function bossSpawnIndex() {
  const configured = Number(balance.battle.enemyBossSpawnIndex);
  if (Number.isInteger(configured) && configured >= 0 && configured < balance.battle.enemySlots) return configured;
  return balance.battle.enemySpawnOrder?.[0] ?? Math.floor((balance.battle.enemySlots || 1) / 2);
}

function dealSkillDamage(source, target, amount, options = {}) {
  if (options.fixed) return dealDamage(source, target, amount, options);
  const critical = Math.random() < (source?.skillCritChance || 0);
  source._skillCriticalQueue ||= [];
  source._skillCriticalQueue.push(critical);
  return dealDamage(source, target, skillOutput(source, amount) * (critical ? (source.skillCritDamage || 1.5) : 1), options);
}

function selectedAugmentEffects(type = "") {
  return augmentEffects(state, type);
}

function unitAugmentEffect(unit, type) {
  if (!unit || unit.side !== "ally") return null;
  return selectedAugmentEffects(type).find((effect) => effect.unit === unit.name) || null;
}

function hasUnitAugment(unit, type) {
  return Boolean(unitAugmentEffect(unit, type));
}

function enemyDifficultyStage() {
  return Math.floor((state.round - 1) / balance.battle.bossInterval);
}

function enemyScale(kind) {
  const interval = balance.battle.bossInterval;
  const earlyEndRound = balance.battle.enemyEarlyGrowthEndRound ?? 0;
  const releaseRound = balance.battle.enemyScaleCapReleaseRound ?? Infinity;
  const cap = kind === "hp" ? balance.battle.enemyHpScaleCap : balance.battle.enemyAtkScaleCap;
  const base = kind === "hp" ? balance.battle.enemyBaseHpScale : balance.battle.enemyBaseAtkScale;
  const earlyRoundGrowth = kind === "hp" ? balance.battle.enemyEarlyHpRoundGrowth : balance.battle.enemyEarlyAtkRoundGrowth;
  const earlyStageGrowth = kind === "hp" ? balance.battle.enemyEarlyStageHpGrowth : balance.battle.enemyEarlyStageAtkGrowth;
  const midRoundGrowth = kind === "hp" ? balance.battle.enemyMidHpRoundGrowth : balance.battle.enemyMidAtkRoundGrowth;
  const midStageGrowth = kind === "hp" ? balance.battle.enemyMidStageHpGrowth : balance.battle.enemyMidStageAtkGrowth;
  const postRoundGrowth = kind === "hp" ? balance.battle.enemyPostCapHpRoundGrowth : balance.battle.enemyPostCapAtkRoundGrowth;
  const postStageGrowth = kind === "hp" ? balance.battle.enemyPostCapHpStageGrowth : balance.battle.enemyPostCapAtkStageGrowth;
  const round = state.round;
  const stage = enemyDifficultyStage();
  const earlyStage = Math.floor((earlyEndRound - 1) / interval);
  const earlyScale = base + earlyEndRound * earlyRoundGrowth + earlyStage * earlyStageGrowth;

  if (round <= earlyEndRound) {
    return Math.min(cap, base + round * earlyRoundGrowth + stage * earlyStageGrowth);
  }
  if (round <= releaseRound) {
    const elapsedRounds = round - earlyEndRound;
    const elapsedStages = Math.max(0, stage - earlyStage);
    return Math.min(cap, earlyScale + elapsedRounds * midRoundGrowth + elapsedStages * midStageGrowth);
  }
  const releaseStage = Math.floor((releaseRound - 1) / interval);
  return cap + (round - releaseRound) * (postRoundGrowth ?? 0) + Math.max(0, stage - releaseStage) * (postStageGrowth ?? 0);
}

function rollEnemyTier(stage) {
  const oddsTable = balance.battle.enemyTierOddsByStage || [[100, 0, 0]];
  const odds = oddsTable[Math.min(stage, oddsTable.length - 1)] || oddsTable[0];
  const roll = random() * 100;
  let sum = 0;
  const minimumTier = state.round > (balance.battle.enemyMinimumTierAfterRound ?? Infinity) ? 2 : 1;
  for (let i = 0; i < odds.length; i++) {
    sum += odds[i];
    if (roll < sum) return Math.max(minimumTier, i + 1);
  }
  return minimumTier;
}

function enemyBaseStats(unit) {
  const table = balance.battle.enemyBaseStatsByCost || {};
  return table[unit.cost] || table[String(unit.cost)] || table["1"] || {
    hp: 82,
    atk: 18,
    skillAmp: 12,
    defense: 4,
    speed: 0.94,
  };
}
function makeEnemyUnit(base, tier, stage, hpScale, atkScale) {
  const stats = enemyBaseStats(base);
  const hpMultiplier = tierStatMultiplier(balance, base.cost, tier, "hp");
  const atkMultiplier = tierStatMultiplier(balance, base.cost, tier, "atk");
  const skillAmpMultiplier = tierStatMultiplier(balance, base.cost, tier, "skillAmp");
  const defenseMultiplier = tierStatMultiplier(balance, base.cost, tier, "defense");
  const unit = {
    ...base,
    id: combatId("enemy"),
    tier,
    cost: base.cost,
    maxHp: Math.round(stats.hp * hpMultiplier),
    hp: Math.round(stats.hp * hpMultiplier),
    atk: Math.round(stats.atk * atkMultiplier),
    speed: stats.speed,
    skillAmp: Math.round(stats.skillAmp * skillAmpMultiplier),
    defense: Math.round(stats.defense * defenseMultiplier),
  };
  unit.maxHp = Math.round((unit.maxHp + stage * 14) * hpScale);
  unit.hp = unit.maxHp;
  unit.atk = Math.max(3, Math.round((unit.atk + stage * 2) * atkScale));
  unit.skillAmp = Math.max(2, Math.round((unit.skillAmp + stage * 2) * atkScale));
  unit.defense = Math.max(0, Math.round((unit.defense + stage) * hpScale));
  applyEnemyRoleStatMultipliers(unit);
  return unit;
}

function applyEnemyRoleStatMultipliers(unit) {
  const multipliers = balance.battle.enemyRoleStatMultipliers?.[unit.role];
  if (!multipliers) return;
  if (Number.isFinite(multipliers.hp)) {
    unit.maxHp = Math.max(1, Math.round(unit.maxHp * multipliers.hp));
    unit.hp = unit.maxHp;
  }
  if (Number.isFinite(multipliers.atk)) unit.atk = Math.max(1, Math.round(unit.atk * multipliers.atk));
  if (Number.isFinite(multipliers.skillAmp)) unit.skillAmp = Math.max(1, Math.round(unit.skillAmp * multipliers.skillAmp));
  if (Number.isFinite(multipliers.defense)) unit.defense = Math.max(0, Math.round(unit.defense * multipliers.defense));
}

function baseCritStats(unit) {
  const base = roster.find((entry) => entry.name === unit.name);
  return {
    critChance: base?.critChance ?? 0,
    critDamage: base?.critDamage ?? 1.5,
    openingCritMultiplier: base?.openingCritMultiplier ?? 1,
  };
}

function isBossRound() {
  return state.round % balance.battle.bossInterval === 0;
}

function currentBossInfo() {
  if (!isBossRound()) return null;
  const stage = Math.max(1, state.round / balance.battle.bossInterval);
  return bossRoster[(stage - 1) % bossRoster.length];
}

function makeBossUnit(stage) {
  const base = bossRoster[(stage - 1) % bossRoster.length];
  const bossIndex = Math.max(0, stage - 1);
  const bossCycle = Math.floor(bossIndex / bossRoster.length);
  const hpScale = (1 + bossIndex * balance.battle.bossHpGrowth) * (1 + bossCycle * (balance.battle.bossCycleHpGrowth ?? 0));
  const powerScale = (1 + bossIndex * balance.battle.bossPowerGrowth) * (1 + bossCycle * (balance.battle.bossCyclePowerGrowth ?? 0));
  const defenseScale = (1 + bossIndex * balance.battle.bossDefenseGrowth) * (1 + bossCycle * (balance.battle.bossCycleDefenseGrowth ?? 0));
  return {
    ...base,
    id: combatId("boss"),
    tier: Math.min(3, 1 + Math.floor(stage / 2)),
    cost: 5,
    boss: true,
    maxHp: Math.round(base.maxHp * hpScale),
    hp: Math.round(base.maxHp * hpScale),
    atk: Math.round(base.atk * powerScale),
    skillAmp: Math.round(base.skillAmp * powerScale),
    defense: Math.round(base.defense * defenseScale),
    summonCount: 0,
    immuneUsed: false,
    immuneRemainingMs: 0,
  };
}

function weightedSample(items, weightKey = "weight") {
  const total = items.reduce((sum, item) => sum + Math.max(0, item[weightKey] ?? 1), 0);
  if (total <= 0) return randomChoice(items);
  let roll = random() * total;
  for (const item of items) {
    roll -= Math.max(0, item[weightKey] ?? 1);
    if (roll <= 0) return item;
  }
  return items.at(-1);
}

function enemyCompositionConfig() {
  return balance.battle.enemyComposition || {};
}

function pickEnemyCompositionTemplate() {
  const config = enemyCompositionConfig();
  const templates = config.templates?.length ? config.templates : [
    { id: "random", weight: 1, roles: { dealer: 1 } },
  ];
  return weightedSample(templates);
}

function minDealersForCount(count) {
  const rules = enemyCompositionConfig().minDealersByEnemyCount || [];
  return rules
    .filter((rule) => count >= rule.count)
    .reduce((max, rule) => Math.max(max, rule.min), 0);
}

function targetGroupCounts(count, template) {
  const roles = template.roles || { dealer: 1 };
  const entries = Object.entries(roles).filter(([, ratio]) => ratio > 0);
  const raw = entries.map(([group, ratio]) => {
    const value = ratio * count;
    return { group, count: Math.floor(value), remainder: value % 1 };
  });
  let assigned = raw.reduce((sum, item) => sum + item.count, 0);
  for (const item of raw.sort((a, b) => b.remainder - a.remainder)) {
    if (assigned >= count) break;
    item.count += 1;
    assigned += 1;
  }
  const counts = Object.fromEntries(raw.map((item) => [item.group, item.count]));
  const config = enemyCompositionConfig();
  const supportMax = Math.floor(count * (config.maxSupportRatio ?? 1));
  if (counts.support > supportMax) {
    const overflow = counts.support - supportMax;
    counts.support = supportMax;
    counts.dealer = (counts.dealer || 0) + overflow;
  }
  const minDealers = minDealersForCount(count);
  if ((counts.dealer || 0) < minDealers) {
    const need = minDealers - (counts.dealer || 0);
    const fromSupport = Math.min(need, counts.support || 0);
    counts.support = (counts.support || 0) - fromSupport;
    counts.dealer = (counts.dealer || 0) + fromSupport;
    const remaining = need - fromSupport;
    if (remaining > 0) {
      counts.frontline = Math.max(0, (counts.frontline || 0) - remaining);
      counts.dealer = (counts.dealer || 0) + remaining;
    }
  }
  return counts;
}

function roleMatchesGroup(unit, group) {
  const groups = enemyCompositionConfig().roleGroups || {};
  return (groups[group] || []).includes(unit.role);
}

function countRoles(units, roles) {
  return units.filter((unit) => roles.includes(unit.role)).length;
}

function canAddEnemy(picked, candidate, countByName, count) {
  const config = enemyCompositionConfig();
  const maxSameUnit = config.maxSameUnit ?? Infinity;
  if ((countByName[candidate.name] || 0) >= maxSameUnit) return false;

  const next = [...picked, candidate];
  const supportRoles = config.supportRoles || [];
  const defensiveRoles = config.defensiveRoles || [];
  const maxSupport = Math.floor(count * (config.maxSupportRatio ?? 1));
  const maxDefensive = Math.ceil(count * (config.maxDefensiveRatio ?? 1));
  if (supportRoles.length && countRoles(next, supportRoles) > maxSupport) return false;
  if (defensiveRoles.length && countRoles(next, defensiveRoles) > maxDefensive) return false;
  return true;
}

function chooseEnemyBase(candidates, group, picked, countByName, count) {
  const groupCandidates = candidates.filter((unit) => roleMatchesGroup(unit, group));
  const pools = [groupCandidates, candidates];
  for (const pool of pools) {
    const available = pool.filter((unit) => canAddEnemy(picked, unit, countByName, count));
    if (available.length) return randomChoice(available);
  }
  return randomChoice(candidates);
}

function enemyGroupsForCount(count) {
  const template = pickEnemyCompositionTemplate();
  const counts = targetGroupCounts(count, template);
  const groups = [];
  for (const [group, groupCount] of Object.entries(counts)) {
    for (let i = 0; i < groupCount; i++) groups.push(group);
  }
  return groups.sort((a, b) => {
    const priority = { frontline: 0, dealer: 1, support: 2 };
    return (priority[a] ?? 9) - (priority[b] ?? 9) || random() - 0.5;
  });
}

function enemySlotRow(index) {
  return Math.floor(index / balance.battle.columns);
}

function enemySlotPoolForGroup(group) {
  const rows = enemyRows();
  const frontlineStart = Math.max(0, rows - 2);
  const order = balance.battle.enemySpawnOrder?.length
    ? balance.battle.enemySpawnOrder
    : Array.from({ length: balance.battle.enemySlots }, (_, index) => index);
  const pools = {
    frontline: order.filter((index) => enemySlotRow(index) >= frontlineStart),
    dealer: order.filter((index) => enemySlotRow(index) < frontlineStart),
    support: order.filter((index) => enemySlotRow(index) < frontlineStart),
  };
  return pools[group] || pools.dealer;
}

function placeEnemyUnit(slots, unit, group) {
  const preferred = enemySlotPoolForGroup(group);
  const fallback = balance.battle.enemySpawnOrder?.length
    ? balance.battle.enemySpawnOrder
    : Array.from({ length: balance.battle.enemySlots }, (_, index) => index);
  const index = [...preferred, ...fallback].find((slotIndex) => slotIndex >= 0 && slotIndex < slots.length && !slots[slotIndex]);
  if (index !== undefined) slots[index] = unit;
}

function makeEnemies() {
  const stage = enemyDifficultyStage();
  const slots = Array(balance.battle.enemySlots).fill(null);
  if (state.debugMode && state.debugDummies?.some(Boolean)) {
    return state.debugDummies.map((dummy) => dummy ? {
      ...dummy,
      id: combatId("dummy"),
      hp: dummy.maxHp,
      side: "enemy",
    } : null);
  }
  if (isBossRound()) {
    slots[bossSpawnIndex()] = makeBossUnit(Math.max(1, state.round / balance.battle.bossInterval));
    return slots;
  }

  const segmentRound = ((state.round - 1) % balance.battle.bossInterval) + 1;
  const allyCount = Math.max(1, boardUnits().length);
  const baselineCount = balance.battle.enemySegmentCounts[segmentRound - 1] || 4;
  const segmentPressure = (segmentRound >= 8 ? 1 : 0) + (segmentRound >= 12 ? 1 : 0);
  const stagePressure = Math.floor(stage / 2);
  const count = Math.min(balance.battle.maxFieldEnemies, Math.max(baselineCount, allyCount) + segmentPressure + stagePressure);
  const maxCost = Math.min(5, 1 + stage + (segmentRound >= 5 ? 1 : 0));
  const candidates = roster.filter((unit) => unit.cost <= maxCost);
  const hpScale = enemyScale("hp");
  const atkScale = enemyScale("atk");
  const groups = enemyGroupsForCount(count);
  const picked = [];
  const countByName = {};
  Array.from({ length: count }, (_, i) => {
    const base = chooseEnemyBase(candidates, groups[i] || "dealer", picked, countByName, count);
    const unit = makeEnemyUnit(base, rollEnemyTier(stage), stage, hpScale, atkScale);
    picked.push(base);
    countByName[base.name] = (countByName[base.name] || 0) + 1;
    placeEnemyUnit(slots, unit, groups[i] || "dealer");
  });
  return slots;
}

function previewBossEnemies() {
  const slots = Array(balance.battle.enemySlots).fill(null);
  if (isBossRound()) {
    const index = bossSpawnIndex();
    slots[index] = makeBossUnit(Math.max(1, state.round / balance.battle.bossInterval));
    slots[index].side = "enemy";
  }
  return slots;
}

function living(units) {
  return units.filter((unit) => unit && unit.hp > 0);
}

function survivorStarDamage(units) {
  return living(units).reduce((total, unit) => total + (unit.tier || 1), 0);
}

function unitAttackRange(unit) {
  const baseRange = ["사격", "술법", "지원"].includes(unit.role) ? balance.battle.rangedRange : balance.battle.meleeRange;
  return Math.max(1, baseRange + Math.round(unit.rangeBonus || 0));
}

function unitMaxMana(unit) {
  return Math.max(40, Math.round(unit.maxMana || 100) - Math.round(unit.maxManaReduction || 0));
}

function gainMana(unit, amount) {
  if (!unit || amount <= 0) return;
  if (unit.shieldDefenseRemainingMs > 0) return;
  if (unit.peaceRemainingMs > 0) return;
  if (unit.lifeShareRemainingMs > 0) return;
  if (unit.immuneRemainingMs > 0) return;
  unit.mana = Math.min(unitMaxMana(unit), (unit.mana || 0) + Math.round(amount * (unit.manaGain || 1)));
}

function applyHeal(target, amount) {
  if (!target || amount <= 0 || target.hp <= 0) return 0;
  const reduction = Math.max(0, Math.min(0.9, target.healReduction || 0));
  const heal = Math.max(0, Math.round(amount * (1 - reduction)));
  if (!heal) return 0;
  target.hp = Math.min(target.maxHp, target.hp + heal);
  target.status = "healed";
  return heal;
}

function unitSlot(unit) {
  const cols = balance.battle.columns;
  if (state.combatGrid) {
    const index = state.combatGrid.indexOf(unit);
    if (index < 0) return null;
    return { arr: state.combatGrid, index, x: index % cols, y: Math.floor(index / cols) };
  }
  const arr = unit.side === "enemy" ? state.enemies : state.board;
  const index = arr.indexOf(unit);
  if (index < 0) return null;
  const yOffset = unit.side === "enemy" ? 0 : allyStartRow();
  return { arr, index, x: index % cols, y: yOffset + Math.floor(index / cols) };
}

function hexCell(x, y) {
  return { q: x, r: y - Math.floor(x / 2) };
}

function hexDistanceSlots(a, b) {
  const ah = hexCell(a.x, a.y);
  const bh = hexCell(b.x, b.y);
  const dq = ah.q - bh.q;
  const dr = ah.r - bh.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

function slotIndexFor(side, x, y, allowCross = false) {
  const cols = balance.battle.columns;
  if (allowCross) {
    if (x < 0 || x >= cols || y < 0 || y >= totalRows()) return -1;
    return y * cols + x;
  }
  if (side === "enemy") {
    if (x < 0 || x >= cols || y < 0 || y >= enemyRows()) return -1;
    return y * cols + x;
  }
  if (x < 0 || x >= cols || y < allyStartRow() || y >= totalRows()) return -1;
  return (y - allyStartRow()) * cols + x;
}

function distanceBetween(a, b) {
  const from = unitSlot(a);
  const to = unitSlot(b);
  if (!from || !to) return 99;
  return hexDistanceSlots(from, to);
}

function isBacklineUnit(unit) {
  const slot = unitSlot(unit);
  if (!slot) return false;
  if (unit.side === "enemy") return slot.y <= Math.max(0, enemyRows() - 2);
  return slot.y >= allyStartRow() + Math.max(0, allyRows() - 2);
}

function nearestTarget(attacker, enemies) {
  const alive = living(enemies);
  if (!alive.length) return null;
  return alive.reduce((best, unit) => {
    const bestDistance = distanceBetween(attacker, best);
    const unitDistance = distanceBetween(attacker, unit);
    if (unitDistance !== bestDistance) return unitDistance < bestDistance ? unit : best;
    return unit.hp < best.hp ? unit : best;
  }, alive[0]);
}

function isFrontlineTarget(unit) {
  return ["수호", "돌격", "결투", "맹공"].includes(unit.trait) || ["방패", "돌격", "검객", "난투"].includes(unit.role);
}

function isBacklineDiver(unit) {
  return unit.trait === "기습" || unit.role === "암살";
}

function backlineJumpRows(unit) {
  return unit.side === "ally" ? [0, 1] : [totalRows() - 1, totalRows() - 2];
}

function enemyBacklineRows(attacker) {
  return attacker.side === "ally" ? [0, 1] : [totalRows() - 1, totalRows() - 2];
}

function emptyBacklineSlots(unit) {
  const from = unitSlot(unit);
  if (!state.combatGrid || !from) return [];
  const rows = backlineJumpRows(unit);
  const foes = living(state.combatGrid).filter((other) => other.side && other.side !== unit.side);
  const backlineTargets = foes
    .filter((target) => {
      const slot = unitSlot(target);
      return slot && rows.includes(slot.y);
    })
    .sort((a, b) => compareByDistanceThenHp(unit, a, b));
  const slots = [];
  const targetSlots = backlineTargets
    .map((target) => ({ target, slot: unitSlot(target) }))
    .filter(({ slot }) => slot);
  for (const { target, slot: targetSlot } of targetSlots) {
    for (const step of hexNeighborSteps(targetSlot.x, targetSlot.y)) {
      const x = targetSlot.x + step.x;
      const y = targetSlot.y + step.y;
      const index = slotIndexFor(unit.side, x, y, true);
      if (index < 0 || state.combatGrid[index]) continue;
      const slot = { index, x, y, distance: Math.abs(x - from.x), rowPriority: rows.indexOf(targetSlot.y), target };
      if (!slots.some((item) => item.index === index)) slots.push(slot);
    }
  }
  if (slots.length) {
    return slots.sort((a, b) => a.rowPriority - b.rowPriority || distanceBetween(unit, a.target) - distanceBetween(unit, b.target) || a.distance - b.distance || a.index - b.index);
  }
  for (const y of rows) {
    for (let x = 0; x < balance.battle.columns; x++) {
      const index = slotIndexFor(unit.side, x, y, true);
      if (index < 0 || state.combatGrid[index]) continue;
      slots.push({ index, x, y, distance: Math.abs(x - from.x), rowPriority: rows.indexOf(y) });
    }
  }
  return slots.sort((a, b) => a.rowPriority - b.rowPriority || a.distance - b.distance || a.index - b.index);
}

function placeBacklineDivers(units) {
  let moved = 0;
  for (const unit of units.filter((unit) =>
    isBacklineDiver(unit)
    && unit.status !== "tactical-pulled"
    && !unit.forcedFocusTargetId
  )) {
    const from = unitSlot(unit);
    const to = emptyBacklineSlots(unit)[0];
    if (!from || !to) continue;
    state.combatGrid[from.index] = null;
    state.combatGrid[to.index] = unit;
    unit.status = "moving";
    moved += 1;
  }
  return moved;
}

function backlineDepthFor(attacker, target) {
  const slot = unitSlot(target);
  if (!slot) return -1;
  return attacker.side === "enemy" ? slot.y : totalRows() - 1 - slot.y;
}

function compareByDistanceThenHp(attacker, a, b) {
  const distanceA = distanceBetween(attacker, a);
  const distanceB = distanceBetween(attacker, b);
  if (distanceA !== distanceB) return distanceA - distanceB;
  return a.hp - b.hp;
}

function pickOpeningTarget(attacker, alive) {
  if (isBacklineDiver(attacker)) {
    return alive.slice().sort((a, b) => {
      const depthA = backlineDepthFor(attacker, a);
      const depthB = backlineDepthFor(attacker, b);
      if (depthA !== depthB) return depthB - depthA;
      return compareByDistanceThenHp(attacker, a, b);
    })[0];
  }

  const frontline = alive.filter(isFrontlineTarget);
  const candidates = frontline.length ? frontline : alive;
  return candidates.slice().sort((a, b) => compareByDistanceThenHp(attacker, a, b))[0];
}

function moveToward(attacker, target) {
  if (attacker.rootRemainingMs > 0) return false;
  const from = unitSlot(attacker);
  const to = unitSlot(target);
  if (!from || !to) return false;
  if (hexDistanceSlots(from, to) <= unitAttackRange(attacker)) return false;
  const arr = state.combatGrid || (attacker.side === "enemy" ? state.enemies : state.board);
  const range = unitAttackRange(attacker);
  const visited = new Set([from.index]);
  const parents = new Map();
  const queue = [{ x: from.x, y: from.y, index: from.index }];
  let best = { ...from, distance: hexDistanceSlots(from, to) };
  let goal = null;

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    const currentDistance = hexDistanceSlots(current, to);
    if (currentDistance < best.distance) best = { ...current, distance: currentDistance };
    if (current.index !== from.index && currentDistance <= range) {
      goal = current;
      break;
    }

    const nextSlots = hexNeighborSteps(current.x, current.y)
      .map((step) => ({ x: current.x + step.x, y: current.y + step.y }))
      .map((slot) => ({ ...slot, index: slotIndexFor(attacker.side, slot.x, slot.y, Boolean(state.combatGrid)) }))
      .filter((slot) => slot.index >= 0 && !visited.has(slot.index) && !arr[slot.index])
      .sort((a, b) => hexDistanceSlots(a, to) - hexDistanceSlots(b, to));

    for (const slot of nextSlots) {
      visited.add(slot.index);
      parents.set(slot.index, current.index);
      queue.push(slot);
    }
  }

  const destination = goal || (best.index !== from.index ? best : null);
  if (!destination) return false;

  let nextIndex = destination.index;
  while (parents.get(nextIndex) !== from.index) {
    nextIndex = parents.get(nextIndex);
    if (nextIndex == null) return false;
  }

  if (arr[nextIndex]) return false;
  arr[from.index] = null;
  arr[nextIndex] = attacker;
  attacker.status = "moving";
  return true;
}

function removeDeadUnits(units) {
  if (!state.combatGrid) return;
  for (const unit of units) {
    if (!unit || unit.hp > 0) continue;
    const index = state.combatGrid.indexOf(unit);
    if (index >= 0) state.combatGrid[index] = null;
  }
}

function hexNeighborSteps(x, y) {
  const steps = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      if (hexDistanceSlots({ x, y }, { x: x + dx, y: y + dy }) === 1) steps.push({ x: dx, y: dy });
    }
  }
  return steps;
}

function moveNextToUnit(unit, anchor) {
  if (!state.combatGrid || unit.hp <= 0 || anchor.hp <= 0) return false;
  const from = unitSlot(unit);
  const anchorSlot = unitSlot(anchor);
  if (!from || !anchorSlot) return false;
  if (hexDistanceSlots(from, anchorSlot) === 1) return true;
  const destination = hexNeighborSteps(anchorSlot.x, anchorSlot.y)
    .map((step) => ({ x: anchorSlot.x + step.x, y: anchorSlot.y + step.y }))
    .map((slot) => ({ ...slot, index: slotIndexFor(unit.side, slot.x, slot.y, true) }))
    .filter((slot) => slot.index >= 0 && !state.combatGrid[slot.index])
    .sort((a, b) => hexDistanceSlots(from, a) - hexDistanceSlots(from, b) || a.index - b.index)[0];
  if (!destination) return false;
  state.combatGrid[from.index] = null;
  state.combatGrid[destination.index] = unit;
  unit.status = "moving";
  return true;
}

function resolveExclusiveRescue(target) {
  const units = state.combatGrid?.filter(Boolean) || [];
  const rescue = triggerExclusiveRescue(target, units);
  if (!rescue) return;
  moveNextToUnit(rescue.unit, rescue.partner);
  if (rescue.releaseAggro) {
    for (const enemy of units.filter((unit) => unit.side !== rescue.unit.side)) {
      if (enemy.focusTargetId === rescue.unit.id) enemy.focusTargetId = null;
      if (enemy.forcedFocusTargetId === rescue.unit.id) enemy.forcedFocusTargetId = null;
      enemy.hasPickedOpeningTarget = false;
    }
  }
  const heal = applyHeal(rescue.unit, rescue.unit.maxHp * rescue.healRatio);
  state.pendingHiddenEffects ||= [];
  if (heal > 0) state.pendingHiddenEffects.push(combatEffect(rescue.unit, rescue.unit, "heal", { amount: heal }));
  addLog(`${rescue.rule.name} 발동: ${rescue.unit.name}이 ${rescue.partner.name} 옆으로 이동해 체력 ${heal} 회복${rescue.releaseAggro ? " / 어그로 해제" : ""}.`);
}

function summonHiddenClones(allies) {
  if (!state.combatGrid) return [];
  const summoned = [];
  for (const owner of allies.filter((unit) => unit.hiddenCloneSummon)) {
    const ownerSlot = unitSlot(owner);
    if (!ownerSlot) continue;
    const destination = hexNeighborSteps(ownerSlot.x, ownerSlot.y)
      .map((step) => ({ x: ownerSlot.x + step.x, y: ownerSlot.y + step.y }))
      .map((slot) => ({ ...slot, index: slotIndexFor(owner.side, slot.x, slot.y, true) }))
      .filter((slot) => slot.index >= 0 && !state.combatGrid[slot.index])
      .sort((a, b) => b.y - a.y || Math.abs(a.x - ownerSlot.x) - Math.abs(b.x - ownerSlot.x) || a.index - b.index)[0];
    if (!destination) continue;
    const ratio = Math.max(0.1, Number(owner.hiddenCloneSummon.effect.statRatio) || 0.4);
    const clone = {
      ...owner,
      id: `${owner.id}-${combatId("clone")}`,
      name: "분신",
      maxHp: Math.max(1, Math.round(owner.maxHp * ratio)),
      hp: Math.max(1, Math.round(owner.maxHp * ratio)),
      atk: Math.max(1, Math.round(owner.atk * ratio)),
      skillAmp: Math.max(0, Math.round(owner.skillAmp * ratio)),
      defense: Math.max(0, Math.round(owner.defense * ratio)),
      mana: 0,
      hiddenClone: true,
      hiddenCloneOwnerId: owner.id,
      combatBase: null,
      status: "moving",
    };
    delete clone.hiddenCloneSummon;
    delete clone.hiddenDefeatEffects;
    delete clone.hiddenKillEffects;
    delete clone.hiddenFeastEffects;
    delete clone.hiddenKillBlink;
    delete clone.hiddenTacticalGrowth;
    delete clone.hiddenKillGrowth;
    state.combatGrid[destination.index] = clone;
    allies.push(clone);
    summoned.push({ owner, clone });
  }
  return summoned;
}

function blinkNextToTarget(unit, enemies) {
  if (!state.combatGrid || unit.hp <= 0) return null;
  const from = unitSlot(unit);
  const target = nearestTarget(unit, enemies);
  const targetSlot = target ? unitSlot(target) : null;
  if (!from || !target || !targetSlot) return null;
  const destinations = hexNeighborSteps(targetSlot.x, targetSlot.y)
    .map((step) => ({ x: targetSlot.x + step.x, y: targetSlot.y + step.y }))
    .map((slot) => ({ ...slot, index: slotIndexFor(unit.side, slot.x, slot.y, true) }))
    .filter((slot) => slot.index >= 0 && !state.combatGrid[slot.index])
    .sort((a, b) => hexDistanceSlots(from, a) - hexDistanceSlots(from, b) || a.index - b.index);
  const destination = destinations[0];
  if (!destination) return null;
  state.combatGrid[from.index] = null;
  state.combatGrid[destination.index] = unit;
  unit.focusTargetId = target.id;
  unit.hasPickedOpeningTarget = true;
  unit.status = "moving";
  return target;
}

function unitsInRange(source, targets, range) {
  return living(targets).filter((unit) => distanceBetween(source, unit) <= range);
}

function unitsInFront(source, targets, range) {
  const from = unitSlot(source);
  if (!from) return [];
  const forward = source.side === "enemy" ? 1 : -1;
  return unitsInRange(source, targets, range).filter((unit) => {
    const to = unitSlot(unit);
    return to && (to.y - from.y) * forward >= 0;
  });
}

function centerSlotFor(unit) {
  if (!state.combatGrid) return null;
  const from = unitSlot(unit);
  if (!from) return null;
  const center = { x: (balance.battle.columns - 1) / 2, y: (totalRows() - 1) / 2 };
  const candidates = [];
  for (let y = 0; y < totalRows(); y += 1) {
    for (let x = 0; x < balance.battle.columns; x += 1) {
      const index = slotIndexFor(unit.side, x, y, true);
      if (index < 0 || state.combatGrid[index]) continue;
      candidates.push({
        x,
        y,
        index,
        centerDistance: Math.abs(x - center.x) + Math.abs(y - center.y),
        travelDistance: hexDistanceSlots(from, { x, y }),
      });
    }
  }
  return candidates.sort((a, b) => a.centerDistance - b.centerDistance || a.travelDistance - b.travelDistance || a.index - b.index)[0] || null;
}

function moveToCenter(unit) {
  const from = unitSlot(unit);
  const destination = centerSlotFor(unit);
  if (!from || !destination) return false;
  state.combatGrid[from.index] = null;
  state.combatGrid[destination.index] = unit;
  unit.status = "moving";
  return true;
}

function applyStun(unit, turns) {
  const duration = Math.max(unit.stunRemainingMs || 0, durationFromTurns(turns));
  unit.stunRemainingMs = duration;
  unit.stunDurationMs = Math.max(unit.stunDurationMs || 0, duration);
  unit.status = "stunned";
}

function applyStunMs(unit, durationMs) {
  const duration = Math.max(unit.stunRemainingMs || 0, Math.max(0, Number(durationMs) || 0));
  unit.stunRemainingMs = duration;
  unit.stunDurationMs = Math.max(unit.stunDurationMs || 0, duration);
  unit.status = "stunned";
}

function knockBack(target, source, steps) {
  if (!state.combatGrid) return 0;
  let moved = 0;
  for (let i = 0; i < steps; i++) {
    const from = unitSlot(target);
    const sourceSlot = unitSlot(source);
    if (!from || !sourceSlot) break;
    const currentDistance = hexDistanceSlots(from, sourceSlot);
    const options = hexNeighborSteps(from.x, from.y)
      .map((step) => ({ x: from.x + step.x, y: from.y + step.y }))
      .filter((slot) => {
        const index = slotIndexFor(target.side, slot.x, slot.y, true);
        if (index < 0 || state.combatGrid[index]) return false;
        return hexDistanceSlots(slot, sourceSlot) > currentDistance;
      })
      .sort((a, b) => hexDistanceSlots(b, sourceSlot) - hexDistanceSlots(a, sourceSlot));
    if (!options.length) break;
    const next = options[0];
    const nextIndex = slotIndexFor(target.side, next.x, next.y, true);
    state.combatGrid[from.index] = null;
    state.combatGrid[nextIndex] = target;
    moved++;
  }
  if (moved) target.status = "moving";
  return moved;
}

function backlineTargets(caster, enemies, count = 3) {
  return living(enemies)
    .slice()
    .sort((a, b) => {
      const slotA = unitSlot(a);
      const slotB = unitSlot(b);
      const depthA = slotA ? (caster.side === "enemy" ? slotA.y : -slotA.y) : 0;
      const depthB = slotB ? (caster.side === "enemy" ? slotB.y : -slotB.y) : 0;
      if (depthA !== depthB) return depthB - depthA;
      return a.hp - b.hp;
    })
    .slice(0, count);
}

function summonOmega(caster) {
  const hanaPattern = bossPatterns.hana;
  const casterSlot = unitSlot(caster);
  if (!state.combatGrid || !casterSlot) return null;
  const range = hanaPattern.summonRange || 1;
  const emptySlots = [];
  for (let y = 0; y < totalRows(); y++) {
    for (let x = 0; x < balance.battle.columns; x++) {
      const index = slotIndexFor(caster.side, x, y, true);
      if (index < 0 || state.combatGrid[index]) continue;
      const distance = hexDistanceSlots({ x, y }, casterSlot);
      if (distance > 0 && distance <= range) emptySlots.push({ index, distance, y });
    }
  }
  emptySlots.sort((a, b) => a.distance - b.distance || a.y - b.y || a.index - b.index);
  const index = emptySlots[0]?.index;
  if (index == null) return null;
  const omega = {
    ...bossRoster.find((boss) => boss.pattern === "omega"),
    id: combatId("omega"),
    tier: 2,
    cost: 5,
    boss: true,
    summoned: true,
    maxHp: Math.round(caster.maxHp * hanaPattern.summonHpRatio),
    hp: Math.round(caster.maxHp * hanaPattern.summonHpRatio),
    atk: Math.round(caster.atk * hanaPattern.summonAtkRatio),
    skillAmp: Math.round(caster.skillAmp * hanaPattern.summonSkillAmpRatio),
    defense: Math.round(caster.defense * hanaPattern.summonDefenseRatio),
    summonCount: 0,
    immuneUsed: false,
    immuneRemainingMs: 0,
  };
  prepareCombatUnit(omega, caster.side);
  state.enemies[index] = omega;
  state.combatGrid[index] = omega;
  caster.summonCount += 1;
  return omega;
}

function applyRoot(unit, turns) {
  const duration = Math.max(unit.rootRemainingMs || 0, durationFromTurns(turns));
  unit.rootRemainingMs = duration;
  unit.rootDurationMs = Math.max(unit.rootDurationMs || 0, duration);
  unit.status = "rooted";
}

function applyActionSlow(unit, turns, ratio = 0.45) {
  const duration = durationFromTurns(turns);
  unit.actionCooldownMs = Math.max(unit.actionCooldownMs || 0, duration * ratio);
  unit.status = "slowed";
}

function clearControlStatuses(unit) {
  unit.stunRemainingMs = 0;
  unit.stunDurationMs = 0;
  unit.actionLockRemainingMs = 0;
  unit.actionLockDurationMs = 0;
  unit.rootRemainingMs = 0;
  unit.rootDurationMs = 0;
  unit.healReduction = 0;
  unit.healReductionRemainingMs = 0;
  unit.healReductionDurationMs = 0;
}

function unitById(id) {
  return state.combatGrid?.find((unit) => unit?.id === id && unit.hp > 0) || null;
}

function activeLifeSharePartner(unit) {
  if (!unit?.lifeSharePairId || unit.lifeShareRemainingMs <= 0) return null;
  const partner = unitById(unit.lifeSharePartnerId);
  if (!partner || partner.lifeSharePairId !== unit.lifeSharePairId || partner.lifeShareRemainingMs <= 0) return null;
  return partner;
}

function redistributeLifeShare(unit) {
  const partner = activeLifeSharePartner(unit);
  if (!partner) return false;
  const totalMaxHp = Math.max(1, unit.maxHp + partner.maxHp);
  const totalHp = Math.max(2, unit.hp + partner.hp);
  const ratio = Math.min(1, totalHp / totalMaxHp);
  unit.hp = Math.max(1, Math.min(unit.maxHp, Math.round(unit.maxHp * ratio)));
  partner.hp = Math.max(1, Math.min(partner.maxHp, totalHp - unit.hp));
  if (partner.hp > partner.maxHp) {
    const overflow = partner.hp - partner.maxHp;
    partner.hp = partner.maxHp;
    unit.hp = Math.min(unit.maxHp, unit.hp + overflow);
  }
  unit.status = "shielded";
  partner.status = "shielded";
  return true;
}

function knockBackWithCollision(target, source, steps) {
  if (!state.combatGrid) return { moved: 0, collision: null, wall: false };
  let moved = 0;
  for (let step = 0; step < steps; step += 1) {
    const from = unitSlot(target);
    const sourceSlot = unitSlot(source);
    if (!from || !sourceSlot) break;
    const directionX = from.x - sourceSlot.x;
    const directionY = from.y - sourceSlot.y;
    const currentDistance = hexDistanceSlots(from, sourceSlot);
    const destination = hexNeighborSteps(from.x, from.y)
      .map((delta) => ({ x: from.x + delta.x, y: from.y + delta.y, delta }))
      .filter((slot) => hexDistanceSlots(slot, sourceSlot) > currentDistance)
      .sort((a, b) =>
        (b.delta.x * directionX + b.delta.y * directionY)
        - (a.delta.x * directionX + a.delta.y * directionY)
      )[0];
    if (!destination) return { moved, collision: null, wall: true };
    const index = slotIndexFor(target.side, destination.x, destination.y, true);
    if (index < 0) return { moved, collision: null, wall: true };
    const occupant = state.combatGrid[index];
    if (occupant) return { moved, collision: occupant, wall: false };
    state.combatGrid[from.index] = null;
    state.combatGrid[index] = target;
    target.status = "knocked";
    moved += 1;
  }
  return { moved, collision: null, wall: false };
}

function applyOpeningShield(units, targetsKey, ratioKey, preferBackline) {
  const targetCount = Math.max(...units.map((unit) => unit[targetsKey] || 0), 0);
  const shieldRatio = Math.max(...units.map((unit) => unit[ratioKey] || 0), 0);
  if (!targetCount || !shieldRatio) return 0;
  const isTargetRow = (unit, slot) => {
    if (unit.side === "enemy") return preferBackline ? slot.y <= 1 : slot.y >= Math.max(0, enemyRows() - 2);
    return preferBackline ? slot.y >= totalRows() - 2 : slot.y < allyStartRow() + 2;
  };
  const targets = living(units)
    .map((unit) => ({ unit, slot: unitSlot(unit) }))
    .filter(({ unit, slot }) => slot && isTargetRow(unit, slot))
    .sort((a, b) => {
      const rowDelta = preferBackline ? b.slot.y - a.slot.y : a.slot.y - b.slot.y;
      return rowDelta || (a.unit.hp / a.unit.maxHp) - (b.unit.hp / b.unit.maxHp);
    })
    .slice(0, targetCount >= 99 ? undefined : targetCount);
  for (const { unit } of targets) {
    unit.shield = Math.max(unit.shield || 0, Math.round(unit.maxHp * shieldRatio));
    unit.status = "shielded";
  }
  return targets.length;
}

function pullBacklineEnemies(allies, enemies) {
  const targetCount = Math.max(...allies.map((unit) => unit.pullBacklineTargets || 0), 0);
  if (!targetCount || !state.combatGrid) return { units: [] };
  const targets = living(enemies)
    .map((unit) => ({ unit, slot: unitSlot(unit) }))
    .filter(({ slot }) => slot && slot.y <= 1)
    .sort((a, b) => a.slot.y - b.slot.y || a.unit.hp - b.unit.hp)
    .slice(0, targetCount);
  const movedUnits = [];
  for (const { unit } of targets) {
    const from = unitSlot(unit);
    if (!from) continue;
    const destinations = [];
    for (let y = allyStartRow(); y < totalRows(); y++) {
      for (let x = 0; x < balance.battle.columns; x++) {
        const index = slotIndexFor("ally", x, y, true);
        if (index < 0 || state.combatGrid[index]) continue;
        const slot = { x, y, index };
        const distances = living(allies).map((ally) => ({
          ally,
          distance: hexDistanceSlots(slot, unitSlot(ally)),
        }));
        destinations.push({
          ...slot,
          adjacentAllies: distances.filter(({ distance }) => distance === 1).length,
          readyAttackers: distances.filter(({ ally, distance }) => distance <= unitAttackRange(ally)).length,
          totalDistance: distances.reduce((sum, { distance }) => sum + distance, 0),
        });
      }
    }
    const destination = destinations.sort((a, b) =>
      b.adjacentAllies - a.adjacentAllies
      || b.readyAttackers - a.readyAttackers
      || a.totalDistance - b.totalDistance
      || b.y - a.y
      || Math.abs(a.x - 3.5) - Math.abs(b.x - 3.5)
    )[0];
    if (!destination) continue;
    state.combatGrid[from.index] = null;
    state.combatGrid[destination.index] = unit;
    unit.status = "tactical-pulled";
    unit.tacticalTarget = true;
    movedUnits.push(unit);
  }
  return { units: movedUnits };
}

function applyOpeningTeamUtilities(allies, enemies) {
  const backlineShielded = applyOpeningShield(allies, "backlineShieldTargets", "backlineShieldRatio", true);
  const frontlineShielded = applyOpeningShield(allies, "frontlineShieldTargets", "frontlineShieldRatio", false);
  const pullResult = pullBacklineEnemies(allies, enemies);
  const focusTarget = pullResult.units[0] || null;
  if (focusTarget) {
    for (const ally of living(allies)) {
      ally.forcedFocusTargetId = focusTarget.id;
      ally.focusTargetId = focusTarget.id;
      ally.hasPickedOpeningTarget = true;
    }
  }
  return {
    backlineShielded,
    frontlineShielded,
    pulledUnits: pullResult.units.length,
    focusTarget,
  };
}

function prepareCombatUnit(unit, side, counts = {}) {
  unit.side = side;
  const stats = side === "ally" ? applySynergy(unit, counts) : {
    hp: unit.maxHp,
    atk: unit.atk,
    speed: unit.speed,
    skillAmp: unit.skillAmp,
    defense: unit.defense,
    heal: 1,
    healTargets: unit.healTargets ?? (unit.role === "지원" ? 2 : 1),
    critChance: unit.critChance ?? 0,
    critDamage: unit.critDamage ?? 1.5,
    skillCritChance: unit.skillCritChance ?? 0,
    skillCritDamage: unit.skillCritDamage ?? 1.5,
    openingCritMultiplier: unit.openingCritMultiplier ?? 1,
    lifeSteal: unit.lifeSteal ?? 0,
    damageReduction: unit.damageReduction ?? 0,
    manaGain: unit.manaGain ?? 1,
    skillTargets: unit.skillTargets ?? (unit.role === "술법" ? 3 : 1),
    rangeBonus: unit.rangeBonus ?? 0,
    maxMana: unit.maxMana ?? 100,
    maxManaReduction: unit.maxManaReduction ?? 0,
    extraAttackEvery: unit.extraAttackEvery ?? 0,
    extraAttackDamageRatio: unit.extraAttackDamageRatio ?? 1,
    basicAttackExtraTargets: unit.basicAttackExtraTargets ?? 0,
    healReductionOnHit: unit.healReductionOnHit ?? 0,
    healReductionTicks: unit.healReductionTicks ?? 0,
    backlineShieldTargets: unit.backlineShieldTargets ?? 0,
    backlineShieldRatio: unit.backlineShieldRatio ?? 0,
    frontlineShieldTargets: unit.frontlineShieldTargets ?? 0,
    frontlineShieldRatio: unit.frontlineShieldRatio ?? 0,
    pullBacklineTargets: unit.pullBacklineTargets ?? 0,
    openingMana: unit.openingMana ?? 0,
    manaOnHitBonus: unit.manaOnHitBonus ?? 0,
    supportAidHpRatio: unit.supportAidHpRatio ?? 0,
    supportAidDefense: unit.supportAidDefense ?? 0,
    supportAidDamageReduction: unit.supportAidDamageReduction ?? 0,
  };
  if (side === "ally") {
    const boosts = state.temporaryBoosts || {};
    stats.hp *= 1 + (boosts.hp || 0);
    stats.atk *= 1 + (boosts.atk || 0);
    stats.skillAmp *= 1 + (boosts.skillAmp || 0);
    applyAugmentStatsToUnit(state, unit, stats, {
      slotOf: unitSlot,
      allyStartRow: allyStartRow(),
      adjacentAllyCount: (target, range = 1) => boardUnits()
        .filter((candidate) => candidate && candidate !== target)
        .filter((candidate) => {
          candidate.side ||= "ally";
          return distanceBetween(target, candidate) <= range;
        }).length,
    });
  }
  unit.mana = 0;
  unit.maxHp = Math.round(stats.hp);
  unit.hp = unit.maxHp;
  unit.atk = Math.round(stats.atk);
  unit.speed = stats.speed;
  unit.skillAmp = Math.round(stats.skillAmp);
  unit.defense = Math.round(stats.defense);
  unit.healPower = stats.heal;
  unit.healTargets = Math.max(1, Math.round(stats.healTargets ?? 1));
  unit.critChance = Math.max(0, Math.min(1, stats.critChance ?? 0));
  unit.critDamage = Math.max(1, stats.critDamage ?? 1.5);
  unit.skillCritChance = Math.max(0, Math.min(1, stats.skillCritChance ?? 0));
  unit.skillCritDamage = Math.max(1, stats.skillCritDamage ?? 1.5);
  unit.openingCritMultiplier = Math.max(1, stats.openingCritMultiplier ?? 1);
  unit.lifeSteal = Math.max(0, stats.lifeSteal ?? 0);
  unit.damageReduction = Math.max(0, Math.min(0.8, stats.damageReduction ?? 0));
  unit.manaGain = Math.max(0.1, stats.manaGain ?? 1);
  unit.skillTargets = Math.max(1, Math.round(stats.skillTargets ?? 1));
  unit.rangeBonus = Math.max(0, Math.round(stats.rangeBonus ?? 0));
  unit.maxMana = Math.max(40, Math.round(stats.maxMana ?? 100));
  unit.maxManaReduction = Math.max(0, Math.round(stats.maxManaReduction ?? 0));
  unit.extraAttackEvery = Math.max(0, Math.round(stats.extraAttackEvery ?? 0));
  unit.extraAttackDamageRatio = Math.max(0.1, stats.extraAttackDamageRatio ?? 1);
  unit.basicAttackExtraTargets = Math.max(0, Math.round(stats.basicAttackExtraTargets ?? 0));
  unit.healReductionOnHit = Math.max(0, Math.min(0.9, stats.healReductionOnHit ?? 0));
  unit.healReductionTicks = Math.max(0, Math.round(stats.healReductionTicks ?? 0));
  unit.backlineShieldTargets = Math.max(0, Math.round(stats.backlineShieldTargets ?? 0));
  unit.backlineShieldRatio = Math.max(0, stats.backlineShieldRatio ?? 0);
  unit.frontlineShieldTargets = Math.max(0, Math.round(stats.frontlineShieldTargets ?? 0));
  unit.frontlineShieldRatio = Math.max(0, stats.frontlineShieldRatio ?? 0);
  unit.pullBacklineTargets = Math.max(0, Math.round(stats.pullBacklineTargets ?? 0));
  unit.openingMana = Math.max(0, Math.round(stats.openingMana ?? 0));
  unit.manaOnHitBonus = Math.max(0, stats.manaOnHitBonus ?? 0);
  unit.supportAidHpRatio = Math.max(0, stats.supportAidHpRatio ?? 0);
  unit.supportAidDefense = Math.max(0, Math.round(stats.supportAidDefense ?? 0));
  unit.supportAidDamageReduction = Math.max(0, Math.min(0.5, stats.supportAidDamageReduction ?? 0));
  unit.supportAidBuff = null;
  unit.range = unitAttackRange(unit);
  unit.status = "";
  unit.stunRemainingMs = 0;
  unit.stunDurationMs = 0;
  unit.actionLockRemainingMs = 0;
  unit.actionLockDurationMs = 0;
  unit.rootRemainingMs = 0;
  unit.rootDurationMs = 0;
  unit.peaceRemainingMs = 0;
  unit.peaceDurationMs = 0;
  unit.lifeShareRemainingMs = 0;
  unit.lifeShareDurationMs = 0;
  unit.lifeSharePairId = null;
  unit.lifeSharePartnerId = null;
  unit.shawlCurtainRemainingMs = 0;
  unit.shawlCurtainDurationMs = 0;
  unit.shieldDefenseRemainingMs = 0;
  unit.shieldDefenseDurationMs = 0;
  unit.shield = 0;
  unit.leniShield = 0;
  unit.healReduction = 0;
  unit.healReductionRemainingMs = 0;
  unit.healReductionDurationMs = 0;
  unit.basicAttackCount = 0;
  unit.samjaeMarks = 0;
  unit.flameAttacks = 0;
  unit.mealTimeCasts = 0;
  unit.bihyungEnhancedAttacks = 0;
  unit.garnetIronMaiden = null;
  unit.biancaReignUsed = false;
  unit.immuneRemainingMs = unit.immuneRemainingMs || 0;
  unit.immuneDurationMs = unit.immuneRemainingMs || 0;
  unit.actionCooldownMs = 0;
  unit.focusTargetId = null;
  unit.forcedFocusTargetId = null;
  unit.tacticalTarget = false;
  unit.hasPickedOpeningTarget = false;
  unit.hasUsedOpeningCrit = false;
  unit.mana = Math.min(unitMaxMana(unit), unit.openingMana || 0);
  return unit;
}

function pickTarget(attacker, enemies) {
  const alive = living(enemies);
  if (!alive.length) return null;

  if (attacker.forcedFocusTargetId) {
    const forced = alive.find((unit) => unit.id === attacker.forcedFocusTargetId);
    if (forced) {
      attacker.focusTargetId = forced.id;
      attacker.hasPickedOpeningTarget = true;
      return forced;
    }
    attacker.forcedFocusTargetId = null;
    attacker.focusTargetId = null;
  }

  if (isBacklineDiver(attacker)) {
    const rows = enemyBacklineRows(attacker);
    const reachable = alive.filter((unit) => distanceBetween(attacker, unit) <= unitAttackRange(attacker));
    const reachableBackline = reachable.filter((unit) => {
      const slot = unitSlot(unit);
      return slot && rows.includes(slot.y);
    });
    const candidates = reachableBackline.length ? reachableBackline : reachable;
    if (candidates.length) {
      const target = candidates.slice().sort((a, b) => compareByDistanceThenHp(attacker, a, b))[0];
      attacker.focusTargetId = target.id;
      attacker.hasPickedOpeningTarget = true;
      return target;
    }

    const backline = alive.filter((unit) => {
      const slot = unitSlot(unit);
      return slot && rows.includes(slot.y);
    });
    const target = (backline.length ? backline : alive)
      .slice()
      .sort((a, b) => {
        const slotA = unitSlot(a);
        const slotB = unitSlot(b);
        const rowA = slotA ? rows.indexOf(slotA.y) : 99;
        const rowB = slotB ? rows.indexOf(slotB.y) : 99;
        if (rowA !== rowB) return rowA - rowB;
        return compareByDistanceThenHp(attacker, a, b);
      })[0];
    attacker.focusTargetId = target.id;
    attacker.hasPickedOpeningTarget = true;
    return target;
  }

  const reachable = alive.filter((unit) => distanceBetween(attacker, unit) <= unitAttackRange(attacker));
  if (reachable.length) {
    const target = reachable.slice().sort((a, b) => compareByDistanceThenHp(attacker, a, b))[0];
    attacker.focusTargetId = target.id;
    attacker.hasPickedOpeningTarget = true;
    return target;
  }

  if (attacker.focusTargetId) {
    const focused = alive.find((unit) => unit.id === attacker.focusTargetId);
    if (focused) return focused;
  }

  const target = attacker.hasPickedOpeningTarget ? nearestTarget(attacker, enemies) : pickOpeningTarget(attacker, alive);
  if (target) {
    attacker.focusTargetId = target.id;
    attacker.hasPickedOpeningTarget = true;
  }
  return target;
}

function dealDamage(source, target, amount, options = {}) {
  let adjustedAmount = amount;
  if (source?.side === "ally" && target) {
    for (const effect of selectedAugmentEffects("damageAgainstHighestDefense")) {
      const foes = (state.combatGrid || []).filter((unit) => unit && unit.side !== source.side && unit.hp > 0);
      const highestDefense = Math.max(0, ...foes.map((unit) => unit.defense || 0));
      if ((target.defense || 0) >= highestDefense) adjustedAmount *= Number(effect.damageMultiply) || 1;
    }
    const sameTargetStacks = source.augmentSameTargetStacks?.[target.id] || 0;
    const sameTargetBonus = selectedAugmentEffects("sameTargetVulnerability")
      .reduce((sum, effect) => sum + Math.min(Number(effect.stacks) || 0, sameTargetStacks) * (Number(effect.damageTakenAddPerStack) || 0), 0);
    adjustedAmount *= 1 + sameTargetBonus;
    const curseBonus = (target.augmentCurseStacks || 0) * selectedAugmentEffects("skillCurseStack")
      .reduce((sum, effect) => sum + (Number(effect.damageTakenAdd) || 0), 0);
    adjustedAmount *= 1 + curseBonus + (target.augmentDamageTakenAdd || 0);
    const daniel = unitAugmentEffect(source, "danielMoonlightExecution");
    if (daniel && isBacklineUnit(target)) adjustedAmount *= Number(daniel.backlineDamageMultiply) || 1;
  }
  const damageFloor = Math.max(3, Math.round(adjustedAmount * 0.12));
  const shawlReduction = target.shawlCurtainRemainingMs > 0 && target.shield > 0 ? 0.25 : 0;
  const shieldDefenseReduction = target.shieldDefenseRemainingMs > 0 ? 0.6 : 0;
  const totalReduction = Math.max(0, Math.min(0.85, (target.damageReduction || 0) + shawlReduction + shieldDefenseReduction));
  const reducedAmount = adjustedAmount * (1 - totalReduction);
  const damage = options.fixed
    ? Math.max(0, Math.round(adjustedAmount))
    : Math.max(damageFloor, Math.round(reducedAmount - target.defense * 0.45));
  const wickelinePattern = bossPatterns.wickeline;
  if (target.pattern === "wickeline" && target.immuneRemainingMs > 0) {
    target.status = "immune";
    return 0;
  }
  if (target.pattern === "wickeline" && !target.immuneUsed && (target.hp - damage) / target.maxHp <= wickelinePattern.immuneHpRatio) {
    target.immuneUsed = true;
    target.immuneRemainingMs = durationFromTurns(wickelinePattern.immuneTicks);
    target.immuneDurationMs = target.immuneRemainingMs;
    target.status = "immune";
    return 0;
  }
  const absorbed = Math.min(target.shield || 0, damage);
  if (absorbed > 0) {
    target.shield = Math.max(0, (target.shield || 0) - absorbed);
    target.leniShield = Math.max(0, (target.leniShield || 0) - absorbed);
  }
  const hpDamage = Math.max(0, damage - absorbed);
  target.hp = Math.max(0, target.hp - hpDamage);
  if (hpDamage > 0 && source?.id && source.side !== target.side) {
    target.killContributors ||= new Set();
    target.killContributors.add(source.id);
  }
  if (hpDamage > 0 && target.lifeShareRemainingMs > 0) {
    redistributeLifeShare(target);
  }
  if (target.hp <= 0 && target.peaceRemainingMs > 0) {
    target.hp = 1;
    target.status = "immune";
  }
  if (target.hp > 0 && target.garnetIronMaiden?.remainingMs > 0) {
    const threshold = target.garnetIronMaiden.executeHpRatio ?? 0.22;
    if (target.hp / target.maxHp <= threshold) {
      const maiden = target.garnetIronMaiden;
      target.hp = 0;
      target.status = "dead";
      playSkillVisual?.({ type: "fate-absorb", fromId: maiden.casterId, targetIds: [target.id] });
      addLog(`${maiden.casterName} 아이언메이든: ${target.name} 처형.`);
    }
  }
  resolveExclusiveRescue(target);
  if (source?.healReductionOnHit > 0 && damage > 0 && target.hp > 0) {
    target.healReduction = Math.max(target.healReduction || 0, source.healReductionOnHit);
    const healReductionMs = durationFromTurns(source.healReductionTicks || 1);
    target.healReductionRemainingMs = Math.max(target.healReductionRemainingMs || 0, healReductionMs);
    target.healReductionDurationMs = Math.max(target.healReductionDurationMs || 0, healReductionMs);
  }
  const manaFromHit = Math.min(balance.battle.manaPerHit, Math.max(3, Math.round(damage * 0.32)));
  gainMana(target, manaFromHit * (1 + Math.max(0, target.manaOnHitBonus || 0)));
  target.status = target.hp > 0 ? "hit" : "dead";
  if (source?.side === "ally" && target.hp > 0 && !options.skipAugmentExecution) {
    const daniel = unitAugmentEffect(source, "danielMoonlightExecution");
    if (daniel && target.hp / target.maxHp <= (Number(daniel.executeThresholdHpRatio) || 0)) {
      const executeDamage = dealDamage(source, target, source.atk * (Number(daniel.executeDamageAtkRatio) || 0), { fixed: true, skipAugmentExecution: true });
      state.pendingHiddenEffects ||= [];
      if (executeDamage > 0) state.pendingHiddenEffects.push(combatEffect(source, target, "skill", { amount: executeDamage, fixed: true }));
    }
    for (const effect of selectedAugmentEffects("executeLowHpEnemy")) {
      const threshold = Number(effect.thresholdHpRatio) || 0;
      if (threshold > 0 && target.hp / target.maxHp <= threshold) {
        if (target.boss) {
          const executeDamage = dealDamage(source, target, target.maxHp * (Number(effect.bossDamageMaxHpRatio) || 0), { fixed: true, skipAugmentExecution: true });
          state.pendingHiddenEffects ||= [];
          if (executeDamage > 0) state.pendingHiddenEffects.push(combatEffect(source, target, "skill", { amount: executeDamage, fixed: true }));
        } else {
          target.hp = 0;
          target.status = "dead";
        }
      }
    }
  }
  const lowHpEffects = triggerLowHpAugments(target);
  if (lowHpEffects.length) {
    state.pendingHiddenEffects ||= [];
    state.pendingHiddenEffects.push(...lowHpEffects);
  }
  if (target.hp <= 0) {
    const reviveEffect = triggerThreeStarRevive(target);
    if (reviveEffect) {
      state.pendingHiddenEffects ||= [];
      state.pendingHiddenEffects.push(reviveEffect);
    }
  }
  if (target.hp <= 0) {
    const units = state.combatGrid?.filter(Boolean) || [];
    const rallies = triggerDefeatEffects(target, units);
    if (rallies.length) {
      const names = rallies.map(({ unit }) => unit.name).join(", ");
      addLog(`${rallies[0].rule.name} 발동: ${target.name}의 의지를 이어받아 ${names} 강화.`);
      state.pendingHiddenEffects ||= [];
      for (const { unit, heal } of rallies) {
        if (heal > 0) state.pendingHiddenEffects.push(combatEffect(unit, unit, "heal", { amount: heal }));
      }
    }
    const feastRallies = triggerFeastEffects(target, units);
    if (feastRallies.length) {
      const names = feastRallies.map(({ unit }) => unit.name).join(", ");
      addLog(`${feastRallies[0].rule.name} 발동: ${target.name}의 만찬을 이어받아 ${names} 회복.`);
      state.pendingHiddenEffects ||= [];
      for (const { unit, heal } of feastRallies) {
        if (heal > 0) state.pendingHiddenEffects.push(combatEffect(unit, unit, "heal", { amount: heal }));
      }
    }
    const killRallies = triggerKillEffects(source, units);
    if (killRallies.length) {
      const names = killRallies.map(({ unit }) => unit.name).join(", ");
      addLog(`${killRallies[0].rule.name} 발동: ${source.name}의 처치로 ${names} 체력·마나 회복.`);
      state.pendingHiddenEffects ||= [];
      for (const { unit, heal, fillMana } of killRallies) {
        if (fillMana) unit.mana = unitMaxMana(unit);
        if (heal > 0) state.pendingHiddenEffects.push(combatEffect(unit, unit, "heal", { amount: heal }));
      }
    }
    const contributors = [...(target.killContributors || [])]
      .map((id) => units.find((unit) => unit.id === id))
      .filter(Boolean);
    const killUtilities = triggerKillUtilities(source, target, contributors);
    if (source?.side === "ally" && source.hp > 0) {
      for (const effect of selectedAugmentEffects("teamKillCombatStack")) {
        const allies = living(units).filter((unit) => unit.side === source.side);
        const maxStacks = Number(effect.stacks) || 0;
        for (const ally of allies) {
          ally.augmentKillCombatStacks = Math.min(maxStacks, (ally.augmentKillCombatStacks || 0) + 1);
          ally.atk *= 1 + (Number(effect.atkMultiplyAdd) || 0);
          ally.skillAmp *= 1 + (Number(effect.skillAmpMultiplyAdd) || 0);
        }
      }
      if (hasUnitAugment(source, "lukeCleaningService")) {
        source.lukeCleaningBoost = true;
        target.augmentDamageTakenAdd = Math.max(target.augmentDamageTakenAdd || 0, Number(unitAugmentEffect(source, "lukeCleaningService")?.markedDamageTakenAdd) || 0);
      }
      const iremEffect = unitAugmentEffect(source, "iremCatfishMayhem");
      if (iremEffect) {
        const multiply = target.tacticalTarget ? Number(iremEffect.tacticalTargetBonusMultiply) || 1 : 1;
        source.atk += (Number(iremEffect.killAtkAdd) || 0) * multiply;
        source.skillAmp += (Number(iremEffect.killSkillAmpAdd) || 0) * multiply;
        addLog(`${source.name} 증강 성장: 공격 +${(Number(iremEffect.killAtkAdd) || 0) * multiply} / 스증 +${(Number(iremEffect.killSkillAmpAdd) || 0) * multiply}.`);
      }
    }
    if (target.side === "ally") {
      for (const effect of selectedAugmentEffects("deadAllyAttackShare")) {
        const share = (target.atk || 0) * (Number(effect.atkShareRatio) || 0);
        for (const ally of living(units).filter((unit) => unit.side === target.side && unit !== target)) ally.atk += share;
      }
      for (const effect of selectedAugmentEffects("inheritFirstDeadThreeStar")) {
        if (state.augmentInheritedThreeStar || target.tier < 3) continue;
        state.augmentInheritedThreeStar = true;
        for (const ally of living(units).filter((unit) => unit.side === target.side && unit !== target)) {
          ally.atk += target.atk * (Number(effect.inheritAtkRatio) || 0);
          ally.skillAmp += target.skillAmp * (Number(effect.inheritSkillAmpRatio) || 0);
          ally.maxHp += Math.round(target.maxHp * (Number(effect.inheritHpRatio) || 0));
          ally.hp += Math.round(target.maxHp * (Number(effect.inheritHpRatio) || 0));
        }
      }
    }
    if (target.augmentLenoxSuppressSeconds > 0) {
      const nearby = living(units).filter((unit) => unit.side === target.side && unit !== target && distanceBetween(target, unit) <= 1);
      for (const unit of nearby) applyStunMs(unit, target.augmentLenoxSuppressSeconds * 1000);
    }
    removeDeadUnits([target]);
    if (source?.skillId === "jackie_assault" && source.hp > 0 && !options.skipKillFollowup) {
      const nextTarget = blinkNextToTarget(source, units.filter((unit) => unit.side !== source.side && unit.hp > 0));
      if (nextTarget) {
        const followDamage = dealSkillDamage(source, nextTarget, source.atk * 0.65 + source.skillAmp * 0.85 + 6, { skipKillFollowup: true });
        state.pendingHiddenEffects ||= [];
        state.pendingHiddenEffects.push(combatEffect(source, nextTarget, "skill", { amount: followDamage }));
        addLog(`${source.name} 습격: ${nextTarget.name} 옆으로 도약해 ${followDamage} 피해.`);
      }
    }
    for (const utility of killUtilities) {
      if (utility.type === "killBlink") {
        const nextTarget = blinkNextToTarget(source, units.filter((unit) => unit.side !== source.side));
        if (nextTarget) addLog(`${utility.rule.name} 발동: ${source.name}이 ${nextTarget.name}의 옆으로 이동.`);
      }
      if (utility.type === "tacticalGrowth") {
        addLog(`${utility.rule.name} 발동: ${utility.unit.name} 공격 +${utility.atk} / 스증 +${utility.skillAmp} / 체력 +${utility.maxHp}.`);
      }
      if (utility.type === "killGrowth") {
        addLog(`${utility.rule.name} 발동: ${utility.unit.name} 공격력 영구 +${utility.atk}.`);
      }
    }
  }
  return damage;
}

function weaponEffectKind(unit, type = "attack") {
  if (type === "heal" || type === "shield") return type;
  if (type === "skill" && ["술법", "지원"].includes(unit.role)) return "magic";
  if (["권총", "돌격소총", "저격총"].includes(unit.weapon)) return "bullet";
  if (["활", "석궁"].includes(unit.weapon)) return "arrow";
  if (["투척", "암기", "아르카나"].includes(unit.weapon)) return "magic";
  if (type === "attack" && ["사격", "술법", "지원"].includes(unit.role)) return unit.weapon === "창" ? "arrow" : "magic";
  return "slash";
}

function combatEffect(from, to, type = "attack", value = null) {
  const skillCritical = type === "skill" && value?.amount > 0
    ? Boolean(from._skillCriticalQueue?.shift())
    : false;
  if (skillCritical && value?.amount > 0) {
    value = { ...value, critical: true };
  }
  if (type === "heal" || type === "shield") applySupportAidBuff(from, to);
  recordCombatMetric(from, to, type, value);
  return { from: from.id, to: to.id, type, weapon: from.weapon, kind: weaponEffectKind(from, type), value };
}

function ensureCombatMetric(unit) {
  if (!state.combatMetricsActive || !unit || unit.side !== "ally" || unit.trainingDummy) return null;
  state.currentCombatMetrics ||= {};
  if (!state.currentCombatMetrics[unit.id]) {
    state.currentCombatMetrics[unit.id] = {
      id: unit.id,
      name: unit.name,
      art: unit.art,
      color: unit.color,
      cost: unit.cost,
      tier: unit.tier || 1,
      damageDone: 0,
      damageTaken: 0,
      healingDone: 0,
    };
  }
  return state.currentCombatMetrics[unit.id];
}

function recordCombatMetric(from, to, type, value) {
  const amount = Math.max(0, Math.round(value?.amount || 0));
  if (!amount) return;
  if (type === "heal") {
    const metric = ensureCombatMetric(from);
    if (metric) metric.healingDone += amount;
    return;
  }
  if (type === "shield") return;
  const attackerMetric = ensureCombatMetric(from);
  const targetMetric = ensureCombatMetric(to);
  if (attackerMetric) attackerMetric.damageDone += amount;
  if (targetMetric) targetMetric.damageTaken += amount;
}

function applySupportAidBuff(source, target) {
  if (!source || !target || source.side !== target.side || source.role !== SUPPORT_ROLE || target.hp <= 0) return;
  const next = {
    hpBonus: Math.max(0, Math.round((target.combatBase?.maxHp || target.maxHp) * (source.supportAidHpRatio || 0))),
    defenseBonus: Math.max(0, Math.round(source.supportAidDefense || 0)),
    damageReductionBonus: Math.max(0, Math.min(0.5, source.supportAidDamageReduction || 0)),
  };
  if (!next.hpBonus && !next.defenseBonus && !next.damageReductionBonus) return;
  const current = target.supportAidBuff || { hpBonus: 0, defenseBonus: 0, damageReductionBonus: 0 };
  const hpDelta = Math.max(0, next.hpBonus - current.hpBonus);
  const defenseDelta = Math.max(0, next.defenseBonus - current.defenseBonus);
  const reductionDelta = Math.max(0, next.damageReductionBonus - current.damageReductionBonus);
  if (!hpDelta && !defenseDelta && !reductionDelta) return;
  target.maxHp += hpDelta;
  target.hp = Math.min(target.maxHp, target.hp + hpDelta);
  target.defense += defenseDelta;
  target.damageReduction = Math.max(0, Math.min(0.8, (target.damageReduction || 0) + reductionDelta));
  target.supportAidBuff = {
    hpBonus: Math.max(current.hpBonus, next.hpBonus),
    defenseBonus: Math.max(current.defenseBonus, next.defenseBonus),
    damageReductionBonus: Math.max(current.damageReductionBonus, next.damageReductionBonus),
  };
}

function beginCombatMetrics(units) {
  state.currentCombatMetrics = {};
  state.combatMetricsActive = true;
  units.filter(Boolean).forEach(ensureCombatMetric);
}

function finishCombatMetrics() {
  state.lastCombatMetrics = Object.values(state.currentCombatMetrics || {});
  state.currentCombatMetrics = {};
  state.combatMetricsActive = false;
}

function applyLifeSteal(attacker, damage) {
  if (!attacker.lifeSteal || damage <= 0 || attacker.hp <= 0) return 0;
  const heal = Math.max(1, Math.round(damage * attacker.lifeSteal));
  return applyHeal(attacker, heal);
}

function applyOpeningAugments(allies) {
  const effects = [];
  for (const effect of selectedAugmentEffects("frontlineShieldAndDefense")) {
    const targets = living(allies).filter((unit) => {
      const slot = unitSlot(unit);
      return slot && slot.y <= allyStartRow() + 1;
    });
    for (const unit of targets) {
      const shield = Math.max(1, Math.round(unit.maxHp * (Number(effect.shieldHpRatio) || 0)));
      unit.shield = (unit.shield || 0) + shield;
      unit.status = "shielded";
      effects.push(combatEffect(unit, unit, "shield", { amount: shield }));
    }
  }
  return effects;
}

function applyLastSurvivorAugment(allies) {
  const survivor = living(allies)[0];
  if (!survivor || survivor.augmentLastSurvivorApplied || living(allies).length !== 1) return null;
  const effect = selectedAugmentEffects("lastAllyStandingBuff")[0];
  if (!effect) return null;
  survivor.augmentLastSurvivorApplied = true;
  survivor.maxHp = Math.round(survivor.maxHp * (Number(effect.hpMultiply) || 1));
  survivor.hp = Math.min(survivor.maxHp, Math.round(survivor.hp * (Number(effect.hpMultiply) || 1)));
  survivor.atk *= Number(effect.atkMultiply) || 1;
  survivor.skillAmp *= Number(effect.skillAmpMultiply) || 1;
  return combatEffect(survivor, survivor, "shield", { amount: 1 });
}

function applyTimedAugments(allies) {
  const effects = [];
  for (const effect of selectedAugmentEffects("combatTimeScalingStat")) {
    const interval = Math.max(1, Number(effect.intervalSeconds) || 3) * 1000;
    const stack = Math.min(Number(effect.maxStacks) || 0, Math.floor(combatElapsedMs / interval));
    for (const unit of living(allies)) {
      if ((unit.augmentWarmupStacks || 0) >= stack) continue;
      const missing = stack - (unit.augmentWarmupStacks || 0);
      unit.augmentWarmupStacks = stack;
      unit.atk *= 1 + (Number(effect.atkMultiplyAdd) || 0) * missing;
      unit.skillAmp *= 1 + (Number(effect.skillAmpMultiplyAdd) || 0) * missing;
      effects.push(combatEffect(unit, unit, "shield", { amount: 1 }));
    }
  }
  return effects;
}

function ownedThreeStarNames() {
  return new Set([...(state.board || []), ...(state.bench || [])]
    .filter((unit) => unit?.tier >= 3)
    .map((unit) => unit.name));
}

function pandoraBenchIndexes() {
  const slots = Math.max(0, ...selectedAugmentEffects("pandoraBench").map((effect) => Number(effect.slots) || 3));
  if (!slots) return [];
  const start = Math.max(0, state.bench.length - slots);
  return Array.from({ length: state.bench.length - start }, (_, offset) => start + offset);
}

function combineOwnedUnits(name) {
  let changed = false;
  while (true) {
    const owned = [...state.bench, ...state.board].filter((unit) => unit?.name === name);
    const sameTier = [2, 1].find((tier) => owned.filter((unit) => unit.tier === tier).length >= 3);
    if (!sameTier) return changed;
    let removed = 0;
    let firstRemoved = null;
    for (const arr of [state.bench, state.board]) {
      for (let index = 0; index < arr.length; index += 1) {
        if (arr[index]?.name === name && arr[index].tier === sameTier && removed < 3) {
          firstRemoved ||= { arr, index };
          arr[index] = null;
          removed += 1;
        }
      }
    }
    const base = roster.find((unit) => unit.name === name);
    if (base && firstRemoved) {
      firstRemoved.arr[firstRemoved.index] = makeUnit(base, balance, sameTier + 1);
      addLog(`${name} ${sameTier + 1}성 합성!`);
    }
    changed = true;
  }
}

function combineAllOwnedUnits() {
  let changed = false;
  do {
    changed = false;
    const names = new Set([...state.bench, ...state.board].filter(Boolean).map((unit) => unit.name));
    for (const name of names) {
      if (combineOwnedUnits(name)) changed = true;
    }
  } while (changed);
}

function applyPandoraBench() {
  const indexes = pandoraBenchIndexes().filter((index) => state.bench[index]);
  if (!indexes.length) return 0;
  let changed = 0;
  for (const index of indexes) {
    const unit = state.bench[index];
    const copies = unitCopyCount(unit);
    const blockedThreeStars = ownedThreeStarNames();
    const candidates = roster.filter((base) => {
      if (!base || base.active === false) return false;
      if (base.name === unit.name) return false;
      if (base.cost !== unit.cost) return false;
      if (blockedThreeStars.has(base.name)) return false;
      return (state.pool?.[base.name] || 0) >= copies;
    });
    const base = randomChoice(candidates);
    if (!base) continue;
    if (state.pool?.[unit.name] !== undefined) {
      state.pool[unit.name] = Math.min(stockLimit(unit, balance), (state.pool[unit.name] || 0) + copies);
    }
    if (state.pool?.[base.name] !== undefined) {
      state.pool[base.name] = Math.max(0, (state.pool[base.name] || 0) - copies);
    }
    state.bench[index] = makeUnit(base, balance, unit.tier || 1);
    addLog(`판도라의 벤치: ${unit.name} -> ${base.name} (${unit.cost}코 ${unit.tier || 1}성).`);
    changed += 1;
  }
  if (changed) combineAllOwnedUnits();
  return changed;
}

function clearAmpRelay(unit) {
  if (!unit?.augmentAmpRelayBonus) return;
  unit.skillAmp = Math.max(0, unit.skillAmp - unit.augmentAmpRelayBonus);
  unit.augmentAmpRelayBonus = 0;
}

function applyHighestSkillAmpRelay(actor, friends) {
  const effects = [];
  const messages = [];
  for (const effect of selectedAugmentEffects("highestSkillAmpRelay")) {
    const allies = living(friends);
    const highestSkillAmp = Math.max(0, ...allies.map((unit) => unit.skillAmp || 0));
    if ((actor.skillAmp || 0) < highestSkillAmp) continue;
    const range = Math.max(0, Number(effect.range) || 2);
    const durationMs = Math.max(0.2, Number(effect.durationSeconds) || 4) * 1000;
    for (const target of allies) {
      if (target === actor || distanceBetween(actor, target) > range) continue;
      clearAmpRelay(target);
      const bonus = Math.round((target.skillAmp || 0) * ((Number(effect.skillAmpMultiply) || 1) - 1));
      if (bonus <= 0) continue;
      target.skillAmp += bonus;
      target.augmentAmpRelayBonus = bonus;
      target.augmentAmpRelayRemainingMs = durationMs;
      target.augmentAmpRelayDurationMs = durationMs;
      effects.push(combatEffect(actor, target, "shield", { amount: 1 }));
    }
    if (effects.length) messages.push(`${actor.name} 증폭 실험: 주변 아군 스증 강화`);
  }
  return { effects, messages };
}

function triggerLowHpAugments(target) {
  if (!target || target.side !== "ally" || target.hp <= 0) return [];
  const effects = [];
  for (const effect of selectedAugmentEffects("lowHpOnceBuff")) {
    const key = `augmentLowHpBuff:${effect.type}:${effect.triggerHpRatio}`;
    if (target[key] || target.hp / target.maxHp > (Number(effect.triggerHpRatio) || 0)) continue;
    target[key] = true;
    applyStatPatch(target, effect.stats);
    target.damageReduction = Math.max(0, Math.min(0.85, target.damageReduction || 0));
    target.status = "shielded";
    effects.push(combatEffect(target, target, "shield", { amount: 1 }));
  }
  for (const effect of selectedAugmentEffects("lowHpHealPulse")) {
    const key = `augmentLowHpHeal:${effect.type}`;
    if (target[key] || target.hp / target.maxHp > (Number(effect.thresholdHpRatio) || 0.35)) continue;
    target[key] = true;
    const allies = living(state.combatGrid || []).filter((unit) => unit.side === target.side && distanceBetween(target, unit) <= (Number(effect.range) || 1));
    for (const ally of allies) {
      const heal = applyHeal(ally, ally.maxHp * (Number(effect.healHpRatio) || 0));
      if (heal > 0) effects.push(combatEffect(target, ally, "heal", { amount: heal }));
    }
  }
  return effects;
}

function triggerThreeStarRevive(target) {
  if (!target || target.side !== "ally" || target.tier < 3 || target.hp > 0) return null;
  const effect = selectedAugmentEffects("threeStarRevive")[0];
  if (!effect || target.augmentThreeStarRevived) return null;
  target.augmentThreeStarRevived = true;
  target.hp = Math.max(1, Math.round(target.maxHp * (Number(effect.hpRatio) || 0.4)));
  target.status = "healed";
  return combatEffect(target, target, "heal", { amount: target.hp });
}

function basicAttackDamage(attacker, baseAmount) {
  if (!attacker.hasUsedOpeningCrit && attacker.openingCritMultiplier > 1) {
    attacker.hasUsedOpeningCrit = true;
    return { amount: baseAmount * attacker.openingCritMultiplier, critical: true, opening: true };
  }
  if (random() < (attacker.critChance || 0)) {
    return { amount: baseAmount * (attacker.critDamage || 1.5), critical: true, opening: false };
  }
  return { amount: baseAmount, critical: false, opening: false };
}

function basicAttack(attacker, enemies) {
  const target = pickTarget(attacker, enemies);
  if (!target) return { message: "", effects: [] };
  if (distanceBetween(attacker, target) > unitAttackRange(attacker)) {
    const moved = moveToward(attacker, target);
    return {
      message: moved ? `${attacker.name} 이동` : `${attacker.name} 대기`,
      effects: [],
    };
  }
  const variance = 0.86 + random() * 0.28;
  if (attacker.pattern === "nadja") {
    const nadjaPattern = bossPatterns.nadja;
    const targets = unitsInRange(attacker, enemies, unitAttackRange(attacker))
      .sort((a, b) => distanceBetween(attacker, a) - distanceBetween(attacker, b))
      .slice(0, nadjaPattern.basicTargetCount);
    let total = 0;
    const hit = basicAttackDamage(attacker, attacker.atk * variance * balance.battle.basicDamageMultiplier);
    const damages = targets.map((unit) => {
      const damage = dealDamage(attacker, unit, hit.amount);
      total += damage;
      return { unit, damage };
    });
    gainMana(attacker, balance.battle.manaPerAttack);
    attacker.status = "attacking";
    return {
      message: `${attacker.name} basic cleave ${total}${hit.critical ? " 치명" : ""}`,
      effects: damages.map(({ unit, damage }) => combatEffect(attacker, unit, "attack", { amount: damage, critical: hit.critical })),
    };
  }
  const flameAttack = (attacker.flameAttacks || 0) > 0;
  const guardCounter = (attacker.nickyCounterReady || 0) > 0;
  const bihyungEnhanced = (attacker.bihyungEnhancedAttacks || 0) > 0;
  const bihyungSecondStrike = bihyungEnhanced && attacker.bihyungEnhancedAttacks === 1;
  const hit = basicAttackDamage(attacker, attacker.atk * variance * balance.battle.basicDamageMultiplier);
  let attackAmount = (guardCounter ? hit.amount * 1.18 : hit.amount) * (bihyungEnhanced ? 1.35 : 1);
  if (attacker.lukeCleaningBoost) {
    const effect = unitAugmentEffect(attacker, "lukeCleaningService");
    attackAmount += attacker.atk * (Number(effect?.nextAttackAtkRatioAdd) || 0);
    attacker.lukeCleaningBoost = false;
  }
  const damage = dealDamage(attacker, target, attackAmount);
  const paintMark = damage > 0 ? markPaintTarget(attacker, target) : null;
  const lifeStealHeal = applyLifeSteal(attacker, damage);
  if (!flameAttack && !guardCounter && !bihyungEnhanced) gainMana(attacker, balance.battle.manaPerAttack);
  if (guardCounter) {
    attacker.nickyCounterReady = 0;
    applyStun(target, 1);
  }
  if (bihyungEnhanced) attacker.bihyungEnhancedAttacks = Math.max(0, attacker.bihyungEnhancedAttacks - 1);
  attacker.status = "attacking";
  const effects = [combatEffect(attacker, target, "attack", { amount: damage, critical: hit.critical })];
  const theodore = living(state.combatGrid || [])
    .find((unit) => unit.side === attacker.side && unit !== attacker && unitAugmentEffect(unit, "theodoreSniperProtocol"));
  if (theodore && (!theodore.theodoreAssistReadyAt || theodore.theodoreAssistReadyAt <= combatElapsedMs) && target.hp > 0) {
    const effect = unitAugmentEffect(theodore, "theodoreSniperProtocol");
    const assistDamage = dealSkillDamage(theodore, target, theodore.skillAmp * (Number(effect.assistDamageSkillAmpRatio) || 0));
    const shield = Math.max(1, Math.round(attacker.maxHp * (Number(effect.allyShieldHpRatio) || 0)));
    attacker.shield = (attacker.shield || 0) + shield;
    theodore.theodoreAssistReadyAt = combatElapsedMs + (Number(effect.cooldownSeconds) || 2.5) * 1000;
    if (assistDamage > 0) effects.push(combatEffect(theodore, target, "skill", { amount: assistDamage, extra: true }));
    effects.push(combatEffect(theodore, attacker, "shield", { amount: shield }));
  }
  if (attacker.side === "ally") {
    attacker.augmentSameTargetStacks ||= {};
    attacker.augmentSameTargetStacks[target.id] = (attacker.augmentSameTargetStacks[target.id] || 0) + 1;
    if (!attacker.augmentFirstAttackDone) {
      attacker.augmentFirstAttackDone = true;
      for (const effect of selectedAugmentEffects("firstAttackSnare")) {
        applyRoot(target, Math.max(1, (Number(effect.duration) || 0.75) / (balance.battle.statusTurnMs ?? 500) * 1000));
        target.augmentDamageTakenAdd = Math.max(target.augmentDamageTakenAdd || 0, Number(effect.damageTakenAdd) || 0);
      }
    }
    for (const effect of selectedAugmentEffects("basicAttackStack")) {
      const maxStacks = Number(effect.maxStacks) || 0;
      const next = Math.min(maxStacks, (attacker.augmentBasicAttackStacks || 0) + 1);
      if (next > (attacker.augmentBasicAttackStacks || 0)) {
        attacker.augmentBasicAttackStacks = next;
        if (effect.stat === "speed") attacker.speed += Number(effect.addPerStack) || 0;
      }
    }
    for (const effect of selectedAugmentEffects("periodicBasicAttackMaxHpDamage")) {
      const every = Math.max(1, Number(effect.everyHits) || 1);
      if (((attacker.basicAttackCount || 0) + 1) % every === 0 && target.hp > 0) {
        const ratio = target.boss ? Number(effect.bossRatio) || 0 : Number(effect.targetMaxHpRatio) || 0;
        const bonus = dealDamage(attacker, target, target.maxHp * ratio, { fixed: true });
        if (bonus > 0) effects.push(combatEffect(attacker, target, "skill", { amount: bonus, fixed: true, extra: true }));
      }
    }
  }
  if (guardCounter) effects.push(combatEffect(attacker, target, "skill", { amount: 1 }));
  if (paintMark) effects.push({ ...combatEffect(attacker, target, "paint-mark"), kind: "paint-mark" });
  let extraMessage = "";
  if (lifeStealHeal) effects.push(combatEffect(attacker, attacker, "heal", { amount: lifeStealHeal }));
  if (flameAttack) {
    attacker.flameAttacks = Math.max(0, attacker.flameAttacks - 1);
    const flameTargets = unitsInFront(attacker, enemies, 3).filter((unit) => unit.hp > 0);
    if (flameTargets.length) playSkillVisual?.({ type: "xiukai-flame", fromId: attacker.id, targetIds: flameTargets.map((unit) => unit.id) });
    let flameTotal = 0;
    for (const flameTarget of flameTargets) {
      const flameDamage = dealSkillDamage(attacker, flameTarget, attacker.atk * 0.42 + attacker.skillAmp * 0.55 + 4);
      flameTotal += flameDamage;
      effects.push({ ...combatEffect(attacker, flameTarget, "skill", { amount: flameDamage }), kind: "magic" });
    }
    extraMessage += ` / 뜨거운 맛 ${flameTargets.length}명 ${flameTotal} 피해`;
  }
  if (bihyungSecondStrike) {
    const sweepTargets = unitsInFront(attacker, enemies, 3).filter((unit) => unit.hp > 0 && unit !== target);
    let sweepTotal = 0;
    for (const sweepTarget of sweepTargets) {
      const sweepDamage = dealSkillDamage(attacker, sweepTarget, attacker.atk * 0.55 + attacker.defense * 0.95 + 6);
      sweepTotal += sweepDamage;
      effects.push({ ...combatEffect(attacker, sweepTarget, "skill", { amount: sweepDamage }), kind: "slash" });
    }
    if (sweepTargets.length) {
      playSkillVisual?.({ type: "luke-obsession", fromId: attacker.id, targetIds: sweepTargets.map((unit) => unit.id) });
      extraMessage += ` / 뚝딱! 전방 ${sweepTargets.length}명 ${sweepTotal} 피해`;
    }
  }
  const pierceTargets = unitsInRange(attacker, enemies, unitAttackRange(attacker))
    .filter((unit) => unit !== target)
    .sort((a, b) => distanceBetween(attacker, a) - distanceBetween(attacker, b))
    .slice(0, attacker.basicAttackExtraTargets || 0);
  let pierceTotal = 0;
  for (const pierceTarget of pierceTargets) {
    const pierceDamage = dealDamage(attacker, pierceTarget, hit.amount);
    const piercePaintMark = pierceDamage > 0 ? markPaintTarget(attacker, pierceTarget) : null;
    pierceTotal += pierceDamage;
    const pierceHeal = applyLifeSteal(attacker, pierceDamage);
    effects.push(combatEffect(attacker, pierceTarget, "attack", { amount: pierceDamage, critical: hit.critical, pierce: true }));
    if (piercePaintMark) effects.push({ ...combatEffect(attacker, pierceTarget, "paint-mark"), kind: "paint-mark" });
    if (pierceHeal) effects.push(combatEffect(attacker, attacker, "heal", { amount: pierceHeal }));
  }
  if (pierceTargets.length) extraMessage += ` / 돌파 ${pierceTargets.length}명 ${pierceTotal} 피해`;
  attacker.basicAttackCount = (attacker.basicAttackCount || 0) + 1;
  if (attacker.extraAttackEvery > 0 && attacker.basicAttackCount % attacker.extraAttackEvery === 0 && target.hp > 0 && distanceBetween(attacker, target) <= unitAttackRange(attacker)) {
    const extraHit = basicAttackDamage(
      attacker,
      attacker.atk * variance * balance.battle.basicDamageMultiplier * attacker.extraAttackDamageRatio
    );
    const extraDamage = dealDamage(attacker, target, extraHit.amount);
    const extraPaintMark = extraDamage > 0 ? markPaintTarget(attacker, target) : null;
    const extraHeal = applyLifeSteal(attacker, extraDamage);
    effects.push(combatEffect(attacker, target, "attack", { amount: extraDamage, critical: extraHit.critical, extra: true }));
    if (extraPaintMark) effects.push({ ...combatEffect(attacker, target, "paint-mark"), kind: "paint-mark" });
    if (extraHeal) effects.push(combatEffect(attacker, attacker, "heal", { amount: extraHeal }));
    extraMessage = ` / 신속 추가타 ${extraDamage} 피해${extraHit.critical ? " (치명)" : ""}`;
  }
  return {
    message: `${attacker.name} → ${target.name} ${damage} 피해${hit.critical ? " (치명)" : ""}${extraMessage}`,
    effects,
  };
}

function castBossSkill(caster, allies, enemies) {
  const effects = [];
  if (caster.pattern === "bear") {
    const pattern = bossPatterns.bear;
    const targets = unitsInRange(caster, enemies, pattern.range);
    let total = 0;
    for (const target of targets) {
      const damage = dealDamage(caster, target, caster.skillAmp * pattern.skillAmpMultiplier + caster.atk * pattern.atkMultiplier);
      total += damage;
      applyStun(target, pattern.stunTicks);
      effects.push(combatEffect(caster, target, "skill", { amount: damage }));
    }
    return { message: `${caster.name} roar stun ${targets.length} / ${total}`, effects };
  }

  if (caster.pattern === "alpha" || caster.pattern === "omega") {
    const pattern = bossPatterns[caster.pattern];
    const targets = unitsInFront(caster, enemies, pattern.range);
    let total = 0;
    for (const target of targets) {
      const damage = dealDamage(caster, target, caster.skillAmp * pattern.skillAmpMultiplier + caster.atk * pattern.atkMultiplier);
      total += damage;
      knockBack(target, caster, pattern.knockback);
      applyStun(target, pattern.stunTicks);
      effects.push(combatEffect(caster, target, "skill", { amount: damage }));
    }
    return { message: `${caster.name} shockwave ${targets.length} / ${total}`, effects };
  }

  if (caster.pattern === "wickeline") {
    const pattern = bossPatterns.wickeline;
    const targets = backlineTargets(caster, enemies, pattern.targetCount);
    let total = 0;
    for (const target of targets) {
      const damage = dealDamage(caster, target, caster.skillAmp * pattern.skillAmpMultiplier + caster.atk * pattern.atkMultiplier);
      total += damage;
      effects.push(combatEffect(caster, target, "skill", { amount: damage }));
    }
    return { message: `${caster.name} toxic shots ${targets.length} / ${total}`, effects };
  }

  if (caster.pattern === "hana") {
    const pattern = bossPatterns.hana;
    const omega = summonOmega(caster);
    if (omega) {
      effects.push(combatEffect(caster, omega, "skill"));
      return { message: `${caster.name} summoned Omega`, effects };
    }
    const target = pickTarget(caster, enemies);
    if (!target) return { message: "", effects: [] };
    const damage = dealDamage(caster, target, caster.skillAmp * pattern.fallbackSkillAmpMultiplier + caster.atk * pattern.fallbackAtkMultiplier);
    return { message: `${caster.name} arcane hit ${damage}`, effects: [combatEffect(caster, target, "skill", { amount: damage })] };
  }

  if (caster.pattern === "nadja") {
    const pattern = bossPatterns.nadja;
    const targets = living(enemies);
    let total = 0;
    for (const target of targets) {
      const damage = dealDamage(caster, target, caster.skillAmp * pattern.skillAmpMultiplier + caster.atk * pattern.atkMultiplier);
      total += damage;
      effects.push(combatEffect(caster, target, "skill", { amount: damage }));
    }
    return { message: `${caster.name} full-map strike ${targets.length} / ${total}`, effects };
  }

  return null;
}

function castRoleSkill(caster, role, allies, enemies, restoreManaOnMove = true) {
  const roleSkills = balance.battle.roleSkills || {};

  if (role === "지원") {
    const healLimit = caster.healTargets >= 99 ? Infinity : Math.max(2, caster.healTargets || 2);
    const targets = living(allies)
      .slice()
      .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))
      .slice(0, healLimit);
    const heal = Math.round(skillOutput(caster, (caster.skillAmp * (roleSkills.supportHealSkillAmp ?? 0.72) + (roleSkills.supportHealFlat ?? 10)) * caster.healPower));
    const effects = [];
    for (const target of targets) {
      const appliedHeal = applyHeal(target, heal);
      if (appliedHeal) effects.push(combatEffect(caster, target, "heal", { amount: appliedHeal }));
    }
    return {
      message: `${caster.name} 스킬: ${targets.length}명 ${heal} 회복`,
      effects,
    };
  }

  if (role === "술법") {
    const targetLimit = caster.skillTargets >= 99 ? Infinity : Math.max(2, caster.skillTargets || 2);
    const targets = living(enemies)
      .slice()
      .sort((a, b) => compareByDistanceThenHp(caster, a, b))
      .slice(0, targetLimit);
    let total = 0;
    const effects = [];
    for (const target of targets) {
      const damage = dealSkillDamage(caster, target, caster.skillAmp * 0.75 + 10);
      total += damage;
      effects.push(combatEffect(caster, target, "skill", { amount: damage }));
    }
    return {
      message: `${caster.name} 스킬: 광역 ${total} 피해`,
      effects,
    };
  }

  if (role === "방패") {
    const rawHeal = Math.round(
      caster.skillAmp * (roleSkills.shieldHealSkillAmp ?? 0.35) +
      caster.defense * (roleSkills.shieldHealDefense ?? 0.55) +
      (roleSkills.shieldHealFlat ?? 5)
    );
    const heal = applyHeal(caster, skillOutput(caster, rawHeal));
    return {
      message: `${caster.name} 스킬: ${heal} 보호막`,
      effects: [combatEffect(caster, caster, "shield", { amount: heal })],
    };
  }

  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  if (distanceBetween(caster, target) > Math.max(unitAttackRange(caster), 2)) {
    const moved = moveToward(caster, target);
    if (restoreManaOnMove) caster.mana = unitMaxMana(caster);
    return {
      message: moved ? `${caster.name} 스킬 사거리 접근` : `${caster.name} 대기`,
      effects: [],
    };
  }
  const scale = role === "암살"
    ? (roleSkills.assassinSkillScale ?? 2.2)
    : role === "검객"
    ? (roleSkills.swordsmanSkillScale ?? 1.85)
    : role === "사격"
    ? (roleSkills.rangedSkillScale ?? 1.75)
    : (roleSkills.defaultSkillScale ?? 1.6);
  const damage = dealSkillDamage(caster, target, caster.atk * 0.75 + caster.skillAmp * scale + 10);
  return {
    message: `${caster.name} 스킬: ${target.name} ${damage} 피해`,
    effects: [combatEffect(caster, target, "skill", { amount: damage })],
  };
}

function castYukiSkill(caster, enemies) {
  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  if (distanceBetween(caster, target) > 2) {
    const moved = moveToward(caster, target);
    caster.mana = unitMaxMana(caster);
    return { message: moved ? `${caster.name} 화무십일홍 사거리 접근` : `${caster.name} 대기`, effects: [] };
  }
  const targets = unitsInFront(caster, enemies, 2);
  if (!targets.includes(target) && distanceBetween(caster, target) <= 2) targets.push(target);
  const firstAmount = caster.skillAmp * 2;
  const effects = [];
  let total = 0;
  for (const victim of targets) {
    const damage = dealSkillDamage(caster, victim, firstAmount);
    total += damage;
    effects.push(combatEffect(caster, victim, "skill", { amount: damage, timeline: "yuki-cast" }));
  }
  caster.actionLockRemainingMs = durationFromTurns(2);
  caster.actionLockDurationMs = caster.actionLockRemainingMs;
  caster.status = "channeling";
  skillTimeline.schedule(combatElapsedMs, durationFromTurns(2), {
    type: "yuki-final-bloom",
    caster,
    targets: targets.slice(),
    fixedDamage: Math.round(caster.skillAmp * 2),
  });
  playSkillVisual?.({ type: "yuki-cast", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return {
    message: `${caster.name} 화무십일홍: 전방 ${targets.length}명 ${total} 피해 / 2턴 납도`,
    effects,
  };
}

function castCathySkill(caster, enemies) {
  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  if (distanceBetween(caster, target) > 3) {
    const moved = moveToward(caster, target);
    caster.mana = unitMaxMana(caster);
    return { message: moved ? `${caster.name} 수처 사거리 접근` : `${caster.name} 대기`, effects: [] };
  }
  const damage = dealSkillDamage(caster, target, caster.atk * 0.35 + caster.skillAmp + 6);
  let collision = { moved: 0, collision: null, wall: false };
  if (target.hp > 0) collision = knockBackWithCollision(target, caster, 2);
  const augment = unitAugmentEffect(caster, "cathyUnsealableSuture");
  const collisionHappened = collision.wall || collision.collision;
  let augmentDamage = 0;
  const bound = [];
  if (target.hp > 0 && collisionHappened) {
    applyRoot(target, 2 + (Number(augment?.collisionBindAddSeconds) || 0) / ((balance.battle.statusTurnMs ?? 500) / 1000));
    if (augment) augmentDamage = dealDamage(caster, target, caster.atk * (Number(augment.collisionTrueDamageAtkRatio) || 0), { fixed: true });
    bound.push(target);
    if (collision.collision?.hp > 0 && collision.collision.side === target.side) {
      applyRoot(collision.collision, 2 + (Number(augment?.collisionBindAddSeconds) || 0) / ((balance.battle.statusTurnMs ?? 500) / 1000));
      bound.push(collision.collision);
    }
  }
  playSkillVisual?.({ type: "cathy-needle", fromId: caster.id, targetIds: [target.id] });
  const effects = [combatEffect(caster, target, "skill", { amount: damage, timeline: "cathy-needle" })];
  if (augmentDamage > 0) effects.push(combatEffect(caster, target, "skill", { amount: augmentDamage, fixed: true, extra: true }));
  return {
    message: `${caster.name} 수처: ${target.name} ${damage + augmentDamage} 피해 / ${collision.moved}칸 넉백${bound.length ? ` / ${bound.map((unit) => unit.name).join(", ")} 속박` : ""}`,
    effects,
  };
}

function castRozziSkill(caster, enemies) {
  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  if (distanceBetween(caster, target) > unitAttackRange(caster)) {
    const moved = moveToward(caster, target);
    caster.mana = unitMaxMana(caster);
    return { message: moved ? `${caster.name} 더블샷 사거리 접근` : `${caster.name} 대기`, effects: [] };
  }
  const shotAmount = caster.atk * 0.5 + caster.skillAmp * 0.75 + 4;
  const firstDamage = dealSkillDamage(caster, target, shotAmount);
  const secondDamage = target.hp > 0 ? dealSkillDamage(caster, target, shotAmount) : 0;
  playSkillVisual?.({ type: "rozzi-double-shot", fromId: caster.id, targetIds: [target.id] });
  const effects = [
    { ...combatEffect(caster, target, "skill", { amount: firstDamage, timeline: "rozzi-shot-1" }), kind: "bullet" },
    { ...combatEffect(caster, target, "skill", { amount: secondDamage, timeline: "rozzi-shot-2" }), kind: "bullet", delayMs: 160 },
  ];
  return {
    message: `${caster.name} 더블샷: ${target.name} ${firstDamage} + ${secondDamage} 피해`,
    effects,
  };
}

function castAyaSkill(caster, enemies) {
  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  if (distanceBetween(caster, target) > unitAttackRange(caster)) {
    const moved = moveToward(caster, target);
    caster.mana = unitMaxMana(caster);
    return { message: moved ? `${caster.name} 2연발 사격 사거리 접근` : `${caster.name} 대기`, effects: [] };
  }
  const shotAmount = caster.atk * 0.375 + caster.skillAmp + 5;
  const firstDamage = dealSkillDamage(caster, target, shotAmount);
  const secondDamage = target.hp > 0 ? dealSkillDamage(caster, target, shotAmount) : 0;
  playSkillVisual?.({ type: "aya-double-burst", fromId: caster.id, targetIds: [target.id] });
  return {
    message: `${caster.name} 2연발 사격: ${target.name} ${firstDamage} + ${secondDamage} 피해`,
    effects: [
      { ...combatEffect(caster, target, "skill", { amount: firstDamage, timeline: "aya-shot-1" }), kind: "bullet" },
      { ...combatEffect(caster, target, "skill", { amount: secondDamage, timeline: "aya-shot-2" }), kind: "bullet", delayMs: 120 },
    ],
  };
}

function shoichiPathTargets(caster, enemies, farthest) {
  const start = unitSlot(caster);
  const targetSlot = unitSlot(farthest);
  if (!start || !targetSlot) return { targets: [farthest], destination: targetSlot };
  const directionX = targetSlot.x - start.x;
  const directionY = targetSlot.y - start.y;
  const destination = hexNeighborSteps(targetSlot.x, targetSlot.y)
    .map((delta) => ({ x: targetSlot.x + delta.x, y: targetSlot.y + delta.y, delta }))
    .filter((slot) => hexDistanceSlots(slot, start) > hexDistanceSlots(targetSlot, start))
    .sort((a, b) =>
      (b.delta.x * directionX + b.delta.y * directionY)
      - (a.delta.x * directionX + a.delta.y * directionY)
    )
    .find((slot) => {
      const index = slotIndexFor(caster.side, slot.x, slot.y, true);
      return index >= 0 && !state.combatGrid?.[index];
    }) || targetSlot;
  const pathLength = hexDistanceSlots(start, destination);
  const targets = living(enemies).filter((unit) => {
    const slot = unitSlot(unit);
    if (!slot) return false;
    return hexDistanceSlots(start, slot) + hexDistanceSlots(slot, destination) <= pathLength + 0.01;
  });
  if (!targets.includes(farthest)) targets.push(farthest);
  return { targets, destination };
}

function castShoichiSkill(caster, enemies) {
  const alive = living(enemies);
  if (!alive.length) return { message: "", effects: [] };
  const farthest = alive.slice().sort((a, b) => distanceBetween(caster, b) - distanceBetween(caster, a) || a.hp - b.hp)[0];
  const casterNode = document.querySelector(`[data-unit-id="${caster.id}"]`);
  const targetNode = document.querySelector(`[data-unit-id="${farthest.id}"]`);
  const casterRect = casterNode?.getBoundingClientRect();
  const targetRect = targetNode?.getBoundingClientRect();
  const rideOffset = casterRect && targetRect ? {
    x: (targetRect.left + targetRect.width / 2 - (casterRect.left + casterRect.width / 2)) * 1.16,
    y: (targetRect.top + targetRect.height / 2 - (casterRect.top + casterRect.height / 2)) * 1.16,
  } : { x: 0, y: 0 };
  const { targets } = shoichiPathTargets(caster, enemies, farthest);
  const hitAmount = caster.atk * 0.3 + caster.skillAmp * 0.65 + 4;
  const effects = [];
  let outboundTotal = 0;
  let returnTotal = 0;
  for (const target of targets) {
    const damage = dealSkillDamage(caster, target, hitAmount);
    outboundTotal += damage;
    effects.push({ ...combatEffect(caster, target, "skill", { amount: damage, timeline: "shoichi-outbound" }), kind: "slash", delayMs: 180 });
  }
  for (const target of targets) {
    const damage = target.hp > 0 ? dealSkillDamage(caster, target, hitAmount) : 0;
    returnTotal += damage;
    effects.push({ ...combatEffect(caster, target, "skill", { amount: damage, timeline: "shoichi-return" }), kind: "slash", delayMs: 650 });
  }
  const augment = unitAugmentEffect(caster, "shoichiSevenElixir");
  let elixirTotal = 0;
  if (augment && !caster.sevenElixirUsed) {
    caster.sevenElixirUsed = true;
    const dashCount = Math.max(1, Number(augment.dashCount) || 7);
    const elixirTargets = living(enemies);
    for (let dash = 0; dash < dashCount && elixirTargets.length; dash += 1) {
      const target = elixirTargets[dash % elixirTargets.length];
      if (!target || target.hp <= 0) continue;
      const isFinal = dash === dashCount - 1;
      const base = caster.atk * (isFinal ? Number(augment.finalDamageAtkRatio) || 0 : Number(augment.pathDamageAtkRatio) || 0)
        + caster.skillAmp * (isFinal ? Number(augment.finalDamageSkillAmpRatio) || 0 : Number(augment.pathDamageSkillAmpRatio) || 0);
      const amount = target.boss ? base * (Number(augment.bossDamageMultiplier) || 1) : base;
      const damage = dealSkillDamage(caster, target, amount);
      elixirTotal += damage;
      effects.push({ ...combatEffect(caster, target, "skill", { amount: damage, extra: true }), kind: "slash", delayMs: 820 + dash * 85 });
    }
  }
  playSkillVisual?.({ type: "shoichi-dagger-ride", fromId: caster.id, targetIds: [farthest.id] });
  effects.unshift({
    from: caster.id,
    to: farthest.id,
    type: "shoichi-ride",
    kind: "shoichi-ride",
    value: { duration: 800, extension: 1.16, dx: rideOffset.x, dy: rideOffset.y },
  });
  return {
    message: `${caster.name} 단검 타기: 경로 ${targets.length}명 / 전진 ${outboundTotal} + 복귀 ${returnTotal}${elixirTotal ? ` / 7단비약 ${elixirTotal}` : ""} 피해`,
    effects,
  };
}

function castLeniSkill(caster, allies) {
  const target = living(allies)
    .slice()
    .sort((a, b) => {
      const ratioDiff = (a.hp / a.maxHp) - (b.hp / b.maxHp);
      if (Math.abs(ratioDiff) > 0.001) return ratioDiff;
      if (a === caster && b !== caster) return 1;
      if (b === caster && a !== caster) return -1;
      return (b.maxHp - b.hp) - (a.maxHp - a.hp);
    })[0];
  if (!target) return { message: "", effects: [] };
  const roleSkills = balance.battle.roleSkills || {};
  const rawHeal = Math.round(skillOutput(
    caster,
    (caster.skillAmp * (roleSkills.supportHealSkillAmp ?? 0.72) + (roleSkills.supportHealFlat ?? 10)) * caster.healPower
  ) * 0.75);
  const heal = applyHeal(target, rawHeal);
  const shield = Math.max(1, Math.round(rawHeal * 0.25));
  target.shield = Math.max(0, (target.shield || 0) - (target.leniShield || 0));
  target.leniShield = shield;
  target.shield = (target.shield || 0) + shield;
  target.status = "shielded";
  playSkillVisual?.({ type: "leni-carrot-bazooka", fromId: caster.id, targetIds: [target.id] });
  return {
    message: `${caster.name} 바주카!: ${target.name} 체력 ${heal} 회복 / 보호막 ${shield}`,
    effects: [
      combatEffect(caster, target, "heal", { amount: heal, timeline: "leni-carrot-impact" }),
      combatEffect(caster, target, "shield", { amount: shield, timeline: "leni-carrot-shield" }),
    ],
  };
}

function castHyunwooSkill(caster) {
  clearControlStatuses(caster);
  const heal = applyHeal(caster, skillOutput(caster, caster.skillAmp * 2));
  caster.shield = (caster.shield || 0) + Math.max(1, Math.round(heal * 0.35));
  return {
    message: `${caster.name} 도그파이트: 상태이상 해제 / 체력 ${heal} 회복`,
    effects: [
      combatEffect(caster, caster, "heal", { amount: heal }),
      combatEffect(caster, caster, "shield", { amount: Math.round(heal * 0.35) }),
    ],
  };
}

function castHyejinSkill(caster, enemies) {
  const targetLimit = 3;
  const targets = living(enemies)
    .slice()
    .sort((a, b) => compareByDistanceThenHp(caster, a, b))
    .slice(0, targetLimit);
  let total = 0;
  let stunned = 0;
  const effects = [];
  for (const target of targets) {
    const damage = dealSkillDamage(caster, target, caster.skillAmp * 0.68 + 8);
    total += damage;
    if (target.hp > 0) {
      target.samjaeMarks = Math.min(3, (target.samjaeMarks || 0) + 1);
      if (target.samjaeMarks >= 3) {
        applyStun(target, 2);
        target.samjaeMarks = 0;
        stunned += 1;
      }
    }
    effects.push(combatEffect(caster, target, "skill", { amount: damage }));
  }
  return {
    message: `${caster.name} 삼재: ${targets.length}명 ${total} 피해${stunned ? ` / ${stunned}명 기절` : ""}`,
    effects,
  };
}

function castHartSkill(caster, allies) {
  const targets = unitsInRange(caster, allies, 1);
  if (!targets.includes(caster)) targets.unshift(caster);
  const augment = unitAugmentEffect(caster, "hartPeacemakerWorldTour");
  const duration = augment ? (Number(augment.durationSeconds) || 5) * 1000 : 1200;
  const healAmount = Math.round((augment ? caster.maxHp * (Number(augment.teamHealHpRatio) || 0) : skillOutput(caster, caster.skillAmp * 0.95 + 12)) * caster.healPower);
  for (const target of targets) {
    target.peaceRemainingMs = Math.max(target.peaceRemainingMs || 0, duration);
    target.peaceDurationMs = Math.max(target.peaceDurationMs || 0, duration);
    if (augment) {
      gainMana(target, Number(augment.teamManaAdd) || 0);
      target.speed *= Number(augment.speedMultiply) || 1;
    }
  }
  skillTimeline.schedule(combatElapsedMs, duration, {
    type: "hart-peacemaker-heal",
    caster,
    targets: targets.slice(),
    healAmount,
  });
  playSkillVisual?.({ type: "hart-peacemaker", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return {
    message: `${caster.name} 피스메이커: ${targets.length}명 생존 보정 / 이후 ${healAmount} 회복`,
    effects: targets.map((target) => combatEffect(caster, target, "shield", { amount: 1 })),
  };
}

function castLiDailinSkill(caster, enemies) {
  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  if (distanceBetween(caster, target) > unitAttackRange(caster)) {
    const moved = moveToward(caster, target);
    caster.mana = unitMaxMana(caster);
    return { message: moved ? `${caster.name} 취호격파산 사거리 접근` : `${caster.name} 대기`, effects: [] };
  }
  applyStun(target, 2);
  const damage = dealSkillDamage(caster, target, caster.atk * 0.8 + caster.skillAmp * 0.9 + 7);
  return {
    message: `${caster.name} 취호격파산: ${target.name} 제압 / ${damage} 피해`,
    effects: [combatEffect(caster, target, "skill", { amount: damage })],
  };
}

function castSisselaSkill(caster, enemies) {
  caster.actionLockRemainingMs = 700;
  caster.actionLockDurationMs = 700;
  caster.status = "channeling";
  skillTimeline.schedule(combatElapsedMs, 700, {
    type: "sissela-liberation",
    caster,
    enemies: enemies.slice(),
    lostHp: Math.max(0, caster.maxHp - caster.hp),
  });
  playSkillVisual?.({ type: "sissela-channel", fromId: caster.id, targetIds: living(enemies).map((unit) => unit.id) });
  return {
    message: `${caster.name} 모두 해방이에요: 0.7초 정신집중`,
    effects: [{ from: caster.id, to: caster.id, type: "shield", kind: "magic", value: { amount: 1 } }],
  };
}

function resolveSisselaSkill(caster, enemies, storedLostHp = 0) {
  const lostHp = Math.max(0, storedLostHp, caster.maxHp - caster.hp);
  const targets = living(enemies);
  let total = 0;
  const effects = [];
  for (const target of targets) {
    const damage = dealSkillDamage(caster, target, caster.skillAmp * 0.58 + lostHp * 0.11 + 8);
    total += damage;
    effects.push(combatEffect(caster, target, "skill", { amount: damage }));
  }
  return {
    message: `${caster.name} 모두 해방이에요: 전체 ${targets.length}명 ${total} 피해`,
    effects,
  };
}

function castLenoxSkill(caster, enemies) {
  const target = living(enemies).slice().sort((a, b) => distanceBetween(caster, b) - distanceBetween(caster, a) || a.hp - b.hp)[0];
  if (!target) return { message: "", effects: [] };
  const augment = unitAugmentEffect(caster, "lenoxChainSentence");
  const moved = moveNextToUnit(target, caster);
  applyStun(target, 2 + (Number(augment?.bindSeconds) || 0) / ((balance.battle.statusTurnMs ?? 500) / 1000));
  if (augment) {
    target.augmentDamageTakenAdd = Math.max(target.augmentDamageTakenAdd || 0, Number(augment.damageTakenAdd) || 0);
    target.augmentLenoxSuppressSeconds = Number(augment.onDeathNearbySuppressSeconds) || 0;
  }
  const damage = dealSkillDamage(caster, target, caster.atk * 0.35 + caster.skillAmp * 1.15 + 6);
  return {
    message: `${caster.name} 날카로운 독니: ${target.name} 끌어오기${moved ? "" : " 실패"} / 기절 / ${damage} 피해`,
    effects: [combatEffect(caster, target, "skill", { amount: damage })],
  };
}

function castMaiSkill(caster) {
  const shield = Math.round(skillOutput(caster, caster.skillAmp * 1.25 + caster.defense * 1.6 + 18));
  caster.shield = (caster.shield || 0) + shield;
  caster.shawlCurtainRemainingMs = Math.max(caster.shawlCurtainRemainingMs || 0, 1800);
  caster.shawlCurtainDurationMs = Math.max(caster.shawlCurtainDurationMs || 0, 1800);
  caster.status = "shielded";
  return {
    message: `${caster.name} 숄 장막: 보호막 ${shield} / 피해 감소`,
    effects: [combatEffect(caster, caster, "shield", { amount: shield })],
  };
}

function castElenaSkill(caster, enemies) {
  const center = pickTarget(caster, enemies);
  if (!center) return { message: "", effects: [] };
  if (distanceBetween(caster, center) > Math.max(unitAttackRange(caster), 2)) {
    const moved = moveToward(caster, center);
    caster.mana = unitMaxMana(caster);
    return { message: moved ? `${caster.name} 죽음의 무도 사거리 접근` : `${caster.name} 대기`, effects: [] };
  }
  const targets = living(enemies).filter((unit) => distanceBetween(center, unit) <= 1);
  let total = 0;
  const effects = [];
  for (const target of targets) {
    const central = target === center;
    const damage = dealSkillDamage(caster, target, caster.atk * 0.35 + caster.skillAmp * (central ? 1.55 : 0.8) + 6);
    total += damage;
    if (central && target.hp > 0) applyStun(target, 2);
    else if (target.hp > 0) applyActionSlow(target, 2);
    effects.push(combatEffect(caster, target, "skill", { amount: damage }));
  }
  playSkillVisual?.({ type: "elena-danse-macabre", fromId: caster.id, targetIds: [center.id, ...targets.filter((unit) => unit !== center).map((unit) => unit.id)] });
  return {
    message: `${caster.name} 죽음의 무도: ${targets.length}명 ${total} 피해 / 중앙 기절`,
    effects,
  };
}

function castPriyaSkill(caster, allies, enemies) {
  caster.actionLockRemainingMs = 800;
  caster.actionLockDurationMs = 800;
  caster.status = "channeling";
  const supportTargets = living(allies);
  const effects = supportTargets.map((unit) => combatEffect(caster, unit, "shield", { amount: 1 }));
  const augment = unitAugmentEffect(caster, "priyaGrandFinale");
  if (augment) {
    const nearbyAllies = supportTargets.filter((unit) => distanceBetween(caster, unit) <= 2);
    for (const ally of nearbyAllies) {
      const shield = Math.max(1, Math.round(ally.maxHp * (Number(augment.allyShieldHpRatio) || 0)));
      ally.shield = (ally.shield || 0) + shield;
      effects.push(combatEffect(caster, ally, "shield", { amount: shield }));
    }
  }
  skillTimeline.schedule(combatElapsedMs, 800, {
    type: "priya-earth-echo",
    caster,
    enemies: enemies.slice(),
  });
  playSkillVisual?.({ type: "priya-earth-echo", fromId: caster.id, targetIds: supportTargets.map((unit) => unit.id) });
  return {
    message: `${caster.name} 대지의메아리: 0.8초 정신집중 / 아군 전체 지원`,
    effects,
  };
}

function lineTargetsBetween(caster, target, enemies) {
  const { targets } = shoichiPathTargets(caster, enemies, target);
  return targets.slice().sort((a, b) => distanceBetween(caster, a) - distanceBetween(caster, b));
}

function castHazeSkill(caster, enemies) {
  const alive = living(enemies);
  if (!alive.length) return { message: "", effects: [] };
  const farthest = alive.slice().sort((a, b) => distanceBetween(caster, b) - distanceBetween(caster, a) || a.hp - b.hp)[0];
  const targets = lineTargetsBetween(caster, farthest, enemies);
  const effects = [];
  let total = 0;
  for (let shot = 0; shot < 4; shot += 1) {
    for (const target of targets.filter((unit) => unit.hp > 0)) {
      const damage = dealSkillDamage(caster, target, caster.atk * 0.42 + caster.skillAmp * 0.58 + 5);
      total += damage;
      effects.push({ ...combatEffect(caster, target, "skill", { amount: damage }), kind: "bullet", delayMs: shot * 150 });
    }
  }
  playSkillVisual?.({ type: "haze-rocket-launcher", fromId: caster.id, targetIds: [farthest.id] });
  return {
    message: `${caster.name} 로켓 런쳐: ${farthest.name} 조준 / 경로 ${targets.length}명 ${total} 피해`,
    effects,
  };
}

function castChloeSkill(caster, allies) {
  const partner = living(allies)
    .filter((unit) => unit !== caster)
    .sort((a, b) => b.hp - a.hp || b.maxHp - a.maxHp)[0];
  if (!partner) return { message: `${caster.name} 생명 공유: 대상 없음`, effects: [] };
  const duration = 3000;
  const pairId = `${caster.id}-${partner.id}-${combatElapsedMs}`;
  caster.lifeSharePairId = pairId;
  caster.lifeSharePartnerId = partner.id;
  caster.lifeShareRemainingMs = duration;
  caster.lifeShareDurationMs = duration;
  partner.lifeSharePairId = pairId;
  partner.lifeSharePartnerId = caster.id;
  partner.lifeShareRemainingMs = duration;
  partner.lifeShareDurationMs = duration;
  redistributeLifeShare(caster);
  return {
    message: `${caster.name} 생명 공유: ${partner.name}과 3초간 체력 공유`,
    effects: [
      combatEffect(caster, caster, "shield", { amount: 1 }),
      combatEffect(caster, partner, "shield", { amount: 1 }),
    ],
  };
}

function castFioraSkill(caster, enemies) {
  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  if (distanceBetween(caster, target) > unitAttackRange(caster)) {
    const moved = moveToward(caster, target);
    caster.mana = unitMaxMana(caster);
    return { message: moved ? `${caster.name} 찌르기 연계 사거리 접근` : `${caster.name} 대기`, effects: [] };
  }
  let total = 0;
  const effects = [];
  for (let hit = 0; hit < 3 && target.hp > 0; hit += 1) {
    const damage = dealSkillDamage(caster, target, caster.atk * 0.55 + caster.skillAmp * 0.25 + 3);
    total += damage;
    effects.push({ ...combatEffect(caster, target, "skill", { amount: damage }), delayMs: hit * 120 });
  }
  return { message: `${caster.name} 찌르기 연계: ${target.name} ${total} 피해`, effects };
}

function castBerniceSkill(caster, enemies) {
  const target = living(enemies).slice().sort((a, b) => distanceBetween(caster, b) - distanceBetween(caster, a) || a.hp - b.hp)[0];
  if (!target) return { message: "", effects: [] };
  const damage = dealSkillDamage(caster, target, caster.atk * 0.45 + caster.skillAmp * 0.9 + 8);
  if (target.hp > 0) applyRoot(target, 4);
  playSkillVisual?.({ type: "bernice-snare-trap", fromId: caster.id, targetIds: [target.id] });
  return {
    message: `${caster.name} 올가미 덫: ${target.name} ${damage} 피해 / 속박`,
    effects: [combatEffect(caster, target, "skill", { amount: damage })],
  };
}

function castRioSkill(caster, enemies) {
  const target = living(enemies).slice().sort((a, b) => distanceBetween(caster, b) - distanceBetween(caster, a) || a.hp - b.hp)[0];
  if (!target) return { message: "", effects: [] };
  let total = 0;
  const effects = [];
  for (let shot = 0; shot < 2 && target.hp > 0; shot += 1) {
    const damage = dealSkillDamage(caster, target, caster.atk * 0.75 + caster.skillAmp * 0.45);
    total += damage;
    effects.push({ ...combatEffect(caster, target, "skill", { amount: damage }), kind: "arrow", delayMs: shot * 140 });
  }
  playSkillVisual?.({ type: "rio-kaeyumi", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 카에유미: ${target.name} ${total} 피해`, effects };
}

function castCelineSkill(caster, enemies) {
  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  if (distanceBetween(caster, target) > Math.max(unitAttackRange(caster), 2)) {
    const moved = moveToward(caster, target);
    caster.mana = unitMaxMana(caster);
    return { message: moved ? `${caster.name} 플라즈마 폭발 사거리 접근` : `${caster.name} 대기`, effects: [] };
  }
  skillTimeline.schedule(combatElapsedMs, 450, {
    type: "celine-plasma-bomb",
    caster,
    target,
    enemies: enemies.slice(),
  });
  playSkillVisual?.({ type: "celine-plasma-arm", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 플라즈마 폭발: ${target.name}에게 폭탄 설치`, effects: [] };
}

function castTiaSkill(caster, allies, enemies) {
  const center = pickTarget(caster, enemies);
  if (!center) return { message: "", effects: [] };
  const targets = unitsInRange(center, enemies, 1);
  const healTarget = living(allies)
    .slice()
    .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp) || (b.maxHp - b.hp) - (a.maxHp - a.hp))[0];
  const effects = [];
  let total = 0;
  for (const target of targets) {
    const damage = dealSkillDamage(caster, target, caster.skillAmp * 0.75 + 8);
    total += damage;
    effects.push({ ...combatEffect(caster, target, "skill", { amount: damage, paintExplosion: true }), kind: "paint-explosion" });
  }
  let heal = 0;
  if (healTarget) {
    heal = applyHeal(healTarget, skillOutput(caster, (caster.skillAmp * 0.9 + 10) * caster.healPower));
    if (heal > 0) effects.push(combatEffect(caster, healTarget, "heal", { amount: heal }));
  }
  playSkillVisual?.({ type: "tia-perfect-drawing", fromId: caster.id, targetIds: [center.id, ...(healTarget ? [healTarget.id] : [])] });
  return { message: `${caster.name} 퍼펙트드로잉: ${targets.length}명 ${total} 피해 / ${heal} 회복`, effects };
}

function castXiukaiSkill(caster, allies) {
  return castShouMealTimeSkill(caster, allies);
}

function castShouMealTimeSkill(caster, allies) {
  const target = lowestHpAllies(allies, 1)[0];
  if (!target) return { message: `${caster.name} 식사시간: 대상 없음`, effects: [] };
  const augment = unitAugmentEffect(caster, "shouBattlefieldChef");
  const castCount = caster.mealTimeCasts || 0;
  const rampAdd = augment ? Number(augment.healStackMultiplyAdd) || 0.08 : 0.25;
  const maxStacks = augment ? Number(augment.maxStacks) || 8 : 99;
  const ramp = 1 + Math.min(castCount, maxStacks) * rampAdd;
  const rawHeal = skillOutput(caster, (caster.skillAmp * 0.9 + 18) * caster.healPower * ramp);
  const beforeMissing = Math.max(0, target.maxHp - target.hp);
  const heal = applyHeal(target, rawHeal);
  let shield = 0;
  if (augment && rawHeal > beforeMissing) {
    shield = Math.max(0, Math.round((rawHeal - beforeMissing) * (Number(augment.overhealShieldRatio) || 0)));
    target.shield = (target.shield || 0) + shield;
  }
  caster.mealTimeCasts = castCount + 1;
  playSkillVisual?.({ type: "xiukai-hot-taste", fromId: caster.id, targetIds: [target.id] });
  const effects = [];
  if (heal > 0) effects.push(combatEffect(caster, target, "heal", { amount: heal }));
  if (shield > 0) effects.push(combatEffect(caster, target, "shield", { amount: shield }));
  return {
    message: `${caster.name} 식사시간: ${target.name} ${heal} 회복${shield ? ` / 보호막 ${shield}` : ""}`,
    effects,
  };
}

function castZahirVayvayastraSkill(caster, enemies) {
  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  const targets = lineTargetsBetween(caster, target, enemies);
  skillTimeline.schedule(combatElapsedMs, 730, {
    type: "zahir-vayvayastra-hit",
    caster,
    targets: targets.slice(),
  });
  playSkillVisual?.({ type: "zahir-vayvayastra", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 바이바야스트라: 회오리 소환`, effects: [] };
}

function resolveZahirVayvayastraSkill(caster, targets) {
  const victims = targets.filter((unit) => unit.hp > 0);
  let total = 0;
  const effects = [];
  for (const unit of victims) {
    const damage = dealSkillDamage(caster, unit, caster.skillAmp * 0.58 + caster.atk * 0.25 + 5);
    total += damage;
    if (unit.hp > 0) applyStunMs(unit, 500);
    effects.push(combatEffect(caster, unit, "skill", { amount: damage }));
  }
  return { message: `${caster.name} 바이바야스트라 적중: ${victims.length}명 ${total} 피해 / 기절`, effects };
}

function castLukeSkill(caster, enemies) {
  const targets = unitsInRange(caster, enemies, 1);
  let total = 0;
  const effects = [];
  for (const target of targets) {
    const damage = dealSkillDamage(caster, target, caster.atk * 0.65 + caster.skillAmp * 0.35 + 5);
    total += damage;
    effects.push(combatEffect(caster, target, "skill", { amount: damage }));
  }
  const missingHp = Math.max(0, caster.maxHp - caster.hp);
  const healCap = caster.maxHp * 0.4;
  const heal = targets.length ? applyHeal(caster, Math.min(healCap, missingHp * Math.min(1, 0.28 * targets.length))) : 0;
  if (heal > 0) effects.push(combatEffect(caster, caster, "heal", { amount: heal }));
  playSkillVisual?.({ type: "luke-obsession", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return { message: `${caster.name} 강박증: ${targets.length}명 ${total} 피해 / ${heal} 회복`, effects };
}

function castSilviaSkill(caster, allies, enemies) {
  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  const enemyTargets = lineTargetsBetween(caster, target, enemies);
  const allyTargets = lineTargetsBetween(caster, target, allies).filter((unit) => unit !== caster);
  const effects = [];
  let total = 0;
  let healTotal = 0;
  for (const unit of enemyTargets) {
    const damage = dealSkillDamage(caster, unit, caster.atk * 0.48 + caster.skillAmp * 0.7 + 5);
    total += damage;
    effects.push({ ...combatEffect(caster, unit, "skill", { amount: damage }), kind: "bullet" });
  }
  for (const ally of allyTargets) {
    const heal = applyHeal(ally, skillOutput(caster, caster.skillAmp * 0.55 + 8));
    healTotal += heal;
    if (heal > 0) effects.push(combatEffect(caster, ally, "heal", { amount: heal }));
  }
  playSkillVisual?.({ type: "silvia-speed-gun", fromId: caster.id, targetIds: [target.id, ...allyTargets.map((unit) => unit.id)] });
  return { message: `${caster.name} 스피드건: 경로 ${enemyTargets.length}명 ${total} 피해 / 아군 ${allyTargets.length}명 ${healTotal} 회복`, effects };
}

function castBiancaSkill(caster, enemies) {
  if (caster.biancaReignUsed) {
    return castRoleSkill(caster, caster.role, [], enemies);
  }
  caster.biancaReignUsed = true;
  moveToCenter(caster);
  const targets = living(enemies);
  let total = 0;
  const effects = [];
  for (const target of targets) {
    const damage = dealSkillDamage(caster, target, caster.skillAmp * 0.72 + 8);
    total += damage;
    effects.push(combatEffect(caster, target, "skill", { amount: damage }));
  }
  skillTimeline.schedule(combatElapsedMs, 2500, {
    type: "bianca-reign-second",
    caster,
    enemies: enemies.slice(),
  });
  playSkillVisual?.({ type: "bianca-reign", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return { message: `${caster.name} 진조의 군림: 중앙 이동 / 전체 ${targets.length}명 ${total} 피해`, effects };
}

function farthestEnemy(caster, enemies) {
  return living(enemies).slice().sort((a, b) => distanceBetween(caster, b) - distanceBetween(caster, a) || a.hp - b.hp)[0] || null;
}

function lowestHpEnemy(enemies) {
  return living(enemies).slice().sort((a, b) => a.hp - b.hp)[0] || null;
}

function lowestHpAllies(allies, count) {
  return living(allies)
    .slice()
    .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp) || (b.maxHp - b.hp) - (a.maxHp - a.hp))
    .slice(0, count);
}

function targetsAroundUnit(center, enemies, range = 1) {
  return living(enemies).filter((unit) => distanceBetween(center, unit) <= range);
}

function hitTargets(caster, targets, amount, kind = "skill", delayStep = 0) {
  const effects = [];
  let total = 0;
  targets.forEach((target, index) => {
    if (!target || target.hp <= 0) return;
    const damage = dealSkillDamage(caster, target, amount);
    total += damage;
    effects.push({ ...combatEffect(caster, target, "skill", { amount: damage }), kind, delayMs: delayStep * index });
  });
  return { effects, total };
}

function castAlexSkill(caster, enemies) {
  const target = farthestEnemy(caster, enemies);
  if (!target) return { message: "", effects: [] };
  const augment = unitAugmentEffect(caster, "alexFocusedBarrage");
  const targets = targetsAroundUnit(target, enemies, 1);
  const impact = hitTargets(caster, targets, caster.atk * 0.25 + caster.skillAmp * 0.52 + 5, "magic", 45);
  if (augment) {
    const repeat = hitTargets(caster, targets, caster.skillAmp * (Number(augment.repeatHitDamageSkillAmpRatio) || 0), "magic", 45);
    impact.effects.push(...repeat.effects.map((effect) => ({ ...effect, delayMs: (effect.delayMs || 0) + 180 })));
    impact.total += repeat.total;
  }
  for (let tick = 1; tick <= 3; tick += 1) {
    skillTimeline.schedule(combatElapsedMs, tick * 450, {
      type: "alex-precision-bombardment-dot",
      caster,
      center: target,
      enemies: enemies.slice(),
      tick,
    });
  }
  for (let extra = 0; extra < (Number(augment?.extraStrike) || 0); extra += 1) {
    skillTimeline.schedule(combatElapsedMs, 650 + extra * 220, {
      type: "alex-precision-bombardment-dot",
      caster,
      center: target,
      enemies: enemies.slice(),
      tick: 4 + extra,
    });
  }
  playSkillVisual?.({ type: "celine-plasma-bomb", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 정밀폭격: ${targets.length}명 ${impact.total} 피해 / 장판 생성`, effects: impact.effects };
  moveNextToUnit(target, caster);
  target.forcedFocusTargetId = caster.id;
  target.focusTargetId = caster.id;
  const damage = dealSkillDamage(caster, target, caster.atk * 0.35 + caster.skillAmp * 0.9 + 6);
  applyRoot(target, 1);
  playSkillVisual?.({ type: "fate-absorb", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 유인: ${target.name} 끌어오기 / ${damage} 피해`, effects: [combatEffect(caster, target, "skill", { amount: damage })] };
}

function castSuaSkill(caster, enemies) {
  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  const targets = targetsAroundUnit(target, enemies, 1);
  const { effects, total } = hitTargets(caster, targets, caster.atk * 0.55 + caster.skillAmp * 0.75 + 6, "magic", 80);
  for (const unit of targets) applyActionSlow(unit, 1, 0.5);
  playSkillVisual?.({ type: "luke-obsession", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return { message: `${caster.name} 오딧세이: ${targets.length}명 ${total} 피해 / 지연`, effects };
}

function castLeonSkill(caster, enemies) {
  const target = farthestEnemy(caster, enemies);
  if (!target) return { message: "", effects: [] };
  moveNextToUnit(caster, target);
  const submergeDamage = dealSkillDamage(caster, target, caster.atk * 0.55 + caster.skillAmp * 0.8 + 6);
  if (target.hp > 0) applyStun(target, 1);
  playSkillVisual?.({ type: "cathy-needle", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 잠영: ${target.name} 기습 / ${submergeDamage} 피해 / 기절`, effects: [combatEffect(caster, target, "skill", { amount: submergeDamage })] };
  moveNextToUnit(caster, target);
  const damage = dealSkillDamage(caster, target, caster.atk * 0.55 + caster.skillAmp * 0.8 + 6);
  playSkillVisual?.({ type: "cathy-needle", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 잠영: ${target.name} 기습 / ${damage} 피해`, effects: [combatEffect(caster, target, "skill", { amount: damage })] };
}

function castElevenSkill(caster, enemies) {
  const targets = unitsInRange(caster, enemies, 2);
  for (const target of targets) {
    target.forcedFocusTargetId = caster.id;
    target.focusTargetId = caster.id;
  }
  const shield = Math.max(1, Math.round(skillOutput(caster, caster.skillAmp * 0.85 + caster.defense * 1.2 + 12)));
  caster.shield = (caster.shield || 0) + shield;
  playSkillVisual?.({ type: "hart-peacemaker", fromId: caster.id, targetIds: [caster.id, ...targets.map((unit) => unit.id)] });
  return { message: `${caster.name} 나 불렀어?: ${targets.length}명 도발 / 보호막 ${shield}`, effects: [combatEffect(caster, caster, "shield", { amount: shield })] };
}

function castNickySkill(caster, enemies) {
  caster.nickyCounterReady = 1;
  caster.actionLockRemainingMs = Math.max(caster.actionLockRemainingMs || 0, 750);
  caster.actionLockDurationMs = Math.max(caster.actionLockDurationMs || 0, 750);
  const shield = Math.max(1, Math.round(skillOutput(caster, caster.skillAmp * 0.75 + caster.defense * 1.1 + 8)));
  caster.shield = (caster.shield || 0) + shield;
  const target = pickTarget(caster, enemies);
  playSkillVisual?.({ type: "sissela-channel", fromId: caster.id, targetIds: target ? [target.id] : [caster.id] });
  return { message: `${caster.name} 가드 카운터: 다음 평타 기절 준비 / 보호막 ${shield}`, effects: [combatEffect(caster, caster, "shield", { amount: shield })] };
}

function castCamiloSkill(caster, enemies) {
  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  const targets = lineTargetsBetween(caster, target, enemies).slice(0, 4);
  const effects = [];
  let total = 0;
  for (const unit of targets) {
    const first = dealSkillDamage(caster, unit, caster.atk * 0.45 + caster.skillAmp * 0.55 + 5);
    const second = unit.hp > 0 ? dealSkillDamage(caster, unit, caster.atk * 0.45 + caster.skillAmp * 0.55 + 5) : 0;
    total += first + second;
    if (unit.hp > 0) applyStun(unit, 1);
    effects.push(combatEffect(caster, unit, "skill", { amount: first }));
    effects.push({ ...combatEffect(caster, unit, "skill", { amount: second }), delayMs: 300 });
  }
  playSkillVisual?.({ type: "shoichi-dagger-ride", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 두엔데: 왕복 ${targets.length}명 ${total} 피해`, effects };
}

function castArdaSkill(caster, allies, enemies) {
  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  const enemyTargets = lineTargetsBetween(caster, target, enemies);
  const allyTargets = lineTargetsBetween(caster, target, allies).filter((unit) => unit !== caster);
  const effects = [];
  let total = 0;
  let healTotal = 0;
  for (const unit of enemyTargets) {
    const damage = dealSkillDamage(caster, unit, caster.skillAmp * 0.78 + 9);
    total += damage;
    effects.push(combatEffect(caster, unit, "skill", { amount: damage }));
  }
  for (const ally of allyTargets) {
    const heal = applyHeal(ally, skillOutput(caster, caster.skillAmp * 0.62 + 10) * caster.healPower);
    healTotal += heal;
    if (heal > 0) effects.push(combatEffect(caster, ally, "heal", { amount: heal }));
  }
  playSkillVisual?.({ type: "silvia-speed-gun", fromId: caster.id, targetIds: [target.id, ...allyTargets.map((unit) => unit.id)] });
  return { message: `${caster.name} 샤마쉬의 두루마리: ${enemyTargets.length}명 ${total} 피해 / ${healTotal} 회복`, effects };
}

function castEchionSkill(caster, enemies) {
  const targets = unitsInFront(caster, enemies, 3);
  const { effects, total } = hitTargets(caster, targets, caster.atk * 0.55 + caster.skillAmp * 0.75 + 7, "magic", 60);
  skillTimeline.schedule(combatElapsedMs, 1000, { type: "echion-viper-stun", caster, targets: targets.slice() });
  playSkillVisual?.({ type: "zahir-vayvayastra", fromId: caster.id, targetIds: targets.map((unit) => unit.id).slice(0, 1) });
  return { message: `${caster.name} 독사의 진노: 전방 ${targets.length}명 ${total} 피해 / 지연 기절`, effects };
}

function castAdinaSkill(caster, enemies) {
  const targets = living(enemies).slice().sort((a, b) => compareByDistanceThenHp(caster, a, b)).slice(0, 3);
  const effects = [];
  let total = 0;
  targets.forEach((target, index) => {
    const damage = dealSkillDamage(caster, target, caster.skillAmp * 0.7 + 8);
    total += damage;
    effects.push({ ...combatEffect(caster, target, "skill", { amount: damage }), kind: "magic", delayMs: index * 90 });
  });
  gainMana(caster, 20);
  return { message: `${caster.name} 트라인 에스펙트: ${targets.length}명 ${total} 피해 / 마나 회복`, effects };
}

function castKarlaSkill(caster, enemies) {
  const target = farthestEnemy(caster, enemies);
  if (!target) return { message: "", effects: [] };
  caster.karlaHarpoonCasts = (caster.karlaHarpoonCasts || 0) + 1;
  const targets = lineTargetsBetween(caster, target, enemies);
  const recall = caster.karlaHarpoonCasts % 4 === 0;
  const { effects, total } = hitTargets(caster, targets, caster.atk * (recall ? 0.62 : 0.42) + caster.skillAmp * (recall ? 0.62 : 0.48) + 6, "arrow", 70);
  playSkillVisual?.({ type: "rio-kaeyumi", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 관통 작살: 경로 ${targets.length}명 ${total} 피해${recall ? " / 작살 회수" : ""}`, effects };
}

function castAbigailSkill(caster, enemies) {
  const targets = unitsInRange(caster, enemies, 1);
  const effects = [];
  let total = 0;
  for (let hit = 0; hit < 2; hit += 1) {
    for (const target of targets.filter((unit) => unit.hp > 0)) {
      const damage = dealSkillDamage(caster, target, caster.atk * 0.52 + caster.skillAmp * 0.35 + 5);
      total += damage;
      effects.push({ ...combatEffect(caster, target, "skill", { amount: damage }), kind: "slash", delayMs: hit * 160 });
    }
  }
  playSkillVisual?.({ type: "luke-obsession", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return { message: `${caster.name} 호라이즌 클리브: ${targets.length}명 2회 ${total} 피해`, effects };
}

function castKennethSkill(caster, enemies) {
  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  const targets = targetsAroundUnit(target, enemies, 1);
  const { effects, total } = hitTargets(caster, targets, caster.atk * 0.7 + caster.skillAmp * 0.85 + 8, "magic", 60);
  const heal = applyHeal(caster, total * 0.2);
  if (heal > 0) effects.push(combatEffect(caster, caster, "heal", { amount: heal }));
  playSkillVisual?.({ type: "xiukai-flame", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return { message: `${caster.name} 화염 분쇄: ${targets.length}명 ${total} 피해 / ${heal} 회복`, effects };
}

function castCharlotteSkill(caster, allies) {
  const targets = unitsInRange(caster, allies, 1);
  if (!targets.includes(caster)) targets.unshift(caster);
  for (const target of targets) {
    target.immuneRemainingMs = Math.max(target.immuneRemainingMs || 0, 2000);
    target.immuneDurationMs = Math.max(target.immuneDurationMs || 0, 2000);
    target.status = "immune";
  }
  playSkillVisual?.({ type: "hart-peacemaker", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return { message: `${caster.name} 기적 실현: ${targets.length}명 2초 무적`, effects: targets.map((unit) => combatEffect(caster, unit, "shield", { amount: 1 })) };
}

function castEstelleSkill(caster, enemies) {
  caster.shieldDefenseRemainingMs = 3000;
  caster.shieldDefenseDurationMs = 3000;
  caster.status = "shielded";
  const targets = unitsInFront(caster, enemies, 4);
  for (const target of targets) {
    target.forcedFocusTargetId = caster.id;
    target.focusTargetId = caster.id;
  }
  playSkillVisual?.({ type: "hart-peacemaker", fromId: caster.id, targetIds: [caster.id, ...targets.map((unit) => unit.id)] });
  return {
    message: `${caster.name} 방패방어: 3초간 전방 공격 유도 / 받는 피해 60% 감소 / 마나 회복 중지`,
    effects: [combatEffect(caster, caster, "shield", { amount: 1 })],
  };
}

function castAlonsoSkill(caster, enemies) {
  const waveTargets = unitsInFront(caster, enemies, 3);
  const waveEffects = [];
  let waveTotal = 0;
  const hitCounts = new Map();
  for (let wave = 0; wave < 5; wave += 1) {
    for (const target of waveTargets.filter((unit) => unit.hp > 0)) {
      const damage = dealSkillDamage(caster, target, caster.atk * 0.16 + caster.defense * 0.42 + 3);
      waveTotal += damage;
      hitCounts.set(target.id, (hitCounts.get(target.id) || 0) + 1);
      waveEffects.push({ ...combatEffect(caster, target, "skill", { amount: damage, wave: wave + 1 }), kind: "magic", delayMs: wave * 95 });
    }
  }
  const stunned = waveTargets.filter((target) => target.hp > 0 && (hitCounts.get(target.id) || 0) >= 3);
  for (const target of stunned) applyStun(target, 1);
  playSkillVisual?.({ type: "rio-kaeyumi", fromId: caster.id, targetIds: waveTargets.map((unit) => unit.id) });
  return { message: `${caster.name} 바운싱실드: 전방 ${waveTargets.length}명 5파동 ${waveTotal} 피해 / ${stunned.length}명 기절`, effects: waveEffects };
  const targets = living(enemies).slice().sort((a, b) => compareByDistanceThenHp(caster, a, b)).slice(0, 3);
  const effects = [];
  let total = 0;
  for (const target of targets) {
    const damage = dealSkillDamage(caster, target, caster.atk * 0.35 + caster.defense * 1.1 + 6);
    total += damage;
    applyStun(target, 1);
    effects.push(combatEffect(caster, target, "skill", { amount: damage }));
  }
  playSkillVisual?.({ type: "rio-kaeyumi", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return { message: `${caster.name} 바운싱실드: ${targets.length}명 ${total} 피해 / 기절`, effects };
}

function castMirkaSkill(caster, enemies) {
  const targets = unitsInRange(caster, enemies, 1);
  const effects = [];
  let total = 0;
  for (const target of targets) {
    const damage = dealSkillDamage(caster, target, caster.skillAmp * 0.8 + caster.defense * 1.2 + 8);
    total += damage;
    knockBack(target, caster, 1);
    effects.push(combatEffect(caster, target, "skill", { amount: damage }));
  }
  const shield = Math.max(1, Math.round(skillOutput(caster, caster.skillAmp + caster.defense * 1.5)));
  caster.shield = (caster.shield || 0) + shield;
  effects.push(combatEffect(caster, caster, "shield", { amount: shield }));
  playSkillVisual?.({ type: "sissela-liberation", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return { message: `${caster.name} 리펄스배리어: ${targets.length}명 ${total} 피해 / 보호막 ${shield}`, effects };
}

function castBihyungSkill(caster, allies) {
  caster.bihyungEnhancedAttacks = 2;
  playSkillVisual?.({ type: "luke-obsession", fromId: caster.id, targetIds: [caster.id] });
  return {
    message: `${caster.name} 뚝딱!: 다음 평타 2회 강화 / 2회째 전방 180도 타격`,
    effects: [combatEffect(caster, caster, "shield", { amount: 1 })],
  };
  const targets = lowestHpAllies(allies, 2);
  const effects = [];
  let total = 0;
  for (const target of targets) {
    const amount = Math.round(skillOutput(caster, caster.skillAmp * 0.8 + caster.defense * 0.8 + 12) * caster.healPower);
    const heal = applyHeal(target, amount * 0.45);
    const shield = Math.max(1, amount);
    target.shield = (target.shield || 0) + shield;
    total += heal + shield;
    if (heal > 0) effects.push(combatEffect(caster, target, "heal", { amount: heal }));
    effects.push(combatEffect(caster, target, "shield", { amount: shield }));
  }
  playSkillVisual?.({ type: "leni-carrot-bazooka", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return { message: `${caster.name} 뚝딱!: ${targets.length}명 회복/보호 ${total}`, effects };
}

function castGarnetSkill(caster, enemies) {
  const target = lowestHpEnemy(enemies);
  if (!target) return { message: "", effects: [] };
  target.garnetIronMaiden = {
    casterId: caster.id,
    casterName: caster.name,
    remainingMs: 1500,
    durationMs: 1500,
    executeHpRatio: 0.22,
  };
  const ironDamage = dealSkillDamage(caster, target, caster.atk * 0.25 + caster.skillAmp * 1.05 + caster.defense * 0.75);
  playSkillVisual?.({ type: "fate-absorb", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 아이언메이든: ${target.name} 표식 1.5초 / ${ironDamage} 피해 / 저체력 처형`, effects: [combatEffect(caster, target, "skill", { amount: ironDamage })] };
  applyStun(target, 2);
  const damage = dealSkillDamage(caster, target, caster.atk * 0.35 + caster.skillAmp * 1.2 + caster.defense * 0.8);
  playSkillVisual?.({ type: "fate-absorb", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 아이언메이든: ${target.name} 제압 / ${damage} 피해`, effects: [combatEffect(caster, target, "skill", { amount: damage })] };
}

function castAidenSkill(caster, enemies) {
  const target = farthestEnemy(caster, enemies);
  if (!target) return { message: "", effects: [] };
  const targets = lineTargetsBetween(caster, target, enemies);
  const { effects, total } = hitTargets(caster, targets, caster.atk * 0.6 + caster.skillAmp * 0.85 + 7, "magic", 50);
  moveNextToUnit(caster, target);
  playSkillVisual?.({ type: "shoichi-dagger-ride", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 라이드더라이트닝!: 경로 ${targets.length}명 ${total} 피해`, effects };
}

function castFelixSkill(caster, enemies) {
  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  const effects = [];
  let total = 0;
  for (let hit = 0; hit < 3; hit += 1) {
    const damage = target.hp > 0 ? dealSkillDamage(caster, target, caster.atk * 0.45 + caster.skillAmp * 0.35 + 3) : 0;
    total += damage;
    effects.push({ ...combatEffect(caster, target, "skill", { amount: damage }), kind: "slash", delayMs: hit * 100 });
  }
  playSkillVisual?.({ type: "cathy-needle", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 연계 창술: ${target.name} ${total} 피해`, effects };
}

function castPioloSkill(caster, enemies) {
  const flurryTargets = unitsInRange(caster, enemies, 1);
  const flurryEffects = [];
  let flurryTotal = 0;
  for (let hit = 0; hit < 4; hit += 1) {
    for (const target of flurryTargets.filter((unit) => unit.hp > 0)) {
      const damage = dealSkillDamage(caster, target, caster.atk * 0.26 + caster.skillAmp * 0.28 + 3);
      flurryTotal += damage;
      flurryEffects.push({ ...combatEffect(caster, target, "skill", { amount: damage }), kind: "slash", delayMs: hit * 85 });
    }
  }
  playSkillVisual?.({ type: "luke-obsession", fromId: caster.id, targetIds: flurryTargets.map((unit) => unit.id) });
  return { message: `${caster.name} 쌍절난격: 주위 ${flurryTargets.length}명 4연타 / ${flurryTotal} 피해`, effects: flurryEffects };
  const targets = unitsInRange(caster, enemies, 1).slice(0, 2);
  const effects = [];
  let total = 0;
  for (let hit = 0; hit < 2; hit += 1) {
    for (const target of targets.filter((unit) => unit.hp > 0)) {
      const damage = dealSkillDamage(caster, target, caster.atk * 0.45 + caster.skillAmp * 0.45 + 4);
      total += damage;
      effects.push({ ...combatEffect(caster, target, "skill", { amount: damage }), kind: "slash", delayMs: hit * 120 });
    }
  }
  playSkillVisual?.({ type: "luke-obsession", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return { message: `${caster.name} 쌍절난격: ${targets.length}명 ${total} 피해`, effects };
}

function castDebiMarleneSkill(caster, enemies) {
  const primary = pickTarget(caster, enemies);
  const farthest = farthestEnemy(caster, enemies);
  const targets = [...new Set([primary, farthest].filter(Boolean))];
  const { effects, total } = hitTargets(caster, targets, caster.atk * 0.65 + caster.skillAmp * 0.7 + 8, "slash", 130);
  playSkillVisual?.({ type: "aya-double-burst", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return { message: `${caster.name} 트윈즈러시: ${targets.length}명 ${total} 피해`, effects };
}

function castTheodoreSkill(caster, allies) {
  const targets = lowestHpAllies(allies, 3);
  const effects = [];
  let total = 0;
  for (const target of targets) {
    const heal = applyHeal(target, skillOutput(caster, caster.skillAmp * 0.65 + 10) * caster.healPower);
    const shield = Math.max(1, Math.round(skillOutput(caster, caster.skillAmp * 0.28 + 6)));
    target.shield = (target.shield || 0) + shield;
    total += heal + shield;
    if (heal > 0) effects.push(combatEffect(caster, target, "heal", { amount: heal }));
    effects.push(combatEffect(caster, target, "shield", { amount: shield }));
  }
  playSkillVisual?.({ type: "priya-earth-echo", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return { message: `${caster.name} 에너지 필드: ${targets.length}명 회복/보호 ${total}`, effects };
}

function castJohannSkill(caster, allies) {
  const targets = unitsInRange(caster, allies, 2);
  if (!targets.includes(caster)) targets.unshift(caster);
  const effects = [];
  let total = 0;
  for (const target of targets) {
    const heal = applyHeal(target, skillOutput(caster, caster.skillAmp * 0.55 + 12) * caster.healPower);
    const shield = Math.max(1, Math.round(skillOutput(caster, caster.skillAmp * 0.35 + 8)));
    target.shield = (target.shield || 0) + shield;
    target.sanctuaryRemainingMs = Math.max(target.sanctuaryRemainingMs || 0, 1000);
    total += heal + shield;
    if (heal > 0) effects.push(combatEffect(caster, target, "heal", { amount: heal }));
    effects.push(combatEffect(caster, target, "shield", { amount: shield }));
  }
  playSkillVisual?.({ type: "hart-peacemaker", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return { message: `${caster.name} 구원의 성역: ${targets.length}명 회복/보호 ${total}`, effects };
}

function castEmmaSkill(caster, enemies) {
  const target = lowestHpEnemy(enemies);
  if (!target) return { message: "", effects: [] };
  applyRoot(target, 2);
  const damage = dealSkillDamage(caster, target, caster.skillAmp * 0.95 + 10);
  playSkillVisual?.({ type: "sissela-channel", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 마술 모자: ${target.name} ${damage} 피해 / 속박`, effects: [combatEffect(caster, target, "skill", { amount: damage })] };
}

function castDanielSkill(caster, enemies) {
  const target = lowestHpEnemy(enemies);
  if (!target) return { message: "", effects: [] };
  moveNextToUnit(caster, target);
  const damage = dealSkillDamage(caster, target, caster.atk * 0.9 + caster.skillAmp * 0.75 + 10);
  if (target.hp <= 0) gainMana(caster, 50);
  playSkillVisual?.({ type: "shoichi-dagger-ride", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 역작: ${target.name} ${damage} 피해${target.hp <= 0 ? " / 마나 회수" : ""}`, effects: [combatEffect(caster, target, "skill", { amount: damage })] };
}

function castXuelinSkill(caster, enemies) {
  const targets = unitsInRange(caster, enemies, 1);
  const { effects, total } = hitTargets(caster, targets, caster.atk * 0.7 + caster.skillAmp * 0.65 + 7, "slash", 50);
  playSkillVisual?.({ type: "luke-obsession", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return { message: `${caster.name} 만검귀종: ${targets.length}명 ${total} 피해`, effects };
}

function castIremSkill(caster, enemies) {
  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  const effects = [];
  let total = 0;
  for (let hit = 0; hit < 2; hit += 1) {
    const damage = target.hp > 0 ? dealSkillDamage(caster, target, caster.atk * 0.45 + caster.skillAmp * 0.55 + 4) : 0;
    total += damage;
    effects.push({ ...combatEffect(caster, target, "skill", { amount: damage }), kind: "slash", delayMs: hit * 120 });
  }
  playSkillVisual?.({ type: "nadine-wolf", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 냥냥펀치: ${target.name} ${total} 피해`, effects };
}

function castJanSkill(caster, enemies) {
  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  const augment = unitAugmentEffect(caster, "yanRingDomination");
  const effects = [];
  let total = 0;
  const hits = Math.max(1, Number(augment?.comboHits) || 4);
  for (let hit = 0; hit < hits; hit += 1) {
    const damage = target.hp > 0 ? dealSkillDamage(caster, target, caster.atk * (augment ? Number(augment.bonusAtkRatio) || 1 : 0.35) + caster.skillAmp * 0.35 + 3) : 0;
    total += damage;
    effects.push({ ...combatEffect(caster, target, "skill", { amount: damage }), kind: "slash", delayMs: hit * 80 });
  }
  if (target.hp > 0) applyStunMs(target, augment ? (Number(augment.stunSeconds) || 0.6) * 1000 : durationFromTurns(1));
  playSkillVisual?.({ type: "rozzi-double-shot", fromId: caster.id, targetIds: [target.id] });
  return { message: `${caster.name} 쿼드라곤: ${target.name} ${total} 피해 / 기절`, effects };
}

function castCoralineSkill(caster, enemies) {
  caster.coralineCastMode = caster.coralineCastMode === "shield" ? "damage" : "shield";
  const target = pickTarget(caster, enemies);
  if (caster.coralineCastMode === "damage") {
    if (!target) return { message: "", effects: [] };
    const damage = dealSkillDamage(caster, target, caster.skillAmp * 1.18 + caster.atk * 0.28 + 10);
    playSkillVisual?.({ type: "bianca-reign", fromId: caster.id, targetIds: [target.id] });
    return {
      message: `${caster.name} 흑백의거울상: 추가 피해 투사체 / ${target.name} ${damage} 피해`,
      effects: [combatEffect(caster, target, "skill", { amount: damage })],
    };
  }
  const mirrorShield = Math.max(1, Math.round(skillOutput(caster, caster.skillAmp * 1.3 + caster.defense * 1.2 + 18)));
  caster.shield = (caster.shield || 0) + mirrorShield;
  playSkillVisual?.({ type: "hart-peacemaker", fromId: caster.id, targetIds: [caster.id] });
  return {
    message: `${caster.name} 흑백의거울상: 보호막 투사체 / 보호막 ${mirrorShield}`,
    effects: [combatEffect(caster, caster, "shield", { amount: mirrorShield })],
  };
  const targets = living(enemies).slice().sort((a, b) => compareByDistanceThenHp(caster, a, b)).slice(0, 4);
  const { effects, total } = hitTargets(caster, targets, caster.skillAmp * 0.72 + 9, "magic", 80);
  const shield = Math.max(1, Math.round(total * 0.25));
  caster.shield = (caster.shield || 0) + shield;
  effects.push(combatEffect(caster, caster, "shield", { amount: shield }));
  playSkillVisual?.({ type: "bianca-reign", fromId: caster.id, targetIds: targets.map((unit) => unit.id) });
  return { message: `${caster.name} 흑백의거울상: ${targets.length}명 ${total} 피해 / 보호막 ${shield}`, effects };
}

function resolveSkillTimelineEvents(elapsedMs) {
  const effects = [];
  const messages = [];
  for (const event of skillTimeline.takeDue(elapsedMs)) {
    try {
    if (event.type === "yuki-final-bloom") {
      const targets = event.targets.filter((unit) => unit.hp > 0);
      let total = 0;
      for (const target of targets) {
        const damage = dealSkillDamage(event.caster, target, event.fixedDamage, { fixed: true });
        total += damage;
        effects.push(combatEffect(event.caster, target, "skill", { amount: damage, fixed: true, timeline: "yuki-bloom" }));
      }
      playSkillVisual?.({ type: "yuki-bloom", fromId: event.caster.id, targetIds: targets.map((unit) => unit.id) });
      messages.push(`${event.caster.name} 화무십일홍 개화: ${targets.length}명 ${total} 고정 피해`);
      continue;
    }
    if (event.type === "hart-peacemaker-heal") {
      const targets = event.targets.filter((unit) => unit.hp > 0);
      let total = 0;
      for (const target of targets) {
        const heal = applyHeal(target, event.healAmount);
        total += heal;
        if (heal > 0) effects.push(combatEffect(event.caster, target, "heal", { amount: heal }));
      }
      messages.push(`${event.caster.name} 피스메이커 회복: ${targets.length}명 ${total} 회복`);
      continue;
    }
    if (event.type === "zahir-vayvayastra-hit") {
      const result = resolveZahirVayvayastraSkill(event.caster, event.targets);
      if (result.message) messages.push(result.message);
      effects.push(...result.effects);
      continue;
    }
    if (event.type === "priya-earth-echo") {
      const targets = unitsInRange(event.caster, event.enemies, 3);
      const augment = unitAugmentEffect(event.caster, "priyaGrandFinale");
      let total = 0;
      for (const target of targets) {
        const damage = dealSkillDamage(event.caster, target, event.caster.skillAmp * 0.75 + 9);
        total += damage;
        if (target.hp > 0) applyStunMs(target, 1600 + (Number(augment?.edgeStunAddSeconds) || 0) * 1000);
        effects.push(combatEffect(event.caster, target, "skill", { amount: damage }));
      }
      playSkillVisual?.({ type: "priya-earth-echo", fromId: event.caster.id, targetIds: targets.map((unit) => unit.id) });
      messages.push(`${event.caster.name} 대지의메아리: ${targets.length}명 ${total} 피해 / 기절`);
      continue;
    }
    if (event.type === "sissela-liberation") {
      const result = resolveSisselaSkill(event.caster, event.enemies, event.lostHp);
      messages.push(result.message);
      effects.push(...result.effects);
      playSkillVisual?.({ type: "sissela-liberation", fromId: event.caster.id, targetIds: living(event.enemies).map((unit) => unit.id) });
      continue;
    }
    if (event.type === "alex-precision-bombardment-dot") {
      const targets = unitsInRange(event.center, event.enemies, 1);
      let total = 0;
      for (const target of targets) {
        const damage = dealSkillDamage(event.caster, target, event.caster.atk * 0.12 + event.caster.skillAmp * 0.28 + 3);
        total += damage;
        effects.push({ ...combatEffect(event.caster, target, "skill", { amount: damage, dot: true }), kind: "magic" });
      }
      playSkillVisual?.({ type: "celine-plasma-bomb", fromId: event.caster.id, targetIds: targets.map((unit) => unit.id) });
      messages.push(`${event.caster.name} 정밀폭격 장판: ${targets.length}명 ${total} 피해`);
      continue;
    }
    if (event.type === "celine-plasma-bomb") {
      const targets = unitsInRange(event.target, event.enemies, 1);
      let total = 0;
      for (const target of targets) {
        const damage = dealSkillDamage(event.caster, target, event.caster.skillAmp * 1.25 + 10);
        total += damage;
        effects.push({ ...combatEffect(event.caster, target, "skill", { amount: damage, fixed: false }), kind: "paint-explosion" });
      }
      playSkillVisual?.({ type: "celine-plasma-bomb", fromId: event.caster.id, targetIds: targets.map((unit) => unit.id) });
      messages.push(`${event.caster.name} 플라즈마 폭발: ${targets.length}명 ${total} 피해`);
      continue;
    }
    if (event.type === "bianca-reign-second") {
      const targets = living(event.enemies);
      let total = 0;
      for (const target of targets) {
        const damage = dealSkillDamage(event.caster, target, event.caster.skillAmp * 0.88 + 12);
        total += damage;
        effects.push(combatEffect(event.caster, target, "skill", { amount: damage }));
      }
      playSkillVisual?.({ type: "bianca-reign", fromId: event.caster.id, targetIds: targets.map((unit) => unit.id) });
      messages.push(`${event.caster.name} 진조의 군림 재격발: ${targets.length}명 ${total} 피해`);
      continue;
    }
    if (event.type === "echion-viper-stun") {
      const targets = event.targets.filter((unit) => unit.hp > 0);
      for (const target of targets) applyStun(target, 2);
      messages.push(`${event.caster.name} 독사의 진노: ${targets.length}명 기절`);
      continue;
    }
    } catch (error) {
      console.error("[rumia-skill-timeline-event]", event?.type, error);
      addLog(`예약 스킬 처리 오류: ${event?.type || "unknown"} 이벤트를 건너뜁니다.`, { force: true });
      messages.push("예약 스킬 처리 오류: 해당 이벤트를 건너뜁니다.");
    }
  }
  return { effects, messages };
}

function detonatePaint(caster, enemies) {
  const detonation = consumePaintDetonation(caster, living(enemies));
  if (!detonation) return null;
  const range = Number(detonation.rule.effect.range) || 1;
  const targets = living(enemies).filter((target) =>
    detonation.centers.some((center) => distanceBetween(center, target) <= range)
  );
  const amount = caster.skillAmp * (Number(detonation.rule.effect.skillAmpRatio) || 0)
    + caster.atk * (Number(detonation.rule.effect.atkRatio) || 0);
  let total = 0;
  const effects = [];
  for (const target of targets) {
    const damage = dealSkillDamage(caster, target, amount);
    total += damage;
    effects.push({
      ...combatEffect(caster, target, "paint-explosion", { amount: damage, paintExplosion: true }),
      kind: "paint-explosion",
    });
  }
  return { message: `${detonation.rule.name}: 물감 폭발 ${targets.length}명 ${total} 피해`, effects };
}

function withSkillName(caster, action) {
  if (!action?.effects?.length) return action;
  return {
    ...action,
    effects: [
      { from: caster.id, to: caster.id, type: "skill-name", kind: "skill-name", value: { label: caster.skill || "스킬" } },
      ...action.effects,
    ],
  };
}

function resolveAugmentActionEffects(actor, friends, foes, action) {
  if (!actor || actor.side !== "ally" || !action?.effects?.length) return { effects: [], messages: [] };
  const effects = [];
  const messages = [];
  const skillHits = action.effects
    .filter((effect) => effect.type === "skill" && effect.to && (effect.value?.amount || 0) > 0)
    .map((effect) => living(foes).find((unit) => unit.id === effect.to))
    .filter(Boolean);
  if (!skillHits.length) return { effects, messages };

  for (const effect of selectedAugmentEffects("skillChainLightning")) {
    if (actor.augmentChainLightningReadyAt && actor.augmentChainLightningReadyAt > combatElapsedMs) continue;
    const first = skillHits[0];
    const target = living(foes)
      .filter((unit) => unit !== first)
      .sort((a, b) => distanceBetween(first, a) - distanceBetween(first, b))[0];
    if (!target) continue;
    const damage = dealSkillDamage(actor, target, actor.skillAmp * (Number(effect.damageSkillAmpRatio) || 0));
    if (damage > 0) {
      effects.push({ ...combatEffect(actor, target, "skill", { amount: damage, extra: true }), kind: "magic" });
      messages.push(`${actor.name} 번개 증강: ${target.name} ${damage} 피해`);
    }
    actor.augmentChainLightningReadyAt = combatElapsedMs + (Number(effect.cooldownSeconds) || 1.5) * 1000;
  }
  for (const target of skillHits) {
    for (const effect of selectedAugmentEffects("skillCurseStack")) {
      target.augmentCurseStacks = Math.min(Number(effect.maxStacks) || 5, (target.augmentCurseStacks || 0) + 1);
      target.healReduction = Math.max(target.healReduction || 0, Number(effect.healingReduction) || 0);
      target.healReductionRemainingMs = Math.max(target.healReductionRemainingMs || 0, 1800);
      target.healReductionDurationMs = Math.max(target.healReductionDurationMs || 0, 1800);
    }
    for (const effect of selectedAugmentEffects("skillMaxHpDamage")) {
      actor.augmentCorrosionHits ||= {};
      const previous = actor.augmentCorrosionHits[target.id] || 0;
      actor.augmentCorrosionHits[target.id] = previous + 1;
      const decay = previous > 0 ? Number(effect.repeatedTargetDecay) || 0.5 : 1;
      const ratio = (target.boss ? Number(effect.bossRatio) || 0 : Number(effect.targetMaxHpRatio) || 0) * decay;
      const damage = dealDamage(actor, target, target.maxHp * ratio, { fixed: true });
      if (damage > 0) effects.push(combatEffect(actor, target, "skill", { amount: damage, fixed: true, extra: true }));
    }
  }

  for (const effect of selectedAugmentEffects("traitSkillManaShare")) {
    if (actor.augmentManaShareReadyAt && actor.augmentManaShareReadyAt > combatElapsedMs) continue;
    const traits = unitTraits(actor);
    const targets = living(friends).filter((unit) => unit !== actor && unitTraits(unit).some((trait) => traits.includes(trait)));
    for (const target of targets) gainMana(target, Number(effect.manaAdd) || 0);
    if (targets.length) messages.push(`${actor.name} 전투 동기화: ${targets.length}명 마나 회복`);
    actor.augmentManaShareReadyAt = combatElapsedMs + (Number(effect.cooldownSeconds) || 1.5) * 1000;
  }

  const ampRelay = applyHighestSkillAmpRelay(actor, friends);
  effects.push(...ampRelay.effects);
  messages.push(...ampRelay.messages);

  return { effects, messages };
}

function castSkill(caster, allies, enemies) {
  caster.mana = 0;
  caster.status = "casting";
  if (caster.boss) {
    const bossAction = castBossSkill(caster, allies, enemies);
    if (bossAction) return withSkillName(caster, bossAction);
  }

  if (caster.skillId === "yuki_hwamusibilhong") return withSkillName(caster, castYukiSkill(caster, enemies));
  if (caster.skillId === "cathy_suture") return withSkillName(caster, castCathySkill(caster, enemies));
  if (caster.skillId === "rozzi_double_shot") return withSkillName(caster, castRozziSkill(caster, enemies));
  if (caster.skillId === "aya_double_burst") return withSkillName(caster, castAyaSkill(caster, enemies));
  if (caster.skillId === "shoichi_dagger_ride") return withSkillName(caster, castShoichiSkill(caster, enemies));
  if (caster.skillId === "leni_carrot_bazooka") return withSkillName(caster, castLeniSkill(caster, allies));
  if (caster.skillId === "hyunwoo_dogfight") return withSkillName(caster, castHyunwooSkill(caster));
  if (caster.skillId === "hyejin_samjae") return withSkillName(caster, castHyejinSkill(caster, enemies));
  if (caster.skillId === "hart_peacemaker") return withSkillName(caster, castHartSkill(caster, allies));
  if (caster.skillId === "li_dailin_suppression") return withSkillName(caster, castLiDailinSkill(caster, enemies));
  if (caster.skillId === "sissela_liberation") return withSkillName(caster, castSisselaSkill(caster, enemies));
  if (caster.skillId === "lenox_sharp_fang") return withSkillName(caster, castLenoxSkill(caster, enemies));
  if (caster.skillId === "mai_shawl_curtain") return withSkillName(caster, castMaiSkill(caster));
  if (caster.skillId === "elena_danse_macabre") return withSkillName(caster, castElenaSkill(caster, enemies));
  if (caster.skillId === "priya_earth_echo") return withSkillName(caster, castPriyaSkill(caster, allies, enemies));
  if (caster.skillId === "haze_rocket_launcher") return withSkillName(caster, castHazeSkill(caster, enemies));
  if (caster.skillId === "chloe_life_share") return withSkillName(caster, castChloeSkill(caster, allies));
  if (caster.skillId === "fiora_thrust_combo") return withSkillName(caster, castFioraSkill(caster, enemies));
  if (caster.skillId === "bernice_snare_trap") return withSkillName(caster, castBerniceSkill(caster, enemies));
  if (caster.skillId === "rio_kaeyumi") return withSkillName(caster, castRioSkill(caster, enemies));
  if (caster.skillId === "celine_plasma_bomb") return withSkillName(caster, castCelineSkill(caster, enemies));
  if (caster.skillId === "tia_perfect_drawing") return withSkillName(caster, castTiaSkill(caster, allies, enemies));
  if (caster.skillId === "xiukai_hot_taste") return withSkillName(caster, castXiukaiSkill(caster, allies));
  if (caster.skillId === "zahir_vayvayastra") return withSkillName(caster, castZahirVayvayastraSkill(caster, enemies));
  if (caster.skillId === "luke_obsession") return withSkillName(caster, castLukeSkill(caster, enemies));
  if (caster.skillId === "silvia_speed_gun") return withSkillName(caster, castSilviaSkill(caster, allies, enemies));
  if (caster.skillId === "bianca_blood_reign") return withSkillName(caster, castBiancaSkill(caster, enemies));
  if (caster.skillId === "alex_precision_bombardment") return withSkillName(caster, castAlexSkill(caster, enemies));
  if (caster.skillId === "sua_odyssey") return withSkillName(caster, castSuaSkill(caster, enemies));
  if (caster.skillId === "leon_submerge") return withSkillName(caster, castLeonSkill(caster, enemies));
  if (caster.skillId === "eleven_taunt") return withSkillName(caster, castElevenSkill(caster, enemies));
  if (caster.skillId === "nicky_guard_counter") return withSkillName(caster, castNickySkill(caster, enemies));
  if (caster.skillId === "camilo_duende") return withSkillName(caster, castCamiloSkill(caster, enemies));
  if (caster.skillId === "arda_shamash_scroll") return withSkillName(caster, castArdaSkill(caster, allies, enemies));
  if (caster.skillId === "echion_viper_fury") return withSkillName(caster, castEchionSkill(caster, enemies));
  if (caster.skillId === "adina_conjunction") return withSkillName(caster, castAdinaSkill(caster, enemies));
  if (caster.skillId === "karla_piercing_harpoon") return withSkillName(caster, castKarlaSkill(caster, enemies));
  if (caster.skillId === "abigail_horizon_cleave") return withSkillName(caster, castAbigailSkill(caster, enemies));
  if (caster.skillId === "kenneth_flame_crush") return withSkillName(caster, castKennethSkill(caster, enemies));
  if (caster.skillId === "charlotte_miracle") return withSkillName(caster, castCharlotteSkill(caster, allies));
  if (caster.skillId === "estelle_shield_defense") return withSkillName(caster, castEstelleSkill(caster, enemies));
  if (caster.skillId === "alonso_bouncing_shield") return withSkillName(caster, castAlonsoSkill(caster, enemies));
  if (caster.skillId === "mirka_repulse_barrier") return withSkillName(caster, castMirkaSkill(caster, enemies));
  if (caster.skillId === "bihyung_ttukttak") return withSkillName(caster, castBihyungSkill(caster, allies));
  if (caster.skillId === "garnet_iron_maiden") return withSkillName(caster, castGarnetSkill(caster, enemies));
  if (caster.skillId === "aiden_ride_lightning") return withSkillName(caster, castAidenSkill(caster, enemies));
  if (caster.skillId === "felix_spear_combo") return withSkillName(caster, castFelixSkill(caster, enemies));
  if (caster.skillId === "piolo_nunchaku_flurry") return withSkillName(caster, castPioloSkill(caster, enemies));
  if (caster.skillId === "debi_marlene_twins_rush") return withSkillName(caster, castDebiMarleneSkill(caster, enemies));
  if (caster.skillId === "theodore_energy_field") return withSkillName(caster, castTheodoreSkill(caster, allies));
  if (caster.skillId === "johann_sanctuary") return withSkillName(caster, castJohannSkill(caster, allies));
  if (caster.skillId === "emma_magic_hat") return withSkillName(caster, castEmmaSkill(caster, enemies));
  if (caster.skillId === "daniel_masterpiece") return withSkillName(caster, castDanielSkill(caster, enemies));
  if (caster.skillId === "xuelin_ten_thousand_swords") return withSkillName(caster, castXuelinSkill(caster, enemies));
  if (caster.skillId === "irem_cat_punch") return withSkillName(caster, castIremSkill(caster, enemies));
  if (caster.skillId === "jan_quadragon") return withSkillName(caster, castJanSkill(caster, enemies));
  if (caster.skillId === "coraline_mirror_image") return withSkillName(caster, castCoralineSkill(caster, enemies));

  const paint = detonatePaint(caster, enemies);
  const primary = castRoleSkill(caster, caster.role, allies, enemies);
  if (caster.skillId === "nadine_wolf_assault" && primary.effects.length) {
    const targetIds = primary.effects
      .filter((effect) => effect.to && effect.to !== caster.id)
      .map((effect) => effect.to);
    playSkillVisual?.({ type: "nadine-wolf", fromId: caster.id, targetIds });
  }
  if (!caster.fusedSkillRole) {
    return withSkillName(caster, paint ? { message: `${paint.message} / ${primary.message}`, effects: [...paint.effects, ...primary.effects] } : primary);
  }
  const fused = castRoleSkill(caster, caster.fusedSkillRole, allies, enemies, false);
  return withSkillName(caster, {
    message: `${paint ? `${paint.message} / ` : ""}${primary.message} / 운명의 가약: ${caster.fusedSkillName} 동시 발동 · ${fused.message}`,
    effects: [...(paint?.effects || []), ...primary.effects, ...fused.effects],
  });
}

function clearCombatStatus(units) {
  for (const unit of units) {
    if (unit) unit.status = "";
  }
}

function effectBudget() {
  const budget = balance.battle.effectBudget || {};
  const mobile = budget.mobileLowSpec || {};
  const maxWidth = mobile.maxWidth ?? 760;
  const lowSpec = typeof window !== "undefined"
    && (window.innerWidth <= maxWidth || window.matchMedia?.("(pointer: coarse)")?.matches);
  return lowSpec ? { ...budget, ...mobile } : budget;
}

function currentProjectileCount() {
  return document.querySelectorAll(".battlefield .projectile").length;
}

function importantEffect(effect) {
  const budget = effectBudget();
  if ((budget.alwaysShowTypes || []).includes(effect.type)) return true;
  if ((budget.alwaysShowKinds || []).includes(effect.kind)) return true;
  return Boolean(effect.value?.critical || effect.value?.fixed || effect.value?.paintExplosion);
}

function shouldRenderProjectile(effect, projectedCount) {
  if (importantEffect(effect)) return true;
  const budget = effectBudget();
  const max = budget.maxConcurrentProjectiles ?? 24;
  if (projectedCount < max) return true;
  return !(budget.dropProjectileTypesWhenBusy || []).includes(effect.type);
}

function shouldRenderDamageNumber(effect, renderedNumberCount, renderedMinorCount) {
  if (!effect.value?.amount || effect.value.amount <= 0) return false;
  if (importantEffect(effect)) return true;
  const budget = effectBudget();
  const maxNumbers = budget.maxDamageNumbersPerBatch ?? 12;
  if (renderedNumberCount >= maxNumbers) return false;
  const minorThreshold = budget.minorDamageThreshold ?? 45;
  const isMinor = effect.value.amount < minorThreshold || (budget.dropNumberTypesWhenBusy || []).includes(effect.type);
  if (!isMinor) return true;
  return renderedMinorCount < (budget.maxMinorDamageNumbersPerBatch ?? 6);
}

function playCombatEffects(effects) {
  if (!effects.length) return;
  const field = document.querySelector(".battlefield");
  if (!field) return;
  const fieldRect = field.getBoundingClientRect();
  const unitElementCache = new Map();
  const unitRectCache = new Map();
  const getUnitElement = (id) => {
    if (!id) return null;
    if (!unitElementCache.has(id)) {
      unitElementCache.set(id, document.querySelector(`[data-unit-id="${id}"]`));
    }
    return unitElementCache.get(id);
  };
  const getUnitRect = (id) => {
    if (!id) return null;
    if (!unitRectCache.has(id)) {
      unitRectCache.set(id, getUnitElement(id)?.getBoundingClientRect() || null);
    }
    return unitRectCache.get(id);
  };
  let projectedProjectiles = currentProjectileCount();
  let renderedNumberCount = 0;
  let renderedMinorCount = 0;
  for (const effect of effects) {
    if (effect.delayMs > 0) {
      window.setTimeout(() => playCombatEffects([{ ...effect, delayMs: 0 }]), effect.delayMs);
      continue;
    }
    const from = getUnitElement(effect.from);
    if (!from) continue;
    const fromRect = getUnitRect(effect.from);
    if (!fromRect) continue;
    if (effect.type === "shoichi-ride") {
      const dx = effect.value?.dx || 0;
      const dy = effect.value?.dy || 0;
      const cell = from.closest(".cell");
      const previousZIndex = cell?.style.zIndex || "";
      if (cell) cell.style.zIndex = "1800";

      const createAfterimage = (startX, startY, endX, endY, delay, facingReturn = false) => {
        const ghost = from.cloneNode(true);
        ghost.removeAttribute("data-unit-id");
        ghost.removeAttribute("draggable");
        ghost.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
        ghost.className = "unit shoichi-afterimage";
        ghost.style.left = `${fromRect.left - fieldRect.left}px`;
        ghost.style.top = `${fromRect.top - fieldRect.top}px`;
        ghost.style.width = `${fromRect.width}px`;
        ghost.style.height = `${fromRect.height}px`;
        field.append(ghost);
        const animation = ghost.animate([
          { transform: `translate(${startX}px, ${startY}px) scaleX(${facingReturn ? -1 : 1})`, opacity: 0 },
          { transform: `translate(${startX + (endX - startX) * 0.18}px, ${startY + (endY - startY) * 0.18}px) scaleX(${facingReturn ? -1 : 1})`, opacity: 0.58, offset: 0.18 },
          { transform: `translate(${startX + (endX - startX) * 0.72}px, ${startY + (endY - startY) * 0.72}px) scaleX(${facingReturn ? -1 : 1})`, opacity: 0.3, offset: 0.72 },
          { transform: `translate(${endX}px, ${endY}px) scaleX(${facingReturn ? -1 : 1})`, opacity: 0 },
        ], {
          duration: 300,
          delay,
          easing: "cubic-bezier(0.16, 0.84, 0.24, 1)",
          fill: "both",
        });
        animation.onfinish = () => ghost.remove();
        animation.oncancel = () => ghost.remove();
      };

      [0, 70].forEach((delay) => createAfterimage(0, 0, dx, dy, delay));
      [0, 70].forEach((delay) => createAfterimage(dx, dy, 0, 0, 560 + delay, true));
      from.classList.add("skill-traveling");
      const rideAnimation = from.animate([
        { transform: "translate(0, 0) scale(1)", filter: "brightness(1)", opacity: 1, offset: 0 },
        { transform: "translate(0, 0) scale(0.72)", filter: "brightness(2)", opacity: 0, offset: 0.08 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.72)`, filter: "brightness(2)", opacity: 0, offset: 0.09 },
        { transform: `translate(${dx}px, ${dy}px) scale(1)`, filter: "brightness(1.65)", opacity: 1, offset: 0.2 },
        { transform: `translate(${dx}px, ${dy}px) scale(1)`, filter: "brightness(1.25)", opacity: 1, offset: 0.7 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.72)`, filter: "brightness(2)", opacity: 0, offset: 0.76 },
        { transform: "translate(0, 0) scale(0.72)", filter: "brightness(2)", opacity: 0, offset: 0.77 },
        { transform: "translate(0, 0) scale(1)", filter: "brightness(1)", opacity: 1, offset: 1 },
      ], { duration: effect.value?.duration || 800, easing: "cubic-bezier(0.22, 0.72, 0.18, 1)" });
      const cleanupRide = () => {
        from.classList.remove("skill-traveling");
        if (cell) cell.style.zIndex = previousZIndex;
      };
      rideAnimation.onfinish = cleanupRide;
      rideAnimation.oncancel = cleanupRide;
      continue;
    }
    const to = getUnitElement(effect.to);
    if (!to) continue;
    const toRect = getUnitRect(effect.to);
    if (!toRect) continue;
    if (effect.type === "skill-name") {
      const label = document.createElement("span");
      label.className = "skill-name-float";
      label.textContent = effect.value?.label || "스킬";
      label.style.left = `${fromRect.left + fromRect.width / 2 - fieldRect.left}px`;
      label.style.top = `${fromRect.top - fieldRect.top - 20}px`;
      field.append(label);
      label.addEventListener("animationend", () => label.remove(), { once: true });
      continue;
    }
    const renderProjectile = shouldRenderProjectile(effect, projectedProjectiles);
    if (renderProjectile) projectedProjectiles += 1;
    const startX = fromRect.left + fromRect.width / 2 - fieldRect.left;
    const startY = fromRect.top + fromRect.height / 2 - fieldRect.top;
    const endX = toRect.left + toRect.width / 2 - fieldRect.left;
    const endY = toRect.top + toRect.height / 2 - fieldRect.top;
    const kind = effect.kind || effect.type;
    if (renderProjectile) {
      const projectile = document.createElement("span");
      projectile.className = `projectile ${effect.type} ${kind}`;
      const targetImpact = ["slash", "paint-mark", "paint-explosion"].includes(kind);
      const originX = targetImpact ? endX : startX;
      const originY = targetImpact ? endY : startY;
      projectile.style.left = `${originX}px`;
      projectile.style.top = `${originY}px`;
      projectile.style.setProperty("--dx", `${endX - startX}px`);
      projectile.style.setProperty("--dy", `${endY - startY}px`);
      projectile.style.setProperty("--angle", `${Math.atan2(endY - startY, endX - startX)}rad`);
      field.append(projectile);
      projectile.addEventListener("animationend", () => projectile.remove(), { once: true });
    }

    if (shouldRenderDamageNumber(effect, renderedNumberCount, renderedMinorCount)) {
      const number = document.createElement("span");
      const isPositive = effect.type === "heal" || effect.type === "shield";
      number.className = `damage-number ${isPositive ? "positive" : "damage"} ${effect.value.critical ? "critical" : ""} ${effect.value.extra ? "extra" : ""} ${effect.value.paintExplosion ? "paint-explosion" : ""} ${effect.value.fixed ? "fixed" : ""}`;
      number.textContent = `${isPositive ? "+" : ""}${Math.round(effect.value.amount).toLocaleString("ko-KR")}`;
      const extraOffset = effect.value.extra ? 18 : 0;
      number.style.left = `${toRect.left + toRect.width / 2 - fieldRect.left + extraOffset}px`;
      number.style.top = `${toRect.top + Math.max(0, toRect.height * 0.16) - fieldRect.top - extraOffset}px`;
      field.append(number);
      number.addEventListener("animationend", () => number.remove(), { once: true });
      renderedNumberCount += 1;
      if (!importantEffect(effect) && effect.value.amount < (effectBudget().minorDamageThreshold ?? 45)) renderedMinorCount += 1;
    }
  }
}

function advanceTimedStatuses(units, stepMs) {
  for (const unit of units) {
    if (unit.immuneRemainingMs > 0) unit.immuneRemainingMs = Math.max(0, unit.immuneRemainingMs - stepMs);
    if (unit.stunRemainingMs > 0) unit.stunRemainingMs = Math.max(0, unit.stunRemainingMs - stepMs);
    if (unit.actionLockRemainingMs > 0) unit.actionLockRemainingMs = Math.max(0, unit.actionLockRemainingMs - stepMs);
    if (unit.rootRemainingMs > 0) unit.rootRemainingMs = Math.max(0, unit.rootRemainingMs - stepMs);
    if (unit.healReductionRemainingMs > 0) unit.healReductionRemainingMs = Math.max(0, unit.healReductionRemainingMs - stepMs);
    if (unit.augmentAmpRelayRemainingMs > 0) {
      unit.augmentAmpRelayRemainingMs = Math.max(0, unit.augmentAmpRelayRemainingMs - stepMs);
      if (unit.augmentAmpRelayRemainingMs <= 0) {
        clearAmpRelay(unit);
        unit.augmentAmpRelayDurationMs = 0;
      }
    }
    if (unit.peaceRemainingMs > 0) unit.peaceRemainingMs = Math.max(0, unit.peaceRemainingMs - stepMs);
    if (unit.lifeShareRemainingMs > 0) unit.lifeShareRemainingMs = Math.max(0, unit.lifeShareRemainingMs - stepMs);
    if (unit.shawlCurtainRemainingMs > 0) unit.shawlCurtainRemainingMs = Math.max(0, unit.shawlCurtainRemainingMs - stepMs);
    if (unit.shieldDefenseRemainingMs > 0) unit.shieldDefenseRemainingMs = Math.max(0, unit.shieldDefenseRemainingMs - stepMs);
    if (unit.garnetIronMaiden?.remainingMs > 0) {
      unit.garnetIronMaiden.remainingMs = Math.max(0, unit.garnetIronMaiden.remainingMs - stepMs);
      if (unit.garnetIronMaiden.remainingMs <= 0) unit.garnetIronMaiden = null;
    }
    if (unit.healReductionRemainingMs <= 0) {
      unit.healReduction = 0;
      unit.healReductionDurationMs = 0;
    }
    if (unit.immuneRemainingMs <= 0) unit.immuneDurationMs = 0;
    if (unit.stunRemainingMs <= 0) unit.stunDurationMs = 0;
    if (unit.actionLockRemainingMs <= 0) unit.actionLockDurationMs = 0;
    if (unit.rootRemainingMs <= 0) unit.rootDurationMs = 0;
    if (unit.peaceRemainingMs <= 0) unit.peaceDurationMs = 0;
    if (unit.lifeShareRemainingMs <= 0) unit.lifeShareDurationMs = 0;
    if (unit.shawlCurtainRemainingMs <= 0) unit.shawlCurtainDurationMs = 0;
    if (unit.shieldDefenseRemainingMs <= 0) unit.shieldDefenseDurationMs = 0;
    const actionFrozen = unit.stunRemainingMs > 0 || unit.actionLockRemainingMs > 0;
    if (!actionFrozen) unit.actionCooldownMs = (unit.actionCooldownMs || 0) - stepMs;
    if (unit.immuneRemainingMs > 0) unit.status = "immune";
    else if (unit.stunRemainingMs > 0) unit.status = "stunned";
    else if (unit.actionLockRemainingMs > 0) unit.status = "channeling";
    else if (unit.rootRemainingMs > 0) unit.status = "rooted";
    else if (unit.shieldDefenseRemainingMs > 0) unit.status = "shielded";
    else if (unit.peaceRemainingMs > 0 || unit.lifeShareRemainingMs > 0) unit.status = "immune";
  }
}

function cooldownForAction(unit, action) {
  const movement = !action.effects?.length && /(이동|사거리 접근|대기)$/.test(action.message || "");
  return movement ? (balance.battle.moveIntervalMs ?? 250) : attackIntervalMs(unit);
}

function unlockCombatUi(message = "전투 상태를 복구했습니다. 다시 전투를 시작할 수 있습니다.") {
  document.body.classList.remove("fighting");
  state.busy = false;
  state.combatGrid = null;
  refs.battle.disabled = false;
  refs.battle.textContent = "전투 시작";
  refs.levelUp.disabled = state.level >= balance.player.maxLevel;
  refs.phase.textContent = message;
}

async function simulate() {
  if (state.busy) return;
  const unusedMaxLevelShopRerolls = Math.max(0, Number(state.shopOddsMaxLevelRerollsRemaining) || 0);
  if (unusedMaxLevelShopRerolls > 0) {
    const refund = unusedMaxLevelShopRerolls * 2;
    state.gold += refund;
    state.freeShopRerollsRemaining = Math.max(0, (Number(state.freeShopRerollsRemaining) || 0) - unusedMaxLevelShopRerolls);
    state.shopOddsMaxLevelRerollsRemaining = 0;
    addLog(`고급 손님: 사용하지 않은 최대 레벨 무료 리롤 ${unusedMaxLevelShopRerolls}회를 ${refund}크레딧으로 전환.`);
  }
  const boardAllies = boardUnits();
  if (!boardAllies.length) {
    addLog("보드에 캐릭터를 배치해야 합니다.");
    return;
  }
  const allies = boardAllies.slice();
  const battleRound = state.round;
  const originalBoard = state.board.slice();
  state.busy = true;
  state.selected = null;
  refs.phase.textContent = "전투 중: 양 팀이 자동으로 교전합니다.";
  document.body.classList.add("fighting");
  skillTimeline.clear();
  clearSkillVisuals?.();
  try {
  const combatSeed = state.nextCombatSeed || createCombatSeed(battleRound, state.debugMode ? "debug" : "pve");
  state.nextCombatSeed = "";
  state.lastCombatSeed = combatSeed;
  state.augmentInheritedThreeStar = false;
  combatRng = createSeededRng(combatSeed);
  const traitCounts = activeTraits();
  state.enemies = makeEnemies();
  allies.forEach((unit) => {
    const critBase = baseCritStats(unit);
    unit.combatBase = {
      maxHp: unit.maxHp,
      hp: unit.hp,
      atk: unit.atk,
      speed: unit.speed,
      skillAmp: unit.skillAmp,
      defense: unit.defense,
      healTargets: unit.healTargets ?? 1,
      critChance: critBase.critChance,
      critDamage: critBase.critDamage,
      skillCritChance: unit.skillCritChance ?? 0,
      skillCritDamage: unit.skillCritDamage ?? 1.5,
      openingCritMultiplier: critBase.openingCritMultiplier,
      lifeSteal: unit.lifeSteal ?? 0,
      damageReduction: unit.damageReduction ?? 0,
      manaGain: unit.manaGain ?? 1,
      skillTargets: unit.skillTargets ?? 1,
      rangeBonus: unit.rangeBonus ?? 0,
      maxMana: unit.maxMana ?? 100,
      maxManaReduction: unit.maxManaReduction ?? 0,
      extraAttackEvery: unit.extraAttackEvery ?? 0,
      extraAttackDamageRatio: unit.extraAttackDamageRatio ?? 1,
      basicAttackExtraTargets: unit.basicAttackExtraTargets ?? 0,
      healReductionOnHit: unit.healReductionOnHit ?? 0,
      healReductionTicks: unit.healReductionTicks ?? 0,
      backlineShieldTargets: unit.backlineShieldTargets ?? 0,
      backlineShieldRatio: unit.backlineShieldRatio ?? 0,
      frontlineShieldTargets: unit.frontlineShieldTargets ?? 0,
      frontlineShieldRatio: unit.frontlineShieldRatio ?? 0,
      pullBacklineTargets: unit.pullBacklineTargets ?? 0,
      openingMana: unit.openingMana ?? 0,
      manaOnHitBonus: unit.manaOnHitBonus ?? 0,
      supportAidHpRatio: unit.supportAidHpRatio ?? 0,
      supportAidDefense: unit.supportAidDefense ?? 0,
      supportAidDamageReduction: unit.supportAidDamageReduction ?? 0,
    };
    unit.critChance = critBase.critChance;
    unit.critDamage = critBase.critDamage;
    unit.skillCritChance = unit.skillCritChance ?? 0;
    unit.skillCritDamage = unit.skillCritDamage ?? 1.5;
    unit.openingCritMultiplier = critBase.openingCritMultiplier;
  });
  allies.forEach((unit) => prepareCombatUnit(unit, "ally", traitCounts));
  const absorptions = combatAbsorptions(allies);
  for (const { rule, host, target } of absorptions) {
    target.status = "suppressed";
    render();
    playSkillVisual?.({ type: "fate-absorb", fromId: host.id, targetIds: [target.id] });
    addLog(`${rule.name}: ${target.name} 제압 / ${host.name}의 쇠사슬 흡수 시작.`);
    await sleep(980);
    applyAbsorbedStats(host, target, rule.effect);
    host.mana = Math.min(unitMaxMana(host), host.openingMana || 0);
    target.hiddenAbsorbed = true;
    target.status = "";
    const targetIndex = allies.indexOf(target);
    if (targetIndex >= 0) allies.splice(targetIndex, 1);
    addLog(`${rule.name} 발동: ${host.name}이 ${target.name}를 흡수했습니다.`);
  }
  prepareDefeatEffects(allies);
  prepareKillEffects(allies);
  const openingHiddenEffects = prepareOpeningEffects(allies);
  for (const rule of openingHiddenEffects) addLog(`${rule.name} 발동.`);
  state.pendingHiddenEffects = [];
  state.enemies.filter(Boolean).forEach((unit) => prepareCombatUnit(unit, "enemy"));
  state.combatGrid = Array(combatGridSize()).fill(null);
  state.enemies.forEach((unit, index) => {
    if (unit) state.combatGrid[index] = unit;
  });
  state.board.forEach((unit, index) => {
    if (unit && !unit.hiddenAbsorbed) state.combatGrid[balance.battle.enemySlots + index] = unit;
  });
  const hiddenClones = summonHiddenClones(allies);
  if (hiddenClones.length) {
    addLog(`둘이서 하나! 발동: ${hiddenClones.map(({ owner }) => owner.name).join(", ")} 분신 소환.`);
  }
  const openingAugmentEffects = applyOpeningAugments(allies);
  beginCombatMetrics(allies);
  const hasTacticalPull = allies.some((unit) => unit.pullBacklineTargets > 0);
  if (hasTacticalPull) {
    renderCombatFrame();
    await sleep(220);
  }
  const openingUtilities = applyOpeningTeamUtilities(allies, state.enemies);
  if (openingUtilities.pulledUnits) {
    renderCombatFrame();
    await sleep(380);
  }
  const diverCount = placeBacklineDivers([...allies, ...state.enemies.filter(Boolean)]);
  const boss = living(state.enemies).find((unit) => unit.boss);
  addLog(boss ? `보스전 시작: ${boss.name} 출현!` : `전투 시작: 아군 ${allies.length}명 vs 야생 실험체 ${living(state.enemies).length}명`);
  if (openingUtilities.backlineShielded) addLog(`중장비 발동: 후열 ${openingUtilities.backlineShielded}명 보호막.`);
  if (openingUtilities.frontlineShielded) addLog(`예술 발동: 전열 ${openingUtilities.frontlineShielded}명 보호막.`);
  if (openingUtilities.pulledUnits) {
    addLog(`전술 발동: 적 후열 ${openingUtilities.pulledUnits}명 아군 진영으로 배달 / ${openingUtilities.focusTarget.name} 집중 공격.`);
  }
  if (diverCount) addLog(`기습 전개: 기습형 ${diverCount}명이 후열로 진입.`);
  render();
  if (openingAugmentEffects.length) playCombatEffects(openingAugmentEffects);

  const simulationStepMs = balance.battle.simulationStepMs ?? 50;
  const renderIntervalMs = balance.battle.renderIntervalMs ?? 100;
  const maxCombatMs = balance.battle.maxCombatMs ?? 30000;
  let nextRenderAt = 0;
  let nextLogAt = 0;
  let lastProgressAt = 0;
  const combatLogBuffer = [];
  const flushCombatLogs = () => {
    if (!combatLogBuffer.length) return;
    addLog(combatLogBuffer.splice(0, 3).join(" / "));
  };
  combatElapsedMs = 0;
  while (living(allies).length && living(state.enemies).length && combatElapsedMs < maxCombatMs) {
    await sleep(simulationStepMs);
    combatElapsedMs += simulationStepMs;
    const combatants = [...living(allies), ...living(state.enemies)];
    clearCombatStatus(combatants);
    advanceTimedStatuses(combatants, simulationStepMs);
    const actors = combatants.sort((a, b) => (a.actionCooldownMs || 0) - (b.actionCooldownMs || 0) || b.speed - a.speed);
    const tickLogs = [];
    const effects = [];
    let actedThisStep = false;

    for (const actor of actors) {
      if (actor.hp <= 0) continue;
      if (actor.trainingDummy) continue;
      if (actor.stunRemainingMs > 0 || actor.actionLockRemainingMs > 0 || actor.actionCooldownMs > 0) continue;
      const friends = actor.side === "ally" ? allies : state.enemies;
      const foes = actor.side === "ally" ? state.enemies : allies;
      if (!living(foes).length) break;
      let action;
      try {
        action = actor.mana >= unitMaxMana(actor) ? castSkill(actor, friends, foes) : basicAttack(actor, foes);
      } catch (error) {
        console.error("[rumia-combat-action]", actor?.name, error);
        addLog(`전투 행동 오류: ${actor.name} 행동을 건너뜁니다.`, { force: true });
        actor.mana = 0;
        actor.actionCooldownMs = balance.battle.moveIntervalMs ?? 500;
        tickLogs.push(`${actor.name} 행동 오류: 이번 행동을 건너뜁니다.`);
        continue;
      }
      actedThisStep = true;
      const overdueMs = Math.min(0, actor.actionCooldownMs || 0);
      actor.actionCooldownMs = Math.max(0, cooldownForAction(actor, action) + overdueMs);
      const augmentResult = resolveAugmentActionEffects(actor, friends, foes, action);
      if (action.message) tickLogs.push(action.message);
      tickLogs.push(...augmentResult.messages);
      effects.push(...action.effects);
      effects.push(...augmentResult.effects);
      if (state.pendingHiddenEffects?.length) effects.push(...state.pendingHiddenEffects.splice(0));
    }

    const timelineResult = resolveSkillTimelineEvents(combatElapsedMs);
    tickLogs.push(...timelineResult.messages);
    effects.push(...timelineResult.effects);
    effects.push(...applyTimedAugments(allies));
    const lastSurvivorEffect = applyLastSurvivorAugment(allies);
    if (lastSurvivorEffect) effects.push(lastSurvivorEffect);
    if (actedThisStep || tickLogs.length || effects.length || timelineResult.messages.length || timelineResult.effects.length) {
      lastProgressAt = combatElapsedMs;
    } else if (combatElapsedMs - lastProgressAt > 3000) {
      addLog("전투 진행 정체 감지: 남은 예약/상태를 정리하고 라운드를 종료합니다.", { force: true });
      addLog("전투 진행 정체 감지: 남은 예약/상태를 정리하고 라운드를 종료합니다.");
      break;
    }

    if (tickLogs.length) combatLogBuffer.push(tickLogs.slice(0, 3).join(" / "));
    if (combatElapsedMs >= nextLogAt) {
      flushCombatLogs();
      nextLogAt = combatElapsedMs + 250;
    }
    const shouldRender = combatElapsedMs >= nextRenderAt;
    if (shouldRender) {
      refs.phase.textContent = `전투 중: ${(combatElapsedMs / 1000).toFixed(1)}초 · 아군 ${living(allies).length}명 / 적 ${living(state.enemies).length}명`;
      renderCombatFrame();
      nextRenderAt = combatElapsedMs + renderIntervalMs;
    }
    playCombatEffects(effects);
  }
  flushCombatLogs();
  finishCombatMetrics();

  const win = living(allies).length > 0 && living(state.enemies).length === 0;
  const wasBossRound = isBossRound();
  const survivors = win ? living(allies).length : living(state.enemies).length;
  const frontlineSurvivalGold = win ? selectedAugmentEffects("frontlineSurvivalGold").reduce((sum, effect) => {
    const survivorsInFront = living(allies).filter((unit) => {
      const slot = unitSlot(unit);
      return slot && slot.y <= allyStartRow() + 1;
    }).length;
    return sum + Math.min(Number(effect.maxGold) || 0, survivorsInFront * (Number(effect.goldPerSurvivor) || 0));
  }, 0) : 0;
  document.body.classList.remove("fighting");
  state.busy = false;
  state.round += 1;
  state.combatGrid = null;
  skillTimeline.clear();
  addXp(balance.player.combatXp, "전투 보상");
  for (const unit of boardAllies) {
    if (unit.combatBase) {
      unit.maxHp = unit.combatBase.maxHp;
      unit.atk = unit.combatBase.atk;
      unit.speed = unit.combatBase.speed;
      unit.skillAmp = unit.combatBase.skillAmp;
      unit.defense = unit.combatBase.defense;
      unit.healTargets = unit.combatBase.healTargets;
      unit.critChance = unit.combatBase.critChance;
      unit.critDamage = unit.combatBase.critDamage;
      unit.skillCritChance = unit.combatBase.skillCritChance;
      unit.skillCritDamage = unit.combatBase.skillCritDamage;
      unit.openingCritMultiplier = unit.combatBase.openingCritMultiplier;
      unit.lifeSteal = unit.combatBase.lifeSteal;
      unit.damageReduction = unit.combatBase.damageReduction;
      unit.manaGain = unit.combatBase.manaGain;
      unit.skillTargets = unit.combatBase.skillTargets;
      unit.rangeBonus = unit.combatBase.rangeBonus;
      unit.maxMana = unit.combatBase.maxMana;
      unit.maxManaReduction = unit.combatBase.maxManaReduction;
      unit.extraAttackEvery = unit.combatBase.extraAttackEvery;
      unit.extraAttackDamageRatio = unit.combatBase.extraAttackDamageRatio;
      unit.basicAttackExtraTargets = unit.combatBase.basicAttackExtraTargets;
      unit.healReductionOnHit = unit.combatBase.healReductionOnHit;
      unit.healReductionTicks = unit.combatBase.healReductionTicks;
      unit.backlineShieldTargets = unit.combatBase.backlineShieldTargets;
      unit.backlineShieldRatio = unit.combatBase.backlineShieldRatio;
      unit.frontlineShieldTargets = unit.combatBase.frontlineShieldTargets;
      unit.frontlineShieldRatio = unit.combatBase.frontlineShieldRatio;
      unit.pullBacklineTargets = unit.combatBase.pullBacklineTargets;
      unit.openingMana = unit.combatBase.openingMana;
      unit.manaOnHitBonus = unit.combatBase.manaOnHitBonus;
      unit.supportAidHpRatio = unit.combatBase.supportAidHpRatio;
      unit.supportAidDefense = unit.combatBase.supportAidDefense;
      unit.supportAidDamageReduction = unit.combatBase.supportAidDamageReduction;
      delete unit.combatBase;
    }
    delete unit._skillCriticalQueue;
    delete unit.supportAidBuff;
    unit.hp = unit.maxHp;
    unit.mana = 0;
    unit.status = "";
    unit.stunRemainingMs = 0;
    unit.stunDurationMs = 0;
    unit.actionLockRemainingMs = 0;
    unit.actionLockDurationMs = 0;
    unit.rootRemainingMs = 0;
    unit.rootDurationMs = 0;
    unit.peaceRemainingMs = 0;
    unit.peaceDurationMs = 0;
    unit.lifeShareRemainingMs = 0;
    unit.lifeShareDurationMs = 0;
    unit.lifeSharePairId = null;
    unit.lifeSharePartnerId = null;
    unit.shawlCurtainRemainingMs = 0;
    unit.shawlCurtainDurationMs = 0;
    unit.shieldDefenseRemainingMs = 0;
    unit.shieldDefenseDurationMs = 0;
    unit.immuneRemainingMs = 0;
    unit.immuneDurationMs = 0;
    unit.actionCooldownMs = 0;
    unit.shield = 0;
    unit.leniShield = 0;
    unit.healReduction = 0;
    unit.healReductionRemainingMs = 0;
    unit.healReductionDurationMs = 0;
    unit.basicAttackCount = 0;
    unit.samjaeMarks = 0;
    unit.flameAttacks = 0;
    unit.mealTimeCasts = 0;
    unit.bihyungEnhancedAttacks = 0;
    unit.garnetIronMaiden = null;
    unit.killContributors = null;
    unit.biancaReignUsed = false;
    unit.focusTargetId = null;
    unit.forcedFocusTargetId = null;
    unit.tacticalTarget = false;
    unit.hiddenAbsorbed = false;
    unit.hiddenDefeatHandled = false;
    delete unit.hiddenDefeatEffects;
    delete unit.hiddenKillEffects;
    delete unit.hiddenFeastEffects;
    delete unit.hiddenPaintMarker;
    delete unit.hiddenPaintDetonator;
    delete unit.hiddenKillBlink;
    delete unit.hiddenTacticalGrowth;
    delete unit.hiddenKillGrowth;
    delete unit.hiddenCloneSummon;
    delete unit.hiddenExclusiveRescue;
    delete unit.hiddenExclusivePartnerId;
    delete unit.hiddenExclusiveRescueState;
    delete unit.killContributors;
    delete unit.fusedSkillRole;
    delete unit.fusedSkillName;
    unit.hasPickedOpeningTarget = false;
    unit.hasUsedOpeningCrit = false;
    delete unit.augmentBasicAttackStacks;
    delete unit.augmentChainLightningReadyAt;
    delete unit.augmentCorrosionHits;
    delete unit.augmentCurseStacks;
    delete unit.augmentAmpRelayBonus;
    delete unit.augmentAmpRelayRemainingMs;
    delete unit.augmentAmpRelayDurationMs;
    delete unit.augmentDamageTakenAdd;
    delete unit.augmentFirstAttackDone;
    delete unit.augmentKillCombatStacks;
    delete unit.augmentLastSurvivorApplied;
    delete unit.augmentLenoxSuppressSeconds;
    delete unit.augmentManaShareReadyAt;
    delete unit.augmentSameTargetStacks;
    delete unit.augmentThreeStarRevived;
    delete unit.augmentWarmupStacks;
    delete unit.lukeCleaningBoost;
    delete unit.sevenElixirUsed;
    delete unit.theodoreAssistReadyAt;
    for (const key of Object.keys(unit)) {
      if (key.startsWith("augmentLowHp")) delete unit[key];
    }
  }
  state.board = originalBoard;
  clearSkillVisuals?.();
  state.pendingHiddenEffects = [];
  state.augmentInheritedThreeStar = false;
  state.temporaryBoosts = {
    hp: 0,
    atk: 0,
    skillAmp: 0,
  };
  applyPandoraBench();
  if (win) {
    grantRoundIncome(true);
    if (frontlineSurvivalGold > 0) {
      state.gold += frontlineSurvivalGold;
      addLog(`전방 보급 증강: ${frontlineSurvivalGold}크레딧 획득.`);
    }
    addLog(`승리! 생존 ${survivors}명.`);
    refs.phase.textContent = "승리했습니다. 다음 전투를 준비하세요.";
    if (wasBossRound) offerAugments?.(battleRound);
    if (wasBossRound && battleRound === balance.battle.bossInterval) offerPvpEntry?.(battleRound, originalBoard);
  } else {
    const previousHp = state.hp;
    const damage = wasBossRound ? state.hp : Math.min(20, survivorStarDamage(state.enemies));
    state.hp = Math.max(0, state.hp - damage);
    if (previousHp > 0 && state.hp === 0) captureDeathRecord(battleRound, originalBoard);
    grantRoundIncome(false);
    addLog(`패배. 남은 적 ${survivors}명. 체력 ${damage} 감소.`);
    refs.phase.textContent = state.hp ? "패배했습니다. 조합을 재정비하세요." : "체력이 0이 되었습니다. 랭킹을 등록할 수 있습니다.";
  }
  state.lastCombatResult = {
    seed: state.lastCombatSeed,
    round: battleRound,
    win,
    survivors,
    hp: state.hp,
    allyMetrics: (state.lastCombatMetrics || [])
      .map((metric) => ({
        name: metric.name,
        damageDone: Math.round(metric.damageDone || 0),
        damageTaken: Math.round(metric.damageTaken || 0),
        healingDone: Math.round(metric.healingDone || 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    remainingEnemies: living(state.enemies)
      .map((unit) => ({ name: unit.name, hp: Math.round(unit.hp), mana: Math.round(unit.mana || 0) }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.hp - b.hp),
  };
  state.enemies = [];
  if (state.shopLocked) {
    addLog("상점 잠금 유지: 현재 상점을 보존합니다.");
    render();
  } else {
    rollShop();
  }
  return state.lastCombatResult;
  } catch (error) {
    console.error("[rumia-combat-stall-guard]", error);
    unlockCombatUi(`전투 처리 오류 감지: ${error?.message || error || "unknown"} / 전투 상태를 복구했습니다.`);
    addLog(`전투 처리 오류 감지: ${error?.message || error || "unknown"} / 전투 상태를 복구했습니다.`, { force: true });
    addLog("전투 처리 오류 감지: 전투 상태를 복구했습니다.");
    document.body.classList.remove("fighting");
    state.busy = false;
    state.combatGrid = null;
    state.enemies = [];
    state.board = originalBoard;
    state.pendingHiddenEffects = [];
    skillTimeline.clear();
    try {
      clearSkillVisuals?.();
    } catch (clearError) {
      console.warn("[rumia-combat-recover-clear]", clearError);
    }
    for (const unit of boardAllies) {
      if (!unit) continue;
      if (unit.combatBase) {
        unit.maxHp = unit.combatBase.maxHp;
        unit.atk = unit.combatBase.atk;
        unit.speed = unit.combatBase.speed;
        unit.skillAmp = unit.combatBase.skillAmp;
        unit.defense = unit.combatBase.defense;
        unit.damageReduction = unit.combatBase.damageReduction;
        unit.supportAidHpRatio = unit.combatBase.supportAidHpRatio;
        unit.supportAidDefense = unit.combatBase.supportAidDefense;
        unit.supportAidDamageReduction = unit.combatBase.supportAidDamageReduction;
        delete unit.combatBase;
      }
      delete unit.supportAidBuff;
      unit.hp = unit.maxHp;
      unit.mana = 0;
      unit.status = "";
      unit.actionCooldownMs = 0;
      unit.hiddenAbsorbed = false;
    }
    refs.phase.textContent = "전투 처리 오류가 발생해 상태를 복구했습니다. 다시 전투를 시작할 수 있습니다.";
    render();
  }
}


  return {
    currentBossInfo,
    isBossRound,
    previewBossEnemies,
    simulate,
  };
}

