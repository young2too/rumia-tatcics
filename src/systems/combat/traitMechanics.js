// 시너지 규칙의 단계 수치와 증강 보정을 전투 유닛용 설정으로 해석합니다.
import { augmentEffects, unitTraits } from "../augmentEffects.js";

export const MAJOR_TRAITS = new Set(["격전", "정조준", "철벽", "술식", "암습", "진형", "투혼", "연대"]);

function activeTier(rule, count) {
  return rule?.tiers?.filter((tier) => count >= tier.need).at(-1) || null;
}

export function resolveTraitMechanics(unit, counts, traitRules, augmentState) {
  const mechanics = {};
  const mechanicMultipliers = {};
  const active = [];
  for (const trait of unitTraits(unit)) {
    const rule = traitRules?.[trait];
    const count = counts?.[trait] || 0;
    const tier = activeTier(rule, count);
    if (!tier) continue;
    Object.assign(mechanics, tier.mechanics || {});
    active.push({ trait, count, need: tier.need, category: rule.category || (MAJOR_TRAITS.has(trait) ? "major" : "minor") });

    for (const effect of augmentEffects(augmentState, "traitRulePatch")) {
      if (effect.trait !== trait) continue;
      Object.assign(mechanics, effect.patch || {});
    }
    for (const effect of augmentEffects(augmentState, "traitCrown")) {
      if (effect.trait !== trait) continue;
      const finalNeed = rule?.tiers?.at(-1)?.need || 0;
      const overcap = Math.max(0, count - finalNeed);
      if (overcap) {
        for (const [key, amount] of Object.entries(effect.rulePatchPerOvercap?.add || {})) {
          mechanics[key] = (Number(mechanics[key]) || 0) + Number(amount || 0) * overcap;
        }
        for (const [key, amount] of Object.entries(effect.rulePatchPerOvercap?.multiply || {})) {
          mechanicMultipliers[key] = (mechanicMultipliers[key] || 1) * (1 + Number(amount || 0) * overcap);
        }
      }
    }
  }
  return { ...mechanics, activeTraits: active, mechanicMultipliers };
}

export function hasActiveTrait(unit, trait) {
  return unit?.traitMechanics?.activeTraits?.some((entry) => entry.trait === trait) || false;
}

export function mechanicValue(unit, key, fallback = 0) {
  const value = Number(unit?.traitMechanics?.[key]);
  if (!Number.isFinite(value)) return fallback;
  const multiplier = Number(unit?.traitMechanics?.mechanicMultipliers?.[key]) || 1;
  if (["heatRequired", "overloadMs", "chainRequired"].includes(key)) return value;
  if (key.endsWith("Multiply")) return 1 + (value - 1) * multiplier;
  return value * multiplier;
}
