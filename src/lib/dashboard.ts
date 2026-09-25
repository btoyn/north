import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPreferences, type LenderWithCoverage } from "@/lib/data";
import { daysSince } from "@/lib/coverage";
import { daysLateFrom, loanState } from "@/lib/loan-cadence";

/** One plotted week in the personal-coverage trend. */
export interface CoveragePoint {
  /** ISO date of the week end (the day the snapshot is measured on). */
  date: string;
  /** Short axis label, e.g. "Jun 8". */
  label: string;
  /** Percent of the partners that existed then who were personally covered. */
  pct: number;
  covered: number;
  total: number;
}

export interface CoverageHistory {
  points: CoveragePoint[];
  /** Percentage-point change from the first plotted week to the last. */
  changeFromStart: number | null;
  /** Percentage-point change week over week. */
  changeFromPrevious: number | null;
  /** Percentage-point change against four weeks ago. */
  changeFrom30Days: number | null;
  /** True when there isn't enough history to draw an honest line. */
  insufficientData: boolean;
}

const WEEKS = 8;

/**
 * Monday of the week containing `d`, as an ISO date — the key weekly plans are
 * stored under. Lives here rather than in the actions file because a "use
 * server" module may only export async functions.
 */
export function weekStartOf(d: Date = new Date()): string {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const dow = copy.getDay(); // 0 = Sunday
  copy.setDate(copy.getDate() - (dow === 0 ? 6 : dow - 1));
  return copy.toISOString().slice(0, 10);
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Reconstruct personal coverage for each of the last 8 weeks from the activity
 * timeline (§9 rules, applied historically).
 *
 * A partner counts as covered on a given date when they had a personal touch
 * within the goal window ending that date, or a confirmed meeting still in the
 * future as of that date. Partners created after the snapshot date are excluded
 * from that week entirely, so onboarding a big list never shows as a crash.
 */
export async function getCoverageHistory(): Promise<CoverageHistory> {
  const supabase = await createClient();
  const prefs = await getPreferences();
  const goalDays = prefs?.default_contact_goal_days ?? 30;

  const today = startOfDay(new Date());
  const points: Date[] = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    points.push(new Date(today.getTime() - i * 7 * 86_400_000));
  }
  const earliest = points[0];
  // Reach back one goal window before the first point so its lookback is complete.
  const fetchFrom = new Date(earliest.getTime() - goalDays * 86_400_000).toISOString();

  const [{ data: lenders }, { data: activities }, { data: attendances }] = await Promise.all([
    supabase.from("lenders").select("id, active, created_at").is("deleted_at", null),
    supabase
      .from("activities")
      .select("lender_id, occurred_at")
      .eq("counts_for_coverage", true)
      .neq("activity_type", "campaign_email")
      .not("lender_id", "is", null)
      .gte("occurred_at", fetchFrom)
      .is("deleted_at", null),
    // Embed attendees under meetings rather than filtering through the join,
    // which keeps the query readable and avoids embedded-filter syntax.
    supabase
      .from("meetings")
      // `response_status` matters: since group invitations go to everyone once
      // two have said yes, being on a meeting no longer means having agreed to
      // it. Same line `lender_coverage` draws.
      .select("start_at, attendees:meeting_attendees(lender_id, response_status)")
      .eq("status", "confirmed")
      .gte("start_at", fetchFrom)
      .is("deleted_at", null),
  ]);

  // lender_id -> sorted touch timestamps (personal activities + confirmed meetings)
  const touches = new Map<string, number[]>();
  const push = (lenderId: string | null, at: string | null) => {
    if (!lenderId || !at) return;
    const list = touches.get(lenderId) ?? [];
    list.push(new Date(at).getTime());
    touches.set(lenderId, list);
  };

  for (const a of activities ?? []) push(a.lender_id, a.occurred_at);
  for (const meeting of attendances ?? []) {
    const attendees = (meeting.attendees ?? []) as unknown as {
      lender_id: string;
      response_status: string | null;
    }[];
    for (const attendee of attendees) {
      if (attendee.response_status !== "confirmed") continue;
      push(attendee.lender_id, meeting.start_at);
    }
  }

  const active = (lenders ?? []).filter((l) => l.active);

  const series: CoveragePoint[] = points.map((date) => {
    const at = date.getTime();
    const windowStart = at - goalDays * 86_400_000;
    const eligible = active.filter((l) => new Date(l.created_at).getTime() <= at);

    const covered = eligible.filter((l) => {
      const list = touches.get(l.id);
      if (!list) return false;
      return list.some(
        (t) =>
          // a personal touch inside the goal window ending on this date
          (t <= at && t > windowStart) ||
          // or a confirmed meeting that was still upcoming on this date
          t > at,
      );
    }).length;

    return {
      date: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      pct: eligible.length === 0 ? 0 : Math.round((covered / eligible.length) * 100),
      covered,
      total: eligible.length,
    };
  });

  const withData = series.filter((p) => p.total > 0);
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const fourWeeksAgo = series[series.length - 5];
  const first = withData[0];

  return {
    points: series,
    changeFromStart: first && last && withData.length > 1 ? last.pct - first.pct : null,
    changeFromPrevious: prev && prev.total > 0 && last ? last.pct - prev.pct : null,
    changeFrom30Days:
      fourWeeksAgo && fourWeeksAgo.total > 0 && last ? last.pct - fourWeeksAgo.pct : null,
    insufficientData: withData.length < 2,
  };
}

export type CoverageSplitKey = "personal" | "campaign" | "uncovered";

export interface CoverageSplitSegment {
  key: CoverageSplitKey;
  label: string;
  count: number;
  href: string;
  color: string;
  hint: string;
}

/** Which of the three coverage states a partner is in right now. */
export function coverageStateOf(lender: LenderWithCoverage): CoverageSplitKey {
  const { personal, visible, hasConfirmedFutureMeeting } = lender.coverage;
  if (hasConfirmedFutureMeeting || personal === "on_track" || personal === "grace") {
    return "personal";
  }
  return visible === "on_track" ? "campaign" : "uncovered";
}

/**
 * Personal / campaign-only / uncovered, mutually exclusive so the bar always
 * sums to the active partner count.
 */
export function buildCoverageSplit(lenders: LenderWithCoverage[]): CoverageSplitSegment[] {
  const active = lenders.filter((l) => l.active);
  const tally = { personal: 0, campaign: 0, uncovered: 0 };
  for (const l of active) tally[coverageStateOf(l)]++;

  return [
    {
      key: "personal",
      label: "Personal",
      count: tally.personal,
      href: "/tiers/on-track",
      color: "#1e5bff",
      hint: "One-to-one contact inside the goal window",
    },
    {
      key: "campaign",
      label: "Campaign only",
      count: tally.campaign,
      href: "/tiers/campaign-only",
      color: "#9a6f14",
      hint: "Reached by campaign email, never personally",
    },
    {
      key: "uncovered",
      label: "Uncovered",
      count: tally.uncovered,
      href: "/tiers/needs-contact",
      color: "#c9cfdd",
      hint: "No contact of any kind inside the window",
    },
  ];
}

/** One dot per partner for the no-history fallback in the coverage zone. */
export function buildLenderDots(
  lenders: LenderWithCoverage[],
  limit = 24,
): CoverageSplitKey[] {
  const rank = { personal: 0, campaign: 1, uncovered: 2 } as const;
  return lenders
    .filter((l) => l.active)
    .map(coverageStateOf)
    .sort((a, b) => rank[a] - rank[b])
    .slice(0, limit);
}

export interface UpcomingData {
  meetings: {
    id: string;
    title: string;
    start_at: string | null;
    meeting_type: string;
    location_name: string | null;
    notes_status: string;
    meeting_brief_generated_at: string | null;
    attendees: string[];
  }[];
  tentative: {
    id: string;
    title: string;
    lenderName: string | null;
    start_at: string | null;
    status: string;
    kind: "meeting" | "trip_target";
    detail: string | null;
    /** Days since the invitation went out, when we can tell. */
    waitingDays: number | null;
  }[];
  trip: {
    id: string;
    name: string;
    territory: string | null;
    start_date: string | null;
    end_date: string | null;
    status: string;
    targetCount: number;
    confirmedCount: number;
  } | null;
}

/** Everything the right-hand Upcoming panel needs (§7). */
export async function getUpcoming(): Promise<UpcomingData> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  const [{ data: confirmed }, { data: tentativeMeetings }, { data: trips }, { data: tripTargets }] =
    await Promise.all([
      supabase
        .from("meetings")
        .select(
          "id, title, start_at, meeting_type, location_name, notes_status, meeting_brief_generated_at, attendees:meeting_attendees(lender:lenders(full_name))",
        )
        .eq("status", "confirmed")
        .gte("start_at", nowIso)
        .is("deleted_at", null)
        .order("start_at")
        .limit(5),
      supabase
        .from("meetings")
        .select(
          "id, title, start_at, status, location_name, created_at, attendees:meeting_attendees(lender:lenders(full_name))",
        )
        .in("status", ["proposed", "tentative"])
        .is("deleted_at", null)
        .order("start_at", { nullsFirst: false })
        .limit(5),
      supabase
        .from("trips")
        .select("id, name, territory, start_date, end_date, status")
        .in("status", ["planning", "scheduled", "in_progress"])
        .or(`end_date.gte.${today},end_date.is.null`)
        .is("deleted_at", null)
        .order("start_date", { nullsFirst: false })
        .limit(1),
      supabase
        .from("trip_targets")
        .select("id, trip_id, status, target_type, lender:lenders(full_name)")
        .in("status", ["invited", "awaiting_reply", "tentative", "candidate", "confirmed"]),
    ]);

  const trip = (trips ?? [])[0] ?? null;
  const targetsForTrip = (tripTargets ?? []).filter((t) => trip && t.trip_id === trip.id);

  const tentative: UpcomingData["tentative"] = [
    ...(tentativeMeetings ?? []).map((m) => {
      const names = ((m.attendees ?? []) as unknown as { lender: { full_name: string } | null }[])
        .map((a) => a.lender?.full_name)
        .filter((n): n is string => Boolean(n));
      return {
        id: m.id,
        title: names[0] ?? m.title,
        lenderName: names[0] ?? null,
        start_at: m.start_at,
        status: m.status,
        kind: "meeting" as const,
        detail: m.location_name,
        waitingDays: m.created_at
          ? Math.max(0, Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86_400_000))
          : null,
      };
    }),
    ...targetsForTrip
      .filter((t) => ["invited", "awaiting_reply", "tentative"].includes(t.status))
      .map((t) => {
        const name = (t.lender as unknown as { full_name: string } | null)?.full_name ?? null;
        return {
          id: t.id,
          title: name ?? "Trip target",
          lenderName: name,
          start_at: null,
          status: t.status,
          kind: "trip_target" as const,
          detail: t.target_type.replace(/_/g, " "),
          waitingDays: null,
        };
      }),
  ].slice(0, 6);

  return {
    meetings: (confirmed ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      start_at: m.start_at,
      meeting_type: m.meeting_type,
      location_name: m.location_name,
      notes_status: m.notes_status,
      meeting_brief_generated_at: m.meeting_brief_generated_at,
      attendees: (
        (m.attendees ?? []) as unknown as { lender: { full_name: string } | null }[]
      )
        .map((a) => a.lender?.full_name)
        .filter((n): n is string => Boolean(n)),
    })),
    tentative,
    trip: trip
      ? {
          ...trip,
          targetCount: targetsForTrip.length,
          confirmedCount: targetsForTrip.filter((t) => t.status === "confirmed").length,
        }
      : null,
  };
}

export type LoanUpdateState = "updated" | "due" | "overdue";

export interface LoanStatus {
  id: string;
  borrower: string;
  lenderName: string | null;
  state: LoanUpdateState;
  daysLate: number;
}

/** One status block per active loan, so the zone can be counted at a glance. */
export async function getLoanStatuses(): Promise<LoanStatus[]> {
  const supabase = await createClient();
  const today = startOfDay(new Date());

  const { data } = await supabase
    .from("active_loans")
    .select("id, borrower_name, next_update_due_at, lender:lenders(full_name)")
    .eq("updates_active", true)
    .is("deleted_at", null)
    .order("next_update_due_at", { nullsFirst: false });

  return (data ?? []).map((loan) => {
    const due = loan.next_update_due_at ? new Date(loan.next_update_due_at) : null;
    const daysLate = due === null ? 0 : daysLateFrom(due, today);
    const state = loanState(daysLate, true) as LoanUpdateState;
    return {
      id: loan.id,
      borrower: loan.borrower_name,
      lenderName: (loan.lender as unknown as { full_name: string } | null)?.full_name ?? null,
      state,
      daysLate: Math.max(0, daysLate),
    };
  });
}

export interface RelationshipContext {
  /** Partners who referred a loan currently in process. */
  activeLoanLenders: Set<string>;
  /** Partners with an open promise or task. */
  openFollowUpLenders: Set<string>;
  /** Partners with a saved personal note to open a conversation with. */
  personalTopicLenders: Set<string>;
  /** Partners who reached out to you in the last 30 days. */
  recentInboundLenders: Set<string>;
  /** Territory of the next trip, for the "near upcoming trip" chip. */
  tripTerritory: string | null;
}

/** Signals behind the reason chips on each partner row. */
export async function getRelationshipContext(): Promise<RelationshipContext> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [loans, promises, tasks, details, inbound, trips] = await Promise.all([
    supabase.from("active_loans").select("lender_id").eq("updates_active", true).is("deleted_at", null),
    supabase.from("promises").select("lender_id").eq("status", "open").is("deleted_at", null),
    supabase.from("tasks").select("lender_id").eq("status", "open").is("deleted_at", null),
    supabase
      .from("lender_personal_details")
      .select("lender_id")
      .eq("is_active_suggestion", true)
      .is("deleted_at", null),
    supabase
      .from("activities")
      .select("lender_id")
      .eq("initiated_by_lender", true)
      .gte("occurred_at", thirtyDaysAgo)
      .is("deleted_at", null),
    supabase
      .from("trips")
      .select("territory")
      .in("status", ["planning", "scheduled", "in_progress"])
      .or(`end_date.gte.${today},end_date.is.null`)
      .is("deleted_at", null)
      .order("start_date", { nullsFirst: false })
      .limit(1),
  ]);

  const ids = (rows: { lender_id: string | null }[] | null) =>
    new Set((rows ?? []).map((r) => r.lender_id).filter((id): id is string => Boolean(id)));

  return {
    activeLoanLenders: ids(loans.data),
    openFollowUpLenders: new Set([...ids(promises.data), ...ids(tasks.data)]),
    personalTopicLenders: ids(details.data),
    recentInboundLenders: ids(inbound.data),
    tripTerritory: (trips.data ?? [])[0]?.territory ?? null,
  };
}

export interface ProposalRow {
  id: string;
  lenderId: string;
  lenderName: string;
  firstName: string;
  meetingType: string;
  customLabel: string | null;
  /** ISO instants, in the order they were offered. */
  offeredSlots: string[];
  status: string;
  sentAt: string | null;
  /** Days since it went out, for the "waiting 6d" badge. */
  waitingDays: number;
  replyText: string | null;
  counteredSlot: string | null;
  counteredConflicts: boolean | null;
  /** Past the chase threshold with no reply and no recent nudge. */
  overdue: boolean;
}

export interface GroupProposalRow {
  id: string;
  institutionId: string | null;
  institutionName: string;
  meetingType: string;
  customLabel: string | null;
  /** ISO instants, in the order they went out. */
  offeredSlots: string[];
  sentAt: string | null;
  waitingDays: number;
  /** Raw enough for the tally to run in the browser, where the clock is his. */
  attendees: {
    lenderId: string;
    name: string;
    firstName: string;
    repliedAt: string | null;
    /** Null when nobody has read the reply, and when the reader abstained. */
    replyIntent: string | null;
    replyText: string | null;
    /** When the browser interpreted `replyText`. Null means it still hasn't. */
    replyReadAt: string | null;
    verdicts: string[];
    counteredSlot: string | null;
  }[];
}

export interface ProposalQueue {
  /** Replied and needs him to say yes — accepted dates and counter-offers. */
  needsDecision: ProposalRow[];
  /** Sent, still silent. */
  waiting: ProposalRow[];
  /** Group asks in flight. Each attendee answers separately, so these don't
   *  split into decide-or-wait the way a single proposal does. */
  groups: GroupProposalRow[];
  chaseDays: number;
}

/**
 * Group proposals still in flight.
 *
 * No counting happens here. Which date is winning is wall-clock work and the
 * screens do it, so this hands over the replies as they were recorded.
 */
export async function getGroupProposals(): Promise<GroupProposalRow[]> {
  const supabase = await createClient();
  const now = Date.now();

  const { data } = await supabase
    .from("meeting_proposals")
    .select(
      "id, institution_id, meeting_type, custom_label, offered_slots, sent_at, institution:institutions(name), attendees:meeting_proposal_attendees(lender_id, replied_at, reply_intent, reply_text, reply_read_at, slot_verdicts, countered_slot, lender:lenders(full_name, first_name))",
    )
    .is("lender_id", null)
    .eq("status", "sent")
    .is("deleted_at", null)
    .order("sent_at", { nullsFirst: false });

  return (data ?? []).map((r) => {
    const sentMs = r.sent_at ? new Date(r.sent_at).getTime() : null;
    const attendees = (r.attendees ?? []) as unknown as {
      lender_id: string;
      replied_at: string | null;
      reply_intent: string | null;
      reply_text: string | null;
      reply_read_at: string | null;
      slot_verdicts: string[] | null;
      countered_slot: string | null;
      lender: { full_name: string; first_name: string } | null;
    }[];

    return {
      id: r.id,
      institutionId: r.institution_id,
      institutionName:
        (r.institution as unknown as { name: string } | null)?.name ?? "a bank",
      meetingType: r.meeting_type,
      customLabel: r.custom_label,
      offeredSlots: r.offered_slots ?? [],
      sentAt: r.sent_at,
      waitingDays: sentMs ? Math.floor((now - sentMs) / 86_400_000) : 0,
      attendees: attendees
        .map((a) => ({
          lenderId: a.lender_id,
          name: a.lender?.full_name ?? "Unknown",
          firstName: a.lender?.first_name ?? "they",
          repliedAt: a.replied_at,
          replyIntent: a.reply_intent,
          replyText: a.reply_text,
          replyReadAt: a.reply_read_at,
          verdicts: a.slot_verdicts ?? [],
          counteredSlot: a.countered_slot,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

/**
 * Everything in flight on the scheduling side (spec §15).
 *
 * Split by what he has to do about it: decide, or wait. A proposal he already
 * nudged today drops out of the overdue set so the dashboard doesn't ask twice.
 */
export async function getProposalQueue(): Promise<ProposalQueue> {
  const supabase = await createClient();
  const now = new Date();

  const [{ data: prefs }, { data: rows }, groups] = await Promise.all([
    supabase.from("user_preferences").select("proposal_chase_days").maybeSingle(),
    supabase
      .from("meeting_proposals")
      .select(
        "id, lender_id, meeting_type, custom_label, offered_slots, status, sent_at, reply_text, countered_slot, countered_conflicts, last_nudged_at, lender:lenders(full_name, first_name)",
      )
      .not("lender_id", "is", null)
      .in("status", ["sent", "accepted", "countered"])
      .is("deleted_at", null)
      .order("sent_at", { nullsFirst: false }),
    getGroupProposals(),
  ]);

  const chaseDays = prefs?.proposal_chase_days ?? 4;
  const needsDecision: ProposalRow[] = [];
  const waiting: ProposalRow[] = [];

  for (const r of rows ?? []) {
    const lender = r.lender as unknown as { full_name: string; first_name: string } | null;
    if (!lender) continue;

    const sentMs = r.sent_at ? new Date(r.sent_at).getTime() : null;
    const waitingDays = sentMs ? Math.floor((now.getTime() - sentMs) / 86_400_000) : 0;
    const nudgedMs = r.last_nudged_at ? new Date(r.last_nudged_at).getTime() : null;
    const nudgedRecently = nudgedMs !== null && now.getTime() - nudgedMs < chaseDays * 86_400_000;

    const row: ProposalRow = {
      id: r.id,
      lenderId: r.lender_id,
      lenderName: lender.full_name,
      firstName: lender.first_name,
      meetingType: r.meeting_type,
      customLabel: r.custom_label,
      offeredSlots: r.offered_slots ?? [],
      status: r.status,
      sentAt: r.sent_at,
      waitingDays,
      replyText: r.reply_text,
      counteredSlot: r.countered_slot,
      counteredConflicts: r.countered_conflicts,
      overdue: r.status === "sent" && waitingDays >= chaseDays && !nudgedRecently,
    };

    if (r.status === "sent") waiting.push(row);
    else needsDecision.push(row);
  }

  // Longest wait first — those are the ones going cold.
  waiting.sort((a, b) => b.waitingDays - a.waitingDays);

  return { needsDecision, waiting, groups, chaseDays };
}

export { daysSince };
