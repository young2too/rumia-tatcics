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
    summary: "히든 시너지 추가.",
    items: [
      "시너지 표에 없는 히든 시너지를 추가했습니다.",
      "많지는 않아요, 반응 좋으면 더 만들지도?.",
      "찾는 재미가 있었으면 좋겠네요.",
      "그래서 스킬 구현은 언제 다하지 귀찮다..",
    ],
  },
};
