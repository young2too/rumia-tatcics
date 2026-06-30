import { allRoster, traitRules } from "../core/data.js";
import { availableVersions, buildStatistics, rankingsForVersion } from "./aggregate.js";
import { clearRankingRecordsCache, currentRankingVersion, loadRankingRecords } from "../data/rankings.js";

const state = {
  rows: [],
  version: currentRankingVersion,
  query: "",
  loading: true,
  error: "",
  source: "",
  limit: 1000,
};

const refs = {
  versionFilter: document.querySelector("#versionFilter"),
  refresh: document.querySelector("#refreshStatistics"),
  status: document.querySelector("#statisticsStatus"),
  leader: document.querySelector("#leaderDeck"),
  summary: document.querySelector("#summaryMetrics"),
  unitSample: document.querySelector("#unitSampleText"),
  unitSearch: document.querySelector("#unitSearch"),
  units: document.querySelector("#unitStatistics"),
  traits: document.querySelector("#traitStatistics"),
  costs: document.querySelector("#costStatistics"),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatRate(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)}%`;
}

function renderVersionOptions() {
  const { versions, hasLegacy } = availableVersions(state.rows, currentRankingVersion);
  const options = [
    ...versions.map((version) => ({
      value: version,
      label: version === currentRankingVersion ? `현재 · ${version}` : version,
    })),
    ...(hasLegacy ? [{ value: "legacy", label: "레거시" }] : []),
    { value: "all", label: "통합" },
  ];

  if (!options.some((option) => option.value === state.version)) state.version = options[0]?.value || "all";
  refs.versionFilter.innerHTML = "";
  for (const option of options) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    refs.versionFilter.append(node);
  }
  refs.versionFilter.value = state.version;
}

function renderSummary(stats) {
  const items = [
    ["표본 랭킹", stats.totalRankings.toLocaleString("ko-KR"), "건"],
    ["평균 도달", stats.averageStage.toFixed(1), "라운드"],
    ["최고 기록", stats.bestStage.toLocaleString("ko-KR"), "라운드"],
    ["평균 편성", stats.averageBoardSize.toFixed(1), "기물"],
  ];
  refs.summary.innerHTML = items
    .map(([label, value, unit]) => `<article><span>${label}</span><strong>${value}</strong><small>${unit}</small></article>`)
    .join("");
}

function renderLeaderDeck(rows) {
  const leader = rows.slice().sort((a, b) => {
    if (a.stage !== b.stage) return b.stage - a.stage;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0];

  if (!leader) {
    refs.leader.innerHTML = `<div class="leader-empty">선택한 버전에 등록된 1위 기록이 없습니다.</div>`;
    return;
  }

  const units = leader.board.map((unit) => `
    <span class="leader-unit" style="--accent: ${escapeHtml(unit.color || "#6aa9ff")}" title="${escapeHtml(unit.name || "유닛")}">
      ${unit.art ? `<img src="${escapeHtml(unit.art)}" alt="">` : escapeHtml((unit.name || "?").slice(0, 1))}
      <i>${"★".repeat(Math.max(1, Math.min(3, Number(unit.tier) || 1)))}</i>
    </span>
  `).join("");

  const version = leader.rankingVersion || "레거시";
  refs.leader.innerHTML = `
    <header>
      <div>
        <span>선택 버전 1위</span>
        <strong>${escapeHtml(leader.name)}</strong>
      </div>
      <em>${escapeHtml(version)}</em>
      <b>${leader.stage.toLocaleString("ko-KR")}<small>라운드</small></b>
    </header>
    <div class="leader-board">${units}</div>
  `;
}

function renderUnits(stats) {
  const query = state.query.trim().toLocaleLowerCase("ko");
  const units = stats.units.filter((unit) => !query || unit.name.toLocaleLowerCase("ko").includes(query));
  refs.unitSample.textContent = `선택 버전 랭킹 ${stats.totalRankings}건 기준 · 한 덱에 포함되면 1회 채용으로 계산`;
  refs.units.innerHTML = units.length
    ? units.map((unit) => `
        <tr>
          <td>
            <span class="unit-identity" style="--accent: ${escapeHtml(unit.color)}">
              <span class="unit-portrait">${unit.art ? `<img src="${escapeHtml(unit.art)}" alt="">` : escapeHtml(unit.name.slice(0, 1))}</span>
              <span><strong>${escapeHtml(unit.name)}</strong><small>${unit.cost}코 · ${unit.picks}회 채용</small></span>
            </span>
          </td>
          <td>
            <span class="rate-cell"><strong>${formatRate(unit.pickRate)}</strong><i style="--rate: ${Math.min(100, unit.pickRate)}%"></i></span>
          </td>
          <td>${formatRate(unit.tierThreeRate)}</td>
          <td>${unit.averageStage.toFixed(1)}R</td>
        </tr>
      `).join("")
    : `<tr><td colspan="4" class="empty-row">표시할 유닛이 없습니다.</td></tr>`;
}

function renderTraits(stats) {
  const visible = stats.traits.filter((trait) => trait.activations > 0 || trait.unitTotal > 0);
  refs.traits.innerHTML = visible.length
    ? visible.map((trait) => `
        <div class="bar-item">
          <div><strong>${escapeHtml(trait.name)}</strong><span>${formatRate(trait.activationRate)}</span></div>
          <i><b style="--rate: ${Math.min(100, trait.activationRate)}%"></b></i>
          <small>활성 ${trait.activations}회 · 평균 ${trait.averageUnits.toFixed(1)}기물</small>
        </div>
      `).join("")
    : `<p class="empty-message">활성화된 시너지 기록이 없습니다.</p>`;
}

function renderCosts(stats) {
  refs.costs.innerHTML = stats.costs.map((cost) => `
    <div class="bar-item cost-${cost.cost}">
      <div><strong>${cost.cost}코스트</strong><span>${formatRate(cost.rate)}</span></div>
      <i><b style="--rate: ${Math.min(100, cost.rate)}%"></b></i>
      <small>${cost.count.toLocaleString("ko-KR")}기물</small>
    </div>
  `).join("");
}

function render() {
  refs.refresh.disabled = state.loading;
  refs.versionFilter.disabled = state.loading;
  refs.unitSearch.disabled = state.loading;
  renderVersionOptions();

  const selectedRows = rankingsForVersion(state.rows, state.version);
  const stats = buildStatistics(selectedRows, allRoster, traitRules);
  renderLeaderDeck(selectedRows);
  renderSummary(stats);
  renderUnits(stats);
  renderTraits(stats);
  renderCosts(stats);

  if (state.loading) {
    refs.status.className = "statistics-status loading";
    refs.status.textContent = "랭킹 데이터를 불러오는 중입니다.";
  } else if (state.error) {
    refs.status.className = "statistics-status error";
    refs.status.textContent = state.error;
  } else {
    const source = state.source === "cache" ? "캐시" : state.source === "local" ? "로컬 기록" : "서버 랭킹";
    const limited = state.rows.length >= state.limit ? ` · 최근 ${state.limit.toLocaleString("ko-KR")}건` : "";
    refs.status.className = "statistics-status ready";
    refs.status.textContent = `${source} ${state.rows.length.toLocaleString("ko-KR")}건 집계${limited}`;
  }
}

async function load({ force = false } = {}) {
  state.loading = true;
  state.error = "";
  render();
  try {
    const result = await loadRankingRecords({ force });
    state.rows = result.rows;
    state.source = result.source;
    state.limit = result.limit;
  } catch (error) {
    state.rows = [];
    state.error = "통계 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
    console.warn(error);
  } finally {
    state.loading = false;
    render();
  }
}

refs.versionFilter.addEventListener("change", () => {
  state.version = refs.versionFilter.value;
  const url = new URL(window.location.href);
  url.searchParams.set("version", state.version);
  history.replaceState(null, "", url);
  render();
});

refs.unitSearch.addEventListener("input", () => {
  state.query = refs.unitSearch.value;
  render();
});

refs.refresh.addEventListener("click", () => {
  clearRankingRecordsCache();
  load({ force: true });
});

const requestedVersion = new URL(window.location.href).searchParams.get("version");
if (requestedVersion) state.version = requestedVersion;
load();
