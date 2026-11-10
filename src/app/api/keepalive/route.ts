import { connection } from "next/server";
import { supabase, supabaseConfigured } from "@/lib/supabase";

// Called once a day by a Vercel cron job (see vercel.json). Free Supabase
// projects pause after a week without activity; a tiny query keeps it awake.
// It reads nothing sensitive: without a signed-in user, row level security
// returns no rows.
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
  const { error } = await supabase.from("households").select("id").limit(1);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 502 });
  return Response.json({ ok: true, at: new Date().toISOString() });
}
