export function createPatchNotesController({ state, patchNotesConfig, patchNotesStorageKey, render }) {
  function todayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function hiddenToday() {
    try {
      return localStorage.getItem(patchNotesStorageKey) === todayKey();
    } catch {
      return false;
    }
  }

  function initPatchNotes() {
    state.patchNotesOpen = Boolean(patchNotesConfig.enabled) && !hiddenToday();
    state.patchNotesSkipToday = false;
  }

  function closePatchNotes() {
    if (state.patchNotesSkipToday) {
      try {
        localStorage.setItem(patchNotesStorageKey, todayKey());
      } catch {
        // localStorage can be unavailable in some embedded contexts.
      }
    }
    state.patchNotesOpen = false;
    state.patchNotesSkipToday = false;
    render();
  }

  return {
    closePatchNotes,
    initPatchNotes,
  };
}
