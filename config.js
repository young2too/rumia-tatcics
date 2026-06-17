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
    title: "나쟈너프",
    version: "20260615",
    date: "2026-06-15",
    summary: "나쟈 수치딸깍너프",
    items: [
      "모바일 페이지에서 알파때문에 전투시작을 못 누르는 버그를 고쳤습니다",
      "나쟈의 스증을 하향했습니다. 스증 72->65 참고로 나쟈의 스킬계수는 185%입니다",
      "그래도 나쟈가 어렵다면 스킬 계수도 같이 깔 생각입니다",
      "아직 캐릭터 각각의 스킬들은 미구현입니다(역할별로 스킬이 같음)"
    ],
  },
};
