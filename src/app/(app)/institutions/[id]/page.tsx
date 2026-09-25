import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Badge, SampleBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProposeGroupMeeting } from "@/components/propose-group-meeting";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_TYPE_LABELS, ROLE_TYPE_LABELS } from "@/lib/labels";
import { formatDate } from "@/lib/utils";

export default async function InstitutionProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: institution } = await supabase
    .from("institutions")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!institution) notFound();

  const [{ data: lenders }, { data: activities }] = await Promise.all([
    supabase
      .from("lenders")
      .select("id, full_name, title, role_type, email, is_sample")
      .eq("institution_id", id)
      .is("deleted_at", null)
      .order("full_name"),
    supabase
      .from("activities")
      .select("id, activity_type, occurred_at, subject, summary, lender:lenders(full_name)")
      .eq("institution_id", id)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(25),
  ]);

  return (
    <>
      <PageHeader
        title={institution.name}
        description={[institution.city, institution.state, institution.territory]
          .filter(Boolean)
          .join(" · ")}
      />
      {institution.is_sample && (
        <div className="mb-4">
          <SampleBadge />
        </div>
      )}

      {/* He rarely takes one lender to lunch — more often a bank's team, or
          three of its seven. This is where that starts. */}
      <div className="mb-5">
        <ProposeGroupMeeting institutionId={institution.id} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            {(lenders ?? []).length === 0 ? (
              <EmptyState title="No contacts here yet" className="py-8" />
            ) : (
              <ul className="divide-y divide-border">
                {(lenders ?? []).map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/partners/${l.id}`}
                      className="flex items-center justify-between py-2.5 hover:text-primary"
                    >
                      <span className="font-medium">{l.full_name}</span>
                      <Badge variant="outline">
                        {ROLE_TYPE_LABELS[l.role_type] ?? l.role_type}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {(activities ?? []).length === 0 ? (
              <EmptyState title="No activity yet" className="py-8" />
            ) : (
              <ol className="space-y-2.5 text-sm">
                {(activities ?? []).map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span className="w-20 shrink-0 text-xs text-muted">{formatDate(a.occurred_at)}</span>
                    <span>
                      <span className="font-medium">
                        {(a.lender as unknown as { full_name: string } | null)?.full_name}
                      </span>{" "}
                      · {ACTIVITY_TYPE_LABELS[a.activity_type] ?? a.activity_type}
                      {a.summary ? ` — ${a.summary}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
