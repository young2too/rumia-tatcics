// 루미 상점 컨트롤러: 라운드별 상품 생성, 구매, 영구 강화와 기물 지급을 관리합니다.
import { createDeterministicSeed, createSeededRng } from "../core/rng.js";

const TARGET_EFFECTS = new Set(["unitStat", "jokerUnit"]);

export function createLumiShopController({
  state,
  balance,
  config,
  roster,
  ownedUnits,
  grantBonusUnit,
  addLog,
  render,
  canModify = () => true,
  prepareSharedOffers = null,
  claimSharedProduct = null,
}) {
  const productsById = new Map((config.products || []).map((product) => [product.id, product]));

  function isEnabledForCurrentMode(product) {
    if (state.gameMode === "pvp") return product?.pvpEnabled !== false;
    return product?.pveEnabled !== false;
  }

  function isTriggerRound(round) {
    if (state.gameMode !== "pvp") return (config.pveRounds || []).includes(round);
    const firstRound = Math.max(1, Number(config.pvpFirstRound) || 5);
    const interval = Math.max(1, Number(config.pvpInterval) || 10);
    return round >= firstRound && (round - firstRound) % interval === 0;
  }

  function hasFutureAugment(completedRound) {
    if (state.gameMode === "pvp") return Number(completedRound) < 20;
    return Number(completedRound) < 60;
  }

  function eligibleProducts(completedRound) {
    return (config.products || []).filter((product) => {
      if (!isEnabledForCurrentMode(product)) return false;
      if (product.requiresFutureAugment && !hasFutureAugment(completedRound)) return false;
      if (state.gameMode !== "pvp" && product.effect?.type === "playerDeathGuard" && state.lumiIceShieldReady) return false;
      return true;
    });
  }

  function offerCount() {
    if (state.gameMode !== "pvp") return Math.max(1, Number(config.pveOfferCount) || 6);
    return Math.max(2, Number(state.pvpActivePlayerCount) || 8);
  }

  function priceForRound(product, completedRound) {
    const basePrice = Math.max(0, Number(product.price) || 0);
    if (state.gameMode !== "pvp") return basePrice;
    const configured = config.pvpRoundPriceMultipliers?.[String(completedRound)];
    const multiplier = Number.isFinite(Number(configured)) ? Math.max(0, Number(configured)) : 1;
    return Math.max(0, Math.round(basePrice * multiplier));
  }

  function generateOffers(completedRound) {
    const seed = createDeterministicSeed("lumi-shop", {
      roomId: state.pvpRoomId || "pve",
      round: completedRound,
      history: state.gameMode === "pvp"
        ? []
        : (state.lumiShopHistory || []).map((entry) => entry.productId),
    });
    const rng = createSeededRng(seed);
    const pool = eligibleProducts(completedRound).map((product) => structuredClone(product));
    const offers = [];
    while (pool.length && offers.length < offerCount()) {
      const product = pool.splice(rng.integer(pool.length), 1)[0];
      offers.push({
        ...product,
        basePrice: Math.max(0, Number(product.price) || 0),
        price: priceForRound(product, completedRound),
      });
    }
    state.lumiShopOfferSeed = seed;
    return offers;
  }

  function isPending() {
    return !state.lumiShopResolved && (state.lumiShopOffers || []).length > 0;
  }

  function selectionDurationMs() {
    return Math.max(5, Number(config.pvpRealtimeSelectionSeconds) || 30) * 1000;
  }

  function ensureDeadline() {
    if (state.gameMode !== "pvp" || !isPending()) return null;
    const deadline = new Date(state.lumiShopDeadline || "").getTime();
    if (Number.isFinite(deadline)) return deadline;
    const roomDeadline = new Date(state.pvpPhaseDeadline || "").getTime();
    if (state.pvpMode === "async" && !Number.isFinite(roomDeadline)) return null;
    state.lumiShopDeadline = new Date(
      state.pvpMode === "async" ? roomDeadline : Date.now() + selectionDurationMs(),
    ).toISOString();
    return new Date(state.lumiShopDeadline).getTime();
  }

  function openForRound(completedRound, { force = false } = {}) {
    const round = Number(completedRound) || 0;
    if (!force && !isTriggerRound(round)) return false;
    if (!force && (state.lumiShopHistory || []).some((entry) => Number(entry.round) === round)) return false;
    state.lumiShopRound = round;
    state.lumiShopOffers = generateOffers(round);
    state.lumiShopResolved = false;
    state.lumiShopPendingProductId = "";
    const roomDeadline = new Date(state.pvpPhaseDeadline || "").getTime();
    state.lumiShopDeadline = state.gameMode !== "pvp"
      ? null
      : state.pvpMode === "async" && Number.isFinite(roomDeadline)
        ? new Date(roomDeadline).toISOString()
        : state.pvpMode === "realtime"
          ? new Date(Date.now() + selectionDurationMs()).toISOString()
          : null;
    state.lumiShopOpen = true;
    addLog(`[루미 상점] ${round}라운드 상점이 열렸습니다.`);
    if (state.gameMode === "pvp" && prepareSharedOffers) {
      void prepareSharedOffers(round, state.lumiShopOffers.map((offer) => offer.id));
    }
    render();
    return true;
  }

  function reopen() {
    if (!isPending()) return false;
    state.lumiShopPendingProductId = "";
    state.lumiShopOpen = true;
    render();
    return true;
  }

  function close() {
    state.lumiShopOpen = false;
    render();
  }

  function finish(productId = "", label = "구매하지 않음") {
    state.lumiShopResolved = true;
    state.lumiShopOpen = false;
    state.lumiShopPendingProductId = "";
    state.lumiShopDeadline = null;
    state.lumiShopHistory = [
      ...(state.lumiShopHistory || []),
      { round: state.lumiShopRound, productId, label },
    ];
  }

  function skip() {
    if (!isPending()) return;
    finish();
    addLog(`[루미 상점] ${state.lumiShopRound}라운드 구매를 건너뛰었습니다.`);
    render();
  }

  function expireIfNeeded(now = Date.now()) {
    const deadline = ensureDeadline();
    if (!deadline || now < deadline) return false;
    const round = state.lumiShopRound;
    finish("", "시간 초과로 선택 포기");
    addLog(`[루미 상점] ${round}라운드 선택 시간이 끝나 자동으로 포기했습니다.`, { force: true });
    render();
    return true;
  }

  function resolveIfStale({ roomPhase = "", currentRound = 0, snapshotSubmitted = false } = {}) {
    if (state.gameMode !== "pvp" || !isPending()) return false;
    const shopRound = Number(state.lumiShopRound) || 0;
    const expectedPlanningRound = shopRound + 1;
    const stillSelecting = roomPhase === "planning"
      && Number(currentRound) === expectedPlanningRound
      && !snapshotSubmitted;
    if (stillSelecting) return false;
    finish("", "지난 라운드에서 자동 종료");
    addLog(`[루미 상점] ${shopRound}라운드의 오래된 선택 상태를 정리했습니다.`);
    render();
    return true;
  }

  function applyStats(unit, stats = {}) {
    if (!unit) return;
    for (const [stat, ratioValue] of Object.entries(stats)) {
      const ratio = Math.max(0, Number(ratioValue) || 0);
      if (!ratio) continue;
      if (stat === "maxHp") {
        const previousMax = Math.max(1, Number(unit.maxHp) || 1);
        unit.maxHp = Math.max(1, Math.round(previousMax * (1 + ratio)));
        unit.hp = Math.max(1, Math.round((Number(unit.hp) || previousMax) * (unit.maxHp / previousMax)));
      } else {
        unit[stat] = Math.max(0, Math.round((Number(unit[stat]) || 0) * (1 + ratio) * 100) / 100);
      }
    }
  }

  function canAfford(product) {
    if (state.gold >= Number(product.price || 0)) return true;
    addLog(`[루미 상점] ${product.name} 구매에 ${product.price}크레딧이 필요합니다.`);
    render();
    return false;
  }

  async function grantRandomUnit(product) {
    const candidates = roster.filter((unit) => Number(unit.cost) === Number(product.effect?.cost));
    if (!candidates.length) return false;
    const rng = createSeededRng(createDeterministicSeed("lumi-shop-unit", {
      seed: state.lumiShopOfferSeed,
      productId: product.id,
    }));
    const available = candidates.filter((base) => !ownedUnits().some((unit) => unit.name === base.name && unit.tier >= 3));
    const base = rng.choice(available.length ? available : candidates);
    return grantBonusUnit(base, { source: "lumi-shop", allowPoolExempt: true });
  }

  async function applyImmediateProduct(product) {
    const effect = product.effect || {};
    if (effect.type === "playerHeal") {
      const before = state.hp;
      state.hp = Math.min(Number(balance.player.startHp) || 100, state.hp + Math.max(0, Number(effect.amount) || 0));
      addLog(`[루미 상점] 플레이어 체력 ${state.hp - before} 회복.`);
      return true;
    }
    if (effect.type === "teamStat") {
      ownedUnits().forEach((unit) => applyStats(unit, effect.stats));
      return true;
    }
    if (effect.type === "randomUnit") return grantRandomUnit(product);
    if (effect.type === "nextAugmentRarity") {
      state.nextAugmentRarity = effect.rarity || "prismatic";
      return true;
    }
    if (effect.type === "nextAugmentChoiceBonus") {
      state.nextAugmentChoiceBonus = Math.max(0, Number(state.nextAugmentChoiceBonus) || 0)
        + Math.max(1, Number(effect.amount) || 1);
      return true;
    }
    if (effect.type === "nextAugmentRerollPerCardBonus") {
      state.nextAugmentRerollPerCardBonus = Math.max(0, Number(state.nextAugmentRerollPerCardBonus) || 0)
        + Math.max(1, Number(effect.amount) || 1);
      return true;
    }
    if (effect.type === "playerDeathGuard") {
      state.lumiIceShieldReady = true;
      return true;
    }
    return false;
  }

  async function buy(productId) {
    if (expireIfNeeded()) return false;
    if (!isPending() || state.busy || state.shopTransactionPending || !canModify()) return false;
    const product = (state.lumiShopOffers || []).find((offer) => offer.id === productId) || productsById.get(productId);
    if (!product || !canAfford(product)) return false;
    if (!isEnabledForCurrentMode(product)) return false;
    const soldOut = state.gameMode === "pvp"
      && (state.pvpLumiShopClaims || []).some((claim) => claim.product_id === product.id);
    if (soldOut) {
      addLog(`[루미 상점] ${product.name}은 이미 판매되었습니다.`);
      render();
      return false;
    }
    if (TARGET_EFFECTS.has(product.effect?.type)) {
      state.lumiShopPendingProductId = product.id;
      state.lumiShopOpen = false;
      state.selected = null;
      addLog(`[루미 상점] ${product.name}을 적용할 유닛을 선택하세요.`);
      render();
      return true;
    }

    state.shopTransactionPending = true;
    try {
      if (state.gameMode === "pvp" && claimSharedProduct
        && !(await claimSharedProduct(state.lumiShopRound, product.id))) return false;
      const applied = await applyImmediateProduct(product);
      if (!applied) return false;
      state.gold -= Number(product.price) || 0;
      finish(product.id, product.name);
      addLog(`[루미 상점] ${product.name} 구매 완료.`);
      render();
      return true;
    } finally {
      state.shopTransactionPending = false;
    }
  }

  async function selectTarget(source, index) {
    if (expireIfNeeded()) return false;
    const product = (state.lumiShopOffers || []).find((offer) => offer.id === state.lumiShopPendingProductId)
      || productsById.get(state.lumiShopPendingProductId);
    const unit = state[source]?.[index];
    if (!product || !unit || !["board", "bench"].includes(source) || !isPending()) return false;
    if (!canAfford(product)) return false;

    state.shopTransactionPending = true;
    try {
      if (state.gameMode === "pvp" && claimSharedProduct
        && !(await claimSharedProduct(state.lumiShopRound, product.id))) return false;
      let applied = false;
      if (product.effect?.type === "unitStat") {
        applyStats(unit, product.effect.stats);
        applied = true;
      } else if (product.effect?.type === "jokerUnit") {
        const base = roster.find((candidate) => candidate.name === unit.name);
        applied = await grantBonusUnit(base, { source: "lumi-shop-joker", allowPoolExempt: true });
      }
      if (!applied) return false;

      state.gold -= Number(product.price) || 0;
      finish(product.id, product.name);
      addLog(`[루미 상점] ${unit.name}에게 ${product.name} 적용 완료.`);
      render();
      return true;
    } finally {
      state.shopTransactionPending = false;
    }
  }

  function cancelTarget() {
    if (!state.lumiShopPendingProductId) return;
    state.lumiShopPendingProductId = "";
    state.lumiShopOpen = true;
    render();
  }

  state.lumiShopOffers = (state.lumiShopOffers || []).filter((offer) => {
    const definition = productsById.get(offer.id) || offer;
    return isEnabledForCurrentMode(definition);
  });

  return {
    buy,
    cancelTarget,
    close,
    expireIfNeeded,
    resolveIfStale,
    isPending,
    openForRound,
    reopen,
    selectTarget,
    skip,
  };
}
