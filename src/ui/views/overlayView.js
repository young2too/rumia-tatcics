export function createOverlayView({ state, refs, rankingConfig, patchNotesConfig }) {
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

  function renderRankingControls() {
    const controls = [
      { id: "stage", ref: refs.rankingSortStage, label: "라운드" },
      { id: "createdAt", ref: refs.rankingSortRecent, label: "최신" },
    ];
    for (const control of controls) {
      if (!control.ref) continue;
      const active = state.rankingSortBy === control.id;
      const arrow = active && state.rankingSortOrder === "asc" ? "↑" : "↓";
      control.ref.classList.toggle("active", active);
      control.ref.textContent = `${control.label} ${arrow}`;
      control.ref.title = `${control.label} 정렬 전환`;
    }
    if (!refs.rankingVersionFilter) return;
    const currentVersion = rankingConfig.majorVersion || patchNotesConfig.version || "";
    const options = [
      { value: "all", label: "통합랭킹" },
      ...Array.from(new Set([currentVersion, ...(state.rankingVersions || [])].filter(Boolean))).map((version) => ({ value: version, label: version })),
    ];
    refs.rankingVersionFilter.innerHTML = "";
    for (const option of options) {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      refs.rankingVersionFilter.append(node);
    }
    if (!options.some((option) => option.value === state.rankingVersionFilter)) state.rankingVersionFilter = "all";
    refs.rankingVersionFilter.value = state.rankingVersionFilter;
  }

  function renderRanking() {
    const entries = sortedRankingEntries();
    refs.rankingModal.hidden = !state.rankingOpen;
    refs.rankSubmit.hidden = !state.deathRecord || state.rankingSubmitted;
    refs.rankSave.disabled = state.rankingSaving;
    refs.rankSave.textContent = state.rankingSaving ? "등록 중" : "등록";
    renderRankingControls();
    const status = state.rankingError ? `<div class="ranking-empty">${state.rankingError}</div>` : "";
    refs.rankingPanel.hidden = false;
    refs.rankingPanel.innerHTML = state.rankingLoading
      ? `<div class="ranking-empty">랭킹을 불러오는 중입니다.</div>`
      : entries.length ? entries.map((entry, index) => `
        <div class="rank-entry ${entry.isSubmittedEntry ? "submitted" : ""}">
          <strong><span>${entry.isSubmittedEntry ? "등록됨" : `${index + 1}.`} ${entry.name}</span><b>${entry.stage}라운드</b></strong>
          <div class="rank-board">${entry.board.map((unit) => `<span class="rank-unit" title="${unit.name}">${unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1)}<i>${"★".repeat(unit.tier)}</i></span>`).join("")}</div>
          ${entry.rankingVersion ? `<em class="rank-version">${entry.rankingVersion}</em>` : ""}
        </div>
      `).join("") : `<div class="ranking-empty">등록된 기록이 없습니다.</div>`;
    if (status) refs.rankingPanel.insertAdjacentHTML("afterbegin", status);
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
    if (Array.isArray(patchNotesConfig.items) && patchNotesConfig.items.length) {
      const list = document.createElement("ul");
      for (const item of patchNotesConfig.items) {
        const row = document.createElement("li");
        row.textContent = item;
        list.append(row);
      }
      refs.patchNotesBody.append(list);
    }
  }

  return { renderPatchNotes, renderRanking };
}
