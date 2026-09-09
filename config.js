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
  presence: {
    enabled: true,
    table: "online_presence",
    heartbeatSeconds: 120,
    onlineWindowSeconds: 180,
  },
  ranking: {
    majorVersion: "260909",
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
    title: "추적 시너지 업데이트",
    version: "260909",
    date: "2026-09-09",
    summary: "",
    items: [
      "사냥 개시 너프",
      "결투/지원/술법/기습 시너지 버프",
      "신규 메이저 시너지 `추적` 추가",
      "추적 로스터 8인 신규 추가",
      "추적 표식 시스템 추가",
      "아비게일 스킬 범위 상향",
      "일부 탄환/상태이상/표식 UI 가시성 개선",
    ],
  },
};
