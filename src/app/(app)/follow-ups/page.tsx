import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { PromiseRowActions, TaskRowActions } from "./row-actions";
import { NewTaskForm } from "./new-task-form";

export const metadata = { title: "Follow-ups" };

type LenderRef = { id: string; full_name: string } | null;

function LenderLink({ lender }: { lender: LenderRef }) {
  if (!lender) return null;
  return (
    <Link href={`/partners/${lender.id}`} className="text-primary hover:underline">
      {lender.full_name}
    </Link>
  );
}

function DueDate({ due }: { due: string | null }) {
  if (!due) return <span className="text-xs text-muted">no date</span>;
  const overdue = new Date(due) < new Date(new Date().toDateString());
  return (
    <span className={`text-xs ${overdue ? "font-medium text-danger" : "text-muted"}`}>
      {overdue ? "was due " : "due "}
      {formatDate(due)}
    </span>
  );
}

export default async function FollowUpsPage() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [{ data: promises }, { data: tasks }, { data: lenders }] = await Promise.all([
    supabase
      .from("promises")
      .select("*, lender:lenders(id, full_name)")
      .eq("status", "open")
      .is("deleted_at", null)
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase
      .from("tasks")
      .select("*, lender:lenders(id, full_name)")
      .in("status", ["open", "snoozed"])
      .is("deleted_at", null)
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase
      .from("lenders")
      .select("id, full_name")
      .is("deleted_at", null)
      .order("full_name"),
  ]);

  const iPromised = (promises ?? []).filter((p) => p.direction === "i_promised");
  const theyPromised = (promises ?? []).filter((p) => p.direction === "they_promised");
  const visibleTasks = (tasks ?? []).filter(
    (t) => t.status === "open" || (t.snoozed_until && t.snoozed_until <= nowIso),
  );
  const snoozedTasks = (tasks ?? []).filter(
    (t) => t.status === "snoozed" && t.snoozed_until && t.snoozed_until > nowIso,
  );

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="Promises are front and center — they're the ones people remember."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-base">I promised</CardTitle>
            <CardDescription>Things you told partners you&apos;d do.</CardDescription>
          </CardHeader>
          <CardContent>
            {iPromised.length === 0 ? (
              <EmptyState title="Nothing owed" description="You're all caught up on your promises." className="py-6" />
            ) : (
              <ul className="divide-y divide-border">
                {iPromised.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{p.description}</p>
                      <p className="text-muted">
                        <LenderLink lender={p.lender as LenderRef} /> · <DueDate due={p.due_at} />
                      </p>
                    </div>
                    <PromiseRowActions promiseId={p.id} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">They promised</CardTitle>
            <CardDescription>Things partners said they&apos;d send or do.</CardDescription>
          </CardHeader>
          <CardContent>
            {theyPromised.length === 0 ? (
              <EmptyState title="Nothing pending from partners" className="py-6" />
            ) : (
              <ul className="divide-y divide-border">
                {theyPromised.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{p.description}</p>
                      <p className="text-muted">
                        <LenderLink lender={p.lender as LenderRef} /> · <DueDate due={p.due_at} />
                      </p>
                    </div>
                    <PromiseRowActions promiseId={p.id} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Tasks</CardTitle>
            <CardDescription>Everything else on your list.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <NewTaskForm lenders={(lenders ?? []).map((l) => ({ id: l.id, name: l.full_name }))} />
          {visibleTasks.length === 0 ? (
            <EmptyState title="No open tasks" className="py-6" />
          ) : (
            <ul className="divide-y divide-border">
              {visibleTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t.title}
                      {t.priority === "high" && (
                        <Badge variant="danger" className="ml-2">High</Badge>
                      )}
                    </p>
                    <p className="text-muted">
                      <LenderLink lender={t.lender as LenderRef} />
                      {t.lender ? " · " : ""}
                      <DueDate due={t.due_at} />
                    </p>
                  </div>
                  <TaskRowActions taskId={t.id} />
                </li>
              ))}
            </ul>
          )}
          {snoozedTasks.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">
                {snoozedTasks.length} snoozed
              </summary>
              <ul className="mt-2 divide-y divide-border">
                {snoozedTasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <p>{t.title}</p>
                      <p className="text-xs text-muted">
                        back {formatDate(t.snoozed_until)}
                      </p>
                    </div>
                    <TaskRowActions taskId={t.id} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>
    </>
  );
}
