// Runs data validation and deterministic combat smoke tests for every active synergy.
import assert from "node:assert/strict";

globalThis.window = { location: { hostname: "127.0.0.1" } };
globalThis.document = {
  body: { classList: { add() {}, remove() {} } },
  querySelector() { return null; },
};

const [
  { allAugments, balance, bossPatterns, bossRoster, communityBoardConfig, pvpRoomsConfig, roster, traitRules },
  { createGameState },
  { createUnitPool, makeUnit },
  { createTraitController },
  { createCombatController },
  { resolveTraitMechanics },
  { augmentTraitCountAdditions },
] = await Promise.all([
  import("../src/core/data.js"),
  import("../src/core/state.js"),
  import("../src/core/units.js"),
  import("../src/systems/traits.js"),
  import("../src/systems/combat/controller.js"),
  import("../src/systems/combat/traitMechanics.js"),
  import("../src/systems/augmentEffects.js"),
]);

const EXPECTED_MAJOR = ["격전", "정조준", "철벽", "술식", "암습", "진형", "투혼", "연대"];
const EXPECTED_MINOR = ["선봉", "사수", "봉쇄", "기동", "파동", "응원", "응수", "결속", "종막"];
const EXPECTED_TRAITS = [...EXPECTED_MAJOR, ...EXPECTED_MINOR];
const PREFERRED_UNITS = {
  격전: ["리다이린", "니키"],
  정조준: ["로지", "아야"],
  철벽: ["현우", "마이"],
  술식: ["엠마", "아디나"],
  암습: ["루크", "캐시"],
  진형: ["아이솔", "카티야"],
  투혼: ["피오라", "엘레나"],
  연대: ["레니", "쇼우"],
  선봉: ["재키", "레녹스"],
  사수: ["아야", "로지"],
  봉쇄: ["엠마", "아이솔"],
  기동: ["리다이린", "실비아"],
  파동: ["자히르", "셀린"],
  응원: ["쇼우", "하트"],
  응수: ["현우", "루크"],
  결속: ["피오라", "아디나"],
  종막: ["아르다", "슈린"],
};

function unitTraits(unit) {
  return Array.from(new Set((unit.traits?.length ? unit.traits : [unit.trait]).filter(Boolean)));
}

function gridHexDistance(firstIndex, secondIndex) {
  const cols = balance.battle.columns;
  const toHex = (index) => {
    const x = index % cols;
    const y = Math.floor(index / cols);
    return { q: x, r: y - Math.floor(x / 2) };
  };
  const first = toHex(firstIndex);
  const second = toHex(secondIndex);
  const dq = first.q - second.q;
  const dr = first.r - second.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

function validateTraitData() {
  assert.deepEqual(Object.keys(traitRules).sort(), EXPECTED_TRAITS.slice().sort(), "Unexpected active synergy set");
  assert.deepEqual(
    Object.entries(traitRules).filter(([, rule]) => rule.category === "major").map(([name]) => name).sort(),
    EXPECTED_MAJOR.slice().sort(),
    "Major synergy set mismatch",
  );
  assert.deepEqual(
    Object.entries(traitRules).filter(([, rule]) => rule.category === "minor").map(([name]) => name).sort(),
    EXPECTED_MINOR.slice().sort(),
    "Minor synergy set mismatch",
  );

  const activeRoster = roster.filter((unit) => unit.active !== false);
  assert.equal(activeRoster.length, 66, "Active roster must contain 66 units");
  for (const unit of activeRoster) {
    const traits = unitTraits(unit);
    assert.equal(traits.length, 2, `${unit.name}: expected exactly two synergies`);
    assert.equal(traits.filter((trait) => traitRules[trait]?.category === "major").length, 1, `${unit.name}: major synergy mismatch`);
    assert.equal(traits.filter((trait) => traitRules[trait]?.category === "minor").length, 1, `${unit.name}: minor synergy mismatch`);
  }

  for (const trait of EXPECTED_TRAITS) {
    const rule = traitRules[trait];
    const members = activeRoster.filter((unit) => unitTraits(unit).includes(trait));
    const needs = rule.tiers.map((tier) => Number(tier.need));
    assert(needs.every((need, index) => need > 0 && (!index || need > needs[index - 1])), `${trait}: tier thresholds must increase`);
    assert(members.length >= needs.at(-1), `${trait}: ${members.length} members cannot reach ${needs.at(-1)} tier`);
    for (const tier of rule.tiers) {
      assert(Object.keys(tier.mechanics || {}).length > 0, `${trait} ${tier.need}: missing mechanics`);
      const probe = { traits: [trait] };
      const resolved = resolveTraitMechanics(probe, { [trait]: tier.need }, traitRules, { selectedAugments: [] });
      for (const [key, value] of Object.entries(tier.mechanics)) {
        assert.equal(resolved[key], value, `${trait} ${tier.need}: ${key} did not resolve`);
      }
      const inactive = resolveTraitMechanics(probe, { [trait]: tier.need - 1 }, traitRules, { selectedAugments: [] });
      if (tier === rule.tiers[0]) assert.equal(inactive.activeTraits.length, 0, `${trait}: activated below first threshold`);
    }
  }

  for (const trait of EXPECTED_MAJOR) {
    const members = activeRoster.filter((unit) => unitTraits(unit).includes(trait));
    for (const cost of [2, 3, 5]) {
      assert(members.some((unit) => Number(unit.cost) === cost), `${trait}: missing ${cost}-cost augment reward unit`);
    }
  }
}

function validateLowCostBaseStats() {
  for (const [cost, multiplier] of [[1, 1.1], [2, 1.07], [3, 1.04], [4, 1], [5, 1]]) {
    const base = roster.find((unit) => unit.active !== false && unit.cost === cost);
    assert(base, `Missing active ${cost}-cost unit`);
    const unit = makeUnit(base, balance, 1);
    assert.equal(unit.maxHp, Math.round(base.hp * multiplier), `${cost}-cost HP boost mismatch`);
    assert.equal(unit.atk, Math.round(base.atk * multiplier), `${cost}-cost attack boost mismatch`);
    assert.equal(unit.skillAmp, Math.round(base.skillAmp * multiplier), `${cost}-cost skill amp boost mismatch`);
    assert.equal(unit.defense, Math.round(base.defense * multiplier), `${cost}-cost defense boost mismatch`);
  }

  assert.equal(balance.battle.enemyBaseStatsByCost["1"].hp, 91, "PvE enemy base stats must remain independent");
  assert.equal(balance.battle.enemyBaseStatsByCost["2"].hp, 95, "PvE enemy base stats must remain independent");
  assert.equal(balance.battle.enemyBaseStatsByCost["3"].hp, 95, "PvE enemy base stats must remain independent");
}

function validateNewAugments() {
  const traitPatches = allAugments.filter((augment) => augment.effect?.type === "traitRulePatch");
  assert.equal(traitPatches.length, EXPECTED_MAJOR.length, "Every major synergy must have one active introduction augment");
  for (const augment of traitPatches) {
    const { trait, patch } = augment.effect;
    const need = traitRules[trait]?.tiers?.[0]?.need;
    assert(Number.isFinite(need), `${augment.name}: unknown synergy ${trait}`);
    const resolved = resolveTraitMechanics(
      { traits: [trait] },
      { [trait]: need },
      traitRules,
      { selectedAugments: [augment] },
    );
    for (const [key, value] of Object.entries(patch || {})) {
      assert.equal(resolved[key], value, `${augment.name}: ${key} did not reach combat mechanics`);
    }
  }

  const countAugments = allAugments.filter((augment) => ["traitCount", "traitCrown"].includes(augment.effect?.type));
  for (const augment of countAugments) {
    const additions = augmentTraitCountAdditions({ selectedAugments: [augment] });
    assert.equal(
      additions[augment.effect.trait],
      Number(augment.effect.add) || 0,
      `${augment.name}: synergy count bonus did not apply`,
    );
  }
}

function makeTestUnit(name, { enemy = false, fragile = false } = {}) {
  const base = roster.find((unit) => unit.name === name);
  assert(base, `Missing roster unit: ${name}`);
  const unit = makeUnit(base, balance, 1);
  if (enemy) {
    unit.maxHp = 7000;
    unit.hp = fragile ? 500 : unit.maxHp;
    unit.atk = 34;
    unit.skillAmp = 0;
    unit.defense = 3;
    unit.speed = 0.75;
    unit.maxMana = 999999;
    unit.manaGain = 0.1;
  } else {
    unit.maxHp *= 4;
    unit.hp = unit.maxHp;
    unit.maxMana = Math.min(50, Number(unit.maxMana) || 50);
    unit.manaGain = Math.max(1.5, Number(unit.manaGain) || 1);
  }
  return unit;
}

async function runTraitCombat(trait, seed, options = {}) {
  const { state } = createGameState({
    balance,
    roster,
    createUnitPool,
    communityBoardConfig,
    pvpRoomsConfig,
  });
  state.debugMode = true;
  state.shopLocked = true;
  state.round = options.round || 1;
  state.selectedAugments = [];
  state.board = Array(32).fill(null);

  const preferred = options.names || PREFERRED_UNITS[trait];
  const need = options.need || traitRules[trait].tiers[0].need;
  const fallback = roster.filter((unit) => unit.active !== false && unitTraits(unit).includes(trait)).map((unit) => unit.name);
  const names = [...new Set([...(preferred || []), ...fallback])].slice(0, need);
  assert.equal(names.length, need, `${trait}: missing combat test members`);
  const boardIndexes = options.boardIndexes || (trait === "진형"
    ? Array.from({ length: need }, (_, index) => 16 + index)
    : Array.from({ length: need }, (_, index) => index));
  names.forEach((name, index) => { state.board[boardIndexes[index]] = makeTestUnit(name); });
  const baseMaxHpById = new Map(state.board.filter(Boolean).map((unit) => [unit.id, unit.maxHp]));

  const enemyName = roster.find((unit) => unit.name === "현우")?.name || roster[0].name;
  const enemies = Array.from({ length: options.enemyCount || 8 }, (_, index) => makeTestUnit(enemyName, {
    enemy: true,
    fragile: index === 0 && trait === "기동",
  }));
  if (options.mode === "pve" && options.enemyBoardIndexes?.length) {
    state.debugDummies = Array(balance.battle.enemySlots).fill(null);
    options.enemyBoardIndexes.forEach((index) => {
      state.debugDummies[index] = makeTestUnit(enemyName, { enemy: true });
    });
  }
  if (options.boss) {
    enemies.forEach((enemy) => {
      enemy.boss = true;
      enemy.maxHp = 30000;
      enemy.hp = enemy.maxHp;
      enemy.atk = 180;
      enemy.skillAmp = 120;
    });
  }
  if (trait === "암습") {
    state.board.filter(Boolean).forEach((unit) => {
      unit.atk = 12;
      unit.skillAmp = 0;
      unit.maxMana = 999999;
      unit.manaGain = 0.1;
    });
    enemies.forEach((enemy) => {
      enemy.maxHp = 250;
      enemy.hp = enemy.maxHp;
      enemy.defense = 0;
    });
  }
  if (trait === "종막") enemies.forEach((enemy) => { enemy.atk = 3; });
  const logs = [];
  const triggers = [];
  let openingSnapshot = null;
  const refs = {
    phase: { textContent: "" },
    battle: { disabled: false, textContent: "" },
    levelUp: { disabled: false },
  };
  const boardUnits = () => state.board.filter(Boolean);
  const traits = createTraitController({ state, traitRules, boardUnits });
  const combat = createCombatController({
    state,
    balance,
    bossRoster,
    bossPatterns,
    roster,
    traitRules,
    refs,
    sample: (items) => items[0],
    boardUnits,
    boardLimit: () => 32,
    addLog: (message) => logs.push(String(message)),
    activeTraits: traits.activeTraits,
    applySynergy: traits.applySynergy,
    applyAbsorbedStats() {},
    combatAbsorptions: () => [],
    prepareDefeatEffects() {},
    prepareKillEffects() {},
    prepareOpeningEffects: () => [],
    markPaintTarget() {},
    consumePaintDetonation: () => null,
    triggerFeastEffects: () => [],
    triggerKillUtilities: () => [],
    triggerExclusiveRescue: () => null,
    triggerDefeatEffects: () => [],
    triggerKillEffects: () => [],
    playSkillVisual() {},
    clearSkillVisuals() {},
    setCombatTimeScale() {},
    render() {
      if (openingSnapshot || !state.combatGrid) return;
      openingSnapshot = state.combatGrid.filter((unit) => unit?.side === "ally").map((unit) => {
        const index = state.combatGrid.indexOf(unit);
        const target = state.combatGrid.find((candidate) => candidate?.id === unit.openingDiverTargetId);
        const targetIndex = target ? state.combatGrid.indexOf(target) : -1;
        return {
          id: unit.id,
          name: unit.name,
          index,
          row: Math.floor(index / balance.battle.columns),
          targetRow: targetIndex >= 0 ? Math.floor(targetIndex / balance.battle.columns) : -1,
          targetDistance: targetIndex >= 0 ? gridHexDistance(index, targetIndex) : -1,
          maxHp: unit.maxHp,
          baseMaxHp: baseMaxHpById.get(unit.id) || unit.maxHp,
          shield: unit.shield || 0,
          vanguardShield: unit.traitVanguardShield || 0,
        };
      });
    },
    renderCombatFrame() {},
    rollShop() {},
    addXp() {},
    grantRoundIncome() {},
    captureDeathRecord() {},
    offerAugments() {},
    offerLumiShop() {},
    sleep: async () => {},
    onTraitTrigger: (entry) => triggers.push(entry),
  });

  const result = await combat.simulate(options.mode === "pve"
    ? { mode: "pve", seed }
    : {
        mode: "pvp",
        round: 1,
        seed,
        enemies,
        enemyTraits: {},
        enemyState: { selectedAugments: [] },
        opponentName: "시너지 테스트 더미",
      });
  assert(result, `${trait}: combat returned no result (${logs.slice(-3).join(" / ")})`);
  const errorLogs = logs.filter((message) => /오류|복구/.test(message));
  assert.equal(errorLogs.length, 0, `${trait}: combat recovered from an internal error (${errorLogs.join(" / ")})`);
  const ownTriggers = triggers.filter((entry) => entry.trait === trait);
  if (!options.skipTriggerAssert) {
    assert(ownTriggers.length > 0, `${trait}: combat finished without a measured trigger; observed=${JSON.stringify(triggers)}; counts=${JSON.stringify(traits.activeTraits())}`);
  }
  return {
    trait,
    result: {
      win: result.win,
      allyMetrics: result.allyMetrics,
      remainingEnemies: result.remainingEnemies,
    },
    events: [...new Set(ownTriggers.map((entry) => entry.event))],
    eventDetails: ownTriggers.map((entry) => ({ event: entry.event, detail: entry.detail })),
    triggerCount: ownTriggers.length,
    openingSnapshot,
    logs,
  };
}

validateTraitData();
validateLowCostBaseStats();
validateNewAugments();
console.log("OK low-cost base stats | 1-cost +10% / 2-cost +7% / 3-cost +4% / PvE enemies unchanged");
console.log("OK augment wiring | 입문 8종 규칙 패치 / 문장·왕관 시너지 카운트");

const report = [];
for (const trait of EXPECTED_TRAITS) {
  const seed = `synergy-smoke:${trait}`;
  const first = await runTraitCombat(trait, seed);
  const second = await runTraitCombat(trait, seed);
  assert.deepEqual(second.result, first.result, `${trait}: fixed-seed combat is not deterministic`);
  assert.deepEqual(second.events, first.events, `${trait}: trigger sequence is not deterministic`);
  assert.equal(second.triggerCount, first.triggerCount, `${trait}: trigger count is not deterministic`);
  report.push(first);
  console.log(`OK ${trait.padEnd(2)} | ${first.events.join(", ")} | ${first.triggerCount}회`);
}

const ambushBoss = await runTraitCombat("암습", "synergy-smoke:ambush-boss", { need: 8, enemyCount: 1, boss: true });
assert(ambushBoss.events.includes("focus"), "암습: boss combat did not build focus stacks");
assert(ambushBoss.events.includes("dodge"), "암습: boss combat did not consume opening dodges");
assert(ambushBoss.events.includes("dodge-refresh"), "암습: boss takedown did not restore a dodge charge");
assert(
  ambushBoss.eventDetails.some((entry) => entry.event === "focus" && entry.detail.stacks === 5),
  "암습: boss combat did not reach 5 focus stacks",
);
assert.equal(
  ambushBoss.eventDetails.filter((entry) => entry.event === "dodge").length,
  3,
  "암습: 8-piece boss combat must dodge exactly 3 incoming damage instances",
);
console.log(`OK 암습 보스전 | focus 5중첩 / dodge 3회 / 처치 회피 재장전 | ${ambushBoss.triggerCount}회`);

const ironWallOpening = await runTraitCombat("철벽", "synergy-smoke:pve-iron-wall", { mode: "pve" });
assert(ironWallOpening.events.includes("protect"), "철벽: PvE opening protection did not trigger");
assert(ironWallOpening.openingSnapshot.some((unit) => unit.shield > 0), "철벽: PvE opening shield was not present on the first combat frame");

const vanguardOpening = await runTraitCombat("선봉", "synergy-smoke:pve-vanguard", { mode: "pve" });
assert(vanguardOpening.events.includes("opening-shield"), "선봉: PvE opening shield did not trigger");
assert(vanguardOpening.openingSnapshot.every((unit) => unit.vanguardShield > 0), "선봉: PvE opening shield was not present on every vanguard unit");

const formationOpening = await runTraitCombat("진형", "synergy-smoke:pve-formation-front", {
  mode: "pve",
  boardIndexes: [0, 1],
  skipTriggerAssert: true,
});
assert(
  formationOpening.openingSnapshot.every((unit) => unit.maxHp > unit.baseMaxHp),
  "진형: front-row max HP did not increase on the first PvE combat frame",
);

const ambushOpening = await runTraitCombat("암습", "synergy-smoke:pve-ambush", {
  mode: "pve",
  enemyBoardIndexes: [27],
});
assert(
  ambushOpening.openingSnapshot.every((unit) => unit.targetDistance === 1),
  `암습: units did not land next to their selected target: ${JSON.stringify(ambushOpening.openingSnapshot)}`,
);
assert(
  ambushOpening.openingSnapshot.every((unit) => unit.targetRow >= 2),
  `암습: frontline fallback did not select the available frontline enemy: ${JSON.stringify(ambushOpening.openingSnapshot)}`,
);
const ambushBacklineOpening = await runTraitCombat("암습", "synergy-smoke:pvp-ambush-backline");
assert(
  ambushBacklineOpening.openingSnapshot.every((unit) => unit.targetRow <= 1 && unit.targetDistance === 1),
  `암습: backline enemies were not prioritized: ${JSON.stringify(ambushBacklineOpening.openingSnapshot)}`,
);
const reportedAmbushPair = await runTraitCombat("암습", "synergy-smoke:shoichi-abigail", {
  names: ["쇼이치", "아비게일"],
  mode: "pve",
  enemyBoardIndexes: [27],
});
assert(
  reportedAmbushPair.logs.some((message) => message.includes("암습 전개: 암습 유닛 2명"))
    && reportedAmbushPair.openingSnapshot.every((unit) => unit.targetDistance === 1),
  `암습: 쇼이치/아비게일 pair did not dive: ${JSON.stringify(reportedAmbushPair.openingSnapshot)}`,
);
console.log("OK PvE opening mechanics | 철벽 보호 / 선봉 보호막 / 진형 전열 체력 / 암습 목표 인접 이동");

console.log(`Synergy smoke OK: ${report.length} traits, ${report.reduce((sum, item) => sum + item.triggerCount, 0)} measured triggers.`);
