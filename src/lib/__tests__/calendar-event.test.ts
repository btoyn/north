import { describe, expect, it } from "vitest";
import {
  MEETING_TIME_ZONE,
  calendarSubject,
  firstNameOf,
  toZonedDateTime,
} from "../calendar-event";

describe("calendarSubject", () => {
  it("names the meeting the way a banker reads it", () => {
    const brandon = { organizerFirstName: "Brandon" };
    expect(calendarSubject({ meetingType: "lunch", ...brandon })).toBe("Lunch w/ Brandon IMBL");
    expect(calendarSubject({ meetingType: "golf", ...brandon })).toBe("Golf w/ Brandon IMBL");
    expect(calendarSubject({ meetingType: "office_visit", ...brandon })).toBe(
      "Visit w/ Brandon IMBL",
    );
  });

  it("uses the same wording for whichever officer booked it", () => {
    expect(calendarSubject({ meetingType: "lunch", organizerFirstName: "Cody" })).toBe(
      "Lunch w/ Cody IMBL",
    );
  });

  it("lets a named occasion speak for itself", () => {
    expect(
      calendarSubject({
        meetingType: "general",
        customLabel: "jazz game",
        organizerFirstName: "Brandon",
      }),
    ).toBe("Jazz game w/ Brandon IMBL");
  });

  // The name comes from a sign-in field nothing forces anyone to fill in.
  it("still reads right with no name to use", () => {
    expect(calendarSubject({ meetingType: "lunch" })).toBe("Lunch w/ IMBL");
    expect(calendarSubject({ meetingType: "lunch", organizerFirstName: "  " })).toBe(
      "Lunch w/ IMBL",
    );
  });

  it("falls back to the raw type rather than dropping it", () => {
    expect(calendarSubject({ meetingType: "site_tour", organizerFirstName: "Brandon" })).toBe(
      "Site tour w/ Brandon IMBL",
    );
  });
});

describe("firstNameOf", () => {
  it("takes the first word", () => {
    expect(firstNameOf("Brandon Toyn")).toBe("Brandon");
    expect(firstNameOf("Cody Gibson")).toBe("Cody");
  });

  it("gives back nothing rather than an empty string", () => {
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf("   ")).toBeNull();
  });
});

describe("toZonedDateTime", () => {
  // Noon Mountain on a date in daylight saving: UTC-6.
  it("writes an instant as Mountain wall-clock time in summer", () => {
    expect(toZonedDateTime(new Date("2026-10-05T18:00:00Z"), MEETING_TIME_ZONE)).toBe(
      "2026-10-05T12:00:00",
    );
  });

  // Same noon in January, when Mountain is UTC-7. Getting this wrong by an
  // hour is the classic way a lunch lands at 11 or at 1.
  it("writes an instant as Mountain wall-clock time in winter", () => {
    expect(toZonedDateTime(new Date("2027-01-12T19:00:00Z"), MEETING_TIME_ZONE)).toBe(
      "2027-01-12T12:00:00",
    );
  });

  it("does not depend on the clock of the machine it runs on", () => {
    // Same instant, expressed two ways. Both are the same moment, so both must
    // come back as the same Mountain wall time -- this is what broke when the
    // sweep read replies server-side.
    const iso = new Date("2026-10-05T18:00:00Z");
    const epoch = new Date(iso.getTime());
    expect(toZonedDateTime(epoch)).toBe(toZonedDateTime(iso));
  });

  it("writes midnight as 00, not 24", () => {
    expect(toZonedDateTime(new Date("2026-10-06T06:00:00Z"))).toBe("2026-10-06T00:00:00");
  });
});
