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
    majorVersion: "260723",
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
    title: "마이너 패치로 채용률이 낮은 유닛 버프함. 버전번호는 그대로",
    version: "260723",
    date: "2026-08-04",
    summary: "버전번호는 그대로 두고 채용률이 낮은 유닛과 시너지를 보강하는 마이너 패치입니다.",
    items: [
      "검객 깡체급 상향",
      "주술 시너지 효과 변경(스킬 치명타 추가)",
      "지원 시너지 및 지원형 깡체급 상향",
      "현재 증강 아이디어 받는 중. 게시판 확인",
    ],
  },
};
