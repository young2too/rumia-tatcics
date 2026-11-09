import { traitPills, unitTraitText } from "./traitHelpers.js";
import { applyStatPatch, fourStarAscensionStats } from "../../systems/augmentEffects.js";

export function createUnitView({ state, refs, balance, sellValue, activeTraits, applySynergy, displayNameFor = (unit) => unit.name, render, selectAugmentTarget, selectLumiShopTarget }) {
  function displayedSkillFor(unit) {
    const sevenElixir = unit?.name === "쇼이치"
      && (state.selectedAugments || []).some((augment) => augment.effect?.type === "shoichiSevenElixir");
    if (sevenElixir) {
      return {
        name: "7단비약",
        tooltip: "시간을 멈추고 전장을 일곱 번 가릅니다. 1~6타는 생존한 모든 적에게 공격력의 45% + 스킬 증폭의 60% 피해를 주고, 마지막 타격은 공격력의 140% + 스킬 증폭의 180% 피해를 줍니다. 모든 타격은 개별적으로 치명타가 발생할 수 있습니다.",
      };
    }
    const warpSlash = unit?.name === "아비게일"
      && (state.selectedAugments || []).some((augment) => augment.effect?.type === "abigailWarpSlash");
    return warpSlash
      ? {
          name: "워프 슬래시",
          tooltip: "시간을 멈추고 모든 적에게 한 번씩 순간이동해 공격력의 125% + 스킬 증폭의 160% + 16 피해를 줍니다. 보스에게는 피해가 1.75배로 증가합니다. 각 타격은 개별적으로 치명타가 발생할 수 있으며, 연출 중에는 무적입니다.",
        }
      : { name: unit?.skill || "스킬", tooltip: unit?.skillTooltip || "" };
  }

  function unitRange(unit) {
    const base = Number.isFinite(unit.attackRange)
      ? unit.attackRange
      : ["사격", "술법", "지원"].includes(unit.role)
        ? balance.battle.rangedRange
        : balance.battle.meleeRange;
    return Math.max(1, base + Math.round(unit.rangeBonus || 0));
  }

  function unitMaxMana(unit) {
    return Math.max(40, Math.round(unit.maxMana || 100) - Math.round(unit.maxManaReduction || 0));
  }

  function selectedUnit() {
    if (!state.selected) return null;
    const unit = state[state.selected.source]?.[state.selected.index] || null;
    if (!unit) state.selected = null;
    return unit;
  }

  function detailStats(unit, source = state.selected?.source) {
    const stats = source === "board" ? applySynergy(unit, activeTraits()) : {
      hp: unit.maxHp,
      atk: unit.atk,
      speed: unit.speed,
      skillAmp: unit.skillAmp,
      defense: unit.defense,
      critChance: unit.critChance ?? 0,
      critDamage: unit.critDamage ?? 1.5,
      skillCritChance: unit.skillCritChance ?? 0,
      skillCritDamage: unit.skillCritDamage ?? 1.5,
      openingCritMultiplier: unit.openingCritMultiplier ?? 1,
      lifeSteal: unit.lifeSteal ?? 0,
      damageReduction: unit.damageReduction ?? 0,
      manaGain: unit.manaGain ?? 1,
      skillTargets: unit.skillTargets ?? 2,
      healTargets: unit.healTargets ?? 2,
      rangeBonus: unit.rangeBonus ?? 0,
      maxMana: unit.maxMana ?? 100,
      maxManaReduction: unit.maxManaReduction ?? 0,
      extraAttackEvery: unit.extraAttackEvery ?? 0,
      basicAttackExtraTargets: unit.basicAttackExtraTargets ?? 0,
      healReductionOnHit: unit.healReductionOnHit ?? 0,
      openingMana: unit.openingMana ?? 0,
      manaOnHitBonus: unit.manaOnHitBonus ?? 0,
      huntMarkTargets: unit.huntMarkTargets ?? 0,
      huntMarkedDamageAdd: unit.huntMarkedDamageAdd ?? 0,
      huntFocusMarked: unit.huntFocusMarked ?? 0,
      huntMarkedDefenseApplyRatio: unit.huntMarkedDefenseApplyRatio ?? 1,
      huntTransferStunMs: unit.huntTransferStunMs ?? 0,
      precisionCritRequired: unit.precisionCritRequired ?? 0,
      precisionStunMs: unit.precisionStunMs ?? 0,
      spellCastShieldRatio: unit.spellCastShieldRatio ?? 0,
      guardianStrikeEvery: unit.guardianStrikeEvery ?? 0,
      guardianStrikeHpRatio: unit.guardianStrikeHpRatio ?? 0,
      assassinRearmCritMultiplier: unit.assassinRearmCritMultiplier ?? 0,
      assassinRearmCooldownMs: unit.assassinRearmCooldownMs ?? 0,
    };
    if (unit.fourStarAscended && ["board", "bench"].includes(source)) {
      const ascension = (state.selectedAugments || [])
        .map((augment) => augment?.effect)
        .find((effect) => effect?.type === "fourStarAscension");
      if (ascension?.stats) applyStatPatch(stats, fourStarAscensionStats(ascension, unit));
    }
    return stats;
  }

  function statusEffects(unit) {
    const effects = [];
    const stunMs = unit.stunRemainingMs ?? 0;
    if (stunMs > 0) {
      const durationMs = Math.max(unit.stunDurationMs || stunMs || 1, 1);
      effects.push({ tone: "danger", label: "기절", ratio: stunMs / durationMs });
    }
    const immuneMs = unit.immuneRemainingMs ?? 0;
    if (immuneMs > 0 || unit.status === "immune") {
      const durationMs = Math.max(unit.immuneDurationMs || immuneMs || 1, 1);
      effects.push({ tone: "guard", label: "면역", ratio: Math.max(immuneMs, unit.status === "immune" ? 1 : 0) / durationMs });
    }
    const healReductionMs = unit.healReductionRemainingMs ?? 0;
    if (healReductionMs > 0) {
      const durationMs = Math.max(unit.healReductionDurationMs || healReductionMs || 1, 1);
      effects.push({ tone: "danger", label: "치감", ratio: healReductionMs / durationMs });
    }
    if (unit.lenoxPulledTarget) effects.push({ tone: "tactical", label: "독니 표적", ratio: 1 });
    if (unit.status === "suppressed") effects.push({ tone: "suppressed", label: "제압", ratio: 1 });
    if (unit.timeStopRemainingMs > 0) {
      const durationMs = Math.max(unit.timeStopDurationMs || unit.timeStopRemainingMs, 1);
      effects.push({ tone: "suppressed", label: "시간 정지", ratio: unit.timeStopRemainingMs / durationMs });
    } else if (unit.actionLockRemainingMs > 0) {
      const durationMs = Math.max(unit.actionLockDurationMs || unit.actionLockRemainingMs, 1);
      effects.push({ tone: "yuki", label: "납도", ratio: unit.actionLockRemainingMs / durationMs });
    }
    if (unit.rootRemainingMs > 0) {
      const durationMs = Math.max(unit.rootDurationMs || unit.rootRemainingMs, 1);
      effects.push({ tone: "rooted", label: "속박", ratio: unit.rootRemainingMs / durationMs });
    }
    if (unit.semtexGrenade?.remainingMs > 0) {
      const durationMs = Math.max(unit.semtexGrenade.durationMs || unit.semtexGrenade.remainingMs, 1);
      effects.push({ tone: "semtex", label: "셈텍스", ratio: unit.semtexGrenade.remainingMs / durationMs });
    }
    if (unit.peaceRemainingMs > 0) {
      const durationMs = Math.max(unit.peaceDurationMs || unit.peaceRemainingMs, 1);
      effects.push({ tone: "guard", label: "평화", ratio: unit.peaceRemainingMs / durationMs });
    }
    if (unit.lifeShareRemainingMs > 0) {
      const durationMs = Math.max(unit.lifeShareDurationMs || unit.lifeShareRemainingMs, 1);
      effects.push({ tone: "guard", label: "공유", ratio: unit.lifeShareRemainingMs / durationMs });
    }
    if (unit.fenrirLastStandRemainingMs > 0) {
      const durationMs = Math.max(unit.fenrirLastStandDurationMs || unit.fenrirLastStandRemainingMs, 1);
      effects.push({ tone: "frenzy", label: "최후", ratio: unit.fenrirLastStandRemainingMs / durationMs });
    }
    if (unit.shawlCurtainRemainingMs > 0) {
      const durationMs = Math.max(unit.shawlCurtainDurationMs || unit.shawlCurtainRemainingMs, 1);
      effects.push({ tone: "guard", label: "장막", ratio: unit.shawlCurtainRemainingMs / durationMs });
    }
    if ((unit.augmentDamageTakenAdd || 0) > 0) {
      effects.push({ tone: "vulnerable", label: `받피+${Math.round(unit.augmentDamageTakenAdd * 100)}%`, ratio: 1 });
    }
    if (unit.traitOverloadBuff?.remainingMs > 0) {
      effects.push({ tone: "frenzy", label: "과부하", ratio: unit.traitOverloadBuff.remainingMs / 3000 });
    }
    if (unit.traitComebackBuff?.remainingMs > 0) {
      effects.push({ tone: "guard", label: "결의", ratio: unit.traitComebackBuff.remainingMs / 4000 });
    }
    if (unit.traitChainBuff?.remainingMs > 0) {
      effects.push({ tone: "tactical", label: "연계", ratio: unit.traitChainBuff.remainingMs / 3000 });
    }
    if (unit.traitLockdownRemainingMs > 0) {
      effects.push({ tone: "vulnerable", label: "봉쇄", ratio: unit.traitLockdownRemainingMs / 3000 });
    }
    if (unit.traitEchoReady) effects.push({ tone: "tactical", label: "잔향", ratio: 1 });
    return effects;
  }

  function unitNode(unit, source, index, compact = false) {
    const node = document.getElementById("unitTemplate").content.firstElementChild.cloneNode(true);
    const displayTier = unit.fourStarAscended ? 4 : unit.tier;
    node.classList.add(source);
    if (state.lumiShopPendingProductId && ["board", "bench"].includes(source)) node.classList.add("lumi-shop-targetable");
    node.classList.add(`tier-${Math.max(1, Math.min(4, displayTier || 1))}`);
    if (unit.boss) {
      node.classList.add("boss-unit");
      if (unit.pattern) node.classList.add(`boss-${unit.pattern}`);
    }
    node.dataset.source = source;
    node.dataset.index = String(index);
    node.dataset.unitId = unit.id;
    if (state.selected?.source === source && state.selected?.index === index) node.classList.add("selected");
    if (state.pendingAugmentTarget && ["board", "bench"].includes(source)) {
      const canTarget = state.pendingAugmentTarget.effect?.type === "fourStarPromotionPurchase"
        ? (unit.tier || 1) >= 3 && !unit.fourStarAscended
        : (unit.tier || 1) >= 3;
      node.classList.add(canTarget ? "augment-targetable" : "augment-untargetable");
    }
    if (unit.status) node.classList.add(unit.status);
    if (unit.untargetableRemainingMs > 0) node.classList.add("untargetable");
    if (unit.warpVisualRemainingMs > 0) node.classList.add("warp-hidden");
    if (displayNameFor(unit) !== unit.name) node.classList.add("renamed-unit");
    if (unit.tacticalTarget) node.classList.add("tactical-target");
    if (unit.huntMarked) node.classList.add("hunt-marked");
    if (unit.fenrirLastStandRemainingMs > 0) node.classList.add("last-stand");
    if (unit.semtexGrenade?.remainingMs > 0) node.classList.add("semtex-attached");
    if (unit.hp <= 0) node.classList.add("dead");
    node.style.setProperty("--accent", unit.color);
    node.style.setProperty("--hp", `${Math.max(0, Math.round((unit.hp / unit.maxHp) * 100))}%`);
    node.style.setProperty("--shield", `${Math.max(0, Math.min(100, Math.round(((unit.shield || 0) / unit.maxHp) * 100)))}%`);
    node.style.setProperty("--mana", `${Math.max(0, Math.min(100, Math.round(((unit.mana || 0) / unitMaxMana(unit)) * 100)))}%`);
    node.querySelector(".portrait").innerHTML = unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1);
    node.querySelector(".name").textContent = displayNameFor(unit);
    node.querySelector(".meta").innerHTML = compact ? "" : traitPills(unit);
    node.querySelector(".stars").textContent = "★".repeat(displayTier);
    node.querySelector(".status-badges").innerHTML = statusEffects(unit).map((effect) => `
      <b class="${effect.tone}" style="--status: ${Math.max(0, Math.min(100, Math.round(effect.ratio * 100)))}%">
        <span>${effect.label}</span><i></i>
      </b>
    `).join("");
    if ((unit.samjaeMarks || 0) > 0) {
      const stack = Math.max(0, Math.min(2, unit.samjaeMarks || 0));
      node.insertAdjacentHTML("beforeend", `
        <div class="samjae-orbs" aria-label="삼재 표식 ${stack}/3">
          ${[0, 1, 2].map((orb) => `<i class="${orb < stack ? "filled" : ""}"></i>`).join("")}
        </div>
      `);
    }
    if (unit.huntMarked) {
      node.insertAdjacentHTML("beforeend", `<span class="hunt-mark" title="추적 표식" aria-label="추적 표식"></span>`);
    }
    const displayedSkill = displayedSkillFor(unit);
    const preview = ["board", "bench"].includes(source) ? detailStats(unit, source) : unit;
    node.title = `${displayNameFor(unit)} · ${unit.weapon} | HP ${Math.round(preview.hp ?? unit.maxHp)} / 공격 ${Math.round(preview.atk)} / 공속 ${Number(preview.speed).toFixed(2)} / 사거리 ${unit.range || unitRange(unit)}칸 / 스증 ${Math.round(preview.skillAmp)} / 방어 ${Math.round(preview.defense)} | ${displayedSkill.name}${displayedSkill.tooltip ? ` - ${displayedSkill.tooltip}` : ""}`;
    node.addEventListener("dragstart", () => {
      state.dragging = { source, index };
      document.body.classList.add("dragging-unit");
      node.classList.add("dragging");
    });
    node.addEventListener("dragend", () => {
      state.dragging = null;
      document.body.classList.remove("dragging-unit");
      node.classList.remove("dragging");
      document.querySelectorAll(".can-drop").forEach((element) => element.classList.remove("can-drop"));
    });
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      if (state.suppressUnitClick === `${source}:${index}`) {
        state.suppressUnitClick = null;
        return;
      }
      if (source === "enemy" || state.busy) return;
      if (state.pendingAugmentTarget) {
        if (selectAugmentTarget?.(source, index)) return;
      }
      if (state.lumiShopPendingProductId) {
        selectLumiShopTarget?.(source, index);
        return;
      }
      const selected = state.selected?.source === source && state.selected?.index === index;
      state.selected = selected ? null : { source, index };
      render();
    });
    return node;
  }

  function renderUnitDetail() {
    const unit = selectedUnit();
    if (!unit) {
      refs.detailTier.textContent = "선택 없음";
      refs.unitDetail.innerHTML = `<div class="detail-empty">벤치나 보드의 내 유닛을 선택하면 상세 정보가 표시됩니다.</div>`;
      refs.sellUnit.disabled = true;
      refs.sellUnit.textContent = "판매";
      return;
    }
    const effective = detailStats(unit);
    const effectiveMaxHp = Math.max(1, Math.round(effective.hp));
    const effectiveCurrentHp = Math.max(0, Math.round((unit.hp / Math.max(1, unit.maxHp)) * effectiveMaxHp));
    const stats = [
      ["HP", `${effectiveCurrentHp} / ${effectiveMaxHp}`],
      ["공격", Math.round(effective.atk)],
      ["공속", effective.speed.toFixed(2)],
      ["사거리", `${unit.range || Math.max(1, unitRange(unit) + Math.round(effective.rangeBonus || 0))}칸`],
      ["스증", Math.round(effective.skillAmp)],
      ["방어", Math.round(effective.defense)],
      ["마나", `${Math.round(unit.mana || 0)} / ${unitMaxMana(effective)}`],
    ];
    if (effective.critChance > 0) stats.push(["치명", `${Math.round(effective.critChance * 100)}%`]);
    if (effective.skillCritChance > 0) stats.push(["스킬치명", `${Math.round(effective.skillCritChance * 100)}%`]);
    if (effective.openingCritMultiplier > 1) stats.push(["첫 치명", `${Math.round(effective.openingCritMultiplier * 100)}%`]);
    if (effective.lifeSteal > 0) stats.push(["흡혈", `${Math.round(effective.lifeSteal * 100)}%`]);
    if (effective.damageReduction > 0) stats.push(["피해감소", `${Math.round(effective.damageReduction * 100)}%`]);
    if (effective.manaGain > 1) stats.push(["마나획득", `${Math.round(effective.manaGain * 100)}%`]);
    if (effective.maxManaReduction > 0) stats.push(["요구마나", `-${Math.round(effective.maxManaReduction)}`]);
    if (effective.extraAttackEvery > 0) stats.push(["추가공격", `${Math.round(effective.extraAttackEvery)}회마다`]);
    if (effective.basicAttackExtraTargets > 0) stats.push(["추가타격", `${Math.round(effective.basicAttackExtraTargets)}명`]);
    if (effective.healReductionOnHit > 0) stats.push(["치유감소", `${Math.round(effective.healReductionOnHit * 100)}%`]);
    if (effective.openingMana > 0) stats.push(["시작마나", `+${Math.round(effective.openingMana)}`]);
    if (effective.manaOnHitBonus > 0) stats.push(["피격마나", `+${Math.round(effective.manaOnHitBonus * 100)}%`]);
    if (effective.huntMarkTargets > 0) stats.push(["추적표식", `${Math.round(effective.huntMarkTargets)}명`]);
    if (effective.huntMarkedDamageAdd > 0) stats.push(["표식피해", `+${Math.round(effective.huntMarkedDamageAdd * 100)}%`]);
    if (effective.huntFocusMarked > 0) stats.push(["표식우선", "활성"]);
    if (effective.huntMarkedDefenseApplyRatio < 1) stats.push(["표식관통", `${Math.round((1 - effective.huntMarkedDefenseApplyRatio) * 100)}%`]);
    if (effective.huntTransferStunMs > 0) stats.push(["표식전이", `${(effective.huntTransferStunMs / 1000).toFixed(1)}초 기절`]);
    if (effective.precisionCritRequired > 0) stats.push(["집중사격", `${effective.precisionCritRequired}치명 / ${(effective.precisionStunMs / 1000).toFixed(2)}초`]);
    if (effective.spellCastShieldRatio > 0) stats.push(["시전보호막", `${Math.round(effective.spellCastShieldRatio * 100)}%`]);
    if (effective.guardianStrikeEvery > 0) stats.push(["수호압박", `${effective.guardianStrikeEvery}타 / 체력 ${effective.guardianStrikeHpRatio * 100}%`]);
    if (effective.assassinRearmCritMultiplier > 1) stats.push(["재장전", `${Math.round(effective.assassinRearmCritMultiplier * 100)}% / ${(effective.assassinRearmCooldownMs / 1000).toFixed(1)}초`]);
    if (unit.role === "술법" && effective.skillTargets > 2) stats.push(["스킬타격", effective.skillTargets >= 99 ? "전체" : `${Math.round(effective.skillTargets)}명`]);
    if (unit.role === "지원" && effective.healTargets > 2) stats.push(["회복대상", effective.healTargets >= 99 ? "전체" : `${Math.round(effective.healTargets)}명`]);
    refs.detailTier.textContent = `${"★".repeat(unit.fourStarAscended ? 4 : unit.tier)} · ${unit.cost}코`;
    refs.sellUnit.disabled = state.busy;
    refs.sellUnit.textContent = `${sellValue(unit)}크레딧에 판매`;
    const displayedSkill = displayedSkillFor(unit);
    refs.unitDetail.innerHTML = `
      <div class="detail-head" style="--accent: ${unit.color}">
        <span class="portrait">${unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1)}</span>
        <div><strong>${displayNameFor(unit)}</strong><small>${unit.role} / ${unitTraitText(unit)} / ${unit.weapon}</small></div>
      </div>
      <div class="detail-stats">${stats.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
      <div class="detail-skill"><span>스킬</span><strong>${displayedSkill.name}</strong>${displayedSkill.tooltip ? `<p>${displayedSkill.tooltip}</p>` : ""}</div>
    `;
  }

  return { renderUnitDetail, unitMaxMana, unitNode, unitRange };
}
