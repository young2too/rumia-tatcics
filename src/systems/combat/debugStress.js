// 전투 스트레스 테스트: 로컬 개발 환경에서 10대13 최대 교전 부하를 자동 구성하고 프레임을 측정합니다.
const localHostnames = new Set(["127.0.0.1", "localhost"]);

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

  window.__rumiaCombatStress = async (options = {}) => {
    if (state.busy) return null;
    const allyCount = Math.max(1, Math.min(10, Math.round(options.allyCount || Number(searchParams.get("ally-count")) || 10)));
    const enemyCount = Math.max(1, Math.min(16, Math.round(options.enemyCount || Number(searchParams.get("enemy-count")) || 13)));
    const tier = Math.max(1, Math.min(3, Math.round(options.tier || Number(searchParams.get("tier")) || 3)));
    const round = Math.max(1, Math.round(options.round || Number(searchParams.get("round")) || 90));
    const runId = String(options.runId || searchParams.get("run-id") || Date.now());
    const allyArts = [
      "007_Yuki.png",
      "008_Hart.png",
      "009_Shoichi.png",
      "013_Sissela.png",
      "058_Haze.png",
      "059_Chloe.png",
      "051_Tia.png",
      "024_Zahir.png",
      "065_Debi&Marlene.png",
      "087_Coraline.png",
    ];
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
    const boardPositions = [17, 18, 19, 20, 21, 22, 25, 26, 27, 28];
    state.board = Array(32).fill(null);
    state.bench = Array(8).fill(null);
    state.debugDummies = Array(balance.battle.enemySlots).fill(null);
    state.level = 10;
    state.round = round;
    state.hp = Math.max(state.hp, 100);
    state.selected = null;
    state.combatGrid = null;
    allyArts.slice(0, allyCount).forEach((art, index) => {
      const base = unitByArt(art);
      if (base) state.board[boardPositions[index]] = tuneStressUnit(makeUnit(base, tier), "ally");
    });
    enemyArts.slice(0, enemyCount).forEach((art, index) => {
      const base = unitByArt(art);
      const slot = balance.battle.enemySpawnOrder[index] ?? index;
      if (base) state.debugDummies[slot] = tuneStressUnit(makeUnit(base, tier), "enemy");
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
    await combat.simulate();
    running = false;
    const durationMs = performance.now() - startedAt;
    const sorted = frames.slice(1).sort((a, b) => a - b);
    const summary = {
      runId,
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
    };
    console.info("[rumia-combat-stress]", JSON.stringify(summary));
    return summary;
  };

  if (searchParams.has("combat-stress")) {
    window.setTimeout(() => window.__rumiaCombatStress(), 900);
  }
}
