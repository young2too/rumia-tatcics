import { traitPills } from "./traitHelpers.js";

export function createShopView({ state, refs, balance, roster, buyUnit, displayNameFor = (unit) => unit.name }) {
  function shopCardStatus(unit) {
    const owned = [...state.board, ...state.bench].filter((copy) => copy?.name === unit.name);
    if (!owned.length) return { className: "", label: "", stars: "" };
    const tierOne = owned.filter((copy) => copy.tier === 1).length;
    const tierTwo = owned.filter((copy) => copy.tier === 2).length;
    if (tierOne >= 2 && tierTwo >= 2) return { className: "can-upgrade tier-3", label: "3성 가능", stars: "★★★" };
    if (tierOne >= 2) return { className: "can-upgrade tier-2", label: "2성 가능", stars: "★★" };
    return { className: "owned", label: "", stars: "" };
  }

  function renderShop() {
    if (refs.debugShop) {
      refs.debugShop.hidden = !state.debugMode;
      refs.debugRecruitUnit.disabled = state.busy;
      refs.debugDummyToggle.disabled = state.busy;
      refs.debugDummyClear.disabled = state.busy;
      refs.debugDummyToggle.classList.toggle("active", state.debugDummyPlacement);
      refs.debugDummyToggle.textContent = state.debugDummyPlacement ? "더미 배치 ON" : "더미 배치 OFF";
      if (state.debugMode && !refs.debugUnitList.children.length) {
        refs.debugUnitList.innerHTML = roster
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "ko"))
          .map((unit) => `<option value="${unit.name}">${unit.cost}코</option>`)
          .join("");
      }
    }
    refs.shop.innerHTML = "";
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
        <span class="price"><b>${unit.cost}코</b><small>풀 ${state.pool[unit.name] ?? 0}</small></span>
      `;
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

  return { renderShop, renderShopOdds };
}
