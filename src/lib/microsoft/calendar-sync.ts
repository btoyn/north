import "server-only";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { missingAttendees, responseChanges } from "@/lib/meeting-responses";
import { importableMeetings } from "@/lib/calendar-import";
import { MEETING_TYPE_DURATIONS } from "@/lib/labels";
import { createCalendarEvent, getEventResponses, listCalendarEvents } from "./graph";

/**
 * Putting a confirmed meeting on the real calendar.
 *
 * Best effort, always. By the time this runs he has pressed Confirm and the
 * meeting exists in North; a calendar that won't answer is a thing to tell
 * him about later, not a reason to undo what he just did. So every failure
 * here is swallowed, logged, and leaves `external_calendar_event_id` null —
 * which is exactly the state every meeting has had until now.
 */
export async function addConfirmedMeetingToCalendar(input: {
  meetingId: string;
  subject: string;
  start: Date;
  minutes: number;
  locationName: string | null;
  attendeeEmails: string[];
}): Promise<{ eventId?: string }> {
  const result = await createCalendarEvent({
    subject: input.subject,
    start: input.start,
    end: new Date(input.start.getTime() + input.minutes * 60_000),
    attendeeEmails: input.attendeeEmails,
    location: input.locationName,
  });

  if ("failure" in result) {
    // `not_connected` and `not_configured` are the normal state today, so they
    // are not worth a line in the log.
    if (result.failure !== "not_connected" && result.failure !== "not_configured") {
      console.error(
        `Calendar event not created for meeting ${input.meetingId}: ${result.failure}`,
        result.detail ?? "",
      );
    }
    return {};
  }

  const supabase = await createClient();
  await supabase
    .from("meetings")
    .update({
      external_calendar_event_id: result.eventId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.meetingId);

  return { eventId: result.eventId };
}

/**
 * How far back to keep asking the calendar about a meeting.
 *
 * People accept invitations late, sometimes on the morning of. A week past the
 * date is generous and keeps the sweep to a handful of requests; beyond that
 * the answer has stopped changing and the meeting is history.
 */
const RESPONSE_WINDOW_DAYS = 7;

/** At most this many events per sweep, so one run never walks a year of them. */
const MAX_EVENTS_PER_SYNC = 25;

export interface ResponseSyncResult {
  /** Meetings asked about. */
  checked: number;
  /** Attendee rows whose answer changed. */
  updated: number;
  /** Partners the calendar had and the meeting didn't. */
  added: number;
  /** Meetings whose time or cancellation the calendar corrected. */
  rescheduled: number;
  failure?: string;
}

/**
 * Reads back who accepted the invitation, for the meetings North booked.
 *
 * This is the other half of inviting the whole group. Two people reply by
 * email and the rest get a calendar invite; the ones who accept it in Outlook
 * never write a word, and without this their attendee row would sit at
 * `invited` forever and their coverage clock would never move, even though
 * they came to lunch.
 *
 * Best effort, like everything else that touches Graph. A calendar that will
 * not answer leaves every row exactly as it was.
 */
export async function syncMeetingResponses(): Promise<ResponseSyncResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { checked: 0, updated: 0, added: 0, rescheduled: 0, failure: "not_signed_in" };

  const since = new Date(Date.now() - RESPONSE_WINDOW_DAYS * 86_400_000).toISOString();

  const { data: meetings } = await supabase
    .from("meetings")
    .select("id, start_at, end_at, status, external_calendar_event_id, attendees:meeting_attendees(lender_id, response_status, lender:lenders(email))")
    .not("external_calendar_event_id", "is", null)
    .eq("status", "confirmed")
    .gte("start_at", since)
    .is("deleted_at", null)
    .order("start_at")
    .limit(MAX_EVENTS_PER_SYNC);

  // Addresses to partners, so a name on the invitation can be recognised. The
  // same index the mailbox sweep builds, and for the same reason.
  const { data: lenders } = await supabase
    .from("lenders")
    .select("id, email")
    .is("deleted_at", null)
    .not("email", "is", null);

  const lenderIdByEmail = new Map(
    (lenders ?? []).map((l) => [(l.email as string).trim().toLowerCase(), l.id as string]),
  );

  let checked = 0;
  let updated = 0;
  let added = 0;
  let rescheduled = 0;
  let failure: string | undefined;

  for (const meeting of meetings ?? []) {
    const rows = ((meeting.attendees ?? []) as unknown as {
      lender_id: string;
      response_status: string | null;
      lender: { email: string | null } | null;
    }[]).map((a) => ({
      lenderId: a.lender_id,
      email: a.lender?.email ?? null,
      responseStatus: a.response_status,
    }));
    if (rows.length === 0) continue;

    const result = await getEventResponses(meeting.external_calendar_event_id as string);
    checked += 1;

    if (result.failure) {
      // `gone` is ordinary: he deleted the event out of Outlook. Anything else
      // is worth reporting once rather than once per meeting.
      if (result.failure !== "gone") failure ??= result.failure;
      continue;
    }

    const event = result.event;
    if (!event) continue;
    const attendees = event.attendees;

    // Outlook is the truth about when it is. He drags a lunch an hour later or
    // calls it off there, and North has no way to know unless it asks -- which
    // is exactly how the app ended up insisting on 6pm for a noon lunch.
    const patch: Record<string, unknown> = {};
    if (event.cancelled && meeting.status !== "canceled") patch.status = "canceled";
    if (event.start && event.start.toISOString() !== new Date(meeting.start_at).toISOString()) {
      patch.start_at = event.start.toISOString();
      if (event.end) patch.end_at = event.end.toISOString();
    }
    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      const { error } = await supabase.from("meetings").update(patch).eq("id", meeting.id);
      if (!error) rescheduled += 1;
    }

    for (const change of responseChanges(rows, attendees)) {
      const { error } = await supabase
        .from("meeting_attendees")
        .update({ response_status: change.to })
        .eq("meeting_id", meeting.id)
        .eq("lender_id", change.lenderId);
      if (!error) updated += 1;
    }

    // Somebody he added to the invitation in Outlook. The calendar is the
    // truth about who was asked, so North catches up rather than disagreeing.
    const extra = missingAttendees(rows, attendees, lenderIdByEmail);
    if (extra.length > 0) {
      const { error } = await supabase.from("meeting_attendees").insert(
        extra.map((a) => ({
          user_id: user.id,
          meeting_id: meeting.id,
          lender_id: a.lenderId,
          response_status: a.responseStatus,
        })),
      );
      if (!error) added += extra.length;
    }
  }

  // Somebody accepting is a coverage change, so the screens that read it have
  // to be told.
  if (updated > 0 || added > 0 || rescheduled > 0) {
    revalidatePath("/dashboard");
    revalidatePath("/tiers");
  }

  return { checked, updated, added, rescheduled, failure };
}

/**
 * How far either way the import reaches.
 *
 * Back ninety days for the same reason the mailbox sweep does: the coverage
 * picture is wrong until the meetings that already happened are in it. Forward
 * far enough that Up next is actually next, and no further -- a lunch six
 * months out is not something he is deciding about today.
 */
const IMPORT_BACK_DAYS = 90;
const IMPORT_FORWARD_DAYS = 120;

export interface CalendarImportResult {
  /** Events read. */
  scanned: number;
  /** Meetings created from them. */
  imported: number;
  ok: boolean;
  failure?: string;
}

/**
 * Brings in meetings with partners that North did not book.
 *
 * He arranges most things over email and always has. A lunch set up in a
 * thread, or one a banker put in his calendar, used to be invisible here: not
 * in Up next, not on anybody's clock, so North would report a partner going
 * cold in the week he took them to lunch. The calendar knows. It just was
 * never asked.
 *
 * Who is on the event decides it, never the subject -- a naming convention is
 * a thing to forget, and it would still miss every invitation he did not send.
 */
export async function importCalendarMeetings(): Promise<CalendarImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { scanned: 0, imported: 0, ok: false, failure: "not_signed_in" };

  const from = new Date(Date.now() - IMPORT_BACK_DAYS * 86_400_000);
  const to = new Date(Date.now() + IMPORT_FORWARD_DAYS * 86_400_000);

  const [fetched, { data: lenders }, { data: known }] = await Promise.all([
    listCalendarEvents(from, to),
    supabase
      .from("lenders")
      .select("id, email, institution_id, territory")
      .is("deleted_at", null)
      .not("email", "is", null),
    supabase
      .from("meetings")
      .select("external_calendar_event_id")
      .not("external_calendar_event_id", "is", null),
  ]);

  const lenderRows = lenders ?? [];
  const lenderIdByEmail = new Map(
    lenderRows.map((l) => [(l.email as string).trim().toLowerCase(), l.id as string]),
  );
  const detailsOf = new Map(
    lenderRows.map((l) => [
      l.id as string,
      { institutionId: l.institution_id as string | null, territory: l.territory as string | null },
    ]),
  );

  // Deleted meetings count as known. Re-importing something he threw away
  // would be the app arguing with him.
  const knownIds = new Set(
    (known ?? []).map((m) => m.external_calendar_event_id as string),
  );

  const candidates = importableMeetings(fetched.events, lenderIdByEmail, knownIds);

  let imported = 0;
  for (const candidate of candidates) {
    const first = detailsOf.get(candidate.partners[0].lenderId);
    const minutes = MEETING_TYPE_DURATIONS[candidate.meetingType] ?? 60;
    const endAt =
      candidate.endAt ?? new Date(candidate.startAt.getTime() + minutes * 60_000);

    const { data: meeting, error } = await supabase
      .from("meetings")
      .insert({
        user_id: user.id,
        institution_id: first?.institutionId ?? null,
        meeting_type: candidate.meetingType,
        title: candidate.title,
        status: "confirmed",
        confirmed: true,
        tentative: false,
        start_at: candidate.startAt.toISOString(),
        end_at: endAt.toISOString(),
        location_name: candidate.locationName,
        territory: first?.territory ?? null,
        notes_status: "pending",
        external_calendar_event_id: candidate.eventId,
      })
      .select("id")
      .single();

    if (error || !meeting) continue;

    const { error: attendeeError } = await supabase.from("meeting_attendees").insert(
      candidate.partners.map((p) => ({
        user_id: user.id,
        meeting_id: meeting.id,
        lender_id: p.lenderId,
        response_status: p.responseStatus,
      })),
    );
    if (!attendeeError) imported += 1;
  }

  if (imported > 0) {
    revalidatePath("/dashboard");
    revalidatePath("/tiers");
  }

  return {
    scanned: fetched.events.length,
    imported,
    ok: fetched.ok,
    failure: fetched.failure,
  };
}
