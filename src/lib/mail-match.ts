/**
 * Turning a mailbox into touches.
 *
 * The scan reads the mailbox but keeps almost none of it. A message earns a
 * row only when the other party is already a partner in the list, which is the
 * whole privacy boundary: mail with a spouse, a boss, a borrower's attorney
 * matches nothing and is dropped on the floor unread beyond its address line.
 *
 * Pure on purpose. Every judgement about what counts lives here with a test
 * beside it, so the sync is left with fetching and writing and nothing to
 * decide.
 */

export interface MailMessage {
  /** Graph's immutable message id, used to avoid logging the same mail twice. */
  id: string;
  subject: string | null;
  /** ISO instant the message was sent or received. */
  sentAt: string;
  /** Sender address, or null for a draft. */
  from: string | null;
  toRecipients: readonly string[];
  ccRecipients: readonly string[];
  isDraft?: boolean;
}

export interface MatchedMail {
  messageId: string;
  lenderId: string;
  activityType: "incoming_email" | "personal_email" | "campaign_email";
  direction: "inbound" | "outbound";
  subject: string | null;
  occurredAt: string;
  initiatedByLender: boolean;
}

/**
 * Partner recipients above which an outgoing email stops being personal.
 *
 * A note to two or three people is still written to them. A note to a dozen is
 * a blast wearing a personal address, and letting it mark that many partners as
 * touched would turn the compose window into a way of clearing the list — the
 * same reason campaign email has never counted.
 */
export const PERSONAL_RECIPIENT_LIMIT = 4;

/**
 * An address as it can be compared.
 *
 * Graph hands back a bare address, but mail being mail, it also arrives as
 * `Jake Terrill <jake@bank.com>` often enough to be worth handling here rather
 * than discovering in production.
 */
export function normalizeAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const angled = raw.match(/<([^>]+)>/);
  const address = (angled ? angled[1] : raw).trim().toLowerCase();
  return address.includes("@") ? address : null;
}

/** Address to partner id, for the addresses worth recognising. */
export function buildLenderIndex(
  lenders: readonly { id: string; email: string | null }[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const lender of lenders) {
    const address = normalizeAddress(lender.email);
    // First one wins. Two partners sharing an address is a data problem to fix
    // in the list, not something to guess at here.
    if (address && !index.has(address)) index.set(address, lender.id);
  }
  return index;
}

const AUTO_REPLY_PREFIXES = [
  "automatic reply:",
  "auto reply:",
  "autoreply:",
  "auto:",
  "out of office:",
  "out of the office:",
  "undeliverable:",
  "undelivered mail returned",
  "delivery status notification",
  "mail delivery failed",
];

/**
 * Whether this is the mailbox talking rather than the person.
 *
 * An out-of-office comes from the partner's own address, so without this it
 * reads as a reply and restarts the clock for a tier that specifically
 * requires a human on the other end. That would be the single most misleading
 * thing this feature could do, so it is checked first and checked loosely.
 */
export function isAutoReply(subject: string | null | undefined): boolean {
  if (!subject) return false;
  const s = subject.trim().toLowerCase();
  const withoutRe = s.replace(/^((re|fw|fwd)\s*:\s*)+/i, "");
  return AUTO_REPLY_PREFIXES.some((p) => withoutRe.startsWith(p) || s.startsWith(p));
}

/**
 * The touches a single message is worth, which is usually none.
 *
 * Returns one row per partner involved, because a reply to three of them is
 * three relationships heard from, not one. Incoming mail is a conversation and
 * restarts every tier's clock; outgoing mail is not, and for A and B it will
 * sit on the timeline without making them look covered. That asymmetry is the
 * point, not an oversight.
 */
export function matchMessage(
  message: MailMessage,
  lenderIndex: ReadonlyMap<string, string>,
  selfAddresses: readonly string[],
): MatchedMail[] {
  if (message.isDraft) return [];

  const from = normalizeAddress(message.from);
  if (!from) return [];

  const fromLender = lenderIndex.get(from);
  if (fromLender) {
    // An automatic reply is the server being polite, not the partner writing.
    if (isAutoReply(message.subject)) return [];
    return [
      {
        messageId: message.id,
        lenderId: fromLender,
        activityType: "incoming_email",
        direction: "inbound",
        subject: message.subject,
        occurredAt: message.sentAt,
        initiatedByLender: true,
      },
    ];
  }

  const mine = new Set(
    selfAddresses.map((a) => normalizeAddress(a)).filter((a): a is string => Boolean(a)),
  );
  if (!mine.has(from)) return [];

  const recipients = [...message.toRecipients, ...message.ccRecipients];
  const lenderIds = new Set<string>();
  for (const recipient of recipients) {
    const address = normalizeAddress(recipient);
    const lenderId = address ? lenderIndex.get(address) : undefined;
    if (lenderId) lenderIds.add(lenderId);
  }
  if (lenderIds.size === 0) return [];

  const activityType =
    lenderIds.size > PERSONAL_RECIPIENT_LIMIT ? "campaign_email" : "personal_email";

  return [...lenderIds].map((lenderId) => ({
    messageId: message.id,
    lenderId,
    activityType,
    direction: "outbound" as const,
    subject: message.subject,
    occurredAt: message.sentAt,
    initiatedByLender: false,
  }));
}

/**
 * Every touch a batch of messages is worth, with what is already logged left
 * out.
 *
 * Dedupe is on Graph's message id paired with the partner, so re-running a scan
 * over the same window is free and a message to two partners still lands twice.
 */
export function matchMessages(
  messages: readonly MailMessage[],
  lenderIndex: ReadonlyMap<string, string>,
  selfAddresses: readonly string[],
  alreadyLogged: ReadonlySet<string> = new Set(),
): MatchedMail[] {
  const seen = new Set(alreadyLogged);
  const out: MatchedMail[] = [];

  for (const message of messages) {
    for (const match of matchMessage(message, lenderIndex, selfAddresses)) {
      const key = externalId(match.messageId, match.lenderId);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(match);
    }
  }
  return out;
}

/** What goes in `activities.external_id`, and what dedupe checks against. */
export function externalId(messageId: string, lenderId: string): string {
  return `msgraph:${messageId}:${lenderId}`;
}


export interface MatchDiagnostics {
  /** Messages Graph returned with no usable sender address. */
  noSender: number;
  /** Messages sent by the account holder. */
  fromSelf: number;
  /** Messages whose sender is a known partner. */
  fromPartner: number;
  /** Everything else, grouped by sender domain, commonest first. */
  unmatchedDomains: { domain: string; count: number }[];
}

/**
 * Why a sweep matched what it did, in numbers rather than messages.
 *
 * Built for the case where a scan reads a full mailbox and logs nothing, which
 * could be a broken sender lookup, an address book that disagrees with reality,
 * or a genuinely quiet quarter. Domains only: enough to recognise that the
 * banks are in there and the addresses are wrong, and not enough to be a copy
 * of anybody's inbox.
 */
export function diagnose(
  messages: readonly MailMessage[],
  lenderIndex: ReadonlyMap<string, string>,
  selfAddresses: readonly string[],
  topN = 12,
): MatchDiagnostics {
  const mine = new Set(
    selfAddresses.map((a) => normalizeAddress(a)).filter((a): a is string => Boolean(a)),
  );

  let noSender = 0;
  let fromSelf = 0;
  let fromPartner = 0;
  const domains = new Map<string, number>();

  for (const message of messages) {
    const from = normalizeAddress(message.from);
    if (!from) {
      noSender += 1;
      continue;
    }
    if (mine.has(from)) {
      fromSelf += 1;
      continue;
    }
    if (lenderIndex.has(from)) {
      fromPartner += 1;
      continue;
    }
    const domain = from.slice(from.indexOf("@") + 1);
    domains.set(domain, (domains.get(domain) ?? 0) + 1);
  }

  const unmatchedDomains = [...domains.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
    .slice(0, topN);

  return { noSender, fromSelf, fromPartner, unmatchedDomains };
}
