/**
 * How a loan ends, and how the book splits.
 *
 * The finish line is SBA approval. Once a loan is approved it goes to the
 * closing department and stops being his problem, so the app stops asking
 * about it and files it as a win. There is no funded state and no closing
 * state, because neither is a thing he does.
 *
 * Pure, so the tab split and the totals are the same arithmetic wherever they
 * are shown — the screen, the dashboard, or an export.
 */

export type LoanOutcome = "sba_approved" | "did_not_happen";

export const LOAN_OUTCOME_LABEL: Record<LoanOutcome, string> = {
  sba_approved: "SBA approved",
  did_not_happen: "Didn't happen",
};

export function isLoanOutcome(value: string | null | undefined): value is LoanOutcome {
  return value === "sba_approved" || value === "did_not_happen";
}

export interface LoanBookRow {
  active: boolean;
  closingOutcome: string | null;
  approvedAmount: number | null;
}

export interface LoanBook<T> {
  /** Still being chased for a weekly update. */
  active: T[];
  /** Approved and handed off. The win column. */
  approved: T[];
  /** Stopped for any other reason. Still credits the partner who sent it. */
  dead: T[];
}

/**
 * Splits the book three ways.
 *
 * A loan that is no longer active but carries no outcome is counted as dead
 * rather than approved: an unexplained stop is not a win, and guessing in the
 * generous direction would inflate the only number this screen reports.
 */
export function splitLoanBook<T extends LoanBookRow>(rows: readonly T[]): LoanBook<T> {
  const book: LoanBook<T> = { active: [], approved: [], dead: [] };
  for (const row of rows) {
    if (row.active) book.active.push(row);
    else if (row.closingOutcome === "sba_approved") book.approved.push(row);
    else book.dead.push(row);
  }
  return book;
}

/**
 * The approved total, and how much of it is actually known.
 *
 * `missingAmount` is reported rather than hidden because a total that silently
 * counts eight of eleven loans reads as the whole book and isn't.
 */
export function approvedTotal(rows: readonly LoanBookRow[]): {
  count: number;
  amount: number;
  missingAmount: number;
} {
  const approved = splitLoanBook(rows).approved;
  let amount = 0;
  let missingAmount = 0;
  for (const row of approved) {
    if (typeof row.approvedAmount === "number" && Number.isFinite(row.approvedAmount)) {
      amount += row.approvedAmount;
    } else {
      missingAmount += 1;
    }
  }
  return { count: approved.length, amount, missingAmount };
}

/**
 * Reads a typed amount into a number, or null.
 *
 * Accepts what a person actually types into a money field — "1,250,000",
 * "$1.25M" is not handled but commas and a dollar sign are — and refuses
 * anything else rather than storing a zero that looks like a real approval.
 */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}
