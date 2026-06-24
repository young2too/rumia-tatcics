import { balance, bgmConfig, bossPatterns, bossRoster, communityBoardConfig, communityBoardStorageKey, patchNotesConfig, patchNotesStorageKey, rankingConfig, rankingStorageKey, roster, traitRules } from "./src/core/data.js";
import { createUnitPool, makeUnit as createUnit, sample, sellValue, sleep } from "./src/core/units.js";
import { createCombatController } from "./src/systems/combat.js";
import { createProgressionController } from "./src/systems/progression.js";
import { createShopController } from "./src/systems/shop.js";
import { createTraitController } from "./src/systems/traits.js";
import { createAudioController } from "./src/ui/audio.js";
import { createCommunityBoardController } from "./src/ui/communityBoard.js";
import { $, createRefs } from "./src/ui/dom.js";
import { bindUiEvents } from "./src/ui/events.js";
import { createPatchNotesController } from "./src/ui/patchNotes.js";
import { createRankingController } from "./src/ui/ranking.js";

const state = {
  round: 1,
  hp: balance.player.startHp,
  gold: balance.player.startGold,
  level: 1,
  xp: 0,
  shop: [],
  pool: createUnitPool(roster, balance),
  combatGrid: null,
  shopLocked: balance.shop.locked,
  oddsOpen: false,
  streakType: null,
  streakCount: 0,
  lastIncome: 0,
  bench: Array(8).fill(null),
  board: Array(32).fill(null),
  temporaryBoosts: {
    hp: 0,
    atk: 0,
    skillAmp: 0,
  },
  enemies: [],
  dragging: null,
  selected: null,
  busy: false,
  rankingOpen: false,
  rankingEntries: [],
  rankingLoaded: false,
  rankingLoading: false,
  rankingSaving: false,
  rankingError: "",
  rankingSortBy: "stage",
  rankingSortOrder: "desc",
  bgmOn: false,
  bgmError: "",
  patchNotesOpen: false,
  patchNotesSkipToday: false,
  deathRecord: null,
  rankingSubmitted: false,
  communityBoardOpen: false,
  communityBoardTab: communityBoardConfig.categories?.[0]?.id || "free",
  communityBoardPage: 1,
  communityBoardPosts: [],
  communityBoardPost: null,
  communityBoardComments: [],
  communityBoardTotal: 0,
  communityBoardLoaded: false,
  communityBoardLoading: false,
  communityBoardSaving: false,
  communityBoardCommentsLoading: false,
  communityBoardCommentSaving: false,
  communityBoardError: "",
  communityBoardCommentError: "",
  communityBoardMode: "list",
  traitRosterOpen: false,
  traitRosterTrait: "",
};

const refs = createRefs();
const audio = createAudioController({ state, refs, bgmConfig });
const ranking = createRankingController({ state, refs, rankingConfig, rankingStorageKey, renderRanking, render });
const { captureDeathRecord, loadRankings, submitRanking } = ranking;
const patchNotes = createPatchNotesController({ state, patchNotesConfig, patchNotesStorageKey, render });
const { closePatchNotes, initPatchNotes, openPatchNotes } = patchNotes;
const communityBoard = createCommunityBoardController({
  state,
  refs,
  boardConfig: communityBoardConfig,
  storageKey: communityBoardStorageKey,
  render,
});

const makeUnit = (base, tier = 1) => createUnit(base, balance, tier);

function addLog(text) {
  const item = document.createElement("div");
  item.textContent = text;
  refs.log.prepend(item);
  while (refs.log.children.length > 9) refs.log.lastChild.remove();
}

function boardUnits() {
  return state.board.filter(Boolean);
}

function selectedUnit() {
  if (!state.selected) return null;
  const arr = state[state.selected.source];
  const unit = arr?.[state.selected.index] || null;
  if (!unit) state.selected = null;
  return unit;
}

function boardLimit() {
  return state.level;
}

function temporaryBoostConfig() {
  return balance.battle.temporaryBoosts || { cost: 20, amount: 0.1, stats: [] };
}

function temporaryBoostPercent(stat) {
  return Math.round((state.temporaryBoosts?.[stat] || 0) * 100);
}

function unitRange(unit) {
  return ["사격", "술법", "지원"].includes(unit.role) ? balance.battle.rangedRange : balance.battle.meleeRange;
}

const progression = createProgressionController({ state, balance, addLog, render, boardLimit });
const { addXp, buyXp, grantRoundIncome, levelXpLabel, xpToNextLevel } = progression;

const traits = createTraitController({ state, traitRules, boardUnits });
const { activeTraits, activeTraitTier, applySynergy, nextTraitNeed } = traits;

function unitDetailStats(unit) {
  if (state.selected?.source !== "board") {
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
    };
  }
  return applySynergy(unit, activeTraits());
}

function unitStatusEffects(unit) {
  const effects = [];
  const stunTicks = unit.stunDisplayTicks ?? unit.stunTicks ?? 0;
  if (stunTicks > 0) {
    const maxTicks = Math.max(unit.stunDisplayMaxTicks || unit.stunMaxTicks || stunTicks || 1, 1);
    effects.push({ tone: "danger", label: "기절", ratio: stunTicks / maxTicks });
  }
  const immuneTicks = unit.immuneDisplayTicks ?? unit.immuneTicks ?? 0;
  if (immuneTicks > 0 || unit.status === "immune") {
    const maxTicks = Math.max(unit.immuneDisplayMaxTicks || unit.immuneMaxTicks || immuneTicks || 1, 1);
    const ticks = Math.max(immuneTicks, unit.status === "immune" ? 1 : 0);
    effects.push({ tone: "guard", label: "면역", ratio: ticks / maxTicks });
  }
  return effects;
}

const shop = createShopController({
  state,
  balance,
  roster,
  makeUnit,
  sample,
  boardUnits,
  boardLimit,
  addLog,
  render,
});
const { buyUnit, moveSelected, moveUnit, rollShop, sellSelectedUnit } = shop;

function unitNode(unit, source, index, compact = false) {
  const tpl = document.getElementById("unitTemplate");
  const node = tpl.content.firstElementChild.cloneNode(true);
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
  if (unit.hp <= 0) node.classList.add("dead");
  node.style.setProperty("--accent", unit.color);
  node.style.setProperty("--hp", `${Math.max(0, Math.round((unit.hp / unit.maxHp) * 100))}%`);
  node.style.setProperty("--mana", `${Math.max(0, Math.min(100, Math.round(unit.mana || 0)))}%`);
  node.querySelector(".portrait").innerHTML = unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1);
  node.querySelector(".name").textContent = unit.name;
  node.querySelector(".meta").textContent = compact ? unit.role : `${unit.role} · ${unit.trait}`;
  node.querySelector(".stars").textContent = "★".repeat(unit.tier);
  node.querySelector(".status-badges").innerHTML = unitStatusEffects(unit)
    .map((effect) => `
      <b class="${effect.tone}" style="--status: ${Math.max(0, Math.min(100, Math.round(effect.ratio * 100)))}%">
        <span>${effect.label}</span><i></i>
      </b>
    `)
    .join("");
  node.title = `${unit.weapon} | HP ${unit.maxHp} / 공격 ${unit.atk} / 공속 ${unit.speed} / 사거리 ${unit.range || unitRange(unit)}칸 / 스증 ${unit.skillAmp} / 방어 ${unit.defense} | ${unit.skill}${unit.skillTooltip ? ` - ${unit.skillTooltip}` : ""}`;
  node.addEventListener("dragstart", () => {
    state.dragging = { source, index };
    document.body.classList.add("dragging-unit");
    node.classList.add("dragging");
  });
  node.addEventListener("dragend", () => {
    state.dragging = null;
    document.body.classList.remove("dragging-unit");
    node.classList.remove("dragging");
    document.querySelectorAll(".can-drop").forEach((el) => el.classList.remove("can-drop"));
  });
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    if (source === "enemy" || state.busy) return;
    const alreadySelected = state.selected?.source === source && state.selected?.index === index;
    state.selected = alreadySelected ? null : { source, index };
    render();
  });
  return node;
}

function ownedCopiesForShop(name) {
  return [...state.board, ...state.bench].filter((unit) => unit?.name === name);
}

function shopCardStatus(unit) {
  const owned = ownedCopiesForShop(unit.name);
  if (!owned.length) return { className: "", label: "", stars: "" };
  const tierOne = owned.filter((copy) => copy.tier === 1).length;
  const tierTwo = owned.filter((copy) => copy.tier === 2).length;
  if (tierOne >= 2 && tierTwo >= 2) return { className: "can-upgrade tier-3", label: "3\uC131 \uAC00\uB2A5", stars: "\u2605\u2605\u2605" };
  if (tierOne >= 2) return { className: "can-upgrade tier-2", label: "2\uC131 \uAC00\uB2A5", stars: "\u2605\u2605" };
  return { className: "owned", label: "", stars: "" };
}

function renderShop() {
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
      <span><strong>${unit.name}</strong><small>${unit.role} · ${unit.trait} · HP ${unit.maxHp} / 공격 ${unit.atk} / 스증 ${unit.skillAmp}</small></span>
      <span class="price"><b>${unit.cost}코</b><small>풀 ${state.pool[unit.name] ?? 0}</small></span>
    `;
    card.addEventListener("click", () => buyUnit(index));
    refs.shop.append(card);
  }
}

function renderShopOdds() {
  const header = `
    <span>Lv</span>
    ${[1, 2, 3, 4, 5].map((cost) => `<span>${cost}코<small>${balance.shop.stockByCost[cost]}</small></span>`).join("")}
  `;
  const rows = Object.entries(balance.shop.costOdds)
    .map(([level, odds]) => {
      const isActive = Number(level) === state.level;
      return `
        <div class="odds-row ${isActive ? "active" : ""}">
          <span>Lv.${level}</span>
          ${odds.map((chance) => `<strong>${chance}%</strong>`).join("")}
        </div>
      `;
    })
    .join("");
  refs.shopOdds.innerHTML = `<div class="odds-head">${header}</div>${rows}`;
}

function renderBoard() {
  refs.board.innerHTML = "";
  const visibleBoard = state.combatGrid ? state.combatGrid.slice(16, 48) : state.board;
  visibleBoard.forEach((unit, index) => {
    const gridIndex = index + balance.battle.enemySlots;
    const gridRow = Math.floor(gridIndex / balance.battle.columns);
    const side = state.combatGrid && unit?.side ? unit.side : "ally";
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.style.setProperty("--depth", String(10 + gridRow));
    if (unit) cell.classList.add("has-unit");
    if (unit?.boss) cell.classList.add("boss-cell");
    if (state.combatGrid && unit) cell.classList.add("occupied", side);
    cell.dataset.index = String(index);
    cell.dataset.row = String(gridRow);
    cell.dataset.col = String(index % balance.battle.columns);
    cell.addEventListener("dragover", (event) => {
      event.preventDefault();
      cell.classList.add("can-drop");
    });
    cell.addEventListener("dragleave", () => cell.classList.remove("can-drop"));
    cell.addEventListener("drop", () => moveUnit("board", index));
    cell.addEventListener("click", () => moveSelected("board", index));
    if (unit) cell.append(unitNode(unit, state.combatGrid ? side : "board", index));
    refs.board.append(cell);
  });

  refs.enemyBoard.innerHTML = "";
  const visibleEnemies = state.combatGrid
    ? state.combatGrid.slice(0, 16)
    : state.enemies.some(Boolean)
      ? state.enemies
      : combat.previewBossEnemies();
  visibleEnemies.forEach((unit, index) => {
    const gridRow = Math.floor(index / balance.battle.columns);
    const side = state.combatGrid && unit?.side ? unit.side : "enemy";
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.style.setProperty("--depth", String(10 + gridRow));
    if (unit) cell.classList.add("has-unit");
    if (unit?.boss) cell.classList.add("boss-cell");
    if (state.combatGrid && unit) cell.classList.add("occupied", side);
    cell.dataset.row = String(gridRow);
    cell.dataset.col = String(index % balance.battle.columns);
    if (unit) cell.append(unitNode(unit, state.combatGrid ? side : "enemy", index, true));
    refs.enemyBoard.append(cell);
  });
  while (refs.enemyBoard.children.length < balance.battle.enemySlots) {
    const cell = document.createElement("div");
    cell.className = "cell";
    const index = refs.enemyBoard.children.length;
    cell.dataset.row = String(Math.floor(index / balance.battle.columns));
    cell.dataset.col = String(index % balance.battle.columns);
    refs.enemyBoard.append(cell);
  }
}

function renderBench() {
  refs.bench.innerHTML = "";
  renderTemporaryBoosts();
  const occupied = state.bench.filter(Boolean).length;
  refs.benchCount.textContent = `${occupied}/8`;
  state.bench.forEach((unit, index) => {
    const slot = document.createElement("div");
    slot.className = "bench-slot";
    slot.dataset.index = String(index);
    slot.addEventListener("dragover", (event) => {
      event.preventDefault();
      slot.classList.add("can-drop");
    });
    slot.addEventListener("dragleave", () => slot.classList.remove("can-drop"));
    slot.addEventListener("drop", () => moveUnit("bench", index));
    slot.addEventListener("click", () => moveSelected("bench", index));
    if (unit) slot.append(unitNode(unit, "bench", index));
    refs.bench.append(slot);
  });
}

function renderTraits() {
  const counts = activeTraits();
  const ownedNames = new Set([...state.board, ...state.bench].filter(Boolean).map((unit) => unit.name));
  refs.traits.innerHTML = "";
  for (const [trait, rule] of Object.entries(traitRules)) {
    const count = counts[trait] || 0;
    const activeTier = activeTraitTier(rule, count);
    const nextNeed = nextTraitNeed(rule, count);
    const labelCount = Math.min(count, nextNeed);
    const tierText = activeTier ? activeTier.text : `다음 단계: ${rule.tiers[0].text}`;
    const traitUnits = roster
      .filter((unit) => unit.trait === trait)
      .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ko"));
    const row = document.createElement("div");
    row.className = `trait ${activeTier ? "active" : ""}`;
    row.dataset.trait = trait;
    row.innerHTML = `
      <strong><span>${trait}</span><span>${labelCount}/${nextNeed}<i>상세</i></span></strong>
      <p>${tierText}</p>
      <div class="trait-roster" aria-label="${trait} 유닛 보유 현황">
        ${traitUnits.map((unit) => {
          const owned = ownedNames.has(unit.name);
          return `
            <span class="trait-unit ${owned ? "owned" : "missing"}" style="--accent: ${unit.color}" title="${unit.name} · ${unit.cost}코 · ${unit.role}">
              ${unit.art ? `<img src="${unit.art}" alt="${unit.name}">` : unit.name.slice(0, 1)}
            </span>
          `;
        }).join("")}
      </div>
    `;
    refs.traits.append(row);
  }
}

function renderTemporaryBoosts() {
  if (!refs.temporaryBoosts) return;
  const config = temporaryBoostConfig();
  const cost = config.cost ?? 20;
  refs.temporaryBoosts.innerHTML = (config.stats || [])
    .map((boost) => {
      const current = temporaryBoostPercent(boost.id);
      const label = current ? `${boost.label}강화 ${current}% 활성화 중` : `${boost.label}강화 ${cost}코`;
      return `
        <button class="temporary-boost" data-boost="${boost.id}" ${state.busy || state.gold < cost ? "disabled" : ""}>
          <strong>${label}</strong>
        </button>
      `;
    })
    .join("");
}

function renderTraitRosterModal() {
  refs.traitRosterModal.hidden = !state.traitRosterOpen;
  const trait = state.traitRosterTrait;
  const rule = traitRules[trait];
  const counts = activeTraits();
  const count = counts[trait] || 0;
  const nextNeed = rule ? nextTraitNeed(rule, count) : 0;
  const ownedNames = new Set([...state.board, ...state.bench].filter(Boolean).map((unit) => unit.name));
  const traitUnits = roster
    .filter((unit) => unit.trait === trait)
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ko"));

  refs.traitRosterTitle.textContent = trait ? `${trait} 유닛` : "시너지 유닛";
  refs.traitRosterMeta.textContent = trait ? `${Math.min(count, nextNeed)}/${nextNeed} 활성 · 초록: 보유 / 빨강: 미보유` : "";
  refs.traitRosterPanel.innerHTML = traitUnits.length
    ? traitUnits.map((unit) => {
        const owned = ownedNames.has(unit.name);
        return `
          <div class="trait-roster-entry ${owned ? "owned" : "missing"}">
            <span class="portrait" style="--accent: ${unit.color}">${unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1)}</span>
            <div>
              <strong>${unit.name}</strong>
              <small>${unit.cost}코 · ${unit.role} · ${unit.weapon}</small>
            </div>
            <b>${owned ? "보유" : "미보유"}</b>
          </div>
        `;
      }).join("")
    : `<div class="trait-roster-empty">표시할 유닛이 없습니다.</div>`;
}

function renderRanking() {
  const entries = sortedRankingEntries();
  refs.rankingModal.hidden = !state.rankingOpen;
  refs.rankSubmit.hidden = !state.deathRecord || state.rankingSubmitted;
  refs.rankSave.disabled = state.rankingSaving;
  refs.rankSave.textContent = state.rankingSaving ? "등록 중" : "등록";
  renderRankingSortControls();
  refs.rankingPanel.hidden = false;
  const status = state.rankingError ? `<div class="ranking-empty">${state.rankingError}</div>` : "";
  refs.rankingPanel.innerHTML = state.rankingLoading
    ? `<div class="ranking-empty">랭킹을 불러오는 중입니다.</div>`
    : entries.length
    ? entries
        .map((entry, index) => `
          <div class="rank-entry ${entry.isSubmittedEntry ? "submitted" : ""}">
            <strong><span>${entry.isSubmittedEntry ? "등록됨" : `${index + 1}.`} ${entry.name}</span><b>${entry.stage}라운드</b></strong>
            <div class="rank-board">
              ${entry.board.map((unit) => `
                <span class="rank-unit" title="${unit.name}">
                  ${unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1)}
                  <i>${"★".repeat(unit.tier)}</i>
                </span>
              `).join("")}
            </div>
          </div>
        `)
        .join("")
    : `<div class="ranking-empty">등록된 기록이 없습니다.</div>`;
  if (status) refs.rankingPanel.insertAdjacentHTML("afterbegin", status);
}

function sortedRankingEntries() {
  const direction = state.rankingSortOrder === "asc" ? 1 : -1;
  const byStage = state.rankingSortBy === "stage";
  return state.rankingEntries.slice().sort((a, b) => {
    const primaryA = byStage ? Number(a.stage) || 0 : new Date(a.createdAt).getTime() || 0;
    const primaryB = byStage ? Number(b.stage) || 0 : new Date(b.createdAt).getTime() || 0;
    if (primaryA !== primaryB) return (primaryA - primaryB) * direction;
    const fallbackA = byStage ? new Date(a.createdAt).getTime() || 0 : Number(a.stage) || 0;
    const fallbackB = byStage ? new Date(b.createdAt).getTime() || 0 : Number(b.stage) || 0;
    if (fallbackA !== fallbackB) return byStage ? fallbackA - fallbackB : fallbackB - fallbackA;
    return String(a.name).localeCompare(String(b.name), "ko");
  });
}

function renderRankingSortControls() {
  const controls = [
    { id: "stage", ref: refs.rankingSortStage, label: "\uB77C\uC6B4\uB4DC" },
    { id: "createdAt", ref: refs.rankingSortRecent, label: "\uCD5C\uC2E0" },
  ];
  for (const control of controls) {
    if (!control.ref) continue;
    const active = state.rankingSortBy === control.id;
    const arrow = active && state.rankingSortOrder === "asc" ? "\u2191" : "\u2193";
    control.ref.classList.toggle("active", active);
    control.ref.textContent = `${control.label} ${arrow}`;
    control.ref.title = `${control.label} \uC815\uB82C \uC804\uD658`;
  }
}

function renderPatchNotes() {
  refs.patchNotesModal.hidden = !state.patchNotesOpen;
  refs.patchNotesTitle.textContent = patchNotesConfig.title || "패치노트";
  refs.patchNotesMeta.textContent = [patchNotesConfig.version, patchNotesConfig.date].filter(Boolean).join(" · ");
  refs.patchNotesSkipToday.checked = state.patchNotesSkipToday;

  refs.patchNotesBody.innerHTML = "";
  if (patchNotesConfig.summary) {
    const summary = document.createElement("p");
    summary.className = "patch-notes-summary";
    summary.textContent = patchNotesConfig.summary;
    refs.patchNotesBody.append(summary);
  }

  const items = Array.isArray(patchNotesConfig.items) ? patchNotesConfig.items : [];
  if (items.length) {
    const list = document.createElement("ul");
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item;
      list.append(li);
    }
    refs.patchNotesBody.append(list);
  }
}

function renderUnitDetail() {
  const unit = selectedUnit();
  if (!unit) {
    refs.detailTier.textContent = "선택 없음";
    refs.unitDetail.innerHTML = `
      <div class="detail-empty">벤치나 보드의 내 유닛을 선택하면 상세 정보가 표시됩니다.</div>
    `;
    refs.sellUnit.disabled = true;
    refs.sellUnit.textContent = "판매";
    return;
  }

  const effective = unitDetailStats(unit);
  const stats = [
    ["HP", `${Math.max(0, Math.round(unit.hp))} / ${unit.maxHp}`],
    ["공격", Math.round(effective.atk)],
    ["공속", effective.speed.toFixed(2)],
    ["사거리", `${unit.range || unitRange(unit)}칸`],
    ["스증", Math.round(effective.skillAmp)],
    ["방어", Math.round(effective.defense)],
    ["마나", `${Math.round(unit.mana || 0)} / 100`],
  ];
  if (effective.critChance > 0) stats.push(["치명", `${Math.round(effective.critChance * 100)}%`]);
  if (effective.openingCritMultiplier > 1) stats.push(["첫 치명", `${Math.round(effective.openingCritMultiplier * 100)}%`]);
  if (effective.lifeSteal > 0) stats.push(["흡혈", `${Math.round(effective.lifeSteal * 100)}%`]);
  if (effective.damageReduction > 0) stats.push(["피해감소", `${Math.round(effective.damageReduction * 100)}%`]);
  if (effective.manaGain > 1) stats.push(["마나획득", `${Math.round(effective.manaGain * 100)}%`]);
  if (unit.role === "술법" && effective.skillTargets > 2) stats.push(["스킬타격", effective.skillTargets >= 99 ? "전체" : `${Math.round(effective.skillTargets)}명`]);
  if (unit.role === "지원" && effective.healTargets > 2) stats.push(["회복대상", effective.healTargets >= 99 ? "전체" : `${Math.round(effective.healTargets)}명`]);
  refs.detailTier.textContent = `${"★".repeat(unit.tier)} · ${unit.cost}코`;
  refs.sellUnit.disabled = state.busy;
  refs.sellUnit.textContent = `${sellValue(unit)}크레딧에 판매`;
  refs.unitDetail.innerHTML = `
    <div class="detail-head" style="--accent: ${unit.color}">
      <span class="portrait">${unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1)}</span>
      <div>
        <strong>${unit.name}</strong>
        <small>${unit.role} · ${unit.trait} · ${unit.weapon}</small>
      </div>
    </div>
    <div class="detail-stats">
      ${stats.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}
    </div>
    <div class="detail-skill">
      <span>스킬</span>
      <strong>${unit.skill}</strong>
      ${unit.skillTooltip ? `<p>${unit.skillTooltip}</p>` : ""}
    </div>
  `;
}

function render() {
  refs.round.textContent = state.round;
  refs.hp.textContent = state.hp;
  refs.gold.textContent = state.gold;
  refs.streak.textContent = state.streakType ? `${state.streakType === "win" ? "연승" : "연패"} ${state.streakCount}` : "-";
  refs.income.textContent = `수입 +${state.lastIncome}`;
  refs.level.textContent = state.level;
  refs.levelXp.textContent = levelXpLabel();
  const nextXp = xpToNextLevel();
  const xpWidth = state.level >= balance.player.maxLevel ? "100%" : `${Math.round((state.xp / nextXp) * 100)}%`;
  refs.levelXpBar.style.width = xpWidth;
  refs.fieldXpBar.style.width = xpWidth;
  audio.renderBgmState();
  refs.levelUp.textContent =
    state.level >= balance.player.maxLevel ? "최대 레벨" : `${balance.player.buyXpCost}크레딧 → ${balance.player.buyXpAmount}XP`;
  refs.levelUp.disabled = state.busy || state.level >= balance.player.maxLevel;
  refs.battle.disabled = state.busy;
  refs.battle.textContent = state.busy ? "전투 중" : "전투 시작";
  const bossInfo = combat.currentBossInfo();
  refs.boardCapacity.classList.toggle("boss-warning", Boolean(bossInfo));
  refs.boardCapacityMain.textContent = bossInfo ? "BOSS" : `${boardUnits().length}/${boardLimit()}`;
  refs.boardCapacitySub.textContent = bossInfo ? `${bossInfo.name} 출현` : "";
  refs.boardCapacity.hidden = Boolean(state.combatGrid);
  refs.shopLock.textContent = state.shopLocked ? "잠금 중" : "잠금 해제";
  refs.shopLock.classList.toggle("active", state.shopLocked);
  refs.oddsPopover.hidden = !state.oddsOpen;
  refs.oddsToggle.classList.toggle("active", state.oddsOpen);
  renderShop();
  renderShopOdds();
  renderBoard();
  renderBench();
  renderTraits();
  renderUnitDetail();
  renderRanking();
  renderPatchNotes();
  renderTraitRosterModal();
  communityBoard.renderCommunityBoard();
}

const combat = createCombatController({
  state,
  balance,
  bossRoster,
  bossPatterns,
  roster,
  refs,
  sample,
  boardUnits,
  addLog,
  activeTraits,
  applySynergy,
  render,
  rollShop,
  addXp,
  grantRoundIncome,
  captureDeathRecord,
  sleep,
});

bindUiEvents({
  $,
  refs,
  state,
  balance,
  actions: {
    addLog,
    buyTemporaryBoost(stat) {
      const config = temporaryBoostConfig();
      const boost = (config.stats || []).find((item) => item.id === stat);
      const cost = config.cost ?? 20;
      const amount = config.amount ?? 0.1;
      if (!boost || state.busy) return;
      if (state.gold < cost) return addLog(`${boost.label} 강화에는 ${cost}크레딧이 필요합니다.`);
      state.gold -= cost;
      state.temporaryBoosts[stat] = (state.temporaryBoosts[stat] || 0) + amount;
      addLog(`${boost.label} 강화 구매: 다음 전투 ${boost.label} +${temporaryBoostPercent(stat)}%.`);
      render();
    },
    rollShop,
    render,
    simulate: combat.simulate,
    buyXp,
    sellSelectedUnit,
    toggleBgm: audio.toggleBgm,
    loadRankings,
    submitRanking,
    setRankingSort(sortBy) {
      if (state.rankingSortBy === sortBy) {
        state.rankingSortOrder = state.rankingSortOrder === "desc" ? "asc" : "desc";
      } else {
        state.rankingSortBy = sortBy;
        state.rankingSortOrder = "desc";
      }
      render();
      loadRankings(true);
    },
    closePatchNotes,
    openPatchNotes,
    openTraitRoster(trait) {
      state.traitRosterTrait = trait;
      state.traitRosterOpen = true;
      render();
    },
    closeTraitRoster() {
      state.traitRosterOpen = false;
      render();
    },
  },
});

communityBoard.bindCommunityBoardEvents();
addLog("상점에서 캐릭터를 영입하고 보드로 드래그하세요.");
loadRankings();
initPatchNotes();
rollShop();
