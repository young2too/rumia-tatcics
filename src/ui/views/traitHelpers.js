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
  const lines = [];
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

  if (trait === "정밀") {
    const hits = effectFor(tier, "precisionCritRequired")?.set;
    const stun = effectFor(tier, "precisionStunMs")?.set;
    if (hits && stun) lines.push(`정밀형 전체 치명타 ${hits}회마다 대상 ${(stun / 1000).toFixed(stun % 1000 ? 2 : 0).replace(/0+$/, "").replace(/\.$/, "")}초 기절`);
  } else if (trait === "수호") {
    const every = effectFor(tier, "guardianStrikeEvery")?.set;
    const ratio = effectFor(tier, "guardianStrikeHpRatio")?.set;
    if (every && ratio) lines.push(`${every}번째 평타마다 최대 체력 ${percent(ratio)} 고정 피해`);
  } else if (trait === "주술") {
    const manaGain = effectFor(tier, "manaGain");
    const manaReduction = effectFor(tier, "maxManaReduction")?.add;
    const critDamage = effectFor(tier, "skillCritDamage")?.add;
    const shield = effectFor(tier, "spellCastShieldRatio")?.set;
    if (manaGain || manaReduction) lines.push(`마나 획득 ${manaGain ? bonusPercent(manaGain) : "-"} · 요구 마나 -${manaReduction || 0}`);
    if (critDamage != null) lines.push(`스킬 치명 피해 ${percent(1.5 + critDamage)}`);
    if (shield) lines.push(`스킬 사용 시 최대 체력 ${percent(shield)} 보호막 · 1.5초`);
  } else if (trait === "결투") {
    const add = effectFor(tier, "duelSameTargetDamageAdd")?.add;
    const stacks = effectFor(tier, "duelSameTargetMaxStacks")?.set;
    if (add && stacks) lines.push(`같은 대상 재공격 피해 +${percent(add)} · 최대 ${stacks}중첩`);
  } else if (trait === "기습") {
    const opening = 1 + (effectFor(tier, "openingCritMultiplier")?.add || 0);
    const cooldown = (effectFor(tier, "assassinRearmCooldownMs")?.set || 0) / 1000;
    const critDamage = 1.5 + (effectFor(tier, "critDamage")?.add || 0);
    const reduction = effectFor(tier, "assassinOpeningDamageReduction")?.set;
    const protection = (effectFor(tier, "assassinOpeningProtectionMs")?.set || 0) / 1000;
    lines.push(`첫 평타 및 ${cooldown}초마다 다음 평타 ${percent(opening)} 치명`);
    lines.push(`치명 피해 ${percent(critDamage)}`);
    if (reduction) badges.push(statBadge("damageReduction", `전투 시작 후 ${protection}초간 받는 피해 감소`, `-${percent(reduction)} · ${protection}초`));
    lines.push("처치 관여 시 즉시 재장전");
  } else if (trait === "지원") {
    const heal = effectFor(tier, "heal");
    const manaGain = effectFor(tier, "manaGain");
    const manaReduction = effectFor(tier, "maxManaReduction")?.add;
    if (heal) badges.unshift(statBadge("hp", "지원형 회복량", bonusPercent(heal)));
    lines.push(`마나 획득 ${manaGain ? bonusPercent(manaGain) : "-"} · 요구 마나 -${manaReduction || 0}`);
  } else if (trait === "추적") {
    const markedDamage = effectFor(tier, "huntMarkedDamageAdd")?.set;
    const defenseRatio = effectFor(tier, "huntMarkedDefenseApplyRatio")?.set;
    const markTargets = effectFor(tier, "huntMarkTargets")?.set;
    const focus = effectFor(tier, "huntFocusMarked")?.set;
    const transferStun = effectFor(tier, "huntTransferStunMs")?.set;
    if (markedDamage) badges.push(statBadge("atk", "표식 대상에게 주는 피해", `+${percent(markedDamage)}`));
    if (defenseRatio != null) badges.push(statBadge("armorPen", "표식 대상 방어 무시", `${percent(1 - defenseRatio)}`));
    lines.push(`적 후열 우선 표식 ${markTargets || 1}명${focus ? " · 표식 우선 공격" : ""}`);
    if (transferStun) lines.push(`처치 시 표식 전이 · ${(transferStun / 1000).toFixed(1).replace(/\.0$/, "")}초 기절`);
  }

  const usesStructuredLayout = badges.length || lines.length;
  if (!usesStructuredLayout) return `${next ? "다음 단계: " : ""}${tier.text}`;
  return `
    ${next ? `<span class="trait-next-label">다음 단계</span>` : ""}
    ${badges.length ? `<span class="trait-stat-row">${badges.join("")}</span>` : ""}
    ${lines.map(mechanicLine).join("")}
  `;
}

export function traitSummary(trait) {
  const summaries = {
    "맹공": "공/체/방/받피감 획득",
    "수호": "체/방/받피감/체력 기반 추가 피해",
    "정밀": "공/치확/집중 사격 기절 획득",
    "주술": "스킬피해/마나/시전 보호막 획득",
    "결투": "공속/공격/흡혈 획득",
    "지원": "회복량/대상 체급/마나 보조",
    "기습": "주기적 강화 치명/처치 관여 즉시 재장전",
    "중장비": "후열 보호막 획득",
    "원격": "스킬 요구 마나 감소",
    "장악": "공격 대상 치유 감소",
    "궁술": "사거리 증가",
    "신속": "추가 공격 획득",
    "예술": "전열 보호막 획득",
    "전술": "적 후열 끌어오기",
    "돌파": "기본 공격 추가타격",
    "반격": "피격 시 마나 획득",
  };
  return summaries[trait] || "시너지 효과 획득";
}
