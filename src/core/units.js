import { tierStatMultiplier } from "./tier.js";

export function makeUnit(base, balance, tier = 1) {
  const baseStatMultiplier = balance.playerBaseStatMultiplierByCost?.[String(base.cost)] ?? 1;
  const hpMultiplier = tierStatMultiplier(balance, base.cost, tier, "hp");
  const atkMultiplier = tierStatMultiplier(balance, base.cost, tier, "atk");
  const skillAmpMultiplier = tierStatMultiplier(balance, base.cost, tier, "skillAmp");
  const defenseMultiplier = tierStatMultiplier(balance, base.cost, tier, "defense");
  return {
    ...base,
    id: crypto.randomUUID(),
    tier,
    cost: base.cost,
    maxHp: Math.round(base.hp * baseStatMultiplier * hpMultiplier),
    hp: Math.round(base.hp * baseStatMultiplier * hpMultiplier),
    atk: Math.round(base.atk * baseStatMultiplier * atkMultiplier),
    speed: base.speed,
    skillAmp: Math.round(base.skillAmp * baseStatMultiplier * skillAmpMultiplier),
    defense: Math.round(base.defense * baseStatMultiplier * defenseMultiplier),
  };
}

export function createUnitPool(roster, balance) {
  return Object.fromEntries(roster.map((unit) => [unit.name, balance.shop.stockByCost[unit.cost] || 0]));
}

export function sample(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function unitCopyCount(unit) {
  return unit.tier === 3 ? 9 : unit.tier === 2 ? 3 : 1;
}

export function poolExemptCopyCount(unit) {
  return Math.max(0, Math.min(unitCopyCount(unit), Math.floor(Number(unit?.poolExemptCopies) || 0)));
}

export function poolBackedCopyCount(unit) {
  return Math.max(0, unitCopyCount(unit) - poolExemptCopyCount(unit));
}

export function preservePoolExemptCopies(target, sources = []) {
  if (!target) return target;
  const exemptCopies = sources.reduce((sum, unit) => sum + poolExemptCopyCount(unit), 0);
  if (exemptCopies > 0) target.poolExemptCopies = Math.min(unitCopyCount(target), exemptCopies);
  return target;
}

export function sellValue(unit) {
  return unit.cost * unitCopyCount(unit);
}

export function stockLimit(unit, balance) {
  return balance.shop.stockByCost[unit.cost] || 0;
}
