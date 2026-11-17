import { allAugments, balance, hiddenTraitRules, roster, traitRules } from "../core/data.js";
import { tierStatMultiplier } from "../core/tier.js";
import { unitTraits } from "../ui/views/traitHelpers.js";

const units = roster.slice().sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ko"));
const traits = Object.entries(traitRules);
const hiddenTraits = Object.entries(hiddenTraitRules);
const rarityOrder = { silver: 0, gold: 1, prismatic: 2 };
const augments = allAugments.slice().sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity] || a.name.localeCompare(b.name, "ko"));
const rarityLabel = { silver: "실버", gold: "골드", prismatic: "프리즘" };
const categoryLabel = { major: "메이저", minor: "마이너", hidden: "히든" };

const refs = {
  index: document.querySelector("#codexIndex"),
  detail: document.querySelector("#codexDetail"),
  search: document.querySelector("#codexSearch"),
  sidebar: document.querySelector("#codexSidebar"),
  toggle: document.querySelector("#codexIndexToggle"),
  back: document.querySelector("#codexIndexBack"),
  close: document.querySelector("#codexIndexClose"),
  backdrop: document.querySelector("#codexBackdrop"),
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[char]);
}

function routeHref(type, id) {
  return `#${type}/${encodeURIComponent(id)}`;
}

function parseRoute() {
  const [type = "overview", encoded = ""] = location.hash.replace(/^#/, "").split("/");
  try { return { type, id: decodeURIComponent(encoded) }; } catch { return { type: "overview", id: "" }; }
}

function link(type, id, label, meta = "", search = "") {
  return `<a class="codex-index-link" href="${routeHref(type, id)}" data-route="${escapeHtml(`${type}/${id}`)}" data-search="${escapeHtml(`${label} ${meta} ${search}`.toLowerCase())}"><span>${escapeHtml(label)}</span>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</a>`;
}

function groupMarkup(title, items, key) {
  return `<details class="codex-index-subgroup" data-group="${escapeHtml(key)}"><summary>${escapeHtml(title)} <b>${items.length}</b></summary><div class="codex-index-group">${items.join("")}</div></details>`;
}

function categorizedUnitTraits(unit) {
  const names = unitTraits(unit);
  return {
    names,
    major: names.find((name) => traitRules[name]?.category === "major") || names[0] || "없음",
    minor: names.find((name) => traitRules[name]?.category === "minor") || names[1] || "없음",
  };
}

function renderIndex() {
  const unitGroups = [1, 2, 3, 4, 5].map((cost) => groupMarkup(`${cost}코스트`, units.filter((unit) => unit.cost === cost).map((unit) => {
    const unitSynergies = categorizedUnitTraits(unit);
    return link("unit", unit.name, unit.name, unitSynergies.major, `${unit.weapon} ${unitSynergies.names.join(" ")} ${unit.skill}`);
  }), `unit-${cost}`)).join("");
  const traitGroups = ["major", "minor"].map((category) => groupMarkup(categoryLabel[category], traits.filter(([, rule]) => rule.category === category).map(([name, rule]) => link("trait", name, name, `${rule.tiers.length}단계`, rule.summary)), `trait-${category}`)).join("");
  const hiddenGroup = groupMarkup("히든", hiddenTraits.map(([name, rule]) => link("hidden", name, name, `${rule.requiredUnits.length}명`, `${rule.requiredUnits.join(" ")} ${rule.text}`)), "trait-hidden");
  const augmentGroups = ["silver", "gold", "prismatic"].map((rarity) => groupMarkup(rarityLabel[rarity], augments.filter((augment) => augment.rarity === rarity).map((augment) => link("augment", augment.id, augment.name, (augment.stages || []).map((stage) => `${stage}단계`).join("·") || "공용", `${augment.summary} ${augment.description} ${(augment.tags || []).join(" ")}`)), `augment-${rarity}`)).join("");
  refs.index.innerHTML = `
    <details class="codex-index-root"><summary>실험체 <b>${units.length}</b></summary><div class="codex-index-group">${unitGroups}</div></details>
    <details class="codex-index-root"><summary>시너지 <b>${traits.length + hiddenTraits.length}</b></summary><div class="codex-index-group">${traitGroups}${hiddenGroup}</div></details>
    <details class="codex-index-root"><summary>증강 <b>${augments.length}</b></summary><div class="codex-index-group">${augmentGroups}</div></details>
    <p class="codex-index-empty" hidden>검색 결과가 없습니다.</p>
  `;
}

function article({ breadcrumb, title, subtitle = "", badges = "", body }) {
  return `<div class="codex-article"><div class="codex-breadcrumb">${escapeHtml(breadcrumb)}</div><header class="codex-title"><div><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div>${badges ? `<div class="codex-badges">${badges}</div>` : ""}</header>${body}</div>`;
}

function badge(text, className = "") {
  return `<span class="codex-badge ${className}">${escapeHtml(text)}</span>`;
}

function linkedBadge(type, id, text, className = "") {
  return `<a class="codex-badge ${className}" href="${routeHref(type, id)}">${escapeHtml(text)}</a>`;
}

function section(title, body) {
  return `<section class="codex-section"><header><h2>${escapeHtml(title)}</h2></header><div class="codex-section-body">${body}</div></section>`;
}

function unitCard(unit) {
  const synergies = categorizedUnitTraits(unit).names.join(" · ");
  return `<a class="codex-unit-link" href="${routeHref("unit", unit.name)}" style="--accent:${escapeHtml(unit.color)}"><span>${unit.art ? `<img src="${escapeHtml(unit.art)}" alt="">` : escapeHtml(unit.name.slice(0, 1))}</span><div><strong>${escapeHtml(unit.name)}</strong><small>${unit.cost}코 · ${escapeHtml(synergies)}</small></div></a>`;
}

function unitPortraitCard(unit) {
  const synergies = categorizedUnitTraits(unit).names.join(" · ");
  return `<a class="codex-portrait-card" href="${routeHref("unit", unit.name)}" style="--accent:${escapeHtml(unit.color)}"><span class="codex-portrait-media">${unit.art ? `<img src="${escapeHtml(unit.art)}" alt="">` : `<b>${escapeHtml(unit.name.slice(0, 1))}</b>`}</span><span class="codex-portrait-name"><strong>${escapeHtml(unit.name)}</strong><small>${escapeHtml(synergies)}</small></span></a>`;
}

function relatedAugments(unitName) {
  return augments.filter((augment) => {
    const effect = augment.effect || {};
    const grants = [effect.grantUnitCopy, effect.grantUnitIfMissing, ...(effect.grantUnitCopies || [])].filter(Boolean);
    return effect.unit === unitName || (augment.tags || []).includes(unitName) || grants.some((grant) => grant.unit === unitName);
  });
}

function unitStat(unit, tier, stat) {
  const baseBoost = balance.playerBaseStatMultiplierByCost?.[String(unit.cost)] ?? 1;
  return Math.round(unit[stat] * baseBoost * tierStatMultiplier(balance, unit.cost, tier, stat));
}

function renderUnit(unit) {
  const synergies = categorizedUnitTraits(unit);
  const traitLinks = synergies.names.map((trait) => linkedBadge("trait", trait, trait)).join("");
  const range = Number.isFinite(unit.attackRange) ? unit.attackRange : ["사격", "술법", "지원"].includes(unit.role) ? balance.battle.rangedRange : balance.battle.meleeRange;
  const related = relatedAugments(unit.name);
  const rows = [["체력", "hp"], ["공격력", "atk"], ["스킬 증폭", "skillAmp"], ["방어력", "defense"]].map(([label, stat]) => `<tr><th>${label}</th>${[1, 2, 3].map((tier) => `<td>${unitStat(unit, tier, stat).toLocaleString("ko-KR")}</td>`).join("")}</tr>`).join("");
  refs.detail.innerHTML = article({
    breadcrumb: `도감 > 실험체 > ${unit.cost}코스트`,
    title: unit.name,
    subtitle: `${synergies.names.join(" · ")} · ${unit.weapon}`,
    badges: `${badge(`${unit.cost}코스트`, `cost-${unit.cost}`)}${traitLinks}`,
    body: `
      <div class="codex-unit-hero">
        <div class="codex-unit-portrait" style="--accent:${escapeHtml(unit.color)}">${unit.art ? `<img src="${escapeHtml(unit.art)}" alt="${escapeHtml(unit.name)}">` : escapeHtml(unit.name.slice(0, 1))}</div>
        <div class="codex-infobox">
          <div class="codex-info-row"><span>메이저 시너지</span><strong>${escapeHtml(synergies.major)}</strong></div>
          <div class="codex-info-row"><span>마이너 시너지</span><strong>${escapeHtml(synergies.minor)}</strong></div>
          <div class="codex-info-row"><span>무기</span><strong>${escapeHtml(unit.weapon)}</strong></div>
          <div class="codex-info-row"><span>공격 속도</span><strong>${Number(unit.speed).toFixed(2)}</strong></div>
          <div class="codex-info-row"><span>사거리</span><strong>${range}칸</strong></div>
          <div class="codex-info-row"><span>스킬 요구 마나</span><strong>${unit.maxMana || 100}</strong></div>
        </div>
      </div>
      ${section("성급별 스탯", `<table class="codex-stat-table"><thead><tr><th>능력치</th><th>★</th><th>★★</th><th>★★★</th></tr></thead><tbody>${rows}</tbody></table>`)}
      ${section(unit.skill || "스킬", `<p>${escapeHtml(unit.skillTooltip || "스킬 설명이 준비 중입니다.")}</p>`)}
      ${related.length ? section("관련 증강", `<div class="codex-augment-list">${related.map(augmentCard).join("")}</div>`) : ""}
    `,
  });
}

function renderTrait(name, rule, hidden = false) {
  const members = hidden ? rule.requiredUnits.map((unitName) => units.find((unit) => unit.name === unitName)).filter(Boolean) : units.filter((unit) => unitTraits(unit).includes(name));
  const tierBody = hidden
    ? `<div class="codex-tier-list"><div class="codex-tier"><strong>발동</strong><p>${escapeHtml(rule.text)}</p></div></div>`
    : `<div class="codex-tier-list">${rule.tiers.map((tier) => `<div class="codex-tier"><strong>${tier.need}명</strong><p>${escapeHtml(tier.text)}</p></div>`).join("")}</div>`;
  const category = hidden ? "hidden" : rule.category;
  refs.detail.innerHTML = article({
    breadcrumb: `도감 > 시너지 > ${categoryLabel[category]}`,
    title: name,
    subtitle: hidden ? rule.text : rule.summary,
    badges: badge(categoryLabel[category], hidden ? "prismatic" : category === "major" ? "gold" : ""),
    body: `${section("단계별 효과", tierBody)}${section("구성 실험체", `<div class="codex-unit-list">${members.map(unitCard).join("")}</div>`)}`,
  });
}

function augmentCard(augment) {
  return `<a class="codex-augment-link" href="${routeHref("augment", augment.id)}"><span><strong>${escapeHtml(augment.name)}</strong><small>${escapeHtml(rarityLabel[augment.rarity])}</small></span><small>${escapeHtml(augment.summary)}</small></a>`;
}

const effectLabels = {
  unit: "대상 실험체", trait: "대상 시너지", add: "증가량", addPerStack: "중첩당 증가량", amountAdd: "강화 증가량",
  count: "획득 개수", countBench: "벤치 포함", maxStacks: "최대 중첩", stacks: "부여 중첩", statsPerStack: "중첩당 능력치",
  thresholdHpRatio: "발동 체력 조건", triggerHpRatio: "발동 체력 조건", executeThresholdHpRatio: "처형 체력 조건",
  duration: "지속시간", durationMs: "지속시간", durationSeconds: "지속시간", cooldownSeconds: "재사용 대기시간", intervalSeconds: "발동 간격",
  damageTakenAdd: "받는 피해 증가", damageTakenAddPerStack: "중첩당 받는 피해 증가", markedDamageTakenAdd: "표식 대상 받는 피해 증가",
  damageMultiply: "피해 배율", damageSkillAmpRatio: "피해 스킬 증폭 계수", damageReductionAdd: "받는 피해 감소",
  atkRatio: "공격력 계수", bonusAtkRatio: "추가 공격력 계수", skillAmpRatio: "스킬 증폭 계수", flatDamage: "고정 피해",
  hpMultiply: "체력 배율", hpMultiplyAdd: "체력 증가", atkMultiply: "공격력 배율", atkMultiplyAdd: "공격력 증가",
  skillAmpMultiply: "스킬 증폭 배율", skillAmpMultiplyAdd: "스킬 증폭 증가", defenseMultiply: "방어력 배율", speedMultiply: "공격 속도 배율",
  manaAdd: "마나 증가", manaGainMultiply: "마나 획득 배율", maxManaReductionAdd: "최대 마나 감소", openingManaAdd: "시작 마나 증가",
  boardLimitAdd: "배치 한도 증가", unitCostOverride: "유닛 구매 비용", disableSell: "판매 불가", disableReroll: "리롤 불가",
  costAdd: "코스트 증가", costIncrease: "승급 비용 증가", baseCost: "기본 승급 비용", goldPerStack: "중첩 기준 크레딧",
  rarity: "증강 등급", preserveTier: "성급 유지", multiplierIncreasePerPromotion: "승급당 추가 배율",
  grantUnitCopy: "지급 실험체", grantUnitCopies: "지급 실험체", oncePerUnit: "실험체당 1회 제한",
  dashCount: "비약 횟수", startDelayMs: "시작 지연", hitIntervalMs: "타격 간격", finishDelayMs: "종료 지연",
  pathDamageAtkRatio: "연속 타격 공격력 계수", pathDamageSkillAmpRatio: "연속 타격 스킬 증폭 계수",
  finalDamageAtkRatio: "마지막 타격 공격력 계수", finalDamageSkillAmpRatio: "마지막 타격 스킬 증폭 계수",
  canCrit: "치명타 적용", bossDamageMultiplier: "보스 피해 배율", bossDamageMaxHpRatio: "보스 대상 최대 체력 피해",
  bossRatio: "보스 대상 피해 계수", targetMaxHpRatio: "대상 최대 체력 피해", maxRatio: "최대 체력 피해 상한",
  skillAmpToMaxHpRatio: "스킬 증폭당 최대 체력 계수", repeatedTargetDecay: "동일 대상 반복 피해 감소",
  collisionTrueDamageAtkRatio: "충돌 고정 피해 공격력 계수", collisionBindAddSeconds: "충돌 속박 추가 시간",
  executeDamageAtkRatio: "처형 공격력 계수", repeatHitDamageSkillAmpRatio: "연속 타격 스킬 증폭 계수",
  nextAttackAtkRatioAdd: "다음 공격 추가 공격력 계수", assistDamageSkillAmpRatio: "지원 사격 스킬 증폭 계수",
  bindSeconds: "속박 시간", stunSeconds: "기절 시간", edgeStunAddSeconds: "가장자리 추가 기절 시간",
  onDeathNearbySuppressSeconds: "사망 시 주변 침묵 시간", radius: "효과 범위", range: "적용 거리", movedHexes: "이동 칸 수",
  bounces: "연쇄 횟수", extraStrike: "추가 타격", comboHits: "연속 타격 횟수", minAdjacentAllies: "필요 인접 아군",
  shieldHpRatio: "보호막 최대 체력 계수", allyShieldHpRatio: "아군 보호막 최대 체력 계수", overhealShieldRatio: "초과 회복 보호막 전환율",
  healHpRatio: "회복 최대 체력 계수", teamHealHpRatio: "팀 회복 최대 체력 계수", healingReduction: "받는 회복 감소",
  healStackMultiplyAdd: "중첩당 회복량 증가", hpRatio: "체력 비율", setTo: "설정 수치", teamManaAdd: "아군 전체 마나 증가",
  atkShareRatio: "공격력 공유 비율", frontAtkShareRatio: "전열 공격력 공유 비율", frontSkillAmpShareRatio: "전열 스킬 증폭 공유 비율",
  backHpShareRatio: "후열 체력 공유 비율", backDefenseShareRatio: "후열 방어력 공유 비율", frontIndex: "전열 계약 칸", backIndex: "후열 계약 칸",
  frontStats: "전열 능력치", backStats: "후열 능력치", stats: "적용 능력치", perThreeStar: "3성당 증가 능력치",
  rows: "적용 배치", slots: "적용 슬롯", stat: "증가 능력치", patch: "변경 효과", rulePatchPerOvercap: "초과 시너지당 추가 효과",
  backlineDamageMultiply: "후열 대상 피해 배율", survivorDamageReductionAdd: "생존자 받는 피해 감소",
  survivorDurationSeconds: "생존자 강화 지속시간", survivorManaAdd: "생존자 마나 증가",
  inheritAtkRatio: "계승 공격력 비율", inheritHpRatio: "계승 체력 비율", inheritSkillAmpRatio: "계승 스킬 증폭 비율",
  killAtkAdd: "처치 관여당 공격력 증가", killSkillAmpAdd: "처치 관여당 스킬 증폭 증가", lenoxPulledBonusMultiply: "레녹스 추가 성장 배율",
  multiply: "배율 조정", freeRerolls: "무료 리롤", gold: "크레딧", shopSizeSet: "상점 슬롯 수",
  chainCooldownAddMs: "연쇄 재사용 대기시간 조정", comebackEffectMultiply: "역전 효과 배율", echoManaAdd: "메아리 마나 증가",
  heatRequiredAdd: "필요 예열 중첩 조정", lowHpThresholdSet: "저체력 기준", orbitEffectMultiply: "궤도 효과 배율",
  ruptureDamageMultiply: "파열 피해 배율", sanctuaryShieldMultiply: "성역 보호막 배율",
  ambushFocusDamageAddPerStack: "집중 중첩당 피해 증가", chainBuffMs: "연쇄 강화시간 증가", comebackShieldRatio: "역전 보호막 계수",
  comebackPowerAdd: "역전 공격력·스킬 증폭 증가", comebackSpeedAdd: "역전 공격 속도 증가", frontHpMultiply: "전열 체력 증가", backSplashRatio: "후열 광역 피해 계수",
  overloadMs: "과부하 지속시간 증가", echoSkillAmpRatio: "메아리 스킬 증폭 계수", ruptureAtkRatio: "파열 공격력 계수",
  sanctuaryShieldRatio: "성역 보호막 계수", heatRequired: "필요 예열 중첩", orbitEffect: "궤도 효과",
};

function effectLabel(key) {
  return effectLabels[key] || "추가 효과";
}

function effectValue(key, value, fallbackUnit = "") {
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if (Array.isArray(value)) return value.map((item) => typeof item === "object" ? effectValue(key, item, fallbackUnit) : item).join(", ");
  if (value && typeof value === "object") {
    const unit = value.unit || (/^grantUnit/.test(key) ? fallbackUnit : "");
    if (unit) return `${unit} ${value.tier || 1}성`;
    return Object.entries(value).map(([nestedKey, nestedValue]) => `${effectLabel(nestedKey)} ${effectValue(nestedKey, nestedValue)}`).join(" / ");
  }
  if (key === "rarity") return rarityLabel[value] || String(value);
  if (key === "rows") return value === "front2" ? "전열 2줄" : value === "back2" ? "후열 2줄" : String(value);
  if (key === "stat") return value === "speed" ? "공격 속도" : String(value);
  if (typeof value === "number" && ["maxManaReductionAdd"].includes(key)) return String(value);
  if (typeof value === "number" && (/(Ratio|Chance|Reduction|TakenAdd|MultiplyAdd|AddPerStack|ReductionAdd|PowerAdd)$/.test(key) || ["amountAdd", "frontHpMultiply", "repeatedTargetDecay"].includes(key))) return `${Math.round(value * 1000) / 10}%`;
  if (typeof value === "number" && (/Multiply$/.test(key) || /Multiplier$/.test(key) || key === "multiplierIncreasePerPromotion")) return `${value}배`;
  if (typeof value === "number" && (key.endsWith("Seconds") || key === "duration")) return `${value}초`;
  if (typeof value === "number" && key.endsWith("Ms")) return `${value}ms`;
  if (typeof value === "number" && ["range", "radius", "movedHexes"].includes(key)) return `${value}칸`;
  return String(value);
}

function renderAugment(augment) {
  const hiddenEffectKeys = new Set(["type", "frontIndex", "backIndex"]);
  const effectRows = Object.entries(augment.effect || {}).filter(([key]) => !hiddenEffectKeys.has(key)).map(([key, value]) => `<dt>${escapeHtml(effectLabel(key))}</dt><dd>${escapeHtml(effectValue(key, value, augment.effect?.unit))}</dd>`).join("");
  const targetUnit = augment.effect?.unit ? units.find((unit) => unit.name === augment.effect.unit) : null;
  refs.detail.innerHTML = article({
    breadcrumb: `도감 > 증강 > ${rarityLabel[augment.rarity]}`,
    title: augment.name,
    subtitle: augment.summary,
    badges: `${badge(rarityLabel[augment.rarity], augment.rarity)}${(augment.stages || []).map((stage) => badge(`${stage}단계`)).join("")}`,
    body: `
      ${section("효과", `<p>${escapeHtml(augment.description)}</p>`)}
      ${effectRows ? section("세부 수치", `<dl class="codex-effect-data">${effectRows}</dl>`) : ""}
      ${targetUnit ? section("관련 실험체", `<div class="codex-unit-list">${unitCard(targetUnit)}</div>`) : ""}
    `,
  });
}

function renderOverview() {
  refs.detail.innerHTML = article({
    breadcrumb: "도감",
    title: "루미아 택틱스 도감",
    subtitle: "왼쪽 목차에서 실험체, 시너지와 증강을 바로 찾아보세요.",
    body: `<div class="codex-overview"><a class="codex-overview-card" href="${routeHref("units", "")}"><span>실험체</span><strong>${units.length}</strong><p>성급별 스탯과 스킬, 관련 증강을 확인합니다.</p></a><a class="codex-overview-card" href="${routeHref("traits", "")}"><span>시너지</span><strong>${traits.length + hiddenTraits.length}</strong><p>메이저·마이너·히든 시너지 구성과 효과를 확인합니다.</p></a><a class="codex-overview-card" href="${routeHref("augments", "")}"><span>증강</span><strong>${augments.length}</strong><p>등급과 등장 단계, 세부 효과를 확인합니다.</p></a></div>`,
  });
}

function renderUnitCatalog(costValue) {
  const cost = Number(costValue);
  const selectedCost = Number.isInteger(cost) && cost >= 1 && cost <= 5 ? cost : null;
  const costPicker = `<nav class="codex-cost-picker" aria-label="실험체 코스트 선택">${[1, 2, 3, 4, 5].map((entry) => {
    const count = units.filter((unit) => unit.cost === entry).length;
    return `<a class="${selectedCost === entry ? "active" : ""}" href="${routeHref("units", entry)}"><strong>${entry}코스트</strong><small>${count}명</small></a>`;
  }).join("")}</nav>`;
  const portraits = selectedCost
    ? `<section class="codex-catalog"><h2>어떤 실험체를 볼까요?</h2><div class="codex-portrait-grid">${units.filter((unit) => unit.cost === selectedCost).map(unitPortraitCard).join("")}</div></section>`
    : "";
  refs.detail.innerHTML = article({
    breadcrumb: selectedCost ? `도감 > 실험체 > ${selectedCost}코스트` : "도감 > 실험체",
    title: selectedCost ? `${selectedCost}코스트 실험체` : "실험체",
    subtitle: selectedCost ? `${units.filter((unit) => unit.cost === selectedCost).length}명의 실험체` : "코스트를 선택하세요.",
    body: `${costPicker}${portraits}`,
  });
}

function renderTraitCatalog(categoryValue) {
  const categories = ["major", "minor", "hidden"];
  const selectedCategory = categories.includes(categoryValue) ? categoryValue : null;
  const categoryEntries = selectedCategory === "hidden"
    ? hiddenTraits.map(([name, rule]) => ({ name, rule, type: "hidden" }))
    : traits.filter(([, rule]) => rule.category === selectedCategory).map(([name, rule]) => ({ name, rule, type: "trait" }));
  const picker = `<nav class="codex-cost-picker codex-category-picker" aria-label="시너지 종류 선택">${categories.map((category) => {
    const count = category === "hidden" ? hiddenTraits.length : traits.filter(([, rule]) => rule.category === category).length;
    return `<a class="${selectedCategory === category ? "active" : ""}" href="${routeHref("traits", category)}"><strong>${categoryLabel[category]}</strong><small>${count}종</small></a>`;
  }).join("")}</nav>`;
  const catalog = selectedCategory
    ? `<section class="codex-catalog"><h2>어떤 시너지를 볼까요?</h2><div class="codex-augment-list">${categoryEntries.map(({ name, rule, type }) => `<a class="codex-augment-link" href="${routeHref(type, name)}"><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(categoryLabel[selectedCategory])}</small></span><small>${escapeHtml(rule.summary || rule.text)}</small></a>`).join("")}</div></section>`
    : "";
  refs.detail.innerHTML = article({
    breadcrumb: selectedCategory ? `도감 > 시너지 > ${categoryLabel[selectedCategory]}` : "도감 > 시너지",
    title: selectedCategory ? `${categoryLabel[selectedCategory]} 시너지` : "시너지",
    subtitle: selectedCategory ? `${categoryEntries.length}종의 시너지` : "종류를 선택하세요.",
    body: `${picker}${catalog}`,
  });
}

function renderAugmentCatalog(rarityValue) {
  const rarities = ["silver", "gold", "prismatic"];
  const selectedRarity = rarities.includes(rarityValue) ? rarityValue : null;
  const rarityAugments = selectedRarity ? augments.filter((augment) => augment.rarity === selectedRarity) : [];
  const picker = `<nav class="codex-cost-picker codex-category-picker" aria-label="증강 등급 선택">${rarities.map((rarity) => {
    const count = augments.filter((augment) => augment.rarity === rarity).length;
    return `<a class="${selectedRarity === rarity ? "active" : ""}" href="${routeHref("augments", rarity)}"><strong>${rarityLabel[rarity]}</strong><small>${count}개</small></a>`;
  }).join("")}</nav>`;
  const catalog = selectedRarity
    ? `<section class="codex-catalog"><h2>어떤 증강을 볼까요?</h2><div class="codex-augment-list">${rarityAugments.map(augmentCard).join("")}</div></section>`
    : "";
  refs.detail.innerHTML = article({
    breadcrumb: selectedRarity ? `도감 > 증강 > ${rarityLabel[selectedRarity]}` : "도감 > 증강",
    title: selectedRarity ? `${rarityLabel[selectedRarity]} 증강` : "증강",
    subtitle: selectedRarity ? `${rarityAugments.length}개의 증강` : "등급을 선택하세요.",
    body: `${picker}${catalog}`,
  });
}

function syncIndexHierarchy(route) {
  const routeKey = `${route.type}/${route.id}`;
  let active = null;
  refs.index.querySelectorAll(".codex-index-link").forEach((node) => {
    const isActive = node.dataset.route === routeKey;
    node.classList.toggle("active", isActive);
    if (isActive) active = node;
  });
  if (refs.search.value.trim()) return;
  refs.index.querySelectorAll("details").forEach((details) => { details.open = false; });
  for (let parent = active?.closest("details"); parent; parent = parent.parentElement?.closest("details")) {
    parent.open = true;
  }
  if (!active && route.type === "units") {
    const unitRoot = refs.index.querySelector(".codex-index-root");
    if (unitRoot) unitRoot.open = true;
    const costGroup = refs.index.querySelector(`[data-group="unit-${route.id}"]`);
    if (costGroup) costGroup.open = true;
  }
  if (!active && route.type === "traits") {
    const traitRoot = refs.index.querySelectorAll(".codex-index-root")[1];
    if (traitRoot) traitRoot.open = true;
    const traitGroup = refs.index.querySelector(`[data-group="trait-${route.id}"]`);
    if (traitGroup) traitGroup.open = true;
  }
  if (!active && route.type === "augments") {
    const augmentRoot = refs.index.querySelectorAll(".codex-index-root")[2];
    if (augmentRoot) augmentRoot.open = true;
    const augmentGroup = refs.index.querySelector(`[data-group="augment-${route.id}"]`);
    if (augmentGroup) augmentGroup.open = true;
  }
}

function renderRoute() {
  const route = parseRoute();
  syncIndexHierarchy(route);
  if (route.type === "units") return renderUnitCatalog(route.id);
  if (route.type === "traits") return renderTraitCatalog(route.id);
  if (route.type === "augments") return renderAugmentCatalog(route.id);
  if (route.type === "unit") {
    const unit = units.find((entry) => entry.name === route.id);
    if (unit) return renderUnit(unit);
  }
  if (route.type === "trait") {
    const entry = traits.find(([name]) => name === route.id);
    if (entry) return renderTrait(entry[0], entry[1]);
  }
  if (route.type === "hidden") {
    const entry = hiddenTraits.find(([name]) => name === route.id);
    if (entry) return renderTrait(entry[0], entry[1], true);
  }
  if (route.type === "augment") {
    const augment = augments.find((entry) => entry.id === route.id);
    if (augment) return renderAugment(augment);
  }
  renderOverview();
}

function setIndexOpen(open) {
  document.body.classList.toggle("codex-index-open", open);
  refs.toggle.setAttribute("aria-expanded", String(open));
  refs.backdrop.hidden = !open;
  if (open) requestAnimationFrame(() => refs.search.focus());
}

function goBack() {
  setIndexOpen(false);
  if ((history.state?.codexDepth || 0) > 0) {
    history.back();
    return;
  }
  if (location.hash) history.replaceState({ codexDepth: 0 }, "", `${location.pathname}${location.search}`);
  renderRoute();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function navigateToRoute(href) {
  const depth = (history.state?.codexDepth || 0) + 1;
  history.pushState({ codexDepth: depth }, "", href);
  renderRoute();
  setIndexOpen(false);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function filterIndex() {
  const query = refs.search.value.trim().toLowerCase();
  const links = Array.from(refs.index.querySelectorAll(".codex-index-link"));
  let visible = 0;
  for (const node of links) {
    const matches = !query || node.dataset.search.includes(query);
    node.hidden = !matches;
    if (matches) visible += 1;
  }
  refs.index.querySelector(".codex-index-empty").hidden = visible > 0;
  if (query) refs.index.querySelectorAll("details").forEach((details) => { details.open = true; });
  else syncIndexHierarchy(parseRoute());
}

renderIndex();
renderRoute();
history.replaceState({ codexDepth: 0 }, "", location.href);
window.addEventListener("popstate", () => { renderRoute(); setIndexOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); });
document.addEventListener("click", (event) => {
  const anchor = event.target.closest('a[href^="#"]');
  if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigateToRoute(anchor.getAttribute("href"));
});
refs.search.addEventListener("input", filterIndex);
refs.toggle.addEventListener("click", () => setIndexOpen(true));
refs.back.addEventListener("click", goBack);
refs.close.addEventListener("click", () => setIndexOpen(false));
refs.backdrop.addEventListener("click", () => setIndexOpen(false));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") setIndexOpen(false); });
