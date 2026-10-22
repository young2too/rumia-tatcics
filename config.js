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
    title: "마이너 패치: PvP 편의 및 증강표 추가",
    version: "261014",
    date: "2026-10-22",
    summary: "",
    items: [
      "단계별 등장 확률과 활성 증강 목록을 확인할 수 있는 증강표를 추가했습니다.",
      "비동기 PvP의 명칭을 비실시간 PvP로 변경하고, 시작 동선과 매칭 방식을 개선했습니다.",
      "비실시간 PvP는 첫 8명을 하나의 그룹으로 묶어 같은 증강 등급을 제공합니다.",
      "실시간 PvP 방장에게 대기실 참가자 강퇴 기능을 추가했습니다.",
      "실시간 방 전원 준비 알림을 추가하고 불필요한 반복 알림을 줄였습니다.",
      "1코스트 3성 유닛의 체급을 소폭 하향했습니다.",
      "전술 시너지로 이동한 적에게 아군 전체의 공격 대상이 고정되던 현상을 수정했습니다.",
      "모바일 PvP의 준비 버튼, 광장 채팅과 정찰 버튼 겹침 등 UI 문제를 개선했습니다.",
      "PvP는 현재 베타 버전입니다. 버그와 밸런스 제보를 계속 받고 있습니다.",
    ],
  },
};
