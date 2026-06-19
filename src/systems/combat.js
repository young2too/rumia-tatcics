import { tierStatMultiplier } from "../core/tier.js";

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
    render,
    rollShop,
    addXp,
    grantRoundIncome,
    captureDeathRecord,
    sleep,
  } = context;

function enemyDifficultyStage() {
  return Math.floor((state.round - 1) / balance.battle.bossInterval);
}

function rollEnemyTier(stage) {
  const oddsTable = balance.battle.enemyTierOddsByStage || [[100, 0, 0]];
  const odds = oddsTable[Math.min(stage, oddsTable.length - 1)] || oddsTable[0];
  const roll = Math.random() * 100;
  let sum = 0;
  for (let i = 0; i < odds.length; i++) {
    sum += odds[i];
    if (roll < sum) return i + 1;
  }
  return 1;
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
    id: crypto.randomUUID(),
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
  return unit;
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
    id: crypto.randomUUID(),
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
    immuneTicks: 0,
  };
}

function weightedSample(items, weightKey = "weight") {
  const total = items.reduce((sum, item) => sum + Math.max(0, item[weightKey] ?? 1), 0);
  if (total <= 0) return sample(items);
  let roll = Math.random() * total;
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
    if (available.length) return sample(available);
  }
  return sample(candidates);
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
    return (priority[a] ?? 9) - (priority[b] ?? 9) || Math.random() - 0.5;
  });
}

function makeEnemies() {
  const stage = enemyDifficultyStage();
  const slots = Array(balance.battle.enemySlots).fill(null);
  if (isBossRound()) {
    slots[12] = makeBossUnit(Math.max(1, state.round / balance.battle.bossInterval));
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
  const hpScale = Math.min(
    balance.battle.enemyHpScaleCap,
    balance.battle.enemyBaseHpScale + state.round * balance.battle.enemyHpRoundGrowth + stage * balance.battle.enemyStageHpGrowth
  );
  const atkScale = Math.min(
    balance.battle.enemyAtkScaleCap,
    balance.battle.enemyBaseAtkScale + state.round * balance.battle.enemyAtkRoundGrowth + stage * balance.battle.enemyStageAtkGrowth
  );
  const groups = enemyGroupsForCount(count);
  const picked = [];
  const countByName = {};
  Array.from({ length: count }, (_, i) => {
    const base = chooseEnemyBase(candidates, groups[i] || "dealer", picked, countByName, count);
    const unit = makeEnemyUnit(base, rollEnemyTier(stage), stage, hpScale, atkScale);
    picked.push(base);
    countByName[base.name] = (countByName[base.name] || 0) + 1;
    slots[balance.battle.enemySpawnOrder[i] ?? i] = unit;
  });
  return slots;
}

function previewBossEnemies() {
  const slots = Array(balance.battle.enemySlots).fill(null);
  if (isBossRound()) {
    slots[12] = makeBossUnit(Math.max(1, state.round / balance.battle.bossInterval));
    slots[12].side = "enemy";
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
  return ["사격", "술법", "지원"].includes(unit.role) ? balance.battle.rangedRange : balance.battle.meleeRange;
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
  const yOffset = unit.side === "enemy" ? 0 : 2;
  return { arr, index, x: index % cols, y: yOffset + Math.floor(index / cols) };
}

function hexCell(x, y) {
  return { q: x - Math.floor(y / 2), r: y };
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
    if (x < 0 || x >= cols || y < 0 || y > 5) return -1;
    return y * cols + x;
  }
  if (side === "enemy") {
    if (x < 0 || x >= cols || y < 0 || y > 1) return -1;
    return y * cols + x;
  }
  if (x < 0 || x >= cols || y < 2 || y > 5) return -1;
  return (y - 2) * cols + x;
}

function distanceBetween(a, b) {
  const from = unitSlot(a);
  const to = unitSlot(b);
  if (!from || !to) return 99;
  return hexDistanceSlots(from, to);
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
  return unit.side === "ally" ? [0, 1] : [5, 4];
}

function enemyBacklineRows(attacker) {
  return attacker.side === "ally" ? [0, 1] : [5, 4];
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
    for (const step of hexNeighborSteps(targetSlot.y)) {
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
  for (const unit of units.filter(isBacklineDiver)) {
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
  return attacker.side === "enemy" ? slot.y : balance.battle.columns - slot.y;
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

    const nextSlots = hexNeighborSteps(current.y)
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

function hexNeighborSteps(y) {
  return y % 2 === 0
    ? [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: -1 },
        { x: -1, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 1 },
      ]
    : [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 1, y: -1 },
        { x: 0, y: -1 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
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

function applyStun(unit, ticks) {
  const duration = Math.max(unit.stunTicks || 0, ticks);
  unit.stunTicks = duration;
  unit.stunMaxTicks = Math.max(unit.stunMaxTicks || 0, duration);
  unit.stunDisplayTicks = duration;
  unit.stunDisplayMaxTicks = Math.max(unit.stunDisplayMaxTicks || 0, duration);
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
    const options = hexNeighborSteps(from.y)
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
  for (let y = 0; y < 6; y++) {
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
    id: crypto.randomUUID(),
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
    immuneTicks: 0,
  };
  prepareCombatUnit(omega, caster.side);
  state.enemies[index] = omega;
  state.combatGrid[index] = omega;
  caster.summonCount += 1;
  return omega;
}

function prepareCombatUnit(unit, side, counts = {}) {
  const stats = side === "ally" ? applySynergy(unit, counts) : {
    hp: unit.maxHp,
    atk: unit.atk,
    speed: unit.speed,
    skillAmp: unit.skillAmp,
    defense: unit.defense,
    heal: 1,
    critChance: unit.critChance ?? 0,
    critDamage: unit.critDamage ?? 1.5,
    openingCritMultiplier: unit.openingCritMultiplier ?? 1,
    lifeSteal: unit.lifeSteal ?? 0,
    damageReduction: unit.damageReduction ?? 0,
    manaGain: unit.manaGain ?? 1,
  };
  if (side === "ally") {
    const boosts = state.temporaryBoosts || {};
    stats.hp *= 1 + (boosts.hp || 0);
    stats.atk *= 1 + (boosts.atk || 0);
    stats.skillAmp *= 1 + (boosts.skillAmp || 0);
  }
  unit.side = side;
  unit.mana = 0;
  unit.maxHp = Math.round(stats.hp);
  unit.hp = unit.maxHp;
  unit.atk = Math.round(stats.atk);
  unit.speed = stats.speed;
  unit.skillAmp = Math.round(stats.skillAmp);
  unit.defense = Math.round(stats.defense);
  unit.healPower = stats.heal;
  unit.critChance = Math.max(0, Math.min(1, stats.critChance ?? 0));
  unit.critDamage = Math.max(1, stats.critDamage ?? 1.5);
  unit.openingCritMultiplier = Math.max(1, stats.openingCritMultiplier ?? 1);
  unit.lifeSteal = Math.max(0, stats.lifeSteal ?? 0);
  unit.damageReduction = Math.max(0, Math.min(0.8, stats.damageReduction ?? 0));
  unit.manaGain = Math.max(0.1, stats.manaGain ?? 1);
  unit.range = unitAttackRange(unit);
  unit.status = "";
  unit.stunTicks = 0;
  unit.stunMaxTicks = 0;
  unit.immuneTicks = unit.immuneTicks || 0;
  unit.immuneMaxTicks = unit.immuneTicks || 0;
  unit.focusTargetId = null;
  unit.hasPickedOpeningTarget = false;
  unit.hasUsedOpeningCrit = false;
  return unit;
}

function pickTarget(attacker, enemies) {
  const alive = living(enemies);
  if (!alive.length) return null;

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

function dealDamage(source, target, amount) {
  const damageFloor = Math.max(3, Math.round(amount * 0.12));
  const reducedAmount = amount * (1 - Math.max(0, Math.min(0.8, target.damageReduction || 0)));
  const damage = Math.max(damageFloor, Math.round(reducedAmount - target.defense * 0.45));
  const wickelinePattern = bossPatterns.wickeline;
  if (target.pattern === "wickeline" && target.immuneTicks > 0) {
    target.status = "immune";
    return 0;
  }
  if (target.pattern === "wickeline" && !target.immuneUsed && (target.hp - damage) / target.maxHp <= wickelinePattern.immuneHpRatio) {
    target.immuneUsed = true;
    target.immuneTicks = wickelinePattern.immuneTicks;
    target.immuneMaxTicks = wickelinePattern.immuneTicks;
    target.immuneDisplayTicks = wickelinePattern.immuneTicks;
    target.immuneDisplayMaxTicks = wickelinePattern.immuneTicks;
    target.status = "immune";
    return 0;
  }
  target.hp = Math.max(0, target.hp - damage);
  const manaFromHit = Math.min(balance.battle.manaPerHit, Math.max(3, Math.round(damage * 0.32)));
  const targetManaGain = target.manaGain || 1;
  target.mana = Math.min(100, (target.mana || 0) + Math.round(manaFromHit * targetManaGain));
  target.status = target.hp > 0 ? "hit" : "dead";
  if (target.hp <= 0) removeDeadUnits([target]);
  return damage;
}

function weaponEffectKind(unit, type = "attack") {
  if (type === "heal" || type === "shield") return type;
  if (type === "skill" && ["술법", "지원"].includes(unit.role)) return "magic";
  if (["권총", "돌격소총", "저격총"].includes(unit.weapon)) return "bullet";
  if (["활", "석궁"].includes(unit.weapon)) return "arrow";
  if (["투척", "암기", "아르카나"].includes(unit.weapon)) return "magic";
  return "slash";
}

function combatEffect(from, to, type = "attack", value = null) {
  return { from: from.id, to: to.id, type, weapon: from.weapon, kind: weaponEffectKind(from, type), value };
}

function applyLifeSteal(attacker, damage) {
  if (!attacker.lifeSteal || damage <= 0 || attacker.hp <= 0) return 0;
  const heal = Math.max(1, Math.round(damage * attacker.lifeSteal));
  attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
  return heal;
}

function basicAttackDamage(attacker, baseAmount) {
  if (!attacker.hasUsedOpeningCrit && attacker.openingCritMultiplier > 1) {
    attacker.hasUsedOpeningCrit = true;
    return { amount: baseAmount * attacker.openingCritMultiplier, critical: true, opening: true };
  }
  if (Math.random() < (attacker.critChance || 0)) {
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
  const variance = 0.86 + Math.random() * 0.28;
  if (attacker.pattern === "nadja") {
    const nadjaPattern = bossPatterns.nadja;
    const targets = unitsInRange(attacker, enemies, unitAttackRange(attacker))
      .sort((a, b) => distanceBetween(attacker, a) - distanceBetween(attacker, b))
      .slice(0, nadjaPattern.basicTargetCount);
    let total = 0;
    const hit = basicAttackDamage(attacker, attacker.atk * attacker.speed * variance * balance.battle.basicDamageMultiplier);
    const damages = targets.map((unit) => {
      const damage = dealDamage(attacker, unit, hit.amount);
      total += damage;
      return { unit, damage };
    });
    attacker.mana = Math.min(100, attacker.mana + Math.round(balance.battle.manaPerAttack * (attacker.manaGain || 1)));
    attacker.status = "attacking";
    return {
      message: `${attacker.name} basic cleave ${total}${hit.critical ? " 치명" : ""}`,
      effects: damages.map(({ unit, damage }) => combatEffect(attacker, unit, "attack", { amount: damage, critical: hit.critical })),
    };
  }
  const hit = basicAttackDamage(attacker, attacker.atk * attacker.speed * variance * balance.battle.basicDamageMultiplier);
  const damage = dealDamage(attacker, target, hit.amount);
  const lifeStealHeal = applyLifeSteal(attacker, damage);
  attacker.mana = Math.min(100, attacker.mana + Math.round(balance.battle.manaPerAttack * (attacker.manaGain || 1)));
  attacker.status = "attacking";
  const effects = [combatEffect(attacker, target, "attack", { amount: damage, critical: hit.critical })];
  if (lifeStealHeal) effects.push(combatEffect(attacker, attacker, "heal", { amount: lifeStealHeal }));
  return {
    message: `${attacker.name} → ${target.name} ${damage} 피해${hit.critical ? " (치명)" : ""}`,
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

function castSkill(caster, allies, enemies) {
  caster.mana = 0;
  caster.status = "casting";
  const roleSkills = balance.battle.roleSkills || {};

  if (caster.boss) {
    const bossAction = castBossSkill(caster, allies, enemies);
    if (bossAction) return bossAction;
  }

  if (caster.role === "지원") {
    const targets = living(allies)
      .slice()
      .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))
      .slice(0, roleSkills.supportHealTargets ?? 2);
    const heal = Math.round((caster.skillAmp * (roleSkills.supportHealSkillAmp ?? 0.72) + (roleSkills.supportHealFlat ?? 10)) * caster.healPower);
    for (const target of targets) {
      target.hp = Math.min(target.maxHp, target.hp + heal);
      target.status = "healed";
    }
    return {
      message: `${caster.name} 스킬: ${targets.length}명 ${heal} 회복`,
      effects: targets.map((target) => combatEffect(caster, target, "heal", { amount: heal })),
    };
  }

  if (caster.role === "술법") {
    const targets = living(enemies);
    let total = 0;
    const effects = [];
    for (const target of targets) {
      const damage = dealDamage(caster, target, caster.skillAmp * 0.75 + 10);
      total += damage;
      effects.push(combatEffect(caster, target, "skill", { amount: damage }));
    }
    return {
      message: `${caster.name} 스킬: 광역 ${total} 피해`,
      effects,
    };
  }

  if (caster.role === "방패") {
    const rawHeal = Math.round(
      caster.skillAmp * (roleSkills.shieldHealSkillAmp ?? 0.35) +
      caster.defense * (roleSkills.shieldHealDefense ?? 0.55) +
      (roleSkills.shieldHealFlat ?? 5)
    );
    const heal = rawHeal;
    caster.hp = Math.min(caster.maxHp, caster.hp + heal);
    caster.status = "healed";
    return {
      message: `${caster.name} 스킬: ${heal} 보호막`,
      effects: [combatEffect(caster, caster, "shield", { amount: heal })],
    };
  }

  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  if (distanceBetween(caster, target) > Math.max(unitAttackRange(caster), 2)) {
    const moved = moveToward(caster, target);
    caster.mana = 100;
    return {
      message: moved ? `${caster.name} 스킬 사거리 접근` : `${caster.name} 대기`,
      effects: [],
    };
  }
  const scale = caster.role === "\uC554\uC0B4"
    ? (roleSkills.assassinSkillScale ?? 2.2)
    : caster.role === "\uAC80\uAC1D"
    ? (roleSkills.swordsmanSkillScale ?? 1.85)
    : caster.role === "\uC0AC\uACA9"
    ? (roleSkills.rangedSkillScale ?? 1.75)
    : (roleSkills.defaultSkillScale ?? 1.6);
  const damage = dealDamage(caster, target, caster.atk * 0.75 + caster.skillAmp * scale + 10);
  return {
    message: `${caster.name} 스킬: ${target.name} ${damage} 피해`,
    effects: [combatEffect(caster, target, "skill", { amount: damage })],
  };
}

function clearCombatStatus(units) {
  for (const unit of units) {
    if (unit) unit.status = "";
  }
}

function playCombatEffects(effects) {
  const field = document.querySelector(".battlefield");
  if (!field) return;
  const fieldRect = field.getBoundingClientRect();
  for (const effect of effects) {
    const from = document.querySelector(`[data-unit-id="${effect.from}"]`);
    const to = document.querySelector(`[data-unit-id="${effect.to}"]`);
    if (!from || !to) continue;
    const fromRect = from.getBoundingClientRect();
    const toRect = to.getBoundingClientRect();
    const startX = fromRect.left + fromRect.width / 2 - fieldRect.left;
    const startY = fromRect.top + fromRect.height / 2 - fieldRect.top;
    const endX = toRect.left + toRect.width / 2 - fieldRect.left;
    const endY = toRect.top + toRect.height / 2 - fieldRect.top;
    const projectile = document.createElement("span");
    const kind = effect.kind || effect.type;
    projectile.className = `projectile ${effect.type} ${kind}`;
    const originX = kind === "slash" ? endX : startX;
    const originY = kind === "slash" ? endY : startY;
    projectile.style.left = `${originX}px`;
    projectile.style.top = `${originY}px`;
    projectile.style.setProperty("--dx", `${endX - startX}px`);
    projectile.style.setProperty("--dy", `${endY - startY}px`);
    projectile.style.setProperty("--angle", `${Math.atan2(endY - startY, endX - startX)}rad`);
    field.append(projectile);
    projectile.addEventListener("animationend", () => projectile.remove(), { once: true });

    if (effect.value?.amount > 0) {
      const number = document.createElement("span");
      const isPositive = effect.type === "heal" || effect.type === "shield";
      number.className = `damage-number ${isPositive ? "positive" : "damage"} ${effect.value.critical ? "critical" : ""}`;
      number.textContent = `${isPositive ? "+" : ""}${Math.round(effect.value.amount)}`;
      number.style.left = `${toRect.left + toRect.width / 2 - fieldRect.left}px`;
      number.style.top = `${toRect.top + Math.max(0, toRect.height * 0.16) - fieldRect.top}px`;
      field.append(number);
      number.addEventListener("animationend", () => number.remove(), { once: true });
    }
  }
}

async function simulate() {
  if (state.busy) return;
  const allies = boardUnits();
  if (!allies.length) {
    addLog("보드에 캐릭터를 배치해야 합니다.");
    return;
  }
  const battleRound = state.round;
  const originalBoard = state.board.slice();
  state.busy = true;
  state.selected = null;
  refs.phase.textContent = "전투 중: 양 팀이 자동으로 교전합니다.";
  document.body.classList.add("fighting");
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
      critChance: critBase.critChance,
      critDamage: critBase.critDamage,
      openingCritMultiplier: critBase.openingCritMultiplier,
      lifeSteal: unit.lifeSteal ?? 0,
      damageReduction: unit.damageReduction ?? 0,
      manaGain: unit.manaGain ?? 1,
    };
    unit.critChance = critBase.critChance;
    unit.critDamage = critBase.critDamage;
    unit.openingCritMultiplier = critBase.openingCritMultiplier;
  });
  allies.forEach((unit) => prepareCombatUnit(unit, "ally", traitCounts));
  state.enemies.filter(Boolean).forEach((unit) => prepareCombatUnit(unit, "enemy"));
  state.combatGrid = Array(48).fill(null);
  state.enemies.forEach((unit, index) => {
    if (unit) state.combatGrid[index] = unit;
  });
  state.board.forEach((unit, index) => {
    if (unit) state.combatGrid[16 + index] = unit;
  });
  const diverCount = placeBacklineDivers([...allies, ...state.enemies.filter(Boolean)]);
  const boss = living(state.enemies).find((unit) => unit.boss);
  addLog(boss ? `보스전 시작: ${boss.name} 출현!` : `전투 시작: 아군 ${allies.length}명 vs 야생 실험체 ${living(state.enemies).length}명`);
  if (diverCount) addLog(`기습 전개: 암살형 ${diverCount}명이 후열로 진입.`);
  render();

  let tick = 0;
  while (living(allies).length && living(state.enemies).length && tick < balance.battle.maxTicks) {
    tick += 1;
    clearCombatStatus([...allies, ...state.enemies]);
    for (const unit of [...living(allies), ...living(state.enemies)]) {
      if (unit.immuneTicks > 0) {
        unit.status = "immune";
      }
    }
    const actors = [...living(allies), ...living(state.enemies)].sort((a, b) => b.speed - a.speed);
    const tickLogs = [];
    const effects = [];

    for (const actor of actors) {
      if (actor.hp <= 0) continue;
      if (actor.stunTicks > 0) {
        actor.stunTicks -= 1;
        actor.status = "stunned";
        continue;
      }
      const friends = actor.side === "ally" ? allies : state.enemies;
      const foes = actor.side === "ally" ? state.enemies : allies;
      if (!living(foes).length) break;
      const action = actor.mana >= 100 ? castSkill(actor, friends, foes) : basicAttack(actor, foes);
      if (action.message) tickLogs.push(action.message);
      effects.push(...action.effects);
    }

    for (const unit of [...living(allies), ...living(state.enemies)]) {
      if (unit.immuneTicks > 0) unit.immuneTicks -= 1;
      if (unit.immuneTicks <= 0) unit.immuneMaxTicks = 0;
      if (unit.stunTicks <= 0) unit.stunMaxTicks = 0;
    }

    addLog(tickLogs.slice(0, 3).join(" / "));
    refs.phase.textContent = `전투 중: ${tick}턴 · 아군 ${living(allies).length}명 / 적 ${living(state.enemies).length}명`;
    render();
    playCombatEffects(effects);
    await sleep(balance.battle.tickMs);
    for (const unit of [...living(allies), ...living(state.enemies)]) {
      if (unit.stunDisplayTicks > 0) unit.stunDisplayTicks -= 1;
      if (unit.stunDisplayTicks <= 0) unit.stunDisplayMaxTicks = 0;
      if (unit.immuneDisplayTicks > 0) unit.immuneDisplayTicks -= 1;
      if (unit.immuneDisplayTicks <= 0) unit.immuneDisplayMaxTicks = 0;
    }
  }

  const win = living(allies).length > 0 && living(state.enemies).length === 0;
  const wasBossRound = isBossRound();
  const survivors = win ? living(allies).length : living(state.enemies).length;
  document.body.classList.remove("fighting");
  state.busy = false;
  state.round += 1;
  state.combatGrid = null;
  addXp(balance.player.combatXp, "전투 보상");
  for (const unit of allies) {
    if (unit.combatBase) {
      unit.maxHp = unit.combatBase.maxHp;
      unit.atk = unit.combatBase.atk;
      unit.speed = unit.combatBase.speed;
      unit.skillAmp = unit.combatBase.skillAmp;
      unit.defense = unit.combatBase.defense;
      unit.critChance = unit.combatBase.critChance;
      unit.critDamage = unit.combatBase.critDamage;
      unit.openingCritMultiplier = unit.combatBase.openingCritMultiplier;
      unit.lifeSteal = unit.combatBase.lifeSteal;
      unit.damageReduction = unit.combatBase.damageReduction;
      unit.manaGain = unit.combatBase.manaGain;
      delete unit.combatBase;
    }
    unit.hp = unit.maxHp;
    unit.mana = 0;
    unit.status = "";
    unit.stunTicks = 0;
    unit.stunMaxTicks = 0;
    unit.stunDisplayTicks = 0;
    unit.stunDisplayMaxTicks = 0;
    unit.immuneTicks = 0;
    unit.immuneMaxTicks = 0;
    unit.immuneDisplayTicks = 0;
    unit.immuneDisplayMaxTicks = 0;
    unit.focusTargetId = null;
    unit.hasPickedOpeningTarget = false;
    unit.hasUsedOpeningCrit = false;
  }
  state.board = originalBoard;
  state.temporaryBoosts = {
    hp: 0,
    atk: 0,
    skillAmp: 0,
  };
  if (win) {
    grantRoundIncome(true);
    addLog(`승리! 생존 ${survivors}명.`);
    refs.phase.textContent = "승리했습니다. 다음 전투를 준비하세요.";
  } else {
    const previousHp = state.hp;
    const damage = wasBossRound ? state.hp : Math.min(20, survivorStarDamage(state.enemies));
    state.hp = Math.max(0, state.hp - damage);
    if (previousHp > 0 && state.hp === 0) captureDeathRecord(battleRound, originalBoard);
    grantRoundIncome(false);
    addLog(`패배. 남은 적 ${survivors}명. 체력 ${damage} 감소.`);
    refs.phase.textContent = state.hp ? "패배했습니다. 조합을 재정비하세요." : "체력이 0이 되었습니다. 랭킹을 등록할 수 있습니다.";
  }
  state.enemies = [];
  if (state.shopLocked) {
    addLog("상점 잠금 유지: 현재 상점을 보존합니다.");
    render();
  } else {
    rollShop();
  }
}


  return {
    currentBossInfo,
    isBossRound,
    previewBossEnemies,
    simulate,
  };
}
