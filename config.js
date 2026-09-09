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
    majorVersion: "260909",
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
    title: "추적 시너지 업데이트",
    version: "260909",
    date: "2026-09-09",
    summary: "신규 메이저 시너지 추적과 신규 로스터 8인을 추가하고, 일부 비주류 시너지와 유닛을 조정했습니다.",
    items: [
      "사냥 개시 효과를 처치 관여에서 직접 처치 기준으로 너프했습니다.",
      "결투, 지원, 주술, 기습 시너지를 상향 조정했습니다.",
      "신규 메이저 시너지 추적을 추가했습니다. 후열 우선 표식과 표식 대상 추가 피해를 활용합니다.",
      "추적 로스터 8인을 추가했습니다: 아이솔, 유스티나, 마르티나, 츠바메, 카티야, 히스이, 다르코, 펜리르.",
      "추적 유닛 8종의 개별 스킬과 전용 이펙트를 추가했습니다.",
      "추적 표식, 셈텍스, 최후의 저항 등 신규 상태 표시 UI를 추가했습니다.",
      "아비게일 호라이즌 클리브 범위를 주변 3칸으로 상향했습니다.",
      "카티야 정밀 조준 탄환 판정을 조정했습니다. 조준 방향은 유지하되 경로상 적이 대신 맞을 수 있습니다.",
      "버그나 건의사항은 계속 받고 있습니다.",
    ],
  },
};
