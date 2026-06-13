export function makeUnit(base, balance, tier = 1) {
  const tierIndex = tier - 1;
  return {
    ...base,
    id: crypto.randomUUID(),
    tier,
    cost: base.cost,
    maxHp: Math.round(base.hp * balance.tier.hp[tierIndex]),
    hp: Math.round(base.hp * balance.tier.hp[tierIndex]),
    atk: Math.round(base.atk * balance.tier.atk[tierIndex]),
    speed: base.speed,
    skillAmp: Math.round(base.skillAmp * balance.tier.skillAmp[tierIndex]),
    defense: Math.round(base.defense * balance.tier.defense[tierIndex]),
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

export function sellValue(unit) {
  return unit.cost * unitCopyCount(unit);
}

export function stockLimit(unit, balance) {
  return balance.shop.stockByCost[unit.cost] || 0;
}
