/**
 * Noticing that somebody answered a meeting ask.
 *
 * The mailbox sweep already logs inbound email from partners, and a proposal
 * already knows who it went to. Nothing joined the two, so a reply sat on a
 * timeline while the proposal went on saying "waiting" and the dashboard said
 * nothing at all.
 *
 * This is deliberately only a flag. The sweep never fetches message bodies, so
 * North can say Jermaine answered and cannot say what he answered. Reading the
 * mail and deciding which dates survive stays a person's job.
 */

export interface OpenAttendee {
  proposalId: string;
  lenderId: string;
  /** When the ask went out. A reply has to be after it. */
  proposalSentAt: string | null;
  /** Already marked, by hand or by an earlier sweep. */
  repliedAt: string | null;
}

export interface InboundTouch {
  lenderId: string;
  occurredAt: string;
}

export interface DetectedReply {
  proposalId: string;
  lenderId: string;
  /** The instant of their earliest reply, not the instant we noticed. */
  repliedAt: string;
}

/**
 * Attendees whose reply has arrived and nobody has recorded yet.
 *
 * The earliest inbound email after the ask wins, because the moment the
 * conversation restarted is more useful than whichever message the sweep
 * happened to see last. Anyone already marked is left alone, so a verdict
 * recorded by hand is never overwritten by a later "RE:".
 */
export function detectReplies(
  attendees: readonly OpenAttendee[],
  inbound: readonly InboundTouch[],
): DetectedReply[] {
  const byLender = new Map<string, string[]>();
  for (const touch of inbound) {
    const existing = byLender.get(touch.lenderId);
    if (existing) existing.push(touch.occurredAt);
    else byLender.set(touch.lenderId, [touch.occurredAt]);
  }

  const found: DetectedReply[] = [];
  for (const attendee of attendees) {
    if (attendee.repliedAt) continue;
    if (!attendee.proposalSentAt) continue;

    const candidates = (byLender.get(attendee.lenderId) ?? [])
      .filter((at) => at > attendee.proposalSentAt!)
      .sort();
    if (candidates.length === 0) continue;

    found.push({
      proposalId: attendee.proposalId,
      lenderId: attendee.lenderId,
      repliedAt: candidates[0],
    });
  }
  return found;
}

/**
 * Whether this attendee is a reply nobody has dealt with.
 *
 * `replied_at` with no `reply_intent` is the state the sweep leaves behind:
 * they wrote back, and which dates survive is still unknown. Recording a
 * verdict by hand sets the intent and clears it.
 */
export function isUnreadReply(attendee: {
  repliedAt: string | null;
  replyIntent: string | null;
}): boolean {
  return Boolean(attendee.repliedAt) && !attendee.replyIntent;
}

export interface FetchedReply {
  replyText: string | null;
  /** When the browser last interpreted `replyText`. Null means never. */
  replyReadAt: string | null;
}

/**
 * Replies the sweep pulled down that nobody has interpreted yet.
 *
 * The sweep fetches the text and stops there, because deciding what "Thursday
 * works" means needs his clock and the sweep runs in UTC. So the screens read
 * what the sweep fetched, and this is the queue they work from.
 *
 * `replyReadAt`, not `replyIntent`, is what marks one done. An abstention is a
 * real answer — the reader saying it will not guess — and it leaves the intent
 * null. Keying off the intent would make every page load re-read the replies
 * that were honestly unclear, and overwrite a verdict he had settled by hand.
 */
export function repliesAwaitingReading<T extends FetchedReply>(
  attendees: readonly T[],
): T[] {
  return attendees.filter((a) => Boolean(a.replyText?.trim()) && !a.replyReadAt);
}
