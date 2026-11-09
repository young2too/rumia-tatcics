// Builds deterministic rule-based bot squads for PvP preparation rounds.
import { augmentPools, augmentSettings, roster } from "../core/data.js";
import { createDeterministicSeed, createSeededRng, createStableHash } from "../core/rng.js";

const preferredTraits = ["격전", "정조준", "철벽", "술식", "암습", "진형", "투혼", "연대"];
const rarities = ["silver", "gold", "prismatic"];

function unitTraits(unit) {
  return Array.from(new Set((Array.isArray(unit.traits) ? unit.traits : [unit.trait]).filter(Boolean)));
}

function eligibleRoster() {
  return roster.filter((unit) => unit.active !== false && Number(unit.cost) <= 3);
}

function chooseTheme(rng) {
  const units = eligibleRoster();
  const available = preferredTraits.filter((trait) => units.filter((unit) => unitTraits(unit).includes(trait)).length >= 3);
  return rng.choice(available.length ? available : preferredTraits) || "격전";
}

function scoreCandidate(unit, theme, rng) {
  const traits = unitTraits(unit);
  const themeScore = traits.includes(theme) ? 100 : 0;
  const utilityScore = traits.length * 8;
  const costScore = Number(unit.cost) * 4;
  return themeScore + utilityScore + costScore + rng.random() * 18;
}

function snapshotUnit(unit, tier, index) {
  return {
    source: "board",
    index,
    name: unit.name,
    displayName: unit.name,
    tier,
    cost: unit.cost,
    art: unit.art,
    color: unit.color,
    role: unit.role,
    trait: unit.trait,
    traits: unitTraits(unit),
    weapon: unit.weapon,
    skill: unit.skill,
    skillTooltip: unit.skillTooltip,
  };
}

function sharedRarity(roomId, stage) {
  const rng = createSeededRng(createDeterministicSeed("pvp-shared-augment-rarity", { roomId, stage }));
  const odds = augmentSettings.rarityOddsByStage?.[stage] || {};
  const total = rarities.reduce((sum, rarity) => sum + Math.max(0, Number(odds[rarity]) || 0), 0);
  let roll = rng.random() * Math.max(1, total);
  for (const rarity of rarities) {
    roll -= Math.max(0, Number(odds[rarity]) || 0);
    if (roll <= 0) return rarity;
  }
  return "silver";
}

function chooseAugment(rng, theme, roomId, stage = 1) {
  const rarity = sharedRarity(roomId, stage);
  const pool = [
    ...(augmentPools.common?.[rarity] || []),
    ...(augmentPools[`stage${stage}`]?.[rarity] || []),
  ].filter((augment) => augment.active !== false && !augment.requires?.unit);
  const matching = pool.filter((augment) => augment.effect?.trait === theme || augment.requires?.trait === theme);
  const picked = rng.choice(matching.length ? matching : pool);
  return picked ? { id: picked.id, name: picked.name, rarity: picked.rarity, stage } : null;
}

export function buildInitialBotSnapshot({ room, player, availableCounts = null }) {
  const seed = createDeterministicSeed("pvp-bot-opening", {
    roomId: room.id,
    roomSeed: room.seed || room.id,
    playerId: player.id,
    seat: player.seat,
    difficulty: player.bot_difficulty || "normal",
  });
  const rng = createSeededRng(seed);
  const theme = chooseTheme(rng);
  const hard = player.bot_difficulty === "hard";
  const unitCount = hard ? 4 : 3;
  const planCount = 8;
  const candidates = eligibleRoster()
    .filter((unit) => !availableCounts || (Number(availableCounts[unit.name]) || 0) >= 1)
    .map((unit) => ({ unit, score: scoreCandidate(unit, theme, rng) }))
    .sort((a, b) => b.score - a.score);
  const picked = [];
  const usedNames = new Set();
  for (const candidate of candidates) {
    if (usedNames.has(candidate.unit.name)) continue;
    const requiredCopies = hard && picked.length === 0 ? 3 : 1;
    if (availableCounts && (Number(availableCounts[candidate.unit.name]) || 0) < requiredCopies) continue;
    picked.push(candidate.unit);
    usedNames.add(candidate.unit.name);
    if (picked.length >= planCount) break;
  }
  const botPlan = picked.map((unit, index) => snapshotUnit(unit, hard && index === 0 ? 2 : 1, index));
  const board = botPlan.slice(0, unitCount);
  const traits = {};
  for (const unit of board) {
    for (const trait of unit.traits) traits[trait] = (traits[trait] || 0) + 1;
  }
  const botAugmentPlan = [1, 2, 3]
    .map((stage) => chooseAugment(rng, theme, room.id, stage))
    .filter(Boolean);
  const augments = botAugmentPlan.slice(0, 1);
  const economy = {
    hp: 100,
    gold: hard ? 8 : 5,
    level: hard ? 4 : 3,
    xp: 0,
    round: 4,
    botTheme: theme,
    botDifficulty: player.bot_difficulty || "normal",
    botInitialBoardCount: unitCount,
    botPlan,
    botAugmentPlan,
  };
  return {
    board,
    bench: [],
    augments,
    traits,
    economy,
    checksum: createStableHash({ seed, board, augments, traits, economy }),
  };
}
