// 루미 상점 뷰: 상점 모달, 상품 카드와 대상 선택 안내를 렌더링합니다.
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createLumiShopView({ state, refs }) {
  function deadlineLabel(remainingSeconds, realtime) {
    if (realtime || remainingSeconds < 3600) {
      return `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;
    }
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.ceil((remainingSeconds % 3600) / 60);
    return `${hours}시간 ${minutes}분`;
  }

  function renderPvpPlayers() {
    const players = (state.pvpPlayers || [])
      .filter((player) => player.status === "active")
      .slice()
      .sort((left, right) => Number(left.health) - Number(right.health) || Number(left.seat) - Number(right.seat));
    if (!players.length) return "";
    return `
      <section class="pvp-lumi-roster">
        <header><strong>참가자 현황</strong><span>체력이 낮은 순</span></header>
        <div>
          ${players.map((player, index) => `
            <article class="${player.id === state.pvpOwnPlayerId ? "mine" : ""}">
              <i>${index + 1}</i>
              <span>${escapeHtml(String(player.nickname || `플레이어 ${player.seat}`).slice(0, 1))}</span>
              <div><strong>${escapeHtml(player.nickname || `플레이어 ${player.seat}`)}</strong><small>체력 ${Math.max(0, Number(player.health) || 0)}</small></div>
              ${player.id === state.pvpOwnPlayerId ? "<b>나</b>" : ""}
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function render() {
    if (!refs.lumiShopModal) return;
    if (refs.lumiShopBuff) refs.lumiShopBuff.hidden = !state.lumiIceShieldReady || Boolean(state.combatGrid);
    refs.lumiShopModal.hidden = !state.lumiShopOpen;
    const pendingProduct = (state.lumiShopOffers || []).find((offer) => offer.id === state.lumiShopPendingProductId);
    if (refs.lumiShopResumeCenter) {
      refs.lumiShopResumeCenter.hidden = state.busy || state.combatGrid || state.lumiShopResolved;
      refs.lumiShopResumeCenter.textContent = pendingProduct ? `${pendingProduct.name} 대상 선택` : "루미 상점";
      refs.lumiShopResumeCenter.classList.toggle("targeting", Boolean(pendingProduct));
    }
    if (!state.lumiShopOpen) return;

    const pvpShop = state.gameMode === "pvp";
    refs.lumiShopModal.classList.toggle("pvp-mode", pvpShop);
    refs.lumiShopTitle.textContent = pvpShop
      ? `${state.lumiShopRound || "-"}라운드 공동 루미 상점`
      : `${state.lumiShopRound || "-"}라운드 루미 상점`;
    refs.lumiShopGold.textContent = String(Math.max(0, Math.floor(Number(state.gold) || 0)));
    const realtimeShop = pvpShop && state.pvpMode === "realtime";
    const deadline = new Date(state.lumiShopDeadline || "").getTime();
    const remainingSeconds = Number.isFinite(deadline)
      ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      : 0;
    if (refs.lumiShopTimer) {
      refs.lumiShopTimer.hidden = !pvpShop || !Number.isFinite(deadline);
      refs.lumiShopTimer.textContent = `자동 포기까지 ${deadlineLabel(remainingSeconds, realtimeShop)}`;
      refs.lumiShopTimer.classList.toggle("urgent", remainingSeconds <= 10);
    }
    const timeoutNotice = pvpShop && Number.isFinite(deadline) ? " 제한시간이 끝나면 자동으로 포기합니다." : "";
    refs.lumiShopMeta.textContent = state.gameMode === "pvp"
      ? Number(state.lumiShopRound) === 5
        ? `첫 루미 상점입니다. 원하는 상품 하나를 무료로 선택하세요.${timeoutNotice}`
        : Number(state.lumiShopRound) === 15
          ? `중반 루미 상점입니다. 모든 상품을 정상가의 절반에 구매할 수 있습니다.${timeoutNotice}`
          : `체력이 낮은 플레이어부터 상품을 선택합니다. 상품은 한 번만 구매할 수 있습니다.${timeoutNotice}`
      : "이번 방문에서 상품 하나를 구매할 수 있습니다.";
    const products = (state.lumiShopOffers || []).map((product, index) => {
      const affordable = state.gold >= Number(product.price || 0);
      const claim = pvpShop
        ? (state.pvpLumiShopClaims || []).find((entry) => entry.product_id === product.id)
        : null;
      const soldOut = Boolean(claim);
      const buyer = soldOut
        ? (state.pvpPlayers || []).find((player) => player.id === claim.player_id)
        : null;
      return `
        <article class="lumi-product ${soldOut ? "sold-out" : affordable ? "available" : "unaffordable"}" style="--product-index:${index}">
          ${soldOut ? '<div class="lumi-sold-mark" aria-hidden="true"><i></i><i></i></div>' : ""}
          <span>${escapeHtml(product.category || "상품")}</span>
          <strong>${escapeHtml(product.name)}</strong>
          <p>${escapeHtml(product.summary)}</p>
          <button type="button" data-lumi-product-id="${escapeHtml(product.id)}" ${affordable && !soldOut ? "" : "disabled"}>
            ${soldOut ? `SOLD OUT${buyer ? ` · ${escapeHtml(buyer.nickname)}` : ""}` : Number(product.price) === 0 ? "구입 (무료)" : `구입 (<b>${escapeHtml(product.price)}</b>크레딧)`}
          </button>
        </article>
      `;
    }).join("");
    refs.lumiShopPanel.innerHTML = `${pvpShop ? renderPvpPlayers() : ""}${products}`;
    if (refs.lumiShopSkip) refs.lumiShopSkip.textContent = pvpShop ? "이번 선택 포기" : "이번 상점 건너뛰기";
  }

  return { render };
}
