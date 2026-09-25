/**
 * Turning a confirmed North meeting into an Outlook event.
 *
 * Two things the rest of the app doesn't have to care about live here: what
 * the invitation is called in someone else's calendar, and what timezone the
 * event is stored in. Both are pure, so the wording and the clock arithmetic
 * are testable without a mailbox.
 */

/**
 * The firm, as it should read in a banker's calendar.
 *
 * Hardcoded rather than a setting because every officer who will ever use
 * North works here, and one more empty box in Settings is worse than one
 * line to change if that stops being true.
 */
export const ORGANIZER_COMPANY = "IMBL";

/**
 * What the meeting is called on the invitation.
 *
 * Deliberately not North's own title. Inside North "Lunch with Dan and
 * Jermaine" is the useful name; in Dan's calendar it is noise, because Dan
 * knows who Dan is. What he needs to see at a glance, three weeks out, is what
 * it is and who it's with.
 */
const CALENDAR_NOUN: Record<string, string> = {
  lunch: "Lunch",
  breakfast: "Breakfast",
  golf: "Golf",
  office_visit: "Visit",
  pop_in: "Visit",
  general: "Meeting",
};

export interface CalendarSubjectInput {
  meetingType: string;
  /** Overrides the noun when he named the occasion himself. */
  customLabel?: string | null;
  /** The organizer's first name, from their sign-in. */
  organizerFirstName?: string | null;
}

/** "Lunch w/ Brandon IMBL". */
export function calendarSubject({
  meetingType,
  customLabel,
  organizerFirstName,
}: CalendarSubjectInput): string {
  const custom = customLabel?.trim();
  const noun =
    (custom && capitalize(custom)) ||
    CALENDAR_NOUN[meetingType] ||
    capitalize(meetingType.replace(/_/g, " "));

  // Without a name it still reads right, which matters because the name comes
  // from a profile field nothing forces anyone to fill in.
  const who = organizerFirstName?.trim()
    ? `${organizerFirstName.trim()} ${ORGANIZER_COMPANY}`
    : ORGANIZER_COMPANY;

  return `${noun} w/ ${who}`;
}

/** "Brandon Toyn" -> "Brandon". Blank in, blank out. */
export function firstNameOf(displayName?: string | null): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first || null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The zone every meeting is booked in.
 *
 * Everyone using North is in one office in Utah and every partner they meet is
 * driving there, so a per-user setting would be a box nobody ever changes.
 *
 * Two names for one zone because two systems are involved: `Intl` speaks IANA,
 * and Graph wants the Windows id. Both mean US Mountain time *with* daylight
 * saving, despite "Standard" sitting in the Windows name -- that is Microsoft's
 * label for the whole zone, not for standard time only.
 */
export const MEETING_TIME_ZONE = "America/Denver";
export const MEETING_TIME_ZONE_WINDOWS = "Mountain Standard Time";

/**
 * An instant, written as wall-clock time in a named zone: "2026-10-05T12:00:00".
 *
 * This is what Graph wants alongside a `timeZone`, and sending it is the
 * difference between an event Outlook stores as Mountain and one it stores as
 * UTC. Both show the right moment, but only the first survives being dragged
 * to a new time in someone's calendar, and only the first reads as noon rather
 * than 6pm in a shared view.
 *
 * `Intl` does the daylight-saving arithmetic, which is the entire reason this
 * project still has no timezone library.
 */
export function toZonedDateTime(instant: Date, timeZone = MEETING_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  // Midnight comes back as hour "24" in some ICU versions.
  const hour = get("hour") === "24" ? "00" : get("hour");

  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}`;
}
