"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

let instance: SupabaseClient | null = null;

/** Client Supabase côté navigateur (session dans les cookies, partagée avec le serveur). */
export function supabaseNavigateur(): SupabaseClient {
  if (!instance) instance = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return instance;
}
