-- 시너지 대격변 시즌 시작 시 기존 PvP 대기열과 모든 방 데이터를 초기화합니다.
-- pvp_rooms 하위의 참가자, 스냅샷, 매치, 공유 풀, 보유 기물, 방 채팅,
-- 루미 상점 선택 및 방 단위 푸시 이벤트는 외래 키 cascade로 함께 삭제됩니다.

begin;

delete from public.pvp_matchmaking_queue;
delete from public.pvp_rooms;

commit;
