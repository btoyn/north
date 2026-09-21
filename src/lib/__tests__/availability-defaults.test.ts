import { describe, expect, it } from "vitest";
import {
  DEFAULT_AVAILABILITY,
  findOpenSlots,
  isUsingDefaultAvailability,
  withDefaultAvailability,
  type AvailabilityRule,
} from "../scheduling";

/** The five types the settings screen offers and the database constrains to. */
const SETTINGS_TYPES = ["lunch", "breakfast", "office_visit", "golf", "general"];

describe("DEFAULT_AVAILABILITY", () => {
  it("covers every meeting type the settings screen shows", () => {
    // A type missing here would silently never be proposable on a new account,
    // which is the whole bug this exists to fix.
    expect(DEFAULT_AVAILABILITY.map((r) => r.meetingType).sort()).toEqual(
      [...SETTINGS_TYPES].sort(),
    );
  });

  it("gives every default a usable window", () => {
    for (const rule of DEFAULT_AVAILABILITY) {
      expect(rule.weekdays.length, `${rule.meetingType} has no days`).toBeGreaterThan(0);
      // The database enforces end > start and 0..1439; a default that violated
      // either could not be saved from the screen it seeds.
      expect(rule.endMinute).toBeGreaterThan(rule.startMinute);
      expect(rule.startMinute).toBeGreaterThanOrEqual(0);
      expect(rule.endMinute).toBeLessThanOrEqual(1439);
      for (const day of rule.weekdays) {
        expect(day).toBeGreaterThanOrEqual(0);
        expect(day).toBeLessThanOrEqual(6);
      }
    }
  });

  it("leaves room for the meeting it is for", () => {
    // Golf is 150 minutes; a two-hour window would never yield a single slot.
    const golf = DEFAULT_AVAILABILITY.find((r) => r.meetingType === "golf")!;
    expect(golf.endMinute - golf.startMinute).toBeGreaterThanOrEqual(150);
    const lunch = DEFAULT_AVAILABILITY.find((r) => r.meetingType === "lunch")!;
    expect(lunch.endMinute - lunch.startMinute).toBeGreaterThanOrEqual(60);
  });

  it("keeps meals off Monday and Friday", () => {
    // An opinion, not a fact, and recorded here so changing it is deliberate.
    const lunch = DEFAULT_AVAILABILITY.find((r) => r.meetingType === "lunch")!;
    expect(lunch.weekdays).toEqual([2, 3, 4]);
  });
});

describe("withDefaultAvailability", () => {
  it("uses the defaults when nothing has ever been saved", () => {
    expect(withDefaultAvailability([])).toEqual(DEFAULT_AVAILABILITY);
    expect(isUsingDefaultAvailability([])).toBe(true);
  });

  it("takes a saved rule set exactly as it is", () => {
    const stored: AvailabilityRule[] = [
      { meetingType: "lunch", weekdays: [1], startMinute: 600, endMinute: 660 },
    ];
    expect(withDefaultAvailability(stored)).toEqual(stored);
    expect(isUsingDefaultAvailability(stored)).toBe(false);
  });

  it("does not fill in a type that was deliberately switched off", () => {
    // The failure this prevents: someone turns golf off, and a default puts it
    // back. A saved set is a set of decisions, including the omissions.
    const stored: AvailabilityRule[] = [
      { meetingType: "lunch", weekdays: [2, 4], startMinute: 690, endMinute: 780 },
      { meetingType: "golf", weekdays: [], startMinute: 480, endMinute: 900 },
    ];
    const result = withDefaultAvailability(stored);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.meetingType === "golf")!.weekdays).toEqual([]);
    expect(result.find((r) => r.meetingType === "breakfast")).toBeUndefined();
  });

  it("hands back copies, so a caller cannot mutate the defaults", () => {
    const first = withDefaultAvailability([]);
    first[0].weekdays.push(6);
    const second = withDefaultAvailability([]);
    expect(second[0].weekdays).not.toContain(6);
  });
});

describe("the defaults actually produce slots", () => {
  // The original bug in one test: the table was empty, so the slot-finder had
  // no rule, returned nothing, and the proposal flow dead-ended with no error.
  const monday = new Date(2026, 8, 21, 9, 0, 0); // 21 Sep 2026 is a Monday.

  it("offers lunches to a brand-new account", () => {
    const lunch = withDefaultAvailability([]).find((r) => r.meetingType === "lunch")!;
    const slots = findOpenSlots({
      rule: lunch,
      durationMinutes: 60,
      busy: [],
      horizonDays: 14,
      count: 2,
      now: monday,
    });
    expect(slots).toHaveLength(2);
    // Tuesday, Wednesday or Thursday, and inside the window.
    for (const slot of slots) {
      expect([2, 3, 4]).toContain(slot.getDay());
      const minutes = slot.getHours() * 60 + slot.getMinutes();
      expect(minutes).toBeGreaterThanOrEqual(lunch.startMinute);
      expect(minutes + 60).toBeLessThanOrEqual(lunch.endMinute);
    }
  });

  it("offers every other type too", () => {
    const durations: Record<string, number> = {
      lunch: 60,
      breakfast: 60,
      office_visit: 15,
      golf: 150,
      general: 60,
    };
    for (const rule of withDefaultAvailability([])) {
      const slots = findOpenSlots({
        rule,
        durationMinutes: durations[rule.meetingType],
        busy: [],
        horizonDays: 21,
        count: 2,
        now: monday,
      });
      expect(slots.length, `${rule.meetingType} produced no slots`).toBeGreaterThan(0);
    }
  });

  it("still yields nothing when a type is switched off", () => {
    const off: AvailabilityRule = {
      meetingType: "golf",
      weekdays: [],
      startMinute: 480,
      endMinute: 900,
    };
    expect(
      findOpenSlots({
        rule: off,
        durationMinutes: 150,
        busy: [],
        horizonDays: 14,
        count: 2,
        now: monday,
      }),
    ).toEqual([]);
  });
});
