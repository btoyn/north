"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { isLoanOutcome, type LoanOutcome } from "@/lib/loans";

/**
 * Active loans, kept deliberately thin (spec §26, "keep this lightweight").
 *
 * A loan record here exists for one reason: to know who is owed their weekly
 * update. It is not a pipeline. No amounts, no stages, no milestones — that
 * lives in the system that already tracks production, and a second half-kept
 * copy would only ever be the wrong one.
 */

const WEEK_MS = 7 * 86_400_000;

export async function createLoan(input: {
  borrowerName: string;
  lenderId: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const borrower = input.borrowerName.trim();
  if (!borrower) return { error: "Who's the borrower?" };
  if (!input.lenderId) return { error: "Pick the partner who sent it over." };

  const { data: lender } = await supabase
    .from("lenders")
    .select("id, institution_id")
    .eq("id", input.lenderId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!lender) return { error: "Partner not found." };

  // Due immediately: a loan you just started tracking is one you owe an update
  // on, not one that gets a week's grace.
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("active_loans")
    .insert({
      user_id: user.id,
      lender_id: lender.id,
      institution_id: lender.institution_id,
      borrower_name: borrower,
      updates_active: true,
      next_update_due_at: today,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not save the loan." };

  await logAudit(supabase, user.id, {
    entityType: "active_loan",
    entityId: data.id,
    action: "create",
    newValue: { borrowerName: borrower, lenderId: lender.id },
  });

  revalidatePath("/loans");
  revalidatePath("/dashboard");
  return {};
}

/**
 * Stops the weekly clock, recording which of the two endings it was.
 *
 * Two buttons rather than one generic "done" because the difference matters:
 * how many of these reached SBA approval is the only outcome number this
 * screen can honestly report, and a deal that died is not the same as a win.
 *
 * `approval` carries the date and amount when the ending is an approval. The
 * date arrives as a wall-clock `YYYY-MM-DD` from the browser, because which
 * day an approval landed on is a calendar fact, not an instant.
 */
export async function closeLoan(
  loanId: string,
  outcome: LoanOutcome,
  approval?: { approvedOn?: string | null; amount?: number | null },
): Promise<{ error?: string }> {
  if (!isLoanOutcome(outcome)) return { error: "Unknown outcome." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("active_loans")
    .update({
      updates_active: false,
      next_update_due_at: null,
      closing_outcome: outcome,
      ...(outcome === "sba_approved"
        ? {
            stage: "sba_approved",
            sba_approval_date: approval?.approvedOn ?? null,
            approved_sba_amount: approval?.amount ?? null,
          }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", loanId);
  if (error) return { error: error.message };
  revalidatePath("/loans");
  revalidatePath("/dashboard");
  return {};
}

/**
 * Fills in an approval amount that was skipped at the time.
 *
 * Approving in one tap matters more than approving completely, so the amount
 * can arrive later from the Approved tab.
 */
export async function setApprovedAmount(
  loanId: string,
  amount: number | null,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("active_loans")
    .update({ approved_sba_amount: amount, updated_at: new Date().toISOString() })
    .eq("id", loanId)
    .eq("closing_outcome", "sba_approved");
  if (error) return { error: error.message };
  revalidatePath("/loans");
  return {};
}

export async function reopenLoan(loanId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("active_loans")
    .update({
      updates_active: true,
      next_update_due_at: new Date().toISOString().slice(0, 10),
      closing_outcome: null,
      // The approval goes with the outcome. A reopened loan that kept its
      // approval date would count as a win and still be asking for updates.
      sba_approval_date: null,
      approved_sba_amount: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", loanId);
  if (error) return { error: error.message };
  revalidatePath("/loans");
  revalidatePath("/dashboard");
  return {};
}

/** Removes a loan added by mistake. Soft — Trash holds it for 90 days. */
export async function deleteLoan(loanId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("active_loans")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", loanId);
  if (error) return { error: error.message };

  await logAudit(supabase, user.id, {
    entityType: "active_loan",
    entityId: loanId,
    action: "soft_delete",
    undoAvailable: true,
  });

  revalidatePath("/loans");
  revalidatePath("/dashboard");
  return {};
}

export interface DraftContext {
  lenderName: string | null;
  lenderEmail: string | null;
  borrowerName: string;
  borrowerEmail: string | null;
  signature: string | null;
  /** Last week's email, or null the first time round. */
  lastBody: string | null;
}

/**
 * Everything needed to open this week's draft.
 *
 * The body is deliberately not composed here — the first draft and the dated
 * subject are built in the browser, because the date has to be the user's local
 * one and composing on the server would make "today" the server's idea of it.
 */
export async function getDraftContext(
  loanId: string,
): Promise<{ context?: DraftContext; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const [{ data: loan }, { data: profile }] = await Promise.all([
    supabase
      .from("active_loans")
      .select(
        "id, borrower_name, last_update_body, lender:lenders(full_name, email), recipients:active_loan_recipients(recipient_type, email)",
      )
      .eq("id", loanId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("users").select("email_signature").eq("id", user.id).maybeSingle(),
  ]);

  if (!loan) return { error: "That loan is no longer being tracked." };

  const lender = loan.lender as unknown as { full_name: string; email: string | null } | null;
  const recipients = (loan.recipients ?? []) as unknown as {
    recipient_type: string;
    email: string | null;
  }[];
  const borrower = recipients.find((r) => r.recipient_type === "borrower");

  return {
    context: {
      lenderName: lender?.full_name ?? null,
      lenderEmail: lender?.email ?? null,
      borrowerName: loan.borrower_name,
      borrowerEmail: borrower?.email ?? null,
      signature: profile?.email_signature ?? null,
      lastBody: loan.last_update_body,
    },
  };
}

/**
 * Saves the borrower's address against the loan so it is typed once, not every
 * week. Whether they actually receive a given week's update is a separate,
 * per-send decision.
 */
export async function saveBorrowerEmail(
  loanId: string,
  email: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const address = email.trim();
  const { data: existing } = await supabase
    .from("active_loan_recipients")
    .select("id")
    .eq("active_loan_id", loanId)
    .eq("recipient_type", "borrower")
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("active_loan_recipients")
        .update({ email: address || null })
        .eq("id", existing.id)
    : await supabase.from("active_loan_recipients").insert({
        user_id: user.id,
        active_loan_id: loanId,
        recipient_type: "borrower",
        email: address || null,
        receives_updates: false,
      });

  if (error) return { error: error.message };
  revalidatePath("/loans");
  return {};
}

/**
 * Records that this week's update went out, and keeps the text.
 *
 * Called when the Outlook draft is opened, which is the closest the app can get
 * to knowing — it cannot see the send. The trade was made deliberately: one
 * click, and an abandoned draft counts as sent. The body is stored so next week
 * opens with it rather than a blank page.
 */
export async function recordUpdateSent(input: {
  loanId: string;
  body: string;
  toBorrower: boolean;
  /** True for the approval email, which is the last one — no next week. */
  closing?: boolean;
  /** Wall-clock `YYYY-MM-DD` the approval landed on, from the browser. */
  approvedOn?: string | null;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: loan } = await supabase
    .from("active_loans")
    .select("id, lender_id, institution_id, borrower_name")
    .eq("id", input.loanId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!loan) return { error: "That loan is no longer being tracked." };

  const now = new Date();
  const nextDue = new Date(now.getTime() + WEEK_MS).toISOString().slice(0, 10);

  const { error } = await supabase
    .from("active_loans")
    .update({
      last_update_sent_at: now.toISOString(),
      last_update_body: input.body,
      updated_at: now.toISOString(),
      // The handoff email ends the cadence in the same click that sends it.
      ...(input.closing
        ? {
            updates_active: false,
            next_update_due_at: null,
            closing_outcome: "sba_approved",
            stage: "sba_approved",
            sba_approval_date: input.approvedOn ?? null,
          }
        : { next_update_due_at: nextDue }),
    })
    .eq("id", input.loanId);
  if (error) return { error: error.message };

  if (loan.lender_id) {
    const who = input.toBorrower ? "the partner and the borrower" : "the partner";
    await supabase.from("activities").insert({
      user_id: user.id,
      lender_id: loan.lender_id,
      institution_id: loan.institution_id,
      active_loan_id: loan.id,
      activity_type: "loan_update",
      direction: "outbound",
      occurred_at: now.toISOString(),
      subject: input.closing
        ? `SBA approved — ${loan.borrower_name}`
        : `Weekly update — ${loan.borrower_name}`,
      summary: `Emailed ${who}.`,
      details: input.body,
      personal_touch: true,
      counts_for_coverage: true,
      source: "manual",
    });
  }

  revalidatePath("/loans");
  revalidatePath("/dashboard");
  revalidatePath("/follow-ups");
  return {};
}

/**
 * Records that the referring partner was brought up to date.
 *
 * The note is optional but worth typing: it becomes the timeline entry, so in
 * six weeks "what did I last tell Marcus about the Cedar Ridge deal" has an
 * answer. It's also the raw material AI drafting would work from later.
 */
export async function logLoanUpdate(
  loanId: string,
  note?: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: loan } = await supabase
    .from("active_loans")
    .select("id, lender_id, institution_id, borrower_name")
    .eq("id", loanId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!loan) return { error: "That loan is no longer being tracked." };

  const now = new Date();
  const nextDue = new Date(now.getTime() + WEEK_MS).toISOString().slice(0, 10);

  const { error } = await supabase
    .from("active_loans")
    .update({
      last_update_sent_at: now.toISOString(),
      next_update_due_at: nextDue,
      updated_at: now.toISOString(),
    })
    .eq("id", loanId);
  if (error) return { error: error.message };

  // Keeping a referral partner informed is a real touch, so it lands on their
  // timeline and resets their coverage clock too (§9).
  if (loan.lender_id) {
    await supabase.from("activities").insert({
      user_id: user.id,
      lender_id: loan.lender_id,
      institution_id: loan.institution_id,
      active_loan_id: loan.id,
      activity_type: "loan_update",
      direction: "outbound",
      occurred_at: now.toISOString(),
      subject: `Weekly update — ${loan.borrower_name}`,
      summary: note?.trim() || null,
      personal_touch: true,
      counts_for_coverage: true,
      source: "manual",
    });
  }

  revalidatePath("/loans");
  revalidatePath("/dashboard");
  revalidatePath("/follow-ups");
  return {};
}
