/**
 * Spheres — the saved views that replaced Partners, Institutions and Needs
 * Attention.
 *
 * A sphere is a named slice of the partner table: three tiers first, then the
 * filters that used to sit as a row of chips above the partner list. Same
 * queries, given names and a front door, so "who in Southern Utah is slipping"
 * is a place you can go rather than two clicks you have to remember.
 *
 * Every definition here is a pure predicate over a row. The index counts them
 * and the detail screen lists them from the same function, so a sphere can
 * never say 14 and then show 12.
 */

import type { CoverageStatus } from "./coverage";
import { TIER_LABEL, TIER_MEANING, TIERS, type Tier } from "./tiers";
import { TERRITORIES } from "./labels";

/** Everything any sphere needs to decide whether a partner is in it. */
export interface SphereRow {
  id: string;
  fullName: string;
  title: string | null;
  isSample: boolean;
  active: boolean;
  tier: Tier;
  territory: string | null;
  institution: string | null;
  coverage: {
    personal: CoverageStatus;
    visible: CoverageStatus;
    daysSincePersonal: number | null;
    daysSinceVisible: number | null;
    hasConfirmedFutureMeeting: boolean;
  };
  hasActiveLoan: boolean;
  hasOverduePromise: boolean;
  /** Inside their window, but only because of the weekly loan update. */
  dealOnly: boolean;
}

export type SphereGroup =
  | "Tiers"
  | "Attention"
  | "Momentum"
  | "Territory"
  | "Lists"
  | "Everyone";

export interface SphereDef {
  key: string;
  label: string;
  /** One line under the name, saying what the view is for. */
  description: string;
  group: SphereGroup;
  /** Which tier this sphere is, when it is one. */
  tier?: Tier;
  /** Institution headers help on a long list and get in the way on a short one. */
  layout: "grouped" | "flat";
  match: (row: SphereRow) => boolean;
  /** Worst-first, freshest-first — whatever the view is actually for. */
  sort?: (a: SphereRow, b: SphereRow) => number;
}

const BEHIND: CoverageStatus[] = ["grace", "overdue", "seriously_overdue", "never_contacted"];

/** Worst coverage first, longest silence breaking the tie. */
const worstFirst = (a: SphereRow, b: SphereRow) => {
  const rank: Record<CoverageStatus, number> = {
    seriously_overdue: 0,
    overdue: 1,
    never_contacted: 2,
    grace: 3,
    on_track: 4,
  };
  return (
    rank[a.coverage.personal] - rank[b.coverage.personal] ||
    (b.coverage.daysSincePersonal ?? 9999) - (a.coverage.daysSincePersonal ?? 9999)
  );
};

const TIER_SPHERES: SphereDef[] = TIERS.map((tier) => ({
  key: tier === "unassigned" ? "tier-none" : `tier-${tier.toLowerCase()}`,
  label: TIER_LABEL[tier],
  description: TIER_MEANING[tier],
  group: "Tiers" as const,
  tier,
  layout: "flat" as const,
  match: (row: SphereRow) => row.tier === tier,
  sort: worstFirst,
}));

const TERRITORY_SPHERES: SphereDef[] = TERRITORIES.map((territory) => ({
  key: `territory-${territory.toLowerCase().replace(/\s+/g, "-")}`,
  label: territory,
  description:
    territory === "Wasatch Front"
      ? "Salt Lake and the valley — one trip"
      : territory === "Southern Utah"
        ? "St. George and the corridor — a different trip"
        : `Lenders in ${territory}`,
  group: "Territory" as const,
  layout: "grouped" as const,
  match: (row: SphereRow) => row.territory === territory,
  sort: worstFirst,
}));

export const SPHERES: SphereDef[] = [
  ...TIER_SPHERES,

  {
    key: "needs-contact",
    label: "Needs contact",
    description: "Past the window for their tier, worst first",
    group: "Attention",
    layout: "flat",
    match: (row) => row.active && BEHIND.includes(row.coverage.personal),
    sort: worstFirst,
  },
  {
    key: "no-personal-touch",
    label: "No personal touch",
    description: "Never spoken to one to one",
    group: "Attention",
    layout: "flat",
    match: (row) => row.coverage.daysSincePersonal === null,
    sort: worstFirst,
  },
  {
    key: "campaign-only",
    label: "Campaign-only",
    description: "Reached by campaign email and nothing else",
    group: "Attention",
    layout: "flat",
    match: (row) =>
      row.coverage.visible === "on_track" &&
      !["on_track", "grace"].includes(row.coverage.personal),
    sort: worstFirst,
  },
  {
    key: "deal-email-only",
    label: "Deal email only",
    description: "Covered by the weekly loan update and nothing else",
    group: "Attention",
    layout: "flat",
    match: (row) => row.dealOnly,
    sort: worstFirst,
  },
  {
    key: "overdue-promises",
    label: "Overdue promises",
    description: "You owe them something and the date has passed",
    group: "Attention",
    layout: "flat",
    match: (row) => row.hasOverduePromise,
    sort: worstFirst,
  },

  {
    key: "active-loans",
    label: "Active-loan contacts",
    description: "Partners with a loan in process right now",
    group: "Momentum",
    layout: "flat",
    match: (row) => row.hasActiveLoan,
    sort: worstFirst,
  },
  {
    key: "recently-contacted",
    label: "Recently contacted",
    description: "Touched in the last seven days",
    group: "Momentum",
    layout: "flat",
    match: (row) => (row.coverage.daysSinceVisible ?? Infinity) <= 7,
    sort: (a, b) => (a.coverage.daysSinceVisible ?? 0) - (b.coverage.daysSinceVisible ?? 0),
  },
  {
    key: "on-track",
    label: "On track",
    description: "Inside the window, nothing booked",
    group: "Momentum",
    layout: "flat",
    match: (row) =>
      row.coverage.personal === "on_track" && !row.coverage.hasConfirmedFutureMeeting,
  },
  {
    key: "upcoming-meetings",
    label: "Upcoming meetings",
    description: "Something confirmed on the calendar",
    group: "Momentum",
    layout: "flat",
    match: (row) => row.coverage.hasConfirmedFutureMeeting,
  },

  ...TERRITORY_SPHERES,

  {
    key: "by-institution",
    label: "By institution",
    description: "Everyone, grouped by territory and bank",
    group: "Everyone",
    layout: "grouped",
    match: () => true,
  },
  {
    key: "everyone",
    label: "Everyone",
    description: "The whole book, one flat list",
    group: "Everyone",
    layout: "flat",
    match: () => true,
  },
];

export const SPHERE_GROUP_ORDER: SphereGroup[] = [
  "Tiers",
  "Attention",
  "Momentum",
  "Territory",
  // Above "Everyone" because a list is someone's own grouping and worth more
  // to them than the catch-all underneath it.
  "Lists",
  "Everyone",
];

/**
 * A sphere by key, built-in or otherwise.
 *
 * `extra` carries the ones that cannot be known at module scope because they
 * are rows in a database — a person's own lists. Every function here takes
 * them the same way, so a list behaves like any other sphere everywhere
 * downstream and no screen has to learn a second concept.
 */
export function findSphere(key: string, extra: readonly SphereDef[] = []): SphereDef | null {
  return SPHERES.find((s) => s.key === key) ?? extra.find((s) => s.key === key) ?? null;
}

/** The partners in one sphere, in the order that sphere wants them. */
export function lendersInSphere(rows: SphereRow[], sphere: SphereDef): SphereRow[] {
  const matched = rows.filter(sphere.match);
  return sphere.sort ? [...matched].sort(sphere.sort) : matched;
}

export interface SphereCount {
  key: string;
  total: number;
  /** Inside the window for their own tier — what the coverage bar fills to. */
  covered: number;
  pct: number;
}

/**
 * How many are in each sphere and how many of those are covered.
 *
 * One pass per sphere over the same rows the detail screen will filter, so the
 * number on the card is the number of rows behind it.
 */
export function sphereCounts(
  rows: SphereRow[],
  extra: readonly SphereDef[] = [],
): Map<string, SphereCount> {
  const counts = new Map<string, SphereCount>();

  for (const sphere of [...SPHERES, ...extra]) {
    const matched = rows.filter(sphere.match);
    const covered = matched.filter((r) => isCovered(r)).length;
    counts.set(sphere.key, {
      key: sphere.key,
      total: matched.length,
      covered,
      pct: matched.length === 0 ? 0 : Math.round((covered / matched.length) * 100),
    });
  }

  return counts;
}

/**
 * Covered means a one-to-one touch inside the tier's window, or a confirmed
 * meeting ahead — the same bar the dashboard ring uses, so the two never
 * disagree.
 */
export function isCovered(row: SphereRow): boolean {
  return row.coverage.hasConfirmedFutureMeeting || row.coverage.personal === "on_track";
}

/**
 * Spheres worth showing: every tier, plus any view with someone in it.
 *
 * A list survives being empty, unlike the other filtered views. Someone made
 * it deliberately, and a list that vanishes the moment its last member comes
 * off looks like the app lost it.
 */
export function visibleSpheres(
  counts: Map<string, SphereCount>,
  extra: readonly SphereDef[] = [],
): SphereDef[] {
  return [...SPHERES, ...extra].filter(
    (s) =>
      s.group === "Tiers" ||
      s.group === "Everyone" ||
      s.group === "Lists" ||
      (counts.get(s.key)?.total ?? 0) > 0,
  );
}
