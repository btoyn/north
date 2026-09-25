/**
 * Group meeting proposals: the rules, none of the screen.
 *
 * A group ask is one email to several partners at the same bank, all of them on
 * the To line, and it comes back as several separate replies. So the two
 * questions this file answers are: what did *this* person say about *each*
 * date, and which single date has the most yeses.
 *
 * Pure, and wall-clock like the rest of scheduling — it runs in the browser
 * where local time is already his, and only absolute instants cross to the
 * server. Kept out of the components so the tally is testable and so the
 * proposal screen and any later aggregation count the same way.
 */

import { describeSlot } from "./scheduling";
import { readReply, type ReplyReading } from "./reply-reader";

/**
 * What one attendee said about one date.
 *
 * `unclear` is an answer, not a gap: it means the reply reader would be
 * guessing, so Brandon reads it himself. Someone who hasn't written back at
 * all has no verdicts at all — see `notReplied` below.
 */
export type SlotVerdict = "yes" | "no" | "unclear";

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export interface DeriveVerdictsInput {
  /** The dates offered, in the order they appeared in the email. */
  offeredSlots: Date[];
  /** `readReply` over the whole reply, with every offered date on the table. */
  reading: ReplyReading;
  /**
   * `readReply` run again for each date on its own, in the same order.
   *
   * The reader answers one question — which of these dates did they take —
   * and for a group we need that answer per date. Asking it once per date is
   * how a two-date offer gets two answers without touching the reader itself.
   * Optional: without probes every unresolved date is simply `unclear`.
   */
  probes?: ReplyReading[];
}

/**
 * One verdict per offered date, positionally aligned with `offeredSlots`.
 *
 * The reader abstains rather than guesses and that carries through here: a
 * date the reply never addressed comes back `unclear`, not `no`. Silence about
 * Thursday is not a refusal of Thursday, and treating it as one would quietly
 * bury the date the group could actually make.
 */
export function deriveSlotVerdicts({
  offeredSlots,
  reading,
  probes,
}: DeriveVerdictsInput): SlotVerdict[] {
  return offeredSlots.map((slot, i) => {
    // A flat no is a no to all of it — there is no date left to be unsure about.
    if (reading.intent === "declined") return "no";

    // The date they actually took, read with every option in front of them.
    if (reading.intent === "accepted" && reading.slot && sameDay(reading.slot, slot)) {
      return "yes";
    }

    const probe = probes?.[i];
    if (probe?.intent === "accepted") return "yes";
    if (probe?.intent === "declined") return "no";

    // Includes `countered`: they named some other day, which says nothing
    // definite about this one.
    return "unclear";
  });
}

export interface ReadGroupReplyInput {
  /** The reply as it arrived, quoted history and all. */
  text: string;
  offeredSlots: Date[];
  /** His clock. This is why the reading happens in the browser. */
  now: Date;
}

export interface GroupReplyReading {
  reading: ReplyReading;
  verdicts: SlotVerdict[];
}

/**
 * Read one reply against a group's dates: the whole answer, then each date.
 *
 * There was a second copy of this in the mailbox sweep, running server-side
 * with a UTC `now` and without the per-date probes, so an automatic reading
 * and a pasted one could disagree about the same words. One function, called
 * from the browser in both cases, is the only way they stay honest.
 */
export function readGroupReply({
  text,
  offeredSlots,
  now,
}: ReadGroupReplyInput): GroupReplyReading {
  const reading = readReply({ text, offeredSlots, now });
  return {
    reading,
    verdicts: deriveSlotVerdicts({
      offeredSlots,
      reading,
      probes: offeredSlots.map((slot) => readReply({ text, offeredSlots: [slot], now })),
    }),
  };
}

export interface AttendeeReply {
  lenderId: string;
  name: string;
  firstName: string;
  /** Null until they write back. */
  repliedAt: string | null;
  replyText: string | null;
  /** Positionally aligned with the proposal's offered slots. */
  verdicts: SlotVerdict[];
  /** A date of their own, when the reader found one. */
  counteredSlot: string | null;
}

export interface SlotTally {
  index: number;
  slot: Date;
  yes: number;
  no: number;
  unclear: number;
  /** Who said yes, in the order the attendees were given. */
  yesNames: string[];
}

export interface GroupTally {
  slots: SlotTally[];
  /**
   * The one date to put in the calendar: most yeses, earliest on a tie.
   * Null when nobody has said yes to anything yet.
   */
  bestIndex: number | null;
  /** Attendees who have written back, and those who haven't. */
  replied: AttendeeReply[];
  notReplied: AttendeeReply[];
  /** True once any yes has landed anywhere — what puts it in Needs Attention. */
  hasAnyYes: boolean;
}

/**
 * Count the replies by date.
 *
 * The count is over people who answered. A silent attendee is not a no and not
 * an unclear — he is simply not on the meeting yet, so he sits in `notReplied`
 * and moves no number up or down.
 */
export function tallyGroupReplies({
  offeredSlots,
  attendees,
}: {
  offeredSlots: Date[];
  attendees: AttendeeReply[];
}): GroupTally {
  const slots: SlotTally[] = offeredSlots.map((slot, index) => {
    const tally: SlotTally = { index, slot, yes: 0, no: 0, unclear: 0, yesNames: [] };
    for (const a of attendees) {
      if (!a.repliedAt) continue;
      switch (a.verdicts[index]) {
        case "yes":
          tally.yes += 1;
          tally.yesNames.push(a.name);
          break;
        case "no":
          tally.no += 1;
          break;
        default:
          tally.unclear += 1;
      }
    }
    return tally;
  });

  // Most yeses wins; a tie goes to the earlier date, because the offered dates
  // are already in the order they were proposed and the sooner one keeps the
  // relationship moving.
  let bestIndex: number | null = null;
  for (const t of slots) {
    if (t.yes === 0) continue;
    if (bestIndex === null || t.yes > slots[bestIndex].yes) bestIndex = t.index;
  }

  return {
    slots,
    bestIndex,
    replied: attendees.filter((a) => a.repliedAt),
    notReplied: attendees.filter((a) => !a.repliedAt),
    hasAnyYes: bestIndex !== null,
  };
}

/** Everyone who said yes to one date — the people the meeting is actually for. */
export function attendeesForSlot(
  attendees: readonly AttendeeReply[],
  slotIndex: number,
): AttendeeReply[] {
  return attendees.filter((a) => a.repliedAt && a.verdicts[slotIndex] === "yes");
}

/**
 * How many yeses it takes before the invitation goes to the whole group.
 *
 * Below this the meeting is still being assembled and a calendar invite would
 * be jumping the gun. At two it is happening, and the fastest way to get the
 * quiet ones on it is to put it in front of them in Outlook, where accepting
 * is one click and not a reply he then has to read.
 */
export const INVITE_EVERYONE_AT = 2;

/**
 * Who the invitation should go to for one date.
 *
 * Under the threshold, only the people who said yes to that date. At or over
 * it, everybody who was asked -- except anyone who said no to this particular
 * date. "Everyone" is what he wants and a hard no is the one case where it
 * would embarrass him, so the no's are the only ones left off, and the screen
 * still lists them with a box he can tick.
 *
 * Silence is not a no: the whole point of sending it is to reach the people
 * who never wrote back.
 */
export function defaultInvitees(
  attendees: readonly AttendeeReply[],
  slotIndex: number,
  threshold = INVITE_EVERYONE_AT,
): AttendeeReply[] {
  const yes = attendeesForSlot(attendees, slotIndex);
  if (yes.length < threshold) return yes;
  return attendees.filter((a) => a.verdicts[slotIndex] !== "no");
}

/** "Dave", "Dave and Mike", "Dave, Mike and Sara". */
export function formatNameList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const GROUP_NOUN: Record<string, string> = {
  lunch: "lunch",
  breakfast: "breakfast",
  golf: "a round",
  office_visit: "a visit",
  general: "some time",
};

export interface GroupDraftInput {
  /** First names of everyone invited, in the order they'll appear on the To line. */
  firstNames: string[];
  meetingType: string;
  customLabel?: string | null;
  slots: Date[];
}

/**
 * The group ask.
 *
 * Everyone is greeted by name and everyone can see the others — a peer coming
 * is half the reason these land, and a mail-merge that hides that would throw
 * the advantage away. Plain template, no AI: four sentences with two variables
 * in them.
 */
export function draftGroupProposalEmail({
  firstNames,
  meetingType,
  customLabel,
  slots,
}: GroupDraftInput): { subject: string; body: string } {
  const noun = customLabel?.trim() || GROUP_NOUN[meetingType] || "some time";
  const when =
    slots.length === 0
      ? "sometime in the next couple of weeks"
      : slots.map(describeSlot).join(" or ");

  const subject = meetingType === "office_visit" ? "Stopping by" : `${capitalize(noun)}?`;

  const body = [
    `Hey ${formatNameList(firstNames)}, hope you're all doing well.`,
    ``,
    `I'd love to get the group together for ${noun}. Any chance you're free ${when}?`,
    ``,
    `Reply with whichever works and I'll send an invite once I know who's in.`,
  ].join("\n");

  return { subject, body };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "3 of 5 replied · 2 free Thursday the 13th" for a queue row. */
export function describeGroupProgress(tally: GroupTally): string {
  const total = tally.replied.length + tally.notReplied.length;
  const replied = `${tally.replied.length} of ${total} replied`;
  if (tally.bestIndex === null) return replied;
  const best = tally.slots[tally.bestIndex];
  return `${replied} · ${best.yes} free ${describeSlot(best.slot)}`;
}
