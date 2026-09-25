"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getLenderLists } from "@/lib/data";
import { listNameProblem, normalizeListName } from "@/lib/lists";

/**
 * Lists someone keeps for themselves: create, rename, delete, and membership.
 *
 * The name rules live in `lib/lists` and are checked here as well as on screen,
 * because a server action is a public endpoint and the form is only the polite
 * way in.
 */

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function revalidate() {
  revalidatePath("/tiers");
  revalidatePath("/partners", "layout");
}

export async function createList(name: string): Promise<{ id?: string; error?: string }> {
  const userId = await currentUserId();
  if (!userId) return { error: "Not signed in." };

  const existing = await getLenderLists();
  const problem = listNameProblem(name, existing);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lender_lists")
    .insert({ user_id: userId, name: normalizeListName(name) })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidate();
  return { id: data.id };
}

export async function renameList(listId: string, name: string): Promise<{ error?: string }> {
  const existing = await getLenderLists();
  const problem = listNameProblem(name, existing, listId);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error } = await supabase
    .from("lender_lists")
    .update({ name: normalizeListName(name), updated_at: new Date().toISOString() })
    .eq("id", listId);

  if (error) return { error: error.message };
  revalidate();
  return {};
}

/** Deletes the list. Membership rows go with it; the partners do not. */
export async function deleteList(listId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("lender_lists").delete().eq("id", listId);
  if (error) return { error: error.message };
  revalidate();
  return {};
}

/**
 * Puts a partner on a list, or takes them off.
 *
 * One action for both directions because the caller is a checkbox, and a
 * checkbox that has to pick between two endpoints is a checkbox that can get
 * them the wrong way round.
 */
export async function setListMembership(
  listId: string,
  lenderId: string,
  onList: boolean,
): Promise<{ error?: string }> {
  const userId = await currentUserId();
  if (!userId) return { error: "Not signed in." };

  const supabase = await createClient();

  if (onList) {
    // Idempotent: ticking a box that is already ticked is not an error worth
    // showing anyone.
    const { error } = await supabase
      .from("lender_list_members")
      .upsert(
        { list_id: listId, lender_id: lenderId, user_id: userId },
        { onConflict: "list_id,lender_id" },
      );
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("lender_list_members")
      .delete()
      .eq("list_id", listId)
      .eq("lender_id", lenderId);
    if (error) return { error: error.message };
  }

  revalidate();
  return {};
}

/** Creates a list and puts this partner on it, for the "new list" field. */
export async function createListWithLender(
  name: string,
  lenderId: string,
): Promise<{ error?: string }> {
  const created = await createList(name);
  if (created.error || !created.id) return { error: created.error };
  return setListMembership(created.id, lenderId, true);
}
