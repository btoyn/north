/**
 * Looks from partners — the follow-up clock and how a look reads on screen.
 *
 * A "look" is any time a partner brings up a possible deal: a real referral, a
 * question about whether something would qualify, a vague "I might have one for
 * you." The record exists so the conversation gets followed up on, and so the
 * count per partner answers who is actually reaching out.
 *
 * Kept pure and separate from the database for the same reason the loan cadence
 * is: an off-by-one here means a partner who asked you a question never hears
 * back, which is worse than most bugs this app could have.
 */

export type LookState = "scheduled" | "due" | "overdue" | "became_loan" | "went_nowhere";

/** The three stages a look can sit in, mapped to the stored `stage` values. */
export const LOOK_STAGE = {
  open: "initial_inquiry",
  becameLoan: "handed_off",
  wentNowhere: "dormant",
} as const;

export type LookStage = (typeof LOOK_STAGE)[keyof typeof LOOK_STAGE];

/**
 * Stages that end the follow-up clock.
 *
 * `opportunities` predates this screen and carries a longer stage list from
 * when it modelled a full early-deal pipeline. Rather than rewrite that
 * history, anything not explicitly closed counts as open — so a record left in
 * `sources_uses_sent` still shows up asking to be dealt with instead of
 * quietly filing itself away.
 */
const CLOSED_STAGES = new Set<string>([
  LOOK_STAGE.becameLoan,
  LOOK_STAGE.wentNowhere,
  "closed_no_handoff",
]);

export function isLookOpen(stage: string): boolean {
  return !CLOSED_STAGES.has(stage);
}

/**
 * The Pipeline board's columns.
 *
 * Narrower than `stage` on purpose. `stage` still decides whether the follow-up
 * clock runs; this says which column the card is in, and it is set by moving
 * the card rather than inferred. "Followed up" in particular has to be a place
 * he puts something — an attempt counter also ticks for a voicemail nobody
 * returned, which is not the same as having dealt with it.
 */
export type LookStatus = "new" | "followed_up" | "became_loan" | "went_nowhere";

export interface PipelineColumn {
  status: LookStatus;
  label: string;
  description: string;
}

/** Left to right, the way a look actually travels. */
export const PIPELINE_COLUMNS: PipelineColumn[] = [
  { status: "new", label: "New look", description: "Raised, not yet chased" },
  { status: "followed_up", label: "Followed up", description: "You've been back to them" },
  { status: "became_loan", label: "Became a loan", description: "Turned into real business" },
];

/**
 * Looks that went nowhere stay off the board.
 *
 * They are the majority over time and a fourth column of them would bury the
 * three that matter. The records are kept and listed under the board, because
 * "what happened to that Cedar City building" still needs an answer.
 */
export const OFF_BOARD_STATUS: LookStatus = "went_nowhere";

export function isPipelineColumn(status: string): status is LookStatus {
  return PIPELINE_COLUMNS.some((c) => c.status === status);
}

export function isLookStatus(value: string): value is LookStatus {
  return isPipelineColumn(value) || value === OFF_BOARD_STATUS;
}

export function readLookStatus(value: string | null | undefined): LookStatus {
  return value && isLookStatus(value) ? value : "new";
}

/**
 * Where a look belongs when only the old `stage` is known.
 *
 * The migration backfilled every existing row with this, and it stays here so
 * anything written by an older code path still lands in the right column.
 */
export function lookStatusFromStage(stage: string, attempts: number): LookStatus {
  if (stage === LOOK_STAGE.becameLoan) return "became_loan";
  if (!isLookOpen(stage)) return "went_nowhere";
  return attempts > 0 ? "followed_up" : "new";
}

/** The `stage` a status implies, so the follow-up clock follows the board. */
export function stageForStatus(status: LookStatus): string {
  if (status === "became_loan") return LOOK_STAGE.becameLoan;
  if (status === "went_nowhere") return LOOK_STAGE.wentNowhere;
  return LOOK_STAGE.open;
}

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to`, ignoring the time of day. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY_MS);
}

/**
 * Where a look stands. A closed look reports its outcome and never nags again;
 * an open one is scheduled until its follow-up date arrives, due that day, and
 * overdue after a week of being ignored — the same shape as the loan clock, so
 * the colours mean the same thing on both screens.
 */
export function lookState(stage: string, daysLate: number): LookState {
  if (stage === LOOK_STAGE.becameLoan) return "became_loan";
  if (!isLookOpen(stage)) return "went_nowhere";
  if (daysLate < 0) return "scheduled";
  return daysLate > 7 ? "overdue" : "due";
}

/** The date a follow-up comes due, as a plain YYYY-MM-DD string. */
export function followUpDate(from: Date, days: number): string {
  const d = new Date(from.getTime() + Math.max(0, days) * DAY_MS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * What to call a look in a list.
 *
 * A borrower name is the best label, but most looks won't have one — so fall
 * back to the opening of what was actually asked, which is more use than
 * "Untitled" and reads like the conversation it came from.
 */
export function lookTitle(input: {
  borrowerName?: string | null;
  notes?: string | null;
}): string {
  const borrower = input.borrowerName?.trim();
  if (borrower) return borrower;

  const notes = input.notes?.trim();
  if (!notes) return "Unnamed look";

  const firstLine = notes.split("\n")[0].trim();
  const words = firstLine.split(/\s+/);
  if (words.length <= 9) return firstLine;
  return `${words.slice(0, 9).join(" ")}…`;
}
