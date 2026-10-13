// Supabase Edge Function: sends one durable PvP push event to every subscribed device.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "https://rumia-tatcics.onrender.com/";
const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET") || "";

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!webhookSecret || request.headers.get("x-push-secret") !== webhookSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const input = await request.json().catch(() => ({}));
  const eventId = input.event_id || input.record?.id;
  if (!eventId) return json({ error: "Missing event_id" }, 400);

  const { data: event, error: claimError } = await supabase
    .from("pvp_push_events")
    .update({ status: "sending", attempts: 1 })
    .eq("id", eventId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (claimError) return json({ error: claimError.message }, 500);
  if (!event) return json({ ok: true, skipped: true });

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("pvp_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", event.user_id);
  if (subscriptionError) return json({ error: subscriptionError.message }, 500);

  const payload = JSON.stringify({
    title: event.title,
    body: event.body,
    tag: event.event_key,
    url: event.target_url,
    icon: "/assets/characters/000_Dr.Nadja.png",
    badge: "/assets/characters/000_Dr.Nadja.png",
    app_badge: event.badge_count,
  });
  let delivered = 0;
  const errors: string[] = [];

  for (const subscription of subscriptions || []) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 60 * 60 * 24 });
      delivered += 1;
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode) || 0;
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from("pvp_push_subscriptions").delete().eq("id", subscription.id);
      } else {
        errors.push(String((error as Error)?.message || error));
      }
    }
  }

  await supabase.from("pvp_push_events").update({
    status: errors.length && delivered === 0 ? "failed" : "delivered",
    delivered_at: new Date().toISOString(),
    last_error: errors.slice(0, 3).join(" | ") || null,
  }).eq("id", event.id);

  return json({ ok: true, delivered, failed: errors.length });
});
