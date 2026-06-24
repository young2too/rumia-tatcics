export function createRankingController({ state, refs, rankingConfig, rankingStorageKey, renderRanking, render }) {
  let memoryRankings = [];
  const rankingLimit = Number(rankingConfig.limit) || 100;

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

  function normalizeRankingEntry(entry) {
    return {
      id: entry.id || crypto.randomUUID(),
      name: entry.name || entry.nickname || "익명",
      stage: Number(entry.stage) || 1,
      board: Array.isArray(entry.board) ? entry.board : [],
      createdAt: entry.createdAt || entry.created_at || new Date().toISOString(),
      isSubmittedEntry: Boolean(entry.isSubmittedEntry),
    };
  }

  function sortRankingEntries(entries) {
    return entries
      .map(normalizeRankingEntry)
      .sort((a, b) => b.stage - a.stage || new Date(a.createdAt) - new Date(b.createdAt));
  }

  function rememberSubmittedEntry(entry) {
    if (!entry) return false;
    const savedEntry = normalizeRankingEntry({ ...entry, isSubmittedEntry: true });
    if (state.rankingEntries.some((ranking) => ranking.id === savedEntry.id)) return false;
    state.rankingEntries = [savedEntry, ...state.rankingEntries];
    return true;
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

      const sortOrder = state.rankingSortOrder === "asc" ? "asc" : "desc";
      const orderQuery = state.rankingSortBy === "createdAt"
        ? `created_at.${sortOrder},stage.desc`
        : `stage.${sortOrder},created_at.asc`;
      const response = await fetch(
        rankingEndpoint(`?select=id,nickname,stage,board,created_at&order=${orderQuery}&limit=${rankingLimit}`),
        { headers: rankingHeaders() },
      );
      if (!response.ok) throw new Error(`랭킹 조회 실패 (${response.status})`);
      const rows = await response.json();
      state.rankingEntries = rows.map(normalizeRankingEntry);
    } catch (error) {
      state.rankingError = rankingBackendEnabled() ? "서버 랭킹을 불러오지 못해 로컬 기록을 표시합니다." : "";
      state.rankingEntries = localRankingEntries().map(normalizeRankingEntry);
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
    };
    state.rankingSaving = true;
    state.rankingError = "";
    renderRanking();

    try {
      if (rankingBackendEnabled()) {
        const response = await fetch(rankingEndpoint(), {
          method: "POST",
          headers: rankingHeaders({ Prefer: "return=representation" }),
          body: JSON.stringify({
            nickname: entry.name,
            stage: entry.stage,
            board: entry.board,
          }),
        });
        if (!response.ok) throw new Error(`랭킹 등록 실패 (${response.status})`);
        const rows = await response.json();
        const savedEntry = normalizeRankingEntry(rows[0] || entry);
        state.rankingSubmitted = true;
        refs.rankName.value = "";
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
