import { traitPills, unitTraitText } from "./traitHelpers.js";

export function createUnitView({ state, refs, balance, sellValue, activeTraits, applySynergy, displayNameFor = (unit) => unit.name, render }) {
  function unitRange(unit) {
    const base = ["사격", "술법", "지원"].includes(unit.role) ? balance.battle.rangedRange : balance.battle.meleeRange;
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

  function detailStats(unit) {
    if (state.selected?.source === "board") return applySynergy(unit, activeTraits());
    return {
      hp: unit.maxHp,
      atk: unit.atk,
      speed: unit.speed,
      skillAmp: unit.skillAmp,
      defense: unit.defense,
      critChance: unit.critChance ?? 0,
      critDamage: unit.critDamage ?? 1.5,
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
    };
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
    if (unit.tacticalTarget) effects.push({ tone: "tactical", label: "전술 표적", ratio: 1 });
    if (unit.status === "suppressed") effects.push({ tone: "suppressed", label: "제압", ratio: 1 });
    if (unit.actionLockRemainingMs > 0) {
      const durationMs = Math.max(unit.actionLockDurationMs || unit.actionLockRemainingMs, 1);
      effects.push({ tone: "yuki", label: "납도", ratio: unit.actionLockRemainingMs / durationMs });
    }
    if (unit.rootRemainingMs > 0) {
      const durationMs = Math.max(unit.rootDurationMs || unit.rootRemainingMs, 1);
      effects.push({ tone: "rooted", label: "속박", ratio: unit.rootRemainingMs / durationMs });
    }
    if (unit.peaceRemainingMs > 0) {
      const durationMs = Math.max(unit.peaceDurationMs || unit.peaceRemainingMs, 1);
      effects.push({ tone: "guard", label: "평화", ratio: unit.peaceRemainingMs / durationMs });
    }
    if (unit.lifeShareRemainingMs > 0) {
      const durationMs = Math.max(unit.lifeShareDurationMs || unit.lifeShareRemainingMs, 1);
      effects.push({ tone: "guard", label: "공유", ratio: unit.lifeShareRemainingMs / durationMs });
    }
    if (unit.shawlCurtainRemainingMs > 0) {
      const durationMs = Math.max(unit.shawlCurtainDurationMs || unit.shawlCurtainRemainingMs, 1);
      effects.push({ tone: "guard", label: "장막", ratio: unit.shawlCurtainRemainingMs / durationMs });
    }
    return effects;
  }

  function unitNode(unit, source, index, compact = false) {
    const node = document.getElementById("unitTemplate").content.firstElementChild.cloneNode(true);
    node.classList.add(source);
    if (unit.boss) {
      node.classList.add("boss-unit");
      if (unit.pattern) node.classList.add(`boss-${unit.pattern}`);
    }
    node.dataset.source = source;
    node.dataset.index = String(index);
    node.dataset.unitId = unit.id;
    if (state.selected?.source === source && state.selected?.index === index) node.classList.add("selected");
    if (unit.status) node.classList.add(unit.status);
    if (displayNameFor(unit) !== unit.name) node.classList.add("renamed-unit");
    if (unit.tacticalTarget) node.classList.add("tactical-target");
    if (unit.hp <= 0) node.classList.add("dead");
    node.style.setProperty("--accent", unit.color);
    node.style.setProperty("--hp", `${Math.max(0, Math.round((unit.hp / unit.maxHp) * 100))}%`);
    node.style.setProperty("--shield", `${Math.max(0, Math.min(100, Math.round(((unit.shield || 0) / unit.maxHp) * 100)))}%`);
    node.style.setProperty("--mana", `${Math.max(0, Math.min(100, Math.round(((unit.mana || 0) / unitMaxMana(unit)) * 100)))}%`);
    node.querySelector(".portrait").innerHTML = unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1);
    node.querySelector(".name").textContent = displayNameFor(unit);
    node.querySelector(".meta").innerHTML = compact ? "" : traitPills(unit);
    node.querySelector(".stars").textContent = "★".repeat(unit.tier);
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
    node.title = `${displayNameFor(unit)} · ${unit.weapon} | HP ${unit.maxHp} / 공격 ${unit.atk} / 공속 ${unit.speed} / 사거리 ${unit.range || unitRange(unit)}칸 / 스증 ${unit.skillAmp} / 방어 ${unit.defense} | ${unit.skill}${unit.skillTooltip ? ` - ${unit.skillTooltip}` : ""}`;
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
      if (source === "enemy" || state.busy) return;
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
    const stats = [
      ["HP", `${Math.max(0, Math.round(unit.hp))} / ${unit.maxHp}`],
      ["공격", Math.round(effective.atk)],
      ["공속", effective.speed.toFixed(2)],
      ["사거리", `${unit.range || Math.max(1, unitRange(unit) + Math.round(effective.rangeBonus || 0))}칸`],
      ["스증", Math.round(effective.skillAmp)],
      ["방어", Math.round(effective.defense)],
      ["마나", `${Math.round(unit.mana || 0)} / ${unitMaxMana(effective)}`],
    ];
    if (effective.critChance > 0) stats.push(["치명", `${Math.round(effective.critChance * 100)}%`]);
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
    if (unit.role === "술법" && effective.skillTargets > 2) stats.push(["스킬타격", effective.skillTargets >= 99 ? "전체" : `${Math.round(effective.skillTargets)}명`]);
    if (unit.role === "지원" && effective.healTargets > 2) stats.push(["회복대상", effective.healTargets >= 99 ? "전체" : `${Math.round(effective.healTargets)}명`]);
    refs.detailTier.textContent = `${"★".repeat(unit.tier)} · ${unit.cost}코`;
    refs.sellUnit.disabled = state.busy;
    refs.sellUnit.textContent = `${sellValue(unit)}크레딧에 판매`;
    refs.unitDetail.innerHTML = `
      <div class="detail-head" style="--accent: ${unit.color}">
        <span class="portrait">${unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1)}</span>
        <div><strong>${displayNameFor(unit)}</strong><small>${unit.role} / ${unitTraitText(unit)} / ${unit.weapon}</small></div>
      </div>
      <div class="detail-stats">${stats.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
      <div class="detail-skill"><span>스킬</span><strong>${unit.skill}</strong>${unit.skillTooltip ? `<p>${unit.skillTooltip}</p>` : ""}</div>
    `;
  }

  return { renderUnitDetail, unitMaxMana, unitNode, unitRange };
}
