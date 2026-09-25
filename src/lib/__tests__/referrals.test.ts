import { describe, expect, it } from "vitest";
import {
  dedupeReferrals,
  describeReferrals,
  loanOutcome,
  lookOutcome,
  rankReferrers,
  tallyReferrals,
  type Referral,
} from "../referrals";

const look = (id: string, lenderId: string, outcome: Referral["outcome"]): Referral => ({
  id,
  lenderId,
  kind: "look",
  outcome,
});

const loan = (
  id: string,
  lenderId: string,
  outcome: Referral["outcome"],
  fromLookId?: string,
): Referral => ({ id, lenderId, kind: "loan", outcome, fromLookId });

describe("outcome mapping", () => {
  it("reads a look's column", () => {
    expect(lookOutcome("became_loan")).toBe("funded");
    expect(lookOutcome("went_nowhere")).toBe("died");
    expect(lookOutcome("new")).toBe("open");
    expect(lookOutcome("followed_up")).toBe("open");
  });

  it("reads a loan's closing outcome", () => {
    expect(loanOutcome("sba_approved")).toBe("funded");
    // The retired value must not quietly keep counting as a win.
    expect(loanOutcome("sent_to_closing")).toBe("open");
    expect(loanOutcome("did_not_happen")).toBe("died");
    expect(loanOutcome(null)).toBe("open");
  });
});

describe("credit survives the deal dying", () => {
  it("still counts a loan that fell apart", () => {
    const tally = tallyReferrals([loan("l1", "dave", "died")]);
    expect(tally.get("dave")).toMatchObject({ total: 1, died: 1, funded: 0, open: 0 });
  });

  it("counts three dead deals as three referrals", () => {
    // The point of the whole file: a partner who sent three that all collapsed
    // still sent three.
    const tally = tallyReferrals([
      loan("l1", "dave", "died"),
      loan("l2", "dave", "died"),
      loan("l3", "dave", "died"),
    ]);
    expect(tally.get("dave")!.total).toBe(3);
  });

  it("counts a look that went nowhere too", () => {
    const tally = tallyReferrals([look("o1", "mike", "died")]);
    expect(tally.get("mike")).toMatchObject({ total: 1, died: 1 });
  });
});

describe("dedupeReferrals", () => {
  it("counts a loan and the look it grew from as one deal", () => {
    const rows = [look("o1", "dave", "funded"), loan("l1", "dave", "died", "o1")];
    expect(dedupeReferrals(rows).map((r) => r.id)).toEqual(["l1"]);
    expect(tallyReferrals(rows).get("dave")).toMatchObject({ total: 1, died: 1, funded: 0 });
  });

  it("keeps a look that never became a loan", () => {
    const rows = [look("o1", "dave", "open"), loan("l1", "dave", "open")];
    expect(dedupeReferrals(rows)).toHaveLength(2);
    expect(tallyReferrals(rows).get("dave")!.total).toBe(2);
  });

  it("lets the loan's ending win over the look's", () => {
    // The look only knows it turned into something; the loan knows it died.
    const rows = [look("o1", "dave", "funded"), loan("l1", "dave", "died", "o1")];
    expect(tallyReferrals(rows).get("dave")).toMatchObject({ funded: 0, died: 1 });
  });
});

describe("tallyReferrals", () => {
  it("splits a partner's deals by what became of them", () => {
    const tally = tallyReferrals([
      loan("l1", "dave", "funded"),
      loan("l2", "dave", "died"),
      look("o1", "dave", "open"),
      look("o2", "mike", "funded"),
    ]);
    expect(tally.get("dave")).toMatchObject({ total: 3, funded: 1, died: 1, open: 1 });
    expect(tally.get("mike")).toMatchObject({ total: 1, funded: 1 });
  });

  it("ignores a deal with no partner on it", () => {
    const orphan: Referral = { id: "l1", lenderId: null, kind: "loan", outcome: "died" };
    expect(tallyReferrals([orphan]).size).toBe(0);
  });
});

describe("rankReferrers", () => {
  const names: Record<string, string> = { dave: "Dave Wright", mike: "Mike Chen", sara: "Sara Diaz" };

  it("ranks by how much they brought, not by how much funded", () => {
    const ranked = rankReferrers(
      [
        loan("l1", "dave", "died"),
        loan("l2", "dave", "died"),
        loan("l3", "mike", "funded"),
      ],
      (id) => names[id] ?? null,
    );
    expect(ranked.map((r) => r.name)).toEqual(["Dave Wright", "Mike Chen"]);
    expect(ranked[0]).toMatchObject({ total: 2, died: 2 });
  });

  it("breaks a tie on how many funded", () => {
    const ranked = rankReferrers(
      [loan("l1", "dave", "died"), loan("l2", "mike", "funded")],
      (id) => names[id] ?? null,
    );
    expect(ranked[0].name).toBe("Mike Chen");
  });

  it("honours the limit", () => {
    const ranked = rankReferrers(
      [loan("l1", "dave", "died"), loan("l2", "mike", "died"), loan("l3", "sara", "died")],
      (id) => names[id] ?? null,
      2,
    );
    expect(ranked).toHaveLength(2);
  });
});

describe("describeReferrals", () => {
  it("leads with the total and then says what happened", () => {
    expect(
      describeReferrals({ lenderId: "dave", total: 4, funded: 1, died: 1, open: 2 }),
    ).toBe("4 referred · 1 funded · 2 in play · 1 died");
  });

  it("says the dead ones out loud rather than hiding them", () => {
    expect(describeReferrals({ lenderId: "dave", total: 2, funded: 0, died: 2, open: 0 })).toBe(
      "2 referred · 2 died",
    );
  });

  it("handles a partner who hasn't sent anything", () => {
    expect(describeReferrals(undefined)).toBe("None yet");
    expect(describeReferrals({ lenderId: "dave", total: 0, funded: 0, died: 0, open: 0 })).toBe(
      "None yet",
    );
  });
});
