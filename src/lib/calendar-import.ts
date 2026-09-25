/**
 * Meetings he made in Outlook and never told North about.
 *
 * Until now North only knew about meetings it booked itself, which made it
 * quietly wrong in the ordinary case: a lunch arranged over email, or one a
 * banker put in his calendar, was invisible. It never showed in Up next and it
 * never moved anybody's clock, so the app said a partner was going cold on the
 * week he took them to lunch.
 *
 * The rule is who is on it, not what it is called. A naming convention would
 * have to be remembered forever and would still miss every invitation he did
 * not send. The subject is used only as a hint about what kind of meeting it
 * was, and being wrong about that costs nothing.
 *
 * Pure. What counts as a meeting with a partner is a rule, and it is tested
 * without a calendar.
 */

import { responseStatusFromGraph, type ResponseStatus } from "./meeting-responses";

/**
 * More partners than this and it is not a meeting, it is an event.
 *
 * The mailbox sweep draws the same line at the same number for the same
 * reason: past a handful of people nobody is having a conversation, and
 * counting a bank's quarterly roadshow as personal contact with all nine
 * attendees is the flattering lie this app exists to refuse.
 */
export const MAX_PARTNERS_ON_AN_EVENT = 4;

/** Partners aside, a room with this many people in it is not a lunch either. */
export const MAX_PEOPLE_ON_AN_EVENT = 12;

const TYPE_HINTS: [RegExp, string][] = [
  [/\blunch\b/, "lunch"],
  [/\bbreakfast\b/, "breakfast"],
  [/\bgolf\b|\btee time\b|\bround\b/, "golf"],
  [/\bpop[- ]?in\b|\bstop(ping)? by\b|\bdrop[- ]?by\b/, "pop_in"],
  [/\bvisit\b|\bstop in\b/, "office_visit"],
];

/**
 * What kind of meeting the subject sounds like.
 *
 * A guess, and deliberately a cheap one. "General" is a fine answer and the
 * only cost of getting it wrong is a label, which he can change.
 */
export function meetingTypeFromSubject(subject: string | null | undefined): string {
  const text = (subject ?? "").toLowerCase();
  for (const [pattern, type] of TYPE_HINTS) {
    if (pattern.test(text)) return type;
  }
  return "general";
}

export interface CalendarEvent {
  id: string;
  subject: string | null;
  start: Date | null;
  end: Date | null;
  cancelled: boolean;
  organizerEmail: string | null;
  attendees: { email: string | null; response: string | null }[];
  locationName: string | null;
}

export interface ImportablePartner {
  lenderId: string;
  responseStatus: ResponseStatus;
}

export interface ImportableMeeting {
  eventId: string;
  title: string;
  meetingType: string;
  startAt: Date;
  endAt: Date | null;
  locationName: string | null;
  partners: ImportablePartner[];
}

const normalize = (email: string | null | undefined) => email?.trim().toLowerCase() ?? "";

/**
 * The events worth pulling in, and who was on each.
 *
 * A partner who organised the meeting counts as having agreed to it, which is
 * the one place this differs from reading back an invitation North sent: there
 * the organizer is him and means nothing, here it is the banker who asked.
 * Anyone who has not answered lands as `invited` and counts for nothing until
 * they do.
 */
export function importableMeetings(
  events: readonly CalendarEvent[],
  lenderIdByEmail: ReadonlyMap<string, string>,
  alreadyKnownEventIds: ReadonlySet<string>,
): ImportableMeeting[] {
  const found: ImportableMeeting[] = [];

  for (const event of events) {
    if (event.cancelled) continue;
    if (!event.start) continue;
    if (alreadyKnownEventIds.has(event.id)) continue;

    const organizer = normalize(event.organizerEmail);
    const people = new Map<string, string | null>();
    for (const a of event.attendees) {
      const key = normalize(a.email);
      if (key) people.set(key, a.response);
    }
    // The organizer is not always in the attendee list, and when a banker set
    // the meeting up they are the whole reason it is worth importing.
    if (organizer && !people.has(organizer)) people.set(organizer, "organizer");

    if (people.size > MAX_PEOPLE_ON_AN_EVENT) continue;

    const partners = new Map<string, ImportablePartner>();
    for (const [email, response] of people) {
      const lenderId = lenderIdByEmail.get(email);
      if (!lenderId || partners.has(lenderId)) continue;
      partners.set(lenderId, {
        lenderId,
        responseStatus:
          responseStatusFromGraph(response) ?? (email === organizer ? "confirmed" : "invited"),
      });
    }

    if (partners.size === 0 || partners.size > MAX_PARTNERS_ON_AN_EVENT) continue;

    found.push({
      eventId: event.id,
      title: event.subject?.trim() || "Meeting",
      meetingType: meetingTypeFromSubject(event.subject),
      startAt: event.start,
      endAt: event.end,
      locationName: event.locationName?.trim() || null,
      partners: [...partners.values()],
    });
  }

  return found;
}
