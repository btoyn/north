import "server-only";
import { createClient } from "@/lib/supabase/server";
import { lenderCoverage, type LenderCoverageResult } from "@/lib/coverage";
import { isDealOnly, qualifyingTouchAt, readTier, tierGoalDays } from "@/lib/tiers";
import { sortLists, type LenderList } from "@/lib/lists";
import type { SphereRow } from "@/lib/spheres";
import type { CoverageRow, Lender, UserPreferences } from "@/lib/types";

export interface LenderWithCoverage extends Lender {
  institution: { id: string; name: string } | null;
  coverage: LenderCoverageResult;
  /** Covered, but only by the weekly update on their borrower. */
  dealOnly: boolean;
}

export async function getPreferences(): Promise<UserPreferences | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("user_preferences").select("*").maybeSingle();
  return data;
}

/**
 * All partners joined with the coverage view, statuses computed.
 *
 * Each partner is measured against their own tier's window (A fortnightly, B
 * monthly, C quarterly), with the workspace goal from Settings standing in for
 * anyone untiered. One partner, one goal — every screen that reads this gets the
 * same answer.
 */
export async function getLendersWithCoverage(): Promise<LenderWithCoverage[]> {
  const supabase = await createClient();

  const [{ data: lenders }, { data: coverage }, prefs] = await Promise.all([
    supabase
      .from("lenders")
      .select("*, institution:institutions(id, name)")
      .is("deleted_at", null)
      .order("full_name"),
    supabase.from("lender_coverage").select("*"),
    getPreferences(),
  ]);

  const coverageByLender = new Map<string, CoverageRow>(
    (coverage ?? []).map((c: CoverageRow) => [c.lender_id, c]),
  );
  const workspaceGoal = prefs?.default_contact_goal_days ?? 30;
  const graceDays = prefs?.contact_grace_days ?? 10;

  return ((lenders ?? []) as unknown as (Lender & { institution: { id: string; name: string } | null })[]).map(
    (l) => {
      const c = coverageByLender.get(l.id);
      const touches = {
        personal: c?.last_personal_touch_at ?? null,
        conversation: c?.last_conversation_at ?? null,
        dealUpdate: c?.last_deal_update_at ?? null,
      };
      const goalDays = tierGoalDays(l.relationship_tier, workspaceGoal);
      return {
        ...l,
        coverage: lenderCoverage(
          {
            lastVisibleTouchAt: c?.last_visible_touch_at ?? null,
            lastPersonalTouchAt: qualifyingTouchAt(l.relationship_tier, touches),
            hasConfirmedFutureMeeting: c?.has_confirmed_future_meeting ?? false,
          },
          { goalDays, graceDays },
        ),
        dealOnly: isDealOnly(l.relationship_tier, touches, goalDays),
      };
    },
  );
}

/**
 * Everything Spheres needs, in the shape the pure sphere predicates expect.
 *
 * The two extra flags — an active loan, an overdue promise — are the only
 * things a saved view asks about that the coverage view doesn't know, so they
 * are fetched once here rather than per sphere.
 */
export async function getSphereRows(): Promise<SphereRow[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [lenders, { data: loans }, { data: promises }] = await Promise.all([
    getLendersWithCoverage(),
    supabase.from("active_loans").select("lender_id").is("deleted_at", null),
    supabase
      .from("promises")
      .select("lender_id")
      .eq("status", "open")
      .lt("due_at", today)
      .is("deleted_at", null),
  ]);

  const loanLenders = new Set((loans ?? []).map((r) => r.lender_id));
  const promiseLenders = new Set((promises ?? []).map((r) => r.lender_id));

  return lenders.map((l) => ({
    id: l.id,
    fullName: l.full_name,
    title: l.title,
    isSample: l.is_sample,
    active: l.active,
    tier: readTier(l.relationship_tier),
    territory: l.territory,
    institution: l.institution?.name ?? null,
    coverage: {
      personal: l.coverage.personal,
      visible: l.coverage.visible,
      daysSincePersonal: l.coverage.daysSincePersonal,
      daysSinceVisible: l.coverage.daysSinceVisible,
      hasConfirmedFutureMeeting: l.coverage.hasConfirmedFutureMeeting,
    },
    hasActiveLoan: loanLenders.has(l.id),
    hasOverduePromise: promiseLenders.has(l.id),
    dealOnly: l.dealOnly,
  }));
}

export interface NavCounts {
  followUps: number;
  needsAttention: number;
  /** Active loans whose weekly update is due or late. */
  loansDue: number;
  /** Open looks from partners whose follow-up is due or late. */
  looksDue: number;
}

/**
 * Counts for the sidebar badges (§8). Deliberately lighter than
 * getLendersWithCoverage — no joins, no ordering — because the app layout
 * runs this on every page.
 */
export async function getNavCounts(): Promise<NavCounts> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const today = new Date().toISOString().slice(0, 10);

  const [
    openPromises,
    openTasks,
    wokenTasks,
    loansDue,
    looksDue,
    { data: lenders },
    { data: coverage },
    prefs,
  ] = await Promise.all([
      supabase
        .from("promises")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .is("deleted_at", null),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .is("deleted_at", null),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "snoozed")
        .lte("snoozed_until", nowIso)
        .is("deleted_at", null),
      // Loans whose weekly update is due or already late.
      supabase
        .from("active_loans")
        .select("id", { count: "exact", head: true })
        .eq("updates_active", true)
        .lte("next_update_due_at", today)
        .is("deleted_at", null),
      // Looks a partner raised that are owed a reply. Anything not explicitly
      // closed still counts as open — see isLookOpen in @/lib/looks.
      supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .not("stage", "in", "(handed_off,dormant,closed_no_handoff)")
        .lte("next_follow_up_at", today)
        .is("deleted_at", null),
      supabase.from("lenders").select("id, active, relationship_tier").is("deleted_at", null),
      supabase.from("lender_coverage").select("*"),
      getPreferences(),
    ]);

  const workspaceGoal = prefs?.default_contact_goal_days ?? 30;
  const graceDays = prefs?.contact_grace_days ?? 10;
  const byLender = new Map<string, CoverageRow>(
    (coverage ?? []).map((c: CoverageRow) => [c.lender_id, c]),
  );

  const needsAttention = (lenders ?? []).filter((l) => {
    if (!l.active) return false;
    const c = byLender.get(l.id);
    return (
      lenderCoverage(
        {
          lastVisibleTouchAt: c?.last_visible_touch_at ?? null,
          lastPersonalTouchAt: qualifyingTouchAt(l.relationship_tier, {
            personal: c?.last_personal_touch_at ?? null,
            conversation: c?.last_conversation_at ?? null,
            dealUpdate: c?.last_deal_update_at ?? null,
          }),
          hasConfirmedFutureMeeting: c?.has_confirmed_future_meeting ?? false,
        },
        { goalDays: tierGoalDays(l.relationship_tier, workspaceGoal), graceDays },
      ).personal !== "on_track"
    );
  }).length;

  return {
    followUps: (openPromises.count ?? 0) + (openTasks.count ?? 0) + (wokenTasks.count ?? 0),
    needsAttention,
    loansDue: loansDue.count ?? 0,
    looksDue: looksDue.count ?? 0,
  };
}

export interface QuickLogLender {
  id: string;
  name: string;
  institution: string | null;
  /** Last one-to-one touch, for ordering and the "last spoke" hint. */
  lastTouchAt: string | null;
  onThisWeeksList: boolean;
}

export interface QuickLogData {
  lenders: QuickLogLender[];
  /** Ids to offer before the user types anything. */
  suggestedIds: string[];
}

/**
 * Everything the quick-log sheet needs. Offered before any typing: this week's
 * list first, then whoever you spoke to most recently — so the common case is
 * one tap rather than a search.
 */
export async function getQuickLogLenders(): Promise<QuickLogData> {
  const supabase = await createClient();

  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  const weekStart = d.toISOString().slice(0, 10);

  const [{ data: lenders }, { data: coverage }, { data: plan }] = await Promise.all([
    supabase
      .from("lenders")
      .select("id, full_name, institution:institutions(name)")
      .eq("active", true)
      .is("deleted_at", null)
      .order("full_name"),
    supabase.from("lender_coverage").select("lender_id, last_personal_touch_at"),
    supabase
      .from("weekly_relationship_plans")
      .select("id, items:weekly_relationship_plan_items(lender_id, list_type, status, rank)")
      .eq("week_start", weekStart)
      .maybeSingle(),
  ]);

  const touchByLender = new Map<string, string | null>(
    (coverage ?? []).map((c: { lender_id: string; last_personal_touch_at: string | null }) => [
      c.lender_id,
      c.last_personal_touch_at,
    ]),
  );

  const planItems = (
    (plan?.items ?? []) as unknown as {
      lender_id: string;
      list_type: string;
      status: string;
      rank: number;
    }[]
  )
    .filter((i) => i.list_type === "top" && i.status === "open")
    .sort((a, b) => a.rank - b.rank);
  const planIds = planItems.map((i) => i.lender_id);
  const planSet = new Set(planIds);

  const list: QuickLogLender[] = (
    (lenders ?? []) as unknown as {
      id: string;
      full_name: string;
      institution: { name: string } | null;
    }[]
  ).map((l) => ({
    id: l.id,
    name: l.full_name,
    institution: l.institution?.name ?? null,
    lastTouchAt: touchByLender.get(l.id) ?? null,
    onThisWeeksList: planSet.has(l.id),
  }));

  const recentlyTouched = [...list]
    .filter((l) => l.lastTouchAt && !planSet.has(l.id))
    .sort((a, b) => (b.lastTouchAt ?? "").localeCompare(a.lastTouchAt ?? ""))
    .map((l) => l.id);

  return {
    lenders: list,
    suggestedIds: [...planIds, ...recentlyTouched].slice(0, 8),
  };
}

/** Seed the demo workspace for brand-new accounts (spec §14). */
export async function ensureSampleData(): Promise<void> {
  const supabase = await createClient();

  // The count comes first, and the user lookup only happens on the one load
  // in an account's life where seeding actually runs.
  //
  // It used to be the other way round, which put an `auth.getUser()` — a real
  // HTTP call to Supabase, not a local token decode — in front of every single
  // dashboard render, forever, to answer a question that is "no" every time
  // after the first. RLS already scopes the count to this user, so identifying
  // them to ask it was work that bought nothing.
  const { count } = await supabase
    .from("lenders")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.rpc("create_sample_data", { p_user_id: user.id });
}

/**
 * Every list with its members, in one round trip per table.
 *
 * Two queries rather than a join, then stitched in memory: the join would
 * repeat each list's name once per member, and the membership table is the
 * one that grows. At 137 partners neither is slow, but the shape is the one
 * that stays sensible.
 */
export async function getLenderLists(): Promise<LenderList[]> {
  const supabase = await createClient();

  const [{ data: lists }, { data: members }] = await Promise.all([
    supabase.from("lender_lists").select("id, name"),
    supabase.from("lender_list_members").select("list_id, lender_id"),
  ]);

  const byList = new Map<string, string[]>();
  for (const m of members ?? []) {
    const existing = byList.get(m.list_id);
    if (existing) existing.push(m.lender_id);
    else byList.set(m.list_id, [m.lender_id]);
  }

  return sortLists(
    (lists ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      memberIds: byList.get(l.id) ?? [],
    })),
  );
}
