import { createClient } from "@supabase/supabase-js";

/**
 * サーバー専用。Server Components / Server Actions からのみ import すること。
 * SUPABASE_SERVICE_ROLE_KEY があれば RLS により行が0件になる問題を避けられる。
 * 未設定の場合は従来どおり anon キーにフォールバック。
 */
export function getSupabaseServer() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL が設定されていません");
  }
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("Supabase のキーが設定されていません");
  }
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
