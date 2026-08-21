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
    majorVersion: "260819",
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
    title: "증강 시스템 핫픽스",
    version: "260819",
    date: "2026-08-21",
    summary: "증강 시스템 업데이트 이후 들어온 밸런스와 편의성 피드백을 반영했습니다.",
    items: [
      "운명의 가약 케네스 스탯 흡수율을 1.5배에서 1.0배로 너프했습니다.",
      "팀 스쿼드 11명 이상의 랭킹 등록 제한을 해제했습니다.",
      "보스 전체적인 딜/스증을 소폭 약화했습니다. 너무 쉬우면 리포트 보내줘요.",
      "선택한 증강 패널에 폴드 버튼을 추가했습니다. 접기/펼치기가 가능합니다.",
      "예열 증강 적용 틱을 3초에서 1.5초로 변경했습니다. 전투 시작 후 9초에 풀스택이 됩니다.",
      "버그나 건의사항은 계속 받고 있습니다.",
    ],
  },
};
