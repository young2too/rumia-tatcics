// Provides one shared Supabase client so authentication and Realtime channels use the same connection.
import { createClient } from "@supabase/supabase-js";

const clients = new Map();

export function getSharedSupabaseClient(url, publishableKey) {
  const normalizedUrl = String(url || "").trim();
  const normalizedKey = String(publishableKey || "").trim();
  if (!normalizedUrl || !normalizedKey) return null;
  const cacheKey = `${normalizedUrl}\n${normalizedKey}`;
  if (!clients.has(cacheKey)) {
    clients.set(cacheKey, createClient(normalizedUrl, normalizedKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    }));
  }
  return clients.get(cacheKey);
}
