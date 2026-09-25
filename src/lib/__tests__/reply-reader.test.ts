import { describe, expect, it } from "vitest";
import { readReply, stripQuotedHistory } from "../reply-reader";

const NOW = new Date(2026, 7, 12, 9, 0); // Wed 12 Aug 2026
const OFFERED = [new Date(2026, 7, 13, 11, 30), new Date(2026, 7, 18, 11, 30)];

const read = (text: string, offeredSlots = OFFERED) =>
  readReply({ text, offeredSlots, now: NOW });

describe("stripQuotedHistory", () => {
  it("drops the quoted original below a reply", () => {
    const raw = [
      "The 13th works great.",
      "",
      "On Wed, Aug 12, 2026 at 9:04 AM Brandon wrote:",
      "> Are you free the 13th or the 18th?",
    ].join("\n");
    expect(stripQuotedHistory(raw)).toBe("The 13th works great.");
  });

  it("drops Outlook-style headers", () => {
    const raw = "Sounds good.\n\n-----Original Message-----\nFrom: Brandon\nAre you free?";
    expect(stripQuotedHistory(raw)).toBe("Sounds good.");
  });

  it("drops phone signatures", () => {
    expect(stripQuotedHistory("Works for me.\n\nSent from my iPhone")).toBe("Works for me.");
  });
});

describe("readReply — accepting", () => {
  it("books when they name one of the offered dates", () => {
    const r = read("The 13th works great, see you then.");
    expect(r.intent).toBe("accepted");
    expect(r.slot?.getDate()).toBe(13);
  });

  it("books on a weekday name that matches an offer", () => {
    const r = read("Thursday works for me.");
    expect(r.intent).toBe("accepted");
    expect(r.slot?.getDate()).toBe(13);
  });

  it("books a bare yes when only one date was offered", () => {
    const r = read("Sounds good!", [OFFERED[0]]);
    expect(r.intent).toBe("accepted");
    expect(r.slot).toEqual(OFFERED[0]);
  });

  it("picks the date that wasn't refused", () => {
    const r = read("Can't do the 13th, but the 18th works.");
    expect(r.intent).toBe("accepted");
    expect(r.slot?.getDate()).toBe(18);
  });
});

describe("readReply — counter-offers", () => {
  it("reads a different date as a counter", () => {
    const r = read("Neither of those work — how about the 21st?");
    expect(r.intent).toBe("countered");
    expect(r.slot?.getDate()).toBe(21);
  });

  it("carries the offered time over when they only name a day", () => {
    const r = read("How about the 21st?");
    expect(r.slot?.getHours()).toBe(11);
    expect(r.slot?.getMinutes()).toBe(30);
  });

  it("uses the time when they give one", () => {
    const r = read("Could we do the 21st at 1pm instead?");
    expect(r.intent).toBe("countered");
    expect(r.slot?.getHours()).toBe(13);
  });
});

describe("readReply — declining", () => {
  it("reads a flat no with no alternative", () => {
    const r = read("Sorry, I'm out of town — have to pass on this one.");
    expect(r.intent).toBe("declined");
    expect(r.slot).toBeNull();
  });
});

describe("readReply — abstaining", () => {
  it("abstains on a yes that doesn't say which date", () => {
    const r = read("Sounds good!");
    expect(r.intent).toBe("unclear");
  });

  it("abstains when both offered dates are named", () => {
    const r = read("Either the 13th or the 18th works for me.");
    expect(r.intent).toBe("unclear");
  });

  it("abstains on vague timing", () => {
    const r = read("Let's find something after the holidays.");
    expect(r.intent).toBe("unclear");
  });

  it("abstains on the messy replies AI would be needed for", () => {
    const r = read("I'm slammed that whole week but the week after could work if it's early.");
    expect(r.intent).toBe("unclear");
  });

  it("abstains on several alternatives", () => {
    const r = read("Could do the 20th, or the 21st, or maybe the 25th.");
    expect(r.intent).toBe("unclear");
  });

  it("abstains on an empty reply", () => {
    expect(read("   ").intent).toBe("unclear");
  });

  it("is not fooled by the quoted original", () => {
    // The quote contains both offered dates and the word "free".
    const raw = [
      "Let me look at my calendar and get back to you.",
      "",
      "> Are you free Thursday the 13th at 11:30am or Tuesday the 18th at 11:30am?",
    ].join("\n");
    expect(read(raw).intent).toBe("unclear");
  });
});

describe("the ways people say yes", () => {
  const MONDAY = new Date("2026-10-05T12:00:00");
  const NOW = new Date("2026-09-25T20:00:00");

  const read = (text: string) =>
    readReply({ text, offeredSlots: [MONDAY], now: NOW });

  it("takes the phrasings that actually turned up", () => {
    // Both of these came back on the same real lunch ask. "Works for me" was
    // already read; "I'm available" was not, and an unread yes is worse than
    // no reader at all because he stops checking.
    expect(read("Works for me").intent).toBe("accepted");
    expect(read("I'm available").intent).toBe("accepted");
  });

  it("takes the other common ones", () => {
    for (const text of [
      "That'll work",
      "I can make that",
      "I can do that",
      "I'm in",
      "Sounds good",
      "Available then",
    ]) {
      expect(read(text).intent, text).toBe("accepted");
    }
  });

  it("still refuses a no, however friendly", () => {
    expect(read("I'm available most days but not that one").intent).not.toBe("accepted");
    expect(read("Can't make it").intent).toBe("declined");
  });
});
