export function createGameView({ state, refs, balance, audio, combat, boardUnits, boardLimit, levelXpLabel, xpToNextLevel, syncLocalTestGold, views, renderCommunityBoard }) {
  function renderCombatFrame() {
    views.battlefield.renderBoard();
    views.traits.renderCombatProgress();
  }

  function render() {
    syncLocalTestGold();
    refs.round.textContent = state.round;
    refs.hp.textContent = state.hp;
    refs.gold.textContent = state.gold;
    refs.streak.textContent = state.streakType ? `${state.streakType === "win" ? "연승" : "연패"} ${state.streakCount}` : "-";
    refs.income.textContent = `수입 +${state.lastIncome}`;
    refs.level.textContent = state.level;
    refs.levelXp.textContent = levelXpLabel();
    const nextXp = xpToNextLevel();
    const xpWidth = state.level >= balance.player.maxLevel ? "100%" : `${Math.round((state.xp / nextXp) * 100)}%`;
    refs.levelXpBar.style.width = xpWidth;
    refs.fieldXpBar.style.width = xpWidth;
    audio.renderBgmState();
    refs.levelUp.textContent = state.level >= balance.player.maxLevel
      ? "최대 레벨"
      : `${balance.player.buyXpCost}크레딧 → ${balance.player.buyXpAmount}XP`;
    refs.levelUp.disabled = state.busy || state.level >= balance.player.maxLevel;
    const hasPendingAugmentChoice = !state.augmentOpen
      && (state.augmentChoices || []).length > 0
      && !(state.selectedAugments || []).some((augment) => augment.stage === state.augmentStage);
    const hasPendingAugmentTarget = Boolean(state.pendingAugmentTarget);
    const currentBoardCount = boardUnits().length;
    const currentBoardLimit = boardLimit();
    const isBoardOverLimit = currentBoardCount > currentBoardLimit;
    refs.battle.disabled = state.busy || isBoardOverLimit;
    refs.battle.textContent = state.busy
      ? "전투 중"
      : isBoardOverLimit
        ? "초과 배치"
        : hasPendingAugmentTarget
          ? "대상 선택"
          : hasPendingAugmentChoice
            ? "증강 선택"
            : "전투 시작";
    if (refs.augmentResumeCenter) {
      refs.augmentResumeCenter.hidden = state.busy || state.combatGrid || !hasPendingAugmentChoice;
      refs.augmentResumeCenter.textContent = `${state.augmentStage || 1}단계 증강 선택`;
    }
    const bossInfo = combat.currentBossInfo();
    refs.boardCapacity.classList.toggle("boss-warning", Boolean(bossInfo));
    refs.boardCapacity.classList.toggle("over-limit", !bossInfo && isBoardOverLimit);
    refs.boardCapacityMain.textContent = bossInfo ? "BOSS" : `${currentBoardCount}/${currentBoardLimit}`;
    refs.boardCapacitySub.textContent = bossInfo ? `${bossInfo.name} 출현` : isBoardOverLimit ? "초과 배치 정리 필요" : "";
    refs.boardCapacity.hidden = Boolean(state.combatGrid);
    refs.shopLock.textContent = state.shopLocked ? "잠금 중" : "잠금 해제";
    refs.shopLock.classList.toggle("active", state.shopLocked);
    refs.oddsPopover.hidden = !state.oddsOpen;
    refs.oddsToggle.classList.toggle("active", state.oddsOpen);
    views.shop.renderShop();
    views.shop.renderShopOdds();
    views.battlefield.renderBoard();
    views.battlefield.renderBench();
    views.traits.renderTraits();
    views.unit.renderUnitDetail();
    views.overlays.renderRanking();
    views.overlays.renderPatchNotes();
    views.overlays.renderAugments();
    views.overlays.renderActiveAugments();
    views.traits.renderTraitRosterModal();
    views.traits.renderTraitTableModal();
    renderCommunityBoard();
  }

  return { render, renderCombatFrame };
}
