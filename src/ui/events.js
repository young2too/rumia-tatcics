export function bindUiEvents({ $, refs, state, balance, actions }) {
  refs.debugRecruitUnit?.addEventListener("click", () => {
    actions.debugRecruitUnit(refs.debugUnitSearch.value);
    refs.debugUnitSearch.value = "";
  });
  refs.debugSelectAugment?.addEventListener("click", () => {
    actions.debugSelectAugment(refs.debugAugmentSearch.value);
    refs.debugAugmentSearch.value = "";
  });
  refs.debugUnitSearch?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    actions.debugRecruitUnit(refs.debugUnitSearch.value);
    refs.debugUnitSearch.value = "";
  });
  refs.debugAugmentSearch?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    actions.debugSelectAugment(refs.debugAugmentSearch.value);
    refs.debugAugmentSearch.value = "";
  });
  refs.debugDummyToggle?.addEventListener("click", actions.toggleDebugDummyPlacement);
  refs.debugDummyClear?.addEventListener("click", actions.clearDebugDummies);
  refs.debugRoundJump?.addEventListener("click", () => actions.debugJumpRound(refs.debugRoundInput.value));
  refs.debugRoundInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") actions.debugJumpRound(refs.debugRoundInput.value);
  });
  refs.debugShop?.addEventListener("click", (event) => {
    const targetRound = event.target.closest("[data-debug-round]")?.dataset.debugRound;
    if (targetRound) actions.debugJumpRound(targetRound);
    const augmentStage = event.target.closest("[data-debug-augment-stage]")?.dataset.debugAugmentStage;
    if (augmentStage) actions.openAugments(Number(augmentStage), { force: true });
  });
  refs.shopTabShop?.addEventListener("click", () => actions.setShopPanelTab("shop"));
  refs.shopTabMetrics?.addEventListener("click", () => actions.setShopPanelTab("metrics"));
  refs.combatMetrics?.addEventListener("click", (event) => {
    const mode = event.target.closest("[data-combat-metric]")?.dataset.combatMetric;
    if (mode) actions.setCombatMetricMode(mode);
  });
  $("reroll").addEventListener("click", () => {
    actions.rerollShop();
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
  refs.replayBattle?.addEventListener("click", actions.replayLastPvpBattle);
  $("levelUp").addEventListener("click", actions.buyXp);
  refs.temporaryBoosts?.addEventListener("click", (event) => {
    if (event.target.closest("[data-four-star-promotion]")) {
      actions.beginFourStarPromotion?.();
      return;
    }
    const button = event.target.closest("[data-boost]");
    if (button) actions.buyTemporaryBoost(button.dataset.boost);
  });
  refs.sellUnit.addEventListener("click", actions.sellSelectedUnit);
  refs.bgmToggle.addEventListener("click", actions.toggleBgm);
  refs.patchNotesToggle.addEventListener("click", actions.openPatchNotes);
  refs.rankingToggle.addEventListener("click", () => {
    state.rankingOpen = true;
    actions.loadRankings(true);
    actions.render();
  });
  refs.rankingClose.addEventListener("click", () => {
    state.rankingOpen = false;
    actions.render();
  });
  refs.rankingSortStage?.addEventListener("click", () => actions.setRankingSort("stage"));
  refs.rankingSortRecent?.addEventListener("click", () => actions.setRankingSort("createdAt"));
  refs.rankingVersionFilter?.addEventListener("change", () => actions.setRankingVersionFilter(refs.rankingVersionFilter.value));
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
  refs.augmentReroll?.addEventListener("click", actions.rerollAugments);
  refs.augmentClose?.addEventListener("click", actions.closeAugments);
  refs.augmentCatalogOpen?.addEventListener("click", actions.openAugmentCatalog);
  refs.augmentCatalogClose?.addEventListener("click", actions.closeAugmentCatalog);
  refs.augmentCatalogModal?.addEventListener("click", (event) => {
    if (event.target === refs.augmentCatalogModal) actions.closeAugmentCatalog();
  });
  refs.augmentCatalogPanel?.addEventListener("click", (event) => {
    const stage = event.target.closest("[data-augment-catalog-stage]")?.dataset.augmentCatalogStage;
    if (stage) return actions.setAugmentCatalogFilter(Number(stage));
    const rarity = event.target.closest("[data-augment-catalog-rarity]")?.dataset.augmentCatalogRarity;
    if (rarity) actions.setAugmentCatalogFilter(undefined, rarity);
  });
  refs.augmentResumeCenter?.addEventListener("click", actions.reopenAugments);
  refs.lumiShopResumeCenter?.addEventListener("click", () => {
    if (state.lumiShopPendingProductId) actions.cancelLumiShopTarget?.();
    else actions.reopenLumiShop?.();
  });
  refs.lumiShopClose?.addEventListener("click", actions.closeLumiShop);
  refs.lumiShopSkip?.addEventListener("click", actions.skipLumiShop);
  refs.lumiShopPanel?.addEventListener("click", (event) => {
    const productId = event.target.closest("[data-lumi-product-id]")?.dataset.lumiProductId;
    if (productId) actions.buyLumiShopProduct?.(productId);
  });
  refs.activeAugments?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (target?.closest("[data-active-augments-toggle]")) {
      actions.toggleActiveAugments?.();
      return;
    }
    if (target?.closest("[data-augment-catalog-open]")) {
      actions.openAugmentCatalog?.();
      return;
    }
    if (target?.closest("[data-augment-reopen]")) {
      actions.reopenAugments();
      return;
    }
    const detailIndex = target?.closest("[data-augment-detail-index]")?.dataset.augmentDetailIndex;
    if (detailIndex !== undefined) actions.openAugmentDetail(Number(detailIndex));
  });
  refs.augmentPanel?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const rerollSlot = target?.closest("[data-augment-reroll-slot]")?.dataset.augmentRerollSlot;
    if (rerollSlot !== undefined) {
      actions.rerollAugmentSlot(Number(rerollSlot));
      return;
    }
    const augmentId = target?.closest("[data-augment-id]")?.dataset.augmentId;
    if (augmentId) actions.selectAugment(augmentId);
  });
  refs.traits.addEventListener("click", (event) => {
    const trait = event.target.closest(".trait")?.dataset.trait;
    if (trait) actions.openTraitRoster(trait);
  });
  refs.traitTableToggle?.addEventListener("click", actions.openTraitTable);
  refs.hiddenTraitToggle?.addEventListener("click", () => {
    state.showHiddenTraits = !state.showHiddenTraits;
    actions.render();
  });
  refs.traitRosterClose.addEventListener("click", actions.closeTraitRoster);
  refs.traitRosterModal.addEventListener("click", (event) => {
    if (event.target === refs.traitRosterModal) actions.closeTraitRoster();
  });
  refs.traitTableClose?.addEventListener("click", actions.closeTraitTable);
  refs.traitTableModal?.addEventListener("click", (event) => {
    if (event.target === refs.traitTableModal) actions.closeTraitTable();
  });
}
