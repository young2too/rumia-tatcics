import { traitCountsFor, traitPills, traitSummary, unitTraits } from "./traitHelpers.js";

export function createTraitView({ state, refs, roster, traitRules, hiddenTraitRules, ownedUnits, activeTraits, activeHiddenTraits, activeTraitTier, nextTraitNeed, displayNameFor = (unit) => unit.name }) {
  const unitsFor = (trait) => roster
    .filter((unit) => unitTraits(unit).includes(trait))
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ko"));

  function ownershipState(unit, boardNames, benchNames) {
    if (boardNames.has(unit.name)) return "fielded";
    if (benchNames.has(unit.name)) return "benched";
    return "missing";
  }

  function renderTraits() {
    const counts = traitCountsFor(ownedUnits());
    const activeCounts = activeTraits();
    const boardNames = new Set(state.board.filter(Boolean).map((unit) => unit.name));
    const benchNames = new Set(state.bench.filter(Boolean).map((unit) => unit.name));
    refs.traits.innerHTML = "";
    if (refs.hiddenTraitToggle) {
      refs.hiddenTraitToggle.classList.toggle("active", state.showHiddenTraits);
      refs.hiddenTraitToggle.textContent = state.showHiddenTraits ? "히든 ON" : "히든 OFF";
      refs.hiddenTraitToggle.title = state.showHiddenTraits ? "달성한 히든 시너지 숨기기" : "달성한 히든 시너지 표시";
    }
    if (state.showHiddenTraits) {
      for (const hidden of activeHiddenTraits()) {
        const row = document.createElement("div");
        row.className = "trait active hidden-trait";
        row.dataset.trait = hidden.name;
        row.innerHTML = `
          <strong><span>${hidden.name}</span><span><i>상세</i></span></strong>
          <p>효과는 상세 확인</p>
        `;
        refs.traits.append(row);
      }
    }
    for (const [trait, rule] of Object.entries(traitRules)) {
      const count = counts[trait] || 0;
      if (count <= 0) continue;
      const activeCount = activeCounts[trait] || 0;
      const activeTier = activeTraitTier(rule, activeCount);
      const nextNeed = nextTraitNeed(rule, activeCount);
      const row = document.createElement("div");
      row.className = `trait ${activeTier ? "active" : ""}`;
      row.dataset.trait = trait;
      row.innerHTML = `
        <strong><span>${trait}</span><span>${Math.min(activeCount, nextNeed)}/${nextNeed}<b>보유 ${count}</b><i>상세</i></span></strong>
        <p>${activeTier ? activeTier.text : `다음 단계: ${rule.tiers[0].text}`}</p>
        <div class="trait-roster" aria-label="${trait} 유닛 보유 현황">
          ${unitsFor(trait).map((unit) => {
            const ownership = ownershipState(unit, boardNames, benchNames);
            const label = ownership === "fielded" ? "전장" : ownership === "benched" ? "벤치" : "미보유";
            return `<span class="trait-unit ${ownership}" style="--accent: ${unit.color}" title="${displayNameFor(unit)} · ${unit.cost}코 · ${unit.role} · ${label}">${unit.art ? `<img src="${unit.art}" alt="${displayNameFor(unit)}">` : displayNameFor(unit).slice(0, 1)}</span>`;
          }).join("")}
        </div>
      `;
      refs.traits.append(row);
    }
  }

  function renderTraitTableModal() {
    refs.traitTableModal.hidden = !state.traitTableOpen;
    if (!state.traitTableOpen) return;
    const boardNames = new Set(state.board.filter(Boolean).map((unit) => unit.name));
    const benchNames = new Set(state.bench.filter(Boolean).map((unit) => unit.name));
    refs.traitTablePanel.innerHTML = Object.entries(traitRules).map(([trait, rule]) => `
      <section class="trait-table-group">
        <header><strong>${trait}</strong><p>${traitSummary(trait)}</p><span>${(rule.tiers || []).map((tier) => tier.need).join("/")}</span></header>
        <div class="trait-table-units">
          ${unitsFor(trait).map((unit) => {
            const ownership = ownershipState(unit, boardNames, benchNames);
            return `
              <span class="trait-table-unit ${ownership}" style="--accent: ${unit.color}" title="${displayNameFor(unit)}">
                <span class="portrait">${unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1)}</span>
                <b>${displayNameFor(unit)}</b><small><em>${unit.cost}코</em>${traitPills(unit)}</small>
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
    const hiddenRule = hiddenTraitRules[trait];
    const rule = traitRules[trait] || hiddenRule;
    const count = hiddenRule ? hiddenRule.requiredUnits.length : traitCountsFor(ownedUnits())[trait] || 0;
    const activeCount = hiddenRule ? hiddenRule.requiredUnits.length : activeTraits()[trait] || 0;
    const nextNeed = hiddenRule ? hiddenRule.requiredUnits.length : rule ? nextTraitNeed(rule, activeCount) : 0;
    const boardNames = new Set(state.board.filter(Boolean).map((unit) => unit.name));
    const benchNames = new Set(state.bench.filter(Boolean).map((unit) => unit.name));
    const traitUnits = hiddenRule
      ? hiddenRule.requiredUnits.map((name) => roster.find((unit) => unit.name === name)).filter(Boolean)
      : unitsFor(trait);
    refs.traitRosterTitle.textContent = trait ? `${trait} 유닛` : "시너지 유닛";
    refs.traitRosterMeta.textContent = hiddenRule ? "히든 시너지 활성" : trait ? `전장 ${Math.min(activeCount, nextNeed)}/${nextNeed} · 보유 ${count} · 초록: 전장 / 노랑: 벤치 / 빨강: 미보유` : "";
    const description = hiddenRule ? `<p class="hidden-trait-description">${hiddenRule.text}</p>` : "";
    refs.traitRosterPanel.innerHTML = description + (traitUnits.length ? traitUnits.map((unit) => {
      const ownership = ownershipState(unit, boardNames, benchNames);
      const label = ownership === "fielded" ? "전장" : ownership === "benched" ? "벤치" : "미보유";
      return `
        <div class="trait-roster-entry ${ownership}">
          <span class="portrait" style="--accent: ${unit.color}">${unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1)}</span>
          <div><strong>${displayNameFor(unit)}</strong><span class="trait-roster-tags"><em>${unit.cost}코</em>${traitPills(unit)}</span></div>
          <b>${label}</b>
        </div>
      `;
    }).join("") : `<div class="trait-roster-empty">표시할 유닛이 없습니다.</div>`);
  }

  return { renderTraitRosterModal, renderTraits, renderTraitTableModal };
}
