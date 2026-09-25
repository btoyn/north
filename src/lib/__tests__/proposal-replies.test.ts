import { describe, expect, it } from "vitest";
import { detectReplies, isUnreadReply, type OpenAttendee } from "../proposal-replies";

const SENT = "2026-09-25T20:09:08Z";

const attendee = (lenderId: string, over: Partial<OpenAttendee> = {}): OpenAttendee => ({
  proposalId: "p1",
  lenderId,
  proposalSentAt: SENT,
  repliedAt: null,
  ...over,
});

describe("detectReplies", () => {
  it("finds the one who wrote back", () => {
    const found = detectReplies(
      [attendee("dan"), attendee("jermaine"), attendee("josh")],
      [{ lenderId: "jermaine", occurredAt: "2026-09-25T20:10:54Z" }],
    );
    expect(found).toEqual([
      { proposalId: "p1", lenderId: "jermaine", repliedAt: "2026-09-25T20:10:54Z" },
    ]);
  });

  it("ignores mail that arrived before the ask went out", () => {
    expect(
      detectReplies(
        [attendee("jermaine")],
        [{ lenderId: "jermaine", occurredAt: "2026-09-24T22:33:46Z" }],
      ),
    ).toEqual([]);
  });

  it("takes the first reply, not the latest", () => {
    const found = detectReplies(
      [attendee("jermaine")],
      [
        { lenderId: "jermaine", occurredAt: "2026-09-26T09:00:00Z" },
        { lenderId: "jermaine", occurredAt: "2026-09-25T20:10:54Z" },
      ],
    );
    expect(found[0].repliedAt).toBe("2026-09-25T20:10:54Z");
  });

  it("leaves alone anyone already marked", () => {
    expect(
      detectReplies(
        [attendee("jermaine", { repliedAt: "2026-09-25T20:11:00Z" })],
        [{ lenderId: "jermaine", occurredAt: "2026-09-25T20:30:00Z" }],
      ),
    ).toEqual([]);
  });

  it("skips a proposal that was never sent", () => {
    expect(
      detectReplies(
        [attendee("jermaine", { proposalSentAt: null })],
        [{ lenderId: "jermaine", occurredAt: "2026-09-25T20:10:54Z" }],
      ),
    ).toEqual([]);
  });

  it("marks the same person on two open asks", () => {
    const found = detectReplies(
      [attendee("jermaine"), attendee("jermaine", { proposalId: "p2" })],
      [{ lenderId: "jermaine", occurredAt: "2026-09-25T20:10:54Z" }],
    );
    expect(found.map((f) => f.proposalId).sort()).toEqual(["p1", "p2"]);
  });
});

describe("isUnreadReply", () => {
  it("is true when they wrote back and nothing is recorded", () => {
    expect(isUnreadReply({ repliedAt: SENT, replyIntent: null })).toBe(true);
  });

  it("is false once a verdict is recorded", () => {
    expect(isUnreadReply({ repliedAt: SENT, replyIntent: "accepted" })).toBe(false);
  });

  it("is false when they have not written back", () => {
    expect(isUnreadReply({ repliedAt: null, replyIntent: null })).toBe(false);
  });
});
