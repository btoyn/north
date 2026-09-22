import { describe, expect, it } from "vitest";
import {
  SPHERES,
  findSphere,
  isCovered,
  lendersInSphere,
  sphereCounts,
  visibleSpheres,
  type SphereRow,
} from "../spheres";
import type { CoverageStatus } from "../coverage";
import type { Tier } from "../tiers";

function row(
  fullName: string,
  overrides: Partial<SphereRow> & { personal?: CoverageStatus; tier?: Tier } = {},
): SphereRow {
  const { personal = "on_track", tier = "B", ...rest } = overrides;
  return {
    id: fullName.toLowerCase().replace(/\s+/g, "-"),
    fullName,
    title: "Commercial lender",
    isSample: false,
    active: true,
    tier,
    territory: "Wasatch Front",
    institution: "Zions Bank",
    coverage: {
      personal,
      visible: personal,
      daysSincePersonal: 5,
      daysSinceVisible: 5,
      hasConfirmedFutureMeeting: false,
    },
    hasActiveLoan: false,
    hasOverduePromise: false,
    dealOnly: false,
    ...rest,
  };
}

describe("tier spheres", () => {
  it("sorts everyone into exactly one tier", () => {
    const rows = [
      row("Ann A", { tier: "A" }),
      row("Bob B", { tier: "B" }),
      row("Cal C", { tier: "C" }),
      row("Nora None", { tier: "unassigned" }),
    ];

    for (const key of ["tier-a", "tier-b", "tier-c", "tier-none"]) {
      expect(lendersInSphere(rows, findSphere(key)!)).toHaveLength(1);
    }
  });

  it("puts the worst coverage at the top of a tier", () => {
    const rows = [
      row("Fine Fran", { tier: "A", personal: "on_track" }),
      row("Gone Greg", { tier: "A", personal: "seriously_overdue" }),
      row("Slipping Sam", { tier: "A", personal: "grace" }),
    ];
    expect(lendersInSphere(rows, findSphere("tier-a")!).map((r) => r.fullName)).toEqual([
      "Gone Greg",
      "Slipping Sam",
      "Fine Fran",
    ]);
  });
});

describe("saved views", () => {
  it("needs-contact is everyone outside their window, worst first", () => {
    const rows = [
      row("Fine Fran", { personal: "on_track" }),
      row("Gone Greg", { personal: "seriously_overdue" }),
      row("New Ned", { personal: "never_contacted" }),
      row("Left Lou", { personal: "overdue", active: false }),
    ];
    const list = lendersInSphere(rows, findSphere("needs-contact")!);
    // An inactive lender is not a job to do.
    expect(list.map((r) => r.fullName)).toEqual(["Gone Greg", "New Ned"]);
  });

  it("campaign-only is reached but not personally", () => {
    const campaignOnly = row("Mass Mary", { personal: "overdue" });
    campaignOnly.coverage.visible = "on_track";
    const list = lendersInSphere([campaignOnly, row("Fine Fran")], findSphere("campaign-only")!);
    expect(list.map((r) => r.fullName)).toEqual(["Mass Mary"]);
  });

  it("recently-contacted is the last seven days, freshest first", () => {
    const fresh = row("Fresh Fred");
    fresh.coverage.daysSinceVisible = 1;
    const week = row("Week Wendy");
    week.coverage.daysSinceVisible = 7;
    const stale = row("Stale Stan");
    stale.coverage.daysSinceVisible = 8;
    const never = row("Never Nell");
    never.coverage.daysSinceVisible = null;

    const list = lendersInSphere([week, stale, fresh, never], findSphere("recently-contacted")!);
    expect(list.map((r) => r.fullName)).toEqual(["Fresh Fred", "Week Wendy"]);
  });

  it("territory spheres split the banks that straddle two", () => {
    const rows = [
      row("North Nick", { territory: "Wasatch Front" }),
      row("South Sal", { territory: "Southern Utah" }),
    ];
    expect(
      lendersInSphere(rows, findSphere("territory-southern-utah")!).map((r) => r.fullName),
    ).toEqual(["South Sal"]);
    expect(
      lendersInSphere(rows, findSphere("territory-wasatch-front")!).map((r) => r.fullName),
    ).toEqual(["North Nick"]);
  });

  it("active-loans and overdue-promises read their own flags", () => {
    const rows = [
      row("Loan Lisa", { hasActiveLoan: true }),
      row("Promise Pete", { hasOverduePromise: true }),
      row("Plain Paul"),
    ];
    expect(lendersInSphere(rows, findSphere("active-loans")!).map((r) => r.fullName)).toEqual([
      "Loan Lisa",
    ]);
    expect(
      lendersInSphere(rows, findSphere("overdue-promises")!).map((r) => r.fullName),
    ).toEqual(["Promise Pete"]);
  });

  it("everyone means everyone, active or not", () => {
    const rows = [row("Here Hank"), row("Gone Gail", { active: false })];
    expect(lendersInSphere(rows, findSphere("everyone")!)).toHaveLength(2);
  });
});

describe("isCovered", () => {
  it("counts a confirmed meeting ahead as covered", () => {
    const booked = row("Booked Bea", { personal: "seriously_overdue" });
    booked.coverage.hasConfirmedFutureMeeting = true;
    expect(isCovered(booked)).toBe(true);
  });

  it("does not count grace as covered", () => {
    expect(isCovered(row("Grace Gary", { personal: "grace" }))).toBe(false);
  });
});

describe("sphereCounts", () => {
  it("counts every sphere and its coverage from the same rows", () => {
    const rows = [
      row("Ann A", { tier: "A", personal: "on_track" }),
      row("Abe A", { tier: "A", personal: "overdue" }),
      row("Bob B", { tier: "B", personal: "on_track" }),
    ];
    const counts = sphereCounts(rows);

    expect(counts.get("tier-a")).toMatchObject({ total: 2, covered: 1, pct: 50 });
    expect(counts.get("tier-b")).toMatchObject({ total: 1, covered: 1, pct: 100 });
    expect(counts.get("everyone")).toMatchObject({ total: 3, covered: 2 });
    expect(counts.get("tier-c")).toMatchObject({ total: 0, pct: 0 });
  });

  it("never disagrees with the list the sphere would show", () => {
    const rows = [
      row("Ann A", { tier: "A", personal: "overdue" }),
      row("Bob B", { tier: "B", personal: "on_track" }),
      row("Cal C", { tier: "C", hasActiveLoan: true }),
    ];
    const counts = sphereCounts(rows);
    for (const sphere of SPHERES) {
      expect(counts.get(sphere.key)!.total).toBe(lendersInSphere(rows, sphere).length);
    }
  });
});

describe("visibleSpheres", () => {
  it("always shows the tiers, and hides empty saved views", () => {
    const counts = sphereCounts([row("Bob B", { tier: "B" })]);
    const keys = visibleSpheres(counts).map((s) => s.key);

    expect(keys).toContain("tier-a");
    expect(keys).toContain("tier-none");
    expect(keys).toContain("everyone");
    // Nobody has a loan or lives in the south, so those views stay out of the way.
    expect(keys).not.toContain("active-loans");
    expect(keys).not.toContain("territory-southern-utah");
  });
});
