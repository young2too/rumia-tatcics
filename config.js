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
    majorVersion: "20260624",
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
    title: "밸런스 패치 안내",
    version: "20260624",
    date: "2026-06-24",
    summary: "대형패치 예고",
    items: [
      "건의사항 게시판을 보고 의견 주세요",
      "사거리 시스템을 손보는 중입니다. 사거리를 거리계산 말고 칸수로 세게 해야겠어요",
      "버전별 랭킹 업데이트",
      "자세한 내용은 건의사항 게시판을 참조해주세요",
    ],
  },
};
