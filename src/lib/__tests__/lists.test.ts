import { describe, expect, it } from "vitest";
import {
  describeList,
  listIdFromKey,
  listKey,
  listNameProblem,
  listSphere,
  listSpheres,
  listsContaining,
  normalizeListName,
  sortLists,
  type LenderList,
} from "../lists";
import type { SphereRow } from "../spheres";

const list = (id: string, name: string, memberIds: string[] = []): LenderList => ({
  id,
  name,
  memberIds,
});

const row = (id: string): SphereRow =>
  ({
    id,
    fullName: `Lender ${id}`,
    title: null,
    isSample: false,
    active: true,
    tier: "B",
    territory: null,
    institution: null,
    coverage: {
      personal: "on_track",
      visible: "on_track",
      daysSincePersonal: 1,
      daysSinceVisible: 1,
      hasConfirmedFutureMeeting: false,
    },
    hasActiveLoan: false,
    hasOverduePromise: false,
  }) satisfies SphereRow;

describe("list keys", () => {
  it("round-trips an id", () => {
    expect(listIdFromKey(listKey("abc-123"))).toBe("abc-123");
  });

  it("does not claim a built-in sphere", () => {
    // If this ever returned an id, opening "tier-a" would look for a list.
    expect(listIdFromKey("tier-a")).toBeNull();
    expect(listIdFromKey("everyone")).toBeNull();
    expect(listIdFromKey("")).toBeNull();
  });

  it("refuses a prefix with nothing after it", () => {
    expect(listIdFromKey("list:")).toBeNull();
  });
});

describe("normalizeListName", () => {
  it("trims and collapses whitespace", () => {
    // "Golf  crew" and "Golf crew" are one group to a person and two rows to a
    // database, and the duplicate only shows up once both have members.
    expect(normalizeListName("  Golf   crew  ")).toBe("Golf crew");
    expect(normalizeListName("Construction\tlenders")).toBe("Construction lenders");
  });
});

describe("listNameProblem", () => {
  const existing = [list("1", "Golf crew"), list("2", "Construction")];

  it("accepts a new name", () => {
    expect(listNameProblem("Masters party", existing)).toBeNull();
  });

  it("refuses an empty name", () => {
    expect(listNameProblem("   ", existing)).toBe("Give the list a name.");
  });

  it("refuses a duplicate whatever the casing or spacing", () => {
    // The database has a case-insensitive unique index; this is the same rule
    // said in a sentence rather than as a constraint violation.
    expect(listNameProblem("golf crew", existing)).toContain("already have a list");
    expect(listNameProblem("  GOLF   CREW ", existing)).toContain("already have a list");
  });

  it("lets a list keep its own name when renaming", () => {
    expect(listNameProblem("Golf crew", existing, "1")).toBeNull();
    expect(listNameProblem("Golf crew", existing, "2")).toContain("already have a list");
  });

  it("refuses something too long, and says how long it was", () => {
    const problem = listNameProblem("x".repeat(61), existing);
    expect(problem).toContain("61");
  });
});

describe("sortLists", () => {
  it("is alphabetical regardless of case", () => {
    const sorted = sortLists([list("1", "zebra"), list("2", "Alpha"), list("3", "beta")]);
    expect(sorted.map((l) => l.name)).toEqual(["Alpha", "beta", "zebra"]);
  });

  it("does not mutate its input", () => {
    const input = [list("1", "b"), list("2", "a")];
    sortLists(input);
    expect(input.map((l) => l.name)).toEqual(["b", "a"]);
  });
});

describe("describeList", () => {
  it("counts, and singularises", () => {
    expect(describeList(list("1", "x", ["a"]))).toBe("1 lender");
    expect(describeList(list("1", "x", ["a", "b"]))).toBe("2 lenders");
  });

  it("says something useful about an empty one", () => {
    expect(describeList(list("1", "x"))).toBe("Nobody on it yet");
  });
});

describe("listSphere", () => {
  it("matches exactly its members", () => {
    const sphere = listSphere(list("L", "Golf crew", ["a", "c"]));
    expect(sphere.match(row("a"))).toBe(true);
    expect(sphere.match(row("b"))).toBe(false);
    expect(sphere.match(row("c"))).toBe(true);
  });

  it("carries the list's name and a key that cannot collide", () => {
    const sphere = listSphere(list("L", "Golf crew", []));
    expect(sphere.label).toBe("Golf crew");
    expect(sphere.group).toBe("Lists");
    expect(listIdFromKey(sphere.key)).toBe("L");
  });

  it("matches nothing when the list is empty", () => {
    const sphere = listSphere(list("L", "Empty", []));
    expect(sphere.match(row("a"))).toBe(false);
  });
});

describe("listSpheres", () => {
  it("returns them in alphabetical order", () => {
    const spheres = listSpheres([list("1", "zebra"), list("2", "Alpha")]);
    expect(spheres.map((s) => s.label)).toEqual(["Alpha", "zebra"]);
  });
});

describe("listsContaining", () => {
  it("finds the lists a lender is on, sorted", () => {
    const lists = [
      list("1", "Zebra", ["x"]),
      list("2", "Alpha", ["x", "y"]),
      list("3", "Other", ["y"]),
    ];
    expect(listsContaining(lists, "x").map((l) => l.name)).toEqual(["Alpha", "Zebra"]);
    expect(listsContaining(lists, "z")).toEqual([]);
  });
});
