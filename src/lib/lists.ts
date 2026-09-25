/**
 * Lists someone makes up themselves.
 *
 * Bank, territory and tier are facts about a partner, and the app already
 * groups on all three. A list is the grouping that exists only in his head:
 * "guys I golf with", "construction partners", "invite to the Masters party".
 *
 * One model serves both halves of what was asked for. From the list you see
 * who is on it; from a partner you tick the lists they belong to, which is a
 * tag in everything but name. The rows are the same either way.
 *
 * Pure, so the count on the index and the rows on the detail come from one
 * definition and a list can never say six and then show five.
 */

import type { SphereDef, SphereRow } from "./spheres";

export interface LenderList {
  id: string;
  name: string;
  /** Partner ids on the list. Order is not meaningful. */
  memberIds: string[];
}

/** How a list's key is written, so it cannot collide with a built-in sphere. */
const KEY_PREFIX = "list:";

export function listKey(listId: string): string {
  return `${KEY_PREFIX}${listId}`;
}

/** The list id inside a sphere key, or null if this key is not a list. */
export function listIdFromKey(key: string): string | null {
  return key.startsWith(KEY_PREFIX) ? key.slice(KEY_PREFIX.length) || null : null;
}

export const MAX_LIST_NAME = 60;

/**
 * A name as it will be stored: trimmed, with runs of whitespace collapsed.
 *
 * Collapsing matters because "Golf  crew" and "Golf crew" are the same group
 * to a person and two rows to a database, and the duplicate only becomes
 * visible once both have members.
 */
export function normalizeListName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Why this name can't be used, or null if it can.
 *
 * Case-insensitive against the existing names, matching the unique index, so
 * the refusal happens here with a sentence rather than at the database with a
 * constraint violation.
 */
export function listNameProblem(
  raw: string,
  existing: readonly { id: string; name: string }[],
  ignoreId?: string,
): string | null {
  const name = normalizeListName(raw);
  if (name === "") return "Give the list a name.";
  if (name.length > MAX_LIST_NAME) {
    return `Keep it under ${MAX_LIST_NAME} characters — that one is ${name.length}.`;
  }
  const clash = existing.find(
    (l) => l.id !== ignoreId && normalizeListName(l.name).toLowerCase() === name.toLowerCase(),
  );
  return clash ? `You already have a list called "${clash.name}".` : null;
}

/** Alphabetical, ignoring case, so the sidebar order is predictable. */
export function sortLists<T extends { name: string }>(lists: readonly T[]): T[] {
  return [...lists].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** "6 partners", or the empty-list nudge. */
export function describeList(list: LenderList): string {
  if (list.memberIds.length === 0) return "Nobody on it yet";
  return `${list.memberIds.length} partner${list.memberIds.length === 1 ? "" : "s"}`;
}

/**
 * A list as a sphere, so every screen that already renders spheres renders
 * lists too without knowing they exist.
 *
 * Membership is resolved through a Set rather than `includes`, because the
 * predicate runs once per partner per list and the book is 137 people.
 */
export function listSphere(list: LenderList): SphereDef {
  const members = new Set(list.memberIds);
  return {
    key: listKey(list.id),
    label: list.name,
    description: describeList(list),
    group: "Lists",
    layout: "flat",
    match: (row: SphereRow) => members.has(row.id),
  };
}

export function listSpheres(lists: readonly LenderList[]): SphereDef[] {
  return sortLists(lists).map(listSphere);
}

/** The lists a given partner is on, for the panel on their page. */
export function listsContaining(
  lists: readonly LenderList[],
  lenderId: string,
): LenderList[] {
  return sortLists(lists.filter((l) => l.memberIds.includes(lenderId)));
}
