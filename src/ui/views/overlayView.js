export function createOverlayView({ state, refs, rankingConfig, patchNotesConfig, augmentSettings }) {
  const rarityLabels = {
    silver: "실버",
    gold: "골드",
    prismatic: "프리즘",
  };
  const tagLabels = {
    stage1: "1단계",
    stage2: "2단계",
    stage3: "3단계",
    common: "공용",
    trait: "시너지",
    crest: "문장",
    crown: "왕관",
    overcap: "초과",
    entry: "입문",
    contract: "계약",
    shop: "상점",
    reroll: "리롤",
    odds: "확률",
    shopSize: "상점칸",
    bench: "벤치",
    boardSize: "배치수",
    operation: "운영",
    combat: "전투",
    basicAttack: "기본공격",
    speed: "공속",
    survival: "생존",
    position: "배치",
    frontline: "전열",
    hp: "체력",
    playerHp: "플레이어",
    threeStar: "3성",
    transcend: "초월",
    scaling: "성장",
    mana: "마나",
    creditSink: "크레딧소모",
    temporaryBoost: "강화",
    duplicate: "중복배치",
    ruleBreak: "규칙파괴",
    stat: "스탯",
    debuff: "약화",
    맹공: "맹공",
    수호: "수호",
    주술: "주술",
    지원: "지원",
    정밀: "정밀",
    결투: "결투",
    기습: "기습",
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function shortSeed(seed) {
    return String(seed || "").replace(/^.+:/, "").slice(0, 8) || "-";
  }

  function tagLabel(tag) {
    return tagLabels[tag] || tag;
  }

  function percent(value, digits = 0) {
    return `${Math.round((Number(value) || 0) * 100 * 10 ** digits) / 10 ** digits}%`;
  }

  function signedPercent(value, digits = 0) {
    const number = Number(value) || 0;
    return `${number >= 0 ? "+" : ""}${percent(number, digits)}`;
  }

  function signedNumber(value, suffix = "") {
    const number = Number(value) || 0;
    return `${number >= 0 ? "+" : ""}${number}${suffix}`;
  }

  function seconds(value) {
    return `${Math.round((Number(value) || 0) * 10) / 10}초`;
  }

  function statLines(stats = {}) {
    const lines = [];
    if (Number.isFinite(stats.hpMultiply)) lines.push(`체력 x${stats.hpMultiply}`);
    if (Number.isFinite(stats.hpMultiplyAdd)) lines.push(`체력 ${signedPercent(stats.hpMultiplyAdd)}`);
    if (Number.isFinite(stats.hpMultiplyAddPerCount)) lines.push(`체력 ${signedPercent(stats.hpMultiplyAddPerCount)}`);
    if (Number.isFinite(stats.hpAdd)) lines.push(`체력 ${signedNumber(stats.hpAdd)}`);
    if (Number.isFinite(stats.atkMultiply)) lines.push(`공격력 x${stats.atkMultiply}`);
    if (Number.isFinite(stats.atkMultiplyAdd)) lines.push(`공격력 ${signedPercent(stats.atkMultiplyAdd)}`);
    if (Number.isFinite(stats.atkMultiplyAddPerCount)) lines.push(`공격력 ${signedPercent(stats.atkMultiplyAddPerCount)}`);
    if (Number.isFinite(stats.atkAdd)) lines.push(`공격력 ${signedNumber(stats.atkAdd)}`);
    if (Number.isFinite(stats.skillAmpMultiply)) lines.push(`스킬증폭 x${stats.skillAmpMultiply}`);
    if (Number.isFinite(stats.skillAmpMultiplyAdd)) lines.push(`스킬증폭 ${signedPercent(stats.skillAmpMultiplyAdd)}`);
    if (Number.isFinite(stats.skillAmpMultiplyAddPerCount)) lines.push(`스킬증폭 ${signedPercent(stats.skillAmpMultiplyAddPerCount)}`);
    if (Number.isFinite(stats.skillAmpAdd)) lines.push(`스킬증폭 ${signedNumber(stats.skillAmpAdd)}`);
    if (Number.isFinite(stats.defenseMultiply)) lines.push(`방어력 x${stats.defenseMultiply}`);
    if (Number.isFinite(stats.defenseMultiplyAdd)) lines.push(`방어력 ${signedPercent(stats.defenseMultiplyAdd)}`);
    if (Number.isFinite(stats.defenseAdd)) lines.push(`방어력 ${signedNumber(stats.defenseAdd)}`);
    if (Number.isFinite(stats.speedMultiply)) lines.push(`공격속도 x${stats.speedMultiply}`);
    if (Number.isFinite(stats.speedMultiplyAdd)) lines.push(`공격속도 ${signedPercent(stats.speedMultiplyAdd)}`);
    if (Number.isFinite(stats.speedAdd)) lines.push(`공격속도 ${signedNumber(stats.speedAdd)}`);
    if (Number.isFinite(stats.healMultiply)) lines.push(`회복량 x${stats.healMultiply}`);
    if (Number.isFinite(stats.healMultiplyAdd)) lines.push(`회복량 ${signedPercent(stats.healMultiplyAdd)}`);
    if (Number.isFinite(stats.critChanceAdd)) lines.push(`치명 확률 ${signedPercent(stats.critChanceAdd)}`);
    if (Number.isFinite(stats.critDamageAdd)) lines.push(`치명 피해 ${signedPercent(stats.critDamageAdd)}`);
    if (Number.isFinite(stats.lifeStealAdd)) lines.push(`흡혈 ${signedPercent(stats.lifeStealAdd)}`);
    if (Number.isFinite(stats.lifestealAdd)) lines.push(`흡혈 ${signedPercent(stats.lifestealAdd)}`);
    if (Number.isFinite(stats.damageReductionAdd)) lines.push(`받는 피해 감소 ${signedPercent(stats.damageReductionAdd)}`);
    if (Number.isFinite(stats.maxManaReductionAdd)) lines.push(`요구 마나 ${signedNumber(-stats.maxManaReductionAdd)}`);
    if (Number.isFinite(stats.openingCritMultiplierAdd)) lines.push(`첫 평타 치명 배율 ${signedPercent(stats.openingCritMultiplierAdd)}`);
    return lines;
  }

  function augmentEffectLines(augment) {
    const effect = augment?.effect || {};
    const grant = effect.grantUnitCopy || effect.grantUnitIfMissing;
    const lines = [];
    if (grant && (grant.unit || effect.unit)) lines.push(`${grant.unit || effect.unit} ${grant.tier || 1}성 지급. 이미 3성이면 미지급.`);
    switch (effect.type) {
      case "benchSize": lines.push(`벤치 슬롯 ${signedNumber(effect.add)}칸.`); break;
      case "boardLimit": lines.push(`배치 가능 유닛 ${signedNumber(effect.add)}명.`); break;
      case "shopSize": lines.push(`상점 슬롯 ${signedNumber(effect.add)}칸.`); break;
      case "shopOddsLevelBonus": lines.push(`상점 확률 계산 레벨 ${signedNumber(effect.add)}.`); break;
      case "freeRerollPerRound": lines.push(`라운드마다 무료 상점 리롤 ${effect.count || 1}회.`); break;
      case "instantGold": lines.push(`즉시 크레딧 ${signedNumber(effect.add)}.`); break;
      case "playerHp": lines.push(`플레이어 체력 ${signedNumber(effect.add)}.`); break;
      case "cataclysmTransform": lines.push(`모든 보유 유닛이 성급을 유지하고 ${effect.costAdd || 1}코스트 높은 유닛으로 변합니다.`); break;
      case "randomAugmentGrant": lines.push(`무작위 ${effect.rarity === "prismatic" ? "프리즘" : effect.rarity === "gold" ? "골드" : "실버"} 증강 ${effect.count || 1}개를 즉시 획득합니다.`); break;
      case "interestCapBonus": lines.push(`이자 상한 ${signedNumber(effect.add)}.`); break;
      case "streakIncomeBonus": lines.push(`연승/연패 수입 상한 ${signedNumber(effect.capAdd)}.`); break;
      case "sellValueBonus": lines.push(`판매 수익 x${effect.multiply || 1}.`); break;
      case "temporaryBoostTuning": lines.push(`일시 강화 비용 ${signedNumber(effect.costAdd)}크레딧. 강화 효과 ${signedPercent(effect.amountAdd)}.`); break;
      case "contractFreeUnitsNoSell": lines.push(`유닛 구매 비용 ${effect.unitCostOverride ?? 0}크레딧. 유닛 판매 불가.`); break;
      case "contractNoRerollBigShop": lines.push(`상점 리롤 불가. 상점 슬롯 ${effect.shopSizeSet || 10}칸.`); break;
      case "contractEliteSquad": lines.push(`배치 한도 ${signedNumber(effect.boardLimitAdd)}명. ${statLines(effect.stats).join(" / ")}.`); break;
      case "contractMassTactics": lines.push(`배치 한도 ${signedNumber(effect.boardLimitAdd)}명. ${statLines(effect.stats).join(" / ")}.`); break;
      case "duplicateFieldLimit": lines.push(`동일 캐릭터 전장 배치 최대 ${effect.maxSameCharacterOnBoard || 2}명.`); break;
      case "traitCount":
      case "virtualTraitCount": lines.push(`${effect.trait} 시너지 카운트 ${signedNumber(effect.add)}.`); break;
      case "traitCrown": {
        lines.push(`${effect.trait} 시너지 카운트 ${signedNumber(effect.add)}.`);
        const overcap = statLines(effect.overcap || {}).join(" / ");
        if (overcap) lines.push(`최대 단계 초과 1명당 ${overcap}.`);
        break;
      }
      case "traitStat": lines.push(`${effect.trait} 유닛: ${statLines(effect.stats).join(" / ")}.`); break;
      case "threeStarStat": lines.push(`3성 유닛: ${statLines(effect.stats).join(" / ")}.`); break;
      case "transcendThreeStar": lines.push(`3성 1명 초월: ${statLines(effect.stats).join(" / ")}.`); break;
      case "threeStarCollector": lines.push(`보유 3성 1명당 체력 ${signedPercent(effect.perThreeStar?.hpMultiplyAdd)} / 공격력 ${signedPercent(effect.perThreeStar?.atkMultiplyAdd)} / 스킬증폭 ${signedPercent(effect.perThreeStar?.skillAmpMultiplyAdd)}.`); break;
      case "positionStat": lines.push(`${effect.rows === "front2" ? "전열 2줄" : "지정 위치"} 유닛: ${statLines(effect.stats).join(" / ")}.`); break;
      case "frontlineShieldAndDefense": lines.push(`전열 2줄: 최대체력 ${percent(effect.shieldHpRatio)} 보호막 / 방어력 x${effect.defenseMultiply || 1}.`); break;
      case "adjacentAllyStat": lines.push(`인접 아군 ${effect.minAdjacentAllies || 2}명 이상: ${statLines(effect.stats).join(" / ")}.`); break;
      case "isolatedAllyStat": lines.push(`주변 ${effect.range || 1}칸 아군 없음: 공격력 x${effect.atkMultiply || 1} / 스킬증폭 x${effect.skillAmpMultiply || 1}.`); break;
      case "basicAttackStack": lines.push(`기본공격마다 ${effect.stat === "speed" ? "공격속도" : effect.stat} ${signedPercent(effect.addPerStack, 1)}. 최대 ${effect.maxStacks || 0}중첩.`); break;
      case "combatTimeScalingStat": lines.push(`${effect.intervalSeconds || 3}초마다 공격력 ${signedPercent(effect.atkMultiplyAdd, 1)} / 스킬증폭 ${signedPercent(effect.skillAmpMultiplyAdd, 1)}. 최대 ${effect.maxStacks || 0}중첩.`); break;
      case "teamKillCombatStack": lines.push(`아군 처치마다 전체 공격력 ${signedPercent(effect.atkMultiplyAdd, 1)} / 스킬증폭 ${signedPercent(effect.skillAmpMultiplyAdd, 1)}. 최대 ${effect.stacks || 0}중첩.`); break;
      case "afterMoveAttackSpeed": lines.push(`${effect.movedHexes || 2}칸 이상 이동한 유닛 공격속도 x${effect.speedMultiply || 1}. ${seconds(effect.durationSeconds)} 지속.`); break;
      case "lowHpOnceBuff": lines.push(`체력 ${percent(effect.triggerHpRatio)} 이하 1회: ${statLines(effect.stats).join(" / ")}. ${Math.round(Number(effect.durationMs || 0) / 100) / 10}초 지속.`); break;
      case "lowHpHealPulse": lines.push(`체력 ${percent(effect.thresholdHpRatio)} 이하 1회: 주변 ${effect.range || 1}칸 아군 최대체력 ${percent(effect.healHpRatio)} 회복.`); break;
      case "frontlineSurvivalGold": lines.push(`전열 생존 유닛 1명당 ${effect.goldPerSurvivor || 1}크레딧. 최대 ${effect.maxGold || 0}크레딧.`); break;
      case "damageAgainstHighestDefense": lines.push(`방어력 최고 적 공격 시 피해 x${effect.damageMultiply || 1}.`); break;
      case "sameTargetVulnerability": lines.push(`같은 대상 반복 공격 시 중첩당 받는 피해 ${signedPercent(effect.damageTakenAddPerStack, 1)}. 최대 ${effect.stacks || 0}중첩.`); break;
      case "firstAttackSnare": lines.push(`첫 기본공격 대상 이동불가 ${seconds(effect.duration)}. 받는 피해 ${signedPercent(effect.damageTakenAdd)}.`); break;
      case "periodicBasicAttackMaxHpDamage": lines.push(`기본공격 ${effect.everyHits || 4}회마다 대상 최대체력 ${percent(effect.targetMaxHpRatio, 1)} 고정피해. 보스 ${percent(effect.bossRatio, 1)}.`); break;
      case "executeLowHpEnemy": lines.push(`체력 ${percent(effect.thresholdHpRatio)} 이하 일반 적 처형. 보스는 최대체력 ${percent(effect.bossDamageMaxHpRatio)} 고정피해.`); break;
      case "threeStarRevive": lines.push(`3성 유닛 전투당 1회 체력 ${percent(effect.hpRatio)}로 부활.`); break;
      case "lastAllyStandingBuff": lines.push(`마지막 생존 아군: 체력 x${effect.hpMultiply || 1} / 공격력 x${effect.atkMultiply || 1} / 스킬증폭 x${effect.skillAmpMultiply || 1}.`); break;
      case "inheritFirstDeadThreeStar": lines.push(`첫 사망 3성 능력 계승: 공격력 ${percent(effect.inheritAtkRatio)} / 스킬증폭 ${percent(effect.inheritSkillAmpRatio)} / 체력 ${percent(effect.inheritHpRatio)}.`); break;
      case "deadAllyAttackShare": lines.push(`아군 사망 시 생존 아군에게 사망 유닛 공격력의 ${percent(effect.atkShareRatio)} 지급.`); break;
      case "skillChainLightning": lines.push(`스킬 적중 시 가장 가까운 추가 적 1명에게 스킬증폭 ${percent(effect.damageSkillAmpRatio)} 피해. 쿨다운 ${seconds(effect.cooldownSeconds)}.`); break;
      case "skillCurseStack": lines.push(`스킬 적중 대상에게 저주. 중첩당 받는 피해 ${signedPercent(effect.damageTakenAdd)} / 치유 감소 ${percent(effect.healingReduction)}. 최대 ${effect.maxStacks || 0}중첩.`); break;
      case "skillMaxHpDamage": lines.push(`스킬 적중 시 대상 최대체력 ${percent(effect.targetMaxHpRatio, 1)} 추가 고정피해. 반복 대상 ${percent(effect.repeatedTargetDecay)} 효율. 보스 ${percent(effect.bossRatio, 1)}.`); break;
      case "traitSkillManaShare": lines.push(`스킬 사용 시 같은 시너지 아군 마나 ${signedNumber(effect.manaAdd)}. 쿨다운 ${seconds(effect.cooldownSeconds)}.`); break;
      case "highestSkillAmpRelay": lines.push(`최고 스증 유닛 스킬 사용 시 주변 ${effect.range || 2}칸 아군 스킬증폭 x${effect.skillAmpMultiply || 1}. ${seconds(effect.durationSeconds)} 지속.`); break;
      case "cathyUnsealableSuture": lines.push(`충돌 시 공격력 ${percent(effect.collisionTrueDamageAtkRatio)} 고정피해. 속박 ${signedNumber(effect.collisionBindAddSeconds, "초")}.`); break;
      case "lukeCleaningService": lines.push(`처치 후 다음 평타 공격력 ${signedPercent(effect.nextAttackAtkRatioAdd)} 추가. 표식 대상 받는 피해 ${signedPercent(effect.markedDamageTakenAdd)}.`); break;
      case "shouBattlefieldChef": lines.push(`초과회복의 ${percent(effect.overhealShieldRatio)} 보호막 전환. 시전당 회복량 ${signedPercent(effect.healStackMultiplyAdd)}. 최대 ${effect.maxStacks || 0}중첩.`); break;
      case "yanRingDomination": lines.push(`${effect.comboHits || 3}연타. 타격당 공격력 ${percent(effect.bonusAtkRatio)} + 스킬증폭 35% 피해. 마지막 타격 기절 ${seconds(effect.stunSeconds)}.`); break;
      case "hartPeacemakerWorldTour": lines.push(`아군 최대체력 ${percent(effect.teamHealHpRatio)} 회복. 마나 ${signedNumber(effect.teamManaAdd)} / 공격속도 x${effect.speedMultiply || 1}. ${seconds(effect.durationSeconds)} 지속.`); break;
      case "alexFocusedBarrage": lines.push(`폭격 ${signedNumber(effect.extraStrike)}회 추가. 반복 적중 시 스킬증폭 ${percent(effect.repeatHitDamageSkillAmpRatio)} 추가피해.`); break;
      case "priyaGrandFinale": lines.push(`주변 아군 최대체력 ${percent(effect.allyShieldHpRatio)} 보호막. 기절 시간 ${signedNumber(effect.edgeStunAddSeconds, "초")}.`); break;
      case "danielMoonlightExecution": lines.push(`후열 대상 피해 x${effect.backlineDamageMultiply || 1}. 체력 ${percent(effect.executeThresholdHpRatio)} 이하 대상에게 공격력 ${percent(effect.executeDamageAtkRatio)} 고정피해.`); break;
      case "lenoxChainSentence": lines.push(`속박 ${signedNumber(effect.bindSeconds, "초")}. 대상 받는 피해 ${signedPercent(effect.damageTakenAdd)}. 처치 시 주변 제압 ${seconds(effect.onDeathNearbySuppressSeconds)}.`); break;
      case "iremCatfishMayhem": lines.push(`처치마다 공격력 ${signedNumber(effect.killAtkAdd)} / 스킬증폭 ${signedNumber(effect.killSkillAmpAdd)}. 전술 표적 처치 시 x${effect.tacticalTargetBonusMultiply || 1}.`); break;
      case "theodoreSniperProtocol": lines.push(`아군 공격 지원: 스킬증폭 ${percent(effect.assistDamageSkillAmpRatio)} 피해. 공격 아군 최대체력 ${percent(effect.allyShieldHpRatio)} 보호막. 쿨다운 ${seconds(effect.cooldownSeconds)}.`); break;
      case "shoichiSevenElixir": lines.push(`전투당 1회 ${effect.dashCount || 7}회 단검 이동. 경로 피해 공격력 ${percent(effect.pathDamageAtkRatio)} + 스킬증폭 ${percent(effect.pathDamageSkillAmpRatio)}. 마지막 피해 공격력 ${percent(effect.finalDamageAtkRatio)} + 스킬증폭 ${percent(effect.finalDamageSkillAmpRatio)}. 보스 피해 x${effect.bossDamageMultiplier || 1}.`); break;
      default: break;
    }
    return lines.filter(Boolean);
  }

  function sentenceLines(text) {
    return String(text || "")
      .split(/(?<=\.)\s+/g)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function renderAugmentDescription(augment) {
    const description = sentenceLines(augment.description || "");
    const effectLines = augmentEffectLines(augment);
    return `
      <div class="augment-description">
        ${description.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
        ${effectLines.length ? `
          <dl class="augment-effect-lines">
            <dt>정확한 효과</dt>
            ${effectLines.map((line) => `<dd>${escapeHtml(line)}</dd>`).join("")}
          </dl>
        ` : ""}
      </div>
    `;
  }

  function augmentTitleText(augment) {
    return [...sentenceLines(augment.description || ""), ...augmentEffectLines(augment)].join("\n");
  }

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

  function renderAugments() {
    if (!refs.augmentModal) return;
    refs.augmentModal.hidden = !state.augmentOpen;
    const rarityLabel = rarityLabels[state.augmentOfferRarity] || "증강";
    refs.augmentTitle.textContent = `${state.augmentStage || 1}단계 증강 선택`;
    refs.augmentMeta.textContent = [
      `${rarityLabel} 등급`,
      "각 카드 1회 리롤",
      state.debugMode ? `seed ${shortSeed(state.augmentOfferSeed)}` : "",
      "선택 후 되돌릴 수 없습니다.",
    ].filter(Boolean).join(" · ");
    if (refs.augmentReroll) {
      refs.augmentReroll.disabled = !state.augmentOpen || state.augmentRerollsRemaining <= 0;
      refs.augmentReroll.textContent = state.augmentRerollsRemaining > 0 ? `무료 리롤 ${state.augmentRerollsRemaining}` : "리롤 없음";
    }
    refs.augmentPanel.innerHTML = (state.augmentChoices || []).length
      ? state.augmentChoices.map((augment, index) => {
        const rarity = augment.rarity || "silver";
        const isContract = augment.tags?.includes("contract");
        const canReroll = !(state.augmentRerolledSlots || []).includes(index);
        return `
          <article class="augment-card ${escapeHtml(rarity)} ${isContract ? "contract" : ""}">
            <span class="augment-rarity">${escapeHtml(rarityLabels[rarity] || rarity)}</span>
            ${isContract ? `<span class="augment-contract">계약</span>` : ""}
            <strong>${escapeHtml(augment.name)}</strong>
            <em>${escapeHtml(augment.summary || "")}</em>
            ${renderAugmentDescription(augment)}
            <small>${(augment.tags || []).slice(0, 4).map((tag) => `<i>${escapeHtml(tagLabel(tag))}</i>`).join("")}</small>
            <div class="augment-card-actions">
              <button type="button" class="augment-reroll-button" data-augment-reroll-slot="${index}" ${canReroll ? "" : "disabled"}>
                <span class="augment-reroll-icon" aria-hidden="true"></span>
                <span>${canReroll ? "리롤" : "완료"}</span>
              </button>
              <button type="button" class="primary" data-augment-id="${escapeHtml(augment.id)}">선택</button>
            </div>
          </article>
        `;
      }).join("")
      : `<div class="augment-empty">선택 가능한 증강이 없습니다.</div>`;
    refs.selectedAugments.innerHTML = (state.selectedAugments || []).length
      ? `
        <strong>선택한 증강</strong>
        <div>
          ${state.selectedAugments.map((augment) => `
            <span class="${escapeHtml(augment.rarity || "silver")}" title="${escapeHtml(augmentTitleText(augment))}">
              ${escapeHtml(augment.stage)}단계 · ${escapeHtml(augment.name)}
            </span>
          `).join("")}
        </div>
      `
      : "";
  }

  function renderActiveAugments() {
    if (!refs.activeAugments) return;
    const augments = state.selectedAugments || [];
    const hasPendingChoice = !state.augmentOpen
      && (state.augmentChoices || []).length > 0
      && !(state.selectedAugments || []).some((augment) => augment.stage === state.augmentStage);
    refs.activeAugments.hidden = !augments.length && !hasPendingChoice;
    if (!augments.length && !hasPendingChoice) {
      refs.activeAugments.innerHTML = "";
      return;
    }
    refs.activeAugments.innerHTML = `
      <div class="active-augments-title">
        <strong>선택 증강</strong>
        <span>${augments.length}/3</span>
      </div>
      ${hasPendingChoice ? `
        <button class="active-augment pending" type="button" data-augment-reopen>
          <span>${escapeHtml(state.augmentStage || 1)}단계</span>
          <strong>증강 선택</strong>
          <em>보드 확인 후 선택</em>
          <i>닫아도 후보는 유지됩니다.</i>
        </button>
      ` : ""}
      <div class="active-augment-list">
        ${augments.map((augment) => {
          const rarity = augment.rarity || "silver";
          return `
            <button class="active-augment ${escapeHtml(rarity)}" type="button" title="${escapeHtml(augmentTitleText(augment))}">
              <span>${escapeHtml(augment.stage)}단계</span>
              <strong>${escapeHtml(augment.name)}</strong>
              <em>${escapeHtml(rarityLabels[rarity] || rarity)}</em>
              <i>${escapeHtml(augmentEffectLines(augment)[0] || augment.summary || "")}</i>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  return { renderActiveAugments, renderAugments, renderPatchNotes, renderRanking };
}
