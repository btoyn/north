/**
 * Who actually sends you business.
 *
 * A referral is a partner handing you a deal. Whether it funded, died, or is
 * still in the air changes what happened to the deal — it does not change the
 * fact that they brought it. So the count of referrals never goes down. A
 * partner who sent three that all fell apart still sent three, and a screen that
 * quietly forgets them is telling you the relationship produces nothing when it
 * has produced three times.
 *
 * Referrals arrive two ways and both count:
 *   - a **look**, logged the moment a partner mentions a possible deal;
 *   - a **loan**, added straight onto Loan updates when a deal shows up
 *     already real enough to be tracked weekly.
 *
 * A loan that came from a look carries that look's id, and the two are one
 * deal, counted once.
 */

export type ReferralOutcome = "open" | "funded" | "died";

export interface Referral {
  /** The look's or loan's own id. */
  id: string;
  lenderId: string | null;
  kind: "look" | "loan";
  outcome: ReferralOutcome;
  /** On a loan: the look it grew out of, when there was one. */
  fromLookId?: string | null;
}

export interface ReferralTally {
  lenderId: string;
  /** Every deal they brought, whatever became of it. This is the credit. */
  total: number;
  funded: number;
  died: number;
  open: number;
}

/** A look's stored stage, as the outcome a referral count cares about. */
export function lookOutcome(status: string): ReferralOutcome {
  if (status === "became_loan") return "funded";
  if (status === "went_nowhere") return "died";
  return "open";
}

/**
 * A loan's closing outcome, same mapping.
 *
 * `sba_approved` is the win: approval is the finish line he works towards, and
 * what the closing department does afterwards is not his to report on.
 */
export function loanOutcome(closingOutcome: string | null): ReferralOutcome {
  if (closingOutcome === "sba_approved") return "funded";
  if (closingOutcome === "did_not_happen") return "died";
  return "open";
}

/**
 * One deal per row, with the look folded into the loan it became.
 *
 * The loan wins that merge because it knows the later half of the story: the
 * look can only say "this turned into something", while the loan knows whether
 * the something closed or collapsed.
 */
export function dedupeReferrals(referrals: Referral[]): Referral[] {
  const supersededLooks = new Set(
    referrals
      .filter((r) => r.kind === "loan" && r.fromLookId)
      .map((r) => r.fromLookId as string),
  );
  return referrals.filter((r) => !(r.kind === "look" && supersededLooks.has(r.id)));
}

/** Per partner: how many they brought, and how those ended. */
export function tallyReferrals(referrals: Referral[]): Map<string, ReferralTally> {
  const byLender = new Map<string, ReferralTally>();

  for (const referral of dedupeReferrals(referrals)) {
    if (!referral.lenderId) continue;
    const tally = byLender.get(referral.lenderId) ?? {
      lenderId: referral.lenderId,
      total: 0,
      funded: 0,
      died: 0,
      open: 0,
    };
    tally.total += 1;
    tally[referral.outcome] += 1;
    byLender.set(referral.lenderId, tally);
  }

  return byLender;
}

/** Partners ranked by how much they've brought you, most first. */
export function rankReferrers(
  referrals: Referral[],
  nameOf: (lenderId: string) => string | null,
  limit = 5,
): (ReferralTally & { name: string })[] {
  return [...tallyReferrals(referrals).values()]
    .map((t) => ({ ...t, name: nameOf(t.lenderId) ?? "Unknown" }))
    .sort((a, b) => b.total - a.total || b.funded - a.funded || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * "4 referred · 1 funded · 1 died" — the whole story in one line.
 *
 * The total leads because it is the number that says whether this relationship
 * produces. The breakdown follows because "three died" and "three funded" are
 * very different partners, and neither is "nothing".
 */
export function describeReferrals(tally: ReferralTally | undefined): string {
  if (!tally || tally.total === 0) return "None yet";

  const parts = [`${tally.total} referred`];
  if (tally.funded > 0) parts.push(`${tally.funded} funded`);
  if (tally.open > 0) parts.push(`${tally.open} in play`);
  if (tally.died > 0) parts.push(`${tally.died} died`);
  return parts.join(" · ");
}
