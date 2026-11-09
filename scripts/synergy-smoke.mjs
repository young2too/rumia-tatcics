// Runs data validation and deterministic combat smoke tests for every active synergy.
import assert from "node:assert/strict";

globalThis.window = { location: { hostname: "127.0.0.1" } };
globalThis.document = {
  body: { classList: { add() {}, remove() {} } },
  querySelector() { return null; },
};

const [
  { balance, bossPatterns, bossRoster, communityBoardConfig, pvpRoomsConfig, roster, traitRules },
  { createGameState },
  { createUnitPool, makeUnit },
  { createTraitController },
  { createCombatController },
  { resolveTraitMechanics },
] = await Promise.all([
  import("../src/core/data.js"),
  import("../src/core/state.js"),
  import("../src/core/units.js"),
  import("../src/systems/traits.js"),
  import("../src/systems/combat/controller.js"),
  import("../src/systems/combat/traitMechanics.js"),
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
  state.selectedAugments = [];
  state.board = Array(32).fill(null);

  const preferred = PREFERRED_UNITS[trait];
  const need = options.need || traitRules[trait].tiers[0].need;
  const fallback = roster.filter((unit) => unit.active !== false && unitTraits(unit).includes(trait)).map((unit) => unit.name);
  const names = [...new Set([...(preferred || []), ...fallback])].slice(0, need);
  assert.equal(names.length, need, `${trait}: missing combat test members`);
  const boardIndexes = trait === "진형"
    ? Array.from({ length: need }, (_, index) => 16 + index)
    : Array.from({ length: need }, (_, index) => index);
  names.forEach((name, index) => { state.board[boardIndexes[index]] = makeTestUnit(name); });

  const enemyName = roster.find((unit) => unit.name === "현우")?.name || roster[0].name;
  const enemies = Array.from({ length: options.enemyCount || 8 }, (_, index) => makeTestUnit(enemyName, {
    enemy: true,
    fragile: index === 0 && trait === "기동",
  }));
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
    render() {},
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

  const result = await combat.simulate({
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
  assert(ownTriggers.length > 0, `${trait}: combat finished without a measured trigger; observed=${JSON.stringify(triggers)}; counts=${JSON.stringify(traits.activeTraits())}`);
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
  };
}

validateTraitData();

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

console.log(`Synergy smoke OK: ${report.length} traits, ${report.reduce((sum, item) => sum + item.triggerCount, 0)} measured triggers.`);
