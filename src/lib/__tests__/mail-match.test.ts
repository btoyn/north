import { describe, expect, it } from "vitest";
import {
  buildLenderIndex,
  externalId,
  isAutoReply,
  matchMessage,
  matchMessages,
  normalizeAddress,
  type MailMessage,
} from "../mail-match";

const LENDERS = [
  { id: "jake", email: "Jake.Terrill@wasatch.example" },
  { id: "marcy", email: "marcy@wasatch.example" },
  { id: "hank", email: "hank@redrock.example" },
  { id: "tessa", email: "tessa@redrock.example" },
  { id: "ruben", email: "ruben@redrock.example" },
  { id: "gwen", email: "gwen@pioneer.example" },
  { id: "nobody", email: null },
];

const index = buildLenderIndex(LENDERS);
const ME = ["brandon@im504.example"];

const message = (over: Partial<MailMessage> = {}): MailMessage => ({
  id: "AAMk-1",
  subject: "Summit Peak sources and uses",
  sentAt: "2026-09-20T15:04:00Z",
  from: "jake.terrill@wasatch.example",
  toRecipients: ["brandon@im504.example"],
  ccRecipients: [],
  ...over,
});

describe("normalizeAddress", () => {
  it("lowercases and trims", () => {
    expect(normalizeAddress("  Jake.Terrill@Wasatch.Example ")).toBe(
      "jake.terrill@wasatch.example",
    );
  });

  it("pulls the address out of a display name", () => {
    expect(normalizeAddress("Jake Terrill <Jake@bank.com>")).toBe("jake@bank.com");
  });

  it("refuses anything that isn't an address", () => {
    expect(normalizeAddress("Jake Terrill")).toBeNull();
    expect(normalizeAddress("")).toBeNull();
    expect(normalizeAddress(null)).toBeNull();
  });
});

describe("buildLenderIndex", () => {
  it("skips partners with no email", () => {
    expect(index.has("null")).toBe(false);
    expect([...index.values()]).not.toContain("nobody");
  });

  it("matches regardless of the case it was stored in", () => {
    expect(index.get("jake.terrill@wasatch.example")).toBe("jake");
  });
});

describe("isAutoReply", () => {
  it("catches the usual wording", () => {
    for (const s of [
      "Automatic reply: Out of office",
      "Auto: I am away",
      "Out of Office: back Monday",
      "Undeliverable: Summit Peak",
      "RE: Automatic reply: away until the 5th",
    ]) {
      expect(isAutoReply(s)).toBe(true);
    }
  });

  it("leaves real mail alone", () => {
    expect(isAutoReply("Summit Peak sources and uses")).toBe(false);
    expect(isAutoReply("Re: out of state borrower question")).toBe(false);
    expect(isAutoReply(null)).toBe(false);
  });
});

describe("matchMessage", () => {
  it("logs mail from a partner as a conversation", () => {
    expect(matchMessage(message(), index, ME)).toEqual([
      {
        messageId: "AAMk-1",
        lenderId: "jake",
        activityType: "incoming_email",
        direction: "inbound",
        subject: "Summit Peak sources and uses",
        occurredAt: "2026-09-20T15:04:00Z",
        initiatedByLender: true,
      },
    ]);
  });

  it("throws away an out of office so it can't fake a reply", () => {
    expect(
      matchMessage(message({ subject: "Automatic reply: out until Monday" }), index, ME),
    ).toEqual([]);
  });

  it("logs my own mail as a sent email, not a conversation", () => {
    const matches = matchMessage(
      message({ from: "brandon@im504.example", toRecipients: ["marcy@wasatch.example"] }),
      index,
      ME,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      lenderId: "marcy",
      activityType: "personal_email",
      direction: "outbound",
      initiatedByLender: false,
    });
  });

  it("counts every partner on a small outgoing thread, cc included", () => {
    const matches = matchMessage(
      message({
        from: "brandon@im504.example",
        toRecipients: ["hank@redrock.example", "tessa@redrock.example"],
        ccRecipients: ["ruben@redrock.example"],
      }),
      index,
      ME,
    );
    expect(matches.map((m) => m.lenderId).sort()).toEqual(["hank", "ruben", "tessa"]);
    expect(matches.every((m) => m.activityType === "personal_email")).toBe(true);
  });

  it("treats a wide send as the blast it is", () => {
    const matches = matchMessage(
      message({
        from: "brandon@im504.example",
        toRecipients: [
          "jake.terrill@wasatch.example",
          "marcy@wasatch.example",
          "hank@redrock.example",
          "tessa@redrock.example",
          "ruben@redrock.example",
        ],
      }),
      index,
      ME,
    );
    expect(matches).toHaveLength(5);
    expect(matches.every((m) => m.activityType === "campaign_email")).toBe(true);
  });

  it("ignores mail that has nothing to do with a partner", () => {
    expect(
      matchMessage(
        message({ from: "amazon@marketing.example", toRecipients: ["brandon@im504.example"] }),
        index,
        ME,
      ),
    ).toEqual([]);
    expect(
      matchMessage(
        message({ from: "brandon@im504.example", toRecipients: ["wife@home.example"] }),
        index,
        ME,
      ),
    ).toEqual([]);
  });

  it("ignores mail between two other people that merely reached my mailbox", () => {
    expect(
      matchMessage(
        message({ from: "someone@else.example", toRecipients: ["marcy@wasatch.example"] }),
        index,
        ME,
      ),
    ).toEqual([]);
  });

  it("skips drafts, which are things not yet said", () => {
    expect(
      matchMessage(
        message({ from: "brandon@im504.example", toRecipients: ["gwen@pioneer.example"], isDraft: true }),
        index,
        ME,
      ),
    ).toEqual([]);
  });
});

describe("matchMessages", () => {
  it("leaves out what is already on the timeline", () => {
    const already = new Set([externalId("AAMk-1", "jake")]);
    expect(matchMessages([message()], index, ME, already)).toEqual([]);
  });

  it("does not log the same message against the same partner twice in one run", () => {
    const matches = matchMessages([message(), message()], index, ME);
    expect(matches).toHaveLength(1);
  });

  it("still logs one message against two different partners", () => {
    const matches = matchMessages(
      [
        message({
          from: "brandon@im504.example",
          toRecipients: ["hank@redrock.example", "tessa@redrock.example"],
        }),
      ],
      index,
      ME,
    );
    expect(matches).toHaveLength(2);
    expect(new Set(matches.map((m) => externalId(m.messageId, m.lenderId))).size).toBe(2);
  });
});
