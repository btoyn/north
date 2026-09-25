import { describe, expect, it } from "vitest";
import { coverageStatus } from "../coverage";
import {
  TIER_GOAL_DAYS,
  countsAsTouch,
  isDealOnly,
  qualifyingTouchAt,
  readTier,
  summarizeTiers,
  tierGoalDays,
} from "../tiers";

const NOW = new Date("2026-09-17T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("tierGoalDays", () => {
  it("gives each tier its own window", () => {
    // A and B share a month deliberately: two weeks was rejected as more than
    // anyone can sustain across thirty-odd people.
    expect(tierGoalDays("A", 30)).toBe(30);
    expect(tierGoalDays("B", 30)).toBe(30);
    expect(tierGoalDays("C", 30)).toBe(90);
    expect(tierGoalDays("D", 30)).toBe(180);
  });

  it("falls back to the workspace goal for an untiered partner", () => {
    // Not quarterly: nobody decided they were a C, and filing them there
    // would hide the decision for three months.
    expect(tierGoalDays("unassigned", 30)).toBe(30);
    expect(tierGoalDays(null, 45)).toBe(45);
    expect(tierGoalDays("nonsense", 21)).toBe(21);
  });
});

describe("readTier", () => {
  it("reads the four real tiers", () => {
    expect(readTier("A")).toBe("A");
    expect(readTier("D")).toBe("D");
  });

  it("treats anything unrecognised as untiered", () => {
    expect(readTier(null)).toBe("unassigned");
    expect(readTier("E")).toBe("unassigned");
    expect(readTier("")).toBe("unassigned");
  });
});

describe("countsAsTouch", () => {
  it("needs a real exchange for A and B", () => {
    // The failure this prevents: a stack of unanswered emails showing as a
    // fully covered A list.
    expect(countsAsTouch("personal_email", "A")).toBe(false);
    expect(countsAsTouch("personal_email", "B")).toBe(false);
    expect(countsAsTouch("incoming_email", "A")).toBe(true);
    expect(countsAsTouch("call", "A")).toBe(true);
    expect(countsAsTouch("lunch", "B")).toBe(true);
    expect(countsAsTouch("text", "A")).toBe(true);
  });

  it("lets any contact count for C and D", () => {
    // At C and D the point is that they heard from him, not that they replied.
    expect(countsAsTouch("personal_email", "C")).toBe(true);
    expect(countsAsTouch("personal_email", "D")).toBe(true);
    expect(countsAsTouch("loan_update", "C")).toBe(true);
  });

  it("never counts a campaign blast, at any tier", () => {
    for (const tier of ["A", "B", "C", "D", "unassigned", null]) {
      expect(countsAsTouch("campaign_email", tier)).toBe(false);
    }
  });

  it("treats an untiered partner like C rather than like A", () => {
    // Untiered means undecided. Holding them to the strictest bar would
    // invent a decision nobody made.
    expect(countsAsTouch("personal_email", "unassigned")).toBe(true);
    expect(countsAsTouch("personal_email", null)).toBe(true);
  });
});

describe("tier cadence through the coverage window", () => {
  it("holds an A partner to a month", () => {
    const opts = { goalDays: TIER_GOAL_DAYS.A!, graceDays: 10 };
    expect(coverageStatus(daysAgo(30), false, opts, NOW)).toBe("on_track");
    expect(coverageStatus(daysAgo(35), false, opts, NOW)).toBe("grace");
    expect(coverageStatus(daysAgo(50), false, opts, NOW)).toBe("overdue");
    expect(coverageStatus(daysAgo(61), false, opts, NOW)).toBe("seriously_overdue");
  });

  it("lets a C partner go a quarter", () => {
    const opts = { goalDays: TIER_GOAL_DAYS.C!, graceDays: 10 };
    expect(coverageStatus(daysAgo(89), false, opts, NOW)).toBe("on_track");
    expect(coverageStatus(daysAgo(95), false, opts, NOW)).toBe("grace");
    // Every boundary scales with the goal — a C partner is not "seriously
    // overdue" at 61 days the way the old fixed cut-off would have said.
    expect(coverageStatus(daysAgo(120), false, opts, NOW)).toBe("overdue");
    expect(coverageStatus(daysAgo(200), false, opts, NOW)).toBe("seriously_overdue");
  });

  it("lets a D partner go half a year", () => {
    const opts = { goalDays: TIER_GOAL_DAYS.D!, graceDays: 10 };
    expect(coverageStatus(daysAgo(179), false, opts, NOW)).toBe("on_track");
    expect(coverageStatus(daysAgo(185), false, opts, NOW)).toBe("grace");
    expect(coverageStatus(daysAgo(300), false, opts, NOW)).toBe("overdue");
  });

  it("leaves the default 30-day window exactly where it was", () => {
    expect(coverageStatus(daysAgo(30), false, {}, NOW)).toBe("on_track");
    expect(coverageStatus(daysAgo(40), false, {}, NOW)).toBe("grace");
    expect(coverageStatus(daysAgo(60), false, {}, NOW)).toBe("overdue");
    expect(coverageStatus(daysAgo(61), false, {}, NOW)).toBe("seriously_overdue");
  });
});

describe("summarizeTiers", () => {
  it("counts and measures each tier against itself", () => {
    const summary = summarizeTiers([
      { tier: "A", covered: true },
      { tier: "A", covered: false },
      { tier: "A", covered: true },
      { tier: "B", covered: false },
      { tier: "C", covered: true },
      { tier: "D", covered: true },
      { tier: null, covered: false },
    ]);

    const byTier = Object.fromEntries(summary.map((s) => [s.tier, s]));
    expect(byTier.A).toMatchObject({ total: 3, covered: 2, pct: 67 });
    expect(byTier.B).toMatchObject({ total: 1, covered: 0, pct: 0 });
    expect(byTier.C).toMatchObject({ total: 1, covered: 1, pct: 100 });
    expect(byTier.D).toMatchObject({ total: 1, covered: 1, pct: 100 });
    expect(byTier.unassigned).toMatchObject({ total: 1, covered: 0 });
  });

  it("always returns all five rows, in order, even when empty", () => {
    const summary = summarizeTiers([]);
    expect(summary.map((s) => s.tier)).toEqual(["A", "B", "C", "D", "unassigned"]);
    expect(summary.every((s) => s.total === 0 && s.pct === 0)).toBe(true);
  });
});

describe("the weekly loan update", () => {
  const iso = (n: number) => daysAgo(n).toISOString();

  it("restarts the clock for every tier, not just C and D", () => {
    for (const tier of ["A", "B", "C", "D"]) {
      expect(countsAsTouch("loan_update", tier)).toBe(true);
    }
  });

  it("still leaves a plain sent email not counting for A and B", () => {
    expect(countsAsTouch("personal_email", "A")).toBe(false);
    expect(countsAsTouch("personal_email", "C")).toBe(true);
  });

  it("never rescues a campaign blast", () => {
    for (const tier of ["A", "B", "C", "D"]) {
      expect(countsAsTouch("campaign_email", tier)).toBe(false);
    }
  });

  it("is what A and B are judged on when it is the most recent thing", () => {
    expect(
      qualifyingTouchAt("A", {
        personal: iso(2),
        conversation: iso(60),
        dealUpdate: iso(3),
      }),
    ).toBe(iso(3));
  });

  it("does not pull the clock backwards when a real conversation is newer", () => {
    expect(
      qualifyingTouchAt("A", {
        personal: iso(1),
        conversation: iso(4),
        dealUpdate: iso(20),
      }),
    ).toBe(iso(4));
  });

  it("leaves C and D on the any-contact clock", () => {
    expect(
      qualifyingTouchAt("C", { personal: iso(5), conversation: iso(90), dealUpdate: iso(40) }),
    ).toBe(iso(5));
  });
});

describe("isDealOnly", () => {
  const iso = (n: number) => daysAgo(n).toISOString();

  it("flags an A partner carried entirely by the Friday email", () => {
    expect(
      isDealOnly("A", { personal: iso(3), conversation: iso(200), dealUpdate: iso(3) }, 30, NOW),
    ).toBe(true);
  });

  it("clears once they actually talk", () => {
    expect(
      isDealOnly("A", { personal: iso(3), conversation: iso(10), dealUpdate: iso(3) }, 30, NOW),
    ).toBe(false);
  });

  it("says nothing about a partner with no loan running", () => {
    expect(
      isDealOnly("A", { personal: iso(3), conversation: iso(3), dealUpdate: null }, 30, NOW),
    ).toBe(false);
  });

  it("stays quiet for someone already overdue, who is on the list anyway", () => {
    expect(
      isDealOnly("A", { personal: iso(80), conversation: iso(200), dealUpdate: iso(80) }, 30, NOW),
    ).toBe(false);
  });

  it("counts any contact for C, so a call clears it even though C never needed one", () => {
    expect(
      isDealOnly("C", { personal: iso(2), conversation: iso(2), dealUpdate: iso(10) }, 90, NOW),
    ).toBe(false);
  });

  it("flags a C partner whose only contact all quarter was the loan email", () => {
    expect(
      isDealOnly("C", { personal: iso(10), conversation: null, dealUpdate: iso(10) }, 90, NOW),
    ).toBe(true);
  });
});
