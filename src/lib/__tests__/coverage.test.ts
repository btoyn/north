import { describe, expect, it } from "vitest";
import {
  coverageStatus,
  daysSince,
  isPersonalTouch,
  lenderCoverage,
  COVERAGE_ACTIVITY_TYPES,
  NON_COVERAGE_ACTIVITY_TYPES,
} from "../coverage";

const NOW = new Date("2026-08-04T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("coverageStatus (spec §9 rolling window)", () => {
  it("0–30 days is on track", () => {
    expect(coverageStatus(daysAgo(0), false, {}, NOW)).toBe("on_track");
    expect(coverageStatus(daysAgo(15), false, {}, NOW)).toBe("on_track");
    expect(coverageStatus(daysAgo(30), false, {}, NOW)).toBe("on_track");
  });

  it("31–40 days is grace period", () => {
    expect(coverageStatus(daysAgo(31), false, {}, NOW)).toBe("grace");
    expect(coverageStatus(daysAgo(40), false, {}, NOW)).toBe("grace");
  });

  it("41–60 days is overdue", () => {
    expect(coverageStatus(daysAgo(41), false, {}, NOW)).toBe("overdue");
    expect(coverageStatus(daysAgo(60), false, {}, NOW)).toBe("overdue");
  });

  it("61+ days is seriously overdue", () => {
    expect(coverageStatus(daysAgo(61), false, {}, NOW)).toBe("seriously_overdue");
    expect(coverageStatus(daysAgo(200), false, {}, NOW)).toBe("seriously_overdue");
  });

  it("no touch ever is never_contacted", () => {
    expect(coverageStatus(null, false, {}, NOW)).toBe("never_contacted");
  });

  it("a confirmed future meeting counts as covered immediately", () => {
    expect(coverageStatus(daysAgo(90), true, {}, NOW)).toBe("on_track");
    expect(coverageStatus(null, true, {}, NOW)).toBe("on_track");
  });

  it("canceling the meeting restores status from last completed touch", () => {
    // Same partner, meeting canceled -> flag false -> falls back to 45 days ago
    expect(coverageStatus(daysAgo(45), false, {}, NOW)).toBe("overdue");
  });

  it("honors custom goal and grace settings", () => {
    const opts = { goalDays: 20, graceDays: 5 };
    expect(coverageStatus(daysAgo(20), false, opts, NOW)).toBe("on_track");
    expect(coverageStatus(daysAgo(21), false, opts, NOW)).toBe("grace");
    expect(coverageStatus(daysAgo(25), false, opts, NOW)).toBe("grace");
    expect(coverageStatus(daysAgo(26), false, opts, NOW)).toBe("overdue");
  });

  it("accepts ISO strings", () => {
    expect(coverageStatus(daysAgo(10).toISOString(), false, {}, NOW)).toBe("on_track");
  });
});

describe("valid coverage classification (spec §9)", () => {
  it("counts personal interactions and campaigns as visible coverage", () => {
    for (const t of ["personal_email", "text", "call", "lunch", "golf", "campaign_email", "sba_question", "loan_update"]) {
      expect(COVERAGE_ACTIVITY_TYPES.has(t)).toBe(true);
    }
  });

  it("does not count drop-offs, notes, or completed tasks", () => {
    for (const t of ["drop_off", "note", "task_completed"]) {
      expect(NON_COVERAGE_ACTIVITY_TYPES.has(t)).toBe(true);
      expect(COVERAGE_ACTIVITY_TYPES.has(t)).toBe(false);
    }
  });

  it("campaign email is visible but not a personal touch", () => {
    expect(isPersonalTouch("campaign_email")).toBe(false);
    expect(isPersonalTouch("personal_email")).toBe(true);
    expect(isPersonalTouch("incoming_email")).toBe(true);
    expect(isPersonalTouch("deal_conversation")).toBe(true);
  });
});

describe("lenderCoverage (visible vs personally engaged)", () => {
  it("a partner can be campaign-covered but personally overdue", () => {
    const result = lenderCoverage(
      {
        lastVisibleTouchAt: daysAgo(12), // recent campaign
        lastPersonalTouchAt: daysAgo(55), // stale personal touch
        hasConfirmedFutureMeeting: false,
      },
      {},
      NOW,
    );
    expect(result.visible).toBe("on_track");
    expect(result.personal).toBe("overdue");
    expect(result.daysSinceVisible).toBe(12);
    expect(result.daysSincePersonal).toBe(55);
  });

  it("handles never-contacted partners", () => {
    const result = lenderCoverage(
      { lastVisibleTouchAt: null, lastPersonalTouchAt: null, hasConfirmedFutureMeeting: false },
      {},
      NOW,
    );
    expect(result.visible).toBe("never_contacted");
    expect(result.daysSinceVisible).toBeNull();
  });
});

describe("daysSince", () => {
  it("floors partial days", () => {
    const halfDay = new Date(NOW.getTime() - 36 * 3600_000);
    expect(daysSince(halfDay, NOW)).toBe(1);
  });
});
