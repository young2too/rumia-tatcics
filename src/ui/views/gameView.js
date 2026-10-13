export function createGameView({ state, refs, balance, audio, combat, boardUnits, boardLimit, levelXpLabel, xpToNextLevel, syncLocalTestGold, views, renderCommunityBoard }) {
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char]));
  }

  function displayedPvpRound() {
    const roomRound = Math.max(0, Number(state.pvpCurrentRound) || 0);
    if (!state.lumiShopResolved && Number(state.lumiShopRound) > 0) return Number(state.lumiShopRound);
    if (state.augmentOpen && [11, 21].includes(roomRound)) return roomRound - 1;
    return roomRound;
  }

  function renderPvpRoundTracker() {
    if (!refs.pvpRoundTracker) return;
    const round = displayedPvpRound();
    const visible = state.gameMode === "pvp" && state.pvpRoomPhase !== "pve" && round > 0;
    refs.pvpRoundTracker.hidden = !visible;
    if (!visible) return;

    const stage = Math.floor((round - 1) / 10) + 1;
    const step = ((round - 1) % 10) + 1;
    refs.pvpRoundStage.textContent = `${stage}-${step}`;
    refs.pvpRoundTimeline.innerHTML = Array.from({ length: 10 }, (_, index) => {
      const slot = index + 1;
      const type = slot === 5 ? "shop-event" : slot === 10 ? "finale" : "battle";
      const icon = type === "shop-event" ? "🛒" : type === "finale" ? "★" : "⚔";
      const event = type === "shop-event"
        ? "루미 상점"
        : type === "finale"
          ? round <= 20 ? "마지막 전투 후 증강 선택" : "스테이지 마지막 전투"
          : "플레이어 전투";
      const progress = slot < step ? "past" : slot === step ? "current" : "future";
      return `<span class="${type} ${progress}" title="${slot}라운드 · ${event}" aria-label="${slot}라운드 ${event}">${icon}</span>`;
    }).join("");
  }

  function renderPvpBattleInfo() {
    if (!refs.pvpVersusHud || !refs.pvpOpponentAugments) return;
    const match = state.pvpMatch;
    const visible = state.gameMode === "pvp"
      && state.pvpRoomPhase !== "pve"
      && Boolean(match?.opponentSnapshot);
    refs.pvpVersusHud.hidden = !visible;
    refs.pvpOpponentAugments.hidden = !visible;
    if (!visible) {
      refs.pvpVersusHud.innerHTML = "";
      refs.pvpOpponentAugments.innerHTML = "";
      return;
    }

    const startHp = Math.max(1, Number(balance.player.startHp) || 100);
    const ownPlayer = (state.pvpPlayers || []).find((player) => player.id === state.pvpOwnPlayerId);
    const opponentPlayer = (state.pvpPlayers || []).find((player) => player.id === match.opponent_player_id);
    const ownName = ownPlayer?.nickname || "나";
    const opponentName = match.opponent_nickname || opponentPlayer?.nickname || "상대";
    const ownHp = Math.max(0, Number(state.hp) || 0);
    const opponentHp = Math.max(0, Number(match.opponent_health ?? opponentPlayer?.health ?? match.opponentSnapshot?.economy?.hp) || 0);
    const ownWidth = Math.min(100, Math.round((ownHp / startHp) * 100));
    const opponentWidth = Math.min(100, Math.round((opponentHp / startHp) * 100));

    refs.pvpVersusHud.innerHTML = `
      <section class="pvp-fighter own">
        <div><strong>${escapeHtml(ownName)}</strong><span>HP ${ownHp}</span></div>
        <i><b style="width:${ownWidth}%"></b></i>
      </section>
      <em>VS</em>
      <section class="pvp-fighter opponent">
        <div><strong>${escapeHtml(opponentName)}</strong><span>HP ${opponentHp}</span></div>
        <i><b style="width:${opponentWidth}%"></b></i>
      </section>
    `;

    const opponentAugments = match.opponentSnapshot?.augments || [];
    refs.pvpOpponentAugments.innerHTML = `
      <div class="pvp-opponent-augments-title"><strong>상대 증강</strong><span>${opponentAugments.length}/3</span></div>
      <div class="pvp-opponent-augment-list">
        ${opponentAugments.length ? opponentAugments.map((augment) => `
          <article class="${escapeHtml(augment.rarity || "silver")}" title="${escapeHtml(augment.name || "증강")}">
            <span>${escapeHtml(augment.stage || 1)}단계</span>
            <strong>${escapeHtml(augment.name || "알 수 없는 증강")}</strong>
          </article>
        `).join("") : "<p>선택한 증강이 없습니다.</p>"}
      </div>
    `;
  }

  function renderCombatFrame() {
    views.battlefield.renderBoard();
    views.traits.renderCombatProgress();
  }

  function render() {
    syncLocalTestGold();
    const shownPvpRound = displayedPvpRound();
    refs.round.textContent = state.gameMode !== "pvp"
      ? state.round
      : state.pvpRoomPhase === "pve"
        ? Number(state.pvpCurrentRound) === 5 ? "증강" : `준비 ${Math.min(4, Math.max(1, Number(state.round) || 1))}/4`
        : shownPvpRound > 0
          ? `${Math.floor((shownPvpRound - 1) / 10) + 1}-${((shownPvpRound - 1) % 10) + 1}`
          : "준비";
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
    renderPvpRoundTracker();
    renderPvpBattleInfo();
    refs.levelUp.textContent = state.level >= balance.player.maxLevel
      ? "최대 레벨"
      : `${balance.player.buyXpCost}크레딧 → ${balance.player.buyXpAmount}XP`;
    refs.levelUp.disabled = state.busy
      || state.level >= balance.player.maxLevel
      || (state.gameMode === "pvp" && state.pvpSnapshotSubmitted);
    if (refs.replayBattle) {
      const replayAvailable = state.gameMode === "pvp" && Boolean(state.pvpLastReplay);
      refs.replayBattle.hidden = !replayAvailable;
      refs.replayBattle.disabled = state.busy
        || state.pvpReplaying
        || Boolean(state.pendingAugmentTarget)
        || state.augmentOpen;
      refs.replayBattle.textContent = state.pvpReplaying ? "재생 중" : "이전 전투 보기";
    }
    const hasPendingAugmentChoice = !state.augmentOpen
      && (state.augmentChoices || []).length > 0
      && !(state.selectedAugments || []).some((augment) => augment.stage === state.augmentStage);
    const hasPendingAugmentTarget = Boolean(state.pendingAugmentTarget);
    const hasPendingLumiShop = !state.lumiShopResolved && (state.lumiShopOffers || []).length > 0;
    const currentBoardCount = boardUnits().length;
    const currentBoardLimit = boardLimit();
    const isBoardOverLimit = currentBoardCount > currentBoardLimit;
    const pvpPreparationDone = state.gameMode === "pvp" && state.pvpSnapshotSubmitted;
    const pvpRoundPlanning = state.gameMode === "pvp" && state.pvpCurrentRound > 0 && !state.pvpSnapshotSubmitted;
    const pvpMatchReady = pvpPreparationDone && Boolean(state.pvpMatch?.opponentSnapshot) && !state.pvpMatchResolved;
    const realtimePlanning = state.gameMode === "pvp" && state.pvpMode === "realtime" && state.pvpRoomPhase === "planning";
    const realtimePve = state.gameMode === "pvp" && state.pvpMode === "realtime" && state.pvpRoomPhase === "pve";
    const realtimeSeconds = state.pvpPhaseDeadline
      ? Math.max(0, Math.ceil((new Date(state.pvpPhaseDeadline).getTime() - Date.now()) / 1000))
      : null;
    refs.battle.hidden = state.gameMode === "pvp" && pvpPreparationDone && !hasPendingLumiShop;
    refs.battle.disabled = state.busy
      || isBoardOverLimit
      || hasPendingLumiShop
      || state.pvpSnapshotSubmitting
      || state.pvpFinished
      || realtimePve
      || realtimePlanning
      || (pvpPreparationDone && !pvpMatchReady && state.pvpMatchLoading);
    refs.battle.textContent = hasPendingLumiShop
      ? state.lumiShopPendingProductId ? "상품 대상 선택" : "루미 상점 방문"
      : state.pvpSnapshotSubmitting
      ? "덱 제출 중"
      : state.pvpFinished
        ? "PvP 종료"
        : state.pvpMatchResolved
        ? "PvP 결과 확정"
        : pvpMatchReady
          ? "PvP 전투 시작"
          : pvpPreparationDone
            ? state.pvpMatchLoading ? "대진 확인 중" : "대진 다시 확인"
          : realtimePve
            ? Number(state.pvpCurrentRound) === 5
              ? "증강 선택 중"
              : state.pvpRealtimePveStarting || state.busy
                ? `PvE ${Math.min(4, Number(state.pvpCurrentRound) || 1)}/4 전투 중`
                : state.pvpRealtimePveWaiting
                  ? "다른 참가자 대기"
                  : realtimeSeconds == null
                    ? "PvE 준비 중"
                    : `PvE ${Math.min(4, Number(state.pvpCurrentRound) || 1)}/4 · ${realtimeSeconds}초`
          : realtimePlanning
            ? realtimeSeconds == null ? "전투 준비 중" : `자동 전투 ${realtimeSeconds}초`
          : pvpRoundPlanning
            ? hasPendingAugmentTarget
              ? "대상 선택"
              : hasPendingAugmentChoice
                ? "증강 선택"
                : "PvP 준비 완료"
        : state.pvpQueuePreparation && !state.busy
          ? "준비 전투 시작"
        : state.busy
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
    views.lumiShop?.render();
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
