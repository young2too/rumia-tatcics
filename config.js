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
    title: "시너지 대격변 및 모바일 UI 개편",
    version: "261109",
    date: "2026-11-09",
    summary: "메이저·마이너 시너지와 66인 로스터를 전면 재설계하고 모바일 전장 조작을 개편했습니다.",
    items: [
      "메이저 시너지를 격전·정조준·철벽·술식·암습·진형·투혼·연대 8종으로 전면 개편했습니다.",
      "마이너 시너지를 선봉·사수·봉쇄·기동·파동·응원·응수·결속·종막 9종으로 재편했습니다.",
      "활성 로스터 66명의 시너지, 코스트와 기본 체급을 다시 배치했습니다.",
      "입문·문장·왕관을 새 체계에 맞게 변경하고 신규 공용 증강 10종을 추가했습니다.",
      "모바일에 아군 전장 확대, 접이식 상점과 플로팅 메뉴를 추가했습니다.",
      "PC와 모바일에 드래그 판매 기능을 추가했습니다.",
      "새 시즌 시작과 함께 기존 PvE 저장 및 진행 중인 PvP 게임이 초기화됩니다.",
      "새 시너지의 수치는 계속 조정될 수 있습니다.",
      "문의 및 건의는 인웹 내 게시판을 이용해주세요",
    ],
  },
};
