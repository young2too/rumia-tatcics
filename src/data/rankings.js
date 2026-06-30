import { rankingConfig, rankingStorageKey } from "../core/data.js";

const statisticsConfig = window.LUMIA_TACTICS_CONFIG?.statistics || {};
const rankingLimit = Math.max(1, Number(statisticsConfig.rankingLimit) || 1000);
const cacheMinutes = Math.max(0, Number(statisticsConfig.cacheMinutes) || 5);
const cacheKey = "lumia-tactics-ranking-records-cache";
const versionColumn = rankingConfig.versionColumn || "ranking_version";

function rankingBackendEnabled() {
  return Boolean(rankingConfig.url && rankingConfig.anonKey && rankingConfig.table);
}

function rankingEndpoint(query = "") {
  return `${rankingConfig.url.replace(/\/$/, "")}/rest/v1/${rankingConfig.table}${query}`;
}

function rankingHeaders() {
  return {
    apikey: rankingConfig.anonKey,
    Authorization: `Bearer ${rankingConfig.anonKey}`,
    "Content-Type": "application/json",
  };
}

function normalizeRanking(row) {
  return {
    id: row.id || crypto.randomUUID(),
    name: row.nickname || row.name || "익명",
    stage: Math.max(1, Number(row.stage) || 1),
    board: Array.isArray(row.board) ? row.board : [],
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    rankingVersion: row[versionColumn] || row.ranking_version || row.rankingVersion || row.version || "",
  };
}

function readCache() {
  if (!cacheMinutes) return null;
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
    if (!cached || !Array.isArray(cached.rows)) return null;
    if (Date.now() - cached.savedAt > cacheMinutes * 60 * 1000) return null;
    return cached.rows.map(normalizeRanking);
  } catch {
    return null;
  }
}

function writeCache(rows) {
  if (!cacheMinutes) return;
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), rows }));
  } catch {
    // Ranking pages still work when browser storage is unavailable.
  }
}

function localRankings() {
  try {
    const rows = JSON.parse(localStorage.getItem(rankingStorageKey) || "[]");
    return Array.isArray(rows) ? rows.map(normalizeRanking) : [];
  } catch {
    return [];
  }
}

async function fetchServerRankings(includeVersion = true) {
  const fields = ["id", "nickname", "stage", "board", "created_at", includeVersion ? versionColumn : null]
    .filter(Boolean)
    .join(",");
  return fetch(
    rankingEndpoint(`?select=${fields}&order=created_at.desc&limit=${rankingLimit}`),
    { headers: rankingHeaders() },
  );
}

export function clearRankingRecordsCache() {
  try {
    sessionStorage.removeItem(cacheKey);
  } catch {
    // Ignore unavailable storage.
  }
}

export async function loadRankingRecords({ force = false } = {}) {
  if (!force) {
    const cached = readCache();
    if (cached) return { rows: cached, source: "cache", limit: rankingLimit };
  }

  if (!rankingBackendEnabled()) {
    return { rows: localRankings(), source: "local", limit: rankingLimit };
  }

  let response = await fetchServerRankings(true);
  if (!response.ok) response = await fetchServerRankings(false);
  if (!response.ok) throw new Error(`랭킹 조회 실패 (${response.status})`);

  const rows = (await response.json()).map(normalizeRanking);
  writeCache(rows);
  return { rows, source: "server", limit: rankingLimit };
}

export const currentRankingVersion = String(rankingConfig.majorVersion || "legacy");
