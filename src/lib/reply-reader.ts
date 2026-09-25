/**
 * Reads a partner's reply to a meeting proposal (spec §15, steps 11–13).
 *
 * The brief was "auto-book when very clear, anything vague comes to me", so
 * this is built to abstain. Every rule below has to clear a specific bar, and
 * anything that doesn't lands on `unclear` and goes to Brandon. A wrong
 * "unclear" costs him ten seconds; a wrong "accepted" puts a meeting on a
 * partner's calendar that nobody agreed to.
 *
 * No AI. These replies are mostly "sounds good" or "the 15th works better" —
 * ordinary code handles that, and it costs nothing and runs offline. An AI
 * pass belongs on the messy remainder ("I'm slammed that week but the
 * following Tuesday could work if it's early"), which this correctly refuses
 * to guess at today.
 */

export type ReplyIntent = "accepted" | "declined" | "countered" | "unclear";

export interface ReplyReading {
  intent: ReplyIntent;
  /** The agreed slot for `accepted`, or the partner's suggestion for `countered`. */
  slot: Date | null;
  /** Plain-language account of the call, shown to Brandon before he commits. */
  reason: string;
}

const AFFIRMATIVE =
  /\b(sounds good|works for me|that works|works great|yes|yep|yeah|sure|perfect|see you then|book it|let'?s do it|i'?m free|count me in|see you)\b/;

const NEGATIVE =
  /\b(can'?t|cannot|won'?t work|not going to work|no good|unable|out of town|traveling|travelling|on vacation|slammed|swamped|tied up|another time|rain ?check|have to pass|no can do)\b/;

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

/**
 * Drop the original email quoted underneath the reply.
 *
 * Without this the proposal's own dates get read back as if the partner wrote
 * them, and a "can't" in the reply collides with a "free" in the quote.
 */
export function stripQuotedHistory(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith(">")) break;
    if (/^on .+ wrote:$/i.test(t)) break;
    if (/^-+\s*original message\s*-+$/i.test(t)) break;
    if (/^from:\s/i.test(t)) break;
    if (/^_{5,}$/.test(t)) break;
    if (/^sent from my /i.test(t)) break;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

interface DateMention {
  /** Where in the text, so a nearby negation can be matched to it. */
  sentence: string;
  date: Date;
  /** Explicit time of day, when the reply gave one. */
  minutes: number | null;
}

/**
 * Break the reply into clauses, not sentences.
 *
 * "Can't do the 13th, but the 18th works" is one sentence carrying opposite
 * answers about two dates. Negation has to attach to the clause it appears in
 * or that reply reads as a flat no. Splitting on "or" likewise separates
 * "the 13th or the 18th" into two mentions, which is what makes an unpicked
 * either/or land on `unclear` rather than booking the first one named.
 */
function splitClauses(text: string): string[] {
  return text
    .split(/[.!?;\n,]|\bbut\b|\bthough\b|\bor\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Gestures at a future that isn't a date. These are the replies most likely to
 * be misread as a flat no, when they are really "not then, but soon".
 */
const VAGUE_FUTURE =
  /\b(next week|following week|week after|later (this|next) (week|month)|after the holidays|end of the (month|quarter)|sometime|down the road|in a few weeks)\b/;

/** "11:30", "1pm", "around 12" → minutes from midnight. */
function findTime(sentence: string): number | null {
  const m = sentence.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase().replace(/\./g, "");
  if (hour > 23 || minute > 59) return null;

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  // A bare "1" or "12:30" in a business-hours reply means the afternoon.
  if (!meridiem && hour >= 1 && hour <= 6) hour += 12;
  // Bare numbers that are obviously a day-of-month, not a clock time.
  if (!meridiem && !m[2] && (hour > 12 || hour === 0)) return null;
  return hour * 60 + minute;
}

function nextOccurrenceOfDay(dayOfMonth: number, now: Date, withinDays: number): Date | null {
  for (let i = 0; i <= withinDays; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (d.getDate() === dayOfMonth) return d;
  }
  return null;
}

function nextOccurrenceOfWeekday(weekday: number, now: Date, withinDays: number): Date | null {
  for (let i = 1; i <= withinDays; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (d.getDay() === weekday) return d;
  }
  return null;
}

/**
 * Dates the reply actually names. Vague references ("next week", "sometime
 * after the holidays") are deliberately not resolved — they are exactly the
 * replies that should reach a human.
 */
function findDateMentions(text: string, now: Date, horizonDays: number): DateMention[] {
  const mentions: DateMention[] = [];

  for (const clause of splitClauses(text)) {
    const lower = clause.toLowerCase();
    const minutes = findTime(clause);
    // A clause can name a date more than one way ("November 13th" matches both
    // the month-day and the ordinal pattern) — keep one mention per date.
    const seen = new Set<string>();

    const add = (date: Date | null) => {
      if (!date) return;
      const key = date.toDateString();
      if (seen.has(key)) return;
      seen.add(key);
      mentions.push({ sentence: clause, date, minutes });
    };

    // "November 13" / "Nov 13th"
    for (const m of lower.matchAll(
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/g,
    )) {
      const monthIndex = MONTHS.findIndex((name) => name.startsWith(m[1]));
      const day = Number(m[2]);
      if (monthIndex < 0 || day < 1 || day > 31) continue;
      let year = now.getFullYear();
      // A month already behind us means they mean next year.
      if (monthIndex < now.getMonth()) year += 1;
      add(new Date(year, monthIndex, day));
    }

    // "the 13th" / "13th"
    for (const m of lower.matchAll(/\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/g)) {
      const day = Number(m[1]);
      if (day < 1 || day > 31) continue;
      add(nextOccurrenceOfDay(day, now, horizonDays));
    }

    // "Tuesday" / "Thurs"
    for (const m of lower.matchAll(
      /\b(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\b/g,
    )) {
      const idx = WEEKDAYS.findIndex((d) => d.startsWith(m[1].slice(0, 3)));
      if (idx < 0) continue;
      add(nextOccurrenceOfWeekday(idx, now, horizonDays));
    }
  }

  return mentions;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export interface ReadReplyInput {
  text: string;
  /** The dates that were offered, in the order they appeared in the email. */
  offeredSlots: Date[];
  now: Date;
  /** How far ahead a mentioned date may resolve. */
  horizonDays?: number;
}

export function readReply({
  text,
  offeredSlots,
  now,
  horizonDays = 90,
}: ReadReplyInput): ReplyReading {
  const body = stripQuotedHistory(text);
  if (!body) {
    return { intent: "unclear", slot: null, reason: "The reply came through empty." };
  }

  const mentions = findDateMentions(body, now, horizonDays);

  // A date is only agreement if its own sentence isn't the one saying no.
  // "Can't do the 13th, but the 15th works" hinges entirely on this.
  const positive = mentions.filter((m) => !NEGATIVE.test(m.sentence.toLowerCase()));
  const rejected = mentions.filter((m) => NEGATIVE.test(m.sentence.toLowerCase()));

  const matchesOffered = (d: Date) => offeredSlots.find((s) => sameDay(s, d));

  const acceptedMentions = positive.filter((m) => matchesOffered(m.date));
  const counterMentions = positive.filter((m) => !matchesOffered(m.date));

  if (acceptedMentions.length === 1 && counterMentions.length === 0) {
    const offered = matchesOffered(acceptedMentions[0].date)!;
    return {
      intent: "accepted",
      slot: offered,
      reason: `They named ${offered.toLocaleDateString()}, which was one of your dates.`,
    };
  }

  // Two of your dates named approvingly is a good problem, but it is still
  // ambiguous — picking one for him would be guessing.
  if (acceptedMentions.length > 1) {
    return {
      intent: "unclear",
      slot: null,
      reason: "They mentioned more than one of your dates without picking.",
    };
  }

  if (counterMentions.length === 1 && acceptedMentions.length === 0) {
    const m = counterMentions[0];
    // Reuse the time of day that was offered when they only named a day —
    // "the 22nd works" means the same lunchtime, not midnight.
    const fallbackMinutes = offeredSlots.length
      ? offeredSlots[0].getHours() * 60 + offeredSlots[0].getMinutes()
      : 12 * 60;
    const minutes = m.minutes ?? fallbackMinutes;
    const slot = new Date(
      m.date.getFullYear(),
      m.date.getMonth(),
      m.date.getDate(),
      Math.floor(minutes / 60),
      minutes % 60,
    );
    return {
      intent: "countered",
      slot,
      reason: m.minutes
        ? "They suggested a different date and time."
        : "They suggested a different date; the time is carried over from your offer.",
    };
  }

  if (counterMentions.length > 1) {
    return {
      intent: "unclear",
      slot: null,
      reason: "They floated several alternative dates.",
    };
  }

  // No usable date anywhere.
  const lower = body.toLowerCase();
  const affirmative = AFFIRMATIVE.test(lower);
  const negative = NEGATIVE.test(lower);

  if (affirmative && !negative && offeredSlots.length === 1) {
    return {
      intent: "accepted",
      slot: offeredSlots[0],
      reason: "They agreed, and only one date was on the table.",
    };
  }

  if (affirmative && !negative && offeredSlots.length > 1) {
    return {
      intent: "unclear",
      slot: null,
      reason: "They said yes without saying which date.",
    };
  }

  // "Can't this week, but the week after could work" is a counter-offer with
  // no date attached, not a refusal — and picking a date out of it is exactly
  // the guess this is built not to make.
  if (VAGUE_FUTURE.test(lower)) {
    return {
      intent: "unclear",
      slot: null,
      reason: "They pointed at a rough time of their own rather than a date.",
    };
  }

  if (negative && !affirmative && rejected.length === 0 && mentions.length === 0) {
    return {
      intent: "declined",
      slot: null,
      reason: "They turned it down without suggesting another time.",
    };
  }

  return {
    intent: "unclear",
    slot: null,
    reason: "Nothing in the reply was definite enough to act on.",
  };
}
