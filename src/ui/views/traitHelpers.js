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

export function traitSummary(trait) {
  const summaries = {
    "맹공": "공/체/방/받피감 획득",
    "수호": "체/방/받피감 획득",
    "정밀": "공/치확 획득",
    "주술": "스킬피해/마나획득/요구마나 감소",
    "결투": "공속/공/체/방/흡혈 획득",
    "지원": "회복량/대상 체급/마나 보조",
    "기습": "첫 평타 치명/치확/공속 획득",
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
