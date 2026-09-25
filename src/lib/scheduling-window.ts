import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEETING_TYPE_DURATIONS } from "./labels";
import { getFreeBusy } from "./microsoft/graph";
import { getConnection } from "./microsoft/tokens";
import { isUsingDefaultAvailability, withDefaultAvailability, type AvailabilityRule } from "./scheduling";

/**
 * The shape of the next couple of weeks: the rules, and what's already spoken
 * for.
 *
 * Shared by the single-partner and group proposal flows so "busy" means one
 * thing. Dates offered to someone else count as busy — offering the same
 * Thursday twice is the one collision this is meant to prevent, and a group
 * ask makes it likelier, not less.
 */

const MINUTE = 60_000;

/**
 * Where the busy list came from, so a screen can say how much to trust it.
 *
 * `crm` is the old behaviour and still the fallback: it only knows the
 * meetings this app recorded, which is most of a working week short.
 */
export type CalendarSource = "crm" | "outlook" | "outlook_unavailable";

export interface SchedulingWindow {
  rules: AvailabilityRule[];
  /** True when `rules` are the shipped defaults, so a screen can say so. */
  usingDefaultAvailability: boolean;
  horizonDays: number;
  slotCount: number;
  /** Absolute instants, ready to cross to the browser. */
  busy: { start: string; end: string }[];
  calendar: CalendarSource;
}

export async function loadSchedulingWindow(
  supabase: SupabaseClient,
  now: Date,
): Promise<SchedulingWindow> {
  const [{ data: rules }, { data: prefs }, { data: meetings }, { data: pending }] =
    await Promise.all([
      supabase
        .from("availability_rules")
        .select("meeting_type, weekdays, start_minute, end_minute"),
      supabase
        .from("user_preferences")
        .select("propose_horizon_days, proposal_slot_count")
        .maybeSingle(),
      supabase
        .from("meetings")
        .select("start_at, end_at")
        .in("status", ["tentative", "confirmed"])
        .not("start_at", "is", null)
        .gte("start_at", now.toISOString())
        .is("deleted_at", null),
      supabase
        .from("meeting_proposals")
        .select("offered_slots, meeting_type")
        .eq("status", "sent")
        .is("deleted_at", null),
    ]);

  const busy: { start: string; end: string }[] = [];

  for (const m of meetings ?? []) {
    if (!m.start_at) continue;
    const start = new Date(m.start_at);
    const end = m.end_at ? new Date(m.end_at) : new Date(start.getTime() + 60 * MINUTE);
    busy.push({ start: start.toISOString(), end: end.toISOString() });
  }

  for (const p of pending ?? []) {
    const minutes = MEETING_TYPE_DURATIONS[p.meeting_type] ?? 60;
    for (const iso of p.offered_slots ?? []) {
      const start = new Date(iso);
      if (start < now) continue;
      busy.push({
        start: start.toISOString(),
        end: new Date(start.getTime() + minutes * MINUTE).toISOString(),
      });
    }
  }

  const horizonDays = prefs?.propose_horizon_days ?? 14;

  /* The real calendar, when it is connected.
   *
   * Merged in rather than replacing the CRM's own blocks: a date already
   * offered to another partner is not on anyone's Outlook calendar yet, and
   * offering the same Thursday twice is the collision this list exists to
   * prevent. If Graph can't answer, the source says so and the screen warns —
   * an empty answer must never read as a free week. */
  const calendar = await mergeOutlookBusy(busy, now, horizonDays);

  const stored: AvailabilityRule[] = (rules ?? []).map((r) => ({
    meetingType: r.meeting_type,
    weekdays: r.weekdays ?? [],
    startMinute: r.start_minute,
    endMinute: r.end_minute,
  }));

  return {
    // Defaults when nothing has ever been saved, so a fresh account can
    // propose a lunch without being sent to Settings first.
    rules: withDefaultAvailability(stored),
    usingDefaultAvailability: isUsingDefaultAvailability(stored),
    horizonDays,
    slotCount: prefs?.proposal_slot_count ?? 2,
    busy,
    calendar,
  };
}

/** Appends Outlook's busy blocks to `busy` in place, and says what happened. */
async function mergeOutlookBusy(
  busy: { start: string; end: string }[],
  now: Date,
  horizonDays: number,
): Promise<CalendarSource> {
  const connection = await getConnection();
  if (!connection || connection.invalidatedAt || !connection.accountEmail) return "crm";

  const result = await getFreeBusy({
    email: connection.accountEmail,
    start: now,
    end: new Date(now.getTime() + horizonDays * 24 * 60 * MINUTE),
  });

  if (!result.ok) return "outlook_unavailable";
  busy.push(...result.busy);
  return "outlook";
}
