import { createClient } from "@supabase/supabase-js";

// Accept the URL as copied from Supabase's Data API page ("…supabase.co/rest/v1/")
// as well as the bare project URL.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  .replace(/\/+$/, "")
  .replace(/\/(rest|auth)\/v1$/, "");
const key = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)?.trim();

export const supabaseConfigured = Boolean(url && key);

// The app talks to Supabase straight from the browser; row level security in
// the database decides what each signed-in user can see and change.
export const supabase = createClient(url ?? "http://localhost", key ?? "missing-key", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const FILES_BUCKET = "item-files";
