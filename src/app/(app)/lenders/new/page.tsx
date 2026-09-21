import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { getLenderLists } from "@/lib/data";
import { AddLenderForm } from "./add-lender-form";

export const metadata = { title: "Add lender" };

export default async function NewLenderPage() {
  const supabase = await createClient();
  const [{ data: institutions }, lists] = await Promise.all([
    supabase
      .from("institutions")
      .select("id, name")
      .is("deleted_at", null)
      .order("name"),
    getLenderLists(),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Add lender"
        description="Only name and institution are required — fill in the rest when you have it."
      />
      <AddLenderForm
        institutionNames={(institutions ?? []).map((i) => i.name)}
        lists={lists.map((l) => ({ id: l.id, name: l.name }))}
      />
    </div>
  );
}
