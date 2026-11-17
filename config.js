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
  push: {
    enabled: true,
    vapidPublicKey: "BCjqLcpJMlC5U9KT2kAtc9wdaX4tvEgJ8tO9E0uQwk-Ruo6pHTgW0iwXny8ANVVe9srFgC1QpzYWDK8BTIm3ofY",
    pollSeconds: 30,
  },
  ranking: {
    majorVersion: "261109",
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
    title: "전투 밸런스 및 도감 업데이트",
    version: "261109",
    date: "2026-11-17",
    summary: "주요 시너지와 고코스트 유닛을 상향하고 도감 페이지를 추가했습니다.",
    items: [
      "격전, 연대, 진형, 투혼 시너지 상향",
      "도감 페이지 추가",
      "4~5코스트 유닛 체급 상향",
      "기본 수익 2 → 4로 변경",
      "전수조사를 통해 툴팁과 실제 스킬이 일치하지 않던 유닛 수정",
      "나쟈, 위클라인, 펜리르 하향",
    ],
  },
};
