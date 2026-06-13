import { sellValue, unitCopyCount, stockLimit } from "../core/units.js";

export function createShopController({
  state,
  balance,
  roster,
  makeUnit,
  sample,
  boardUnits,
  boardLimit,
  addLog,
  render,
}) {
  function ownedThreeStarNames() {
    return new Set([...state.bench, ...state.board].filter((unit) => unit?.tier >= 3).map((unit) => unit.name));
  }

  function canAppearInShop(unit) {
    return (state.pool[unit.name] || 0) > 0 && !ownedThreeStarNames().has(unit.name);
  }

  function weightedCostForLevel(level) {
    const odds = balance.shop.costOdds[level] || balance.shop.costOdds[balance.player.maxLevel];
    const roll = Math.random() * 100;
    let sum = 0;
    for (let i = 0; i < odds.length; i++) {
      sum += odds[i];
      if (roll < sum) return i + 1;
    }
    return 1;
  }

  function availableRosterByCost(cost) {
    return roster.filter((unit) => unit.cost === cost && canAppearInShop(unit));
  }

  function pickShopUnitBase() {
    const preferredCost = weightedCostForLevel(state.level);
    const preferred = availableRosterByCost(preferredCost);
    if (preferred.length) return sample(preferred);

    const odds = balance.shop.costOdds[state.level] || balance.shop.costOdds[balance.player.maxLevel];
    const fallbackCosts = odds
      .map((chance, index) => ({ cost: index + 1, chance }))
      .filter((entry) => entry.chance > 0)
      .sort((a, b) => b.chance - a.chance)
      .map((entry) => entry.cost);
    for (const cost of fallbackCosts) {
      const available = availableRosterByCost(cost);
      if (available.length) return sample(available);
    }
    return sample(roster.filter(canAppearInShop));
  }

  function pruneShopForOwnedThreeStars() {
    const blocked = ownedThreeStarNames();
    if (!blocked.size) return;
    state.shop = state.shop.filter((unit) => !blocked.has(unit.name));
  }

  function rollShop() {
    const size = Math.min(balance.shop.maxSize, balance.shop.baseSize + state.level);
    state.shop = Array.from({ length: size }, () => {
      const base = pickShopUnitBase();
      return base ? makeUnit(base, 1) : null;
    }).filter(Boolean);
    render();
  }

  function ownedCopies(name, tier) {
    return [...state.bench, ...state.board].filter((unit) => unit?.name === name && unit.tier === tier);
  }

  function canBuyIntoImmediateCombine(unit) {
    return unit?.tier === 1 && ownedCopies(unit.name, 1).length >= 2;
  }

  function forceCombinePurchasedUnit(unit) {
    let removed = 0;
    let firstRemoved = null;
    for (const arr of [state.bench, state.board]) {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i]?.name === unit.name && arr[i]?.tier === unit.tier && removed < 2) {
          if (!firstRemoved) firstRemoved = { arr, index: i };
          arr[i] = null;
          removed++;
        }
      }
    }

    if (removed < 2 || !firstRemoved) return false;
    firstRemoved.arr[firstRemoved.index] = makeUnit(roster.find((base) => base.name === unit.name), unit.tier + 1);
    addLog(`${unit.name} ${unit.tier + 1}성 합성!`);
    return true;
  }

  function combineUnits(name) {
    let changed = false;
    while (true) {
      const all = [...state.bench, ...state.board].filter((unit) => unit && unit.name === name);
      const sameTier = [2, 1].find((tier) => all.filter((unit) => unit.tier === tier).length >= 3);
      if (!sameTier) return changed;

      let removed = 0;
      let firstRemoved = null;
      for (const arr of [state.bench, state.board]) {
        for (let i = 0; i < arr.length; i++) {
          if (arr[i]?.name === name && arr[i]?.tier === sameTier && removed < 3) {
            if (!firstRemoved) firstRemoved = { arr, index: i };
            arr[i] = null;
            removed++;
          }
        }
      }

      const upgraded = makeUnit(roster.find((unit) => unit.name === name), sameTier + 1);
      if (firstRemoved) {
        firstRemoved.arr[firstRemoved.index] = upgraded;
      } else {
        const benchSlot = state.bench.findIndex((unit) => !unit);
        const boardSlot = state.board.findIndex((unit) => !unit);
        if (benchSlot >= 0) {
          state.bench[benchSlot] = upgraded;
        } else if (boardSlot >= 0) {
          state.board[boardSlot] = upgraded;
        }
      }
      changed = true;
      addLog(`${name} ${sameTier + 1}성 합성!`);
    }
  }

  function combineAllUnits() {
    let changed = false;
    do {
      changed = false;
      const names = new Set([...state.bench, ...state.board].filter(Boolean).map((unit) => unit.name));
      for (const name of names) {
        if (combineUnits(name)) changed = true;
      }
    } while (changed);
    pruneShopForOwnedThreeStars();
  }

  function buyUnit(index) {
    if (state.busy) return;
    const unit = state.shop[index];
    const slot = state.bench.findIndex((x) => !x);
    const combinesImmediately = canBuyIntoImmediateCombine(unit);
    if (!unit) return;
    if (slot < 0 && !combinesImmediately) return addLog("벤치가 가득 찼습니다.");
    if ((state.pool[unit.name] || 0) <= 0) return addLog(`${unit.name} 재고가 없습니다.`);
    if (state.gold < unit.cost) return addLog("크레딧이 부족합니다.");
    state.gold -= unit.cost;
    state.pool[unit.name] -= 1;
    if (slot >= 0) {
      state.bench[slot] = unit;
    } else {
      forceCombinePurchasedUnit(unit);
    }
    state.shop.splice(index, 1);
    addLog(`${unit.name} 영입 완료.`);
    combineAllUnits();
    render();
  }

  function sellSelectedUnit() {
    if (state.busy || !state.selected) return;
    const arr = state[state.selected.source];
    const unit = arr?.[state.selected.index];
    if (!unit || state.selected.source === "enemy") return;
    const value = sellValue(unit);
    const returned = unitCopyCount(unit);
    state.gold += value;
    state.pool[unit.name] = Math.min(stockLimit(unit, balance), (state.pool[unit.name] || 0) + returned);
    arr[state.selected.index] = null;
    state.selected = null;
    addLog(`${unit.name} 판매: ${value} 크레딧 획득, 풀 ${returned}개 반환.`);
    render();
  }

  function moveUnit(target, targetIndex) {
    if (!state.dragging || state.busy) return;
    moveFrom(state.dragging, target, targetIndex);
  }

  function moveSelected(target, targetIndex) {
    if (!state.selected || state.busy) return;
    moveFrom(state.selected, target, targetIndex);
  }

  function moveFrom(from, target, targetIndex) {
    if (from.source === "enemy") return;
    const srcArr = state[from.source];
    const dstArr = state[target];
    const unit = srcArr[from.index];
    if (!unit) return;
    const limit = boardLimit();
    const addsBoardUnit = from.source !== "board" && target === "board" && !dstArr[targetIndex];
    if (addsBoardUnit && boardUnits().length >= limit) {
      addLog(`현재 레벨 배치 한도는 ${limit}명입니다.`);
      render();
      return;
    }
    srcArr[from.index] = dstArr[targetIndex];
    dstArr[targetIndex] = unit;
    state.selected = null;
    combineAllUnits();
    render();
  }

  return {
    buyUnit,
    combineAllUnits,
    moveSelected,
    moveUnit,
    rollShop,
    sellSelectedUnit,
  };
}
