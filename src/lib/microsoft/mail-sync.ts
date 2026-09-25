import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { COVERAGE_ACTIVITY_TYPES, isPersonalTouch } from "@/lib/coverage";
import {
  MAIL_ACTIVITY_SOURCE,
  buildLenderIndex,
  diagnose,
  externalId,
  matchMessages,
  type MatchDiagnostics,
  type MatchedMail,
} from "@/lib/mail-match";
import { detectReplies } from "@/lib/proposal-replies";
import { getReplyText, listMessagesSince } from "./graph";
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
  /** Open meeting asks this sweep noticed an answer to. */
  repliesFound: number;
  /** Of those, how many the sweep could pull the text of. */
  repliesFetched?: number;
  /** Why a reply's text could not be fetched, when one could not. */
  replyNotes?: string[];
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
  if (!user) {
    return { logged: 0, repliesFound: 0, scanned: 0, ok: false, failure: "not_signed_in" };
  }

  const connection = await getConnection();
  if (!connection || connection.invalidatedAt) {
    return { logged: 0, repliesFound: 0, scanned: 0, ok: false, failure: "not_connected" };
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
  const write = await insertMatches(supabase, user.id, candidates, institutionOf);
  const logged = write.inserted;
  const diagnostics = diagnose(fetched.messages, index, selfAddresses);
  const replies = await markProposalReplies(supabase, candidates);

  await supabase.from("mail_sync_state").upsert(
    {
      user_id: user.id,
      // Only a sweep that both read and saved moves the mark. Fetching cleanly
      // and failing every insert used to count as clean, which quietly burned
      // the ninety-day backfill on runs that wrote nothing.
      ...(fetched.ok && !write.error ? { last_synced_at: ranAt.toISOString() } : {}),
      last_run_at: ranAt.toISOString(),
      last_result: write.error
        ? "write_failed"
        : fetched.ok
          ? "ok"
          : (fetched.failure ?? "unavailable"),
      last_logged_count: logged,
      // How many messages the sweep actually looked at. Without it, "logged
      // nothing" cannot be told apart from "saw nothing".
      last_scanned_count: fetched.messages.length,
      last_detail: write.error ?? replies.notes.join("; ") ?? fetched.detail ?? null,
      last_diagnostics: diagnostics,
    },
    { onConflict: "user_id" },
  );

  return {
    logged,
    repliesFound: replies.marked,
    repliesFetched: replies.fetched,
    replyNotes: replies.notes,
    scanned: fetched.messages.length,
    ok: fetched.ok && !write.error,
    failure: write.error ? "write_failed" : fetched.failure,
    detail: write.error ?? fetched.detail,
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
): Promise<{ inserted: number; error?: string }> {
  if (matches.length === 0) return { inserted: 0 };

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
    source: MAIL_ACTIVITY_SOURCE,
    external_id: externalId(m.messageId, m.lenderId),
  }));

  // `count` rather than the returned rows: an upsert that ignores duplicates
  // comes back with an empty representation even when it inserted hundreds, so
  // reading data.length reported a completed ninety-day backfill as zero.
  const { data, error, count } = await supabase
    .from("activities")
    .upsert(rows, {
      onConflict: "user_id,external_id",
      ignoreDuplicates: true,
      count: "exact",
    })
    .select("id");

  // A write that fails has to reach the person looking at the screen. Sending
  // it to the console and reporting "0 logged" is how two separate constraint
  // failures here looked exactly like an empty mailbox.
  if (error) return { inserted: 0, error: error.message };
  return { inserted: count ?? data?.length ?? 0 };
}


/**
 * Marks the people who answered an open meeting ask, and fetches what they
 * wrote.
 *
 * It stops there. `reply_intent` and `slot_verdicts` are left alone, and
 * `reply_read_at` stays null, because interpreting the words is wall-clock
 * work and this runs in UTC. The screens pick it up from there. Until they do,
 * answered-but-undecided is what the dashboard reads to say somebody is
 * waiting on him.
 *
 * Best effort, like the rest of the sweep. A proposal that cannot be updated is
 * not a reason to throw away the mail that was just logged.
 */
async function markProposalReplies(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matched: readonly MatchedMail[],
): Promise<{ marked: number; fetched: number; notes: string[] }> {
  const inbound = matched
    .filter((m) => m.direction === "inbound")
    .map((m) => ({ lenderId: m.lenderId, occurredAt: m.occurredAt }));
  const notes: string[] = [];
  if (inbound.length === 0) return { marked: 0, fetched: 0, notes };

  const { data: rows } = await supabase
    .from("meeting_proposal_attendees")
    .select(
      "proposal_id, lender_id, replied_at, proposal:meeting_proposals(sent_at, status, offered_slots)",
    )
    .is("replied_at", null);

  const slotsByProposal = new Map<string, string[]>();
  const open = (rows ?? [])
    .map((r) => {
      const proposal = r.proposal as unknown as {
        sent_at: string | null;
        status: string;
        offered_slots: string[] | null;
      } | null;
      if (proposal?.offered_slots) {
        slotsByProposal.set(r.proposal_id as string, proposal.offered_slots);
      }
      return {
        proposalId: r.proposal_id as string,
        lenderId: r.lender_id as string,
        proposalSentAt: proposal?.status === "sent" ? (proposal.sent_at ?? null) : null,
        repliedAt: r.replied_at as string | null,
      };
    })
    .filter((a) => a.proposalSentAt);

  const found = detectReplies(open, inbound);
  const messageFor = new Map(
    matched
      .filter((m) => m.direction === "inbound")
      .map((m) => [`${m.lenderId}:${m.occurredAt}`, m.messageId]),
  );
  let marked = 0;
  let fetched = 0;

  for (const reply of found) {
    const update: Record<string, unknown> = {
      replied_at: reply.repliedAt,
      updated_at: new Date().toISOString(),
    };

    // Pull the text for this one message. Graph is the only part of this that
    // has to happen here, because the token does.
    const messageId = messageFor.get(`${reply.lenderId}:${reply.repliedAt}`);
    const slots = slotsByProposal.get(reply.proposalId) ?? [];

    // Every branch that skips the fetch says so. Silently marking "they
    // replied" and leaving the text blank is indistinguishable from a reply
    // the reader abstained on, and that ambiguity has cost two rounds already.
    if (!messageId) {
      notes.push("no message id for a detected reply");
    } else if (slots.length === 0) {
      notes.push("proposal had no offered slots");
    } else {
      const { text, failure } = await getReplyText(messageId);
      if (failure) {
        notes.push(`reply text unavailable: ${failure}`);
      } else if (!text) {
        notes.push("reply text came back empty");
      } else {
        // Store the words, decide nothing. Reading them is wall-clock work —
        // "Thursday works" only means a date if you know what today is — and
        // this runs on a server whose today is UTC. The browser finishes the
        // job, against his clock, and `reply_read_at` stays null until it has.
        update.reply_text = text;
        fetched += 1;
      }
    }

    const { error } = await supabase
      .from("meeting_proposal_attendees")
      .update(update)
      .eq("proposal_id", reply.proposalId)
      .eq("lender_id", reply.lenderId)
      .is("replied_at", null);
    if (!error) marked += 1;
  }

  if (marked > 0) revalidatePath("/dashboard");
  return { marked, fetched, notes: [...new Set(notes)] };
}
