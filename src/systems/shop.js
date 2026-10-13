import { poolBackedCopyCount, preservePoolExemptCopies, sellValue, stockLimit, unitCopyCount } from "../core/units.js";
import { augmentSellValue, augmentShopOddsLevel, augmentShopSize, augmentUnitCost, augmentCanSell, augmentEffects } from "./augmentEffects.js";

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
  reservePoolUnit = null,
  releasePoolUnit = null,
  syncPoolHoldings = null,
  canModify = () => true,
}) {
  function ownedThreeStarNames() {
    return new Set([...state.bench, ...state.board].filter((unit) => unit?.tier >= 3).map((unit) => unit.name));
  }

  function canAppearInShop(unit) {
    return (state.pool[unit.name] || 0) > 0 && !ownedThreeStarNames().has(unit.name);
  }

  function weightedCostForLevel(level) {
    const oddsLevel = augmentShopOddsLevel(state, level, balance.player.maxLevel);
    const odds = balance.shop.costOdds[oddsLevel] || balance.shop.costOdds[balance.player.maxLevel];
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

    const oddsLevel = augmentShopOddsLevel(state, state.level, balance.player.maxLevel);
    const odds = balance.shop.costOdds[oddsLevel] || balance.shop.costOdds[balance.player.maxLevel];
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
    const size = augmentShopSize(state, Math.min(balance.shop.maxSize, balance.shop.baseSize + state.level), balance.shop.maxSize);
    state.shop = Array.from({ length: size }, () => {
      const base = pickShopUnitBase();
      return base ? makeUnit(base, 1) : null;
    }).filter(Boolean);
    render();
  }

  function ownedCopies(name, tier) {
    return [...state.bench, ...state.board].filter((unit) => unit?.name === name && unit.tier === tier);
  }

  function matchingUnitSlots(name, tier) {
    const slots = [];
    for (const source of ["board", "bench"]) {
      const arr = state[source];
      for (let index = 0; index < arr.length; index++) {
        if (arr[index]?.name === name && arr[index]?.tier === tier) {
          slots.push({ source, arr, index });
        }
      }
    }
    return slots;
  }

  function upgradeSlotFor(slots) {
    return slots.find((slot) => slot.source === "board") || slots[0] || null;
  }

  function canBuyIntoImmediateCombine(unit) {
    return unit?.tier === 1 && ownedCopies(unit.name, 1).length >= 2;
  }

  function forceCombinePurchasedUnit(unit) {
    const slots = matchingUnitSlots(unit.name, unit.tier).slice(0, 2);
    const targetSlot = upgradeSlotFor(slots);
    if (slots.length < 2 || !targetSlot) return false;
    const consumedUnits = [...slots.map((slot) => slot.arr[slot.index]), unit];
    slots.forEach((slot) => {
      slot.arr[slot.index] = null;
    });
    targetSlot.arr[targetSlot.index] = preservePoolExemptCopies(
      makeUnit(roster.find((base) => base.name === unit.name), unit.tier + 1),
      consumedUnits,
    );
    addLog(`${unit.name} ${unit.tier + 1}성 합성!`);
    return true;
  }

  function combineUnits(name) {
    let changed = false;
    while (true) {
      const all = [...state.bench, ...state.board].filter((unit) => unit && unit.name === name);
      const sameTier = [2, 1].find((tier) => all.filter((unit) => unit.tier === tier).length >= 3);
      if (!sameTier) return changed;

      const slots = matchingUnitSlots(name, sameTier).slice(0, 3);
      const targetSlot = upgradeSlotFor(slots);
      if (slots.length < 3 || !targetSlot) return changed;

      const consumedUnits = slots.map((slot) => slot.arr[slot.index]);
      slots.forEach((slot) => {
        slot.arr[slot.index] = null;
      });

      const upgraded = preservePoolExemptCopies(
        makeUnit(roster.find((unit) => unit.name === name), sameTier + 1),
        consumedUnits,
      );
      targetSlot.arr[targetSlot.index] = upgraded;
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

  async function buyUnit(index) {
    if (state.busy || state.shopTransactionPending || !canModify()) return;
    const unit = state.shop[index];
    const slot = state.bench.findIndex((x) => !x);
    const combinesImmediately = canBuyIntoImmediateCombine(unit);
    if (!unit) return;
    if (slot < 0 && !combinesImmediately) return addLog("벤치가 가득 찼습니다.");
    if ((state.pool[unit.name] || 0) <= 0) return addLog(`${unit.name} 재고가 없습니다.`);
    const cost = augmentUnitCost(state, unit);
    if (state.gold < cost) return addLog("크레딧이 부족합니다.");
    state.shopTransactionPending = true;
    render();
    try {
      if (reservePoolUnit) {
        const remaining = await reservePoolUnit(unit, 1);
        if (Number.isFinite(Number(remaining))) state.pool[unit.name] = Number(remaining);
      } else {
        state.pool[unit.name] -= 1;
      }
      state.gold -= cost;
      if (slot >= 0) {
        state.bench[slot] = unit;
      } else {
        forceCombinePurchasedUnit(unit);
      }
      state.shop.splice(index, 1);
      addLog(`${unit.name} 영입 완료${cost !== unit.cost ? ` (${cost}크레딧)` : ""}.`);
      combineAllUnits();
    } catch (error) {
      if (/out of stock|재고/i.test(String(error?.message || error))) {
        state.pool[unit.name] = 0;
        state.shop = state.shop.filter((candidate) => candidate?.name !== unit.name);
        addLog(`${unit.name}의 공유 재고가 모두 소진되었습니다.`, { force: true });
      } else {
        addLog(`영입 처리 실패: ${String(error?.message || error)}`, { force: true });
      }
    } finally {
      state.shopTransactionPending = false;
      render();
    }
  }

  function debugRecruitUnit(query) {
    if (!state.debugMode || state.busy || !canModify()) return;
    const normalized = String(query || "").trim().toLocaleLowerCase("ko");
    if (!normalized) return addLog("영입할 캐릭터 이름을 입력하세요.");
    const base = roster.find((unit) => unit.name.toLocaleLowerCase("ko") === normalized)
      || roster.find((unit) => unit.name.toLocaleLowerCase("ko").includes(normalized));
    if (!base) return addLog(`'${query}'에 해당하는 캐릭터를 찾지 못했습니다.`);
    const slot = state.bench.findIndex((unit) => !unit);
    if (slot < 0) return addLog("벤치가 가득 찼습니다.");
    state.bench[slot] = makeUnit(base, 1);
    state.bench[slot].poolExemptCopies = unitCopyCount(state.bench[slot]);
    state.bench[slot].poolExemptSource = "debug-recruit";
    addLog(`[디버그] ${base.name} 즉시 영입.`);
    combineAllUnits();
    render();
  }

  async function grantBonusUnit(base, { source = "bonus", allowPoolExempt = true } = {}) {
    if (!base || state.busy || state.shopTransactionPending || !canModify()) return false;
    const unit = makeUnit(base, 1);
    const slot = state.bench.findIndex((candidate) => !candidate);
    const combinesImmediately = canBuyIntoImmediateCombine(unit);
    if (slot < 0 && !combinesImmediately) {
      addLog("벤치가 가득 차 기물을 받을 수 없습니다.");
      return false;
    }

    state.shopTransactionPending = true;
    render();
    try {
      const available = Math.max(0, Number(state.pool[base.name]) || 0);
      if (available > 0) {
        if (reservePoolUnit) {
          const remaining = await reservePoolUnit(unit, 1);
          if (Number.isFinite(Number(remaining))) state.pool[base.name] = Number(remaining);
        } else {
          state.pool[base.name] = available - 1;
        }
      } else if (allowPoolExempt) {
        unit.poolExemptCopies = 1;
        unit.poolExemptSource = source;
      } else {
        addLog(`${base.name} 재고가 없습니다.`);
        return false;
      }

      if (slot >= 0) state.bench[slot] = unit;
      else forceCombinePurchasedUnit(unit);
      combineAllUnits();
      addLog(`${base.name} 1성을 획득했습니다.`);
      return true;
    } catch (error) {
      if (!allowPoolExempt || !/out of stock|재고/i.test(String(error?.message || error))) {
        addLog(`기물 지급 실패: ${String(error?.message || error)}`, { force: true });
        return false;
      }
      unit.poolExemptCopies = 1;
      unit.poolExemptSource = source;
      state.pool[base.name] = 0;
      if (slot >= 0) state.bench[slot] = unit;
      else forceCombinePurchasedUnit(unit);
      combineAllUnits();
      addLog(`${base.name} 1성을 공유 풀 외 보너스로 획득했습니다.`);
      return true;
    } finally {
      state.shopTransactionPending = false;
      render();
    }
  }

  async function sellSelectedUnit() {
    if (state.busy || state.shopTransactionPending || !state.selected || !canModify()) return;
    const arr = state[state.selected.source];
    const unit = arr?.[state.selected.index];
    if (!unit || state.selected.source === "enemy") return;
    const value = sellValue(unit);
    if (!augmentCanSell(state)) return addLog("현재 증강 효과로 유닛을 판매할 수 없습니다.");
    const adjustedValue = augmentSellValue(state, value);
    const returned = poolBackedCopyCount(unit);
    state.shopTransactionPending = true;
    render();
    try {
      if (releasePoolUnit) {
        if (syncPoolHoldings) await syncPoolHoldings();
        if (returned > 0) {
          const remaining = await releasePoolUnit(unit, returned);
          if (Number.isFinite(Number(remaining))) state.pool[unit.name] = Number(remaining);
        }
      } else {
        state.pool[unit.name] = Math.min(stockLimit(unit, balance), (state.pool[unit.name] || 0) + returned);
      }
      state.gold += adjustedValue;
      arr[state.selected.index] = null;
      state.selected = null;
      addLog(`${unit.name} 판매: ${adjustedValue} 크레딧 획득${releasePoolUnit ? "." : `, 풀 ${returned}개 반환.`}`);
    } catch (error) {
      addLog(`판매 처리 실패: ${String(error?.message || error)}`, { force: true });
    } finally {
      state.shopTransactionPending = false;
      render();
    }
  }

  function moveUnit(target, targetIndex) {
    if (!state.dragging || state.busy || !canModify()) return;
    moveFrom(state.dragging, target, targetIndex);
  }

  function moveSelected(target, targetIndex) {
    if (!state.selected || state.busy || !canModify()) return;
    moveFrom(state.selected, target, targetIndex);
  }

  function moveFrom(from, target, targetIndex) {
    if (from.source === "enemy") return;
    const srcArr = state[from.source];
    const dstArr = state[target];
    const unit = srcArr[from.index];
    if (!unit) return;
    const limit = boardLimit();
    const duplicateLimit = Math.max(1, ...augmentEffects(state, "duplicateFieldLimit").map((effect) => Number(effect.maxSameCharacterOnBoard) || 1));
    if (target === "board" && unit && from.source !== "board") {
      const sameNameCount = state.board.filter((candidate, index) => candidate?.name === unit.name && index !== targetIndex).length;
      if (sameNameCount >= duplicateLimit) {
        addLog(`${unit.name}은 전장에 최대 ${duplicateLimit}명까지 배치할 수 있습니다.`);
        render();
        return;
      }
    }
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
    grantBonusUnit,
    debugRecruitUnit,
    moveSelected,
    moveUnit,
    rollShop,
    sellSelectedUnit,
  };
}
