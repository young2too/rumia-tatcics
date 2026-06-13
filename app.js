import "./config.js";

import rosterData from "./data/roster.json" with { type: "json" };

const roster = rosterData.map((unit) => ({ ...unit }));

import balanceData from "./data/balance.json" with { type: "json" };
import traitRulesData from "./data/traits.json" with { type: "json" };
import bossRosterData from "./data/bosses.json" with { type: "json" };
import bossPatternsData from "./data/boss-patterns.json" with { type: "json" };

const balance = structuredClone(balanceData);
const traitRules = structuredClone(traitRulesData);
const bossRoster = bossRosterData.map((boss) => ({ ...boss }));
const bossPatterns = structuredClone(bossPatternsData);
const rankingStorageKey = "lumia-tactics-rankings";
const rankingConfig = window.LUMIA_TACTICS_CONFIG?.supabase || {};
const bgmConfig = window.LUMIA_TACTICS_CONFIG?.bgm || {};
let memoryRankings = [];
let bgmAudio = null;

const state = {
  round: 1,
  hp: balance.player.startHp,
  gold: balance.player.startGold,
  level: 1,
  xp: 0,
  shop: [],
  pool: createUnitPool(),
  combatGrid: null,
  shopLocked: balance.shop.locked,
  oddsOpen: false,
  streakType: null,
  streakCount: 0,
  lastIncome: 0,
  bench: Array(8).fill(null),
  board: Array(32).fill(null),
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
  bgmOn: false,
  bgmError: "",
  deathRecord: null,
  rankingSubmitted: false,
};

const $ = (id) => document.getElementById(id);
const refs = {
  round: $("round"),
  hp: $("hp"),
  gold: $("gold"),
  streak: $("streak"),
  income: $("income"),
  level: $("level"),
  levelXp: $("levelXp"),
  levelXpBar: $("levelXpBar"),
  fieldXpBar: $("fieldXpBar"),
  levelUp: $("levelUp"),
  battle: $("battle"),
  shop: $("shop"),
  oddsToggle: $("oddsToggle"),
  oddsPopover: $("oddsPopover"),
  shopLock: $("shopLock"),
  shopOdds: $("shopOdds"),
  boardCapacity: $("boardCapacity"),
  boardCapacityMain: $("boardCapacityMain"),
  boardCapacitySub: $("boardCapacitySub"),
  board: $("board"),
  enemyBoard: $("enemyBoard"),
  bench: $("bench"),
  benchCount: $("benchCount"),
  traits: $("traits"),
  log: $("log"),
  phase: $("phase"),
  unitDetail: $("unitDetail"),
  detailTier: $("detailTier"),
  sellUnit: $("sellUnit"),
  bgmToggle: $("bgmToggle"),
  rankingToggle: $("rankingToggle"),
  rankingClose: $("rankingClose"),
  rankingModal: $("rankingModal"),
  rankingPanel: $("rankingPanel"),
  rankSubmit: $("rankSubmit"),
  rankName: $("rankName"),
  rankSave: $("rankSave"),
};

function makeUnit(base, tier = 1) {
  const tierIndex = tier - 1;
  return {
    ...base,
    id: crypto.randomUUID(),
    tier,
    cost: base.cost,
    maxHp: Math.round(base.hp * balance.tier.hp[tierIndex]),
    hp: Math.round(base.hp * balance.tier.hp[tierIndex]),
    atk: Math.round(base.atk * balance.tier.atk[tierIndex]),
    speed: base.speed,
    skillAmp: Math.round(base.skillAmp * balance.tier.skillAmp[tierIndex]),
    defense: Math.round(base.defense * balance.tier.defense[tierIndex]),
  };
}

function createUnitPool() {
  return Object.fromEntries(roster.map((unit) => [unit.name, balance.shop.stockByCost[unit.cost] || 0]));
}

function localRankingEntries() {
  try {
    return JSON.parse(localStorage.getItem(rankingStorageKey) || "[]");
  } catch {
    return memoryRankings;
  }
}

function saveLocalRankingEntries(entries) {
  memoryRankings = entries;
  try {
    localStorage.setItem(rankingStorageKey, JSON.stringify(entries));
  } catch {
    // localStorage can be unavailable in some embedded contexts.
  }
}

function initBgm() {
  if (bgmAudio || !bgmConfig.src) return bgmAudio;
  bgmAudio = new Audio(bgmConfig.src);
  bgmAudio.loop = true;
  bgmAudio.preload = "auto";
  bgmAudio.volume = Math.max(0, Math.min(1, bgmConfig.volume ?? 0.35));
  bgmAudio.addEventListener("error", () => {
    state.bgmOn = false;
    state.bgmError = "BGM 파일 없음";
    renderBgmState();
  });
  return bgmAudio;
}

function renderBgmState() {
  refs.bgmToggle.disabled = !bgmConfig.src;
  refs.bgmToggle.classList.toggle("active", state.bgmOn);
  refs.bgmToggle.classList.toggle("error", Boolean(state.bgmError));
  refs.bgmToggle.textContent = state.bgmError || (state.bgmOn ? "BGM ON" : "BGM");
  refs.bgmToggle.title = bgmConfig.src
    ? `${state.bgmOn ? "배경음악 끄기" : "배경음악 켜기"} (${bgmConfig.src})`
    : "BGM 파일이 설정되지 않았습니다.";
}

async function toggleBgm() {
  const audio = initBgm();
  if (!audio) {
    state.bgmError = "BGM 없음";
    renderBgmState();
    return;
  }

  state.bgmError = "";
  try {
    if (audio.paused) {
      await audio.play();
      state.bgmOn = true;
    } else {
      audio.pause();
      state.bgmOn = false;
    }
  } catch {
    state.bgmOn = false;
    state.bgmError = "재생 차단";
  }
  renderBgmState();
}

function rankingBackendEnabled() {
  return Boolean(rankingConfig.url && rankingConfig.anonKey && rankingConfig.table);
}

function rankingEndpoint(query = "") {
  return `${rankingConfig.url.replace(/\/$/, "")}/rest/v1/${rankingConfig.table}${query}`;
}

function rankingHeaders(extra = {}) {
  return {
    apikey: rankingConfig.anonKey,
    Authorization: `Bearer ${rankingConfig.anonKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function normalizeRankingEntry(entry) {
  return {
    id: entry.id || crypto.randomUUID(),
    name: entry.name || entry.nickname || "익명",
    stage: Number(entry.stage) || 1,
    board: Array.isArray(entry.board) ? entry.board : [],
    createdAt: entry.createdAt || entry.created_at || new Date().toISOString(),
  };
}

async function loadRankings(force = false) {
  if (state.rankingLoading || (state.rankingLoaded && !force)) return;
  state.rankingLoading = true;
  state.rankingError = "";
  renderRanking();

  try {
    if (!rankingBackendEnabled()) {
      state.rankingEntries = localRankingEntries().map(normalizeRankingEntry);
      return;
    }

    const response = await fetch(rankingEndpoint("?select=id,nickname,stage,board,created_at&order=stage.desc,created_at.asc&limit=50"), {
      headers: rankingHeaders(),
    });
    if (!response.ok) throw new Error(`랭킹 조회 실패 (${response.status})`);
    state.rankingEntries = (await response.json()).map(normalizeRankingEntry);
  } catch (error) {
    state.rankingError = rankingBackendEnabled()
      ? "서버 랭킹을 불러오지 못해 로컬 기록을 표시합니다."
      : "";
    state.rankingEntries = localRankingEntries().map(normalizeRankingEntry);
    console.warn(error);
  } finally {
    state.rankingLoaded = true;
    state.rankingLoading = false;
    renderRanking();
  }
}

function boardSnapshot(board = state.board) {
  return board
    .filter(Boolean)
    .map((unit) => ({
      name: unit.name,
      tier: unit.tier,
      art: unit.art,
      color: unit.color,
      cost: unit.cost,
    }));
}

function captureDeathRecord(stage, board = state.board) {
  if (state.deathRecord) return;
  state.deathRecord = {
    stage,
    board: boardSnapshot(board),
    createdAt: new Date().toISOString(),
  };
  state.rankingSubmitted = false;
  state.rankingOpen = true;
}

async function submitRanking() {
  if (!state.deathRecord || state.rankingSubmitted) return;
  if (state.rankingSaving) return;
  const name = refs.rankName.value.trim().slice(0, 12) || "익명";
  const entry = {
    id: crypto.randomUUID(),
    name,
    ...state.deathRecord,
  };
  state.rankingSaving = true;
  state.rankingError = "";
  renderRanking();

  try {
    if (rankingBackendEnabled()) {
      const response = await fetch(rankingEndpoint(), {
        method: "POST",
        headers: rankingHeaders({ Prefer: "return=minimal" }),
        body: JSON.stringify({
          nickname: entry.name,
          stage: entry.stage,
          board: entry.board,
        }),
      });
      if (!response.ok) throw new Error(`랭킹 등록 실패 (${response.status})`);
      state.rankingSubmitted = true;
      refs.rankName.value = "";
      await loadRankings(true);
      render();
      return;
    }

    throw new Error("서버 랭킹 설정이 없습니다.");
  } catch (error) {
    const entries = [entry, ...localRankingEntries()]
      .map(normalizeRankingEntry)
      .sort((a, b) => b.stage - a.stage || new Date(a.createdAt) - new Date(b.createdAt))
      .slice(0, 20);
    saveLocalRankingEntries(entries);
    state.rankingEntries = entries;
    state.rankingError = rankingBackendEnabled()
      ? "서버 등록에 실패해 이 브라우저에 임시 저장했습니다."
      : "서버 설정 전이라 이 브라우저에 임시 저장했습니다.";
    state.rankingSubmitted = true;
    refs.rankName.value = "";
    console.warn(error);
  } finally {
    state.rankingSaving = false;
    render();
  }
}

function sample(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedCostForLevel(level) {
  const odds = balance.shop.costOdds[level] || balance.shop.costOdds[balance.player.maxLevel];
  const roll = Math.random() * 100;
  let sum = 0;
  for (let i = 0; i < odds.length; i++) {
    sum += odds[i];
    if (roll < sum) return i + 1;
  }
  return 1;
}

function ownedThreeStarNames() {
  return new Set([...state.bench, ...state.board].filter((unit) => unit?.tier >= 3).map((unit) => unit.name));
}

function canAppearInShop(unit) {
  return (state.pool[unit.name] || 0) > 0 && !ownedThreeStarNames().has(unit.name);
}

function availableRosterByCost(cost) {
  return roster.filter((unit) => unit.cost === cost && canAppearInShop(unit));
}

function pickShopUnitBase() {
  const preferredCost = weightedCostForLevel(state.level);
  const preferred = availableRosterByCost(preferredCost);
  if (preferred.length) return sample(preferred);

  const odds = balance.shop.costOdds[state.level] || balance.shop.costOdds[balance.player.maxLevel];
  const fallbackCosts = odds
    .map((chance, index) => ({ cost: index + 1, chance }))
    .filter((entry) => entry.chance > 0)
    .sort((a, b) => b.chance - a.chance)
    .map((entry) => entry.cost);
  for (const cost of fallbackCosts) {
    const available = availableRosterByCost(cost);
    if (available.length) return sample(available);
  }
  return sample(roster.filter(canAppearInShop));
}

function pruneShopForOwnedThreeStars() {
  const blocked = ownedThreeStarNames();
  if (!blocked.size) return;
  state.shop = state.shop.filter((unit) => !blocked.has(unit.name));
}

function rollShop() {
  const size = Math.min(balance.shop.maxSize, balance.shop.baseSize + state.level);
  state.shop = Array.from({ length: size }, () => {
    const base = pickShopUnitBase();
    return base ? makeUnit(base, 1) : null;
  }).filter(Boolean);
  render();
}

function addLog(text) {
  const item = document.createElement("div");
  item.textContent = text;
  refs.log.prepend(item);
  while (refs.log.children.length > 9) refs.log.lastChild.remove();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function xpToNextLevel() {
  return balance.player.levelXp[state.level] || 0;
}

function levelXpLabel() {
  if (state.level >= balance.player.maxLevel) return "MAX";
  return `${state.xp} / ${xpToNextLevel()} XP`;
}

function boardLimit() {
  return state.level;
}

function addXp(amount, reason) {
  if (state.level >= balance.player.maxLevel) return;
  state.xp += amount;
  let leveled = false;
  while (state.level < balance.player.maxLevel && state.xp >= xpToNextLevel()) {
    state.xp -= xpToNextLevel();
    state.level += 1;
    leveled = true;
  }
  if (leveled) {
    addLog(`${reason}: ${amount}XP 획득. 레벨 ${state.level}! 배치 한도 ${boardLimit()}명.`);
  } else {
    addLog(`${reason}: ${amount}XP 획득.`);
  }
}

function unitCopyCount(unit) {
  return unit.tier === 3 ? 9 : unit.tier === 2 ? 3 : 1;
}

function sellValue(unit) {
  return unit.cost * unitCopyCount(unit);
}

function ownedCopies(name, tier) {
  return [...state.bench, ...state.board].filter((unit) => unit?.name === name && unit.tier === tier);
}

function canBuyIntoImmediateCombine(unit) {
  return unit?.tier === 1 && ownedCopies(unit.name, 1).length >= 2;
}

function forceCombinePurchasedUnit(unit) {
  let removed = 0;
  let firstRemoved = null;
  for (const arr of [state.bench, state.board]) {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i]?.name === unit.name && arr[i]?.tier === unit.tier && removed < 2) {
        if (!firstRemoved) firstRemoved = { arr, index: i };
        arr[i] = null;
        removed++;
      }
    }
  }

  if (removed < 2 || !firstRemoved) return false;
  firstRemoved.arr[firstRemoved.index] = makeUnit(roster.find((base) => base.name === unit.name), unit.tier + 1);
  addLog(`${unit.name} ${unit.tier + 1}성 합성!`);
  return true;
}

function stockLimit(unit) {
  return balance.shop.stockByCost[unit.cost] || 0;
}

function updateStreak(win) {
  const type = win ? "win" : "loss";
  if (state.streakType === type) {
    state.streakCount += 1;
  } else {
    state.streakType = type;
    state.streakCount = 1;
  }
}

function streakBonus() {
  if (state.streakCount >= 5) return 3;
  if (state.streakCount >= 4) return 2;
  if (state.streakCount >= 2) return 1;
  return 0;
}

function interestGold() {
  return Math.min(balance.battle.maxInterest, Math.floor(state.gold / balance.battle.interestStep));
}

function grantRoundIncome(win) {
  updateStreak(win);
  const base = balance.battle.baseIncome;
  const winGold = win ? balance.battle.winIncome : 0;
  const streakGold = streakBonus();
  const interest = interestGold();
  const total = base + winGold + streakGold + interest;
  state.gold += total;
  state.lastIncome = total;
  const streakLabel = state.streakType === "win" ? "연승" : "연패";
  addLog(`수입 +${total}: 기본 ${base}, ${win ? `승리 ${winGold}, ` : ""}${streakLabel} ${state.streakCount} (${streakGold}), 이자 ${interest}.`);
  return total;
}

function activeTraits() {
  const counts = {};
  const uniqueByTrait = {};
  for (const unit of boardUnits()) {
    uniqueByTrait[unit.trait] ||= new Set();
    uniqueByTrait[unit.trait].add(unit.name);
  }
  for (const [trait, names] of Object.entries(uniqueByTrait)) counts[trait] = names.size;
  return counts;
}

function activeTraitTier(rule, count) {
  return rule?.tiers?.filter((tier) => count >= tier.need).at(-1) || null;
}

function nextTraitNeed(rule, count) {
  return rule?.tiers?.find((tier) => count < tier.need)?.need || rule?.tiers?.at(-1)?.need || 0;
}

function applySynergy(unit, counts) {
  const stats = {
    hp: unit.maxHp,
    atk: unit.atk,
    speed: unit.speed,
    skillAmp: unit.skillAmp,
    defense: unit.defense,
    heal: 1,
  };
  const rule = traitRules[unit.trait];
  const tier = activeTraitTier(rule, counts[unit.trait] || 0);
  for (const effect of tier?.effects || []) {
    if (effect.stat in stats) stats[effect.stat] *= effect.multiply;
  }
  return stats;
}

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
  node.title = `${unit.weapon} | HP ${unit.maxHp} / 공격 ${unit.atk} / 공속 ${unit.speed} / 스증 ${unit.skillAmp} / 방어 ${unit.defense} | ${unit.skill}`;
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

function renderShop() {
  refs.shop.innerHTML = "";
  for (const [index, unit] of state.shop.entries()) {
    const card = document.createElement("button");
    card.className = "shop-card";
    card.style.setProperty("--accent", unit.color);
    card.innerHTML = `
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
  const bossPreviewEnemies = () => {
    const slots = Array(balance.battle.enemySlots).fill(null);
    if (isBossRound()) {
      slots[12] = makeBossUnit(Math.floor(state.round / balance.battle.bossInterval));
      slots[12].side = "enemy";
    }
    return slots;
  };
  const visibleEnemies = state.combatGrid
    ? state.combatGrid.slice(0, 16)
    : state.enemies.some(Boolean)
      ? state.enemies
      : bossPreviewEnemies();
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
  refs.traits.innerHTML = "";
  for (const [trait, rule] of Object.entries(traitRules)) {
    const count = counts[trait] || 0;
    const activeTier = activeTraitTier(rule, count);
    const nextNeed = nextTraitNeed(rule, count);
    const labelCount = Math.min(count, nextNeed);
    const tierText = activeTier ? activeTier.text : `다음 단계: ${rule.tiers[0].text}`;
    const row = document.createElement("div");
    row.className = `trait ${activeTier ? "active" : ""}`;
    row.innerHTML = `<strong><span>${trait}</span><span>${labelCount}/${nextNeed}</span></strong><p>${tierText}</p>`;
    refs.traits.append(row);
  }
}

function renderRanking() {
  const entries = state.rankingEntries;
  refs.rankingModal.hidden = !state.rankingOpen;
  refs.rankSubmit.hidden = !state.deathRecord || state.rankingSubmitted;
  refs.rankSave.disabled = state.rankingSaving;
  refs.rankSave.textContent = state.rankingSaving ? "등록 중" : "등록";
  refs.rankingPanel.hidden = false;
  const status = state.rankingError ? `<div class="ranking-empty">${state.rankingError}</div>` : "";
  refs.rankingPanel.innerHTML = state.rankingLoading
    ? `<div class="ranking-empty">랭킹을 불러오는 중입니다.</div>`
    : entries.length
    ? entries
        .map((entry, index) => `
          <div class="rank-entry">
            <strong><span>${index + 1}. ${entry.name}</span><b>${entry.stage}라운드</b></strong>
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

  const stats = [
    ["HP", `${Math.max(0, Math.round(unit.hp))} / ${unit.maxHp}`],
    ["공격", unit.atk],
    ["공속", unit.speed.toFixed(2)],
    ["스증", unit.skillAmp],
    ["방어", unit.defense],
    ["마나", `${Math.round(unit.mana || 0)} / 100`],
  ];
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
  renderBgmState();
  refs.levelUp.textContent =
    state.level >= balance.player.maxLevel ? "최대 레벨" : `${balance.player.buyXpCost}크레딧 → ${balance.player.buyXpAmount}XP`;
  refs.levelUp.disabled = state.busy || state.level >= balance.player.maxLevel;
  refs.battle.disabled = state.busy;
  refs.battle.textContent = state.busy ? "전투 중" : "전투 시작";
  const bossInfo = currentBossInfo();
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
}

function buyUnit(index) {
  if (state.busy) return;
  const unit = state.shop[index];
  const slot = state.bench.findIndex((x) => !x);
  const combinesImmediately = canBuyIntoImmediateCombine(unit);
  if (!unit) return;
  if (slot < 0 && !combinesImmediately) return addLog("벤치가 가득 찼습니다.");
  if ((state.pool[unit.name] || 0) <= 0) return addLog(`${unit.name} 재고가 없습니다.`);
  if (state.gold < unit.cost) return addLog("크레딧이 부족합니다.");
  state.gold -= unit.cost;
  state.pool[unit.name] -= 1;
  if (slot >= 0) {
    state.bench[slot] = unit;
  } else {
    forceCombinePurchasedUnit(unit);
  }
  state.shop.splice(index, 1);
  addLog(`${unit.name} 영입 완료.`);
  combineAllUnits();
  render();
}

function sellSelectedUnit() {
  if (state.busy || !state.selected) return;
  const arr = state[state.selected.source];
  const unit = arr?.[state.selected.index];
  if (!unit || state.selected.source === "enemy") return;
  const value = sellValue(unit);
  const returned = unitCopyCount(unit);
  state.gold += value;
  state.pool[unit.name] = Math.min(stockLimit(unit), (state.pool[unit.name] || 0) + returned);
  arr[state.selected.index] = null;
  state.selected = null;
  addLog(`${unit.name} 판매: ${value} 크레딧 획득, 풀 ${returned}개 반환.`);
  render();
}

function moveUnit(target, targetIndex) {
  if (!state.dragging || state.busy) return;
  moveFrom(state.dragging, target, targetIndex);
}

function moveSelected(target, targetIndex) {
  if (!state.selected || state.busy) return;
  moveFrom(state.selected, target, targetIndex);
}

function moveFrom(from, target, targetIndex) {
  if (from.source === "enemy") return;
  const srcArr = state[from.source];
  const dstArr = state[target];
  const unit = srcArr[from.index];
  if (!unit) return;
  const limit = boardLimit();
  const addsBoardUnit = from.source !== "board" && target === "board" && !dstArr[targetIndex];
  if (addsBoardUnit && boardUnits().length >= limit) {
    addLog(`현재 레벨 배치 한도는 ${limit}명입니다.`);
    render();
    return;
  }
  srcArr[from.index] = dstArr[targetIndex];
  dstArr[targetIndex] = unit;
  state.selected = null;
  combineAllUnits();
  render();
}

function combineUnits(name) {
  let changed = false;
  while (true) {
    const all = [...state.bench, ...state.board].filter((unit) => unit && unit.name === name);
    const sameTier = [2, 1].find((tier) => all.filter((unit) => unit.tier === tier).length >= 3);
    if (!sameTier) return changed;

    let removed = 0;
    let firstRemoved = null;
    for (const arr of [state.bench, state.board]) {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i]?.name === name && arr[i]?.tier === sameTier && removed < 3) {
          if (!firstRemoved) firstRemoved = { arr, index: i };
          arr[i] = null;
          removed++;
        }
      }
    }

    const upgraded = makeUnit(roster.find((unit) => unit.name === name), sameTier + 1);
    if (firstRemoved) {
      firstRemoved.arr[firstRemoved.index] = upgraded;
    } else {
      const benchSlot = state.bench.findIndex((unit) => !unit);
      const boardSlot = state.board.findIndex((unit) => !unit);
      if (benchSlot >= 0) {
        state.bench[benchSlot] = upgraded;
      } else if (boardSlot >= 0) {
        state.board[boardSlot] = upgraded;
      }
    }
    changed = true;
    addLog(`${name} ${sameTier + 1}성 합성!`);
  }
}

function combineAllUnits() {
  let changed = false;
  do {
    changed = false;
    const names = new Set([...state.bench, ...state.board].filter(Boolean).map((unit) => unit.name));
    for (const name of names) {
      if (combineUnits(name)) changed = true;
    }
  } while (changed);
  pruneShopForOwnedThreeStars();
}

function enemyDifficultyStage() {
  return Math.floor((state.round - 1) / balance.battle.bossInterval);
}

function isBossRound() {
  return state.round % balance.battle.bossInterval === 0;
}

function currentBossInfo() {
  if (!isBossRound()) return null;
  const stage = Math.max(1, state.round / balance.battle.bossInterval);
  return bossRoster[(stage - 1) % bossRoster.length];
}

function makeBossUnit(stage) {
  const base = bossRoster[(stage - 1) % bossRoster.length];
  const bossIndex = Math.max(0, stage - 1);
  const hpScale = 1 + bossIndex * balance.battle.bossHpGrowth;
  const powerScale = 1 + bossIndex * balance.battle.bossPowerGrowth;
  const defenseScale = 1 + bossIndex * balance.battle.bossDefenseGrowth;
  return {
    ...base,
    id: crypto.randomUUID(),
    tier: Math.min(3, 1 + Math.floor(stage / 2)),
    cost: 5,
    boss: true,
    maxHp: Math.round(base.maxHp * hpScale),
    hp: Math.round(base.maxHp * hpScale),
    atk: Math.round(base.atk * powerScale),
    skillAmp: Math.round(base.skillAmp * powerScale),
    defense: Math.round(base.defense * defenseScale),
    summonCount: 0,
    immuneUsed: false,
    immuneTicks: 0,
  };
}

function makeEnemies() {
  const stage = enemyDifficultyStage();
  const slots = Array(balance.battle.enemySlots).fill(null);
  if (isBossRound()) {
    slots[12] = makeBossUnit(Math.max(1, state.round / balance.battle.bossInterval));
    return slots;
  }

  const segmentRound = ((state.round - 1) % balance.battle.bossInterval) + 1;
  const allyCount = Math.max(1, boardUnits().length);
  const baselineCount = balance.battle.enemySegmentCounts[segmentRound - 1] || 4;
  const segmentPressure = (segmentRound >= 8 ? 1 : 0) + (segmentRound >= 12 ? 1 : 0);
  const stagePressure = Math.floor(stage / 2);
  const count = Math.min(balance.battle.maxFieldEnemies, Math.max(baselineCount, allyCount) + segmentPressure + stagePressure);
  const maxCost = Math.min(5, 1 + stage + (segmentRound >= 5 ? 1 : 0));
  const candidates = roster.filter((unit) => unit.cost <= maxCost);
  const hpScale = Math.min(
    balance.battle.enemyHpScaleCap,
    balance.battle.enemyBaseHpScale + state.round * balance.battle.enemyHpRoundGrowth + stage * balance.battle.enemyStageHpGrowth
  );
  const atkScale = Math.min(
    balance.battle.enemyAtkScaleCap,
    balance.battle.enemyBaseAtkScale + state.round * balance.battle.enemyAtkRoundGrowth + stage * balance.battle.enemyStageAtkGrowth
  );
  Array.from({ length: count }, (_, i) => {
    const unit = makeUnit(sample(candidates), stage >= 2 && Math.random() > 0.88 ? 2 : 1);
    unit.maxHp = Math.round((unit.maxHp + stage * 14) * hpScale);
    unit.hp = unit.maxHp;
    unit.atk = Math.max(3, Math.round((unit.atk + stage * 2) * atkScale));
    unit.skillAmp = Math.max(2, Math.round((unit.skillAmp + stage * 2) * atkScale));
    unit.defense = Math.max(0, Math.round((unit.defense + stage) * hpScale));
    slots[balance.battle.enemySpawnOrder[i] ?? i] = unit;
  });
  return slots;
}

function living(units) {
  return units.filter((unit) => unit && unit.hp > 0);
}

function unitAttackRange(unit) {
  return ["사격", "술법", "지원"].includes(unit.role) ? balance.battle.rangedRange : balance.battle.meleeRange;
}

function unitSlot(unit) {
  const cols = balance.battle.columns;
  if (state.combatGrid) {
    const index = state.combatGrid.indexOf(unit);
    if (index < 0) return null;
    return { arr: state.combatGrid, index, x: index % cols, y: Math.floor(index / cols) };
  }
  const arr = unit.side === "enemy" ? state.enemies : state.board;
  const index = arr.indexOf(unit);
  if (index < 0) return null;
  const yOffset = unit.side === "enemy" ? 0 : 2;
  return { arr, index, x: index % cols, y: yOffset + Math.floor(index / cols) };
}

function hexCell(x, y) {
  return { q: x - Math.floor(y / 2), r: y };
}

function hexDistanceSlots(a, b) {
  const ah = hexCell(a.x, a.y);
  const bh = hexCell(b.x, b.y);
  const dq = ah.q - bh.q;
  const dr = ah.r - bh.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

function slotIndexFor(side, x, y, allowCross = false) {
  const cols = balance.battle.columns;
  if (allowCross) {
    if (x < 0 || x >= cols || y < 0 || y > 5) return -1;
    return y * cols + x;
  }
  if (side === "enemy") {
    if (x < 0 || x >= cols || y < 0 || y > 1) return -1;
    return y * cols + x;
  }
  if (x < 0 || x >= cols || y < 2 || y > 5) return -1;
  return (y - 2) * cols + x;
}

function distanceBetween(a, b) {
  const from = unitSlot(a);
  const to = unitSlot(b);
  if (!from || !to) return 99;
  return hexDistanceSlots(from, to);
}

function nearestTarget(attacker, enemies) {
  const alive = living(enemies);
  if (!alive.length) return null;
  return alive.reduce((best, unit) => {
    const bestDistance = distanceBetween(attacker, best);
    const unitDistance = distanceBetween(attacker, unit);
    if (unitDistance !== bestDistance) return unitDistance < bestDistance ? unit : best;
    return unit.hp < best.hp ? unit : best;
  }, alive[0]);
}

function isFrontlineTarget(unit) {
  return ["수호", "돌격", "결투", "맹공"].includes(unit.trait) || ["방패", "돌격", "검객", "난투"].includes(unit.role);
}

function isBacklineDiver(unit) {
  return unit.trait === "기습" || unit.role === "암살";
}

function backlineDepthFor(attacker, target) {
  const slot = unitSlot(target);
  if (!slot) return -1;
  return attacker.side === "enemy" ? slot.y : balance.battle.columns - slot.y;
}

function compareByDistanceThenHp(attacker, a, b) {
  const distanceA = distanceBetween(attacker, a);
  const distanceB = distanceBetween(attacker, b);
  if (distanceA !== distanceB) return distanceA - distanceB;
  return a.hp - b.hp;
}

function pickOpeningTarget(attacker, alive) {
  if (isBacklineDiver(attacker)) {
    return alive.slice().sort((a, b) => {
      const depthA = backlineDepthFor(attacker, a);
      const depthB = backlineDepthFor(attacker, b);
      if (depthA !== depthB) return depthB - depthA;
      return compareByDistanceThenHp(attacker, a, b);
    })[0];
  }

  const frontline = alive.filter(isFrontlineTarget);
  const candidates = frontline.length ? frontline : alive;
  return candidates.slice().sort((a, b) => compareByDistanceThenHp(attacker, a, b))[0];
}

function moveToward(attacker, target) {
  const from = unitSlot(attacker);
  const to = unitSlot(target);
  if (!from || !to) return false;
  const currentDistance = distanceBetween(attacker, target);
  const even = from.y % 2 === 0;
  const steps = even
    ? [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: -1 },
        { x: -1, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 1 },
      ]
    : [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 1, y: -1 },
        { x: 0, y: -1 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];

  for (const step of steps) {
    const nextX = from.x + step.x;
    const nextY = from.y + step.y;
    const nextIndex = slotIndexFor(attacker.side, nextX, nextY, Boolean(state.combatGrid));
    if (nextIndex < 0) continue;
    const arr = state.combatGrid || (attacker.side === "enemy" ? state.enemies : state.board);
    if (arr[nextIndex]) continue;
    const nextDistance = hexDistanceSlots({ x: nextX, y: nextY }, to);
    if (nextDistance >= currentDistance) continue;
    arr[from.index] = null;
    arr[nextIndex] = attacker;
    attacker.status = "moving";
    return true;
  }
  return false;
}

function removeDeadUnits(units) {
  if (!state.combatGrid) return;
  for (const unit of units) {
    if (!unit || unit.hp > 0) continue;
    const index = state.combatGrid.indexOf(unit);
    if (index >= 0) state.combatGrid[index] = null;
  }
}

function hexNeighborSteps(y) {
  return y % 2 === 0
    ? [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: -1 },
        { x: -1, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 1 },
      ]
    : [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 1, y: -1 },
        { x: 0, y: -1 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
}

function unitsInRange(source, targets, range) {
  return living(targets).filter((unit) => distanceBetween(source, unit) <= range);
}

function unitsInFront(source, targets, range) {
  const from = unitSlot(source);
  if (!from) return [];
  const forward = source.side === "enemy" ? 1 : -1;
  return unitsInRange(source, targets, range).filter((unit) => {
    const to = unitSlot(unit);
    return to && (to.y - from.y) * forward >= 0;
  });
}

function applyStun(unit, ticks) {
  unit.stunTicks = Math.max(unit.stunTicks || 0, ticks);
  unit.status = "stunned";
}

function knockBack(target, source, steps) {
  if (!state.combatGrid) return 0;
  let moved = 0;
  for (let i = 0; i < steps; i++) {
    const from = unitSlot(target);
    const sourceSlot = unitSlot(source);
    if (!from || !sourceSlot) break;
    const currentDistance = hexDistanceSlots(from, sourceSlot);
    const options = hexNeighborSteps(from.y)
      .map((step) => ({ x: from.x + step.x, y: from.y + step.y }))
      .filter((slot) => {
        const index = slotIndexFor(target.side, slot.x, slot.y, true);
        if (index < 0 || state.combatGrid[index]) return false;
        return hexDistanceSlots(slot, sourceSlot) > currentDistance;
      })
      .sort((a, b) => hexDistanceSlots(b, sourceSlot) - hexDistanceSlots(a, sourceSlot));
    if (!options.length) break;
    const next = options[0];
    const nextIndex = slotIndexFor(target.side, next.x, next.y, true);
    state.combatGrid[from.index] = null;
    state.combatGrid[nextIndex] = target;
    moved++;
  }
  if (moved) target.status = "moving";
  return moved;
}

function backlineTargets(caster, enemies, count = 3) {
  return living(enemies)
    .slice()
    .sort((a, b) => {
      const slotA = unitSlot(a);
      const slotB = unitSlot(b);
      const depthA = slotA ? (caster.side === "enemy" ? slotA.y : -slotA.y) : 0;
      const depthB = slotB ? (caster.side === "enemy" ? slotB.y : -slotB.y) : 0;
      if (depthA !== depthB) return depthB - depthA;
      return a.hp - b.hp;
    })
    .slice(0, count);
}

function summonOmega(caster) {
  const hanaPattern = bossPatterns.hana;
  if (!state.combatGrid || caster.summonCount >= hanaPattern.summonLimit) return null;
  const emptyEnemySlots = state.enemies
    .map((unit, index) => (unit ? -1 : index))
    .filter((index) => index >= 0)
    .sort((a, b) => {
      const casterSlot = unitSlot(caster);
      if (!casterSlot) return a - b;
      const slotA = { x: a % balance.battle.columns, y: Math.floor(a / balance.battle.columns) };
      const slotB = { x: b % balance.battle.columns, y: Math.floor(b / balance.battle.columns) };
      return hexDistanceSlots(slotA, casterSlot) - hexDistanceSlots(slotB, casterSlot);
    });
  const index = emptyEnemySlots[0];
  if (index == null) return null;
  const omega = {
    ...bossRoster.find((boss) => boss.pattern === "omega"),
    id: crypto.randomUUID(),
    tier: 2,
    cost: 5,
    boss: true,
    summoned: true,
    maxHp: Math.round(caster.maxHp * hanaPattern.summonHpRatio),
    hp: Math.round(caster.maxHp * hanaPattern.summonHpRatio),
    atk: Math.round(caster.atk * hanaPattern.summonAtkRatio),
    skillAmp: Math.round(caster.skillAmp * hanaPattern.summonSkillAmpRatio),
    defense: Math.round(caster.defense * hanaPattern.summonDefenseRatio),
    summonCount: 0,
    immuneUsed: false,
    immuneTicks: 0,
  };
  prepareCombatUnit(omega, caster.side);
  state.enemies[index] = omega;
  state.combatGrid[index] = omega;
  caster.summonCount += 1;
  return omega;
}

function prepareCombatUnit(unit, side, counts = {}) {
  const stats = side === "ally" ? applySynergy(unit, counts) : {
    hp: unit.maxHp,
    atk: unit.atk,
    speed: unit.speed,
    skillAmp: unit.skillAmp,
    defense: unit.defense,
    heal: 1,
  };
  unit.side = side;
  unit.mana = 0;
  unit.maxHp = Math.round(stats.hp);
  unit.hp = unit.maxHp;
  unit.atk = Math.round(stats.atk);
  unit.speed = stats.speed;
  unit.skillAmp = Math.round(stats.skillAmp);
  unit.defense = Math.round(stats.defense);
  unit.healPower = stats.heal;
  unit.range = unitAttackRange(unit);
  unit.status = "";
  unit.stunTicks = 0;
  unit.immuneTicks = unit.immuneTicks || 0;
  unit.focusTargetId = null;
  unit.hasPickedOpeningTarget = false;
  return unit;
}

function pickTarget(attacker, enemies) {
  const alive = living(enemies);
  if (!alive.length) return null;

  if (attacker.focusTargetId) {
    const focused = alive.find((unit) => unit.id === attacker.focusTargetId);
    if (focused) return focused;
  }

  const target = attacker.hasPickedOpeningTarget ? nearestTarget(attacker, enemies) : pickOpeningTarget(attacker, alive);
  if (target) {
    attacker.focusTargetId = target.id;
    attacker.hasPickedOpeningTarget = true;
  }
  return target;
}

function dealDamage(source, target, amount) {
  const damageFloor = Math.max(3, Math.round(amount * 0.12));
  const damage = Math.max(damageFloor, Math.round(amount - target.defense * 0.45));
  const wickelinePattern = bossPatterns.wickeline;
  if (target.pattern === "wickeline" && target.immuneTicks > 0) {
    target.status = "immune";
    return 0;
  }
  if (target.pattern === "wickeline" && !target.immuneUsed && (target.hp - damage) / target.maxHp <= wickelinePattern.immuneHpRatio) {
    target.immuneUsed = true;
    target.immuneTicks = wickelinePattern.immuneTicks;
    target.status = "immune";
    return 0;
  }
  target.hp = Math.max(0, target.hp - damage);
  const manaFromHit = Math.min(balance.battle.manaPerHit, Math.max(3, Math.round(damage * 0.32)));
  target.mana = Math.min(100, (target.mana || 0) + manaFromHit);
  target.status = target.hp > 0 ? "hit" : "dead";
  if (target.hp <= 0) removeDeadUnits([target]);
  return damage;
}

function weaponEffectKind(unit, type = "attack") {
  if (type === "heal" || type === "shield") return type;
  if (type === "skill" && ["술법", "지원"].includes(unit.role)) return "magic";
  if (["권총", "돌격소총", "저격총"].includes(unit.weapon)) return "bullet";
  if (["활", "석궁"].includes(unit.weapon)) return "arrow";
  if (["투척", "암기", "아르카나"].includes(unit.weapon)) return "magic";
  return "slash";
}

function combatEffect(from, to, type = "attack") {
  return { from: from.id, to: to.id, type, weapon: from.weapon, kind: weaponEffectKind(from, type) };
}

function basicAttack(attacker, enemies) {
  const target = pickTarget(attacker, enemies);
  if (!target) return { message: "", effects: [] };
  if (distanceBetween(attacker, target) > unitAttackRange(attacker)) {
    const moved = moveToward(attacker, target);
    return {
      message: moved ? `${attacker.name} 이동` : `${attacker.name} 대기`,
      effects: [],
    };
  }
  const variance = 0.86 + Math.random() * 0.28;
  if (attacker.pattern === "nadja") {
    const nadjaPattern = bossPatterns.nadja;
    const targets = unitsInRange(attacker, enemies, unitAttackRange(attacker))
      .sort((a, b) => distanceBetween(attacker, a) - distanceBetween(attacker, b))
      .slice(0, nadjaPattern.basicTargetCount);
    let total = 0;
    for (const unit of targets) total += dealDamage(attacker, unit, attacker.atk * attacker.speed * variance * balance.battle.basicDamageMultiplier);
    attacker.mana = Math.min(100, attacker.mana + balance.battle.manaPerAttack);
    attacker.status = "attacking";
    return {
      message: `${attacker.name} basic cleave ${total}`,
      effects: targets.map((unit) => combatEffect(attacker, unit, "attack")),
    };
  }
  const damage = dealDamage(attacker, target, attacker.atk * attacker.speed * variance * balance.battle.basicDamageMultiplier);
  attacker.mana = Math.min(100, attacker.mana + balance.battle.manaPerAttack);
  attacker.status = "attacking";
  return {
    message: `${attacker.name} → ${target.name} ${damage} 피해`,
    effects: [combatEffect(attacker, target, "attack")],
  };
}

function castBossSkill(caster, allies, enemies) {
  const effects = [];
  if (caster.pattern === "bear") {
    const pattern = bossPatterns.bear;
    const targets = unitsInRange(caster, enemies, pattern.range);
    let total = 0;
    for (const target of targets) {
      total += dealDamage(caster, target, caster.skillAmp * pattern.skillAmpMultiplier + caster.atk * pattern.atkMultiplier);
      applyStun(target, pattern.stunTicks);
      effects.push(combatEffect(caster, target, "skill"));
    }
    return { message: `${caster.name} roar stun ${targets.length} / ${total}`, effects };
  }

  if (caster.pattern === "alpha" || caster.pattern === "omega") {
    const pattern = bossPatterns[caster.pattern];
    const targets = unitsInFront(caster, enemies, pattern.range);
    let total = 0;
    for (const target of targets) {
      total += dealDamage(caster, target, caster.skillAmp * pattern.skillAmpMultiplier + caster.atk * pattern.atkMultiplier);
      knockBack(target, caster, pattern.knockback);
      applyStun(target, pattern.stunTicks);
      effects.push(combatEffect(caster, target, "skill"));
    }
    return { message: `${caster.name} shockwave ${targets.length} / ${total}`, effects };
  }

  if (caster.pattern === "wickeline") {
    const pattern = bossPatterns.wickeline;
    const targets = backlineTargets(caster, enemies, pattern.targetCount);
    let total = 0;
    for (const target of targets) {
      total += dealDamage(caster, target, caster.skillAmp * pattern.skillAmpMultiplier + caster.atk * pattern.atkMultiplier);
      effects.push(combatEffect(caster, target, "skill"));
    }
    return { message: `${caster.name} toxic shots ${targets.length} / ${total}`, effects };
  }

  if (caster.pattern === "hana") {
    const pattern = bossPatterns.hana;
    const omega = summonOmega(caster);
    if (omega) {
      effects.push(combatEffect(caster, omega, "skill"));
      return { message: `${caster.name} summoned Omega`, effects };
    }
    const target = pickTarget(caster, enemies);
    if (!target) return { message: "", effects: [] };
    const damage = dealDamage(caster, target, caster.skillAmp * pattern.fallbackSkillAmpMultiplier + caster.atk * pattern.fallbackAtkMultiplier);
    return { message: `${caster.name} arcane hit ${damage}`, effects: [combatEffect(caster, target, "skill")] };
  }

  if (caster.pattern === "nadja") {
    const pattern = bossPatterns.nadja;
    const targets = living(enemies);
    let total = 0;
    for (const target of targets) {
      total += dealDamage(caster, target, caster.skillAmp * pattern.skillAmpMultiplier + caster.atk * pattern.atkMultiplier);
      effects.push(combatEffect(caster, target, "skill"));
    }
    return { message: `${caster.name} full-map strike ${targets.length} / ${total}`, effects };
  }

  return null;
}

function castSkill(caster, allies, enemies) {
  caster.mana = 0;
  caster.status = "casting";

  if (caster.boss) {
    const bossAction = castBossSkill(caster, allies, enemies);
    if (bossAction) return bossAction;
  }

  if (caster.role === "지원") {
    const target = living(allies).reduce((low, unit) => (unit.hp / unit.maxHp < low.hp / low.maxHp ? unit : low), living(allies)[0]);
    const rawHeal = Math.round((caster.skillAmp * 0.72 + 10) * caster.healPower);
    const heal = Math.min(rawHeal, Math.round(target.maxHp * 0.12));
    target.hp = Math.min(target.maxHp, target.hp + heal);
    target.status = "healed";
    return {
      message: `${caster.name} 스킬: ${target.name} ${heal} 회복`,
      effects: [combatEffect(caster, target, "heal")],
    };
  }

  if (caster.role === "술법") {
    const targets = living(enemies);
    let total = 0;
    for (const target of targets) total += dealDamage(caster, target, caster.skillAmp * 0.75 + 10);
    return {
      message: `${caster.name} 스킬: 광역 ${total} 피해`,
      effects: targets.map((target) => combatEffect(caster, target, "skill")),
    };
  }

  if (caster.role === "방패") {
    const rawHeal = Math.round(caster.skillAmp * 0.35 + caster.defense * 0.55 + 5);
    const heal = Math.min(rawHeal, Math.round(caster.maxHp * 0.045));
    caster.hp = Math.min(caster.maxHp, caster.hp + heal);
    caster.status = "healed";
    return {
      message: `${caster.name} 스킬: ${heal} 보호막`,
      effects: [combatEffect(caster, caster, "shield")],
    };
  }

  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  if (distanceBetween(caster, target) > Math.max(unitAttackRange(caster), 2)) {
    const moved = moveToward(caster, target);
    caster.mana = 100;
    return {
      message: moved ? `${caster.name} 스킬 사거리 접근` : `${caster.name} 대기`,
      effects: [],
    };
  }
  const scale = caster.role === "암살" ? 2.2 : caster.role === "검객" ? 1.85 : caster.role === "사격" ? 1.75 : 1.6;
  const damage = dealDamage(caster, target, caster.atk * 0.75 + caster.skillAmp * scale + 10);
  return {
    message: `${caster.name} 스킬: ${target.name} ${damage} 피해`,
    effects: [combatEffect(caster, target, "skill")],
  };
}

function clearCombatStatus(units) {
  for (const unit of units) {
    if (unit) unit.status = "";
  }
}

function playCombatEffects(effects) {
  const field = document.querySelector(".battlefield");
  if (!field) return;
  const fieldRect = field.getBoundingClientRect();
  for (const effect of effects) {
    const from = document.querySelector(`[data-unit-id="${effect.from}"]`);
    const to = document.querySelector(`[data-unit-id="${effect.to}"]`);
    if (!from || !to) continue;
    const fromRect = from.getBoundingClientRect();
    const toRect = to.getBoundingClientRect();
    const startX = fromRect.left + fromRect.width / 2 - fieldRect.left;
    const startY = fromRect.top + fromRect.height / 2 - fieldRect.top;
    const endX = toRect.left + toRect.width / 2 - fieldRect.left;
    const endY = toRect.top + toRect.height / 2 - fieldRect.top;
    const projectile = document.createElement("span");
    const kind = effect.kind || effect.type;
    projectile.className = `projectile ${effect.type} ${kind}`;
    const originX = kind === "slash" ? endX : startX;
    const originY = kind === "slash" ? endY : startY;
    projectile.style.left = `${originX}px`;
    projectile.style.top = `${originY}px`;
    projectile.style.setProperty("--dx", `${endX - startX}px`);
    projectile.style.setProperty("--dy", `${endY - startY}px`);
    projectile.style.setProperty("--angle", `${Math.atan2(endY - startY, endX - startX)}rad`);
    field.append(projectile);
    projectile.addEventListener("animationend", () => projectile.remove(), { once: true });
  }
}

async function simulate() {
  if (state.busy) return;
  const allies = boardUnits();
  if (!allies.length) {
    addLog("보드에 캐릭터를 배치해야 합니다.");
    return;
  }
  const battleRound = state.round;
  const originalBoard = state.board.slice();
  state.busy = true;
  state.selected = null;
  refs.phase.textContent = "전투 중: 양 팀이 자동으로 교전합니다.";
  document.body.classList.add("fighting");
  const traitCounts = activeTraits();
  state.enemies = makeEnemies();
  allies.forEach((unit) => {
    unit.combatBase = {
      maxHp: unit.maxHp,
      hp: unit.hp,
      atk: unit.atk,
      speed: unit.speed,
      skillAmp: unit.skillAmp,
      defense: unit.defense,
    };
  });
  allies.forEach((unit) => prepareCombatUnit(unit, "ally", traitCounts));
  state.enemies.filter(Boolean).forEach((unit) => prepareCombatUnit(unit, "enemy"));
  state.combatGrid = Array(48).fill(null);
  state.enemies.forEach((unit, index) => {
    if (unit) state.combatGrid[index] = unit;
  });
  state.board.forEach((unit, index) => {
    if (unit) state.combatGrid[16 + index] = unit;
  });
  const boss = living(state.enemies).find((unit) => unit.boss);
  addLog(boss ? `보스전 시작: ${boss.name} 출현!` : `전투 시작: 아군 ${allies.length}명 vs 야생 실험체 ${living(state.enemies).length}명`);
  render();

  let tick = 0;
  while (living(allies).length && living(state.enemies).length && tick < balance.battle.maxTicks) {
    tick += 1;
    clearCombatStatus([...allies, ...state.enemies]);
    for (const unit of [...living(allies), ...living(state.enemies)]) {
      if (unit.immuneTicks > 0) {
        unit.status = "immune";
      }
    }
    const actors = [...living(allies), ...living(state.enemies)].sort((a, b) => b.speed - a.speed);
    const tickLogs = [];
    const effects = [];

    for (const actor of actors) {
      if (actor.hp <= 0) continue;
      if (actor.stunTicks > 0) {
        actor.stunTicks -= 1;
        actor.status = "stunned";
        continue;
      }
      const friends = actor.side === "ally" ? allies : state.enemies;
      const foes = actor.side === "ally" ? state.enemies : allies;
      if (!living(foes).length) break;
      const action = actor.mana >= 100 ? castSkill(actor, friends, foes) : basicAttack(actor, foes);
      if (action.message) tickLogs.push(action.message);
      effects.push(...action.effects);
    }

    for (const unit of [...living(allies), ...living(state.enemies)]) {
      if (unit.immuneTicks > 0) unit.immuneTicks -= 1;
    }

    addLog(tickLogs.slice(0, 3).join(" / "));
    refs.phase.textContent = `전투 중: ${tick}턴 · 아군 ${living(allies).length}명 / 적 ${living(state.enemies).length}명`;
    render();
    playCombatEffects(effects);
    await sleep(balance.battle.tickMs);
  }

  const win = living(allies).length > 0 && living(state.enemies).length === 0;
  const wasBossRound = isBossRound();
  const survivors = win ? living(allies).length : living(state.enemies).length;
  document.body.classList.remove("fighting");
  state.busy = false;
  state.round += 1;
  state.combatGrid = null;
  addXp(balance.player.combatXp, "전투 보상");
  for (const unit of allies) {
    if (unit.combatBase) {
      unit.maxHp = unit.combatBase.maxHp;
      unit.atk = unit.combatBase.atk;
      unit.speed = unit.combatBase.speed;
      unit.skillAmp = unit.combatBase.skillAmp;
      unit.defense = unit.combatBase.defense;
      delete unit.combatBase;
    }
    unit.hp = unit.maxHp;
    unit.mana = 0;
    unit.status = "";
    unit.stunTicks = 0;
    unit.immuneTicks = 0;
    unit.focusTargetId = null;
    unit.hasPickedOpeningTarget = false;
  }
  state.board = originalBoard;
  if (win) {
    grantRoundIncome(true);
    addLog(`승리! 생존 ${survivors}명.`);
    refs.phase.textContent = "승리했습니다. 다음 전투를 준비하세요.";
  } else {
    const previousHp = state.hp;
    const damage = wasBossRound ? state.hp : Math.min(20, 6 + Math.floor(battleRound / 2) + survivors);
    state.hp = Math.max(0, state.hp - damage);
    if (previousHp > 0 && state.hp === 0) captureDeathRecord(battleRound, originalBoard);
    grantRoundIncome(false);
    addLog(`패배. 남은 적 ${survivors}명. 체력 ${damage} 감소.`);
    refs.phase.textContent = state.hp ? "패배했습니다. 조합을 재정비하세요." : "체력이 0이 되었습니다. 랭킹을 등록할 수 있습니다.";
  }
  state.enemies = [];
  if (state.shopLocked) {
    addLog("상점 잠금 유지: 현재 상점을 보존합니다.");
    render();
  } else {
    rollShop();
  }
}

function buyXp() {
  if (state.busy) return;
  if (state.level >= balance.player.maxLevel) return addLog("최대 레벨입니다.");
  if (state.gold < balance.player.buyXpCost) return addLog(`경험치 구매에는 ${balance.player.buyXpCost} 크레딧이 필요합니다.`);
  state.gold -= balance.player.buyXpCost;
  addXp(balance.player.buyXpAmount, "경험치 구매");
  render();
}

$("reroll").addEventListener("click", () => {
  if (state.busy) return;
  if (state.gold < balance.shop.rerollCost) return addLog(`새로고침에는 ${balance.shop.rerollCost} 크레딧이 필요합니다.`);
  state.gold -= balance.shop.rerollCost;
  addLog(`상점 새로고침: ${balance.shop.rerollCost} 크레딧 사용.`);
  rollShop();
});
$("shopLock").addEventListener("click", () => {
  if (state.busy) return;
  state.shopLocked = !state.shopLocked;
  addLog(state.shopLocked ? "상점을 잠갔습니다." : "상점 잠금을 해제했습니다.");
  render();
});
$("oddsToggle").addEventListener("click", () => {
  state.oddsOpen = !state.oddsOpen;
  render();
});
$("battle").addEventListener("click", simulate);
$("levelUp").addEventListener("click", buyXp);
refs.sellUnit.addEventListener("click", sellSelectedUnit);
refs.bgmToggle.addEventListener("click", toggleBgm);
refs.rankingToggle.addEventListener("click", () => {
  state.rankingOpen = true;
  loadRankings(true);
  render();
});
refs.rankingClose.addEventListener("click", () => {
  state.rankingOpen = false;
  render();
});
refs.rankingModal.addEventListener("click", (event) => {
  if (event.target === refs.rankingModal) {
    state.rankingOpen = false;
    render();
  }
});
refs.rankSave.addEventListener("click", submitRanking);
refs.rankName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitRanking();
});

addLog("상점에서 캐릭터를 영입하고 보드로 드래그하세요.");
loadRankings();
rollShop();
