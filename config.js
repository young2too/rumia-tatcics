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
    majorVersion: "261014",
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
    title: "PvP 베타 및 루미 상점 업데이트",
    version: "261014",
    date: "2026-10-14",
    summary: "",
    items: [
      "비동기 매칭 및 실시간 방을 지원하는 PvP 베타를 추가했습니다.",
      "비동기 PvP는 4라운드의 준비 전투와 첫 증강 선택 후 대기열에 등록되며, 8명이 모이면 게임이 시작됩니다.",
      "광장 채팅을 추가했습니다. 접속자들과 자유롭게 대화하세요!",
      "PvE와 PvP에 다양한 보상을 선택할 수 있는 루미 상점을 추가했습니다.",
      "증강 및 각종 툴팁을 보완하고 모바일 전투 최적화를 적용했습니다.",
      "PvP는 현재 베타 버전입니다. 버그와 밸런스 제보를 계속 받고 있습니다.",
      "고코스트 유닛이 비용에 걸맞은 성능을 내도록 기본 체급을 상향했습니다.",
    ],
  },
};
