import "server-only";
import { createClient } from "@/lib/supabase/server";
import { COVERAGE_ACTIVITY_TYPES, isPersonalTouch } from "@/lib/coverage";
import {
  buildLenderIndex,
  diagnose,
  externalId,
  matchMessages,
  type MatchDiagnostics,
  type MatchedMail,
} from "@/lib/mail-match";
import { listMessagesSince } from "./graph";
import { getConnection } from "./tokens";

/**
 * Turning the mailbox into coverage.
 *
 * The decisions all live in `lib/mail-match`; this fetches, asks what counts,
 * and writes. It is best effort in the same way the calendar sync is: a Graph
 * that won't answer leaves the app exactly as it was before anyone connected
 * an account, with a line in Settings saying when it last worked.
 */

/**
 * How far back the first sweep reaches.
 *
 * Ninety days corrects coverage across the whole list on day one, which is the
 * single most useful thing this feature does: everyone who has actually been
 * in touch stops reading overdue. Beyond that the returns fall away fast and
 * the noise does not.
 */
export const BACKFILL_DAYS = 90;

/**
 * Overlap re-read on every later sweep.
 *
 * Mail arrives out of order and Graph's clock is not this app's, so starting
 * exactly where the last run stopped would eventually drop a message in the
 * seam. Reading a day of old ground costs nothing, because the message id
 * makes a repeat a no-op.
 */
const OVERLAP_HOURS = 24;

export interface MailSyncResult {
  logged: number;
  scanned: number;
  ok: boolean;
  failure?: string;
  detail?: string;
  diagnostics?: MatchDiagnostics;
}

export async function syncMailbox(): Promise<MailSyncResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { logged: 0, scanned: 0, ok: false, failure: "not_signed_in" };

  const connection = await getConnection();
  if (!connection || connection.invalidatedAt) {
    return { logged: 0, scanned: 0, ok: false, failure: "not_connected" };
  }

  const [{ data: state }, { data: lenders }] = await Promise.all([
    supabase
      .from("mail_sync_state")
      .select("last_synced_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("lenders")
      .select("id, email, institution_id")
      .is("deleted_at", null)
      .not("email", "is", null),
  ]);

  const since = state?.last_synced_at
    ? new Date(new Date(state.last_synced_at).getTime() - OVERLAP_HOURS * 3_600_000)
    : new Date(Date.now() - BACKFILL_DAYS * 86_400_000);

  // The moment the sweep covers up to. Taken before the fetch so a message
  // arriving mid-sweep is re-read next time rather than missed.
  const ranAt = new Date();

  const fetched = await listMessagesSince(since);
  const lenderRows = lenders ?? [];
  const index = buildLenderIndex(lenderRows);
  const institutionOf = new Map(lenderRows.map((l) => [l.id, l.institution_id]));

  const selfAddresses = [connection.accountEmail, user.email].filter(
    (a): a is string => Boolean(a),
  );

  const candidates = matchMessages(fetched.messages, index, selfAddresses);
  const logged = await insertMatches(supabase, user.id, candidates, institutionOf);
  const diagnostics = diagnose(fetched.messages, index, selfAddresses);

  await supabase.from("mail_sync_state").upsert(
    {
      user_id: user.id,
      // Only a clean sweep moves the mark. A partial one leaves it where it
      // was so the next run re-covers what the failure interrupted.
      ...(fetched.ok ? { last_synced_at: ranAt.toISOString() } : {}),
      last_run_at: ranAt.toISOString(),
      last_result: fetched.ok ? "ok" : (fetched.failure ?? "unavailable"),
      last_logged_count: logged,
      // How many messages the sweep actually looked at. Without it, "logged
      // nothing" cannot be told apart from "saw nothing".
      last_scanned_count: fetched.messages.length,
      last_detail: fetched.detail ?? null,
      last_diagnostics: diagnostics,
    },
    { onConflict: "user_id" },
  );

  return {
    logged,
    scanned: fetched.messages.length,
    ok: fetched.ok,
    failure: fetched.failure,
    detail: fetched.detail,
    diagnostics,
  };
}

/**
 * Writes the matches, letting the database refuse the duplicates.
 *
 * `ignoreDuplicates` on the unique index is the dedupe, rather than reading
 * every external id back first: the check belongs where the constraint is, and
 * two sweeps racing each other then cannot both decide a message is new.
 */
async function insertMatches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  matches: readonly MatchedMail[],
  institutionOf: ReadonlyMap<string, string | null>,
): Promise<number> {
  if (matches.length === 0) return 0;

  const rows = matches.map((m) => ({
    user_id: userId,
    lender_id: m.lenderId,
    institution_id: institutionOf.get(m.lenderId) ?? null,
    activity_type: m.activityType,
    direction: m.direction,
    occurred_at: m.occurredAt,
    subject: m.subject,
    // Deliberately empty. The scan never fetches a body, so there is nothing
    // to put here and nothing to leak.
    summary: null,
    personal_touch: isPersonalTouch(m.activityType),
    counts_for_coverage: COVERAGE_ACTIVITY_TYPES.has(m.activityType),
    initiated_by_lender: m.initiatedByLender,
    source: "microsoft",
    external_id: externalId(m.messageId, m.lenderId),
  }));

  const { data, error } = await supabase
    .from("activities")
    .upsert(rows, { onConflict: "user_id,external_id", ignoreDuplicates: true })
    .select("id");

  if (error) {
    console.error("Mail sync could not write activities:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
