export function createBattlefieldView({ state, refs, balance, unitNode, moveUnit, moveSelected, placeDebugDummy, previewBossEnemies, temporaryBoostConfig, temporaryBoostPercent }) {
  function dualContractSlotType(index) {
    if (state.combatGrid) return "";
    const effects = (state.selectedAugments || []).map((augment) => augment?.effect).filter((effect) => effect?.type === "dualContractSlots");
    if (!effects.length) return "";
    if (effects.some((effect) => index === (effect.frontIndex ?? 3))) return "front";
    if (effects.some((effect) => index === (effect.backIndex ?? 28))) return "back";
    return "";
  }

  function isPandoraBenchSlot(index) {
    if (state.combatGrid) return false;
    const slots = Math.max(0, ...(state.selectedAugments || [])
      .map((augment) => augment?.effect)
      .filter((effect) => effect?.type === "pandoraBench")
      .map((effect) => Number(effect.slots) || 3));
    return slots > 0 && index >= Math.max(0, state.bench.length - slots);
  }

  function createCell(unit, index, side, interactive = false) {
    const gridIndex = interactive ? index + balance.battle.enemySlots : index;
    const gridRow = Math.floor(gridIndex / balance.battle.columns);
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.style.setProperty("--depth", String(10 + gridRow));
    if (unit) cell.classList.add("has-unit");
    if (state.pendingAugmentTarget && interactive && unit?.tier >= 3) cell.classList.add("augment-target-slot");
    const contractType = interactive ? dualContractSlotType(index) : "";
    if (contractType) {
      cell.classList.add("dual-contract-slot", `dual-contract-${contractType}`);
      cell.title = contractType === "front" ? "이중 계약: 전열 계약 칸" : "이중 계약: 후열 계약 칸";
    }
    if (unit?.boss) cell.classList.add("boss-cell");
    if (state.combatGrid && unit) cell.classList.add("occupied", side);
    cell.dataset.row = String(gridRow);
    cell.dataset.col = String(index % balance.battle.columns);
    if (interactive) {
      cell.dataset.index = String(index);
      cell.addEventListener("dragover", (event) => {
        event.preventDefault();
        cell.classList.add("can-drop");
      });
      cell.addEventListener("dragleave", () => cell.classList.remove("can-drop"));
      cell.addEventListener("drop", () => moveUnit("board", index));
      cell.addEventListener("click", () => moveSelected("board", index));
    }
    if (!interactive && state.debugMode && !state.combatGrid && state.debugDummyPlacement) {
      cell.classList.add("debug-dummy-target");
      cell.title = unit?.trainingDummy ? "훈련 더미 제거" : "훈련 더미 배치";
      cell.addEventListener("click", () => placeDebugDummy(index));
    }
    if (unit) cell.append(unitNode(unit, state.combatGrid ? side : interactive ? "board" : "enemy", index, !interactive));
    return cell;
  }

  function renderBoard() {
    refs.board.innerHTML = "";
    const boardStart = balance.battle.enemySlots;
    const boardEnd = boardStart + state.board.length;
    const visibleBoard = state.combatGrid ? state.combatGrid.slice(boardStart, boardEnd) : state.board;
    visibleBoard.forEach((unit, index) => {
      const side = state.combatGrid && unit?.side ? unit.side : "ally";
      refs.board.append(createCell(unit, index, side, true));
    });

    refs.enemyBoard.innerHTML = "";
    const visibleEnemies = state.combatGrid
      ? state.combatGrid.slice(0, balance.battle.enemySlots)
      : state.debugMode && state.debugDummies.some(Boolean) ? state.debugDummies
      : state.enemies.some(Boolean) ? state.enemies : previewBossEnemies();
    visibleEnemies.forEach((unit, index) => {
      const side = state.combatGrid && unit?.side ? unit.side : "enemy";
      refs.enemyBoard.append(createCell(unit, index, side));
    });
    while (refs.enemyBoard.children.length < balance.battle.enemySlots) {
      refs.enemyBoard.append(createCell(null, refs.enemyBoard.children.length, "enemy"));
    }
  }

  function renderTemporaryBoosts() {
    if (!refs.temporaryBoosts) return;
    const config = temporaryBoostConfig();
    const cost = config.cost ?? 20;
    refs.temporaryBoosts.innerHTML = (config.stats || []).map((boost) => {
      const current = temporaryBoostPercent(boost.id);
      const label = current ? `${boost.label}강화 ${current}% 활성화 중` : `${boost.label}강화 ${cost}코`;
      return `<button class="temporary-boost" data-boost="${boost.id}" ${state.busy || state.gold < cost ? "disabled" : ""}><strong>${label}</strong></button>`;
    }).join("");
  }

  function renderBench() {
    refs.bench.innerHTML = "";
    renderTemporaryBoosts();
    refs.benchCount.textContent = `${state.bench.filter(Boolean).length}/8`;
    state.bench.forEach((unit, index) => {
      const slot = document.createElement("div");
      slot.className = "bench-slot";
      if (isPandoraBenchSlot(index)) {
        slot.classList.add("pandora-bench-slot");
        slot.title = "판도라의 벤치: 전투 종료 시 같은 코스트/성급의 무작위 유닛으로 변환";
      }
      if (state.pendingAugmentTarget && unit?.tier >= 3) slot.classList.add("augment-target-slot");
      slot.dataset.index = String(index);
      slot.addEventListener("dragover", (event) => {
        event.preventDefault();
        slot.classList.add("can-drop");
      });
      slot.addEventListener("dragleave", () => slot.classList.remove("can-drop"));
      slot.addEventListener("drop", () => moveUnit("bench", index));
      slot.addEventListener("click", () => moveSelected("bench", index));
      if (unit) slot.append(unitNode(unit, "bench", index));
      refs.bench.append(slot);
    });
  }

  return { renderBench, renderBoard };
}
