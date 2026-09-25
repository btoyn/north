/**
 * Reading back what people did with the invitation.
 *
 * A group invitation goes to everyone once two have said yes, so most of the
 * people on a meeting have agreed to nothing yet. Some of them will accept in
 * Outlook and never send a word, which until now North could not see: their
 * attendee row stayed `invited`, their coverage clock never moved, and he had
 * to log it by hand or not at all.
 *
 * Pure. Deciding what Graph's answer means is a rule, and it belongs somewhere
 * it can be tested without a calendar.
 */

/** What we store. Same vocabulary the check constraint allows. */
export type ResponseStatus =
  | "invited"
  | "awaiting_reply"
  | "tentative"
  | "confirmed"
  | "declined"
  | "no_response";

/**
 * Graph's `attendee.status.response`, translated.
 *
 * Null means "Graph told us nothing new" and the row is left exactly as it is.
 * That matters more than it looks: `notResponded` is the answer for somebody
 * who has not opened the invitation yet, and overwriting a verdict recorded
 * from their emailed reply with it would undo the reply reader's work.
 */
export function responseStatusFromGraph(response: string | null | undefined): ResponseStatus | null {
  switch (response) {
    case "accepted":
      return "confirmed";
    case "tentativelyAccepted":
      // Not a commitment, and coverage only counts 'confirmed'. Showing it is
      // still worth something: he can see the difference between a maybe and
      // a silence when he decides whether to chase.
      return "tentative";
    case "declined":
      return "declined";
    default:
      return null;
  }
}

export interface AttendeeRow {
  lenderId: string;
  email: string | null;
  responseStatus: string | null;
}

export interface GraphAttendeeResponse {
  email: string | null;
  response: string | null;
}

export interface ResponseChange {
  lenderId: string;
  from: string | null;
  to: ResponseStatus;
}

const normalize = (email: string | null | undefined) => email?.trim().toLowerCase() ?? "";

/**
 * Which attendee rows the calendar says should change, and to what.
 *
 * Only real changes come back, so a sweep over meetings nobody has touched
 * writes nothing at all. An attendee Graph has no answer for, or whose answer
 * matches what is already stored, is simply absent.
 */
export function responseChanges(
  rows: readonly AttendeeRow[],
  fromGraph: readonly GraphAttendeeResponse[],
): ResponseChange[] {
  const byEmail = new Map<string, string | null>();
  for (const a of fromGraph) {
    const key = normalize(a.email);
    if (key) byEmail.set(key, a.response);
  }

  const changes: ResponseChange[] = [];
  for (const row of rows) {
    const key = normalize(row.email);
    if (!key || !byEmail.has(key)) continue;

    const next = responseStatusFromGraph(byEmail.get(key));
    if (!next || next === row.responseStatus) continue;

    changes.push({ lenderId: row.lenderId, from: row.responseStatus, to: next });
  }
  return changes;
}
