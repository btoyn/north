"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const RESTORABLE_TABLES = new Set([
  "lenders",
  "institutions",
  "activities",
  "tasks",
  "promises",
  "meetings",
  "opportunities",
  "active_loans",
  "campaigns",
  "trips",
  "expenses",
]);

export async function restoreRecord(table: string, id: string): Promise<{ error?: string }> {
  if (!RESTORABLE_TABLES.has(table)) return { error: "Unknown record type." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from(table).update({ deleted_at: null }).eq("id", id);
  if (error) return { error: error.message };

  await logAudit(supabase, user.id, { entityType: table, entityId: id, action: "restore" });
  revalidatePath("/trash");
  revalidatePath("/tiers", "layout");
  revalidatePath("/dashboard");
  return {};
}

export async function permanentlyDelete(table: string, id: string): Promise<{ error?: string }> {
  if (!RESTORABLE_TABLES.has(table)) return { error: "Unknown record type." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return { error: error.message };

  await logAudit(supabase, user.id, {
    entityType: table,
    entityId: id,
    action: "permanent_delete",
  });
  revalidatePath("/trash");
  return {};
}
