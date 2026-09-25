import { describe, expect, it } from "vitest";
import { createPkcePair, decryptToken, encryptToken, randomState } from "../microsoft/crypto";
import {
  busyBlocksFromSchedule,
  mergeBusyBlocks,
  parseGraphInstant,
  scheduleHadErrors,
  type GraphScheduleEntry,
} from "../microsoft/free-busy";
import { expiryFromSeconds, isConsentLost, needsRefresh } from "../microsoft/expiry";
import {
  authorizeUrl,
  redirectUriFor,
  scopeSatisfied,
  type MicrosoftConfig,
} from "../microsoft/config";

const SECRET = "a-long-random-value-from-the-environment";

describe("token encryption", () => {
  it("round-trips a token", () => {
    const token = "0.AXoAdummy-refresh-token_value";
    expect(decryptToken(encryptToken(token, SECRET), SECRET)).toBe(token);
  });

  it("produces different ciphertext each time", () => {
    // A fresh IV per write, so two users with the same token don't look alike
    // in the table.
    const a = encryptToken("same", SECRET);
    const b = encryptToken("same", SECRET);
    expect(a).not.toBe(b);
    expect(decryptToken(a, SECRET)).toBe(decryptToken(b, SECRET));
  });

  it("refuses a tampered ciphertext rather than returning rubbish", () => {
    const encrypted = encryptToken("secret-token", SECRET);
    const [v, iv, tag, body] = encrypted.split(".");
    const flipped = body.startsWith("A") ? `B${body.slice(1)}` : `A${body.slice(1)}`;
    expect(() => decryptToken([v, iv, tag, flipped].join("."), SECRET)).toThrow();
  });

  it("refuses the wrong key", () => {
    expect(() => decryptToken(encryptToken("x", SECRET), "a-different-key")).toThrow();
  });

  it("refuses a value it doesn't recognise", () => {
    expect(() => decryptToken("not-encrypted-at-all", SECRET)).toThrow(/format/);
  });
});

describe("PKCE", () => {
  it("makes a verifier and a matching challenge, fresh each time", () => {
    const a = createPkcePair();
    const b = createPkcePair();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(a.verifier);
    // base64url: no padding or characters that would need escaping in a URL.
    expect(a.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(randomState()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("needsRefresh", () => {
  const now = new Date("2026-09-18T12:00:00Z");

  it("is false while there is comfortable time left", () => {
    expect(needsRefresh(new Date("2026-09-18T12:30:00Z"), now)).toBe(false);
  });

  it("is true inside the skew window, before it actually expires", () => {
    // Expires in 4 minutes; the skew is 5. Refresh now rather than fail
    // halfway through sending.
    expect(needsRefresh(new Date("2026-09-18T12:04:00Z"), now)).toBe(true);
  });

  it("is true once expired", () => {
    expect(needsRefresh(new Date("2026-09-18T11:00:00Z"), now)).toBe(true);
  });

  it("treats an unreadable expiry as expired", () => {
    expect(needsRefresh("not a date", now)).toBe(true);
  });

  it("accepts ISO strings", () => {
    expect(needsRefresh("2026-09-18T18:00:00Z", now)).toBe(false);
  });
});

describe("expiryFromSeconds", () => {
  it("lands an hour out for the usual token", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    expect(expiryFromSeconds(3600, now).toISOString()).toBe("2026-09-18T13:00:00.000Z");
  });

  it("never goes backwards", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    expect(expiryFromSeconds(-50, now).getTime()).toBe(now.getTime());
  });
});

describe("isConsentLost", () => {
  it("knows a dead refresh token from a bad day", () => {
    expect(isConsentLost({ error: "invalid_grant" })).toBe(true);
    expect(isConsentLost({ error: "interaction_required" })).toBe(true);
    // A server error is worth retrying and must not wipe the connection.
    expect(isConsentLost({ error: "temporarily_unavailable" })).toBe(false);
    expect(isConsentLost({ status: 500 })).toBe(false);
  });
});

describe("parseGraphInstant", () => {
  it("appends the zone Graph was asked to answer in", () => {
    expect(parseGraphInstant("2026-09-21T18:00:00.0000000", "UTC")?.toISOString()).toBe(
      "2026-09-21T18:00:00.000Z",
    );
  });

  it("leaves an explicit offset alone", () => {
    expect(parseGraphInstant("2026-09-21T12:00:00-06:00")?.toISOString()).toBe(
      "2026-09-21T18:00:00.000Z",
    );
  });

  it("returns null for nothing and for nonsense", () => {
    expect(parseGraphInstant(undefined)).toBeNull();
    expect(parseGraphInstant("never")).toBeNull();
  });
});

describe("busyBlocksFromSchedule", () => {
  const entry = (items: GraphScheduleEntry["scheduleItems"]): GraphScheduleEntry => ({
    scheduleId: "btoyn@im504.com",
    scheduleItems: items,
  });

  it("takes the blocks that would stop a lunch", () => {
    const blocks = busyBlocksFromSchedule([
      entry([
        {
          status: "busy",
          start: { dateTime: "2026-09-21T18:00:00.0000000", timeZone: "UTC" },
          end: { dateTime: "2026-09-21T19:00:00.0000000", timeZone: "UTC" },
        },
      ]),
    ]);
    expect(blocks).toEqual([
      { start: "2026-09-21T18:00:00.000Z", end: "2026-09-21T19:00:00.000Z" },
    ]);
  });

  it("counts tentative as busy", () => {
    // Pencilled in is not a slot to offer a partner.
    const blocks = busyBlocksFromSchedule([
      entry([
        {
          status: "tentative",
          start: { dateTime: "2026-09-21T18:00:00", timeZone: "UTC" },
          end: { dateTime: "2026-09-21T19:00:00", timeZone: "UTC" },
        },
      ]),
    ]);
    expect(blocks).toHaveLength(1);
  });

  it("ignores free and working-elsewhere", () => {
    const blocks = busyBlocksFromSchedule([
      entry([
        {
          status: "free",
          start: { dateTime: "2026-09-21T18:00:00", timeZone: "UTC" },
          end: { dateTime: "2026-09-21T19:00:00", timeZone: "UTC" },
        },
        {
          status: "workingElsewhere",
          start: { dateTime: "2026-09-21T20:00:00", timeZone: "UTC" },
          end: { dateTime: "2026-09-21T21:00:00", timeZone: "UTC" },
        },
      ]),
    ]);
    expect(blocks).toEqual([]);
  });

  it("drops a block with no end, or one that ends before it starts", () => {
    const blocks = busyBlocksFromSchedule([
      entry([
        { status: "busy", start: { dateTime: "2026-09-21T18:00:00", timeZone: "UTC" } },
        {
          status: "busy",
          start: { dateTime: "2026-09-21T19:00:00", timeZone: "UTC" },
          end: { dateTime: "2026-09-21T18:00:00", timeZone: "UTC" },
        },
      ]),
    ]);
    expect(blocks).toEqual([]);
  });

  it("yields nothing for an errored entry rather than an empty week", () => {
    // The caller is told separately. Reading "Microsoft didn't answer" as
    // "he's free all week" is the exact failure this integration prevents.
    const entries: GraphScheduleEntry[] = [
      { scheduleId: "btoyn@im504.com", error: { message: "Access denied" } },
    ];
    expect(busyBlocksFromSchedule(entries)).toEqual([]);
    expect(scheduleHadErrors(entries)).toBe(true);
  });
});

describe("mergeBusyBlocks", () => {
  it("merges overlapping and touching blocks", () => {
    const merged = mergeBusyBlocks([
      { start: "2026-09-21T18:00:00.000Z", end: "2026-09-21T19:00:00.000Z" },
      { start: "2026-09-21T18:30:00.000Z", end: "2026-09-21T20:00:00.000Z" },
      { start: "2026-09-21T20:00:00.000Z", end: "2026-09-21T21:00:00.000Z" },
    ]);
    expect(merged).toEqual([
      { start: "2026-09-21T18:00:00.000Z", end: "2026-09-21T21:00:00.000Z" },
    ]);
  });

  it("keeps a real gap", () => {
    const merged = mergeBusyBlocks([
      { start: "2026-09-21T18:00:00.000Z", end: "2026-09-21T19:00:00.000Z" },
      { start: "2026-09-22T18:00:00.000Z", end: "2026-09-22T19:00:00.000Z" },
    ]);
    expect(merged).toHaveLength(2);
  });

  it("does not swallow a block wholly inside another", () => {
    const merged = mergeBusyBlocks([
      { start: "2026-09-21T18:00:00.000Z", end: "2026-09-21T22:00:00.000Z" },
      { start: "2026-09-21T19:00:00.000Z", end: "2026-09-21T20:00:00.000Z" },
    ]);
    expect(merged).toEqual([
      { start: "2026-09-21T18:00:00.000Z", end: "2026-09-21T22:00:00.000Z" },
    ]);
  });

  it("handles an empty list", () => {
    expect(mergeBusyBlocks([])).toEqual([]);
  });
});

describe("authorizeUrl", () => {
  const config: MicrosoftConfig = {
    clientId: "client-123",
    clientSecret: "secret",
    tenant: "im504-tenant-id",
    encryptionKey: SECRET,
  };

  it("points at the right tenant and carries PKCE and state", () => {
    const url = new URL(
      authorizeUrl({
        config,
        redirectUri: redirectUriFor("https://north.example.com"),
        state: "state-abc",
        codeChallenge: "challenge-xyz",
      }),
    );

    expect(url.origin + url.pathname).toBe(
      "https://login.microsoftonline.com/im504-tenant-id/oauth2/v2.0/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("state")).toBe("state-abc");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-xyz");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://north.example.com/api/microsoft/callback",
    );
    // Without offline_access the connection dies in an hour.
    expect(url.searchParams.get("scope")).toContain("offline_access");
    expect(url.searchParams.get("scope")).toContain("Calendars.ReadWrite");
    // A work laptop is usually signed into two accounts.
    expect(url.searchParams.get("prompt")).toBe("select_account");
  });
});

describe("scopeSatisfied", () => {
  it("accepts the exact scope, whatever the casing Graph returns", () => {
    expect(scopeSatisfied(["Calendars.ReadWrite"], "Calendars.ReadWrite")).toBe(true);
    expect(scopeSatisfied(["calendars.readwrite"], "Calendars.ReadWrite")).toBe(true);
  });

  it("lets ReadWrite stand in for Read", () => {
    // The bug this exists to stop: free/busy asks for Calendars.Read, the app
    // only ever requests Calendars.ReadWrite, and an exact match would tell
    // someone who granted everything that they had granted nothing.
    expect(scopeSatisfied(["Calendars.ReadWrite"], "Calendars.Read")).toBe(true);
    expect(scopeSatisfied(["Mail.ReadWrite"], "Mail.Read")).toBe(true);
  });

  it("does not let Read stand in for ReadWrite", () => {
    expect(scopeSatisfied(["Calendars.Read"], "Calendars.ReadWrite")).toBe(false);
  });

  it("keeps unrelated scopes apart", () => {
    // Mail.Send is not implied by anything — a tenant can grant drafting and
    // withhold sending, and that has to keep showing as withheld.
    expect(scopeSatisfied(["Mail.ReadWrite"], "Mail.Send")).toBe(false);
    expect(scopeSatisfied(["Calendars.ReadWrite"], "Mail.Read")).toBe(false);
    expect(scopeSatisfied([], "Calendars.Read")).toBe(false);
  });
});

describe("parseGraphInstant, utcOnly", () => {
  it("reads a UTC answer either way it is written", () => {
    expect(parseGraphInstant("2026-10-05T18:00:00.0000000Z", "UTC", { utcOnly: true })).toEqual(
      new Date("2026-10-05T18:00:00Z"),
    );
    expect(parseGraphInstant("2026-10-05T18:00:00.0000000", "UTC", { utcOnly: true })).toEqual(
      new Date("2026-10-05T18:00:00Z"),
    );
  });

  // The one that would move his lunch. A naive time in a named zone has no
  // offset, so `new Date` reads it as the server's clock: noon Mountain would
  // be written back as noon UTC, which is 6am to him.
  it("refuses a naive time in a named zone rather than guessing", () => {
    expect(
      parseGraphInstant("2026-10-05T12:00:00.0000000", "Mountain Standard Time", {
        utcOnly: true,
      }),
    ).toBeNull();
  });

  it("still accepts one that carries its own offset", () => {
    expect(
      parseGraphInstant("2026-10-05T12:00:00-06:00", "Mountain Standard Time", { utcOnly: true }),
    ).toEqual(new Date("2026-10-05T18:00:00Z"));
  });

  it("leaves the free/busy reading alone", () => {
    expect(parseGraphInstant("2026-10-05T12:00:00", "Mountain Standard Time")).not.toBeNull();
  });
});
