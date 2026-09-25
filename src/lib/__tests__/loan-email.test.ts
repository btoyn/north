import { describe, expect, it } from "vitest";
import {
  MAILTO_SAFE_LENGTH,
  firstDraft,
  firstDraftCursor,
  firstName,
  fitsInMailto,
  handoffDraft,
  mailtoUrl,
  updateSubject,
} from "../loan-email";

describe("firstName", () => {
  it("takes the first word", () => {
    expect(firstName("Joe Whitfield")).toBe("Joe");
    expect(firstName("Kelly")).toBe("Kelly");
  });

  it("falls back to something that still reads as a greeting", () => {
    expect(firstName(null)).toBe("there");
    expect(firstName("   ")).toBe("there");
  });
});

describe("updateSubject", () => {
  it("dates the subject so each week is its own message", () => {
    expect(updateSubject("Harris", new Date(2026, 7, 19))).toBe("Harris loan — update Aug 19");
  });

  it("changes week to week, so nothing collapses into one thread", () => {
    const a = updateSubject("Harris", new Date(2026, 7, 19));
    const b = updateSubject("Harris", new Date(2026, 7, 26));
    expect(a).not.toBe(b);
  });
});

describe("firstDraft", () => {
  const draft = firstDraft({
    lenderName: "Joe Whitfield",
    borrowerName: "Harris",
    signature: "Brandon Toynbee\nBusiness Development Officer",
  });

  it("greets the partner by first name", () => {
    expect(draft).toContain("Hey Joe,");
    expect(draft).not.toContain("Whitfield");
  });

  it("names the loan in the opening line", () => {
    expect(draft).toContain("weekly update on the Harris loan");
  });

  it("leaves the middle empty — the news is the user's to write", () => {
    expect(draft).toMatch(/Harris loan\.\n\n\n/);
  });

  it("closes with the standing line and the signature", () => {
    expect(draft).toContain("questions or need anything in the meantime");
    expect(draft.trimEnd().endsWith("Business Development Officer")).toBe(true);
  });

  it("holds together with no signature set yet", () => {
    const bare = firstDraft({ lenderName: "Kelly", borrowerName: "Cedar Ridge" });
    expect(bare).toContain("Hey Kelly,");
    expect(bare.trimEnd().endsWith("in the meantime.")).toBe(true);
  });
});

describe("firstDraftCursor", () => {
  it("lands on the blank line where the news goes", () => {
    const draft = firstDraft({ lenderName: "Joe", borrowerName: "Harris", signature: "Brandon" });
    const before = draft.slice(0, firstDraftCursor(draft));
    expect(before).toContain("weekly update on the Harris loan");
    expect(before).not.toContain("in the meantime");
  });
});

describe("handoffDraft", () => {
  it("leads with the approval", () => {
    const d = handoffDraft({ lenderName: "Joe", borrowerName: "Harris", construction: false });
    expect(d).toContain("we have SBA approval");
  });

  it("gives the 45 to 90 day window on an ordinary deal", () => {
    const d = handoffDraft({ lenderName: "Joe", borrowerName: "Harris", construction: false });
    expect(d).toContain("45 to 90 days");
    expect(d).not.toContain("certificate of occupancy");
  });

  it("waits on the certificate of occupancy when there's construction", () => {
    const d = handoffDraft({ lenderName: "Joe", borrowerName: "Harris", construction: true });
    expect(d).toContain("certificate of occupancy");
    expect(d).not.toContain("45 to 90 days");
  });

  it("never guesses at an SBA timeline", () => {
    for (const construction of [true, false]) {
      const d = handoffDraft({ lenderName: "Joe", borrowerName: "Harris", construction });
      expect(d).not.toMatch(/hear back|expect.*week|should know by/i);
    }
  });
});

describe("mailtoUrl", () => {
  it("puts both recipients on one email", () => {
    const url = mailtoUrl({
      to: ["joe@bank.com", "dave@cedarridge.com"],
      subject: "Harris loan",
      body: "Hi",
    });
    expect(url.startsWith("mailto:joe@bank.com,dave@cedarridge.com?")).toBe(true);
  });

  it("drops missing addresses rather than emitting an empty one", () => {
    const url = mailtoUrl({ to: ["joe@bank.com", ""], subject: "s", body: "b" });
    expect(url.startsWith("mailto:joe@bank.com?")).toBe(true);
  });

  it("encodes spaces as %20, not +, so the body isn't full of plus signs", () => {
    const url = mailtoUrl({ to: ["a@b.com"], subject: "Harris loan update", body: "Hey Joe," });
    expect(url).toContain("Harris%20loan%20update");
    expect(url).not.toContain("+");
  });

  it("survives line breaks and an em dash", () => {
    const url = mailtoUrl({
      to: ["a@b.com"],
      subject: "Harris loan — update Aug 19",
      body: "Hey Joe,\n\nStill in underwriting.\n",
    });
    expect(url).toContain("%0A");
    expect(decodeURIComponent(url.split("body=")[1])).toBe("Hey Joe,\n\nStill in underwriting.\n");
  });
});

describe("fitsInMailto", () => {
  it("passes a normal weekly update", () => {
    const body = firstDraft({
      lenderName: "Joe",
      borrowerName: "Harris",
      signature: "Brandon Toynbee\nInterMountain Business Lending\n801-555-0100",
    });
    expect(fitsInMailto({ to: ["joe@bank.com"], subject: "Harris loan — update Aug 19", body })).toBe(
      true,
    );
  });

  it("catches one long enough to be truncated silently", () => {
    expect(
      fitsInMailto({ to: ["joe@bank.com"], subject: "s", body: "x".repeat(MAILTO_SAFE_LENGTH) }),
    ).toBe(false);
  });
});
