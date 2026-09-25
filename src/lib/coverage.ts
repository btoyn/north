/**
 * Relationship coverage engine (spec §9).
 *
 * Rolling window, never a calendar-month reset. All partners share the same
 * 30-day goal; tier influences prioritization elsewhere, not the window.
 */

export type CoverageStatus =
  | "on_track"
  | "grace"
  | "overdue"
  | "seriously_overdue"
  | "never_contacted";

export interface CoverageOptions {
  /** Contact goal in days. Default 30. */
  goalDays?: number;
  /** Grace period in days after the goal. Default 10. */
  graceDays?: number;
}

const DEFAULTS: Required<CoverageOptions> = { goalDays: 30, graceDays: 10 };

export function daysSince(date: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

/**
 * Status from the last valid touch.
 *   0–30 on track, 31–40 grace, 41–60 overdue, 61+ seriously overdue.
 * A confirmed future meeting counts as covered immediately; if it is
 * canceled the caller recomputes from the last completed touch, which this
 * function does naturally.
 *
 * Every boundary is relative to the goal, because the goal is no longer one
 * number: tiers give an A partner a fortnight and a C partner a quarter (see
 * `lib/tiers`). "Seriously overdue" is twice the goal, which at the default
 * 30-day window is the same 60 days it always was.
 */
export function coverageStatus(
  lastTouchAt: Date | string | null,
  hasConfirmedFutureMeeting: boolean,
  opts: CoverageOptions = {},
  now: Date = new Date(),
): CoverageStatus {
  if (hasConfirmedFutureMeeting) return "on_track";
  if (!lastTouchAt) return "never_contacted";

  const { goalDays, graceDays } = { ...DEFAULTS, ...opts };
  const days = daysSince(
    typeof lastTouchAt === "string" ? new Date(lastTouchAt) : lastTouchAt,
    now,
  );

  if (days <= goalDays) return "on_track";
  if (days <= goalDays + graceDays) return "grace";
  if (days <= goalDays * 2) return "overdue";
  return "seriously_overdue";
}

export const COVERAGE_LABELS: Record<CoverageStatus, string> = {
  on_track: "On track",
  grace: "Grace period",
  overdue: "Overdue",
  seriously_overdue: "Seriously overdue",
  never_contacted: "Never contacted",
};

/** Activity types that count as coverage at all (§9 "valid coverage"). */
export const COVERAGE_ACTIVITY_TYPES = new Set([
  "personal_email",
  "incoming_email",
  "text",
  "call",
  "lunch",
  "breakfast",
  "golf",
  "office_visit",
  "pop_in",
  "sba_question",
  "deal_conversation",
  "loan_update",
  "campaign_email",
  "general_meeting",
]);

/** Types that do NOT count: drop_off (no interaction), note, task_completed. */
export const NON_COVERAGE_ACTIVITY_TYPES = new Set([
  "drop_off",
  "note",
  "task_completed",
  "other",
]);

/**
 * "Personally engaged" excludes campaign email (§9 coverage categories).
 * A partner may be campaign-covered (visible) but personally overdue.
 */
export function isPersonalTouch(activityType: string): boolean {
  return (
    COVERAGE_ACTIVITY_TYPES.has(activityType) &&
    activityType !== "campaign_email"
  );
}

export interface LenderCoverageInput {
  lastVisibleTouchAt: Date | string | null;
  lastPersonalTouchAt: Date | string | null;
  hasConfirmedFutureMeeting: boolean;
}

export interface LenderCoverageResult {
  visible: CoverageStatus;
  personal: CoverageStatus;
  daysSinceVisible: number | null;
  daysSincePersonal: number | null;
  hasConfirmedFutureMeeting: boolean;
}

export function lenderCoverage(
  input: LenderCoverageInput,
  opts: CoverageOptions = {},
  now: Date = new Date(),
): LenderCoverageResult {
  const toDate = (d: Date | string | null) =>
    d === null ? null : typeof d === "string" ? new Date(d) : d;

  const visibleAt = toDate(input.lastVisibleTouchAt);
  const personalAt = toDate(input.lastPersonalTouchAt);

  return {
    visible: coverageStatus(visibleAt, input.hasConfirmedFutureMeeting, opts, now),
    personal: coverageStatus(personalAt, input.hasConfirmedFutureMeeting, opts, now),
    daysSinceVisible: visibleAt ? daysSince(visibleAt, now) : null,
    daysSincePersonal: personalAt ? daysSince(personalAt, now) : null,
    hasConfirmedFutureMeeting: input.hasConfirmedFutureMeeting,
  };
}
