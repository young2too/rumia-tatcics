export function createTraitController({ state, traitRules, boardUnits }) {
  function activeTraits() {
    const counts = {};
    const uniqueByTrait = {};
    for (const unit of boardUnits()) {
      uniqueByTrait[unit.trait] ||= new Set();
      uniqueByTrait[unit.trait].add(unit.name);
    }
    for (const [trait, names] of Object.entries(uniqueByTrait)) counts[trait] = names.size;
    return counts;
  }

  function activeTraitTier(rule, count) {
    return rule?.tiers?.filter((tier) => count >= tier.need).at(-1) || null;
  }

  function nextTraitNeed(rule, count) {
    return rule?.tiers?.find((tier) => count < tier.need)?.need || rule?.tiers?.at(-1)?.need || 0;
  }

  function applySynergy(unit, counts) {
    const stats = {
      hp: unit.maxHp,
      atk: unit.atk,
      speed: unit.speed,
      skillAmp: unit.skillAmp,
      defense: unit.defense,
      heal: 1,
      critChance: unit.critChance ?? 0,
      critDamage: unit.critDamage ?? 1.5,
      openingCritMultiplier: unit.openingCritMultiplier ?? 1,
      lifeSteal: unit.lifeSteal ?? 0,
      damageReduction: unit.damageReduction ?? 0,
    };
    const rule = traitRules[unit.trait];
    const tier = activeTraitTier(rule, counts[unit.trait] || 0);
    for (const effect of tier?.effects || []) {
      if (!(effect.stat in stats)) continue;
      if (Number.isFinite(effect.multiply)) stats[effect.stat] *= effect.multiply;
      if (Number.isFinite(effect.add)) stats[effect.stat] += effect.add;
    }
    return stats;
  }

  return {
    activeTraits,
    activeTraitTier,
    applySynergy,
    nextTraitNeed,
  };
}
