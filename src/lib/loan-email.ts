/**
 * The weekly loan update email.
 *
 * There are no stages here on purpose. Asking which stage a loan is in means
 * asking someone to type a fact they already know, into a field that will be
 * out of date the moment it changes — so instead the first week produces a
 * skeleton, and every week after opens with last week's text to edit.
 *
 * Pure functions only. Composing an email is a string problem, and keeping it
 * out of the database layer means it can be tested without one.
 */

/** First names read right in a greeting; "Joe Whitfield," does not. */
export function firstName(fullName: string | null | undefined): string {
  const trimmed = fullName?.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

/**
 * The subject line, dated.
 *
 * Dated rather than constant, so each week arrives as its own message in the
 * partner's inbox instead of collapsing into one long thread.
 */
export function updateSubject(borrowerName: string, on: Date): string {
  const date = on.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${borrowerName} loan — update ${date}`;
}

/**
 * Week one. Greeting, opening line, a gap to write into, and the sign-off.
 *
 * This is the only week the app writes anything. From here on the draft is
 * whatever was sent last time, so any edit made here carries forward.
 */
export function firstDraft(input: {
  lenderName: string | null;
  borrowerName: string;
  signature?: string | null;
}): string {
  const greeting = `Hey ${firstName(input.lenderName)},`;
  const opening = `Just wanted to give you my weekly update on the ${input.borrowerName} loan.`;
  const closing = "Please let me know if you have any questions or need anything in the meantime.";
  const signature = input.signature?.trim() || "";

  return [greeting, "", opening, "", "", closing, "", signature].join("\n").trimEnd() + "\n";
}

/**
 * Where the cursor should sit when the first draft opens: the blank line
 * between the opening and the closing, which is the only part to fill in.
 */
export function firstDraftCursor(draft: string): number {
  const lines = draft.split("\n");
  // Line 4 in the layout above — the empty line after the opening sentence.
  const target = Math.min(4, lines.length - 1);
  return lines.slice(0, target).join("\n").length + (target > 0 ? 1 : 0);
}

/** The last email you'd send about a loan, once it reaches the closing team. */
export function handoffDraft(input: {
  lenderName: string | null;
  borrowerName: string;
  signature?: string | null;
  construction: boolean;
}): string {
  const timing = input.construction
    ? "Because there's construction involved, we'll begin the closing process once a certificate of occupancy is received."
    : "They'll coordinate the closing, which typically runs 45 to 90 days.";

  return [
    `Hey ${firstName(input.lenderName)},`,
    "",
    `Good news on the ${input.borrowerName} loan — we have SBA approval.`,
    "",
    `From here it moves to our closing team, and they'll be reaching out to coordinate. ${timing}`,
    "",
    "Thanks for sending this one my way. Let me know if anything else comes up.",
    "",
    input.signature?.trim() || "",
  ]
    .join("\n")
    .trimEnd() + "\n";
}

/**
 * Practical ceiling on a mailto: URL.
 *
 * The spec sets no limit but the implementations do, and they fail by silently
 * truncating the body rather than erroring — so a long update would arrive
 * cut off mid-sentence with no warning. Well under the ~2000 characters where
 * browsers and mail clients start disagreeing.
 */
export const MAILTO_SAFE_LENGTH = 1800;

export function mailtoUrl(input: {
  to: string[];
  subject: string;
  body: string;
}): string {
  const to = input.to.filter(Boolean).join(",");
  const params = new URLSearchParams({ subject: input.subject, body: input.body });
  // URLSearchParams encodes spaces as "+", which mail clients render literally.
  return `mailto:${encodeURIComponent(to).replace(/%40/g, "@").replace(/%2C/g, ",")}?${params
    .toString()
    .replace(/\+/g, "%20")}`;
}

/** Whether this draft will survive the trip through a mailto: link intact. */
export function fitsInMailto(input: { to: string[]; subject: string; body: string }): boolean {
  return mailtoUrl(input).length <= MAILTO_SAFE_LENGTH;
}
