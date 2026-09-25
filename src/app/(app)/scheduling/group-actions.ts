"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { MEETING_TYPE_DURATIONS, MEETING_TYPE_LABELS } from "@/lib/labels";
import { loadSchedulingWindow, type CalendarSource } from "@/lib/scheduling-window";
import { addConfirmedMeetingToCalendar } from "@/lib/microsoft/calendar-sync";
import { formatNameList, type SlotVerdict } from "@/lib/group-proposal";
import type { AvailabilityRule } from "@/lib/scheduling";

/**
 * Server side of the group meeting flow.
 *
 * Same division of labour as the single-partner actions: dates and replies are
 * worked out in the browser, where the wall clock is his, and these functions
 * persist what he decided. Nothing here sends an email or books anything on
 * its own.
 *
 * Every one of these re-reads the partners it was handed. The picker only ever
 * offers people at the right bank with an address to write to, but the picker
 * is a screen, not a boundary.
 */

const MINUTE = 60_000;
const VERDICTS = new Set<SlotVerdict>(["yes", "no", "unclear"]);

export interface GroupAttendeeOption {
  id: string;
  fullName: string;
  firstName: string;
  email: string | null;
  territory: string | null;
  title: string | null;
}

export interface GroupProposalContext {
  institution: { id: string; name: string; territory: string | null };
  /** Everyone at the bank, including people who can't be emailed. */
  lenders: GroupAttendeeOption[];
  /**
   * The territory this meeting is being planned in, which the picker filters
   * to. Six banks have people in both the Wasatch Front and Southern Utah and
   * those are different trips.
   */
  planningTerritory: string | null;
  rules: AvailabilityRule[];
  horizonDays: number;
  slotCount: number;
  busy: { start: string; end: string }[];
  /** Whether those blocks include his real Outlook calendar. */
  calendar: CalendarSource;
}

export async function getGroupProposalContext(
  institutionId: string,
): Promise<{ context?: GroupProposalContext; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const now = new Date();
  const [{ data: institution }, { data: lenders }, window] = await Promise.all([
    supabase
      .from("institutions")
      .select("id, name, territory")
      .eq("id", institutionId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("lenders")
      .select("id, full_name, first_name, email, territory, title")
      .eq("institution_id", institutionId)
      .eq("active", true)
      .eq("do_not_contact", false)
      .is("deleted_at", null)
      .order("full_name"),
    loadSchedulingWindow(supabase, now),
  ]);

  if (!institution) return { error: "Institution not found." };

  const people = (lenders ?? []).map((l) => ({
    id: l.id,
    fullName: l.full_name,
    firstName: l.first_name,
    email: l.email,
    territory: l.territory,
    title: l.title,
  }));

  return {
    context: {
      institution,
      lenders: people,
      planningTerritory: institution.territory ?? commonestTerritory(people),
      rules: window.rules,
      horizonDays: window.horizonDays,
      slotCount: window.slotCount,
      busy: window.busy,
      calendar: window.calendar,
    },
  };
}

/** Where most of this bank's people are, when the bank itself doesn't say. */
function commonestTerritory(people: GroupAttendeeOption[]): string | null {
  const counts = new Map<string, number>();
  for (const p of people) {
    if (!p.territory) continue;
    counts.set(p.territory, (counts.get(p.territory) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [territory, n] of counts) {
    if (best === null || n > (counts.get(best) ?? 0)) best = territory;
  }
  return best;
}

export interface SaveGroupProposalInput {
  institutionId: string;
  /** Everyone ticked in the picker. */
  lenderIds: string[];
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

export async function saveGroupProposal(
  input: SaveGroupProposalInput,
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  if (input.lenderIds.length === 0) return { error: "Pick at least one person to invite." };
  if (input.offeredSlots.length === 0) return { error: "Pick at least one date to offer." };
  if (input.offeredSlots.length > 3) return { error: "Three dates is the most to offer at once." };
  if (!input.body.trim()) return { error: "The message is empty." };

  // One email to all of them, so everyone on it needs an address.
  const { data: invitees } = await supabase
    .from("lenders")
    .select("id")
    .in("id", input.lenderIds)
    .eq("institution_id", input.institutionId)
    .not("email", "is", null)
    .is("deleted_at", null);

  if ((invitees ?? []).length !== input.lenderIds.length) {
    return { error: "Some of those people can't be invited — reopen the list and try again." };
  }

  const { data: proposal, error } = await supabase
    .from("meeting_proposals")
    .insert({
      user_id: user.id,
      lender_id: null,
      institution_id: input.institutionId,
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

  if (error || !proposal) return { error: error?.message ?? "Could not save the proposal." };

  const { error: attendeeError } = await supabase.from("meeting_proposal_attendees").insert(
    input.lenderIds.map((lenderId) => ({
      user_id: user.id,
      proposal_id: proposal.id,
      lender_id: lenderId,
    })),
  );
  if (attendeeError) return { error: attendeeError.message };

  await logAudit(supabase, user.id, {
    entityType: "meeting_proposal",
    entityId: proposal.id,
    action: "create",
    newValue: {
      meetingType: input.meetingType,
      offeredSlots: input.offeredSlots,
      attendees: input.lenderIds.length,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/institutions/${input.institutionId}`);
  return { id: proposal.id };
}

export interface RecordGroupReplyInput {
  proposalId: string;
  lenderId: string;
  replyText: string;
  /** What the reader made of the reply as a whole. */
  intent: "accepted" | "declined" | "countered" | "unclear";
  /** One per offered date, in the same order. */
  slotVerdicts: SlotVerdict[];
  /** A date of their own, when there was one. */
  counteredSlot?: string | null;
}

/**
 * Records one attendee's reply. Nothing is booked here — the same rule the
 * single flow follows, and it matters more with a group, where a misread reply
 * would put four people somewhere none of them agreed to.
 */
export async function recordGroupReply(
  input: RecordGroupReplyInput,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!input.replyText.trim()) return { error: "Paste their reply first." };
  if (input.slotVerdicts.some((v) => !VERDICTS.has(v))) {
    return { error: "That reply didn't look valid." };
  }

  const { data: proposal } = await supabase
    .from("meeting_proposals")
    .select("id, offered_slots, institution_id")
    .eq("id", input.proposalId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!proposal) return { error: "Proposal not found." };
  if (input.slotVerdicts.length !== (proposal.offered_slots ?? []).length) {
    return { error: "That reply didn't line up with the dates offered." };
  }

  const { error } = await supabase
    .from("meeting_proposal_attendees")
    .update({
      reply_text: input.replyText,
      replied_at: new Date().toISOString(),
      reply_intent: input.intent === "unclear" ? null : input.intent,
      slot_verdicts: input.slotVerdicts,
      countered_slot: input.intent === "countered" ? (input.counteredSlot ?? null) : null,
      // Settled. Stamping this is what stops the automatic reader from having
      // another go at a reply he has already been through by hand.
      reply_read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("proposal_id", input.proposalId)
    .eq("lender_id", input.lenderId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/tiers");
  revalidatePath(`/proposals/${input.proposalId}`);
  return {};
}

export interface RecordReplyReadingInput {
  proposalId: string;
  lenderId: string;
  /** What the reader made of it, read in his timezone. */
  intent: "accepted" | "declined" | "countered" | "unclear";
  /** One per offered date, in the same order. */
  slotVerdicts: SlotVerdict[];
  /** A date of their own, when the reader found one. */
  counteredSlot?: string | null;
}

/**
 * Writes back a reading the browser did of a reply the sweep fetched.
 *
 * The sweep can get the words but not the meaning, because meaning needs his
 * clock. So the screen reads the text it was handed and posts the verdict
 * here. No text, no `replied_at` — those came from the sweep and are not this
 * action's to change.
 *
 * `is("reply_read_at", null)` is the whole safety of it: whatever he decided
 * by hand was stamped read, so this can never land on top of it, and two tabs
 * doing the same reading write the same row once.
 */
export async function recordReplyReading(
  input: RecordReplyReadingInput,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (input.slotVerdicts.some((v) => !VERDICTS.has(v))) {
    return { error: "That reading didn't look valid." };
  }

  const { data: proposal } = await supabase
    .from("meeting_proposals")
    .select("id, offered_slots")
    .eq("id", input.proposalId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!proposal) return { error: "Proposal not found." };
  if (input.slotVerdicts.length !== (proposal.offered_slots ?? []).length) {
    return { error: "That reading didn't line up with the dates offered." };
  }

  const { error } = await supabase
    .from("meeting_proposal_attendees")
    .update({
      // Unclear is the reader abstaining, and a null intent is how the
      // dashboard knows to keep asking him to look.
      reply_intent: input.intent === "unclear" ? null : input.intent,
      slot_verdicts: input.slotVerdicts,
      countered_slot: input.intent === "countered" ? (input.counteredSlot ?? null) : null,
      reply_read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("proposal_id", input.proposalId)
    .eq("lender_id", input.lenderId)
    .is("reply_read_at", null);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/tiers");
  revalidatePath(`/proposals/${input.proposalId}`);
  return {};
}

export interface ConfirmGroupMeetingInput {
  proposalId: string;
  /** The date he picked, however the tally leaned. */
  startAtIso: string;
  /** Who is actually coming. Non-responders are simply not on it. */
  lenderIds: string[];
}

/**
 * Turns the agreed date into a real meeting.
 *
 * Never automatic, at any number of yeses. Confirming counts as coverage for
 * everyone on the meeting straight away — the `lender_coverage` view credits
 * every attendee row, so a group of five is five people covered the moment he
 * presses this, exactly as a confirmed single meeting is one.
 */
export async function confirmGroupMeeting(
  input: ConfirmGroupMeetingInput,
): Promise<{ meetingId?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const start = new Date(input.startAtIso);
  if (Number.isNaN(start.getTime())) return { error: "That date didn't look valid." };
  if (input.lenderIds.length === 0) return { error: "Pick at least one person for the meeting." };

  const { data: proposal } = await supabase
    .from("meeting_proposals")
    .select("id, institution_id, meeting_type, custom_label, location_name, status")
    .eq("id", input.proposalId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!proposal) return { error: "Proposal not found." };
  if (proposal.status === "booked") return { error: "That one is already on the calendar." };

  // Only people who were actually invited to this proposal can be on it.
  const { data: invited } = await supabase
    .from("meeting_proposal_attendees")
    .select("lender_id, lender:lenders(first_name, territory, email)")
    .eq("proposal_id", input.proposalId)
    .in("lender_id", input.lenderIds);

  if ((invited ?? []).length !== input.lenderIds.length) {
    return { error: "Someone on that list wasn't invited to this meeting." };
  }

  const { data: institution } = await supabase
    .from("institutions")
    .select("name, territory")
    .eq("id", proposal.institution_id)
    .maybeSingle();

  const people = (invited ?? []).map(
    (a) =>
      a.lender as unknown as {
        first_name: string;
        territory: string | null;
        email: string | null;
      } | null,
  );
  const firstNames = people.map((p) => p?.first_name).filter((n): n is string => Boolean(n));
  const label =
    proposal.custom_label?.trim() ||
    MEETING_TYPE_LABELS[proposal.meeting_type]?.toLowerCase() ||
    proposal.meeting_type.replace(/_/g, " ");

  // Four names in a calendar entry is a wall of text; past three, say the bank.
  const withWhom =
    firstNames.length <= 3
      ? formatNameList(firstNames)
      : `${firstNames.length} from ${institution?.name ?? "the bank"}`;

  const minutes = MEETING_TYPE_DURATIONS[proposal.meeting_type] ?? 60;

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .insert({
      user_id: user.id,
      institution_id: proposal.institution_id,
      meeting_type: proposal.meeting_type,
      custom_label: proposal.custom_label?.trim() || null,
      title: `${label.charAt(0).toUpperCase()}${label.slice(1)} with ${withWhom}`,
      status: "confirmed",
      confirmed: true,
      tentative: false,
      start_at: start.toISOString(),
      end_at: new Date(start.getTime() + minutes * MINUTE).toISOString(),
      location_name: proposal.location_name,
      territory: institution?.territory ?? people.find((p) => p?.territory)?.territory ?? null,
      notes_status: "pending",
    })
    .select("id")
    .single();

  if (meetingError || !meeting) {
    return { error: meetingError?.message ?? "Could not create the meeting." };
  }

  const { error: attendeeError } = await supabase.from("meeting_attendees").insert(
    input.lenderIds.map((lenderId) => ({
      user_id: user.id,
      meeting_id: meeting.id,
      lender_id: lenderId,
      response_status: "confirmed",
    })),
  );
  if (attendeeError) return { error: attendeeError.message };

  // One invitation with everyone on it, the same way the ask went out.
  await addConfirmedMeetingToCalendar({
    meetingId: meeting.id,
    subject: `${label.charAt(0).toUpperCase()}${label.slice(1)} with ${withWhom}`,
    start,
    minutes,
    locationName: proposal.location_name,
    attendeeEmails: people
      .map((p) => p?.email)
      .filter((e): e is string => Boolean(e)),
  });

  await supabase
    .from("meeting_proposals")
    .update({
      status: "booked",
      meeting_id: meeting.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.proposalId);

  revalidatePath("/dashboard");
  revalidatePath("/tiers");
  revalidatePath(`/proposals/${input.proposalId}`);
  for (const lenderId of input.lenderIds) revalidatePath(`/partners/${lenderId}`);
  return { meetingId: meeting.id };
}
