import { connection } from "next/server";
import { supabase, supabaseConfigured, supabaseKey, supabaseUrl } from "@/lib/supabase";

// Called once a day by a Vercel cron job (see vercel.json), and twice a day by
// a GitHub Actions workflow that calls the heartbeat directly. Free Supabase
// projects pause after a week without "sufficient activity", so each call
// writes a heartbeat to the database, reads a table and checks the sign-in
// service. Nothing sensitive is read: without a signed-in user, row level
// security returns no rows.
export async function GET(request: Request) {
  await connection();
  // When CRON_SECRET is set in Vercel, its cron sends it as a bearer token;
  // anyone else calling this URL is turned away.
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!supabaseConfigured) {
    return Response.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });
  }
  const [beat, read, auth] = await Promise.all([
    supabase.rpc("heartbeat"),
    supabase.from("households").select("id").limit(1),
    fetch(`${supabaseUrl}/auth/v1/health`, { headers: { apikey: supabaseKey! } }),
  ]);
  const error = beat.error?.message ?? read.error?.message ?? (auth.ok ? null : `auth ${auth.status}`);
  if (error) return Response.json({ ok: false, error }, { status: 502 });
  return Response.json({ ok: true, at: beat.data });
}
