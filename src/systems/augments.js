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

  function openAugments(stage, options = {}) {
    if (state.busy && !options.force) return false;
    const normalizedStage = Math.max(1, Math.min(3, Math.round(Number(stage) || 1)));
    if (!options.force && (state.selectedAugments || []).some((augment) => augment.stage === normalizedStage)) return false;
    state.augmentStage = normalizedStage;
    state.augmentOpen = true;
    state.augmentOfferRerollIndex = 0;
    state.augmentRerollsRemaining = augmentSettings.freeRerolls ?? 1;
    state.augmentRerolledSlots = [];
    state.augmentChoices = generateChoices(normalizedStage, 0);
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
    const blocked = new Set((state.augmentChoices || [])
      .filter((_, choiceIndex) => choiceIndex !== index)
      .map((augment) => augment.id));
    const replacement = takeChoice(poolFor(state.augmentStage, rarity), blocked, rng)
      || takeChoice(allPoolFor(state.augmentStage).filter((augment) => augment.rarity === rarity), blocked, rng);
    if (!replacement) return;
    state.augmentChoices[index] = {
      ...replacement,
      offerSlot: index,
      rerollSeed: seed,
      rerolled: true,
    };
    state.augmentRerolledSlots = [...(state.augmentRerolledSlots || []), index];
    addLog?.(`[증강] ${index + 1}번 카드를 다시 뽑았습니다. seed ${seed.replace(/^.+:/, "").slice(0, 8)}`);
    render();
  }

  function grantUnitCopy(augment) {
    const spec = augment?.effect?.grantUnitCopy || augment?.effect?.grantUnitIfMissing;
    const unitName = spec?.unit || augment?.effect?.unit;
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
    const grantedUnitName = grantUnitCopy(augment) ? augment?.effect?.grantUnitCopy?.unit || augment?.effect?.unit : "";
    if (grantedUnitName) combineGrantedUnits(grantedUnitName);
    applyCataclysmTransform(augment);
    applyImmediateAugmentEffect(state, augment, addLog);
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
        .filter((augment) => augment.effect?.type !== "randomAugmentGrant");
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
    const grantedUnitName = grantUnitCopy(augment) ? augment?.effect?.grantUnitCopy?.unit || augment?.effect?.unit : "";
    if (grantedUnitName) combineGrantedUnits(grantedUnitName);
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

  function reopenAugments() {
    if (!(state.augmentChoices || []).length) return false;
    if ((state.selectedAugments || []).some((augment) => augment.stage === state.augmentStage)) return false;
    state.augmentOpen = true;
    render();
    return true;
  }

  function closeAugments() {
    state.augmentOpen = false;
    render();
  }

  return {
    closeAugments,
    offerForRound,
    openAugments,
    reopenAugments,
    rerollAugmentSlot,
    rerollAugments,
    selectAugment,
    triggerStageForRound,
  };
}
