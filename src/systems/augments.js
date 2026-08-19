// 증강 컨트롤러: 시드 기반 증강 후보 생성, 리롤, 선택 기록을 관리합니다.
import { createDeterministicSeed, createSeededRng, createStableHash } from "../core/rng.js";
import { applyImmediateAugmentEffect } from "./augmentEffects.js";

const RARITIES = ["silver", "gold", "prismatic"];

export function createAugmentController({
  state,
  augmentSettings,
  augmentPools,
  roster = [],
  makeUnit,
  ownedUnits,
  render,
  addLog,
}) {
  function triggerStageForRound(round) {
    const entries = Object.entries(augmentSettings.triggerRounds || {});
    const match = entries.find(([, triggerRound]) => Number(triggerRound) === Number(round));
    return match ? Number(match[0]) : 0;
  }

  function boardSignature() {
    return createStableHash(
      ownedUnits()
        .map((unit) => ({
          name: unit.name,
          tier: unit.tier,
          source: state.board.includes(unit) ? "board" : "bench",
          index: state.board.includes(unit) ? state.board.indexOf(unit) : state.bench.indexOf(unit),
        }))
        .sort((a, b) => a.source.localeCompare(b.source) || a.index - b.index || a.name.localeCompare(b.name, "ko"))
    );
  }

  function selectedIds() {
    return new Set((state.selectedAugments || []).map((augment) => augment.id));
  }

  function ownedTraitCount(trait) {
    if (!trait) return 0;
    const names = new Set();
    for (const unit of ownedUnits()) {
      const traits = Array.isArray(unit.traits) && unit.traits.length ? unit.traits : [unit.trait].filter(Boolean);
      if (traits.includes(trait)) names.add(unit.name);
    }
    return names.size;
  }

  function ownsUnit(name) {
    if (!name) return false;
    return ownedUnits().some((unit) => unit?.name === name);
  }

  function canOffer(augment, stage) {
    if (!augment || augment.active === false) return false;
    if (selectedIds().has(augment.id)) return false;
    if (Array.isArray(augment.stages) && !augment.stages.includes(stage)) return false;
    if (augment.requires?.trait && ownedTraitCount(augment.requires.trait) < (augment.requires.minOwned ?? 1)) return false;
    if (augment.requires?.unit && !ownsUnit(augment.requires.unit)) return false;
    return true;
  }

  function poolFor(stage, rarity) {
    const stageKey = `stage${stage}`;
    return [
      ...(augmentPools.common?.[rarity] || []),
      ...(augmentPools[stageKey]?.[rarity] || []),
    ].filter((augment) => canOffer(augment, stage));
  }

  function allPoolFor(stage) {
    return RARITIES.flatMap((rarity) => poolFor(stage, rarity));
  }

  function allAugments({ includeInactive = false } = {}) {
    const result = [];
    for (const group of Object.values(augmentPools || {})) {
      for (const rarity of RARITIES) {
        for (const augment of group?.[rarity] || []) {
          if (!includeInactive && augment.active === false) continue;
          result.push(augment);
        }
      }
    }
    return result;
  }

  function rollRarity(rng, stage) {
    const odds = augmentSettings.rarityOddsByStage?.[stage] || augmentSettings.rarityOddsByStage?.[String(stage)] || {};
    const total = RARITIES.reduce((sum, rarity) => sum + Math.max(0, Number(odds[rarity]) || 0), 0);
    if (total <= 0) return "silver";
    let roll = rng.random() * total;
    for (const rarity of RARITIES) {
      roll -= Math.max(0, Number(odds[rarity]) || 0);
      if (roll <= 0) return rarity;
    }
    return "silver";
  }

  function takeChoice(candidates, pickedIds, rng) {
    const available = candidates.filter((augment) => !pickedIds.has(augment.id));
    if (!available.length) return null;
    const picked = available[rng.integer(available.length)];
    pickedIds.add(picked.id);
    return structuredClone(picked);
  }

  function makeOfferSeed(stage, rerollIndex = state.augmentOfferRerollIndex || 0) {
    return createDeterministicSeed("augment-offer", {
      round: state.round,
      stage,
      rerollIndex,
      selected: (state.selectedAugments || []).map((augment) => augment.id),
      board: boardSignature(),
    });
  }

  function generateChoices(stage, rerollIndex = state.augmentOfferRerollIndex || 0) {
    const seed = makeOfferSeed(stage, rerollIndex);
    const rng = createSeededRng(seed);
    const pickedIds = new Set();
    const choices = [];
    const choiceCount = augmentSettings.choiceCount || 3;
    const offerRarity = rollRarity(rng, stage);
    for (let index = 0; index < choiceCount; index += 1) {
      const fromRarity = takeChoice(poolFor(stage, offerRarity), pickedIds, rng);
      const fallback = fromRarity || takeChoice(allPoolFor(stage), pickedIds, rng);
      if (fallback) choices.push({ ...fallback, offerSlot: index });
    }
    state.augmentOfferSeed = seed;
    state.augmentOfferRarity = offerRarity;
    return choices;
  }

  function rememberSeenAugments(augments = []) {
    const ids = new Set(state.augmentSeenIds || []);
    for (const augment of augments) {
      if (augment?.id) ids.add(augment.id);
    }
    state.augmentSeenIds = [...ids];
  }

  function openAugments(stage, options = {}) {
    if (state.busy && !options.force) return false;
    const normalizedStage = Math.max(1, Math.min(3, Math.round(Number(stage) || 1)));
    if (!options.force && (state.selectedAugments || []).some((augment) => augment.stage === normalizedStage)) return false;
    state.augmentDetailOpen = false;
    state.augmentDetailIndex = -1;
    state.augmentStage = normalizedStage;
    state.augmentOpen = true;
    state.augmentOfferRerollIndex = 0;
    state.augmentRerollsRemaining = augmentSettings.freeRerolls ?? 1;
    state.augmentRerolledSlots = [];
    state.augmentSeenIds = [];
    state.augmentChoices = generateChoices(normalizedStage, 0);
    rememberSeenAugments(state.augmentChoices);
    addLog?.(`[증강] ${normalizedStage}단계 후보가 열렸습니다.`);
    render();
    return true;
  }

  function offerForRound(round) {
    const stage = triggerStageForRound(round);
    if (!stage) return false;
    return openAugments(stage, { force: true });
  }

  function rerollAugments() {
    const slotIndex = state.augmentChoices.findIndex((_, index) => !(state.augmentRerolledSlots || []).includes(index));
    if (slotIndex >= 0) rerollAugmentSlot(slotIndex);
  }

  function canRerollAugmentSlot(slotIndex) {
    const index = Math.max(0, Math.min((state.augmentChoices || []).length - 1, Math.round(Number(slotIndex) || 0)));
    if (!state.augmentOpen) return false;
    if ((state.augmentRerolledSlots || []).includes(index)) return false;
    const current = state.augmentChoices?.[index];
    if (!current) return false;
    const rarity = state.augmentOfferRarity || current.rarity || "silver";
    const blocked = new Set([
      ...(state.augmentSeenIds || []),
      ...(state.augmentChoices || []).map((augment) => augment.id),
    ]);
    return poolFor(state.augmentStage, rarity).some((augment) => !blocked.has(augment.id))
      || allPoolFor(state.augmentStage).some((augment) => augment.rarity === rarity && !blocked.has(augment.id));
  }

  function rerollAugmentSlot(slotIndex) {
    if (!state.augmentOpen) return;
    const index = Math.max(0, Math.min((state.augmentChoices || []).length - 1, Math.round(Number(slotIndex) || 0)));
    if ((state.augmentRerolledSlots || []).includes(index)) return;
    const rarity = state.augmentOfferRarity || state.augmentChoices[index]?.rarity || "silver";
    const seed = createDeterministicSeed("augment-card-reroll", {
      offerSeed: state.augmentOfferSeed,
      stage: state.augmentStage,
      slotIndex: index,
      selected: (state.selectedAugments || []).map((augment) => augment.id),
      currentChoices: (state.augmentChoices || []).map((augment) => augment.id),
      board: boardSignature(),
    });
    const rng = createSeededRng(seed);
    const blocked = new Set([
      ...(state.augmentSeenIds || []),
      ...(state.augmentChoices || []).map((augment) => augment.id),
    ]);
    const replacement = takeChoice(poolFor(state.augmentStage, rarity), blocked, rng)
      || takeChoice(allPoolFor(state.augmentStage).filter((augment) => augment.rarity === rarity), blocked, rng);
    if (!replacement) {
      state.augmentRerolledSlots = [...new Set([...(state.augmentRerolledSlots || []), index])];
      addLog?.(`[증강] ${index + 1}번 카드는 바꿀 수 있는 다른 후보가 없습니다.`);
      render();
      return;
    }
    state.augmentChoices[index] = {
      ...replacement,
      offerSlot: index,
      rerollSeed: seed,
      rerolled: true,
    };
    rememberSeenAugments([replacement]);
    state.augmentRerolledSlots = [...(state.augmentRerolledSlots || []), index];
    addLog?.(`[증강] ${index + 1}번 카드를 다시 뽑았습니다. seed ${seed.replace(/^.+:/, "").slice(0, 8)}`);
    render();
  }

  function grantUnitCopyBySpec(spec, fallbackUnitName) {
    const unitName = spec?.unit || fallbackUnitName;
    if (!spec || !unitName || !makeUnit) return false;
    if (ownedUnits().some((unit) => unit?.name === unitName && unit.tier >= 3)) {
      addLog?.(`[증강] 이미 ${unitName} 3성을 보유 중이라 추가 지급하지 않았습니다.`, { force: true });
      return false;
    }
    const base = roster.find((unit) => unit.name === unitName);
    if (!base) return false;
    const slot = state.bench.findIndex((unit) => !unit);
    if (slot < 0) {
      addLog?.(`[증강] ${unitName}을 지급하려 했지만 벤치가 가득 찼습니다.`, { force: true });
      return false;
    }
    const tier = Math.max(1, Math.min(3, Math.round(Number(spec.tier) || 1)));
    state.bench[slot] = makeUnit(base, tier);
    addLog?.(`[증강] ${unitName} ${tier}성을 획득했습니다.`, { force: true });
    return true;
  }

  function traitGrantCostForRarity(rarity) {
    if (rarity === "prismatic") return 5;
    if (rarity === "gold") return 3;
    return 2;
  }

  function unitHasTrait(unit, trait) {
    const traits = Array.isArray(unit?.traits) && unit.traits.length ? unit.traits : [unit?.trait].filter(Boolean);
    return traits.includes(trait);
  }

  function isTraitAugment(augment) {
    return ["traitCount", "virtualTraitCount", "traitCrown", "traitStat"].includes(augment?.effect?.type);
  }

  function grantTraitAugmentUnit(augment) {
    const trait = augment?.effect?.trait;
    if (!trait || !makeUnit || !isTraitAugment(augment)) return "";
    const cost = traitGrantCostForRarity(augment.rarity);
    const threeStars = ownedThreeStarNames();
    const candidates = roster.filter((unit) => (
      unit?.active !== false
      && Number(unit.cost) === cost
      && unitHasTrait(unit, trait)
      && !threeStars.has(unit.name)
    ));
    if (!candidates.length) {
      addLog?.(`[증강] ${augment.name}: 지급 가능한 ${cost}코 ${trait} 유닛이 없습니다.`, { force: true });
      return "";
    }
    const seed = createDeterministicSeed("augment-trait-unit-grant", {
      round: state.round,
      stage: state.augmentStage,
      augmentId: augment.id,
      trait,
      cost,
      board: boardSignature(),
      selected: (state.selectedAugments || []).map((item) => item.id),
    });
    const rng = createSeededRng(seed);
    const base = candidates[rng.integer(candidates.length)];
    const slot = state.bench.findIndex((unit) => !unit);
    if (slot < 0) {
      addLog?.(`[증강] ${augment.name}: ${base.name}을 지급하려 했지만 벤치가 가득 찼습니다.`, { force: true });
      return "";
    }
    state.bench[slot] = makeUnit(base, 1);
    addLog?.(`[증강] ${augment.name}: ${base.name} 1성을 지급했습니다.`, { force: true });
    return base.name;
  }

  function grantUnitCopies(augment) {
    const effect = augment?.effect || {};
    const specs = Array.isArray(effect.grantUnitCopies)
      ? effect.grantUnitCopies
      : [effect.grantUnitCopy || effect.grantUnitIfMissing].filter(Boolean);
    const grantedNames = [];
    const traitUnitName = grantTraitAugmentUnit(augment);
    if (traitUnitName) grantedNames.push(traitUnitName);
    for (const spec of specs) {
      const unitName = spec?.unit || effect.unit;
      if (grantUnitCopyBySpec(spec, unitName)) grantedNames.push(unitName);
    }
    return grantedNames;
  }

  function unitCopyCount(unit) {
    return unit?.tier >= 3 ? 9 : unit?.tier >= 2 ? 3 : 1;
  }

  function ownedThreeStarNames() {
    return new Set(ownedUnits().filter((unit) => unit?.tier >= 3).map((unit) => unit.name));
  }

  function transformUnitToHigherCost(unit, rng) {
    if (!unit) return null;
    const nextCost = Math.min(5, (Number(unit.cost) || 1) + 1);
    const blockedThreeStars = ownedThreeStarNames();
    const candidates = roster.filter((base) => {
      if (base.active === false) return false;
      if (base.cost !== nextCost) return false;
      if (base.name === unit.name) return false;
      if (blockedThreeStars.has(base.name)) return false;
      return true;
    });
    if (!candidates.length) return null;
    const base = candidates[rng.integer(candidates.length)];
    const copies = unitCopyCount(unit);
    if (state.pool?.[unit.name] !== undefined) state.pool[unit.name] += copies;
    if (state.pool?.[base.name] !== undefined) state.pool[base.name] = Math.max(0, state.pool[base.name] - copies);
    return makeUnit(base, unit.tier || 1);
  }

  function applyCataclysmTransform(augment) {
    const effect = augment?.effect || {};
    if (effect.type !== "cataclysmTransform") return false;
    const seed = createDeterministicSeed("augment-cataclysm", {
      round: state.round,
      stage: state.augmentStage,
      augmentId: augment.id,
      selected: (state.selectedAugments || []).map((item) => item.id),
      board: boardSignature(),
    });
    const rng = createSeededRng(seed);
    let changed = 0;
    for (const arr of [state.board, state.bench]) {
      for (let index = 0; index < arr.length; index += 1) {
        const transformed = transformUnitToHigherCost(arr[index], rng);
        if (!transformed) continue;
        arr[index] = transformed;
        changed += 1;
      }
    }
    addLog?.(`[증강] ${augment.name}: ${changed}명의 유닛이 더 높은 코스트로 변했습니다.`, { force: true });
    return changed > 0;
  }

  function applyAugmentEffects(augment) {
    for (const grantedUnitName of grantUnitCopies(augment)) combineGrantedUnits(grantedUnitName);
    applyCataclysmTransform(augment);
    applyImmediateAugmentEffect(state, augment, addLog);
  }

  function targetableThreeStarUnits() {
    return ownedUnits().filter((unit) => unit?.tier >= 3);
  }

  function isAbsorbedTranscendTarget(unit) {
    return Boolean(unit?.fusedSkillRole || unit?.fusedSkillName || unit?.hiddenAbsorbed);
  }

  function beginTargetedAugmentSelection(augment) {
    const candidates = targetableThreeStarUnits();
    if (!candidates.length) {
      addLog?.(`[증강] ${augment.name}: 대상이 될 3성 유닛이 없습니다.`, { force: true });
      return false;
    }
    state.pendingAugmentTarget = {
      ...structuredClone(augment),
      stage: state.augmentStage,
      pickedAtRound: state.round,
      offerSeed: state.augmentOfferSeed,
    };
    state.augmentOpen = false;
    state.augmentChoices = [];
    state.selected = null;
    addLog?.(`[증강] ${augment.name}: 초월할 3성 유닛을 보드나 벤치에서 선택하세요.`, { force: true });
    return true;
  }

  function selectAugmentTarget(source, index) {
    const pending = state.pendingAugmentTarget;
    if (!pending || pending.effect?.type !== "transcendThreeStar") return false;
    if (!["board", "bench"].includes(source)) return false;
    const unit = state[source]?.[index];
    if (!unit) return false;
    if ((unit.tier || 1) < 3) {
      addLog?.(`[증강] ${pending.name}: 3성 유닛만 초월 대상으로 선택할 수 있습니다.`, { force: true });
      render();
      return true;
    }
    const reduced = isAbsorbedTranscendTarget(unit);
    state.augmentTranscendTargetId = unit.id;
    state.selectedAugments.push({
      ...structuredClone(pending),
      targetUnitId: unit.id,
      targetUnitName: unit.name,
      targetReduced: reduced,
    });
    state.pendingAugmentTarget = null;
    state.selected = { source, index };
    addLog?.(`[증강] ${pending.name}: ${unit.name} 초월${reduced ? " (흡수/융합 대상 효율 50%)" : ""}.`, { force: true });
    render();
    return true;
  }

  function grantRandomAugments(sourceAugment, blockedIds = new Set()) {
    const effect = sourceAugment?.effect || {};
    if (effect.type !== "randomAugmentGrant") return [];
    const rarity = RARITIES.includes(effect.rarity) ? effect.rarity : "gold";
    const count = Math.max(1, Math.min(3, Math.round(Number(effect.count) || 1)));
    const seed = createDeterministicSeed("augment-random-grant", {
      round: state.round,
      stage: state.augmentStage,
      sourceId: sourceAugment.id,
      selected: (state.selectedAugments || []).map((augment) => augment.id),
      board: boardSignature(),
    });
    const rng = createSeededRng(seed);
    const picked = [];
    const blocked = new Set([
      ...selectedIds(),
      ...blockedIds,
      sourceAugment.id,
      ...(state.augmentChoices || []).map((augment) => augment.id),
    ]);
    for (let index = 0; index < count; index += 1) {
      const candidates = poolFor(state.augmentStage, rarity)
        .filter((augment) => !blocked.has(augment.id))
        .filter((augment) => !["randomAugmentGrant", "transcendThreeStar"].includes(augment.effect?.type));
      if (!candidates.length) break;
      const augment = structuredClone(candidates[rng.integer(candidates.length)]);
      blocked.add(augment.id);
      applyAugmentEffects(augment);
      state.selectedAugments.push({
        ...augment,
        stage: state.augmentStage,
        pickedAtRound: state.round,
        grantedBy: sourceAugment.id,
        offerSeed: seed,
      });
      picked.push(augment);
      addLog?.(`[증강] ${sourceAugment.name}: ${augment.name} 추가 획득.`, { force: true });
    }
    return picked;
  }

  function combineGrantedUnits(name) {
    if (!name) return;
    while (true) {
      const owned = [...state.bench, ...state.board].filter((unit) => unit?.name === name);
      const sameTier = [2, 1].find((tier) => owned.filter((unit) => unit.tier === tier).length >= 3);
      if (!sameTier) return;
      let removed = 0;
      let firstRemoved = null;
      for (const arr of [state.bench, state.board]) {
        for (let i = 0; i < arr.length; i += 1) {
          if (arr[i]?.name === name && arr[i].tier === sameTier && removed < 3) {
            firstRemoved ||= { arr, index: i };
            arr[i] = null;
            removed += 1;
          }
        }
      }
      const base = roster.find((unit) => unit.name === name);
      if (base && firstRemoved) {
        firstRemoved.arr[firstRemoved.index] = makeUnit(base, sameTier + 1);
        addLog?.(`${name} ${sameTier + 1}성 합성!`, { force: true });
      }
    }
  }

  function selectAugment(id) {
    if (!state.augmentOpen) return;
    const augment = state.augmentChoices.find((choice) => choice.id === id);
    if (!augment) return;
    if (augment.effect?.type === "transcendThreeStar") {
      beginTargetedAugmentSelection(augment);
      render();
      return;
    }
    for (const grantedUnitName of grantUnitCopies(augment)) combineGrantedUnits(grantedUnitName);
    applyCataclysmTransform(augment);
    applyImmediateAugmentEffect(state, augment, addLog);
    state.selectedAugments.push({
      ...structuredClone(augment),
      stage: state.augmentStage,
      pickedAtRound: state.round,
      offerSeed: state.augmentOfferSeed,
    });
    grantRandomAugments(augment, new Set([augment.id]));
    state.augmentOpen = false;
    state.augmentChoices = [];
    addLog?.(`[증강] ${augment.name} 선택.`);
    render();
  }

  function debugSelectAugment(query) {
    if (!state.debugMode || state.busy) return;
    const normalized = String(query || "").trim().toLocaleLowerCase("ko");
    if (!normalized) return addLog?.("[증강] 증강 이름을 입력하세요.", { force: true });
    const candidates = allAugments();
    const augment = candidates.find((item) => item.name.toLocaleLowerCase("ko") === normalized || item.id.toLocaleLowerCase("ko") === normalized)
      || candidates.find((item) => item.name.toLocaleLowerCase("ko").includes(normalized) || item.id.toLocaleLowerCase("ko").includes(normalized));
    if (!augment) return addLog?.(`[증강] '${query}'에 해당하는 증강을 찾지 못했습니다.`, { force: true });
    const debugStage = Number(augment.stages?.[0]) || state.augmentStage || 1;
    state.augmentStage = Math.max(1, Math.min(3, debugStage));
    state.augmentOfferSeed = state.augmentOfferSeed || makeOfferSeed(state.augmentStage, state.augmentOfferRerollIndex || 0);
    if (augment.effect?.type === "transcendThreeStar") {
      beginTargetedAugmentSelection(augment);
      render();
      return;
    }
    applyAugmentEffects(augment);
    state.selectedAugments.push({
      ...structuredClone(augment),
      stage: state.augmentStage,
      pickedAtRound: state.round,
      offerSeed: state.augmentOfferSeed,
      debugGranted: true,
    });
    grantRandomAugments(augment, new Set([augment.id]));
    addLog?.(`[디버그 증강] ${augment.name} 즉시 선택.`, { force: true });
    render();
  }

  function reopenAugments() {
    if (!(state.augmentChoices || []).length) return false;
    if ((state.selectedAugments || []).some((augment) => augment.stage === state.augmentStage)) return false;
    state.augmentDetailOpen = false;
    state.augmentDetailIndex = -1;
    state.augmentOpen = true;
    render();
    return true;
  }

  function openAugmentDetail(index) {
    const normalized = Math.max(0, Math.round(Number(index) || 0));
    if (!state.selectedAugments?.[normalized]) return false;
    state.augmentDetailIndex = normalized;
    state.augmentDetailOpen = true;
    state.augmentOpen = false;
    render();
    return true;
  }

  function closeAugmentDetail() {
    state.augmentDetailOpen = false;
    state.augmentDetailIndex = -1;
    render();
  }

  function closeAugments() {
    if (state.augmentDetailOpen) {
      closeAugmentDetail();
      return;
    }
    state.augmentOpen = false;
    render();
  }

  return {
    closeAugments,
    closeAugmentDetail,
    canRerollAugmentSlot,
    offerForRound,
    openAugmentDetail,
    openAugments,
    reopenAugments,
    rerollAugmentSlot,
    rerollAugments,
    debugSelectAugment,
    selectAugment,
    selectAugmentTarget,
    triggerStageForRound,
  };
}
