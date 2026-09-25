import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncMailbox } from "@/lib/microsoft/mail-sync";
import { importCalendarMeetings, syncMeetingResponses } from "@/lib/microsoft/calendar-sync";

/**
 * Everything North asks Microsoft for, for whoever is signed in: the mailbox
 * sweep, who accepted the invitations it sent, and the meetings with partners
 * it never knew about.
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

/**
 * A ninety-day backfill is tens of Graph round trips and will not finish inside
 * the default ten seconds. Everyday sweeps take one request and return long
 * before this.
 */
export const maxDuration = 120;

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

  // The other direction: who accepted the invitations North sent. Same run and
  // same session, because it answers the same question he presses this for --
  // has anything happened since I last looked.
  const responses = await syncMeetingResponses();

  // And the meetings he never booked through North at all. Most of what he
  // arranges is arranged over email, and until this ran none of it was here.
  const calendar = await importCalendarMeetings();

  return NextResponse.json({ ...result, responses, calendar });
}
