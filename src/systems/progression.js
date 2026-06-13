export function createProgressionController({ state, balance, addLog, render, boardLimit }) {
  function xpToNextLevel() {
    return balance.player.levelXp[state.level] || 0;
  }

  function levelXpLabel() {
    if (state.level >= balance.player.maxLevel) return "MAX";
    return `${state.xp} / ${xpToNextLevel()} XP`;
  }

  function addXp(amount, reason) {
    if (state.level >= balance.player.maxLevel) return;
    state.xp += amount;
    let leveled = false;
    while (state.level < balance.player.maxLevel && state.xp >= xpToNextLevel()) {
      state.xp -= xpToNextLevel();
      state.level += 1;
      leveled = true;
    }
    if (leveled) {
      addLog(`${reason}: ${amount}XP 획득. 레벨 ${state.level}! 배치 한도 ${boardLimit()}명.`);
    } else {
      addLog(`${reason}: ${amount}XP 획득.`);
    }
  }

  function updateStreak(win) {
    const type = win ? "win" : "loss";
    if (state.streakType === type) {
      state.streakCount += 1;
    } else {
      state.streakType = type;
      state.streakCount = 1;
    }
  }

  function streakBonus() {
    if (state.streakCount >= 5) return 3;
    if (state.streakCount >= 4) return 2;
    if (state.streakCount >= 2) return 1;
    return 0;
  }

  function interestGold() {
    return Math.min(balance.battle.maxInterest, Math.floor(state.gold / balance.battle.interestStep));
  }

  function grantRoundIncome(win) {
    updateStreak(win);
    const base = balance.battle.baseIncome;
    const winGold = win ? balance.battle.winIncome : 0;
    const streakGold = streakBonus();
    const interest = interestGold();
    const total = base + winGold + streakGold + interest;
    state.gold += total;
    state.lastIncome = total;
    const streakLabel = state.streakType === "win" ? "연승" : "연패";
    addLog(`수입 +${total}: 기본 ${base}, ${win ? `승리 ${winGold}, ` : ""}${streakLabel} ${state.streakCount} (${streakGold}), 이자 ${interest}.`);
    return total;
  }

  function buyXp() {
    if (state.busy) return;
    if (state.level >= balance.player.maxLevel) return addLog("최대 레벨입니다.");
    if (state.gold < balance.player.buyXpCost) return addLog(`경험치 구매에는 ${balance.player.buyXpCost} 크레딧이 필요합니다.`);
    state.gold -= balance.player.buyXpCost;
    addXp(balance.player.buyXpAmount, "경험치 구매");
    render();
  }

  return {
    addXp,
    buyXp,
    grantRoundIncome,
    levelXpLabel,
    xpToNextLevel,
  };
}
