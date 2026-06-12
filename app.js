const roster = [
  { name: "재키", cost: 2, role: "난투", weapon: "도끼", trait: "맹공", color: "#ef5a56", hp: 104, atk: 24, speed: 1.02, skillAmp: 12, defense: 7, skill: "처치 시 공격력 증가" },
  { name: "아야", cost: 2, role: "사격", weapon: "권총", trait: "정밀", color: "#6aa9ff", hp: 82, atk: 28, speed: 1.1, skillAmp: 9, defense: 3, skill: "첫 공격 치명타" },
  { name: "현우", cost: 1, role: "방패", weapon: "글러브", trait: "수호", color: "#75c878", hp: 122, atk: 17, speed: 0.92, skillAmp: 5, defense: 12, skill: "전투 시작 보호막" },
  { name: "혜진", cost: 3, role: "술법", weapon: "활", trait: "주술", color: "#aa89ff", hp: 76, atk: 20, speed: 0.96, skillAmp: 24, defense: 2, skill: "적 전체 약화" },
  { name: "유키", cost: 3, role: "검객", weapon: "양손검", trait: "결투", color: "#f0bd54", hp: 96, atk: 31, speed: 1.0, skillAmp: 10, defense: 6, skill: "단일 대상 추가 피해" },
  { name: "하트", cost: 2, role: "지원", weapon: "기타", trait: "리듬", color: "#ff8ec7", hp: 84, atk: 15, speed: 1.04, skillAmp: 18, defense: 4, skill: "아군 회복" },
  { name: "쇼이치", cost: 3, role: "암살", weapon: "단검", trait: "기습", color: "#d0d4d8", hp: 78, atk: 34, speed: 1.16, skillAmp: 12, defense: 3, skill: "후열 공격" },
  { name: "리다이린", cost: 2, role: "난투", weapon: "쌍절곤", trait: "맹공", color: "#e4824d", hp: 98, atk: 23, speed: 1.14, skillAmp: 8, defense: 6, skill: "연속 타격" },
  { name: "시셀라", cost: 4, role: "술법", weapon: "투척", trait: "주술", color: "#8ed8ff", hp: 70, atk: 17, speed: 0.98, skillAmp: 31, defense: 1, skill: "체력이 낮을수록 강함" },
  { name: "레녹스", cost: 3, role: "방패", weapon: "채찍", trait: "수호", color: "#39c0a2", hp: 132, atk: 19, speed: 0.9, skillAmp: 8, defense: 14, skill: "받는 피해 감소" },
  { name: "로지", cost: 2, role: "사격", weapon: "권총", trait: "정밀", color: "#ff7c76", hp: 80, atk: 25, speed: 1.22, skillAmp: 9, defense: 3, skill: "공격 속도 증가" },
  { name: "마이", cost: 2, role: "지원", weapon: "채찍", trait: "리듬", color: "#d9b06f", hp: 92, atk: 16, speed: 0.96, skillAmp: 17, defense: 8, skill: "아군 방어력 증가" },
  { name: "엘레나", cost: 3, role: "검객", weapon: "레이피어", trait: "결투", color: "#91d5f6", hp: 94, atk: 27, speed: 1.08, skillAmp: 15, defense: 6, skill: "빙결 일격" },
  { name: "아이작", cost: 4, role: "암살", weapon: "톤파", trait: "기습", color: "#9c8174", hp: 88, atk: 37, speed: 1.08, skillAmp: 14, defense: 5, skill: "약한 적 마무리" },
  { name: "프리야", cost: 3, role: "지원", weapon: "기타", trait: "리듬", color: "#98db85", hp: 86, atk: 14, speed: 1.0, skillAmp: 25, defense: 4, skill: "전투 중 재생" },
  { name: "헤이즈", cost: 4, role: "사격", weapon: "돌격소총", trait: "정밀", color: "#ffb15f", hp: 84, atk: 32, speed: 1.12, skillAmp: 18, defense: 4, skill: "광역 탄막" },
  { name: "클로에", cost: 5, role: "술법", weapon: "암기", trait: "주술", color: "#d8c3b8", hp: 78, atk: 22, speed: 1.02, skillAmp: 38, defense: 3, skill: "인형과 함께 큰 피해" },
];

roster.push(
  { name: "피오라", cost: 1, role: "검객", weapon: "레이피어", trait: "결투", color: "#c7d8ef", hp: 88, atk: 22, speed: 1.08, skillAmp: 9, defense: 5, skill: "찌르기 연계", artFile: "005_Fiora.png" },
  { name: "나딘", cost: 1, role: "사격", weapon: "석궁", trait: "정밀", color: "#89b97a", hp: 74, atk: 24, speed: 1.06, skillAmp: 8, defense: 3, skill: "야성 중첩", artFile: "006_Nadine.png" },
  { name: "쇼우", cost: 1, role: "난투", weapon: "창", trait: "맹공", color: "#db8d4d", hp: 106, atk: 19, speed: 0.94, skillAmp: 10, defense: 8, skill: "뜨거운 한방", artFile: "013_Xiukai.png" },
  { name: "매그너스", cost: 1, role: "방패", weapon: "망치", trait: "수호", color: "#7b8a93", hp: 128, atk: 18, speed: 0.88, skillAmp: 5, defense: 13, skill: "몸통 박치기", artFile: "004_Magnus.png" },
  { name: "자히르", cost: 2, role: "술법", weapon: "투척", trait: "주술", color: "#6fbcc2", hp: 72, atk: 17, speed: 1.0, skillAmp: 25, defense: 2, skill: "차크람 폭풍", artFile: "007_Zahir.png" },
  { name: "키아라", cost: 2, role: "난투", weapon: "레이피어", trait: "맹공", color: "#b35d7a", hp: 98, atk: 24, speed: 1.02, skillAmp: 13, defense: 6, skill: "집착의 낙인", artFile: "015_Chiara.png" },
  { name: "루크", cost: 2, role: "암살", weapon: "방망이", trait: "기습", color: "#d8c65d", hp: 86, atk: 29, speed: 1.1, skillAmp: 8, defense: 4, skill: "청소 완료", artFile: "022_Luke.png" },
  { name: "캐시", cost: 2, role: "지원", weapon: "단검", trait: "리듬", color: "#f08da4", hp: 84, atk: 18, speed: 1.04, skillAmp: 20, defense: 5, skill: "응급 처치", artFile: "023_Cathy.png" },
  { name: "실비아", cost: 2, role: "사격", weapon: "권총", trait: "정밀", color: "#f2c15e", hp: 78, atk: 25, speed: 1.14, skillAmp: 10, defense: 3, skill: "기동 사격", artFile: "018_Silvia.png" },
  { name: "엠마", cost: 2, role: "술법", weapon: "암기", trait: "주술", color: "#c393ef", hp: 76, atk: 16, speed: 1.0, skillAmp: 26, defense: 2, skill: "마술 모자", artFile: "019_Emma.png" },
  { name: "버니스", cost: 3, role: "사격", weapon: "저격총", trait: "정밀", color: "#a97b55", hp: 86, atk: 32, speed: 0.96, skillAmp: 12, defense: 4, skill: "덫 사격", artFile: "025_Bernice.png" },
  { name: "바바라", cost: 3, role: "술법", weapon: "방망이", trait: "주술", color: "#83b8e8", hp: 82, atk: 18, speed: 0.94, skillAmp: 29, defense: 5, skill: "센트리 건", artFile: "026_Barbara.png" },
  { name: "알렉스", cost: 3, role: "암살", weapon: "톤파", trait: "기습", color: "#8494a8", hp: 88, atk: 30, speed: 1.12, skillAmp: 13, defense: 5, skill: "잠입 전술", artFile: "027_Alex.png" },
  { name: "수아", cost: 3, role: "지원", weapon: "망치", trait: "리듬", color: "#b5a6f2", hp: 90, atk: 17, speed: 1.0, skillAmp: 26, defense: 6, skill: "책갈피 보호", artFile: "028_Sua.png" },
  { name: "레온", cost: 3, role: "난투", weapon: "글러브", trait: "맹공", color: "#59b8d0", hp: 106, atk: 27, speed: 1.06, skillAmp: 10, defense: 7, skill: "파도타기", artFile: "029_Leon.png" },
  { name: "일레븐", cost: 3, role: "방패", weapon: "망치", trait: "수호", color: "#f0a5b8", hp: 134, atk: 20, speed: 0.9, skillAmp: 12, defense: 13, skill: "버거 타임", artFile: "030_Eleven.png" },
  { name: "리오", cost: 3, role: "사격", weapon: "활", trait: "정밀", color: "#9fd274", hp: 80, atk: 29, speed: 1.16, skillAmp: 11, defense: 3, skill: "쌍궁 전환", artFile: "031_Rio.png" },
  { name: "니키", cost: 3, role: "난투", weapon: "글러브", trait: "맹공", color: "#e26e6e", hp: 102, atk: 28, speed: 1.08, skillAmp: 9, defense: 7, skill: "가드 카운터", artFile: "033_Nicky.png" },
  { name: "마커스", cost: 4, role: "방패", weapon: "도끼", trait: "수호", color: "#8f7767", hp: 146, atk: 24, speed: 0.88, skillAmp: 10, defense: 16, skill: "전장 돌파", artFile: "053_Markus.png" },
  { name: "카밀로", cost: 4, role: "검객", weapon: "레이피어", trait: "결투", color: "#e0a15e", hp: 96, atk: 34, speed: 1.16, skillAmp: 13, defense: 6, skill: "춤추는 검", artFile: "039_Camilo.png" },
  { name: "비앙카", cost: 4, role: "술법", weapon: "아르카나", trait: "주술", color: "#d184a8", hp: 84, atk: 18, speed: 0.98, skillAmp: 34, defense: 4, skill: "흡혈 의식", artFile: "042_Bianca.png" },
  { name: "셀린", cost: 4, role: "술법", weapon: "투척", trait: "주술", color: "#f08b63", hp: 82, atk: 20, speed: 1.0, skillAmp: 33, defense: 3, skill: "폭발 설치", artFile: "043_Celine.png" },
  { name: "에키온", cost: 4, role: "난투", weapon: "VF의수", trait: "맹공", color: "#7bd0b0", hp: 112, atk: 31, speed: 1.08, skillAmp: 15, defense: 8, skill: "폭주", artFile: "044_Echion.png" },
  { name: "띠아", cost: 4, role: "지원", weapon: "방망이", trait: "리듬", color: "#f0d36f", hp: 86, atk: 16, speed: 1.04, skillAmp: 31, defense: 4, skill: "색채 보호", artFile: "048_Tia.png" },
  { name: "아디나", cost: 4, role: "술법", weapon: "아르카나", trait: "주술", color: "#86a7ef", hp: 80, atk: 17, speed: 1.0, skillAmp: 36, defense: 3, skill: "천체 배열", artFile: "052_Adina.png" },
  { name: "에스텔", cost: 4, role: "방패", weapon: "도끼", trait: "수호", color: "#e67b5a", hp: 138, atk: 22, speed: 0.92, skillAmp: 14, defense: 15, skill: "소방 진압", artFile: "055_Estelle.png" },
  { name: "칼라", cost: 4, role: "사격", weapon: "석궁", trait: "정밀", color: "#78c6d0", hp: 82, atk: 33, speed: 1.1, skillAmp: 15, defense: 4, skill: "갈고리 사격", artFile: "054_Karla.png" },
  { name: "아비게일", cost: 5, role: "암살", weapon: "도끼", trait: "기습", color: "#bd6c94", hp: 96, atk: 42, speed: 1.14, skillAmp: 18, defense: 7, skill: "차원 절단", artFile: "067_Abigail.png" },
  { name: "케네스", cost: 5, role: "난투", weapon: "도끼", trait: "맹공", color: "#b9814f", hp: 124, atk: 39, speed: 1.02, skillAmp: 16, defense: 10, skill: "불굴의 돌진", artFile: "071_Kenneth.png" },
  { name: "샬럿", cost: 5, role: "지원", weapon: "아르카나", trait: "리듬", color: "#f3c7d7", hp: 90, atk: 18, speed: 1.02, skillAmp: 40, defense: 5, skill: "빛의 축복", artFile: "073_Charlotte.png" }
);

const costOverridesByColor = {
  "#ef5a56": 1,
  "#75c878": 1,
  "#e4824d": 1,
  "#ff7c76": 1,
  "#6aa9ff": 2,
  "#ff8ec7": 2,
  "#39c0a2": 2,
  "#d9b06f": 2,
  "#aa89ff": 3,
  "#f0bd54": 3,
  "#91d5f6": 3,
  "#98db85": 3,
  "#d0d4d8": 4,
  "#8ed8ff": 4,
  "#ffb15f": 4,
  "#9c8174": 5,
  "#d8c3b8": 5,
};

const artByColor = {
  "#ef5a56": "001_Jackie.png",
  "#6aa9ff": "002_Aya.png",
  "#75c878": "003_Hyunwoo.png",
  "#aa89ff": "012_Hyejin.png",
  "#f0bd54": "011_Yuki.png",
  "#ff8ec7": "008_Hart.png",
  "#d0d4d8": "017_Shoichi.png",
  "#e4824d": "010_Li_Dailin.png",
  "#8ed8ff": "014_Sissela.png",
  "#39c0a2": "020_Lenox.png",
  "#ff7c76": "021_Rozzi.png",
  "#d9b06f": "045_Mai.png",
  "#91d5f6": "050_Elena.png",
  "#9c8174": "059_Isaac.png",
  "#98db85": "051_Priya.png",
  "#ffb15f": "058_Haze.png",
  "#d8c3b8": "040_Chloe.png",
};

for (const unit of roster) {
  unit.cost = costOverridesByColor[unit.color] || unit.cost;
  unit.art = unit.artFile ? `./assets/characters/${unit.artFile}` : artByColor[unit.color] ? `./assets/characters/${artByColor[unit.color]}` : "";
}

const balance = {
  tier: {
    hp: [1, 1.62, 2.55],
    atk: [1, 1.55, 2.35],
    skillAmp: [1, 1.5, 2.25],
    defense: [1, 1.35, 1.9],
    costBonus: [0, 2, 5],
  },
  shop: {
    baseSize: 3,
    maxSize: 5,
    rerollCost: 2,
    locked: false,
    stockByCost: { 1: 29, 2: 22, 3: 18, 4: 10, 5: 9 },
    costOdds: {
      1: [100, 0, 0, 0, 0],
      2: [80, 20, 0, 0, 0],
      3: [75, 25, 0, 0, 0],
      4: [55, 30, 15, 0, 0],
      5: [45, 33, 20, 2, 0],
      6: [30, 40, 25, 5, 0],
      7: [19, 30, 40, 10, 1],
      8: [15, 20, 32, 30, 3],
      9: [10, 17, 25, 33, 15],
    },
  },
  player: {
    startHp: 100,
    startGold: 8,
    maxLevel: 9,
    levelXp: [0, 2, 6, 10, 20, 36, 48, 76, 80],
    combatXp: 2,
    buyXpCost: 4,
    buyXpAmount: 4,
  },
  battle: {
    columns: 8,
    enemySlots: 16,
    meleeRange: 1,
    rangedRange: 4,
    baseIncome: 5,
    winIncome: 1,
    maxInterest: 5,
    interestStep: 10,
    enemyEarlyHpScale: 0.34,
    enemyEarlyAtkScale: 0.3,
    enemyScaleGrowth: 0.045,
    tickMs: 520,
    maxTicks: 32,
    manaPerAttack: 34,
    manaPerHit: 16,
    basicDamageMultiplier: 0.68,
    hpWeight: 0.32,
    atkWeight: 4,
    skillWeight: 1.4,
    defenseWeight: 2.6,
    supportBonus: 14,
    tankHpWeight: 0.16,
    tierWeight: 10,
    varianceMin: 0.92,
    varianceMax: 1.12,
  },
};

const traitRules = {
  "맹공": { need: 2, text: "난투형 공격력 +18%", apply: (s) => (s.atk *= 1.18) },
  "정밀": { need: 2, text: "사격형 치명 기대값 +22%", apply: (s) => (s.atk *= 1.22) },
  "수호": { need: 2, text: "방패형 체력 +24%", apply: (s) => (s.hp *= 1.24) },
  "주술": { need: 2, text: "술법형 스킬 피해 +25%", apply: (s) => (s.skillAmp *= 1.25) },
  "결투": { need: 2, text: "검객형 공격 속도 +20%", apply: (s) => (s.speed *= 1.2) },
  "리듬": { need: 2, text: "지원형 회복량 +35%", apply: (s) => (s.heal *= 1.35) },
  "기습": { need: 2, text: "암살형 첫 피해 +30%", apply: (s) => (s.atk *= 1.3) },
};

const state = {
  round: 1,
  hp: balance.player.startHp,
  gold: balance.player.startGold,
  level: 1,
  xp: 0,
  shop: [],
  pool: createUnitPool(),
  combatGrid: null,
  shopLocked: balance.shop.locked,
  oddsOpen: false,
  streakType: null,
  streakCount: 0,
  lastIncome: 0,
  bench: Array(8).fill(null),
  board: Array(32).fill(null),
  enemies: [],
  dragging: null,
  selected: null,
  busy: false,
};

const $ = (id) => document.getElementById(id);
const refs = {
  round: $("round"),
  hp: $("hp"),
  gold: $("gold"),
  streak: $("streak"),
  income: $("income"),
  level: $("level"),
  levelXp: $("levelXp"),
  levelXpBar: $("levelXpBar"),
  levelUp: $("levelUp"),
  shop: $("shop"),
  oddsToggle: $("oddsToggle"),
  oddsPopover: $("oddsPopover"),
  shopLock: $("shopLock"),
  shopOdds: $("shopOdds"),
  board: $("board"),
  enemyBoard: $("enemyBoard"),
  bench: $("bench"),
  benchCount: $("benchCount"),
  traits: $("traits"),
  log: $("log"),
  phase: $("phase"),
  unitDetail: $("unitDetail"),
  detailTier: $("detailTier"),
  sellUnit: $("sellUnit"),
};

function makeUnit(base, tier = 1) {
  const tierIndex = tier - 1;
  return {
    ...base,
    id: crypto.randomUUID(),
    tier,
    cost: base.cost,
    maxHp: Math.round(base.hp * balance.tier.hp[tierIndex]),
    hp: Math.round(base.hp * balance.tier.hp[tierIndex]),
    atk: Math.round(base.atk * balance.tier.atk[tierIndex]),
    speed: base.speed,
    skillAmp: Math.round(base.skillAmp * balance.tier.skillAmp[tierIndex]),
    defense: Math.round(base.defense * balance.tier.defense[tierIndex]),
  };
}

function createUnitPool() {
  return Object.fromEntries(roster.map((unit) => [unit.name, balance.shop.stockByCost[unit.cost] || 0]));
}

function sample(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedCostForLevel(level) {
  const odds = balance.shop.costOdds[level] || balance.shop.costOdds[balance.player.maxLevel];
  const roll = Math.random() * 100;
  let sum = 0;
  for (let i = 0; i < odds.length; i++) {
    sum += odds[i];
    if (roll < sum) return i + 1;
  }
  return 1;
}

function ownedThreeStarNames() {
  return new Set([...state.bench, ...state.board].filter((unit) => unit?.tier >= 3).map((unit) => unit.name));
}

function canAppearInShop(unit) {
  return (state.pool[unit.name] || 0) > 0 && !ownedThreeStarNames().has(unit.name);
}

function availableRosterByCost(cost) {
  return roster.filter((unit) => unit.cost === cost && canAppearInShop(unit));
}

function pickShopUnitBase() {
  const preferredCost = weightedCostForLevel(state.level);
  const preferred = availableRosterByCost(preferredCost);
  if (preferred.length) return sample(preferred);

  const odds = balance.shop.costOdds[state.level] || balance.shop.costOdds[balance.player.maxLevel];
  const fallbackCosts = odds
    .map((chance, index) => ({ cost: index + 1, chance }))
    .filter((entry) => entry.chance > 0)
    .sort((a, b) => b.chance - a.chance)
    .map((entry) => entry.cost);
  for (const cost of fallbackCosts) {
    const available = availableRosterByCost(cost);
    if (available.length) return sample(available);
  }
  return sample(roster.filter(canAppearInShop));
}

function pruneShopForOwnedThreeStars() {
  const blocked = ownedThreeStarNames();
  if (!blocked.size) return;
  state.shop = state.shop.filter((unit) => !blocked.has(unit.name));
}

function rollShop() {
  const size = Math.min(balance.shop.maxSize, balance.shop.baseSize + state.level);
  state.shop = Array.from({ length: size }, () => {
    const base = pickShopUnitBase();
    return base ? makeUnit(base, 1) : null;
  }).filter(Boolean);
  render();
}

function addLog(text) {
  const item = document.createElement("div");
  item.textContent = text;
  refs.log.prepend(item);
  while (refs.log.children.length > 9) refs.log.lastChild.remove();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boardUnits() {
  return state.board.filter(Boolean);
}

function selectedUnit() {
  if (!state.selected) return null;
  const arr = state[state.selected.source];
  const unit = arr?.[state.selected.index] || null;
  if (!unit) state.selected = null;
  return unit;
}

function xpToNextLevel() {
  return balance.player.levelXp[state.level] || 0;
}

function levelXpLabel() {
  if (state.level >= balance.player.maxLevel) return "MAX";
  return `${state.xp} / ${xpToNextLevel()} XP`;
}

function boardLimit() {
  return state.level;
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

function unitCopyCount(unit) {
  return unit.tier === 3 ? 9 : unit.tier === 2 ? 3 : 1;
}

function sellValue(unit) {
  return unit.cost * unitCopyCount(unit);
}

function ownedCopies(name, tier) {
  return [...state.bench, ...state.board].filter((unit) => unit?.name === name && unit.tier === tier);
}

function canBuyIntoImmediateCombine(unit) {
  return unit?.tier === 1 && ownedCopies(unit.name, 1).length >= 2;
}

function forceCombinePurchasedUnit(unit) {
  let removed = 0;
  let firstRemoved = null;
  for (const arr of [state.bench, state.board]) {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i]?.name === unit.name && arr[i]?.tier === unit.tier && removed < 2) {
        if (!firstRemoved) firstRemoved = { arr, index: i };
        arr[i] = null;
        removed++;
      }
    }
  }

  if (removed < 2 || !firstRemoved) return false;
  firstRemoved.arr[firstRemoved.index] = makeUnit(roster.find((base) => base.name === unit.name), unit.tier + 1);
  addLog(`${unit.name} ${unit.tier + 1}성 합성!`);
  return true;
}

function stockLimit(unit) {
  return balance.shop.stockByCost[unit.cost] || 0;
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

function activeTraits() {
  const counts = {};
  for (const unit of boardUnits()) counts[unit.trait] = (counts[unit.trait] || 0) + 1;
  return counts;
}

function applySynergy(unit, counts) {
  const stats = {
    hp: unit.maxHp,
    atk: unit.atk,
    speed: unit.speed,
    skillAmp: unit.skillAmp,
    defense: unit.defense,
    heal: 1,
  };
  const rule = traitRules[unit.trait];
  if (rule && counts[unit.trait] >= rule.need) rule.apply(stats);
  return stats;
}

function unitNode(unit, source, index, compact = false) {
  const tpl = document.getElementById("unitTemplate");
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.source = source;
  node.dataset.index = String(index);
  node.dataset.unitId = unit.id;
  if (state.selected?.source === source && state.selected?.index === index) node.classList.add("selected");
  if (unit.status) node.classList.add(unit.status);
  if (unit.hp <= 0) node.classList.add("dead");
  node.style.setProperty("--accent", unit.color);
  node.style.setProperty("--hp", `${Math.max(0, Math.round((unit.hp / unit.maxHp) * 100))}%`);
  node.style.setProperty("--mana", `${Math.max(0, Math.min(100, Math.round(unit.mana || 0)))}%`);
  node.querySelector(".portrait").innerHTML = unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1);
  node.querySelector(".name").textContent = unit.name;
  node.querySelector(".meta").textContent = compact ? unit.role : `${unit.role} · ${unit.trait}`;
  node.querySelector(".stars").textContent = "★".repeat(unit.tier);
  node.title = `${unit.weapon} | HP ${unit.maxHp} / 공격 ${unit.atk} / 공속 ${unit.speed} / 스증 ${unit.skillAmp} / 방어 ${unit.defense} | ${unit.skill}`;
  node.addEventListener("dragstart", () => {
    state.dragging = { source, index };
    document.body.classList.add("dragging-unit");
    node.classList.add("dragging");
  });
  node.addEventListener("dragend", () => {
    state.dragging = null;
    document.body.classList.remove("dragging-unit");
    node.classList.remove("dragging");
    document.querySelectorAll(".can-drop").forEach((el) => el.classList.remove("can-drop"));
  });
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    if (source === "enemy" || state.busy) return;
    const alreadySelected = state.selected?.source === source && state.selected?.index === index;
    state.selected = alreadySelected ? null : { source, index };
    render();
  });
  return node;
}

function renderShop() {
  refs.shop.innerHTML = "";
  for (const [index, unit] of state.shop.entries()) {
    const card = document.createElement("button");
    card.className = "shop-card";
    card.style.setProperty("--accent", unit.color);
    card.innerHTML = `
      <span class="portrait">${unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1)}</span>
      <span><strong>${unit.name}</strong><small>${unit.role} · ${unit.trait} · HP ${unit.maxHp} / 공격 ${unit.atk} / 스증 ${unit.skillAmp}</small></span>
      <span class="price"><b>${unit.cost}코</b><small>풀 ${state.pool[unit.name] ?? 0}</small></span>
    `;
    card.addEventListener("click", () => buyUnit(index));
    refs.shop.append(card);
  }
}

function renderShopOdds() {
  const header = `
    <span>Lv</span>
    ${[1, 2, 3, 4, 5].map((cost) => `<span>${cost}코<small>${balance.shop.stockByCost[cost]}</small></span>`).join("")}
  `;
  const rows = Object.entries(balance.shop.costOdds)
    .map(([level, odds]) => {
      const isActive = Number(level) === state.level;
      return `
        <div class="odds-row ${isActive ? "active" : ""}">
          <span>Lv.${level}</span>
          ${odds.map((chance) => `<strong>${chance}%</strong>`).join("")}
        </div>
      `;
    })
    .join("");
  refs.shopOdds.innerHTML = `<div class="odds-head">${header}</div>${rows}`;
}

function renderBoard() {
  refs.board.innerHTML = "";
  const visibleBoard = state.combatGrid ? state.combatGrid.slice(16, 48) : state.board;
  visibleBoard.forEach((unit, index) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    if (state.combatGrid && unit) cell.classList.add("occupied", "ally");
    cell.dataset.index = String(index);
    cell.dataset.row = String(Math.floor(index / balance.battle.columns));
    cell.dataset.col = String(index % balance.battle.columns);
    cell.addEventListener("dragover", (event) => {
      event.preventDefault();
      cell.classList.add("can-drop");
    });
    cell.addEventListener("dragleave", () => cell.classList.remove("can-drop"));
    cell.addEventListener("drop", () => moveUnit("board", index));
    cell.addEventListener("click", () => moveSelected("board", index));
    if (unit) cell.append(unitNode(unit, "board", index));
    refs.board.append(cell);
  });

  refs.enemyBoard.innerHTML = "";
  const visibleEnemies = state.combatGrid ? state.combatGrid.slice(0, 16) : state.enemies;
  visibleEnemies.forEach((unit, index) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    if (state.combatGrid && unit) cell.classList.add("occupied", "enemy");
    cell.dataset.row = String(Math.floor(index / balance.battle.columns));
    cell.dataset.col = String(index % balance.battle.columns);
    if (unit) cell.append(unitNode(unit, "enemy", index, true));
    refs.enemyBoard.append(cell);
  });
  while (refs.enemyBoard.children.length < balance.battle.enemySlots) {
    const cell = document.createElement("div");
    cell.className = "cell";
    const index = refs.enemyBoard.children.length;
    cell.dataset.row = String(Math.floor(index / balance.battle.columns));
    cell.dataset.col = String(index % balance.battle.columns);
    refs.enemyBoard.append(cell);
  }
}

function renderBench() {
  refs.bench.innerHTML = "";
  const occupied = state.bench.filter(Boolean).length;
  refs.benchCount.textContent = `${occupied}/8`;
  state.bench.forEach((unit, index) => {
    const slot = document.createElement("div");
    slot.className = "bench-slot";
    slot.dataset.index = String(index);
    slot.addEventListener("dragover", (event) => {
      event.preventDefault();
      slot.classList.add("can-drop");
    });
    slot.addEventListener("dragleave", () => slot.classList.remove("can-drop"));
    slot.addEventListener("drop", () => moveUnit("bench", index));
    slot.addEventListener("click", () => moveSelected("bench", index));
    if (unit) slot.append(unitNode(unit, "bench", index));
    refs.bench.append(slot);
  });
}

function renderTraits() {
  const counts = activeTraits();
  refs.traits.innerHTML = "";
  for (const [trait, rule] of Object.entries(traitRules)) {
    const count = counts[trait] || 0;
    const row = document.createElement("div");
    row.className = `trait ${count >= rule.need ? "active" : ""}`;
    row.innerHTML = `<strong><span>${trait}</span><span>${count}/${rule.need}</span></strong><p>${rule.text}</p>`;
    refs.traits.append(row);
  }
}

function renderUnitDetail() {
  const unit = selectedUnit();
  if (!unit) {
    refs.detailTier.textContent = "선택 없음";
    refs.unitDetail.innerHTML = `
      <div class="detail-empty">벤치나 보드의 내 유닛을 선택하면 상세 정보가 표시됩니다.</div>
    `;
    refs.sellUnit.disabled = true;
    refs.sellUnit.textContent = "판매";
    return;
  }

  const stats = [
    ["HP", `${Math.max(0, Math.round(unit.hp))} / ${unit.maxHp}`],
    ["공격", unit.atk],
    ["공속", unit.speed.toFixed(2)],
    ["스증", unit.skillAmp],
    ["방어", unit.defense],
    ["마나", `${Math.round(unit.mana || 0)} / 100`],
  ];
  refs.detailTier.textContent = `${"★".repeat(unit.tier)} · ${unit.cost}코`;
  refs.sellUnit.disabled = state.busy;
  refs.sellUnit.textContent = `${sellValue(unit)}크레딧에 판매`;
  refs.unitDetail.innerHTML = `
    <div class="detail-head" style="--accent: ${unit.color}">
      <span class="portrait">${unit.art ? `<img src="${unit.art}" alt="">` : unit.name.slice(0, 1)}</span>
      <div>
        <strong>${unit.name}</strong>
        <small>${unit.role} · ${unit.trait} · ${unit.weapon}</small>
      </div>
    </div>
    <div class="detail-stats">
      ${stats.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}
    </div>
    <div class="detail-skill">
      <span>스킬</span>
      <strong>${unit.skill}</strong>
    </div>
  `;
}

function render() {
  refs.round.textContent = state.round;
  refs.hp.textContent = state.hp;
  refs.gold.textContent = state.gold;
  refs.streak.textContent = state.streakType ? `${state.streakType === "win" ? "연승" : "연패"} ${state.streakCount}` : "-";
  refs.income.textContent = `수입 +${state.lastIncome}`;
  refs.level.textContent = state.level;
  refs.levelXp.textContent = levelXpLabel();
  const nextXp = xpToNextLevel();
  refs.levelXpBar.style.width = state.level >= balance.player.maxLevel ? "100%" : `${Math.round((state.xp / nextXp) * 100)}%`;
  refs.levelUp.textContent =
    state.level >= balance.player.maxLevel ? "최대 레벨" : `${balance.player.buyXpCost}크레딧 → ${balance.player.buyXpAmount}XP`;
  refs.levelUp.disabled = state.level >= balance.player.maxLevel;
  refs.shopLock.textContent = state.shopLocked ? "잠금 중" : "잠금 해제";
  refs.shopLock.classList.toggle("active", state.shopLocked);
  refs.oddsPopover.hidden = !state.oddsOpen;
  refs.oddsToggle.classList.toggle("active", state.oddsOpen);
  renderShop();
  renderShopOdds();
  renderBoard();
  renderBench();
  renderTraits();
  renderUnitDetail();
}

function buyUnit(index) {
  if (state.busy) return;
  const unit = state.shop[index];
  const slot = state.bench.findIndex((x) => !x);
  const combinesImmediately = canBuyIntoImmediateCombine(unit);
  if (!unit) return;
  if (slot < 0 && !combinesImmediately) return addLog("벤치가 가득 찼습니다.");
  if ((state.pool[unit.name] || 0) <= 0) return addLog(`${unit.name} 재고가 없습니다.`);
  if (state.gold < unit.cost) return addLog("크레딧이 부족합니다.");
  state.gold -= unit.cost;
  state.pool[unit.name] -= 1;
  if (slot >= 0) {
    state.bench[slot] = unit;
  } else {
    forceCombinePurchasedUnit(unit);
  }
  state.shop.splice(index, 1);
  addLog(`${unit.name} 영입 완료.`);
  combineAllUnits();
  render();
}

function sellSelectedUnit() {
  if (state.busy || !state.selected) return;
  const arr = state[state.selected.source];
  const unit = arr?.[state.selected.index];
  if (!unit || state.selected.source === "enemy") return;
  const value = sellValue(unit);
  const returned = unitCopyCount(unit);
  state.gold += value;
  state.pool[unit.name] = Math.min(stockLimit(unit), (state.pool[unit.name] || 0) + returned);
  arr[state.selected.index] = null;
  state.selected = null;
  addLog(`${unit.name} 판매: ${value} 크레딧 획득, 풀 ${returned}개 반환.`);
  render();
}

function moveUnit(target, targetIndex) {
  if (!state.dragging || state.busy) return;
  moveFrom(state.dragging, target, targetIndex);
}

function moveSelected(target, targetIndex) {
  if (!state.selected || state.busy) return;
  moveFrom(state.selected, target, targetIndex);
}

function moveFrom(from, target, targetIndex) {
  if (from.source === "enemy") return;
  const srcArr = state[from.source];
  const dstArr = state[target];
  const unit = srcArr[from.index];
  if (!unit) return;
  const limit = boardLimit();
  const addsBoardUnit = from.source !== "board" && target === "board" && !dstArr[targetIndex];
  if (addsBoardUnit && boardUnits().length >= limit) {
    addLog(`현재 레벨 배치 한도는 ${limit}명입니다.`);
    render();
    return;
  }
  srcArr[from.index] = dstArr[targetIndex];
  dstArr[targetIndex] = unit;
  state.selected = null;
  combineAllUnits();
  render();
}

function combineUnits(name) {
  let changed = false;
  while (true) {
    const all = [...state.bench, ...state.board].filter((unit) => unit && unit.name === name);
    const sameTier = [2, 1].find((tier) => all.filter((unit) => unit.tier === tier).length >= 3);
    if (!sameTier) return changed;

    let removed = 0;
    let firstRemoved = null;
    for (const arr of [state.bench, state.board]) {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i]?.name === name && arr[i]?.tier === sameTier && removed < 3) {
          if (!firstRemoved) firstRemoved = { arr, index: i };
          arr[i] = null;
          removed++;
        }
      }
    }

    const upgraded = makeUnit(roster.find((unit) => unit.name === name), sameTier + 1);
    if (firstRemoved) {
      firstRemoved.arr[firstRemoved.index] = upgraded;
    } else {
      const benchSlot = state.bench.findIndex((unit) => !unit);
      const boardSlot = state.board.findIndex((unit) => !unit);
      if (benchSlot >= 0) {
        state.bench[benchSlot] = upgraded;
      } else if (boardSlot >= 0) {
        state.board[boardSlot] = upgraded;
      }
    }
    changed = true;
    addLog(`${name} ${sameTier + 1}성 합성!`);
  }
}

function combineAllUnits() {
  let changed = false;
  do {
    changed = false;
    const names = new Set([...state.bench, ...state.board].filter(Boolean).map((unit) => unit.name));
    for (const name of names) {
      if (combineUnits(name)) changed = true;
    }
  } while (changed);
  pruneShopForOwnedThreeStars();
}

function makeEnemies() {
  const count = Math.min(5, Math.max(1, Math.ceil((state.round - 1) / 2)));
  const maxCost = state.round < 4 ? 1 : state.round < 7 ? 2 : state.round < 10 ? 3 : 5;
  const candidates = roster.filter((unit) => unit.cost <= maxCost);
  const hpScale = Math.min(0.98, balance.battle.enemyEarlyHpScale + state.round * balance.battle.enemyScaleGrowth);
  const atkScale = Math.min(0.92, balance.battle.enemyEarlyAtkScale + state.round * balance.battle.enemyScaleGrowth);
  const slots = Array(balance.battle.enemySlots).fill(null);
  const spawnOrder = [11, 12, 10, 13, 9, 14, 3, 4, 2, 5, 1, 6, 0, 7, 8, 15];
  Array.from({ length: count }, (_, i) => {
    const unit = makeUnit(sample(candidates), state.round > 8 && Math.random() > 0.84 ? 2 : 1);
    unit.maxHp = Math.round((unit.maxHp + state.round * 3) * hpScale);
    unit.hp = unit.maxHp;
    unit.atk = Math.max(3, Math.round((unit.atk + state.round * 0.65) * atkScale));
    unit.skillAmp = Math.max(2, Math.round((unit.skillAmp + state.round * 0.65) * atkScale));
    unit.defense = Math.max(0, Math.round((unit.defense + Math.floor(state.round / 4)) * hpScale));
    slots[spawnOrder[i] ?? i] = unit;
  });
  return slots;
}

function living(units) {
  return units.filter((unit) => unit && unit.hp > 0);
}

function unitAttackRange(unit) {
  return ["사격", "술법", "지원"].includes(unit.role) ? balance.battle.rangedRange : balance.battle.meleeRange;
}

function unitSlot(unit) {
  const cols = balance.battle.columns;
  if (state.combatGrid) {
    const index = state.combatGrid.indexOf(unit);
    if (index < 0) return null;
    return { arr: state.combatGrid, index, x: index % cols, y: Math.floor(index / cols) };
  }
  const arr = unit.side === "enemy" ? state.enemies : state.board;
  const index = arr.indexOf(unit);
  if (index < 0) return null;
  const yOffset = unit.side === "enemy" ? 0 : 2;
  return { arr, index, x: index % cols, y: yOffset + Math.floor(index / cols) };
}

function hexCell(x, y) {
  return { q: x - Math.floor(y / 2), r: y };
}

function hexDistanceSlots(a, b) {
  const ah = hexCell(a.x, a.y);
  const bh = hexCell(b.x, b.y);
  const dq = ah.q - bh.q;
  const dr = ah.r - bh.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

function slotIndexFor(side, x, y, allowCross = false) {
  const cols = balance.battle.columns;
  if (allowCross) {
    if (x < 0 || x >= cols || y < 0 || y > 5) return -1;
    return y * cols + x;
  }
  if (side === "enemy") {
    if (x < 0 || x >= cols || y < 0 || y > 1) return -1;
    return y * cols + x;
  }
  if (x < 0 || x >= cols || y < 2 || y > 5) return -1;
  return (y - 2) * cols + x;
}

function distanceBetween(a, b) {
  const from = unitSlot(a);
  const to = unitSlot(b);
  if (!from || !to) return 99;
  return hexDistanceSlots(from, to);
}

function nearestTarget(attacker, enemies) {
  const alive = living(enemies);
  if (!alive.length) return null;
  return alive.reduce((best, unit) => {
    const bestDistance = distanceBetween(attacker, best);
    const unitDistance = distanceBetween(attacker, unit);
    if (unitDistance !== bestDistance) return unitDistance < bestDistance ? unit : best;
    return unit.hp < best.hp ? unit : best;
  }, alive[0]);
}

function isFrontlineTarget(unit) {
  return ["수호", "돌격", "결투", "맹공"].includes(unit.trait) || ["방패", "돌격", "검객", "난투"].includes(unit.role);
}

function isBacklineDiver(unit) {
  return unit.trait === "기습" || unit.role === "암살";
}

function backlineDepthFor(attacker, target) {
  const slot = unitSlot(target);
  if (!slot) return -1;
  return attacker.side === "enemy" ? slot.y : balance.battle.columns - slot.y;
}

function compareByDistanceThenHp(attacker, a, b) {
  const distanceA = distanceBetween(attacker, a);
  const distanceB = distanceBetween(attacker, b);
  if (distanceA !== distanceB) return distanceA - distanceB;
  return a.hp - b.hp;
}

function pickOpeningTarget(attacker, alive) {
  if (isBacklineDiver(attacker)) {
    return alive.slice().sort((a, b) => {
      const depthA = backlineDepthFor(attacker, a);
      const depthB = backlineDepthFor(attacker, b);
      if (depthA !== depthB) return depthB - depthA;
      return compareByDistanceThenHp(attacker, a, b);
    })[0];
  }

  const frontline = alive.filter(isFrontlineTarget);
  const candidates = frontline.length ? frontline : alive;
  return candidates.slice().sort((a, b) => compareByDistanceThenHp(attacker, a, b))[0];
}

function moveToward(attacker, target) {
  const from = unitSlot(attacker);
  const to = unitSlot(target);
  if (!from || !to) return false;
  const currentDistance = distanceBetween(attacker, target);
  const even = from.y % 2 === 0;
  const steps = even
    ? [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: -1 },
        { x: -1, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 1 },
      ]
    : [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 1, y: -1 },
        { x: 0, y: -1 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];

  for (const step of steps) {
    const nextX = from.x + step.x;
    const nextY = from.y + step.y;
    const nextIndex = slotIndexFor(attacker.side, nextX, nextY, Boolean(state.combatGrid));
    if (nextIndex < 0) continue;
    const arr = state.combatGrid || (attacker.side === "enemy" ? state.enemies : state.board);
    if (arr[nextIndex]) continue;
    const nextDistance = hexDistanceSlots({ x: nextX, y: nextY }, to);
    if (nextDistance >= currentDistance) continue;
    arr[from.index] = null;
    arr[nextIndex] = attacker;
    attacker.status = "moving";
    return true;
  }
  return false;
}

function removeDeadUnits(units) {
  if (!state.combatGrid) return;
  for (const unit of units) {
    if (!unit || unit.hp > 0) continue;
    const index = state.combatGrid.indexOf(unit);
    if (index >= 0) state.combatGrid[index] = null;
  }
}

function prepareCombatUnit(unit, side, counts = {}) {
  const stats = side === "ally" ? applySynergy(unit, counts) : {
    hp: unit.maxHp,
    atk: unit.atk,
    speed: unit.speed,
    skillAmp: unit.skillAmp,
    defense: unit.defense,
    heal: 1,
  };
  unit.side = side;
  unit.mana = 0;
  unit.maxHp = Math.round(stats.hp);
  unit.hp = unit.maxHp;
  unit.atk = Math.round(stats.atk);
  unit.speed = stats.speed;
  unit.skillAmp = Math.round(stats.skillAmp);
  unit.defense = Math.round(stats.defense);
  unit.healPower = stats.heal;
  unit.range = unitAttackRange(unit);
  unit.status = "";
  unit.focusTargetId = null;
  unit.hasPickedOpeningTarget = false;
  return unit;
}

function pickTarget(attacker, enemies) {
  const alive = living(enemies);
  if (!alive.length) return null;

  if (attacker.focusTargetId) {
    const focused = alive.find((unit) => unit.id === attacker.focusTargetId);
    if (focused) return focused;
  }

  const target = attacker.hasPickedOpeningTarget ? nearestTarget(attacker, enemies) : pickOpeningTarget(attacker, alive);
  if (target) {
    attacker.focusTargetId = target.id;
    attacker.hasPickedOpeningTarget = true;
  }
  return target;
}

function dealDamage(source, target, amount) {
  const damage = Math.max(3, Math.round(amount - target.defense * 0.55));
  target.hp = Math.max(0, target.hp - damage);
  target.mana = Math.min(100, (target.mana || 0) + balance.battle.manaPerHit);
  target.status = target.hp > 0 ? "hit" : "dead";
  if (target.hp <= 0) removeDeadUnits([target]);
  return damage;
}

function basicAttack(attacker, enemies) {
  const target = pickTarget(attacker, enemies);
  if (!target) return { message: "", effects: [] };
  if (distanceBetween(attacker, target) > unitAttackRange(attacker)) {
    const moved = moveToward(attacker, target);
    return {
      message: moved ? `${attacker.name} 이동` : `${attacker.name} 대기`,
      effects: [],
    };
  }
  const variance = 0.86 + Math.random() * 0.28;
  const damage = dealDamage(attacker, target, attacker.atk * attacker.speed * variance * balance.battle.basicDamageMultiplier);
  attacker.mana = Math.min(100, attacker.mana + balance.battle.manaPerAttack);
  attacker.status = "attacking";
  return {
    message: `${attacker.name} → ${target.name} ${damage} 피해`,
    effects: [{ from: attacker.id, to: target.id, type: "attack" }],
  };
}

function castSkill(caster, allies, enemies) {
  caster.mana = 0;
  caster.status = "casting";

  if (caster.role === "지원") {
    const target = living(allies).reduce((low, unit) => (unit.hp / unit.maxHp < low.hp / low.maxHp ? unit : low), living(allies)[0]);
    const heal = Math.round((caster.skillAmp * 1.4 + 18) * caster.healPower);
    target.hp = Math.min(target.maxHp, target.hp + heal);
    target.status = "healed";
    return {
      message: `${caster.name} 스킬: ${target.name} ${heal} 회복`,
      effects: [{ from: caster.id, to: target.id, type: "heal" }],
    };
  }

  if (caster.role === "술법") {
    const targets = living(enemies);
    let total = 0;
    for (const target of targets) total += dealDamage(caster, target, caster.skillAmp * 0.75 + 10);
    return {
      message: `${caster.name} 스킬: 광역 ${total} 피해`,
      effects: targets.map((target) => ({ from: caster.id, to: target.id, type: "skill" })),
    };
  }

  if (caster.role === "방패") {
    const heal = Math.round(caster.skillAmp + caster.defense * 2.2 + 12);
    caster.hp = Math.min(caster.maxHp, caster.hp + heal);
    caster.status = "healed";
    return {
      message: `${caster.name} 스킬: ${heal} 보호막`,
      effects: [{ from: caster.id, to: caster.id, type: "shield" }],
    };
  }

  const target = pickTarget(caster, enemies);
  if (!target) return { message: "", effects: [] };
  if (distanceBetween(caster, target) > Math.max(unitAttackRange(caster), 2)) {
    const moved = moveToward(caster, target);
    caster.mana = 100;
    return {
      message: moved ? `${caster.name} 스킬 사거리 접근` : `${caster.name} 대기`,
      effects: [],
    };
  }
  const scale = caster.role === "암살" ? 2.2 : caster.role === "검객" ? 1.85 : caster.role === "사격" ? 1.75 : 1.6;
  const damage = dealDamage(caster, target, caster.atk * 0.75 + caster.skillAmp * scale + 10);
  return {
    message: `${caster.name} 스킬: ${target.name} ${damage} 피해`,
    effects: [{ from: caster.id, to: target.id, type: "skill" }],
  };
}

function clearCombatStatus(units) {
  for (const unit of units) {
    if (unit) unit.status = "";
  }
}

function playCombatEffects(effects) {
  const field = document.querySelector(".battlefield");
  if (!field) return;
  const fieldRect = field.getBoundingClientRect();
  for (const effect of effects) {
    const from = document.querySelector(`[data-unit-id="${effect.from}"]`);
    const to = document.querySelector(`[data-unit-id="${effect.to}"]`);
    if (!from || !to) continue;
    const fromRect = from.getBoundingClientRect();
    const toRect = to.getBoundingClientRect();
    const startX = fromRect.left + fromRect.width / 2 - fieldRect.left;
    const startY = fromRect.top + fromRect.height / 2 - fieldRect.top;
    const endX = toRect.left + toRect.width / 2 - fieldRect.left;
    const endY = toRect.top + toRect.height / 2 - fieldRect.top;
    const projectile = document.createElement("span");
    projectile.className = `projectile ${effect.type}`;
    projectile.style.left = `${startX}px`;
    projectile.style.top = `${startY}px`;
    projectile.style.setProperty("--dx", `${endX - startX}px`);
    projectile.style.setProperty("--dy", `${endY - startY}px`);
    field.append(projectile);
    projectile.addEventListener("animationend", () => projectile.remove(), { once: true });
  }
}

async function simulate() {
  const allies = boardUnits();
  if (!allies.length) {
    addLog("보드에 캐릭터를 배치해야 합니다.");
    return;
  }
  const originalBoard = state.board.slice();
  state.busy = true;
  state.selected = null;
  refs.phase.textContent = "전투 중: 양 팀이 자동으로 교전합니다.";
  document.body.classList.add("fighting");
  const traitCounts = activeTraits();
  state.enemies = makeEnemies();
  allies.forEach((unit) => {
    unit.combatBase = {
      maxHp: unit.maxHp,
      hp: unit.hp,
      atk: unit.atk,
      speed: unit.speed,
      skillAmp: unit.skillAmp,
      defense: unit.defense,
    };
  });
  allies.forEach((unit) => prepareCombatUnit(unit, "ally", traitCounts));
  state.enemies.filter(Boolean).forEach((unit) => prepareCombatUnit(unit, "enemy"));
  state.combatGrid = Array(48).fill(null);
  state.enemies.forEach((unit, index) => {
    if (unit) state.combatGrid[index] = unit;
  });
  state.board.forEach((unit, index) => {
    if (unit) state.combatGrid[16 + index] = unit;
  });
  addLog(`전투 시작: 아군 ${allies.length}명 vs 야생 실험체 ${living(state.enemies).length}명`);
  render();

  let tick = 0;
  while (living(allies).length && living(state.enemies).length && tick < balance.battle.maxTicks) {
    tick += 1;
    clearCombatStatus([...allies, ...state.enemies]);
    const actors = [...living(allies), ...living(state.enemies)].sort((a, b) => b.speed - a.speed);
    const tickLogs = [];
    const effects = [];

    for (const actor of actors) {
      if (actor.hp <= 0) continue;
      const friends = actor.side === "ally" ? allies : state.enemies;
      const foes = actor.side === "ally" ? state.enemies : allies;
      if (!living(foes).length) break;
      const action = actor.mana >= 100 ? castSkill(actor, friends, foes) : basicAttack(actor, foes);
      if (action.message) tickLogs.push(action.message);
      effects.push(...action.effects);
    }

    addLog(tickLogs.slice(0, 3).join(" / "));
    refs.phase.textContent = `전투 중: ${tick}턴 · 아군 ${living(allies).length}명 / 적 ${living(state.enemies).length}명`;
    render();
    playCombatEffects(effects);
    await sleep(balance.battle.tickMs);
  }

  const win = living(allies).length > 0 && living(state.enemies).length === 0;
  const survivors = win ? living(allies).length : living(state.enemies).length;
  document.body.classList.remove("fighting");
  state.busy = false;
  state.round += 1;
  state.combatGrid = null;
  addXp(balance.player.combatXp, "전투 보상");
  for (const unit of allies) {
    if (unit.combatBase) {
      unit.maxHp = unit.combatBase.maxHp;
      unit.atk = unit.combatBase.atk;
      unit.speed = unit.combatBase.speed;
      unit.skillAmp = unit.combatBase.skillAmp;
      unit.defense = unit.combatBase.defense;
      delete unit.combatBase;
    }
    unit.hp = unit.maxHp;
    unit.mana = 0;
    unit.status = "";
    unit.focusTargetId = null;
    unit.hasPickedOpeningTarget = false;
  }
  state.board = originalBoard;
  if (win) {
    grantRoundIncome(true);
    addLog(`승리! 생존 ${survivors}명.`);
    refs.phase.textContent = "승리했습니다. 다음 전투를 준비하세요.";
  } else {
    const damage = Math.min(20, 6 + Math.floor(state.round / 2) + survivors);
    state.hp = Math.max(0, state.hp - damage);
    grantRoundIncome(false);
    addLog(`패배. 남은 적 ${survivors}명. 체력 ${damage} 감소.`);
    refs.phase.textContent = state.hp ? "패배했습니다. 조합을 재정비하세요." : "체력이 0이 되었습니다. 새로고침으로 다시 도전하세요.";
  }
  state.enemies = [];
  if (state.shopLocked) {
    addLog("상점 잠금 유지: 현재 상점을 보존합니다.");
    render();
  } else {
    rollShop();
  }
}

function buyXp() {
  if (state.busy) return;
  if (state.level >= balance.player.maxLevel) return addLog("최대 레벨입니다.");
  if (state.gold < balance.player.buyXpCost) return addLog(`경험치 구매에는 ${balance.player.buyXpCost} 크레딧이 필요합니다.`);
  state.gold -= balance.player.buyXpCost;
  addXp(balance.player.buyXpAmount, "경험치 구매");
  render();
}

$("reroll").addEventListener("click", () => {
  if (state.busy) return;
  if (state.gold < balance.shop.rerollCost) return addLog(`새로고침에는 ${balance.shop.rerollCost} 크레딧이 필요합니다.`);
  state.gold -= balance.shop.rerollCost;
  addLog(`상점 새로고침: ${balance.shop.rerollCost} 크레딧 사용.`);
  rollShop();
});
$("shopLock").addEventListener("click", () => {
  if (state.busy) return;
  state.shopLocked = !state.shopLocked;
  addLog(state.shopLocked ? "상점을 잠갔습니다." : "상점 잠금을 해제했습니다.");
  render();
});
$("oddsToggle").addEventListener("click", () => {
  state.oddsOpen = !state.oddsOpen;
  render();
});
$("battle").addEventListener("click", simulate);
$("levelUp").addEventListener("click", buyXp);
refs.sellUnit.addEventListener("click", sellSelectedUnit);

addLog("상점에서 캐릭터를 영입하고 보드로 드래그하세요.");
rollShop();
