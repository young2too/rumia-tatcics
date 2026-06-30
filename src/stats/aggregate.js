function unitTraits(unit) {
  const values = Array.isArray(unit?.traits) && unit.traits.length ? unit.traits : [unit?.trait];
  return Array.from(new Set(values.filter(Boolean)));
}

function percentage(value, total) {
  return total > 0 ? (value / total) * 100 : 0;
}

export function rankingsForVersion(rows, version) {
  if (version === "all") return rows;
  if (version === "legacy") return rows.filter((row) => !row.rankingVersion);
  return rows.filter((row) => row.rankingVersion === version);
}

export function availableVersions(rows, currentVersion) {
  const values = new Set(rows.map((row) => row.rankingVersion).filter(Boolean));
  const versions = Array.from(values).sort((a, b) => String(b).localeCompare(String(a), "ko"));
  if (currentVersion) {
    const index = versions.indexOf(currentVersion);
    if (index >= 0) versions.splice(index, 1);
    versions.unshift(currentVersion);
  }
  return {
    versions,
    hasLegacy: rows.some((row) => !row.rankingVersion),
  };
}

export function buildStatistics(rows, roster, traitRules) {
  const totalRankings = rows.length;
  const rosterByName = new Map(roster.map((unit) => [unit.name, unit]));
  const unitStats = new Map();
  const traitStats = new Map(Object.keys(traitRules).map((trait) => [trait, { name: trait, activations: 0, unitTotal: 0 }]));
  const costCounts = new Map([1, 2, 3, 4, 5].map((cost) => [cost, 0]));
  let stageTotal = 0;
  let boardSizeTotal = 0;
  let bestStage = 0;
  let totalUnits = 0;

  for (const ranking of rows) {
    stageTotal += ranking.stage;
    bestStage = Math.max(bestStage, ranking.stage);
    boardSizeTotal += ranking.board.length;

    const boardByName = new Map();
    for (const snapshot of ranking.board) {
      if (!snapshot?.name) continue;
      const previous = boardByName.get(snapshot.name);
      if (!previous || Number(snapshot.tier) > Number(previous.tier)) boardByName.set(snapshot.name, snapshot);

      const rosterUnit = rosterByName.get(snapshot.name);
      const cost = Number(snapshot.cost || rosterUnit?.cost) || 0;
      if (costCounts.has(cost)) costCounts.set(cost, costCounts.get(cost) + 1);
      totalUnits += 1;
    }

    const traitCounts = new Map();
    for (const [name, snapshot] of boardByName) {
      const rosterUnit = rosterByName.get(name);
      const stats = unitStats.get(name) || {
        name,
        art: snapshot.art || rosterUnit?.art || "",
        color: snapshot.color || rosterUnit?.color || "#6aa9ff",
        cost: Number(snapshot.cost || rosterUnit?.cost) || 0,
        picks: 0,
        tierThree: 0,
        stageTotal: 0,
      };
      stats.picks += 1;
      stats.stageTotal += ranking.stage;
      if (Number(snapshot.tier) >= 3) stats.tierThree += 1;
      unitStats.set(name, stats);

      for (const trait of unitTraits(rosterUnit)) {
        traitCounts.set(trait, (traitCounts.get(trait) || 0) + 1);
      }
    }

    for (const [trait, count] of traitCounts) {
      const stats = traitStats.get(trait) || { name: trait, activations: 0, unitTotal: 0 };
      const firstNeed = Number(traitRules[trait]?.tiers?.[0]?.need) || 1;
      stats.unitTotal += count;
      if (count >= firstNeed) stats.activations += 1;
      traitStats.set(trait, stats);
    }
  }

  const units = Array.from(unitStats.values())
    .map((unit) => ({
      ...unit,
      pickRate: percentage(unit.picks, totalRankings),
      tierThreeRate: percentage(unit.tierThree, unit.picks),
      averageStage: unit.picks ? unit.stageTotal / unit.picks : 0,
    }))
    .sort((a, b) => b.pickRate - a.pickRate || b.averageStage - a.averageStage || a.name.localeCompare(b.name, "ko"));

  const traits = Array.from(traitStats.values())
    .map((trait) => ({
      ...trait,
      activationRate: percentage(trait.activations, totalRankings),
      averageUnits: totalRankings ? trait.unitTotal / totalRankings : 0,
    }))
    .sort((a, b) => b.activationRate - a.activationRate || b.averageUnits - a.averageUnits || a.name.localeCompare(b.name, "ko"));

  const costs = Array.from(costCounts, ([cost, count]) => ({
    cost,
    count,
    rate: percentage(count, totalUnits),
  }));

  return {
    totalRankings,
    averageStage: totalRankings ? stageTotal / totalRankings : 0,
    bestStage,
    averageBoardSize: totalRankings ? boardSizeTotal / totalRankings : 0,
    totalUnits,
    units,
    traits,
    costs,
  };
}
