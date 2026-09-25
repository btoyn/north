/**
 * Turning Microsoft's calendar answer into the shape the slot-finder already
 * speaks.
 *
 * `findOpenSlots` has always taken a list of busy blocks and worked around
 * them; it never cared where they came from. So the whole calendar integration
 * reduces, on this side, to one mapping — which means it can be tested without
 * a network, a tenant, or a token.
 *
 * Pure on purpose: everything here is absolute instants in, absolute instants
 * out. The wall-clock reasoning stays in the browser where it always was.
 */

/** One entry of Microsoft's `getSchedule` response, trimmed to what matters. */
export interface GraphScheduleItem {
  status?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
}

export interface GraphScheduleEntry {
  scheduleId?: string;
  scheduleItems?: GraphScheduleItem[];
  error?: { message?: string; responseCode?: string };
}

export interface BusyBlockIso {
  start: string;
  end: string;
}

/**
 * Statuses that actually block a lunch.
 *
 * `free` obviously doesn't. `tentative` does: a pencilled-in meeting is not a
 * slot to offer a partner, and being wrong in that direction costs nothing
 * while the other direction double-books him. `workingElsewhere` is left out —
 * he can take a lunch from anywhere.
 */
const BLOCKING = new Set(["busy", "tentative", "oof", "unknown"]);

/**
 * Microsoft returns naive local date-times with a separate zone. Graph is asked
 * for UTC (`Prefer: outlook.timezone="UTC"`), so a missing offset is appended
 * rather than guessed — guessing here would shift every block by hours.
 */
export function parseGraphInstant(
  dateTime: string | undefined,
  timeZone?: string,
  { utcOnly = false }: { utcOnly?: boolean } = {},
): Date | null {
  if (!dateTime) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(dateTime);
  const utcish = !hasZone && (!timeZone || timeZone.toUpperCase() === "UTC");

  // A naive time in a named zone has no offset to apply, so `new Date` reads it
  // as the server's clock -- which is UTC, and would move a noon lunch to 6pm.
  // For anything that gets written back to a meeting, refusing to answer is the
  // only safe reading.
  if (utcOnly && !hasZone && !utcish) return null;

  const parsed = new Date(hasZone ? dateTime : utcish ? `${dateTime}Z` : dateTime);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Busy blocks from a `getSchedule` response.
 *
 * An entry that errored yields nothing rather than an empty calendar, and the
 * caller is told separately — treating "Microsoft didn't answer" as "he's free
 * all week" is exactly the failure this integration exists to prevent.
 */
export function busyBlocksFromSchedule(entries: GraphScheduleEntry[]): BusyBlockIso[] {
  const blocks: BusyBlockIso[] = [];

  for (const entry of entries) {
    if (entry.error) continue;
    for (const item of entry.scheduleItems ?? []) {
      if (item.status && !BLOCKING.has(item.status.toLowerCase())) continue;
      const start = parseGraphInstant(item.start?.dateTime, item.start?.timeZone);
      const end = parseGraphInstant(item.end?.dateTime, item.end?.timeZone);
      if (!start || !end || end <= start) continue;
      blocks.push({ start: start.toISOString(), end: end.toISOString() });
    }
  }

  return blocks;
}

/** True when any entry came back as an error, so the UI can say so. */
export function scheduleHadErrors(entries: GraphScheduleEntry[]): boolean {
  return entries.some((e) => Boolean(e.error));
}

/**
 * Overlapping blocks merged, so the slot-finder walks a short list.
 *
 * A working calendar produces a lot of touching and overlapping entries —
 * a meeting, its reminder hold, a recurring block over the top.
 */
export function mergeBusyBlocks(blocks: BusyBlockIso[]): BusyBlockIso[] {
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
  const merged: BusyBlockIso[] = [];

  for (const block of sorted) {
    const last = merged[merged.length - 1];
    if (last && block.start <= last.end) {
      if (block.end > last.end) last.end = block.end;
      continue;
    }
    merged.push({ ...block });
  }

  return merged;
}
