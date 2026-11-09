export function unitTraits(unit) {
  const traits = Array.isArray(unit.traits) && unit.traits.length ? unit.traits : [unit.trait];
  return Array.from(new Set(traits.filter(Boolean)));
}

export function unitTraitText(unit) {
  return unitTraits(unit).join(", ");
}

export function traitPills(unit) {
  return unitTraits(unit).map((trait) => `<i>${trait}</i>`).join("");
}

export function traitCountsFor(units) {
  const uniqueByTrait = {};
  for (const unit of units) {
    for (const trait of unitTraits(unit)) {
      uniqueByTrait[trait] ||= new Set();
      uniqueByTrait[trait].add(unit.name);
    }
  }
  return Object.fromEntries(Object.entries(uniqueByTrait).map(([trait, names]) => [trait, names.size]));
}

const STAT_ICON_POSITION = {
  atk: 11,
  speed: 40,
  crit: 69,
  range: 99,
  armorPen: 129,
  skillAmp: 158,
  cooldown: 188,
  hp: 217,
  defense: 247,
  damageReduction: 277,
  tenacity: 306,
  vision: 336,
  lifeSteal: 365,
  moveSpeed: 395,
};

const effectFor = (tier, stat) => tier?.effects?.find((effect) => effect.stat === stat);
const percent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;
const bonusPercent = (effect) => effect?.multiply != null
  ? `+${percent(Number(effect.multiply) - 1)}`
  : `+${percent(effect?.add ?? effect?.set)}`;

function statBadge(icon, label, value) {
  return `<span class="trait-stat" title="${label} ${value}" aria-label="${label} ${value}"><i class="stat-icon stat-${icon}" style="--stat-x: -${STAT_ICON_POSITION[icon]}px" aria-hidden="true"></i><b>${value}</b></span>`;
}

function mechanicLine(text) {
  return text ? `<span class="trait-mechanic">${text}</span>` : "";
}

export function traitTierMarkup(trait, tier, next = false) {
  if (!tier) return "";
  const badges = [];
  const addMultiplyBadge = (stat, icon, label) => {
    const effect = effectFor(tier, stat);
    if (effect) badges.push(statBadge(icon, label, bonusPercent(effect)));
  };

  addMultiplyBadge("atk", "atk", "공격력");
  addMultiplyBadge("speed", "speed", "공격속도");
  addMultiplyBadge("critChance", "crit", "치명타 확률");
  addMultiplyBadge("skillCritChance", "crit", "스킬 치명타 확률");
  addMultiplyBadge("skillAmp", "skillAmp", "스킬 피해");
  addMultiplyBadge("hp", "hp", "체력");
  addMultiplyBadge("defense", "defense", "방어력");
  const damageReduction = effectFor(tier, "damageReduction");
  if (damageReduction) badges.push(statBadge("damageReduction", "받는 피해 감소", `-${percent(damageReduction.add ?? damageReduction.set)}`));
  addMultiplyBadge("lifeSteal", "lifeSteal", "모든 피해 흡혈");

  const supportHp = effectFor(tier, "supportAidHpRatio");
  const supportDefense = effectFor(tier, "supportAidDefense");
  const supportReduction = effectFor(tier, "supportAidDamageReduction");
  const range = effectFor(tier, "rangeBonus");
  if (supportHp) badges.push(statBadge("hp", "회복/보호막 대상 체력", `+${percent(supportHp.add)}`));
  if (supportDefense) badges.push(statBadge("defense", "회복/보호막 대상 방어력", `+${supportDefense.add}`));
  if (supportReduction) badges.push(statBadge("damageReduction", "회복/보호막 대상 받는 피해 감소", `-${percent(supportReduction.add)}`));
  if (range) badges.push(statBadge("range", "사거리", `+${range.set}칸`));

  const usesStructuredLayout = badges.length;
  if (!usesStructuredLayout) return `${next ? "다음 단계: " : ""}${tier.text}`;
  return `
    ${next ? `<span class="trait-next-label">다음 단계</span>` : ""}
    ${badges.length ? `<span class="trait-stat-row">${badges.join("")}</span>` : ""}
    ${mechanicLine(tier.text)}
  `;
}

export function traitSummary(rule) {
  return rule?.summary || rule?.tiers?.[0]?.text || "시너지 효과 획득";
}
