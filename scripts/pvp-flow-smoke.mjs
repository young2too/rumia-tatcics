// Exercises deterministic eight-player PvP growth, shared-pool use, and elimination.
globalThis.window = {};

const [{ buildInitialBotSnapshot }, { balance, roster }] = await Promise.all([
  import("../src/pvp/bots.js"),
  import("../src/core/data.js"),
]);

function copiesFor(unit) {
  const copies = Number(unit.tier) >= 3 ? 9 : Number(unit.tier) >= 2 ? 3 : 1;
  return Math.max(0, copies - Math.max(0, Number(unit.poolExemptCopies) || 0));
}

function countsFor(snapshot) {
  const counts = {};
  for (const unit of [...(snapshot.board || []), ...(snapshot.bench || [])]) {
    counts[unit.name] = (counts[unit.name] || 0) + copiesFor(unit);
  }
  return counts;
}

function replaceHoldings(player, desired, pool) {
  const current = player.holdings;
  for (const [name, count] of Object.entries(current)) {
    const released = Math.max(0, count - (desired[name] || 0));
    pool[name] += released;
  }
  const additions = Object.entries(desired).filter(([name, count]) => count > (current[name] || 0));
  if (additions.some(([name, count]) => pool[name] < count - (current[name] || 0))) return false;
  for (const [name, count] of additions) pool[name] -= count - (current[name] || 0);
  player.holdings = { ...desired };
  return true;
}

function grow(snapshot, difficulty, round) {
  const plan = snapshot.economy.botPlan || snapshot.board;
  const initialCount = Math.max(1, Math.min(plan.length, snapshot.economy.botInitialBoardCount || snapshot.board.length));
  const progressionLevel = round <= 7 ? 3
    : round <= 13 ? 4
      : round <= 21 ? 5
        : round <= 29 ? 6
          : round <= 37 ? 7
            : 8;
  const deployed = Math.min(plan.length, Math.max(initialCount, progressionLevel));
  const bonus = difficulty === "hard" ? 2 : 0;
  const tierTwo = Math.min(deployed, Math.floor(Math.max(0, round + bonus) / 4));
  const tierThree = round + bonus >= 20
    ? Math.min(deployed, 1 + Math.floor(Math.max(0, round + bonus - 20) / 8))
    : 0;
  const board = plan.slice(0, deployed).map((unit, index) => ({
    ...unit,
    source: "board",
    index,
    tier: index < tierThree ? 3 : index < tierTwo ? Math.max(2, unit.tier || 1) : unit.tier || 1,
  }));
  const augmentCount = Math.min((snapshot.economy.botAugmentPlan || []).length, 1 + (round > 10 ? 1 : 0) + (round > 20 ? 1 : 0));
  return {
    ...snapshot,
    board,
    augments: (snapshot.economy.botAugmentPlan || []).slice(0, augmentCount),
    economy: { ...snapshot.economy, round, level: Math.max(initialCount, progressionLevel) },
  };
}

function power(snapshot) {
  const tierFactor = [0, 1, 1.65, 2.55];
  const unitPower = snapshot.board.reduce((sum, unit) => (
    sum + (8 + Math.max(1, Math.min(5, Number(unit.cost) || 1)) * 5)
      * tierFactor[Math.max(1, Math.min(3, Number(unit.tier) || 1))]
      * (unit.fourStarAscended ? 1.6 : 1)
  ), 0);
  return unitPower * (1 + Math.min(0.30, snapshot.augments.length * 0.08));
}

function run(seed) {
  const room = { id: `smoke-${seed}`, seed: String(seed) };
  const pool = Object.fromEntries(roster.map((unit) => [unit.name, Number(balance.shop.stockByCost[unit.cost]) || 0]));
  const players = Array.from({ length: 8 }, (_, index) => ({
    id: `bot-${index + 1}`,
    seat: index + 1,
    bot_difficulty: index % 3 === 0 ? "hard" : "normal",
    health: 100,
    holdings: {},
  }));

  for (const player of players) {
    player.snapshot = buildInitialBotSnapshot({ room, player, availableCounts: pool });
    if (!replaceHoldings(player, countsFor(player.snapshot), pool)) throw new Error("Initial pool claim failed");
  }

  for (const player of players) {
    const roundNine = grow(player.snapshot, player.bot_difficulty, 9);
    if (roundNine.board.length > 4 || Number(roundNine.economy.level) > 4) {
      throw new Error("Bot progression regression: round 9 exceeds level 4");
    }
  }

  let round = 1;
  while (players.filter((player) => player.health > 0).length > 1 && round <= 200) {
    const active = players.filter((player) => player.health > 0);
    for (const player of active) {
      const candidate = grow(player.snapshot, player.bot_difficulty, round);
      if (replaceHoldings(player, countsFor(candidate), pool)) player.snapshot = candidate;
    }
    for (let index = 0; index < active.length - 1; index += 2) {
      const home = active[index];
      const away = active[index + 1];
      const homePower = power(home.snapshot);
      const awayPower = power(away.snapshot);
      const loser = homePower >= awayPower ? away : home;
      const damage = Math.max(2, Math.min(15, 2 + Math.floor(round / 5)
        + Math.ceil(Math.abs(homePower - awayPower) / Math.max(20, Math.min(homePower, awayPower)))));
      loser.health = Math.max(0, loser.health - damage);
      if (!loser.health) {
        for (const [name, count] of Object.entries(loser.holdings)) pool[name] += count;
        loser.holdings = {};
      }
    }
    if (Object.values(pool).some((count) => count < 0)) throw new Error(`Negative shared pool at round ${round}`);
    round += 1;
  }

  const winner = players.find((player) => player.health > 0);
  if (!winner) throw new Error("Tournament ended without a winner");
  if (round > 200) throw new Error("Tournament did not finish within 200 rounds");
  return { winner: winner.id, round: round - 1, health: winner.health };
}

const first = run("fixed-seed");
const second = run("fixed-seed");
if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error("PvP flow is not deterministic");
console.log(`PvP 8-player smoke OK: ${first.winner}, round ${first.round}, HP ${first.health}`);
