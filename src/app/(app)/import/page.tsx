import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { normalizeName } from "@/lib/utils";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import" };

export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: sampleFlag }, { data: existing }] = await Promise.all([
    supabase.rpc("has_sample_data", { p_user_id: user?.id }),
    supabase
      .from("lenders")
      .select("full_name, email")
      .is("deleted_at", null)
      .eq("is_sample", false),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Import your partner list"
        description="Upload the Excel or CSV file you use today. Nothing is saved until you review and confirm."
      />
      <ImportWizard
        hasSampleData={Boolean(sampleFlag)}
        existingKeys={{
          names: (existing ?? []).map((l) => normalizeName(l.full_name)),
          emails: (existing ?? []).flatMap((l) => (l.email ? [l.email.toLowerCase()] : [])),
        }}
      />
    </div>
  );
}
