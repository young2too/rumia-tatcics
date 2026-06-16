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
    title: "긴급고지",
    version: "20260615",
    date: "2026-06-15",
    summary: "긴급핫픽스",
    items: [
      "가벼운 게시판을 추가했습니다. 위쪽 버튼을 눌러보세요",
      "암살 캐릭터들에게 개시 시, 후열로 순간이동시켜 전투를 진행합니다",
      "각종 시너지들로 상승한 스텟을 전투시작 전으로 되돌리는 과정에서 암살 덱의 크리배수/크리율을 누락했습니다",
      "암살 덱의 비정상적인 데미지가 여기서 기인했습니다. 버그리포트 감사합니다..",
      "암살 패치를 개시했던 시작 이후의 기록을 지울게요...",
      "아직 캐릭터 각각의 스킬들은 미구현입니다(역할별로 스킬이 같음)"
    ],
  },
};
