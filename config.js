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
    title: "전투 밸런스 핫픽스",
    version: "261109",
    date: "2026-11-10",
    summary: "저코스트 기물과 시너지 적용 문제를 조정했습니다.",
    items: [
      "1~3코스트 기물 상향",
      "시너지 적용 버그 수정",
    ],
  },
};
