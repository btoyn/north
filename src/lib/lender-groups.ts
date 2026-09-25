/**
 * Grouping for the Partners list: territory, then institution.
 *
 * A flat list of 141 names is unreadable, but grouping only helps if the groups
 * are worth collapsing. In this book 11 banks hold 112 of the 141 people, so the
 * headers carry real weight rather than fragmenting the list into pairs.
 *
 * Institution alone is the wrong key: six banks — Zions, Bank of Utah, Alta,
 * Hillcrest, CC Bank, UCCU — have people in both territories, and those are
 * visited on different trips. Territory is therefore the outer level and
 * institution the inner one, so "Zions, Southern Utah" never mixes with
 * "Zions, Wasatch Front".
 *
 * Pure and generic over the row type, so it can be tested without a database and
 * the UI can hand it whole partner objects.
 */

/** The only fields grouping cares about. */
export interface GroupFields {
  territory: string | null;
  institution: string | null;
  /** Not inside the coverage goal — drives the header's attention count. */
  needsAttention: boolean;
  /** Days since any visible touch; null when never contacted. */
  daysSinceTouch: number | null;
}

export interface InstitutionGroup<T> {
  /** Stable across renders, so an open group stays open. */
  key: string;
  institution: string;
  territory: string;
  members: T[];
  needingAttention: number;
  /** Freshest touch anywhere in the group, or null if nobody has been contacted. */
  lastTouchDays: number | null;
}

export interface TerritorySection<T> {
  territory: string;
  total: number;
  needingAttention: number;
  groups: InstitutionGroup<T>[];
}

export const NO_INSTITUTION = "No institution";
export const NO_TERRITORY = "No territory";

/**
 * Territories ordered by size, institutions worst-first inside them.
 *
 * Worst-first matches every other queue in the app: a bank with six people
 * slipping belongs above one that is fully covered, and the attention count in
 * the header is the thing worth scanning for.
 */
export function groupLenders<T>(
  lenders: T[],
  read: (lender: T) => GroupFields,
): TerritorySection<T>[] {
  const byKey = new Map<string, InstitutionGroup<T>>();

  for (const lender of lenders) {
    const f = read(lender);
    const territory = f.territory?.trim() || NO_TERRITORY;
    const institution = f.institution?.trim() || NO_INSTITUTION;
    const key = `${territory}::${institution}`;

    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        institution,
        territory,
        members: [],
        needingAttention: 0,
        lastTouchDays: null,
      };
      byKey.set(key, group);
    }

    group.members.push(lender);
    if (f.needsAttention) group.needingAttention += 1;
    if (f.daysSinceTouch !== null) {
      group.lastTouchDays =
        group.lastTouchDays === null
          ? f.daysSinceTouch
          : Math.min(group.lastTouchDays, f.daysSinceTouch);
    }
  }

  const sections = new Map<string, TerritorySection<T>>();
  for (const group of byKey.values()) {
    let section = sections.get(group.territory);
    if (!section) {
      section = { territory: group.territory, total: 0, needingAttention: 0, groups: [] };
      sections.set(group.territory, section);
    }
    section.groups.push(group);
    section.total += group.members.length;
    section.needingAttention += group.needingAttention;
  }

  for (const section of sections.values()) {
    section.groups.sort(
      (a, b) =>
        b.needingAttention - a.needingAttention ||
        b.members.length - a.members.length ||
        a.institution.localeCompare(b.institution),
    );
  }

  return [...sections.values()].sort(
    (a, b) =>
      // Unplaced partners last, however many there are — they are a data gap,
      // not a territory.
      Number(a.territory === NO_TERRITORY) - Number(b.territory === NO_TERRITORY) ||
      b.total - a.total ||
      a.territory.localeCompare(b.territory),
  );
}

/** "last touch 9d ago" / "today" / "never contacted" for a group header. */
export function describeLastTouch(days: number | null): string {
  if (days === null) return "never contacted";
  if (days === 0) return "touched today";
  if (days === 1) return "touched yesterday";
  return `last touch ${days}d ago`;
}
