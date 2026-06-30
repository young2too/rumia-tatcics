import { traitCountsFor, traitPills, traitSummary, unitTraits } from "./traitHelpers.js";

export function createTraitView({ state, refs, roster, traitRules, ownedUnits, activeTraits, activeTraitTier, nextTraitNeed }) {
  const unitsFor = (trait) => roster
    .filter((unit) => unitTraits(unit).includes(trait))
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ko"));

  function renderTraits() {
    const counts = traitCountsFor(ownedUnits());
    const activeCounts = activeTraits();
    const ownedNames = new Set(ownedUnits().map((unit) => unit.name));
    refs.traits.innerHTML = "";
    for (const [trait, rule] of Object.entries(traitRules)) {
      const count = counts[trait] || 0;
      if (count <= 0) continue;
      const activeTier = activeTraitTier(rule, activeCounts[trait] || 0);
      const visibleTier = activeTraitTier(rule, count);
      const nextNeed = nextTraitNeed(rule, count);
      const row = document.createElement("div");
      row.className = `trait ${activeTier ? "active" : ""}`;
      row.dataset.trait = trait;
      row.innerHTML = `
        <strong><span>${trait}</span><span>${Math.min(count, nextNeed)}/${nextNeed}<i>상세</i></span></strong>
        <p>${visibleTier ? visibleTier.text : `다음 단계: ${rule.tiers[0].text}`}</p>
        <div class="trait-roster" aria-label="${trait} 유닛 보유 현황">
          ${unitsFor(trait).map((unit) => {
            const owned = ownedNames.has(unit.name);
            return `<span class="trait-unit ${owned ? "owned" : "missing"}" style="--accent: ${unit.color}" title="${unit.name} · ${unit.cost}코 · ${unit.role}">${unit.art ? `<img src="${unit.art}" alt="${unit.name}">` : unit.name.slice(0, 1)}</span>`;
          }).join("")}
        </div>
      `;
      refs.traits.append(row);
    }
  }

  function renderTraitTableModal() {
    refs.traitTableModal.hidden = !state.traitTableOpen;
    if (!state.traitTableOpen) return;
    const ownedNames = new Set(ownedUnits().map((unit) => unit.name));
    refs.traitTablePanel.innerHTML = Object.entries(traitRules).map(([trait, rule]) => `
      <section class="trait-table-group">
        <header><strong>${trait}</strong><p>${traitSummary(trait)}</p><span>${(rule.tiers || []).map((tier) => tier.need).join("/")}</span></header>
        <div class="trait-table-units">
          ${unitsFor(trait).map((unit) => {
            const owned = ownedNames.has(unit.name);
            return `
              <span class="trait-table-unit ${owned ? "owned" : "missing"}" style="--accent: ${unit.color}" title="${unit.name}">
                <span class="portrait">${unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1)}</span>
                <b>${unit.name}</b><small><em>${unit.cost}코</em>${traitPills(unit)}</small>
              </span>
            `;
          }).join("")}
        </div>
      </section>
    `).join("");
  }

  function renderTraitRosterModal() {
    refs.traitRosterModal.hidden = !state.traitRosterOpen;
    const trait = state.traitRosterTrait;
    const rule = traitRules[trait];
    const count = traitCountsFor(ownedUnits())[trait] || 0;
    const nextNeed = rule ? nextTraitNeed(rule, count) : 0;
    const ownedNames = new Set(ownedUnits().map((unit) => unit.name));
    const traitUnits = unitsFor(trait);
    refs.traitRosterTitle.textContent = trait ? `${trait} 유닛` : "시너지 유닛";
    refs.traitRosterMeta.textContent = trait ? `${Math.min(count, nextNeed)}/${nextNeed} 활성 · 초록: 보유 / 빨강: 미보유` : "";
    refs.traitRosterPanel.innerHTML = traitUnits.length ? traitUnits.map((unit) => {
      const owned = ownedNames.has(unit.name);
      return `
        <div class="trait-roster-entry ${owned ? "owned" : "missing"}">
          <span class="portrait" style="--accent: ${unit.color}">${unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1)}</span>
          <div><strong>${unit.name}</strong><span class="trait-roster-tags"><em>${unit.cost}코</em>${traitPills(unit)}</span></div>
          <b>${owned ? "보유" : "미보유"}</b>
        </div>
      `;
    }).join("") : `<div class="trait-roster-empty">표시할 유닛이 없습니다.</div>`;
  }

  return { renderTraitRosterModal, renderTraits, renderTraitTableModal };
}
