import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { daysBetween, lookState, readLookStatus } from "@/lib/looks";
import { loanOutcome, lookOutcome, rankReferrers, type Referral } from "@/lib/referrals";
import { PipelineBoard, type LookLender, type LookRow } from "./pipeline-board";

export const metadata = { title: "Pipeline" };

/**
 * Every possible deal a partner has raised, and how far it got.
 *
 * This is the closest thing the app has to an outcome measure: a partner who
 * keeps reaching out is a relationship that works, and one who never does is a
 * lunch habit. The board shows both — what's moving, and who it came from.
 */
export default async function PipelinePage() {
  const supabase = await createClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [{ data: looks }, { data: lenders }, { data: loans }] = await Promise.all([
    supabase
      .from("opportunities")
      .select(
        "id, borrower_name, notes, stage, look_status, received_at, next_follow_up_at, last_activity_at, follow_up_attempt_count, dormant_reason, lender:lenders(id, full_name, institution:institutions(name))",
      )
      .is("deleted_at", null)
      .order("next_follow_up_at", { nullsFirst: false }),
    supabase
      .from("lenders")
      .select("id, full_name, institution:institutions(name)")
      .is("deleted_at", null)
      .eq("active", true)
      .order("full_name"),
    // Loans count as referrals too — most deals arrive already real enough to
    // track weekly and never pass through a logged look.
    supabase
      .from("active_loans")
      .select("id, lender_id, opportunity_id, closing_outcome, lender:lenders(full_name)")
      .is("deleted_at", null),
  ]);

  const rows: LookRow[] = (looks ?? []).map((o) => {
    const lender = o.lender as unknown as {
      id: string;
      full_name: string;
      institution: { name: string } | null;
    } | null;

    const due = o.next_follow_up_at ? new Date(`${o.next_follow_up_at}T00:00:00`) : null;
    const daysLate = due === null ? 0 : daysBetween(due, today);

    return {
      id: o.id,
      borrowerName: o.borrower_name,
      notes: o.notes,
      stage: o.stage,
      status: readLookStatus(o.look_status),
      receivedAt: o.received_at,
      lenderId: lender?.id ?? null,
      lenderName: lender?.full_name ?? null,
      institution: lender?.institution?.name ?? null,
      attempts: o.follow_up_attempt_count ?? 0,
      dormantReason: o.dormant_reason,
      daysLate: Math.max(0, daysLate),
      state: lookState(o.stage, daysLate),
    };
  });

  const lenderOptions: LookLender[] = (lenders ?? []).map((l) => ({
    id: l.id,
    name: l.full_name,
    institution: (l.institution as unknown as { name: string } | null)?.name ?? null,
  }));

  /* Who is actually reaching out — the count the original plan called the one
     number worth measuring. Looks and loans both count, and a deal that died
     counts the same as one that funded: it was still handed to you. */
  const names = new Map<string, string>();
  const referrals: Referral[] = [];

  for (const row of rows) {
    if (!row.lenderId) continue;
    if (row.lenderName) names.set(row.lenderId, row.lenderName);
    referrals.push({
      id: row.id,
      lenderId: row.lenderId,
      kind: "look",
      outcome: lookOutcome(row.status),
    });
  }

  for (const l of loans ?? []) {
    if (!l.lender_id) continue;
    const lender = l.lender as unknown as { full_name: string } | null;
    if (lender?.full_name) names.set(l.lender_id, lender.full_name);
    referrals.push({
      id: l.id,
      lenderId: l.lender_id,
      kind: "loan",
      outcome: loanOutcome(l.closing_outcome),
      fromLookId: l.opportunity_id,
    });
  }

  const topLenders = rankReferrers(referrals, (id) => names.get(id) ?? null).map((r) => ({
    id: r.lenderId,
    name: r.name,
    count: r.total,
    funded: r.funded,
    died: r.died,
  }));

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Every time a partner brought up a possible deal — a real referral, a question, or a maybe. Drag a card as it moves."
      />
      <PipelineBoard rows={rows} lenders={lenderOptions} topLenders={topLenders} />
    </>
  );
}
