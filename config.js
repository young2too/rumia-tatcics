window.LUMIA_TACTICS_CONFIG = {
  supabase: {
    url: "https://vuvljodrufdzbzbyzaxf.supabase.co",
    anonKey: "sb_publishable_QW3oRV0SSjOFC0ig5mp1Kw_7Iuge0b3",
    table: "rankings",
  },
  communityBoard: {
    table: "board_posts",
    commentsTable: "board_comments",
  },
  ranking: {
    majorVersion: "260819",
    versionColumn: "ranking_version",
  },
  statistics: {
    rankingLimit: 1000,
    cacheMinutes: 5,
  },
  bgm: {
    src: "./assets/audio/bgm.mp3",
    volume: 0.38,
    youtubeUrl: "https://www.youtube.com/watch?v=VumAilTvvZ8",
  },
  patchNotes: {
    enabled: true,
    title: "증강 시스템 업데이트",
    version: "260819",
    date: "2026-08-19",
    summary: "새로운 성장 선택지인 증강 시스템을 추가한 메이저 업데이트입니다.",
    items: [
      "라운드 진행 중 선택할 수 있는 증강 시스템을 추가했습니다.",
      "증강은 15/30/60라운드 보스전 이후 선택할 수 있습니다.",
      "실버/골드/프리즘 등급의 다양한 증강으로 덱을 강화할 수 있습니다.",
      "일부 증강은 특정 유닛, 시너지, 상점, 배치 수, 전투 규칙을 직접 바꿉니다.",
      "적 진영 전장을 4열로 확장했습니다.",
      "선택한 증강은 전장 좌측 패널에서 다시 확인할 수 있습니다.",
      "문장/왕관/입문 계열 증강 선택 시 관련 유닛을 함께 지급하도록 개선했습니다.",
      "모바일 대규모 전투의 프레임 저하를 줄이기 위해 자동 저사양 이펙트 모드를 추가했습니다.",
      "증강 밸런스와 버그 제보는 게시판으로 부탁드립니다.",
    ],
  },
};
