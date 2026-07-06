const LOCAL_TEST_GOLD = 999999;

export function createGameState({ balance, roster, createUnitPool, communityBoardConfig }) {
  const localTest = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const state = {
    debugMode: localTest,
    round: 1,
    hp: balance.player.startHp,
    gold: localTest ? LOCAL_TEST_GOLD : balance.player.startGold,
    level: 1,
    xp: 0,
    shop: [],
    pool: createUnitPool(roster, balance),
    combatGrid: null,
    shopLocked: balance.shop.locked,
    oddsOpen: false,
    streakType: null,
    streakCount: 0,
    lastIncome: 0,
    bench: Array(8).fill(null),
    board: Array(32).fill(null),
    temporaryBoosts: { hp: 0, atk: 0, skillAmp: 0 },
    enemies: [],
    dragging: null,
    selected: null,
    busy: false,
    rankingOpen: false,
    rankingEntries: [],
    rankingLoaded: false,
    rankingLoading: false,
    rankingSaving: false,
    rankingError: "",
    rankingSortBy: "stage",
    rankingSortOrder: "desc",
    rankingVersionFilter: "all",
    rankingVersions: [],
    bgmOn: false,
    bgmError: "",
    patchNotesOpen: false,
    patchNotesSkipToday: false,
    deathRecord: null,
    rankingSubmitted: false,
    communityBoardOpen: false,
    communityBoardTab: communityBoardConfig.categories?.[0]?.id || "free",
    communityBoardPage: 1,
    communityBoardPosts: [],
    communityBoardPost: null,
    communityBoardComments: [],
    communityBoardTotal: 0,
    communityBoardLoaded: false,
    communityBoardLoading: false,
    communityBoardSaving: false,
    communityBoardCommentsLoading: false,
    communityBoardCommentSaving: false,
    communityBoardError: "",
    communityBoardCommentError: "",
    communityBoardMode: "list",
    traitRosterOpen: false,
    traitRosterTrait: "",
    traitTableOpen: false,
  };

  function syncLocalTestGold() {
    if (localTest && state.gold < LOCAL_TEST_GOLD) state.gold = LOCAL_TEST_GOLD;
  }

  return { state, syncLocalTestGold };
}
