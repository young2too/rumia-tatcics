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
    majorVersion: "20260701",
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
    title: "다중 시너지 업데이트",
    version: "20260701",
    date: "2026-07-01",
    summary: "덱 구성의 선택지를 넓히고 주요 편의 기능을 개선했습니다.",
    items: [
      "캐릭터마다 여러 시너지를 가질 수 있도록 로스터를 개편했습니다.",
      "전술, 원격, 장악, 궁술 등 새로운 시너지 효과를 추가했습니다.",
      "전술 시너지는 적 후열을 아군 진영으로 끌어와 집중 공격합니다.",
      "버전별 랭킹과 통계 페이지를 추가했습니다.",
      "시너지 표와 상점, 전투 UI의 가독성을 개선했습니다.",
    ],
  },
};
