export function bindUiEvents({ $, refs, state, balance, actions }) {
  $("reroll").addEventListener("click", () => {
    if (state.busy) return;
    if (state.gold < balance.shop.rerollCost) return actions.addLog(`새로고침에는 ${balance.shop.rerollCost} 크레딧이 필요합니다.`);
    state.gold -= balance.shop.rerollCost;
    actions.addLog(`상점 새로고침: ${balance.shop.rerollCost} 크레딧 사용.`);
    actions.rollShop();
  });

  $("shopLock").addEventListener("click", () => {
    if (state.busy) return;
    state.shopLocked = !state.shopLocked;
    actions.addLog(state.shopLocked ? "상점을 잠갔습니다." : "상점 잠금을 해제했습니다.");
    actions.render();
  });

  $("oddsToggle").addEventListener("click", () => {
    state.oddsOpen = !state.oddsOpen;
    actions.render();
  });

  $("battle").addEventListener("click", actions.simulate);
  $("levelUp").addEventListener("click", actions.buyXp);
  refs.sellUnit.addEventListener("click", actions.sellSelectedUnit);
  refs.bgmToggle.addEventListener("click", actions.toggleBgm);
  refs.rankingToggle.addEventListener("click", () => {
    state.rankingOpen = true;
    actions.loadRankings(true);
    actions.render();
  });
  refs.rankingClose.addEventListener("click", () => {
    state.rankingOpen = false;
    actions.render();
  });
  refs.rankingModal.addEventListener("click", (event) => {
    if (event.target === refs.rankingModal) {
      state.rankingOpen = false;
      actions.render();
    }
  });
  refs.rankSave.addEventListener("click", actions.submitRanking);
  refs.rankName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") actions.submitRanking();
  });
  refs.patchNotesClose.addEventListener("click", actions.closePatchNotes);
  refs.patchNotesModal.addEventListener("click", (event) => {
    if (event.target === refs.patchNotesModal) actions.closePatchNotes();
  });
  refs.patchNotesSkipToday.addEventListener("change", () => {
    state.patchNotesSkipToday = refs.patchNotesSkipToday.checked;
  });
}
