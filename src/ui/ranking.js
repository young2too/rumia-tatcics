import { clearRankingRecordsCache } from "../data/rankings.js";

export function createRankingController({ state, refs, rankingConfig, rankingStorageKey, renderRanking, render }) {
  let memoryRankings = [];
  const rankingLimit = Number(rankingConfig.limit) || 100;
  const rankingVersion = String(rankingConfig.majorVersion || window.LUMIA_TACTICS_CONFIG?.patchNotes?.version || "legacy");
  const versionColumn = rankingConfig.versionColumn || "ranking_version";

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

  function rankingSelectFields(includeVersion = true) {
    return ["id", "nickname", "stage", "board", "created_at", includeVersion ? versionColumn : null].filter(Boolean).join(",");
  }

  function rankingVersionQuery(includeVersion = true) {
    if (!includeVersion || !state.rankingVersionFilter || state.rankingVersionFilter === "all") return "";
    return `&${versionColumn}=eq.${encodeURIComponent(state.rankingVersionFilter)}`;
  }

  function normalizeRankingEntry(entry) {
    return {
      id: entry.id || crypto.randomUUID(),
      name: entry.name || entry.nickname || "익명",
      stage: Number(entry.stage) || 1,
      board: Array.isArray(entry.board) ? entry.board : [],
      createdAt: entry.createdAt || entry.created_at || new Date().toISOString(),
      rankingVersion: entry.rankingVersion || entry[versionColumn] || entry.ranking_version || entry.version || "",
      isSubmittedEntry: Boolean(entry.isSubmittedEntry),
    };
  }

  function updateRankingVersions(entries = state.rankingEntries) {
    const versions = new Set([rankingVersion, ...(state.rankingVersions || [])].filter(Boolean));
    for (const entry of entries) {
      const normalized = normalizeRankingEntry(entry);
      if (normalized.rankingVersion) versions.add(normalized.rankingVersion);
    }
    state.rankingVersions = Array.from(versions).sort((a, b) => {
      if (a === rankingVersion) return -1;
      if (b === rankingVersion) return 1;
      return String(b).localeCompare(String(a), "ko");
    });
  }

  function sortRankingEntries(entries) {
    return entries
      .map(normalizeRankingEntry)
      .sort((a, b) => b.stage - a.stage || new Date(a.createdAt) - new Date(b.createdAt));
  }

  function filteredLocalRankingEntries() {
    const entries = localRankingEntries().map(normalizeRankingEntry);
    updateRankingVersions(entries);
    if (!state.rankingVersionFilter || state.rankingVersionFilter === "all") return entries;
    return entries.filter((entry) => entry.rankingVersion === state.rankingVersionFilter);
  }

  function rememberSubmittedEntry(entry) {
    if (!entry) return false;
    const savedEntry = normalizeRankingEntry({ ...entry, isSubmittedEntry: true });
    if (state.rankingEntries.some((ranking) => ranking.id === savedEntry.id)) return false;
    state.rankingEntries = [savedEntry, ...state.rankingEntries];
    return true;
  }

  function fetchRankings(includeVersion = true) {
    const sortOrder = state.rankingSortOrder === "asc" ? "asc" : "desc";
    const orderQuery = state.rankingSortBy === "createdAt"
      ? `created_at.${sortOrder},stage.desc`
      : `stage.${sortOrder},created_at.asc`;
    return fetch(
      rankingEndpoint(`?select=${rankingSelectFields(includeVersion)}${rankingVersionQuery(includeVersion)}&order=${orderQuery}&limit=${rankingLimit}`),
      { headers: rankingHeaders() },
    );
  }

  async function loadRankingVersions() {
    updateRankingVersions();
    if (!rankingBackendEnabled()) return;
    try {
      const response = await fetch(
        rankingEndpoint(`?select=${versionColumn}&${versionColumn}=not.is.null&order=${versionColumn}.desc&limit=1000`),
        { headers: rankingHeaders() },
      );
      if (!response.ok) return;
      const rows = await response.json();
      updateRankingVersions(rows.map((row) => ({ rankingVersion: row[versionColumn] || row.ranking_version || "" })));
    } catch (error) {
      console.warn(error);
    }
  }

  async function loadRankings(force = false) {
    if (state.rankingLoading || (state.rankingLoaded && !force)) return;
    state.rankingLoading = true;
    state.rankingError = "";
    await loadRankingVersions();
    renderRanking();

    try {
      if (!rankingBackendEnabled()) {
        state.rankingEntries = filteredLocalRankingEntries();
        return;
      }

      let response = await fetchRankings(true);
      if (!response.ok) response = await fetchRankings(false);
      if (!response.ok) throw new Error(`랭킹 조회 실패 (${response.status})`);
      let rows = await response.json();
      if (state.rankingVersionFilter && state.rankingVersionFilter !== "all" && !rows.some((row) => row[versionColumn] || row.ranking_version)) {
        rows = [];
      }
      state.rankingEntries = rows.map(normalizeRankingEntry);
      updateRankingVersions();
    } catch (error) {
      state.rankingError = rankingBackendEnabled() ? "서버 랭킹을 불러오지 못해 로컬 기록을 표시합니다." : "";
      state.rankingEntries = filteredLocalRankingEntries();
      console.warn(error);
    } finally {
      state.rankingLoaded = true;
      state.rankingLoading = false;
      renderRanking();
    }
  }

  function boardSnapshot(board = state.board) {
    return board.filter(Boolean).map((unit) => ({
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
    if (!state.deathRecord || state.rankingSubmitted || state.rankingSaving) return;
    const name = refs.rankName.value.trim().slice(0, 12) || "익명";
    const entry = {
      id: crypto.randomUUID(),
      name,
      ...state.deathRecord,
      rankingVersion,
    };
    state.rankingSaving = true;
    state.rankingError = "";
    renderRanking();

    try {
      if (rankingBackendEnabled()) {
        let response = await fetch(rankingEndpoint(), {
          method: "POST",
          headers: rankingHeaders({ Prefer: "return=representation" }),
          body: JSON.stringify({
            nickname: entry.name,
            stage: entry.stage,
            board: entry.board,
            [versionColumn]: rankingVersion,
          }),
        });
        if (!response.ok) {
          response = await fetch(rankingEndpoint(), {
            method: "POST",
            headers: rankingHeaders({ Prefer: "return=representation" }),
            body: JSON.stringify({
              nickname: entry.name,
              stage: entry.stage,
              board: entry.board,
            }),
          });
        }
        if (!response.ok) throw new Error(`랭킹 등록 실패 (${response.status})`);
        const rows = await response.json();
        const savedEntry = normalizeRankingEntry(rows[0] || entry);
        state.rankingSubmitted = true;
        refs.rankName.value = "";
        clearRankingRecordsCache();
        await loadRankings(true);
        const shownOutsideSortedList = rememberSubmittedEntry(savedEntry);
        state.rankingError = shownOutsideSortedList
          ? "랭킹 등록 완료. 상위 목록 밖의 기록이라 방금 등록한 기록을 맨 위에 함께 표시합니다."
          : "랭킹 등록 완료.";
        render();
        return;
      }
      throw new Error("서버 랭킹 설정이 없습니다.");
    } catch (error) {
      const local = sortRankingEntries([entry, ...localRankingEntries()]).slice(0, 20);
      saveLocalRankingEntries(local);
      state.rankingEntries = local;
      state.rankingError = rankingBackendEnabled()
        ? "서버 등록에 실패해서 브라우저에 임시 저장했습니다."
        : "서버 설정 없이 브라우저에 임시 저장했습니다.";
      state.rankingSubmitted = true;
      refs.rankName.value = "";
      console.warn(error);
    } finally {
      state.rankingSaving = false;
      render();
    }
  }

  return {
    captureDeathRecord,
    loadRankings,
    submitRanking,
  };
}
