# Lumia Tactics

이터널 리턴 캐릭터 이름을 활용한 팬 오토체스 웹 프로토타입입니다.

## 실행

현재 로컬 서버:

```text
http://127.0.0.1:8765
```

렌더러 서버:
```text
https://rumia-tatcics.onrender.com
```

정적 파일만으로 동작하므로 `index.html`을 브라우저로 직접 열어도 됩니다.

## 구현된 기능

- 캐릭터 상점, 새로고침, 구매
- 벤치와 보드
- 드래그 배치와 클릭 배치
- 라운드별 자동 전투
- 크레딧, 체력, 레벨업
- 2성/3성 합성
- 역할 기반 시너지(사실상 장식용. 밸런스 패치같은건 미래의 일)

## TODO
- 하드코딩된 유닛들 시너지와 스탯 DB로 옮김
- 스킬 구현(사실 이름만 있는것들)
- 코드 리팩토링중...

## PvP 웹 푸시 배포

1. Supabase SQL Editor에서 `supabase-pvp-push-notifications.sql`을 실행합니다.
2. `supabase/functions/pvp-push-dispatch`를 `--no-verify-jwt` 옵션으로 배포합니다.
3. Edge Function secrets에 `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_WEBHOOK_SECRET`을 설정합니다.
4. Supabase Database Webhooks에서 `pvp_push_events`의 `INSERT` 이벤트를 Edge Function에 연결합니다.
5. Webhook 요청 헤더에 `x-push-secret: <PUSH_WEBHOOK_SECRET>`을 추가합니다.

클라이언트의 VAPID 공개 키는 `config.js`의 `push.vapidPublicKey`와 같아야 합니다. 브라우저가 열려 있을 때의 PvP 배지와 게임 내 토스트는 Edge Function 없이도 동작하지만, 브라우저가 닫힌 상태의 OS 푸시는 위 설정이 모두 필요합니다.

## 비동기 PvP 매칭 큐

기본 PvP 스키마와 로비 마이그레이션, 푸시 알림 SQL을 적용한 뒤 `supabase-pvp-matchmaking-queue.sql`을 실행합니다. 비동기 플레이어는 각자 4라운드 PvE와 첫 증강 선택을 마친 덱을 큐에 등록하며, 같은 버전과 증강 등급의 서로 다른 사용자 8명이 모이면 내부 진행 방이 자동 생성됩니다. 공개 방 만들기는 실시간 PvP에만 사용합니다.
