"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { COVERAGE_ACTIVITY_TYPES, isPersonalTouch } from "@/lib/coverage";

export interface LogActivityInput {
  lenderId: string;
  activityType: string;
  direction?: string;
  occurredAt?: string;
  subject?: string;
  summary?: string;
  initiatedByLender?: boolean;
}

/** Log a touch on the unified timeline (spec §8). Coverage flags derive from
 *  the §9 rules so screens never re-derive them inconsistently. */
export async function logActivity(
  input: LogActivityInput,
): Promise<{ activityId?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: lender } = await supabase
    .from("lenders")
    .select("institution_id")
    .eq("id", input.lenderId)
    .single();

  const { data: inserted, error } = await supabase
    .from("activities")
    .insert({
      user_id: user.id,
      lender_id: input.lenderId,
      institution_id: lender?.institution_id ?? null,
      activity_type: input.activityType,
      direction: input.direction ?? (input.initiatedByLender ? "inbound" : "outbound"),
      occurred_at: input.occurredAt
        ? new Date(input.occurredAt).toISOString()
        : new Date().toISOString(),
      subject: input.subject?.trim() || null,
      summary: input.summary?.trim() || null,
      personal_touch: isPersonalTouch(input.activityType),
      counts_for_coverage: COVERAGE_ACTIVITY_TYPES.has(input.activityType),
      initiated_by_lender: input.initiatedByLender ?? false,
      source: "manual",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // Reaching out closes the loop on this week's plan, so the dashboard's
  // weekly progress bar reflects real work rather than manual ticking (§6).
  if (isPersonalTouch(input.activityType)) {
    const { data: plan } = await supabase
      .from("weekly_relationship_plans")
      .select("id")
      .eq("week_start", currentWeekStart())
      .maybeSingle();

    if (plan) {
      await supabase
        .from("weekly_relationship_plan_items")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("plan_id", plan.id)
        .eq("lender_id", input.lenderId)
        .eq("status", "open");
    }
  }

  revalidatePath(`/lenders/${input.lenderId}`);
  revalidatePath("/spheres", "layout");
  revalidatePath("/dashboard");
  return { activityId: inserted.id };
}

/** Monday of the current week, matching the weekly plan key. */
function currentWeekStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

/**
 * One round-trip for the quick-log sheet: the touch, plus an optional promise
 * caught in the same breath — "I said I'd send the comparison sheet" is far
 * more reliable recorded now than remembered later.
 */
export async function quickLogTouch(input: {
  lenderId: string;
  activityType: string;
  occurredAt?: string;
  summary?: string;
  initiatedByLender?: boolean;
  promise?: {
    direction: "i_promised" | "they_promised";
    description: string;
    dueAt?: string;
  };
}): Promise<{ activityId?: string; error?: string }> {
  if (!input.lenderId) return { error: "Pick a lender first." };

  const logged = await logActivity({
    lenderId: input.lenderId,
    activityType: input.activityType,
    occurredAt: input.occurredAt,
    summary: input.summary,
    initiatedByLender: input.initiatedByLender,
  });
  if (logged.error) return logged;

  if (input.promise?.description.trim()) {
    const promised = await addPromise({
      lenderId: input.lenderId,
      direction: input.promise.direction,
      description: input.promise.description,
      dueAt: input.promise.dueAt,
    });
    // The touch is already saved, so surface the promise failure without
    // pretending the whole thing failed.
    if (promised.error) {
      return {
        activityId: logged.activityId,
        error: `Touch saved, but the promise didn't: ${promised.error}`,
      };
    }
  }

  return { activityId: logged.activityId };
}

/**
 * Takes back a touch that was logged by tapping the wrong thing.
 *
 * The two-tap path commits the moment a kind is chosen, which is the whole
 * point of it, so the mis-tap has to be recoverable or the speed is bought
 * with a worse problem. Soft delete, like every other removal here — Trash
 * holds it.
 */
export async function undoQuickLog(activityId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: activity } = await supabase
    .from("activities")
    .select("lender_id, activity_type, occurred_at")
    .eq("id", activityId)
    .single();

  const { error } = await supabase
    .from("activities")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", activityId);
  if (error) return { error: error.message };

  // logActivity ticks this week's plan item when a personal touch lands, so undo
  // has to untick it — but only if nothing else this week still covers the
  // lender, or a real touch gets erased along with the mis-tap.
  if (activity && isPersonalTouch(activity.activity_type)) {
    const weekStart = currentWeekStart();
    const { count } = await supabase
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("lender_id", activity.lender_id)
      .in("activity_type", [...COVERAGE_ACTIVITY_TYPES].filter(isPersonalTouch))
      .gte("occurred_at", new Date(`${weekStart}T00:00:00`).toISOString())
      .is("deleted_at", null);

    if (!count) {
      const { data: plan } = await supabase
        .from("weekly_relationship_plans")
        .select("id")
        .eq("week_start", weekStart)
        .maybeSingle();
      if (plan) {
        await supabase
          .from("weekly_relationship_plan_items")
          .update({ status: "open", completed_at: null })
          .eq("plan_id", plan.id)
          .eq("lender_id", activity.lender_id)
          .eq("status", "completed");
      }
    }
  }

  // The touch could have moved coverage, the weekly plan, and a lender page at
  // once. Undo is rare enough that the blunt instrument is the right one.
  revalidatePath("/", "layout");
  return {};
}

export async function addPromise(input: {
  lenderId: string;
  direction: "i_promised" | "they_promised";
  description: string;
  dueAt?: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!input.description.trim()) return { error: "Describe the promise." };

  const { error } = await supabase.from("promises").insert({
    user_id: user.id,
    lender_id: input.lenderId,
    direction: input.direction,
    description: input.description.trim(),
    due_at: input.dueAt || null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/lenders/${input.lenderId}`);
  revalidatePath("/follow-ups");
  revalidatePath("/dashboard");
  return {};
}

export async function setPromiseStatus(
  promiseId: string,
  status: "completed" | "dismissed" | "open",
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("promises")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", promiseId);
  if (error) return { error: error.message };
  revalidatePath("/follow-ups");
  revalidatePath("/dashboard");
  return {};
}

export async function reschedulePromise(
  promiseId: string,
  dueAt: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("promises")
    .update({ due_at: dueAt, status: "open" })
    .eq("id", promiseId);
  if (error) return { error: error.message };
  revalidatePath("/follow-ups");
  revalidatePath("/dashboard");
  return {};
}

export async function setTaskStatus(
  taskId: string,
  status: "completed" | "dismissed" | "open",
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
      snoozed_until: null,
    })
    .eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath("/follow-ups");
  revalidatePath("/dashboard");
  return {};
}

export async function snoozeTask(taskId: string, untilDate: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status: "snoozed", snoozed_until: new Date(untilDate).toISOString() })
    .eq("id", taskId);
  if (error) return { error: error.message };
  revalidatePath("/follow-ups");
  revalidatePath("/dashboard");
  return {};
}

export async function createTask(input: {
  title: string;
  lenderId?: string;
  dueAt?: string;
  description?: string;
  priority?: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!input.title.trim()) return { error: "Title is required." };

  const { error } = await supabase.from("tasks").insert({
    user_id: user.id,
    lender_id: input.lenderId ?? null,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    due_at: input.dueAt ? new Date(input.dueAt).toISOString() : null,
    priority: input.priority ?? "normal",
  });
  if (error) return { error: error.message };
  revalidatePath("/follow-ups");
  revalidatePath("/dashboard");
  return {};
}
