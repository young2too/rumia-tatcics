export function tierStatMultiplier(balance, cost, tier, stat) {
  const tierIndex = Math.max(0, tier - 1);
  const costKey = String(cost);
  const costTable = balance.tierByCost?.[costKey]?.[stat];
  if (Array.isArray(costTable) && Number.isFinite(costTable[tierIndex])) {
    return costTable[tierIndex];
  }
  return balance.tier?.[stat]?.[tierIndex] ?? 1;
}
