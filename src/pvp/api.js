// Owns Supabase authentication and persistent PvP room RPC calls.
import { createClient } from "@supabase/supabase-js";
import { rankingConfig } from "../core/data.js";

const url = String(rankingConfig.url || "").trim();
const publishableKey = String(rankingConfig.anonKey || "").trim();

export const pvpBackendAvailable = Boolean(url && publishableKey);

const supabase = pvpBackendAvailable
  ? createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
  : null;
let sessionPromise = null;

function assertBackend() {
  if (!supabase) throw new Error("Supabase PvP 설정을 찾지 못했습니다.");
  return supabase;
}

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

export async function ensurePvpSession() {
  if (sessionPromise) return sessionPromise;
  const client = assertBackend();
  sessionPromise = (async () => {
    const sessionResult = await client.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    if (sessionResult.data.session?.user) return sessionResult.data.session.user;

    const signInResult = await client.auth.signInAnonymously();
    if (signInResult.error) throw signInResult.error;
    if (!signInResult.data.user) throw new Error("익명 PvP 세션을 생성하지 못했습니다.");
    return signInResult.data.user;
  })();
  try {
    return await sessionPromise;
  } finally {
    sessionPromise = null;
  }
}

export async function listPvpRooms(mode = null) {
  const client = assertBackend();
  return unwrap(await client.rpc("pvp_list_rooms", {
    requested_mode: mode || null,
    result_limit: 50,
  })) || [];
}

export async function listJoinedPvpRooms() {
  const client = assertBackend();
  const user = await ensurePvpSession();
  const memberships = unwrap(await client
    .from("pvp_room_players")
    .select("room_id, status, ready, health, credits, level, updated_at")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("updated_at", { ascending: false })) || [];
  const roomIds = [...new Set(memberships.map((entry) => entry.room_id).filter(Boolean))];
  if (!roomIds.length) return [];

  const [rooms, players] = await Promise.all([
    unwrap(await client
      .from("pvp_rooms")
      .select("id, code, name, mode, visibility, status, phase, max_players, current_round, async_turn_minutes, planning_seconds, game_version, revision, created_at, updated_at, started_at")
      .in("id", roomIds)
      .in("status", ["waiting", "running"])),
    unwrap(await client
      .from("pvp_room_players")
      .select("room_id, status")
      .in("room_id", roomIds)
      .neq("status", "left")),
  ]);
  const membershipByRoom = new Map(memberships.map((entry) => [entry.room_id, entry]));
  const playerCountByRoom = (players || []).reduce((counts, entry) => {
    counts.set(entry.room_id, (counts.get(entry.room_id) || 0) + 1);
    return counts;
  }, new Map());

  return (rooms || [])
    .map((room) => ({
      ...room,
      player_count: playerCountByRoom.get(room.id) || 0,
      membership: membershipByRoom.get(room.id) || null,
    }))
    .sort((left, right) => {
      const leftTime = Date.parse(left.membership?.updated_at || left.updated_at || left.created_at || 0);
      const rightTime = Date.parse(right.membership?.updated_at || right.updated_at || right.created_at || 0);
      return rightTime - leftTime;
    });
}

export async function savePvpPushSubscription(subscription) {
  const client = assertBackend();
  const user = await ensurePvpSession();
  const serialized = subscription?.toJSON?.() || subscription || {};
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) {
    throw new Error("푸시 구독 정보를 만들지 못했습니다.");
  }
  return unwrap(await client
    .from("pvp_push_subscriptions")
    .upsert({
      user_id: user.id,
      endpoint: serialized.endpoint,
      p256dh: serialized.keys.p256dh,
      auth: serialized.keys.auth,
      user_agent: navigator.userAgent.slice(0, 500),
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" })
    .select("id, endpoint")
    .single());
}

export async function removePvpPushSubscription(endpoint) {
  const client = assertBackend();
  const user = await ensurePvpSession();
  return unwrap(await client
    .from("pvp_push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint));
}

export async function createPvpRoom({
  name,
  nickname,
  mode,
  visibility,
  maxPlayers,
  asyncTurnMinutes,
  planningSeconds,
  gameVersion,
}) {
  const client = assertBackend();
  const rows = unwrap(await client.rpc("pvp_create_room", {
    room_name: name,
    player_nickname: nickname,
    room_mode: mode,
    room_visibility: visibility,
    room_max_players: maxPlayers,
    room_async_turn_minutes: asyncTurnMinutes,
    room_planning_seconds: planningSeconds,
    room_game_version: gameVersion,
  })) || [];
  return rows[0] || null;
}

export async function enqueueAsyncPvpMatch({ ticketId, nickname, gameVersion, snapshot, initialPool }) {
  const client = assertBackend();
  await ensurePvpSession();
  const rows = unwrap(await client.rpc("pvp_enqueue_async_match", {
    queue_ticket_id: ticketId,
    player_nickname: nickname,
    room_game_version: gameVersion,
    board_data: snapshot.board,
    bench_data: snapshot.bench,
    augments_data: snapshot.augments,
    traits_data: snapshot.traits,
    economy_data: snapshot.economy,
    pool_data: initialPool,
    snapshot_checksum: snapshot.checksum,
  })) || [];
  return rows[0] || null;
}

export async function listOwnAsyncMatchQueue() {
  const client = assertBackend();
  await ensurePvpSession();
  return unwrap(await client.rpc("pvp_list_own_async_queue")) || [];
}

export async function cancelAsyncPvpMatch(ticketId) {
  const client = assertBackend();
  return Boolean(unwrap(await client.rpc("pvp_cancel_async_match", {
    queue_ticket_id: ticketId,
  })));
}

export async function fillAsyncPvpQueueWithTestBots(ticketId) {
  const client = assertBackend();
  const rows = unwrap(await client.rpc("pvp_debug_fill_async_queue", {
    queue_ticket_id: ticketId,
  })) || [];
  return rows[0] || null;
}

export async function joinPvpRoom({ code, nickname }) {
  const client = assertBackend();
  const rows = unwrap(await client.rpc("pvp_join_room", {
    target_room_code: code,
    player_nickname: nickname,
  })) || [];
  return rows[0] || null;
}

export async function getPvpRoom(roomId) {
  const client = assertBackend();
  await ensurePvpSession();
  const room = unwrap(await client
    .from("pvp_rooms")
    .select("id, code, host_user_id, name, mode, visibility, status, phase, max_players, current_round, async_turn_minutes, planning_seconds, phase_deadline, game_version, seed, revision, created_at, started_at")
    .eq("id", roomId)
    .maybeSingle());
  if (!room) throw new Error("PvP room membership not found");
  return room;
}

export async function getJoinedPvpRoomByCode(code) {
  const client = assertBackend();
  return unwrap(await client
    .from("pvp_rooms")
    .select("id, code, status, phase")
    .eq("code", String(code || "").trim().toUpperCase())
    .maybeSingle());
}

export async function getPvpRoomPlayers(roomId) {
  const client = assertBackend();
  return unwrap(await client
    .from("pvp_room_players")
    .select("id, room_id, user_id, seat, nickname, status, ready, health, credits, level, is_bot, bot_difficulty, last_seen, joined_at")
    .eq("room_id", roomId)
    .neq("status", "left")
    .order("seat", { ascending: true })) || [];
}

export async function getPvpLumiShopClaims(roomId, round) {
  const client = assertBackend();
  return unwrap(await client
    .from("pvp_lumi_shop_claims")
    .select("room_id, round, product_id, player_id, claimed_at")
    .eq("room_id", roomId)
    .eq("round", Math.max(1, Number(round) || 1))
    .order("claimed_at", { ascending: true })) || [];
}

export async function preparePvpLumiShop(roomId, round, productIds) {
  const client = assertBackend();
  return unwrap(await client.rpc("pvp_prepare_lumi_shop", {
    target_room_id: roomId,
    target_round: Math.max(1, Number(round) || 1),
    offered_product_ids: [...new Set(productIds || [])],
  }));
}

export async function claimPvpLumiShopProduct(roomId, round, productId) {
  const client = assertBackend();
  const rows = unwrap(await client.rpc("pvp_claim_lumi_product", {
    target_room_id: roomId,
    target_round: Math.max(1, Number(round) || 1),
    target_product_id: String(productId || ""),
  })) || [];
  return rows[0] || null;
}

export async function getOwnPvpRoomPlayer(roomId) {
  const client = assertBackend();
  const user = await ensurePvpSession();
  return unwrap(await client
    .from("pvp_room_players")
    .select("id, room_id, user_id, seat, nickname, status, ready, health, credits, level, xp, is_bot, last_seen")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .neq("status", "left")
    .maybeSingle());
}

export async function getPvpSquadSnapshots(roomId) {
  const client = assertBackend();
  return unwrap(await client
    .from("pvp_squad_snapshots")
    .select("id, room_id, player_id, round, revision, board, bench, augments, traits, economy, submitted_at")
    .eq("room_id", roomId)
    .order("round", { ascending: false })
    .order("submitted_at", { ascending: false })) || [];
}

export async function setPvpReady(roomId, ready) {
  const client = assertBackend();
  const rows = unwrap(await client.rpc("pvp_set_ready", {
    target_room_id: roomId,
    next_ready: Boolean(ready),
  })) || [];
  return rows[0] || null;
}

export async function startPvpRoom(roomId, unitPool) {
  const client = assertBackend();
  const rows = unwrap(await client.rpc("pvp_start_room", {
    target_room_id: roomId,
    pool_data: unitPool || {},
  })) || [];
  return rows[0] || null;
}

export async function getPvpUnitPool(roomId) {
  const client = assertBackend();
  return unwrap(await client
    .from("pvp_unit_pool")
    .select("unit_name, initial_count, remaining_count")
    .eq("room_id", roomId)
    .order("unit_name", { ascending: true })) || [];
}

export async function takePvpUnit(roomId, unitName, count = 1) {
  const client = assertBackend();
  const rows = unwrap(await client.rpc("pvp_take_unit", {
    target_room_id: roomId,
    target_unit_name: unitName,
    requested_count: count,
  })) || [];
  return rows[0] || null;
}

export async function returnPvpUnit(roomId, unitName, count) {
  const client = assertBackend();
  const rows = unwrap(await client.rpc("pvp_return_unit", {
    target_room_id: roomId,
    target_unit_name: unitName,
    returned_count: count,
  })) || [];
  return rows[0] || null;
}

export async function syncPvpUnitHoldings(roomId, desiredCounts) {
  const client = assertBackend();
  return unwrap(await client.rpc("pvp_sync_unit_holdings", {
    target_room_id: roomId,
    desired_counts: desiredCounts || {},
  }));
}

export async function leavePvpRoom(roomId) {
  const client = assertBackend();
  return unwrap(await client.rpc("pvp_leave_room", {
    target_room_id: roomId,
  }));
}

export async function addPvpBot(roomId, difficulty = "normal") {
  const client = assertBackend();
  const rows = unwrap(await client.rpc("pvp_add_bot", {
    target_room_id: roomId,
    requested_difficulty: difficulty,
  })) || [];
  return rows[0] || null;
}

export async function removePvpBot(playerId) {
  const client = assertBackend();
  return unwrap(await client.rpc("pvp_remove_bot", {
    target_player_id: playerId,
  }));
}

export async function submitPvpPveSnapshot(roomId, snapshot) {
  const client = assertBackend();
  const rows = unwrap(await client.rpc("pvp_submit_pve_snapshot", {
    target_room_id: roomId,
    board_data: snapshot.board || [],
    bench_data: snapshot.bench || [],
    augments_data: snapshot.augments || [],
    traits_data: snapshot.traits || {},
    economy_data: snapshot.economy || {},
    snapshot_checksum: snapshot.checksum || null,
  })) || [];
  return rows[0] || null;
}

export async function reportPvpRealtimePveRound(roomId, round, battleResult) {
  const client = assertBackend();
  const rows = unwrap(await client.rpc("pvp_report_realtime_pve_round", {
    target_room_id: roomId,
    completed_round: Math.max(1, Math.min(4, Number(round) || 1)),
    battle_result: battleResult || {},
  })) || [];
  return rows[0] || null;
}

export async function submitPvpBotSnapshot(playerId, snapshot) {
  const client = assertBackend();
  return unwrap(await client.rpc("pvp_submit_bot_snapshot", {
    target_player_id: playerId,
    board_data: snapshot.board || [],
    bench_data: snapshot.bench || [],
    augments_data: snapshot.augments || [],
    traits_data: snapshot.traits || {},
    economy_data: snapshot.economy || {},
    snapshot_checksum: snapshot.checksum || null,
  }));
}

export async function submitPvpRoundSnapshot(roomId, snapshot) {
  const client = assertBackend();
  const rows = unwrap(await client.rpc("pvp_submit_round_snapshot", {
    target_room_id: roomId,
    board_data: snapshot.board || [],
    bench_data: snapshot.bench || [],
    augments_data: snapshot.augments || [],
    traits_data: snapshot.traits || {},
    economy_data: snapshot.economy || {},
    snapshot_checksum: snapshot.checksum || null,
  })) || [];
  return rows[0] || null;
}

export async function syncPvpRealtimeSnapshot(roomId, snapshot) {
  const client = assertBackend();
  const rows = unwrap(await client.rpc("pvp_sync_realtime_snapshot", {
    target_room_id: roomId,
    board_data: snapshot.board || [],
    bench_data: snapshot.bench || [],
    augments_data: snapshot.augments || [],
    traits_data: snapshot.traits || {},
    economy_data: snapshot.economy || {},
    snapshot_checksum: snapshot.checksum || null,
  })) || [];
  return rows[0] || null;
}

export async function preparePvpRound(roomId) {
  const client = assertBackend();
  const rows = unwrap(await client.rpc("pvp_prepare_round", {
    target_room_id: roomId,
  })) || [];
  return rows[0] || null;
}

export async function getPvpRoundMatch(roomId, round, playerId) {
  const client = assertBackend();
  const match = unwrap(await client
    .from("pvp_matches")
    .select("id, round, seed, status, home_player_id, away_player_id")
    .eq("room_id", roomId)
    .eq("round", round)
    .or(`home_player_id.eq.${playerId},away_player_id.eq.${playerId}`)
    .maybeSingle());
  if (!match) return null;

  const reporterIsHome = match.home_player_id === playerId;
  const opponentPlayerId = reporterIsHome ? match.away_player_id : match.home_player_id;
  const opponent = opponentPlayerId
    ? unwrap(await client
      .from("pvp_room_players")
      .select("nickname, health")
      .eq("id", opponentPlayerId)
      .maybeSingle())
    : null;

  return {
    match_id: match.id,
    match_round: match.round,
    match_seed: match.seed,
    match_status: match.status,
    home_player_id: match.home_player_id,
    away_player_id: match.away_player_id,
    opponent_player_id: opponentPlayerId,
    opponent_nickname: opponent?.nickname || null,
    opponent_health: Number(opponent?.health) || 0,
    reporter_is_home: reporterIsHome,
  };
}

export async function tickPvpRoom(roomId) {
  const client = assertBackend();
  const rows = unwrap(await client.rpc("pvp_tick_room", {
    target_room_id: roomId,
  })) || [];
  return rows[0] || null;
}

export async function getPvpPlayerSnapshot(roomId, playerId) {
  const client = assertBackend();
  const rows = unwrap(await client
    .from("pvp_squad_snapshots")
    .select("id, room_id, player_id, round, revision, board, bench, augments, traits, economy, submitted_at")
    .eq("room_id", roomId)
    .eq("player_id", playerId)
    .order("round", { ascending: false })
    .order("submitted_at", { ascending: false })
    .limit(1)) || [];
  return rows[0] || null;
}

async function getPvpPlayerSnapshotAtRound(roomId, playerId, round) {
  const client = assertBackend();
  const rows = unwrap(await client
    .from("pvp_squad_snapshots")
    .select("id, room_id, player_id, round, revision, board, bench, augments, traits, economy, submitted_at")
    .eq("room_id", roomId)
    .eq("player_id", playerId)
    .lte("round", Math.max(0, Number(round) || 0))
    .order("round", { ascending: false })
    .order("submitted_at", { ascending: false })
    .limit(1)) || [];
  return rows[0] || null;
}

export async function getLatestPvpReplay(roomId) {
  const client = assertBackend();
  const user = await ensurePvpSession();
  const player = unwrap(await client
    .from("pvp_room_players")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle());
  if (!player?.id) return null;

  const matches = unwrap(await client
    .from("pvp_matches")
    .select("id, round, seed, home_player_id, away_player_id, status")
    .eq("room_id", roomId)
    .eq("status", "finished")
    .or(`home_player_id.eq.${player.id},away_player_id.eq.${player.id}`)
    .order("round", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)) || [];
  const match = matches[0];
  if (!match?.away_player_id) return null;
  const opponentPlayerId = match.home_player_id === player.id ? match.away_player_id : match.home_player_id;
  const [ownSnapshot, opponentSnapshot, opponent] = await Promise.all([
    getPvpPlayerSnapshotAtRound(roomId, player.id, match.round),
    getPvpPlayerSnapshotAtRound(roomId, opponentPlayerId, match.round),
    unwrap(await client
      .from("pvp_room_players")
      .select("nickname")
      .eq("id", opponentPlayerId)
      .maybeSingle()),
  ]);
  if (!ownSnapshot || !opponentSnapshot) return null;
  return {
    matchId: match.id,
    round: match.round,
    seed: match.seed,
    opponentName: opponent?.nickname || "상대",
    ownSnapshot,
    opponentSnapshot,
  };
}

export async function reportPvpMatch(matchId, result) {
  const client = assertBackend();
  const rows = unwrap(await client.rpc("pvp_report_match", {
    target_match_id: matchId,
    reporter_won: Boolean(result?.won),
    reporter_damage: Math.max(0, Math.round(Number(result?.damage) || 0)),
    battle_result: result?.battleResult || {},
  })) || [];
  return rows[0] || null;
}
