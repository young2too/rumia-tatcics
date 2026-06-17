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
  bgm: {
    src: "./assets/audio/bgm.mp3",
    volume: 0.38,
    youtubeUrl: "https://www.youtube.com/watch?v=VumAilTvvZ8",
  },
  patchNotes: {
    enabled: true,
    title: "나쟈 위클 너프",
    version: "20260618",
    date: "2026-06-18",
    summary: "나쟈 위클 너프",
    items: [
      "모바일 페이지에서 알파때문에 전투시작을 못 누르는 버그를 고쳤습니다",
      "나쟈의 스증을 하향했습니다. 스증 72->65 참고로 나쟈의 스킬계수는 185%입니다",
      "그래도 나쟈가 어렵다면 스킬 계수도 같이 깔 생각입니다",
      "위클라인의 스증도 같이 하향했습니다. 스증 54->44. 스킬계수는 145%입니다",
      "난이도 하향으로 랭킹 DB를 초기화합니다.", 
      "플레이해주시는 여러분들께 항상 감사드립니다",
      "아직 캐릭터 각각의 스킬들은 미구현입니다(역할별로 스킬이 같음)"
    ],
  },
};
