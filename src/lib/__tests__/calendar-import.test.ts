import { describe, expect, it } from "vitest";
import {
  importableMeetings,
  meetingTypeFromSubject,
  type CalendarEvent,
} from "../calendar-import";

const INDEX = new Map([
  ["dan@zionsbank.com", "dan"],
  ["jermaine@zionsbank.com", "jermaine"],
  ["josh@zionsbank.com", "josh"],
  ["mia@cachevalley.com", "mia"],
  ["ken@cachevalley.com", "ken"],
]);

const NONE = new Set<string>();

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "e1",
  subject: "Lunch w/ Brandon IMBL",
  start: new Date("2026-10-05T18:00:00Z"),
  end: new Date("2026-10-05T19:00:00Z"),
  cancelled: false,
  organizerEmail: "btoyn@im504.com",
  attendees: [{ email: "dan@zionsbank.com", response: "accepted" }],
  locationName: "Cliffside",
  ...over,
});

describe("meetingTypeFromSubject", () => {
  it("takes the hint when the subject gives one", () => {
    expect(meetingTypeFromSubject("Lunch w/ Brandon IMBL")).toBe("lunch");
    expect(meetingTypeFromSubject("Breakfast Thursday")).toBe("breakfast");
    expect(meetingTypeFromSubject("Golf at Sand Hollow")).toBe("golf");
    expect(meetingTypeFromSubject("Stopping by the branch")).toBe("pop_in");
    expect(meetingTypeFromSubject("Branch visit")).toBe("office_visit");
  });

  it("settles for general rather than guessing", () => {
    expect(meetingTypeFromSubject("Catch up")).toBe("general");
    expect(meetingTypeFromSubject(null)).toBe("general");
    expect(meetingTypeFromSubject("")).toBe("general");
  });
});

describe("importableMeetings", () => {
  it("pulls in a lunch he set up entirely over email", () => {
    const [m] = importableMeetings([event()], INDEX, NONE);
    expect(m.meetingType).toBe("lunch");
    expect(m.title).toBe("Lunch w/ Brandon IMBL");
    expect(m.locationName).toBe("Cliffside");
    expect(m.partners).toEqual([{ lenderId: "dan", responseStatus: "confirmed" }]);
  });

  // The case a naming convention would never have caught.
  it("pulls in one the banker organised", () => {
    const [m] = importableMeetings(
      [event({ subject: "Coffee?", organizerEmail: "dan@zionsbank.com", attendees: [] })],
      INDEX,
      NONE,
    );
    expect(m.meetingType).toBe("general");
    expect(m.partners).toEqual([{ lenderId: "dan", responseStatus: "confirmed" }]);
  });

  it("skips the ones North already knows about", () => {
    expect(importableMeetings([event()], INDEX, new Set(["e1"]))).toEqual([]);
  });

  it("skips anything with no partner on it", () => {
    expect(
      importableMeetings(
        [event({ attendees: [{ email: "cgibson@im504.com", response: "accepted" }] })],
        INDEX,
        NONE,
      ),
    ).toEqual([]);
  });

  it("skips one that was called off", () => {
    expect(importableMeetings([event({ cancelled: true })], INDEX, NONE)).toEqual([]);
  });

  it("skips one with no start time to put it at", () => {
    expect(importableMeetings([event({ start: null })], INDEX, NONE)).toEqual([]);
  });

  // A bank roadshow is not nine personal touches.
  it("skips an event with too many partners on it", () => {
    const many = event({
      subject: "Zions quarterly update",
      attendees: [...INDEX.keys()].map((email) => ({ email, response: "accepted" })),
    });
    expect(importableMeetings([many], INDEX, NONE)).toEqual([]);
  });

  it("skips a roomful even when only one partner is in it", () => {
    const crowd = event({
      attendees: [
        { email: "dan@zionsbank.com", response: "accepted" },
        ...Array.from({ length: 14 }, (_, i) => ({
          email: `colleague${i}@im504.com`,
          response: "accepted",
        })),
      ],
    });
    expect(importableMeetings([crowd], INDEX, NONE)).toEqual([]);
  });

  it("carries each partner's own answer", () => {
    const [m] = importableMeetings(
      [
        event({
          attendees: [
            { email: "dan@zionsbank.com", response: "accepted" },
            { email: "jermaine@zionsbank.com", response: "tentativelyAccepted" },
            { email: "josh@zionsbank.com", response: "none" },
          ],
        }),
      ],
      INDEX,
      NONE,
    );
    expect(m.partners).toEqual([
      { lenderId: "dan", responseStatus: "confirmed" },
      { lenderId: "jermaine", responseStatus: "tentative" },
      { lenderId: "josh", responseStatus: "invited" },
    ]);
  });

  it("counts a person once when they appear twice", () => {
    const [m] = importableMeetings(
      [
        event({
          organizerEmail: "dan@zionsbank.com",
          attendees: [{ email: "DAN@zionsbank.com", response: "accepted" }],
        }),
      ],
      INDEX,
      NONE,
    );
    expect(m.partners).toHaveLength(1);
  });
});
