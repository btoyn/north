import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncMailbox } from "@/lib/microsoft/mail-sync";

/**
 * Runs the mailbox sweep for whoever is signed in.
 *
 * Driven from the browser rather than a cron, which is what lets it run as the
 * user: every read and write goes through their own session, so row-level
 * security is the same wall it is everywhere else and no service key has to
 * exist for this feature. The cost is that the sweep happens while somebody is
 * using the app, which is also when it matters.
 *
 * POST only. A GET here would be prefetched by a browser and turn into a
 * mailbox scan nobody asked for.
 */

/** Left alone for this long between automatic sweeps. */
const MIN_MINUTES_BETWEEN_RUNS = 30;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const force = new URL(request.url).searchParams.get("force") === "1";

  if (!force) {
    const { data: state } = await supabase
      .from("mail_sync_state")
      .select("last_run_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (state?.last_run_at) {
      const minutes = (Date.now() - new Date(state.last_run_at).getTime()) / 60_000;
      if (minutes < MIN_MINUTES_BETWEEN_RUNS) {
        return NextResponse.json({ skipped: "too_soon" });
      }
    }
  }

  const result = await syncMailbox();
  return NextResponse.json(result);
}
