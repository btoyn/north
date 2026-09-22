import { FlaskConical } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ensureSampleData, getLendersWithCoverage } from "@/lib/data";
import {
  buildCoverageSplit,
  buildLenderDots,
  getCoverageHistory,
  getLoanStatuses,
  getRelationshipContext,
  getProposalQueue,
  getUpcoming,
  weekStartOf,
} from "@/lib/dashboard";
import { getFlags } from "@/lib/flags";
import { formatDateTime } from "@/lib/utils";
import { MEETING_TYPE_LABELS } from "@/lib/labels";
import { HeroHeader, type HeroChip } from "./hero-header";
import { LenderSearch, type SearchableLender } from "./lender-search";
import { RelationshipMomentum } from "./momentum";
import { TodayRibbon, type RibbonData } from "./today-ribbon";
import {
  RelationshipRows,
  type PrimaryActionKind,
  type ReasonChip,
  type RelationshipRow,
} from "./relationship-rows";
import { AgendaRail } from "./agenda-rail";
import { ProposalQueue } from "./proposal-queue";
import type { AvatarStatus } from "@/components/ui/avatar";

export const metadata = { title: "Dashboard" };

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Denver",
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default async function DashboardPage() {
  await ensureSampleData();

  const supabase = await createClient();
  const now = new Date();
  const nowMs = now.getTime();
  const today = now.toISOString().slice(0, 10);
  const weekStart = weekStartOf(now);

  const [
    lenders,
    { data: profile },
    { data: missingNotes },
    { data: overduePromises },
    { data: plan },
    { count: sampleLenders },
    upcoming,
    history,
    loanStatuses,
    context,
    proposals,
  ] = await Promise.all([
    getLendersWithCoverage(),
    supabase.from("users").select("display_name").maybeSingle(),
    supabase
      .from("meetings")
      .select("id, title, start_at, meeting_type")
      .eq("notes_status", "pending")
      .is("deleted_at", null)
      .order("start_at", { ascending: false }),
    supabase
      .from("promises")
      .select("id, description, due_at, direction, lender:lenders(id, full_name)")
      .eq("status", "open")
      .lt("due_at", today)
      .is("deleted_at", null)
      .order("due_at"),
    supabase
      .from("weekly_relationship_plans")
      .select("id")
      .eq("week_start", weekStart)
      .maybeSingle(),
    supabase
      .from("lenders")
      .select("id", { count: "exact", head: true })
      .eq("is_sample", true)
      .is("deleted_at", null),
    getUpcoming(),
    getCoverageHistory(),
    getLoanStatuses(),
    getRelationshipContext(),
    getProposalQueue(),
  ]);

  // ---- Coverage ------------------------------------------------------------
  const active = lenders.filter((l) => l.active);
  const personalCovered = active.filter((l) => l.coverage.personal === "on_track").length;
  const coveragePct =
    active.length === 0 ? 0 : Math.round((personalCovered / active.length) * 100);
  const split = buildCoverageSplit(lenders);

  // ---- This week's plan ----------------------------------------------------
  const planItemsResult = plan
    ? await supabase
        .from("weekly_relationship_plan_items")
        .select(
          "id, rank, status, recommended_action, lender:lenders(id, full_name, first_name, email, mobile_phone, territory, relationship_tier, preferred_contact_method, institution:institutions(name))",
        )
        .eq("plan_id", plan.id)
        .eq("list_type", "top")
        .order("rank")
    : null;

  const coverageById = new Map(lenders.map((l) => [l.id, l.coverage]));
  const topItems = planItemsResult?.data ?? [];
  const completedCount = topItems.filter((i) => i.status === "completed").length;

  const relationshipRows: RelationshipRow[] = topItems
    .filter((i) => i.status === "open")
    .map((item) => {
      const lender = item.lender as unknown as {
        id: string;
        full_name: string;
        first_name: string;
        email: string | null;
        mobile_phone: string | null;
        territory: string | null;
        relationship_tier: string;
        preferred_contact_method: string | null;
        institution: { name: string } | null;
      } | null;
      if (!lender) return null;

      const coverage = coverageById.get(lender.id);
      const days = coverage?.daysSincePersonal ?? null;
      const personal = coverage?.personal ?? "never_contacted";
      const hasLoan = context.activeLoanLenders.has(lender.id);
      const hasFollowUp = context.openFollowUpLenders.has(lender.id);
      const hasTopic = context.personalTopicLenders.has(lender.id);
      const isInbound = context.recentInboundLenders.has(lender.id);
      const nearTrip =
        context.tripTerritory !== null && lender.territory === context.tripTerritory;

      // The avatar dot and the left rail share one status, worst signal first.
      const status: AvatarStatus =
        personal === "overdue" ||
        personal === "seriously_overdue" ||
        personal === "never_contacted"
          ? "overdue"
          : personal === "grace"
            ? "grace"
            : isInbound
              ? "inbound"
              : lender.relationship_tier === "A"
                ? "priority"
                : "none";

      const chips: ReasonChip[] = [
        days === null
          ? { label: "No personal contact yet", tone: "red" as const }
          : {
              label: `${days} days since contact`,
              tone:
                personal === "overdue" || personal === "seriously_overdue"
                  ? ("red" as const)
                  : personal === "grace"
                    ? ("gold" as const)
                    : ("slate" as const),
            },
        hasFollowUp && { label: "Open follow-up", tone: "gold" as const },
        hasLoan && { label: "Active loan", tone: "blue" as const },
        nearTrip && { label: "Near upcoming trip", tone: "teal" as const },
        hasTopic && { label: "Personal topic available", tone: "plum" as const },
        isInbound && { label: "They reached out", tone: "teal" as const },
      ].filter(Boolean) as ReasonChip[];

      const primary: PrimaryActionKind = hasLoan
        ? "draft_update"
        : hasFollowUp
          ? "log_followup"
          : lender.preferred_contact_method === "in_person"
            ? "invite_lunch"
            : "draft_checkin";

      return {
        itemId: item.id,
        lenderId: lender.id,
        name: lender.full_name,
        firstName: lender.first_name,
        institution: lender.institution?.name ?? null,
        territory: lender.territory,
        email: lender.email,
        mobile: lender.mobile_phone,
        status,
        chips: chips.slice(0, 4),
        suggestion: item.recommended_action ?? "Send a short personal check-in",
        primary,
      };
    })
    .filter((r): r is RelationshipRow => r !== null);

  // ---- Today ribbon --------------------------------------------------------
  const promises = overduePromises ?? [];
  const worstDaysLate = promises.reduce((worst, p) => {
    if (!p.due_at) return worst;
    return Math.max(worst, Math.floor((nowMs - new Date(p.due_at).getTime()) / 86_400_000));
  }, 0);

  const dueLoans = loanStatuses.filter((l) => l.state !== "updated");

  const ribbon: RibbonData = {
    notes: (missingNotes ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      when: `${MEETING_TYPE_LABELS[m.meeting_type] ?? m.meeting_type} · ${formatDateTime(m.start_at)}`,
    })),
    promises: { count: promises.length, worstDaysLate },
    loansDue: dueLoans.map((l) => ({
      id: l.id,
      borrower: l.borrower,
      detail: [l.lenderName, l.daysLate > 0 ? `${l.daysLate}d late` : "due now"]
        .filter(Boolean)
        .join(" · "),
      overdue: l.state === "overdue",
    })),
  };

  // ---- Hero ----------------------------------------------------------------
  const noteCount = (missingNotes ?? []).length;
  const chips: HeroChip[] = [
    promises.length > 0 && {
      icon: "promise" as const,
      label: plural(promises.length, "overdue promise"),
    },
    relationshipRows.length > 0 && {
      icon: "list" as const,
      label: `${relationshipRows.length} on this week's list`,
    },
  ].filter(Boolean) as HeroChip[];

  const openItems = promises.length + dueLoans.length + noteCount;
  const summary =
    openItems === 0
      ? relationshipRows.length > 0
        ? `Nothing overdue. ${relationshipRows.length} relationships are waiting on a first move.`
        : "Nothing overdue and nobody slipping. You're clear."
      : `${plural(openItems, "item")} need${openItems === 1 ? "s" : ""} you today${
          noteCount > 0 ? `, including ${plural(noteCount, "meeting note")} to capture` : ""
        }.`;

  const nextMeeting = upcoming.meetings[0];

  // The whole book, in the shape the search box matches on. Already in memory
  // for the coverage figures above, so this costs a map rather than a query.
  const searchable: SearchableLender[] = lenders.map((l) => ({
    id: l.id,
    name: l.full_name,
    institution: l.institution?.name ?? null,
    email: l.email,
    tier: l.relationship_tier,
    coverageStatus: l.coverage.personal,
    daysSinceTouch: l.coverage.daysSinceVisible,
  }));

  return (
    <>
      {/* A brand-new workspace is seeded with fictional lenders. Say so before
          anyone reads these numbers as somebody's real book of business. */}
      {(sampleLenders ?? 0) > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-gold-border bg-gold-soft px-4 py-3">
          <FlaskConical className="mt-px h-4 w-4 shrink-0 text-gold" />
          <p className="text-[13px] leading-relaxed text-[#6d5210]">
            <span className="font-semibold">Sample data.</span> Every lender, meeting and loan on
            this screen is made up, so you can try things without breaking anything. Importing a
            real lender list from Settings clears all of it.
          </p>
        </div>
      )}

      <HeroHeader
        greeting={greeting()}
        firstName={profile?.display_name?.split(" ")[0] ?? null}
        summary={summary}
        chips={chips}
        hasPlan={Boolean(plan)}
        aiEnabled={getFlags().ai}
      />

      {/* Straight under the greeting, because "where is that guy's page" is the
          most common reason this screen gets opened at all. */}
      <div className="mb-5 mt-4">
        <LenderSearch lenders={searchable} />
      </div>

      {/* Phones lead with today's work and end with the momentum summary;
          desktop leads with momentum. */}
      <div className="flex flex-col gap-5">
        <div className="order-3 xl:order-1">
          <RelationshipMomentum
            coverage={{
              pct: coveragePct,
              covered: personalCovered,
              active: active.length,
              change30: history.changeFrom30Days,
              trend: history.insufficientData ? [] : history.points.map((p) => p.pct),
              dots: buildLenderDots(lenders),
            }}
            loans={{ statuses: loanStatuses, dueNow: dueLoans.length }}
            meetings={{
              upcoming: upcoming.meetings.length,
              next: nextMeeting
                ? {
                    title: nextMeeting.title,
                    startAt: nextMeeting.start_at,
                    type: nextMeeting.meeting_type,
                    withWhom: nextMeeting.attendees[0] ?? null,
                  }
                : null,
              awaitingNotes: noteCount,
            }}
            split={split}
          />
        </div>

        <div className="order-1 xl:order-2">
          <TodayRibbon data={ribbon} />
        </div>

        {/* Only renders when something is actually in flight. */}
        <div className="order-1 xl:order-2">
          <ProposalQueue data={proposals} />
        </div>

        <div className="order-2 grid gap-5 xl:order-3 xl:grid-cols-[minmax(0,1fr)_344px]">
          <RelationshipRows
            rows={relationshipRows}
            completed={completedCount}
            total={topItems.length}
            hasPlan={Boolean(plan)}
          />
          <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
            <AgendaRail data={upcoming} />
          </div>
        </div>
      </div>
    </>
  );
}
