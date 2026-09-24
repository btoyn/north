"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { LOOK_STAGE, followUpDate, isLookStatus, stageForStatus, type LookStatus } from "@/lib/looks";

/**
 * Looks from lenders.
 *
 * The point of a look is the follow-up, not the record. So logging one asks for
 * as little as possible — who mentioned it and what they said — and everything
 * else (borrower name, when to circle back) is either optional or defaulted.
 * A form that takes thirty seconds is a form nobody fills in from the car.
 */

const DEFAULT_FOLLOW_UP_DAYS = 3;

async function followUpInterval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<number> {
  const { data } = await supabase
    .from("user_preferences")
    .select("look_follow_up_days")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.look_follow_up_days ?? DEFAULT_FOLLOW_UP_DAYS;
}

export async function logLook(input: {
  lenderId: string;
  notes: string;
  borrowerName?: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const notes = input.notes.trim();
  if (!input.lenderId) return { error: "Who brought it up?" };
  if (!notes) return { error: "What did they ask about?" };

  const { data: lender } = await supabase
    .from("lenders")
    .select("id, institution_id, full_name")
    .eq("id", input.lenderId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!lender) return { error: "Lender not found." };

  const now = new Date();
  const days = await followUpInterval(supabase, user.id);

  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      user_id: user.id,
      lender_id: lender.id,
      institution_id: lender.institution_id,
      borrower_name: input.borrowerName?.trim() || null,
      notes,
      communication_path: "lender_led",
      stage: LOOK_STAGE.open,
      look_status: "new",
      received_at: followUpDate(now, 0),
      last_activity_at: now.toISOString(),
      next_follow_up_at: followUpDate(now, days),
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not save the look." };

  // A lender raising a deal is contact, and inbound contact at that — so it
  // lands on their timeline and resets their coverage clock (§9). Otherwise
  // someone who just handed you business shows as needing attention tomorrow.
  await supabase.from("activities").insert({
    user_id: user.id,
    lender_id: lender.id,
    institution_id: lender.institution_id,
    opportunity_id: data.id,
    activity_type: "deal_conversation",
    direction: "inbound",
    occurred_at: now.toISOString(),
    subject: input.borrowerName?.trim() || "Possible deal",
    summary: notes,
    personal_touch: true,
    initiated_by_lender: true,
    counts_for_coverage: true,
    source: "manual",
  });

  await logAudit(supabase, user.id, {
    entityType: "opportunity",
    entityId: data.id,
    action: "create",
    newValue: { lenderId: lender.id, borrowerName: input.borrowerName?.trim() || null },
  });

  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  revalidatePath(`/lenders/${lender.id}`);
  return {};
}

/**
 * Moves a look to another column.
 *
 * One verb for the whole board, because the board offers one gesture. It also
 * carries the things a column change implies: the follow-up clock stops when a
 * look closes and restarts when it reopens, and arriving in "Followed up" logs
 * the touch on the lender's timeline — circling back on a deal is contact, and
 * not counting it would show someone as neglected the week you spoke to them.
 */
export async function moveLook(
  lookId: string,
  status: LookStatus,
  /** What you told them, or why it died. Optional either way. */
  note?: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!isLookStatus(status)) return { error: "That isn't a column." };

  const { data: look } = await supabase
    .from("opportunities")
    .select(
      "id, lender_id, institution_id, borrower_name, follow_up_attempt_count, look_status",
    )
    .eq("id", lookId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!look) return { error: "That look is no longer here." };
  if (look.look_status === status && !note?.trim()) return {};

  const now = new Date();
  const stage = stageForStatus(status);
  const closing = status === "became_loan" || status === "went_nowhere";
  const days = closing ? 0 : await followUpInterval(supabase, user.id);
  // Only a fresh arrival in the column counts as another attempt; nudging the
  // same card twice is not two follow-ups.
  const arriving = look.look_status !== status;

  const { error } = await supabase
    .from("opportunities")
    .update({
      look_status: status,
      stage,
      next_follow_up_at: closing ? null : followUpDate(now, days),
      last_activity_at: now.toISOString(),
      follow_up_attempt_count:
        status === "followed_up" && arriving
          ? (look.follow_up_attempt_count ?? 0) + 1
          : look.follow_up_attempt_count,
      dormant_reason: status === "went_nowhere" ? note?.trim() || null : null,
      preflight_handoff_date: status === "became_loan" ? followUpDate(now, 0) : null,
      updated_at: now.toISOString(),
    })
    .eq("id", lookId);
  if (error) return { error: error.message };

  if (status === "followed_up" && arriving && look.lender_id) {
    await supabase.from("activities").insert({
      user_id: user.id,
      lender_id: look.lender_id,
      institution_id: look.institution_id,
      opportunity_id: look.id,
      activity_type: "deal_conversation",
      direction: "outbound",
      occurred_at: now.toISOString(),
      subject: look.borrower_name
        ? `Followed up — ${look.borrower_name}`
        : "Followed up on a look",
      summary: note?.trim() || null,
      personal_touch: true,
      counts_for_coverage: true,
      source: "manual",
    });
  }

  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  revalidatePath("/tiers", "layout");
  if (look.lender_id) revalidatePath(`/lenders/${look.lender_id}`);
  return {};
}

/** Removes a look logged by mistake. Soft — Trash holds it for 90 days. */
export async function deleteLook(lookId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("opportunities")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", lookId);
  if (error) return { error: error.message };

  await logAudit(supabase, user.id, {
    entityType: "opportunity",
    entityId: lookId,
    action: "soft_delete",
    undoAvailable: true,
  });

  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return {};
}
