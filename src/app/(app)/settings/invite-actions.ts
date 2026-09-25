"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Invite codes for bringing the other loan officers on (spec §1.5).
 *
 * Each officer gets their own walled-off workspace — these codes only let
 * someone create an account, never see anyone else's partners.
 */

export interface InviteRow {
  code: string;
  label: string | null;
  createdAt: string;
  usedAt: string | null;
}

export async function listInvites(): Promise<{ invites?: InviteRow[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data, error } = await supabase.rpc("list_signup_invites");
  if (error) return { error: error.message };

  return {
    invites: (data ?? []).map(
      (r: { code: string; label: string | null; created_at: string; used_at: string | null }) => ({
        code: r.code,
        label: r.label,
        createdAt: r.created_at,
        usedAt: r.used_at,
      }),
    ),
  };
}

export async function createInvite(label: string): Promise<{ code?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!label.trim()) return { error: "Say who this is for, so you can tell the codes apart." };

  const { data, error } = await supabase.rpc("create_signup_invite", { p_label: label.trim() });
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { code: data as string };
}

export async function revokeInvite(code: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_signup_invite", { p_code: code });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return {};
}
