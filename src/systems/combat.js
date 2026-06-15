export function createCombatController(context) {
  const {
    state,
    balance,
    bossRoster,
    bossPatterns,
    roster,
    refs,
    makeUnit,
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
  const hpScale = 1 + bossIndex * balance.battle.bossHpGrowth;
  const powerScale = 1 + bossIndex * balance.battle.bossPowerGrowth;
  const defenseScale = 1 + bossIndex * balance.battle.bossDefenseGrowth;
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
  Array.from({ length: count }, (_, i) => {
    const unit = makeUnit(sample(candidates), rollEnemyTier(stage));
    unit.maxHp = Math.round((unit.maxHp + stage * 14) * hpScale);
    unit.hp = unit.maxHp;
    unit.atk = Math.max(3, Math.round((unit.atk + stage * 2) * atkScale));
    unit.skillAmp = Math.max(2, Math.round((unit.skillAmp + stage * 2) * atkScale));
    unit.defense = Math.max(0, Math.round((unit.defense + stage) * hpScale));
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
  const currentDistance = distanceBetween(attacker, target);
  const even = from.y % 2 === 0;
  const steps = even
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

  for (const step of steps) {
    const nextX = from.x + step.x;
    const nextY = from.y + step.y;
    const nextIndex = slotIndexFor(attacker.side, nextX, nextY, Boolean(state.combatGrid));
    if (nextIndex < 0) continue;
    const arr = state.combatGrid || (attacker.side === "enemy" ? state.enemies : state.board);
    if (arr[nextIndex]) continue;
    const nextDistance = hexDistanceSlots({ x: nextX, y: nextY }, to);
    if (nextDistance >= currentDistance) continue;
    arr[from.index] = null;
    arr[nextIndex] = attacker;
    attacker.status = "moving";
    return true;
  }
  return false;
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
  unit.stunTicks = Math.max(unit.stunTicks || 0, ticks);
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
  if (!state.combatGrid || caster.summonCount >= hanaPattern.summonLimit) return null;
  const emptyEnemySlots = state.enemies
    .map((unit, index) => (unit ? -1 : index))
    .filter((index) => index >= 0)
    .sort((a, b) => {
      const casterSlot = unitSlot(caster);
      if (!casterSlot) return a - b;
      const slotA = { x: a % balance.battle.columns, y: Math.floor(a / balance.battle.columns) };
      const slotB = { x: b % balance.battle.columns, y: Math.floor(b / balance.battle.columns) };
      return hexDistanceSlots(slotA, casterSlot) - hexDistanceSlots(slotB, casterSlot);
    });
  const index = emptyEnemySlots[0];
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
  };
  unit.side = side;
  unit.mana = 0;
  unit.maxHp = Math.round(stats.hp);
  unit.hp = unit.maxHp;
  unit.atk = Math.round(stats.atk);
  unit.speed = stats.speed;
  unit.skillAmp = Math.round(stats.skillAmp);
  unit.defense = Math.round(stats.defense);
  unit.healPower = stats.heal;
  unit.range = unitAttackRange(unit);
  unit.status = "";
  unit.stunTicks = 0;
  unit.immuneTicks = unit.immuneTicks || 0;
  unit.focusTargetId = null;
  unit.hasPickedOpeningTarget = false;
  return unit;
}

function pickTarget(attacker, enemies) {
  const alive = living(enemies);
  if (!alive.length) return null;

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
  const damage = Math.max(damageFloor, Math.round(amount - target.defense * 0.45));
  const wickelinePattern = bossPatterns.wickeline;
  if (target.pattern === "wickeline" && target.immuneTicks > 0) {
    target.status = "immune";
    return 0;
  }
  if (target.pattern === "wickeline" && !target.immuneUsed && (target.hp - damage) / target.maxHp <= wickelinePattern.immuneHpRatio) {
    target.immuneUsed = true;
    target.immuneTicks = wickelinePattern.immuneTicks;
    target.status = "immune";
    return 0;
  }
  target.hp = Math.max(0, target.hp - damage);
  const manaFromHit = Math.min(balance.battle.manaPerHit, Math.max(3, Math.round(damage * 0.32)));
  target.mana = Math.min(100, (target.mana || 0) + manaFromHit);
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

function combatEffect(from, to, type = "attack") {
  return { from: from.id, to: to.id, type, weapon: from.weapon, kind: weaponEffectKind(from, type) };
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
    for (const unit of targets) total += dealDamage(attacker, unit, attacker.atk * attacker.speed * variance * balance.battle.basicDamageMultiplier);
    attacker.mana = Math.min(100, attacker.mana + balance.battle.manaPerAttack);
    attacker.status = "attacking";
    return {
      message: `${attacker.name} basic cleave ${total}`,
      effects: targets.map((unit) => combatEffect(attacker, unit, "attack")),
    };
  }
  const damage = dealDamage(attacker, target, attacker.atk * attacker.speed * variance * balance.battle.basicDamageMultiplier);
  attacker.mana = Math.min(100, attacker.mana + balance.battle.manaPerAttack);
  attacker.status = "attacking";
  return {
    message: `${attacker.name} → ${target.name} ${damage} 피해`,
    effects: [combatEffect(attacker, target, "attack")],
  };
}

function castBossSkill(caster, allies, enemies) {
  const effects = [];
  if (caster.pattern === "bear") {
    const pattern = bossPatterns.bear;
    const targets = unitsInRange(caster, enemies, pattern.range);
    let total = 0;
    for (const target of targets) {
      total += dealDamage(caster, target, caster.skillAmp * pattern.skillAmpMultiplier + caster.atk * pattern.atkMultiplier);
      applyStun(target, pattern.stunTicks);
      effects.push(combatEffect(caster, target, "skill"));
    }
    return { message: `${caster.name} roar stun ${targets.length} / ${total}`, effects };
  }

  if (caster.pattern === "alpha" || caster.pattern === "omega") {
    const pattern = bossPatterns[caster.pattern];
    const targets = unitsInFront(caster, enemies, pattern.range);
    let total = 0;
    for (const target of targets) {
      total += dealDamage(caster, target, caster.skillAmp * pattern.skillAmpMultiplier + caster.atk * pattern.atkMultiplier);
      knockBack(target, caster, pattern.knockback);
      applyStun(target, pattern.stunTicks);
      effects.push(combatEffect(caster, target, "skill"));
    }
    return { message: `${caster.name} shockwave ${targets.length} / ${total}`, effects };
  }

  if (caster.pattern === "wickeline") {
    const pattern = bossPatterns.wickeline;
    const targets = backlineTargets(caster, enemies, pattern.targetCount);
    let total = 0;
    for (const target of targets) {
      total += dealDamage(caster, target, caster.skillAmp * pattern.skillAmpMultiplier + caster.atk * pattern.atkMultiplier);
      effects.push(combatEffect(caster, target, "skill"));
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
    return { message: `${caster.name} arcane hit ${damage}`, effects: [combatEffect(caster, target, "skill")] };
  }

  if (caster.pattern === "nadja") {
    const pattern = bossPatterns.nadja;
    const targets = living(enemies);
    let total = 0;
    for (const target of targets) {
      total += dealDamage(caster, target, caster.skillAmp * pattern.skillAmpMultiplier + caster.atk * pattern.atkMultiplier);
      effects.push(combatEffect(caster, target, "skill"));
    }
    return { message: `${caster.name} full-map strike ${targets.length} / ${total}`, effects };
  }

  return null;
}

function castSkill(caster, allies, enemies) {
  caster.mana = 0;
  caster.status = "casting";

  if (caster.boss) {
    const bossAction = castBossSkill(caster, allies, enemies);
    if (bossAction) return bossAction;
  }

  if (caster.role === "지원") {
    const target = living(allies).reduce((low, unit) => (unit.hp / unit.maxHp < low.hp / low.maxHp ? unit : low), living(allies)[0]);
    const rawHeal = Math.round((caster.skillAmp * 0.72 + 10) * caster.healPower);
    const heal = Math.min(rawHeal, Math.round(target.maxHp * 0.12));
    target.hp = Math.min(target.maxHp, target.hp + heal);
    target.status = "healed";
    return {
      message: `${caster.name} 스킬: ${target.name} ${heal} 회복`,
      effects: [combatEffect(caster, target, "heal")],
    };
  }

  if (caster.role === "술법") {
    const targets = living(enemies);
    let total = 0;
    for (const target of targets) total += dealDamage(caster, target, caster.skillAmp * 0.75 + 10);
    return {
      message: `${caster.name} 스킬: 광역 ${total} 피해`,
      effects: targets.map((target) => combatEffect(caster, target, "skill")),
    };
  }

  if (caster.role === "방패") {
    const rawHeal = Math.round(caster.skillAmp * 0.35 + caster.defense * 0.55 + 5);
    const heal = Math.min(rawHeal, Math.round(caster.maxHp * 0.045));
    caster.hp = Math.min(caster.maxHp, caster.hp + heal);
    caster.status = "healed";
    return {
      message: `${caster.name} 스킬: ${heal} 보호막`,
      effects: [combatEffect(caster, caster, "shield")],
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
  const scale = caster.role === "암살" ? 2.2 : caster.role === "검객" ? 1.85 : caster.role === "사격" ? 1.75 : 1.6;
  const damage = dealDamage(caster, target, caster.atk * 0.75 + caster.skillAmp * scale + 10);
  return {
    message: `${caster.name} 스킬: ${target.name} ${damage} 피해`,
    effects: [combatEffect(caster, target, "skill")],
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
    unit.combatBase = {
      maxHp: unit.maxHp,
      hp: unit.hp,
      atk: unit.atk,
      speed: unit.speed,
      skillAmp: unit.skillAmp,
      defense: unit.defense,
    };
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
  const boss = living(state.enemies).find((unit) => unit.boss);
  addLog(boss ? `보스전 시작: ${boss.name} 출현!` : `전투 시작: 아군 ${allies.length}명 vs 야생 실험체 ${living(state.enemies).length}명`);
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
    }

    addLog(tickLogs.slice(0, 3).join(" / "));
    refs.phase.textContent = `전투 중: ${tick}턴 · 아군 ${living(allies).length}명 / 적 ${living(state.enemies).length}명`;
    render();
    playCombatEffects(effects);
    await sleep(balance.battle.tickMs);
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
      delete unit.combatBase;
    }
    unit.hp = unit.maxHp;
    unit.mana = 0;
    unit.status = "";
    unit.stunTicks = 0;
    unit.immuneTicks = 0;
    unit.focusTargetId = null;
    unit.hasPickedOpeningTarget = false;
  }
  state.board = originalBoard;
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
