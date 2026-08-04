// Seeded RNG helpers for reproducible combat rolls and async PvP match records.
function hashSeed(seed) {
  const text = String(seed || "rumia-tactics");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRng(seed) {
  let state = hashSeed(seed) || 1;
  let sequence = 0;

  function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  function integer(maxExclusive) {
    return Math.floor(random() * Math.max(1, maxExclusive));
  }

  function id(prefix = "id") {
    sequence += 1;
    return `${prefix}-${sequence.toString(36)}`;
  }

  function choice(items) {
    if (!items?.length) return undefined;
    return items[integer(items.length)];
  }

  return { random, integer, id, choice };
}

export function createStableHash(value) {
  return hashSeed(stableStringify(value)).toString(36);
}

export function createDeterministicSeed(kind, parts = {}) {
  return `${kind}:${createStableHash({ kind, ...parts })}`;
}

export function createCombatSeed(round, salt = "") {
  const entropy = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `combat:${round}:${salt}:${entropy}`;
}

export function createPvpSnapshotId(snapshot) {
  return createDeterministicSeed("pvp-snapshot", {
    savedAt: snapshot.savedAt,
    stage: snapshot.stage,
    level: snapshot.level,
    board: compactUnits(snapshot.board),
    bench: compactUnits(snapshot.bench),
  });
}

export function createPvpMatchSeed({
  roomId,
  pvpRound,
  pairIndex,
  homeSnapshotId,
  awaySnapshotId,
}) {
  return createDeterministicSeed("pvp-combat", {
    roomId,
    pvpRound,
    pairIndex,
    homeSnapshotId,
    awaySnapshotId,
  });
}

function compactUnits(units = []) {
  return units.map((unit) => ({
    name: unit.name,
    tier: unit.tier,
    index: unit.index,
    source: unit.source,
  }));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
