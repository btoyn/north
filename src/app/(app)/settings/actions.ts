"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updatePreferences(fields: {
  default_contact_goal_days: number;
  contact_grace_days: number;
  weekly_top_count: number;
  weekly_on_deck_count: number;
  default_campaign_batch_size: number;
  look_follow_up_days: number;
  daily_digest_enabled: boolean;
  daily_digest_time: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("user_preferences")
    .update(fields)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return {};
}

export async function updateProfile(fields: {
  display_name: string;
  home_city: string;
  email_signature: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("users").update(fields).eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/loans");
  return {};
}

export interface AvailabilityInput {
  meetingType: string;
  /** 0 = Sunday. Empty means this kind of meeting is never proposed. */
  weekdays: number[];
  startMinute: number;
  endMinute: number;
}

/**
 * Replaces the availability rules wholesale (spec §15).
 *
 * Delete-then-insert rather than a per-row diff: there are at most five rows,
 * the screen always submits all of them, and a partial save would leave the
 * scheduler proposing dates from a half-updated set of rules.
 */
export async function updateAvailability(
  rules: AvailabilityInput[],
  scheduling: {
    propose_horizon_days: number;
    proposal_chase_days: number;
    proposal_slot_count: number;
  },
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  for (const rule of rules) {
    if (rule.endMinute <= rule.startMinute) {
      return { error: `The ${rule.meetingType.replace(/_/g, " ")} window ends before it starts.` };
    }
  }

  const { error: prefsError } = await supabase
    .from("user_preferences")
    .update(scheduling)
    .eq("user_id", user.id);
  if (prefsError) return { error: prefsError.message };

  const { error: clearError } = await supabase
    .from("availability_rules")
    .delete()
    .eq("user_id", user.id);
  if (clearError) return { error: clearError.message };

  // Every type gets a row, including the ones with no days selected. An empty
  // weekday list is how "never propose golf" is stored, and it has to be
  // stored rather than implied: the absence of all rows now means "never
  // configured", which is what makes the defaults apply to a new account
  // without overriding anyone's decision to switch a type off.
  const rows = rules.map((r) => ({
    user_id: user.id,
    meeting_type: r.meetingType,
    weekdays: r.weekdays,
    start_minute: r.startMinute,
    end_minute: r.endMinute,
  }));

  if (rows.length > 0) {
    const { error } = await supabase.from("availability_rules").insert(rows);
    if (error) return { error: error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return {};
}

export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
