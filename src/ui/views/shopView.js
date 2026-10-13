import { traitPills } from "./traitHelpers.js";

export function createShopView({ state, refs, balance, roster, buyUnit, displayNameFor = (unit) => unit.name, augmentPools = {}, canModify = () => true }) {
  const metricModes = {
    damageDone: { label: "딜량", iconClass: "sword", empty: "아직 기록된 피해량이 없습니다." },
    damageTaken: { label: "받은 피해", iconClass: "shield", empty: "아직 기록된 받은 피해량이 없습니다." },
    healingDone: { label: "힐량", iconClass: "heal", empty: "아직 기록된 회복량이 없습니다." },
  };

  function shopCardStatus(unit) {
    const owned = [...state.board, ...state.bench].filter((copy) => copy?.name === unit.name);
    if (!owned.length) return { className: "", label: "", stars: "" };
    const tierOne = owned.filter((copy) => copy.tier === 1).length;
    const tierTwo = owned.filter((copy) => copy.tier === 2).length;
    if (tierOne >= 2 && tierTwo >= 2) return { className: "can-upgrade tier-3", label: "3성 가능", stars: "★★★" };
    if (tierOne >= 2) return { className: "can-upgrade tier-2", label: "2성 가능", stars: "★★" };
    return { className: "owned", label: "", stars: "" };
  }

  function shopDisabledState() {
    if (state.busy) return { disabled: true, reason: "전투 중에는 유닛을 영입할 수 없습니다." };
    if (state.shopTransactionPending) {
      return {
        disabled: true,
        reason: state.debugMode ? "공유 기물 풀을 확인하고 있습니다." : "",
      };
    }
    if (state.gameMode !== "pvp") return { disabled: false, reason: "" };
    if (state.pvpSnapshotSubmitted) return { disabled: true, reason: "이번 라운드 덱 제출을 완료해 상점이 잠겼습니다." };
    if (!canModify()) return { disabled: true, reason: "현재 PvP 단계에서는 상점을 이용할 수 없습니다." };
    return { disabled: false, reason: "" };
  }

  function renderShop() {
    const showShop = state.shopPanelTab !== "metrics";
    refs.shopTabShop?.classList.toggle("active", showShop);
    refs.shopTabMetrics?.classList.toggle("active", !showShop);
    if (refs.shopContent) refs.shopContent.hidden = !showShop;
    if (refs.combatMetrics) refs.combatMetrics.hidden = showShop;
    if (!showShop) {
      renderCombatMetrics();
      return;
    }
    if (refs.debugShop) {
      refs.debugShop.hidden = !state.debugMode;
      refs.debugRecruitUnit.disabled = state.busy;
      if (refs.debugSelectAugment) refs.debugSelectAugment.disabled = state.busy;
      if (refs.debugAugmentSearch) refs.debugAugmentSearch.disabled = state.busy;
      refs.debugDummyToggle.disabled = state.busy;
      refs.debugDummyClear.disabled = state.busy;
      if (refs.debugRoundInput) refs.debugRoundInput.disabled = state.busy;
      if (refs.debugRoundJump) refs.debugRoundJump.disabled = state.busy;
      refs.debugShop.querySelectorAll("[data-debug-round]").forEach((button) => {
        button.disabled = state.busy;
        button.classList.toggle("active", Number(button.dataset.debugRound) === state.round);
      });
      refs.debugShop.querySelectorAll("[data-debug-augment-stage]").forEach((button) => {
        button.disabled = state.busy;
      });
      if (refs.debugRoundInput && document.activeElement !== refs.debugRoundInput) {
        refs.debugRoundInput.value = String(state.round);
      }
      refs.debugDummyToggle.classList.toggle("active", state.debugDummyPlacement);
      refs.debugDummyToggle.textContent = state.debugDummyPlacement ? "더미 배치 ON" : "더미 배치 OFF";
      if (state.debugMode && !refs.debugUnitList.children.length) {
        refs.debugUnitList.innerHTML = roster
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "ko"))
          .map((unit) => `<option value="${unit.name}">${unit.cost}코</option>`)
          .join("");
      }
      if (state.debugMode && refs.debugAugmentList && !refs.debugAugmentList.children.length) {
        const rarityLabel = { silver: "실버", gold: "골드", prismatic: "프리즘" };
        refs.debugAugmentList.innerHTML = Object.values(augmentPools)
          .flatMap((group) => ["silver", "gold", "prismatic"].flatMap((rarity) => (group?.[rarity] || []).map((augment) => ({ augment, rarity }))))
          .filter(({ augment }) => augment.active !== false)
          .sort((a, b) => a.augment.name.localeCompare(b.augment.name, "ko"))
          .map(({ augment, rarity }) => `<option value="${augment.name}">${rarityLabel[rarity] || rarity} · ${(augment.stages || []).map((stage) => `${stage}단계`).join(", ") || "공용"}</option>`)
          .join("");
      }
    }
    refs.shop.innerHTML = "";
    const { disabled: shopDisabled, reason: disabledReason } = shopDisabledState();
    refs.shop.classList.toggle("disabled-state", Boolean(disabledReason));
    if (disabledReason) refs.shop.dataset.disabledReason = disabledReason;
    else delete refs.shop.dataset.disabledReason;
    for (const [index, unit] of state.shop.entries()) {
      const status = shopCardStatus(unit);
      const card = document.createElement("button");
      card.className = ["shop-card", status.className].filter(Boolean).join(" ");
      card.style.setProperty("--accent", unit.color);
      card.innerHTML = `
        ${status.label ? `<span class="shop-card-badge">${status.label}</span>` : ""}
        ${status.stars ? `<span class="shop-card-stars">${status.stars}</span>` : ""}
        <span class="portrait">${unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1)}</span>
        <span class="shop-card-main">
          <strong>${displayNameFor(unit)}</strong>
          <span class="shop-card-tags">${traitPills(unit)}</span>
          <small>HP ${unit.maxHp} / 공격 ${unit.atk} / 스증 ${unit.skillAmp}</small>
        </span>
        <span class="price"><b>${unit.cost}코</b>${state.gameMode === "pvp" ? "" : `<small>풀 ${state.pool[unit.name] ?? 0}</small>`}</span>
      `;
      card.disabled = shopDisabled;
      if (disabledReason) card.title = disabledReason;
      card.addEventListener("click", () => buyUnit(index));
      refs.shop.append(card);
    }
  }

  function renderShopOdds() {
    const header = `<span>Lv</span>${[1, 2, 3, 4, 5].map((cost) => `<span>${cost}코<small>${balance.shop.stockByCost[cost]}</small></span>`).join("")}`;
    const rows = Object.entries(balance.shop.costOdds).map(([level, odds]) => `
      <div class="odds-row ${Number(level) === state.level ? "active" : ""}">
        <span>Lv.${level}</span>${odds.map((chance) => `<strong>${chance}%</strong>`).join("")}
      </div>
    `).join("");
    refs.shopOdds.innerHTML = `<div class="odds-head">${header}</div>${rows}`;
  }

  function renderCombatMetrics() {
    if (!refs.combatMetrics) return;
    const mode = metricModes[state.combatMetricMode] ? state.combatMetricMode : "damageDone";
    const rows = (state.lastCombatMetrics || [])
      .slice()
      .sort((a, b) => (b[mode] || 0) - (a[mode] || 0));
    const max = Math.max(1, ...rows.map((unit) => unit[mode] || 0));
    const buttons = Object.entries(metricModes).map(([id, option]) => `
      <button type="button" class="${mode === id ? "active" : ""}" data-combat-metric="${id}" aria-label="${option.label}" title="${option.label}">
        <span class="combat-metric-icon ${option.iconClass}" aria-hidden="true"></span>
      </button>
    `).join("");
    const list = rows.length
      ? rows.map((unit) => {
        const value = Math.round(unit[mode] || 0);
        const width = `${Math.max(4, Math.round((value / max) * 100))}%`;
        return `
          <article class="combat-metric-row">
            <span class="portrait">${unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1)}</span>
            <span class="combat-metric-main">
              <span><strong>${displayNameFor(unit)}</strong><small>${"★".repeat(unit.tier || 1)} · ${unit.cost}코</small></span>
              <i style="--value: ${width}"></i>
            </span>
            <b>${value}</b>
          </article>
        `;
      }).join("")
      : `<div class="combat-metric-empty">${metricModes[mode].empty}<small>전투가 끝나면 내 유닛의 최근 전투 기여도가 표시됩니다.</small></div>`;
    refs.combatMetrics.innerHTML = `
      <div class="combat-metric-tabs" role="radiogroup" aria-label="전투 지표 기준">${buttons}</div>
      <div class="combat-metric-list">${list}</div>
    `;
  }

  return { renderShop, renderShopOdds, renderCombatMetrics };
}
