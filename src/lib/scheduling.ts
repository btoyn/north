/**
 * Meeting proposal engine (spec §15).
 *
 * Finds open dates from the availability rules, writes the ask, and reads the
 * reply well enough to know when it is *not* sure.
 *
 * Everything here is pure and works in **local wall-clock time**. Availability
 * is a wall-clock idea — a lunch window is 11am wherever he is — so the rules
 * are evaluated wherever this runs, and it runs in the browser, where local
 * time is already his. That keeps a timezone library out of the project. The
 * only values that cross to the server are absolute instants.
 */

export interface AvailabilityRule {
  meetingType: string;
  /** 0 = Sunday, matching Date.getDay(). */
  weekdays: number[];
  /** Minutes from local midnight. */
  startMinute: number;
  endMinute: number;
}

export interface BusyBlock {
  start: Date;
  end: Date;
}

export interface FindSlotsInput {
  rule: AvailabilityRule;
  durationMinutes: number;
  /** Meetings already on the books, plus dates offered to someone else. */
  busy: BusyBlock[];
  horizonDays: number;
  count: number;
  now: Date;
}

/**
 * The windows a proposal uses before anyone has set their own.
 *
 * Scheduling shipped with no defaults and an empty table, which meant the
 * slot-finder had no rule to work from and returned nothing. The feature was
 * whole and unreachable: fourteen weeks, zero proposals, and no error anywhere
 * saying why. A feature that needs a form filled in before it does anything at
 * all is a feature nobody will discover.
 *
 * These are opinions, not facts, and every one of them is wrong for somebody.
 * They are deliberately unambitious: the middle of the week for meals, because
 * Monday and Friday are where things get moved to; office visits across the
 * working day, because a fifteen-minute call-in fits almost anywhere; golf on
 * a Friday, because that is when it happens. Settings overrides all of it.
 */
export const DEFAULT_AVAILABILITY: AvailabilityRule[] = [
  { meetingType: "lunch", weekdays: [2, 3, 4], startMinute: 11 * 60 + 30, endMinute: 13 * 60 + 30 },
  { meetingType: "breakfast", weekdays: [2, 3, 4], startMinute: 7 * 60 + 30, endMinute: 9 * 60 },
  { meetingType: "office_visit", weekdays: [1, 2, 3, 4, 5], startMinute: 9 * 60, endMinute: 16 * 60 },
  { meetingType: "golf", weekdays: [5], startMinute: 8 * 60, endMinute: 15 * 60 },
  { meetingType: "general", weekdays: [1, 2, 3, 4, 5], startMinute: 9 * 60, endMinute: 16 * 60 },
];

/**
 * The rules to schedule against: whatever is stored, or the defaults when
 * nothing has ever been stored.
 *
 * All or nothing, deliberately. A stored rule set is taken exactly as it is,
 * including the types missing from it, because a type with no days is how
 * "never propose golf" is expressed and quietly filling that gap with a
 * default would override a decision someone made on purpose. Defaults apply
 * only to an account that has never saved availability at all.
 */
export function withDefaultAvailability(
  stored: readonly AvailabilityRule[],
): AvailabilityRule[] {
  const source = stored.length > 0 ? stored : DEFAULT_AVAILABILITY;
  // The weekday array is copied too, not just the rule around it. A shallow
  // copy leaves every caller holding the same array as the module constant,
  // and one of them pushing a day to it would change the defaults for every
  // request the server handles afterwards.
  return source.map((r) => ({ ...r, weekdays: [...r.weekdays] }));
}

/** Whether the rules in play are the defaults rather than a saved choice. */
export function isUsingDefaultAvailability(stored: readonly AvailabilityRule[]): boolean {
  return stored.length === 0;
}

const MS_PER_MINUTE = 60_000;
const STEP_MINUTES = 30;

function atLocalMinutes(day: Date, minutes: number): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
    0,
    0,
  );
}

function overlaps(start: Date, end: Date, busy: BusyBlock[]): boolean {
  return busy.some((b) => start < b.end && end > b.start);
}

/**
 * Two dates a partner can choose between, one per day.
 *
 * Offering two times on the same afternoon reads as a single option with extra
 * steps, so each candidate day contributes at most one slot.
 */
export function findOpenSlots({
  rule,
  durationMinutes,
  busy,
  horizonDays,
  count,
  now,
}: FindSlotsInput): Date[] {
  if (rule.weekdays.length === 0 || count <= 0) return [];

  const windowMinutes = rule.endMinute - rule.startMinute;
  if (windowMinutes < durationMinutes) return [];

  // Center the meeting in the window when there is room, so a 60-minute lunch
  // inside an 11–1 window is offered at 11:30 rather than on the hour — closer
  // to how someone would say it out loud.
  const preferredStart = rule.startMinute + Math.floor((windowMinutes - durationMinutes) / 2 / STEP_MINUTES) * STEP_MINUTES;
  const lastStart = rule.endMinute - durationMinutes;

  const found: Date[] = [];
  // Start tomorrow: proposing a lunch for today is not a proposal.
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  cursor.setDate(cursor.getDate() + 1);

  for (let dayOffset = 0; dayOffset < horizonDays && found.length < count; dayOffset++) {
    const day = new Date(cursor);
    day.setDate(day.getDate() + dayOffset);
    if (!rule.weekdays.includes(day.getDay())) continue;

    // Walk forward within the window until something fits around what's booked.
    for (let minute = preferredStart; minute <= lastStart; minute += STEP_MINUTES) {
      const start = atLocalMinutes(day, minute);
      const end = new Date(start.getTime() + durationMinutes * MS_PER_MINUTE);
      if (start <= now) continue;
      if (overlaps(start, end, busy)) continue;
      found.push(start);
      break;
    }
  }

  return found;
}

/** "Thursday the 13th at 11:30am" — how a person would say it in an email. */
export function describeSlot(slot: Date): string {
  const weekday = slot.toLocaleDateString(undefined, { weekday: "long" });
  const day = slot.getDate();
  const time = slot
    .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    .replace(":00", "")
    .replace(/\s?([AP])M/i, (_, m: string) => m.toLowerCase() + "m");
  return `${weekday} the ${day}${ordinal(day)} at ${time}`;
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

const MEETING_NOUN: Record<string, string> = {
  lunch: "lunch",
  breakfast: "breakfast",
  golf: "a round",
  office_visit: "a visit",
  general: "some time",
};

export interface DraftInput {
  firstName: string;
  meetingType: string;
  customLabel?: string | null;
  slots: Date[];
  /** Days since the last one-to-one contact, when there has been one. */
  daysSinceContact: number | null;
}

/**
 * The ask, written plainly enough that editing it is optional.
 *
 * Deliberately not AI-generated: this is a four-sentence email with two
 * variables in it, and a template he can edit beats a draft he has to proof
 * for invented details. AI earns its place on the reply side, where the input
 * is someone else's prose.
 */
export function draftProposalEmail({
  firstName,
  meetingType,
  customLabel,
  slots,
  daysSinceContact,
}: DraftInput): { subject: string; body: string } {
  const noun = customLabel?.trim() || MEETING_NOUN[meetingType] || "some time";
  const when =
    slots.length === 0
      ? "sometime in the next couple of weeks"
      : slots.map(describeSlot).join(" or ");

  // Only reach for "it's been a while" when it has actually been a while;
  // saying it to someone contacted last week reads as a form letter.
  const opener =
    daysSinceContact !== null && daysSinceContact >= 60
      ? `Hey ${firstName}, it's been too long.`
      : `Hey ${firstName}, hope you're doing well.`;

  const subject =
    meetingType === "office_visit" ? "Stopping by" : `${capitalize(noun)}?`;

  const body = [
    opener,
    ``,
    `We're overdue for ${noun}. Any chance you're free ${when}?`,
    ``,
    `Let me know what works and I'll send an invite.`,
  ].join("\n");

  return { subject, body };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
