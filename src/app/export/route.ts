import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** One-click CSV export (spec §35). /export?entity=partners — RLS scopes rows
 *  to the signed-in user automatically. */

const ENTITIES: Record<string, { table: string; columns: string[] }> = {
  lenders: {
    table: "lenders",
    columns: [
      "first_name", "last_name", "title", "role_type", "email", "mobile_phone",
      "office_phone", "city", "state", "territory", "relationship_tier",
      "relationship_health", "notes", "created_at",
    ],
  },
  institutions: {
    table: "institutions",
    columns: ["name", "website", "main_phone", "city", "state", "territory", "notes", "created_at"],
  },
  activities: {
    table: "activities",
    columns: ["activity_type", "direction", "occurred_at", "subject", "summary", "personal_touch"],
  },
  tasks: {
    table: "tasks",
    columns: ["title", "description", "task_type", "status", "priority", "due_at", "completed_at"],
  },
  promises: {
    table: "promises",
    columns: ["direction", "description", "due_at", "status", "completed_at"],
  },
  opportunities: {
    table: "opportunities",
    columns: [
      "borrower_name", "estimated_amount", "structure_summary", "stage",
      "received_at", "next_follow_up_at", "preflight_handoff_date",
    ],
  },
  active_loans: {
    table: "active_loans",
    columns: [
      "borrower_name", "loan_amount", "stage", "current_blocker", "next_milestone",
      "sba_approval_date", "approved_sba_amount",
    ],
  },
};

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.join(",");
  const body = rows.map((r) => columns.map((c) => escape(r[c])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entity = searchParams.get("entity") ?? "lenders";
  const spec = ENTITIES[entity];
  if (!spec) return NextResponse.json({ error: "Unknown entity" }, { status: 400 });

  const { data, error } = await supabase
    .from(spec.table)
    .select(spec.columns.join(","))
    .is("deleted_at", null)
    .limit(10000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const csv = toCsv((data ?? []) as unknown as Record<string, unknown>[], spec.columns);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${entity}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
