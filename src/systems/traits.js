import { applyStatPatch, augmentOvercapEffects, augmentTraitCountAdditions } from "./augmentEffects.js";

export function createTraitController({ state, traitRules, boardUnits }) {
  function unitTraits(unit) {
    const traits = Array.isArray(unit.traits) && unit.traits.length ? unit.traits : [unit.trait];
    return Array.from(new Set(traits.filter(Boolean)));
  }

  function activeTraits() {
    const counts = {};
    const uniqueByTrait = {};
    for (const unit of boardUnits()) {
      for (const trait of unitTraits(unit)) {
        uniqueByTrait[trait] ||= new Set();
        uniqueByTrait[trait].add(unit.name);
      }
    }
    for (const [trait, names] of Object.entries(uniqueByTrait)) counts[trait] = names.size;
    const additions = augmentTraitCountAdditions(state);
    for (const [trait, add] of Object.entries(additions)) counts[trait] = (counts[trait] || 0) + add;
    return counts;
  }

  function activeTraitTier(rule, count) {
    return rule?.tiers?.filter((tier) => count >= tier.need).at(-1) || null;
  }

  function nextTraitNeed(rule, count) {
    return rule?.tiers?.find((tier) => count < tier.need)?.need || rule?.tiers?.at(-1)?.need || 0;
  }

  function applySynergy(unit, counts, augmentState = state) {
    const stats = {
      hp: unit.maxHp,
      atk: unit.atk,
      speed: unit.speed,
      skillAmp: unit.skillAmp,
      defense: unit.defense,
      heal: 1,
      healTargets: unit.healTargets ?? 2,
      critChance: unit.critChance ?? 0,
      critDamage: unit.critDamage ?? 1.5,
      skillCritChance: unit.skillCritChance ?? 0,
      skillCritDamage: unit.skillCritDamage ?? 1.5,
      openingCritMultiplier: unit.openingCritMultiplier ?? 1,
      lifeSteal: unit.lifeSteal ?? 0,
      damageReduction: unit.damageReduction ?? 0,
      manaGain: unit.manaGain ?? 1,
      skillTargets: unit.skillTargets ?? 2,
      rangeBonus: unit.rangeBonus ?? 0,
      maxMana: unit.maxMana ?? 100,
      maxManaReduction: unit.maxManaReduction ?? 0,
      extraAttackEvery: unit.extraAttackEvery ?? 0,
      extraAttackDamageRatio: unit.extraAttackDamageRatio ?? 1,
      basicAttackExtraTargets: unit.basicAttackExtraTargets ?? 0,
      healReductionOnHit: unit.healReductionOnHit ?? 0,
      healReductionTicks: unit.healReductionTicks ?? 0,
      backlineShieldTargets: unit.backlineShieldTargets ?? 0,
      backlineShieldRatio: unit.backlineShieldRatio ?? 0,
      frontlineShieldTargets: unit.frontlineShieldTargets ?? 0,
      frontlineShieldRatio: unit.frontlineShieldRatio ?? 0,
      pullBacklineTargets: unit.pullBacklineTargets ?? 0,
      openingMana: unit.openingMana ?? 0,
      manaOnHitBonus: unit.manaOnHitBonus ?? 0,
      supportAidHpRatio: unit.supportAidHpRatio ?? 0,
      supportAidDefense: unit.supportAidDefense ?? 0,
      supportAidDamageReduction: unit.supportAidDamageReduction ?? 0,
      duelSameTargetDamageAdd: unit.duelSameTargetDamageAdd ?? 0,
      duelSameTargetLifeStealAdd: unit.duelSameTargetLifeStealAdd ?? 0,
      duelSameTargetMaxStacks: unit.duelSameTargetMaxStacks ?? 0,
      huntMarkTargets: unit.huntMarkTargets ?? 0,
      huntMarkedDamageAdd: unit.huntMarkedDamageAdd ?? 0,
      huntFocusMarked: unit.huntFocusMarked ?? 0,
      huntMarkedDefenseApplyRatio: unit.huntMarkedDefenseApplyRatio ?? 1,
      huntTransferStunMs: unit.huntTransferStunMs ?? 0,
      precisionCritRequired: unit.precisionCritRequired ?? 0,
      precisionStunMs: unit.precisionStunMs ?? 0,
      precisionStunCooldownMs: unit.precisionStunCooldownMs ?? 0,
      spellCastShieldRatio: unit.spellCastShieldRatio ?? 0,
      spellCastShieldDurationMs: unit.spellCastShieldDurationMs ?? 0,
      guardianStrikeEvery: unit.guardianStrikeEvery ?? 0,
      guardianStrikeHpRatio: unit.guardianStrikeHpRatio ?? 0,
      assassinOpeningDamageReduction: unit.assassinOpeningDamageReduction ?? 0,
      assassinOpeningProtectionMs: unit.assassinOpeningProtectionMs ?? 0,
      assassinRearmCritMultiplier: unit.assassinRearmCritMultiplier ?? 0,
      assassinRearmCooldownMs: unit.assassinRearmCooldownMs ?? 0,
    };
    for (const trait of unitTraits(unit)) {
      const rule = traitRules[trait];
      const tier = activeTraitTier(rule, counts[trait] || 0);
      for (const effect of tier?.effects || []) {
        if (!(effect.stat in stats)) continue;
        if (Number.isFinite(effect.set)) stats[effect.stat] = effect.set;
        if (Number.isFinite(effect.multiply)) stats[effect.stat] *= effect.multiply;
        if (Number.isFinite(effect.add)) stats[effect.stat] += effect.add;
      }
    }
    const overcap = augmentOvercapEffects(augmentState, traitRules, counts);
    for (const trait of unitTraits(unit)) {
      if (overcap[trait]) applyStatPatch(stats, overcap[trait]);
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
