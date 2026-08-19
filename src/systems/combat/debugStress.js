// 전투 스트레스 테스트: 로컬 개발 환경에서 대규모 교전 부하를 자동 구성하고 프레임을 측정합니다.
const localHostnames = new Set(["127.0.0.1", "localhost"]);

const PRESET_ALLIES = {
  default: [
    "유키",
    "하트",
    "쇼이치",
    "시셀라",
    "헤이즈",
    "클로에",
    "띠아",
    "자히르",
    "데비&마를렌",
    "코렐라인",
  ],
  assaultGuardian: [
    "재키",
    "리다이린",
    "수아",
    "레온",
    "니키",
    "에키온",
    "케네스",
    "슈린",
    "비형",
    "가넷",
  ],
  casterSupport: [
    "혜진",
    "시셀라",
    "자히르",
    "비앙카",
    "셀린",
    "아디나",
    "엠마",
    "코렐라인",
    "레니",
    "테오도르",
  ],
  assassinTactical: [
    "쇼이치",
    "루크",
    "캐시",
    "알렉스",
    "아비게일",
    "다니엘",
    "이렘",
    "얀",
    "레녹스",
    "클로에",
  ],
  rangedRemote: [
    "아야",
    "로지",
    "헤이즈",
    "클로에",
    "나딘",
    "실비아",
    "버니스",
    "리오",
    "칼라",
    "아르다",
  ],
  hiddenCombo: [
    "케네스",
    "가넷",
    "현우",
    "혜진",
    "수아",
    "요한",
    "리오",
    "유키",
    "아야",
    "쇼이치",
  ],
};

export function installCombatStressTools({
  state,
  balance,
  roster,
  makeUnit,
  render,
  combat,
  searchParams,
}) {
  if (!localHostnames.has(location.hostname)) return;

  const combatSignature = (result) => JSON.stringify({
    win: result?.win,
    survivors: result?.survivors,
    hp: result?.hp,
    allyMetrics: result?.allyMetrics || [],
    remainingEnemies: result?.remainingEnemies || [],
  });

  const runCombatStress = async (options = {}) => {
    if (state.busy) return null;
    const allyCount = Math.max(1, Math.min(16, Math.round(options.allyCount || Number(searchParams.get("ally-count")) || 10)));
    const enemyCount = Math.max(1, Math.min(balance.battle.enemySlots || 16, Math.round(options.enemyCount || Number(searchParams.get("enemy-count")) || 13)));
    const tier = Math.max(1, Math.min(3, Math.round(options.tier || Number(searchParams.get("tier")) || 3)));
    const round = Math.max(1, Math.round(options.round || Number(searchParams.get("round")) || 90));
    const runId = String(options.runId || searchParams.get("run-id") || Date.now());
    const preset = String(options.preset || searchParams.get("preset") || "default");
    const allyNames = Array.isArray(options.allyNames) && options.allyNames.length
      ? options.allyNames
      : PRESET_ALLIES[preset] || PRESET_ALLIES.default;
    const enemyArts = [
      "058_Haze.png",
      "013_Sissela.png",
      "024_Zahir.png",
      "050_Celine.png",
      "060_Bernice.png",
      "002_Aya.png",
      "011_Rozzi.png",
      "014_Lenox.png",
      "037_Daniel.png",
      "061_Irem.png",
      "071_Kenneth.png",
      "076_Garnet.png",
      "088_Bihyung.png",
    ];
    const unitByArt = (art) => roster.find((unit) => String(unit.art || "").endsWith(art) && unit.active !== false);
    const unitByName = (name) => roster.find((unit) => unit.name === name && unit.active !== false);
    const activeRoster = roster.filter((unit) => unit.active !== false);
    const stressAllyBases = Array.from({ length: allyCount }, (_, index) => (
      unitByName(allyNames[index % allyNames.length]) || activeRoster[index % activeRoster.length]
    )).filter(Boolean);
    const stressEnemyBases = Array.from({ length: enemyCount }, (_, index) => (
      unitByArt(enemyArts[index % enemyArts.length]) || activeRoster[(index + allyCount) % activeRoster.length]
    )).filter(Boolean);
    const tuneStressUnit = (unit, side) => {
      unit.maxHp = Math.max(unit.maxHp, side === "ally" ? 1800 : 2100);
      unit.hp = unit.maxHp;
      unit.atk = Math.max(unit.atk, side === "ally" ? 65 : 70);
      unit.skillAmp = Math.max(unit.skillAmp, side === "ally" ? 110 : 120);
      unit.defense = Math.max(unit.defense, side === "ally" ? 24 : 28);
      unit.speed = Math.max(unit.speed || 1, 1.25);
      unit.maxMana = Math.min(unit.maxMana || 100, 70);
      unit.openingMana = unit.maxMana;
      unit.manaGain = 1.7;
      return unit;
    };
    const boardPositions = [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 17, 18, 19, 20, 25, 26];
    state.board = Array(32).fill(null);
    state.bench = Array(8).fill(null);
    state.debugDummies = Array(balance.battle.enemySlots).fill(null);
    state.level = 10;
    state.round = round;
    state.hp = Math.max(state.hp, 100);
    state.selected = null;
    state.combatGrid = null;
    const previousShopLocked = state.shopLocked;
    state.shopLocked = true;
    if (options.seed) state.nextCombatSeed = String(options.seed);
    stressAllyBases.slice(0, allyCount).forEach((base, index) => {
      if (base) {
        const unit = tuneStressUnit(makeUnit(base, tier), "ally");
        unit.id = `stress-ally-${index}`;
        state.board[boardPositions[index]] = unit;
      }
    });
    stressEnemyBases.slice(0, enemyCount).forEach((base, index) => {
      const slot = balance.battle.enemySpawnOrder[index] ?? index;
      if (base) {
        const unit = tuneStressUnit(makeUnit(base, tier), "enemy");
        unit.id = `stress-enemy-${index}`;
        state.debugDummies[slot] = unit;
      }
    });
    render();

    const frames = [];
    let running = true;
    let lastFrame = performance.now();
    const collectFrame = (now) => {
      frames.push(now - lastFrame);
      lastFrame = now;
      if (running) requestAnimationFrame(collectFrame);
    };
    requestAnimationFrame(collectFrame);
    const startedAt = performance.now();
    let result;
    try {
      result = await combat.simulate();
    } finally {
      state.shopLocked = previousShopLocked;
    }
    running = false;
    const durationMs = performance.now() - startedAt;
    const sorted = frames.slice(1).sort((a, b) => a - b);
    const summary = {
      runId,
      preset,
      allyCount,
      enemyCount,
      tier,
      round,
      durationMs,
      frames: Math.max(0, frames.length - 1),
      avgFrameMs: sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length),
      p95FrameMs: sorted[Math.floor(sorted.length * 0.95)] || 0,
      maxFrameMs: sorted.at(-1) || 0,
      over33ms: sorted.filter((value) => value > 33).length,
      over50ms: sorted.filter((value) => value > 50).length,
      pixiCanvasCount: document.querySelectorAll(".pixi-skill-effect-canvas").length,
      legacyCanvasCount: document.querySelectorAll("canvas.skill-effect-canvas:not(.pixi-skill-effect-canvas)").length,
      seed: state.lastCombatSeed,
      signature: combatSignature(result || state.lastCombatResult),
      result: result || state.lastCombatResult,
    };
    console.info("[rumia-combat-stress]", JSON.stringify(summary));
    return summary;
  };

  const runCombatDeterminism = async (options = {}) => {
    const runs = Math.max(2, Math.min(100, Math.round(options.runs || Number(searchParams.get("runs")) || 10)));
    const seed = String(options.seed || searchParams.get("seed") || "rumia-determinism-10v13");
    const results = [];
    for (let index = 0; index < runs; index += 1) {
      const summary = await runCombatStress({
        ...options,
        seed,
        runId: `${seed}-${index + 1}`,
      });
      if (!summary) break;
      results.push({
        index: index + 1,
        seed: summary.seed,
        signature: summary.signature,
        result: summary.result,
      });
    }
    const first = results[0]?.signature || "";
    const mismatches = results.filter((result) => result.signature !== first);
    const summary = {
      seed,
      runs: results.length,
      passed: results.length === runs && mismatches.length === 0,
      firstSignature: first,
      mismatchCount: mismatches.length,
      mismatches: mismatches.slice(0, 5),
      results: results.slice(0, 3),
    };
    console.info("[rumia-combat-determinism]", JSON.stringify(summary));
    return summary;
  };

  try {
    if (Object.isExtensible(window)) window.__rumiaCombatStress = runCombatStress;
    if (Object.isExtensible(window)) window.__rumiaCombatDeterminism = runCombatDeterminism;
  } catch {
    // The public debug hook is optional; query-driven stress tests still run.
  }

  if (searchParams.has("combat-stress")) {
    window.setTimeout(() => runCombatStress(), 900);
  }
  if (searchParams.has("combat-determinism")) {
    window.setTimeout(() => runCombatDeterminism(), 900);
  }
}
