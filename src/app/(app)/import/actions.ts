"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { normalizeName } from "@/lib/utils";

export interface ImportRow {
  firstName: string;
  lastName: string;
  email: string;
  institutionName: string;
  city: string;
  territory: string;
  title: string;
  phone: string;
  address: string;
  notes: string;
  /** Structured tags the user accepted from note parsing (§14). */
  acceptedTags: { category: string; detail: string }[];
}

export interface ImportReport {
  added: number;
  merged: number;
  skipped: number;
  needsReview: string[];
  missingEmail: number;
  missingTerritory: number;
  error?: string;
}

/**
 * Import mapped rows (spec §14). Existing records are never overwritten:
 * a duplicate match only fills in fields that are currently empty ("merged").
 * When removeSampleData is set (explicitly confirmed in the UI), all sample
 * records are deleted first so sample and real data never mix.
 */
export async function importLenders(
  rows: ImportRow[],
  removeSampleData: boolean,
): Promise<ImportReport> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return emptyReport("Not signed in.");
  if (rows.length === 0) return emptyReport("Nothing to import.");

  if (removeSampleData) {
    const { error } = await supabase.rpc("delete_sample_data", { p_user_id: user.id });
    if (error) return emptyReport(`Couldn't remove sample data: ${error.message}`);
  }

  const report: ImportReport = {
    added: 0,
    merged: 0,
    skipped: 0,
    needsReview: [],
    missingEmail: 0,
    missingTerritory: 0,
  };

  // Existing data for duplicate + institution matching
  const [{ data: existingLenders }, { data: existingInstitutions }] = await Promise.all([
    supabase
      .from("lenders")
      .select("id, full_name, email, institution_id, city, territory, title, mobile_phone, notes")
      .is("deleted_at", null),
    supabase.from("institutions").select("id, normalized_name").is("deleted_at", null),
  ]);

  const lendersByEmail = new Map(
    (existingLenders ?? []).filter((l) => l.email).map((l) => [l.email!.toLowerCase(), l]),
  );
  const lendersByName = new Map(
    (existingLenders ?? []).map((l) => [normalizeName(l.full_name), l]),
  );
  const institutionsByName = new Map(
    (existingInstitutions ?? []).map((i) => [i.normalized_name, i.id]),
  );

  async function institutionId(name: string, territory: string): Promise<string | null> {
    if (!name.trim()) return null;
    const normalized = normalizeName(name);
    const cached = institutionsByName.get(normalized);
    if (cached) return cached;
    const { data, error } = await supabase
      .from("institutions")
      .insert({
        user_id: user!.id,
        name: name.trim(),
        normalized_name: normalized,
        territory: territory || null,
      })
      .select("id")
      .single();
    if (error || !data) return null;
    institutionsByName.set(normalized, data.id);
    return data.id;
  }

  for (const row of rows) {
    const fullName = `${row.firstName} ${row.lastName}`.trim();
    if (!fullName) {
      report.skipped++;
      continue;
    }

    const email = row.email.trim().toLowerCase();
    if (!email) report.missingEmail++;
    if (!row.territory.trim()) report.missingTerritory++;

    const existing =
      (email && lendersByEmail.get(email)) || lendersByName.get(normalizeName(fullName));

    if (existing) {
      // Merge: only fill fields that are empty on the existing record.
      const patch: Record<string, string> = {};
      if (!existing.email && email) patch.email = email;
      if (!existing.city && row.city.trim()) patch.city = row.city.trim();
      if (!existing.territory && row.territory.trim()) patch.territory = row.territory.trim();
      if (!existing.title && row.title.trim()) patch.title = row.title.trim();
      if (!existing.mobile_phone && row.phone.trim()) patch.mobile_phone = row.phone.trim();
      if (!existing.notes && row.notes.trim()) patch.notes = row.notes.trim();

      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("lenders").update(patch).eq("id", existing.id);
        if (error) {
          report.needsReview.push(`${fullName}: ${error.message}`);
          continue;
        }
        report.merged++;
      } else {
        report.skipped++;
      }
      continue;
    }

    const instId = await institutionId(row.institutionName, row.territory);
    if (!row.institutionName.trim()) {
      report.needsReview.push(`${fullName}: no institution — added without one`);
    }

    const { data: created, error } = await supabase
      .from("lenders")
      .insert({
        user_id: user.id,
        institution_id: instId,
        first_name: row.firstName.trim(),
        last_name: row.lastName.trim() || null,
        email: email || null,
        mobile_phone: row.phone.trim() || null,
        city: row.city.trim() || null,
        territory: row.territory.trim() || null,
        title: row.title.trim() || null,
        address: row.address.trim() || null,
        notes: row.notes.trim() || null, // original note always preserved (§14)
        needs_enrichment: !email || !row.territory.trim(),
      })
      .select("id")
      .single();

    if (error || !created) {
      report.needsReview.push(`${fullName}: ${error?.message ?? "insert failed"}`);
      continue;
    }

    if (instId) {
      await supabase.from("lender_institution_history").insert({
        user_id: user.id,
        lender_id: created.id,
        institution_id: instId,
        title: row.title.trim() || null,
        is_current: true,
      });
    }

    if (row.acceptedTags.length > 0) {
      await supabase.from("lender_personal_details").insert(
        row.acceptedTags.map((t) => ({
          user_id: user.id,
          lender_id: created.id,
          category: t.category,
          detail: t.detail,
        })),
      );
    }

    report.added++;
  }

  await logAudit(supabase, user.id, {
    entityType: "import",
    entityId: new Date().toISOString(),
    action: "create",
    newValue: {
      added: report.added,
      merged: report.merged,
      skipped: report.skipped,
      sample_data_removed: removeSampleData,
    },
  });

  revalidatePath("/tiers", "layout");
  revalidatePath("/institutions");
  revalidatePath("/dashboard");
  return report;
}

function emptyReport(error: string): ImportReport {
  return {
    added: 0,
    merged: 0,
    skipped: 0,
    needsReview: [],
    missingEmail: 0,
    missingTerritory: 0,
    error,
  };
}
