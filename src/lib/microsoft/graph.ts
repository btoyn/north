import "server-only";
import { MEETING_TIME_ZONE_WINDOWS, toZonedDateTime } from "@/lib/calendar-event";
import { GRAPH_BASE, SCOPE_FOR, scopeSatisfied } from "./config";
import { getAccessToken } from "./tokens";
import type { MailMessage } from "@/lib/mail-match";
import type { GraphAttendeeResponse } from "@/lib/meeting-responses";
import {
  busyBlocksFromSchedule,
  mergeBusyBlocks,
  scheduleHadErrors,
  type BusyBlockIso,
  type GraphScheduleEntry,
} from "./free-busy";

/**
 * The Microsoft Graph calls this app actually makes. Three of them.
 *
 * Every one returns a result object rather than throwing, because none of them
 * is allowed to take a screen down: a calendar Graph won't answer for should
 * degrade to the behaviour the app had before it was ever connected, with a
 * line saying so — never to a blank week that reads as "free".
 */

export type GraphFailure =
  | "not_configured"
  | "not_connected"
  | "reconnect_needed"
  | "missing_scope"
  // The thing we asked about is no longer there -- an event deleted out of
  // Outlook, most often. Ordinary, and not a reason to report a fault.
  | "gone"
  | "unavailable";

async function graphFetch(
  path: string,
  init: RequestInit & { scope?: string } = {},
): Promise<{ ok: true; data: unknown } | { ok: false; failure: GraphFailure; detail?: string }> {
  const auth = await getAccessToken();
  if ("error" in auth) return { ok: false, failure: auth.error };

  // A partial consent is normal: an admin can grant calendar and withhold mail.
  // Better to say which half is missing than to send a request that 403s.
  if (init.scope && !scopeSatisfied(auth.scopes, init.scope)) {
    return { ok: false, failure: "missing_scope", detail: init.scope };
  }

  try {
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
        // Ask for UTC so the parser never has to guess an offset.
        prefer: 'outlook.timezone="UTC"',
        ...init.headers,
      },
      cache: "no-store",
    });

    if (res.status === 401) return { ok: false, failure: "reconnect_needed" };
    if (res.status === 403) return { ok: false, failure: "missing_scope", detail: init.scope };
    if (res.status === 404) return { ok: false, failure: "gone" };
    if (!res.ok) {
      return { ok: false, failure: "unavailable", detail: `HTTP ${res.status}` };
    }
    return { ok: true, data: res.status === 204 ? null : await res.json() };
  } catch (cause) {
    return { ok: false, failure: "unavailable", detail: String(cause) };
  }
}

export interface FreeBusyResult {
  /** Merged busy blocks. Empty with `ok: false` means "unknown", not "free". */
  busy: BusyBlockIso[];
  ok: boolean;
  failure?: GraphFailure;
  detail?: string;
}

/**
 * What the real calendar says is taken between two instants.
 *
 * This is the piece that makes a suggestion trustworthy. Before it, the app
 * offered dates knowing only about meetings it had recorded itself, which is
 * most of a working week short.
 */
export async function getFreeBusy(input: {
  email: string;
  start: Date;
  end: Date;
}): Promise<FreeBusyResult> {
  const result = await graphFetch("/me/calendar/getSchedule", {
    method: "POST",
    scope: SCOPE_FOR.freeBusy,
    body: JSON.stringify({
      schedules: [input.email],
      startTime: { dateTime: input.start.toISOString(), timeZone: "UTC" },
      endTime: { dateTime: input.end.toISOString(), timeZone: "UTC" },
      // An hour is plenty: the slot-finder steps in 30-minute increments and
      // exact block edges come back in scheduleItems anyway.
      availabilityViewInterval: 30,
    }),
  });

  if (!result.ok) {
    return { busy: [], ok: false, failure: result.failure, detail: result.detail };
  }

  const entries = ((result.data as { value?: GraphScheduleEntry[] })?.value ?? []);
  const busy = mergeBusyBlocks(busyBlocksFromSchedule(entries));

  if (scheduleHadErrors(entries)) {
    return { busy, ok: false, failure: "unavailable", detail: "Graph returned an error entry" };
  }
  return { busy, ok: true };
}

export interface CreateEventInput {
  subject: string;
  start: Date;
  end: Date;
  attendeeEmails: string[];
  location?: string | null;
  body?: string;
}

/**
 * Puts the confirmed meeting on the calendar and invites the partners.
 *
 * Only ever called from Confirm, which is a button a human presses. Nothing in
 * this app books a meeting on its own.
 */
export async function createCalendarEvent(
  input: CreateEventInput,
): Promise<{ eventId: string } | { failure: GraphFailure; detail?: string }> {
  const result = await graphFetch("/me/events", {
    method: "POST",
    scope: SCOPE_FOR.createEvent,
    body: JSON.stringify({
      subject: input.subject,
      // Wall-clock time plus the zone it belongs to, not a UTC instant. Both
      // land at the same moment, but an event stored as UTC reads as 6pm in a
      // shared Mountain calendar and moves the wrong way when anyone drags it.
      start: {
        dateTime: toZonedDateTime(input.start),
        timeZone: MEETING_TIME_ZONE_WINDOWS,
      },
      end: {
        dateTime: toZonedDateTime(input.end),
        timeZone: MEETING_TIME_ZONE_WINDOWS,
      },
      location: input.location ? { displayName: input.location } : undefined,
      body: input.body ? { contentType: "text", content: input.body } : undefined,
      attendees: input.attendeeEmails.map((address) => ({
        emailAddress: { address },
        type: "required",
      })),
    }),
  });

  if (!result.ok) return { failure: result.failure, detail: result.detail };
  const id = (result.data as { id?: string })?.id;
  return id ? { eventId: id } : { failure: "unavailable", detail: "No event id returned" };
}

/**
 * Who has accepted, declined or half-accepted a meeting we created.
 *
 * One request per event, and only for events North booked, so this never walks
 * his calendar. `$select=attendees` keeps subjects, bodies and everyone else's
 * meetings out of the response.
 */
export async function getEventResponses(
  eventId: string,
): Promise<{ attendees?: GraphAttendeeResponse[]; failure?: GraphFailure; detail?: string }> {
  const result = await graphFetch(
    `/me/events/${encodeURIComponent(eventId)}?$select=attendees`,
    { scope: SCOPE_FOR.freeBusy },
  );
  if (!result.ok) return { failure: result.failure, detail: result.detail };

  const data = result.data as {
    attendees?: {
      emailAddress?: { address?: string };
      status?: { response?: string };
    }[];
  };

  return {
    attendees: (data.attendees ?? []).map((a) => ({
      email: a.emailAddress?.address ?? null,
      response: a.status?.response ?? null,
    })),
  };
}

export interface MailInput {
  to: string[];
  subject: string;
  body: string;
}

/**
 * Leaves the ask in his Outlook drafts.
 *
 * The default, and the one the product has always wanted: he proofs it and
 * presses send himself. `sendMail` exists beside it for when he decides the
 * tool has earned it, but nothing calls it yet.
 */
export async function createMailDraft(
  input: MailInput,
): Promise<{ draftId: string; webLink?: string } | { failure: GraphFailure; detail?: string }> {
  const result = await graphFetch("/me/messages", {
    method: "POST",
    scope: SCOPE_FOR.draftMail,
    body: JSON.stringify({
      subject: input.subject,
      body: { contentType: "text", content: input.body },
      toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
    }),
  });

  if (!result.ok) return { failure: result.failure, detail: result.detail };
  const data = result.data as { id?: string; webLink?: string };
  return data?.id
    ? { draftId: data.id, webLink: data.webLink }
    : { failure: "unavailable", detail: "No draft id returned" };
}

/** Sends directly. Deliberately unused until he asks for it. */
export async function sendMail(
  input: MailInput,
): Promise<{ sent: true } | { failure: GraphFailure; detail?: string }> {
  const result = await graphFetch("/me/sendMail", {
    method: "POST",
    scope: SCOPE_FOR.sendMail,
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: "text", content: input.body },
        toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    }),
  });

  return result.ok ? { sent: true } : { failure: result.failure, detail: result.detail };
}

/** Who Microsoft says this is, recorded so Settings can show the account. */
export async function getMicrosoftProfile(
  accessToken: string,
): Promise<{ email: string | null; id: string | null }> {
  try {
    const res = await fetch(`${GRAPH_BASE}/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return { email: null, id: null };
    const data = (await res.json()) as {
      mail?: string;
      userPrincipalName?: string;
      id?: string;
    };
    return { email: data.mail ?? data.userPrincipalName ?? null, id: data.id ?? null };
  } catch {
    return { email: null, id: null };
  }
}

interface GraphRecipient {
  emailAddress?: { address?: string };
}

interface GraphMessage {
  id?: string;
  subject?: string | null;
  sentDateTime?: string;
  receivedDateTime?: string;
  isDraft?: boolean;
  from?: GraphRecipient;
  sender?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
}

const address = (r: GraphRecipient | undefined): string | null =>
  r?.emailAddress?.address ?? null;

const addresses = (list: GraphRecipient[] | undefined): string[] =>
  (list ?? []).map(address).filter((a): a is string => Boolean(a));

export interface ListMessagesResult {
  messages: MailMessage[];
  ok: boolean;
  failure?: GraphFailure;
  detail?: string;
}

/**
 * Message headers since a given instant, across the whole mailbox.
 *
 * `$select` is the privacy control, not an optimisation: body and bodyPreview
 * are never named, so the message text is not fetched, cannot be logged by
 * accident, and never crosses the wire into this app at all. What comes back
 * is who, when, and the subject line.
 *
 * Paging is followed to a hard cap of 40 pages at 500 messages, so twenty
 * thousand in one sweep. The first attempt used 100 a page and twenty pages,
 * and a real ninety-day backfill stopped dead at 2,000 messages having covered
 * five weeks. The cap still exists because an unbounded loop against somebody's
 * mailbox is worse than a truncated one, but it is now far above any plausible
 * ninety days of mail.
 *
 * `detail` says when the cap was reached, and the caller surfaces it, because a
 * sweep that quietly stops short is the thing that just cost an afternoon.
 */
export async function listMessagesSince(
  since: Date,
  maxPages = 40,
): Promise<ListMessagesResult> {
  const select = "id,subject,sentDateTime,receivedDateTime,isDraft,from,sender,toRecipients,ccRecipients";
  let path =
    `/me/messages?$select=${select}` +
    `&$filter=receivedDateTime ge ${since.toISOString()}` +
    `&$orderby=receivedDateTime desc&$top=500`;

  const messages: MailMessage[] = [];

  for (let page = 0; page < maxPages; page++) {
    const result = await graphFetch(path, { scope: SCOPE_FOR.readMail });
    if (!result.ok) {
      // Whatever came back before the failure is still true, so it is kept and
      // the caller is told the sweep was partial.
      return { messages, ok: false, failure: result.failure, detail: result.detail };
    }

    const body = result.data as { value?: GraphMessage[]; "@odata.nextLink"?: string };
    for (const m of body.value ?? []) {
      if (!m.id) continue;
      messages.push({
        id: m.id,
        subject: m.subject ?? null,
        sentAt: m.sentDateTime ?? m.receivedDateTime ?? new Date().toISOString(),
        from: address(m.from) ?? address(m.sender),
        toRecipients: addresses(m.toRecipients),
        ccRecipients: addresses(m.ccRecipients),
        isDraft: m.isDraft ?? false,
      });
    }

    const next = body["@odata.nextLink"];
    if (!next) return { messages, ok: true };
    // nextLink is absolute; graphFetch wants a path.
    path = next.startsWith(GRAPH_BASE) ? next.slice(GRAPH_BASE.length) : next;
  }

  return { messages, ok: true, detail: "stopped at the page cap" };
}


/**
 * The text of one reply, for a message already known to answer an open ask.
 *
 * Deliberately one message at a time and never part of the sweep. The sweep
 * reads headers for a whole mailbox and must not pull bodies with them; this
 * runs only for the handful of messages a proposal is waiting on, which is the
 * narrowest place the text can be read and still be useful.
 *
 * `uniqueBody` is the part the person actually typed, with the quoted original
 * removed by Exchange. Without it every reply carries the proposal's own dates
 * quoted underneath and the reader hands them back as if they were an answer.
 */
export async function getReplyText(
  messageId: string,
): Promise<{ text?: string; failure?: GraphFailure }> {
  const result = await graphFetch(
    `/me/messages/${encodeURIComponent(messageId)}?$select=uniqueBody`,
    {
      scope: SCOPE_FOR.readMail,
      headers: { prefer: 'outlook.body-content-type="text"' },
    },
  );
  if (!result.ok) return { failure: result.failure };

  const body = result.data as { uniqueBody?: { content?: string } };
  const text = body.uniqueBody?.content?.trim();
  return text ? { text } : {};
}
