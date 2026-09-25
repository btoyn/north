import { describe, expect, it } from "vitest";
import { readReply } from "../reply-reader";
import {
  attendeesForSlot,
  defaultInvitees,
  deriveSlotVerdicts,
  describeGroupProgress,
  draftGroupProposalEmail,
  formatNameList,
  readGroupReply,
  tallyGroupReplies,
  type AttendeeReply,
  type SlotVerdict,
} from "../group-proposal";

// A Wednesday, with the offer landing on the two Thursdays after it.
const NOW = new Date(2026, 7, 12, 9, 0); // Wed 12 Aug 2026
const THU_13 = new Date(2026, 7, 13, 11, 30);
const TUE_18 = new Date(2026, 7, 18, 11, 30);
const OFFERED = [THU_13, TUE_18];

/** What the screen does: read the whole reply, then read it once per date. */
function verdictsFor(text: string, offeredSlots = OFFERED): SlotVerdict[] {
  return readGroupReply({ text, offeredSlots, now: NOW }).verdicts;
}

function attendee(name: string, verdicts: SlotVerdict[], replied = true): AttendeeReply {
  return {
    lenderId: name.toLowerCase(),
    name,
    firstName: name.split(" ")[0],
    repliedAt: replied ? "2026-08-12T18:00:00.000Z" : null,
    replyText: replied ? "…" : null,
    verdicts,
    counteredSlot: null,
  };
}

describe("deriveSlotVerdicts", () => {
  it("marks the date they picked as a yes and leaves the other one open", () => {
    // Thursday is answered. Tuesday was never mentioned, and silence about a
    // date is not a refusal of it.
    expect(verdictsFor("Thursday the 13th works for me.")).toEqual(["yes", "unclear"]);
  });

  it("reads a flat no as a no to every date", () => {
    expect(verdictsFor("Can't do it, I'm out of town.")).toEqual(["no", "no"]);
  });

  it("takes an unqualified yes as a yes to each date on its own", () => {
    // Every date is individually agreeable to them; which one happens is now a
    // question for the tally, not for this reply.
    expect(verdictsFor("Sounds good!")).toEqual(["yes", "yes"]);
  });

  it("stays unclear when they float a date of their own", () => {
    expect(verdictsFor("Neither of those is great — how about the 25th?")).toEqual([
      "unclear",
      "unclear",
    ]);
  });

  it("stays unclear on a reply nobody could call", () => {
    expect(verdictsFor("Let me check with the team and get back to you.")).toEqual([
      "unclear",
      "unclear",
    ]);
  });

  it("is unclear everywhere without probes rather than inventing a no", () => {
    const reading = readReply({ text: "Sounds good!", offeredSlots: OFFERED, now: NOW });
    expect(deriveSlotVerdicts({ offeredSlots: OFFERED, reading })).toEqual([
      "unclear",
      "unclear",
    ]);
  });
});

describe("tallyGroupReplies", () => {
  it("counts yeses by date and calls the winner", () => {
    const tally = tallyGroupReplies({
      offeredSlots: OFFERED,
      attendees: [
        attendee("Dave Wright", ["yes", "no"]),
        attendee("Mike Chen", ["yes", "yes"]),
        attendee("Sara Diaz", ["no", "yes"]),
      ],
    });

    expect(tally.slots[0]).toMatchObject({ yes: 2, no: 1, unclear: 0 });
    expect(tally.slots[1]).toMatchObject({ yes: 2, no: 1, unclear: 0 });
    expect(tally.slots[0].yesNames).toEqual(["Dave Wright", "Mike Chen"]);
    // Tied on two yeses, so the earlier date wins.
    expect(tally.bestIndex).toBe(0);
  });

  it("picks the date with the most yeses, not the earliest", () => {
    const tally = tallyGroupReplies({
      offeredSlots: OFFERED,
      attendees: [
        attendee("Dave Wright", ["no", "yes"]),
        attendee("Mike Chen", ["unclear", "yes"]),
        attendee("Sara Diaz", ["yes", "yes"]),
      ],
    });
    expect(tally.bestIndex).toBe(1);
  });

  it("leaves silent attendees out of every count", () => {
    const tally = tallyGroupReplies({
      offeredSlots: OFFERED,
      attendees: [
        attendee("Dave Wright", ["yes", "unclear"]),
        attendee("Quiet Pat", [], false),
      ],
    });

    expect(tally.slots[0]).toMatchObject({ yes: 1, no: 0, unclear: 0 });
    expect(tally.notReplied.map((a) => a.name)).toEqual(["Quiet Pat"]);
    expect(tally.replied.map((a) => a.name)).toEqual(["Dave Wright"]);
  });

  it("has no winner until a yes lands", () => {
    const tally = tallyGroupReplies({
      offeredSlots: OFFERED,
      attendees: [attendee("Dave Wright", ["no", "unclear"]), attendee("Quiet Pat", [], false)],
    });
    expect(tally.bestIndex).toBeNull();
    expect(tally.hasAnyYes).toBe(false);
  });

  it("flags any yes at all, which is what surfaces it for attention", () => {
    const tally = tallyGroupReplies({
      offeredSlots: OFFERED,
      attendees: [attendee("Dave Wright", ["unclear", "yes"])],
    });
    expect(tally.hasAnyYes).toBe(true);
  });
});

describe("attendeesForSlot", () => {
  it("is only the people who said yes to that date", () => {
    const attendees = [
      attendee("Dave Wright", ["yes", "no"]),
      attendee("Mike Chen", ["unclear", "yes"]),
      attendee("Quiet Pat", [], false),
    ];
    expect(attendeesForSlot(attendees, 0).map((a) => a.name)).toEqual(["Dave Wright"]);
    expect(attendeesForSlot(attendees, 1).map((a) => a.name)).toEqual(["Mike Chen"]);
  });
});

describe("formatNameList", () => {
  it("reads like a person wrote it", () => {
    expect(formatNameList([])).toBe("");
    expect(formatNameList(["Dave"])).toBe("Dave");
    expect(formatNameList(["Dave", "Mike"])).toBe("Dave and Mike");
    expect(formatNameList(["Dave", "Mike", "Sara"])).toBe("Dave, Mike and Sara");
  });
});

describe("draftGroupProposalEmail", () => {
  it("greets everyone and offers every date", () => {
    const { subject, body } = draftGroupProposalEmail({
      firstNames: ["Dave", "Mike", "Sara"],
      meetingType: "lunch",
      slots: OFFERED,
    });
    expect(subject).toBe("Lunch?");
    expect(body).toContain("Hey Dave, Mike and Sara");
    expect(body).toContain("Thursday the 13th");
    expect(body).toContain("Tuesday the 18th");
  });

  it("uses the name he gave an 'other' meeting", () => {
    const { subject, body } = draftGroupProposalEmail({
      firstNames: ["Dave"],
      meetingType: "general",
      customLabel: "a ballgame",
      slots: [THU_13],
    });
    expect(subject).toBe("A ballgame?");
    expect(body).toContain("for a ballgame");
  });
});

describe("describeGroupProgress", () => {
  it("leads with the count and names the best date once there is one", () => {
    const attendees = [
      attendee("Dave Wright", ["yes", "no"]),
      attendee("Mike Chen", ["yes", "unclear"]),
      attendee("Quiet Pat", [], false),
    ];
    const tally = tallyGroupReplies({ offeredSlots: OFFERED, attendees });
    expect(describeGroupProgress(tally)).toBe("2 of 3 replied · 2 free Thursday the 13th at 11:30am");
  });

  it("says only what it knows before anyone is free", () => {
    const tally = tallyGroupReplies({
      offeredSlots: OFFERED,
      attendees: [attendee("Dave Wright", ["no", "no"]), attendee("Quiet Pat", [], false)],
    });
    expect(describeGroupProgress(tally)).toBe("1 of 2 replied");
  });
});

describe("readGroupReply", () => {
  it("reads the answer and each date in one pass", () => {
    const { reading, verdicts } = readGroupReply({
      text: "Thursday the 13th works, thanks.",
      offeredSlots: OFFERED,
      now: NOW,
    });
    expect(reading.intent).toBe("accepted");
    expect(verdicts).toEqual(["yes", "unclear"]);
  });

  // The reason this moved out of the mailbox sweep. The sweep read replies on a
  // server six hours ahead of Utah, so a reply he got at 7pm Wednesday was read
  // against a clock that had already turned Thursday -- and "Thursday" then
  // means *next* Thursday. The offered date stops being a yes and becomes a
  // counter-offer to a day a week later that nobody proposed.
  it("resolves a bare weekday against the clock it is handed", () => {
    const his = readGroupReply({
      text: "Thursday works",
      offeredSlots: OFFERED,
      now: new Date(2026, 7, 12, 19, 0), // Wednesday evening, his clock
    });
    expect(his.reading.intent).toBe("accepted");
    expect(his.reading.slot).toEqual(THU_13);
    expect(his.verdicts).toEqual(["yes", "unclear"]);

    const alreadyTomorrow = readGroupReply({
      text: "Thursday works",
      offeredSlots: OFFERED,
      now: new Date(2026, 7, 13, 1, 0), // the same moment, a clock hours ahead
    });
    expect(alreadyTomorrow.reading.intent).toBe("countered");
    expect(alreadyTomorrow.reading.slot?.getDate()).toBe(20);
    expect(alreadyTomorrow.verdicts).toEqual(["unclear", "unclear"]);
  });

  it("carries the probes, which the old server-side pass never had", () => {
    // Neither date is named, so only the per-date probe can resolve this one.
    const { verdicts } = readGroupReply({
      text: "The 18th is better for me.",
      offeredSlots: OFFERED,
      now: NOW,
    });
    expect(verdicts[1]).toBe("yes");
  });
});

describe("defaultInvitees", () => {
  const ids = (list: AttendeeReply[]) => list.map((a) => a.lenderId);

  it("sends to the yeses only while one person has agreed", () => {
    const list = [
      attendee("Dan", ["yes", "unclear"]),
      attendee("Jermaine", ["unclear", "unclear"]),
      attendee("Josh", [], false),
    ];
    expect(ids(defaultInvitees(list, 0))).toEqual(["dan"]);
  });

  // Two yeses and it is happening, so the quiet ones get it in Outlook where
  // accepting is a click.
  it("sends to everyone once two have agreed", () => {
    const list = [
      attendee("Dan", ["yes", "unclear"]),
      attendee("Jermaine", ["yes", "unclear"]),
      attendee("Josh", [], false),
    ];
    expect(ids(defaultInvitees(list, 0))).toEqual(["dan", "jermaine", "josh"]);
  });

  it("leaves off the one person who said no to that date", () => {
    const list = [
      attendee("Dan", ["yes", "unclear"]),
      attendee("Jermaine", ["yes", "unclear"]),
      attendee("Mike", ["no", "yes"]),
      attendee("Josh", [], false),
    ];
    expect(ids(defaultInvitees(list, 0))).toEqual(["dan", "jermaine", "josh"]);
    // ...and he is back on the date he actually said yes to.
    expect(ids(defaultInvitees(list, 1))).toEqual(["mike"]);
  });

  it("sends to nobody when nobody has agreed", () => {
    expect(defaultInvitees([attendee("Josh", [], false)], 0)).toEqual([]);
  });
});
