"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MEETING_TYPE_DURATIONS } from "@/lib/labels";
import { logAudit } from "@/lib/audit";
import { loadSchedulingWindow, type CalendarSource } from "@/lib/scheduling-window";
import { addConfirmedMeetingToCalendar } from "@/lib/microsoft/calendar-sync";
import { calendarSubject, firstNameOf } from "@/lib/calendar-event";
import type { AvailabilityRule } from "@/lib/scheduling";

/**
 * Server side of the propose-a-meeting flow (spec §15).
 *
 * Deliberately thin. Choosing dates and reading replies both depend on
 * wall-clock time, and the browser is the only place that reliably knows which
 * wall clock Brandon is on — so that logic lives client-side in
 * `lib/scheduling` and `lib/reply-reader`, and these actions persist what it
 * decided. The split also keeps both pieces pure and unit-tested.
 */

export interface ProposalContext {
  lender: {
    id: string;
    fullName: string;
    firstName: string;
    email: string | null;
    /** Where the rest of the team is, for the "invite others" path. */
    institutionId: string | null;
    institutionName: string | null;
  };
  rules: AvailabilityRule[];
  horizonDays: number;
  slotCount: number;
  /** Meetings and dates already promised elsewhere, as ISO strings. */
  busy: { start: string; end: string }[];
  /** Whether those blocks include his real Outlook calendar. */
  calendar: CalendarSource;
  daysSinceContact: number | null;
}

const MINUTE = 60_000;

export async function getProposalContext(
  lenderId: string,
): Promise<{ context?: ProposalContext; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const now = new Date();
  const [{ data: lender }, window, { data: lastTouch }] = await Promise.all([
    supabase
      .from("lenders")
      .select("id, full_name, first_name, email, institution_id, institution:institutions(name)")
      .eq("id", lenderId)
      .is("deleted_at", null)
      .maybeSingle(),
    loadSchedulingWindow(supabase, now),
    supabase
      .from("activities")
      .select("occurred_at")
      .eq("lender_id", lenderId)
      .eq("personal_touch", true)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!lender) return { error: "Partner not found." };

  const daysSinceContact = lastTouch?.occurred_at
    ? Math.floor((now.getTime() - new Date(lastTouch.occurred_at).getTime()) / 86_400_000)
    : null;

  return {
    context: {
      lender: {
        id: lender.id,
        fullName: lender.full_name,
        firstName: lender.first_name,
        email: lender.email,
        institutionId: lender.institution_id,
        institutionName:
          (lender.institution as unknown as { name: string } | null)?.name ?? null,
      },
      rules: window.rules,
      horizonDays: window.horizonDays,
      slotCount: window.slotCount,
      busy: window.busy,
      calendar: window.calendar,
      daysSinceContact,
    },
  };
}

export interface SaveProposalInput {
  lenderId: string;
  meetingType: string;
  customLabel?: string | null;
  /** ISO instants, in the order they appear in the email. */
  offeredSlots: string[];
  locationName?: string | null;
  subject: string;
  body: string;
  /** True once he's handed it to Outlook — starts the waiting clock. */
  markSent: boolean;
}

export async function saveProposal(
  input: SaveProposalInput,
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  if (input.offeredSlots.length === 0) return { error: "Pick at least one date to offer." };
  if (input.offeredSlots.length > 3) return { error: "Three dates is the most to offer at once." };
  if (!input.body.trim()) return { error: "The message is empty." };

  const { data, error } = await supabase
    .from("meeting_proposals")
    .insert({
      user_id: user.id,
      lender_id: input.lenderId,
      meeting_type: input.meetingType,
      custom_label: input.customLabel?.trim() || null,
      offered_slots: input.offeredSlots,
      location_name: input.locationName?.trim() || null,
      message_subject: input.subject.trim(),
      message_body: input.body,
      status: input.markSent ? "sent" : "draft",
      sent_at: input.markSent ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not save the proposal." };

  await logAudit(supabase, user.id, {
    entityType: "meeting_proposal",
    entityId: data.id,
    action: "create",
    newValue: { meetingType: input.meetingType, offeredSlots: input.offeredSlots },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/partners/${input.lenderId}`);
  return { id: data.id };
}

/** Marks a saved draft as sent, starting the clock on a reply. */
export async function markProposalSent(proposalId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("meeting_proposals")
    .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("status", "draft");
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return {};
}

export interface RecordReplyInput {
  proposalId: string;
  replyText: string;
  /** What the reader made of it — resolved in the browser, in local time. */
  intent: "accepted" | "declined" | "countered" | "unclear";
  /** Agreed or proposed instant, when there is one. */
  slot: string | null;
  /** Whether a counter-offer falls outside the availability rules. */
  conflicts?: boolean;
}

/**
 * Records a reply. An accepted date is *not* booked here — booking is a
 * separate, explicit step, so a misread reply can never put a meeting on a
 * partner's calendar on its own.
 */
export async function recordProposalReply(
  input: RecordReplyInput,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!input.replyText.trim()) return { error: "Paste their reply first." };

  const status =
    input.intent === "accepted"
      ? "accepted"
      : input.intent === "declined"
        ? "declined"
        : input.intent === "countered"
          ? "countered"
          : "sent"; // unclear leaves it waiting, with the text kept for him

  const { error } = await supabase
    .from("meeting_proposals")
    .update({
      reply_text: input.replyText,
      replied_at: new Date().toISOString(),
      status,
      countered_slot: input.intent === "countered" ? input.slot : null,
      countered_conflicts: input.intent === "countered" ? (input.conflicts ?? null) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.proposalId);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return {};
}

/**
 * Turns an agreed date into a real meeting.
 *
 * Today that is a CRM record and he sends the calendar invitation himself.
 * Once Microsoft is connected this is where the Graph call goes — the callers
 * and the screens do not change.
 */
export async function bookProposal(
  proposalId: string,
  startAtIso: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const start = new Date(startAtIso);
  if (Number.isNaN(start.getTime())) return { error: "That date didn't look valid." };

  const { data: proposal } = await supabase
    .from("meeting_proposals")
    .select("id, lender_id, meeting_type, custom_label, location_name")
    .eq("id", proposalId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!proposal) return { error: "Proposal not found." };

  const { data: lender } = await supabase
    .from("lenders")
    .select("full_name, institution_id, territory, email")
    .eq("id", proposal.lender_id)
    .maybeSingle();
  if (!lender) return { error: "Partner not found." };

  const minutes = MEETING_TYPE_DURATIONS[proposal.meeting_type] ?? 60;
  const label = proposal.custom_label?.trim() || proposal.meeting_type.replace(/_/g, " ");

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .insert({
      user_id: user.id,
      institution_id: lender.institution_id,
      meeting_type: proposal.meeting_type,
      custom_label: proposal.custom_label?.trim() || null,
      title: `${label} with ${lender.full_name}`,
      status: "confirmed",
      confirmed: true,
      tentative: false,
      start_at: start.toISOString(),
      end_at: new Date(start.getTime() + minutes * MINUTE).toISOString(),
      location_name: proposal.location_name,
      territory: lender.territory,
      notes_status: "pending",
    })
    .select("id")
    .single();

  if (meetingError || !meeting) {
    return { error: meetingError?.message ?? "Could not create the meeting." };
  }

  const { error: attendeeError } = await supabase.from("meeting_attendees").insert({
    user_id: user.id,
    meeting_id: meeting.id,
    lender_id: proposal.lender_id,
    response_status: "confirmed",
  });
  if (attendeeError) return { error: attendeeError.message };

  // Best effort: the meeting is booked in North either way. A calendar that
  // won't answer must not undo a confirmation he already pressed.
  await addConfirmedMeetingToCalendar({
    meetingId: meeting.id,
    // North's own title names the partner; the invitation names him, because
    // the partner is the one reading it.
    subject: calendarSubject({
      meetingType: proposal.meeting_type,
      customLabel: proposal.custom_label,
      organizerFirstName: firstNameOf(user.user_metadata?.display_name as string | undefined),
    }),
    start,
    minutes,
    locationName: proposal.location_name,
    attendeeEmails: lender.email ? [lender.email] : [],
  });

  await supabase
    .from("meeting_proposals")
    .update({ status: "booked", meeting_id: meeting.id, updated_at: new Date().toISOString() })
    .eq("id", proposalId);

  revalidatePath("/dashboard");
  revalidatePath(`/partners/${proposal.lender_id}`);
  return {};
}

/** Records that he chased a silent proposal, so it stops nagging today. */
export async function nudgeProposal(proposalId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("meeting_proposals")
    .update({ last_nudged_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", proposalId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return {};
}

export async function cancelProposal(proposalId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("meeting_proposals")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", proposalId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return {};
}
