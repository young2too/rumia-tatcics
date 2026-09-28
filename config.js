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
    majorVersion: "260928",
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
    title: "대규모 시너지 밸런스 패치",
    version: "260928",
    date: "2026-09-28",
    summary: "",
    items: [
      "기습 시너지 전면 개편",
      "결투 시너지 체급 및 흡혈 하향",
      "정밀 시너지에 집중 사격 기절 효과 추가",
      "주술 시너지에 스킬 시전 보호막 추가",
      "수호 시너지에 최대 체력 비례 고정 피해 추가",
      "마이와 펜리르 성능 조정",
      "쇼이치 7단비약 개편 및 아비게일 워프 슬래시 증강 추가",
      "시너지 툴팁 및 스탯 아이콘 UI 개선",
    ],
  },
};
