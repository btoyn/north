import { describe, expect, it } from "vitest";
import {
  missingAttendees,
  responseChanges,
  responseStatusFromGraph,
  type AttendeeRow,
} from "../meeting-responses";

describe("responseStatusFromGraph", () => {
  it("translates the three answers that mean something", () => {
    expect(responseStatusFromGraph("accepted")).toBe("confirmed");
    expect(responseStatusFromGraph("tentativelyAccepted")).toBe("tentative");
    expect(responseStatusFromGraph("declined")).toBe("declined");
  });

  // Silence from the calendar is not an answer, and treating it as one would
  // wipe out a verdict the reply reader worked out from their email.
  it("says nothing about the ones who have not answered", () => {
    expect(responseStatusFromGraph("notResponded")).toBeNull();
    expect(responseStatusFromGraph("none")).toBeNull();
    expect(responseStatusFromGraph(null)).toBeNull();
    expect(responseStatusFromGraph(undefined)).toBeNull();
  });

  it("ignores the organizer, who is him", () => {
    expect(responseStatusFromGraph("organizer")).toBeNull();
  });
});

describe("responseChanges", () => {
  const row = (over: Partial<AttendeeRow> = {}): AttendeeRow => ({
    lenderId: "josh",
    email: "josh@cachevalleybank.com",
    responseStatus: "invited",
    ...over,
  });

  it("picks up the person who accepted in Outlook without writing back", () => {
    expect(
      responseChanges(
        [row()],
        [{ email: "josh@cachevalleybank.com", response: "accepted" }],
      ),
    ).toEqual([{ lenderId: "josh", from: "invited", to: "confirmed" }]);
  });

  it("matches on the address however it is capitalised", () => {
    expect(
      responseChanges(
        [row({ email: "Josh@CacheValleyBank.com " })],
        [{ email: " josh@cachevalleybank.com", response: "accepted" }],
      ),
    ).toHaveLength(1);
  });

  it("writes nothing when the calendar agrees with what is stored", () => {
    expect(
      responseChanges(
        [row({ responseStatus: "confirmed" })],
        [{ email: "josh@cachevalleybank.com", response: "accepted" }],
      ),
    ).toEqual([]);
  });

  it("leaves alone the ones who have not opened it", () => {
    expect(
      responseChanges(
        [row()],
        [{ email: "josh@cachevalleybank.com", response: "notResponded" }],
      ),
    ).toEqual([]);
  });

  it("records a decline, which is a real answer", () => {
    expect(
      responseChanges([row()], [{ email: "josh@cachevalleybank.com", response: "declined" }]),
    ).toEqual([{ lenderId: "josh", from: "invited", to: "declined" }]);
  });

  // Somebody who said yes by email and then declined the invite has changed
  // their mind, and the calendar is the more recent word.
  it("lets the calendar overrule an earlier yes", () => {
    expect(
      responseChanges(
        [row({ responseStatus: "confirmed" })],
        [{ email: "josh@cachevalleybank.com", response: "declined" }],
      ),
    ).toEqual([{ lenderId: "josh", from: "confirmed", to: "declined" }]);
  });

  it("skips an attendee with no address to match on", () => {
    expect(responseChanges([row({ email: null })], [{ email: null, response: "accepted" }])).toEqual(
      [],
    );
  });

  it("ignores people on the calendar event who are not partners", () => {
    expect(
      responseChanges([row()], [{ email: "someone.else@im504.com", response: "accepted" }]),
    ).toEqual([]);
  });
});

describe("missingAttendees", () => {
  const index = new Map([
    ["josh@cachevalleybank.com", "josh"],
    ["dan@zionsbank.com", "dan"],
  ]);
  const dan: AttendeeRow = {
    lenderId: "dan",
    email: "dan@zionsbank.com",
    responseStatus: "confirmed",
  };

  // He added somebody to the invitation in Outlook. North has to see it, or
  // that person accepts against nothing and reads as untouched forever.
  it("picks up a partner added to the event outside North", () => {
    expect(
      missingAttendees(
        [dan],
        [
          { email: "dan@zionsbank.com", response: "accepted" },
          { email: "josh@cachevalleybank.com", response: "none" },
        ],
        index,
      ),
    ).toEqual([{ lenderId: "josh", responseStatus: "invited" }]);
  });

  it("carries their answer over when they have already given one", () => {
    expect(
      missingAttendees([dan], [{ email: "josh@cachevalleybank.com", response: "accepted" }], index),
    ).toEqual([{ lenderId: "josh", responseStatus: "confirmed" }]);
  });

  it("adds nobody who is already on the meeting", () => {
    expect(
      missingAttendees([dan], [{ email: "dan@zionsbank.com", response: "accepted" }], index),
    ).toEqual([]);
  });

  // Colleagues and room mailboxes are on plenty of invitations.
  it("adds nobody who is not a partner", () => {
    expect(
      missingAttendees(
        [dan],
        [
          { email: "boardroom@im504.com", response: "accepted" },
          { email: "btoyn@im504.com", response: "organizer" },
        ],
        index,
      ),
    ).toEqual([]);
  });

  it("adds a person once even if they are on the event twice", () => {
    expect(
      missingAttendees(
        [dan],
        [
          { email: "josh@cachevalleybank.com", response: "accepted" },
          { email: "JOSH@cachevalleybank.com", response: "declined" },
        ],
        index,
      ),
    ).toHaveLength(1);
  });
});
