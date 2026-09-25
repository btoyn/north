"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getLendersWithCoverage, getPreferences } from "@/lib/data";
import { getAiProvider } from "@/lib/ai";
import { MEETING_TYPE_DURATIONS } from "@/lib/labels";
import { weekStartOf } from "@/lib/dashboard";
import type { LenderWithCoverage } from "@/lib/data";

const RANK: Record<string, number> = {
  seriously_overdue: 0,
  overdue: 1,
  never_contacted: 2,
  grace: 3,
  on_track: 4,
};

function explain(l: LenderWithCoverage): string {
  const days = l.coverage.daysSincePersonal;
  switch (l.coverage.personal) {
    case "never_contacted":
      return "No personal contact on record yet";
    case "seriously_overdue":
      return `Seriously overdue — ${days} days since a one-to-one touch`;
    case "overdue":
      return `Overdue — ${days} days since a one-to-one touch`;
    case "grace":
      return `In the grace window — ${days} days since a one-to-one touch`;
    default:
      return l.coverage.visible === "on_track" && l.coverage.personal !== "on_track"
        ? "Reached by campaign email only — needs a personal touch"
        : `Keeping the relationship warm — ${days} days since last contact`;
  }
}

function suggestAction(l: LenderWithCoverage): string {
  switch (l.preferred_contact_method) {
    case "text":
      return "Send a short text to check in";
    case "call":
      return "Give them a quick call";
    case "in_person":
      return "Stop by the office or set up a lunch";
    case "email":
      return "Send a short personal email";
    default:
      return l.coverage.daysSincePersonal === null
        ? "Open with a brief introduction email"
        : "Send a short personal check-in";
  }
}

/**
 * Generate this week's relationship plan if it doesn't exist yet (§6). Ranking
 * is worst-personal-coverage-first, which is the same ordering the Needs
 * Attention queue uses, so the two screens never disagree.
 */
export async function startWeeklyOutreach(): Promise<{
  error?: string;
  created?: boolean;
  planId?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const weekStart = weekStartOf();

  const { data: existing } = await supabase
    .from("weekly_relationship_plans")
    .select("id")
    .eq("week_start", weekStart)
    .maybeSingle();

  if (existing) {
    revalidatePath("/dashboard");
    return { created: false, planId: existing.id };
  }

  const [lenders, prefs] = await Promise.all([getLendersWithCoverage(), getPreferences()]);
  const topCount = prefs?.weekly_top_count ?? 10;
  const onDeckCount = prefs?.weekly_on_deck_count ?? 10;

  const eligible = lenders
    .filter((l) => l.active && !l.do_not_contact && !l.unsubscribed)
    .sort(
      (a, b) =>
        RANK[a.coverage.personal] - RANK[b.coverage.personal] ||
        (b.coverage.daysSincePersonal ?? 9999) - (a.coverage.daysSincePersonal ?? 9999),
    );

  if (eligible.length === 0) {
    return { error: "Add some partners first — there's nobody to plan outreach for yet." };
  }

  const { data: plan, error: planError } = await supabase
    .from("weekly_relationship_plans")
    .insert({
      user_id: user.id,
      week_start: weekStart,
      generation_context: {
        source: "coverage_ranking",
        goal_days: prefs?.default_contact_goal_days ?? 30,
        candidate_count: eligible.length,
      },
    })
    .select("id")
    .single();

  if (planError || !plan) return { error: planError?.message ?? "Could not start the week." };

  const rows = eligible.slice(0, topCount + onDeckCount).map((l, i) => ({
    user_id: user.id,
    plan_id: plan.id,
    lender_id: l.id,
    list_type: i < topCount ? "top" : "on_deck",
    rank: i < topCount ? i + 1 : i - topCount + 1,
    explanation: explain(l),
    recommended_action: suggestAction(l),
    estimated_effort_minutes: l.preferred_contact_method === "in_person" ? 60 : 10,
  }));

  const { error: itemsError } = await supabase
    .from("weekly_relationship_plan_items")
    .insert(rows);
  if (itemsError) return { error: itemsError.message };

  revalidatePath("/dashboard");
  return { created: true, planId: plan.id };
}

/**
 * Swap a partner out of this week's list and pull up the highest-ranked
 * on-deck partner in their place (§6).
 */
export async function replacePlanItem(itemId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("weekly_relationship_plan_items")
    .select("id, plan_id, rank, list_type")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { error: "That item is no longer on this week's list." };

  const { error } = await supabase
    .from("weekly_relationship_plan_items")
    .update({ status: "replaced" })
    .eq("id", itemId);
  if (error) return { error: error.message };

  // Promote the next open on-deck partner into the vacated slot.
  const { data: nextUp } = await supabase
    .from("weekly_relationship_plan_items")
    .select("id")
    .eq("plan_id", item.plan_id)
    .eq("list_type", "on_deck")
    .eq("status", "open")
    .order("rank")
    .limit(1)
    .maybeSingle();

  if (nextUp) {
    await supabase
      .from("weekly_relationship_plan_items")
      .update({ list_type: "top", rank: item.rank })
      .eq("id", nextUp.id);
  }

  revalidatePath("/dashboard");
  return {};
}

/**
 * Put a tentative hold on the calendar for a partner. Tentative rather than
 * confirmed, because nothing is agreed until they reply — and tentative items
 * surface in the Upcoming panel so they don't get forgotten (§7).
 */
export async function scheduleTentativeMeeting(input: {
  lenderId: string;
  meetingType: string;
  startAt: string;
  locationName?: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!input.startAt) return { error: "Pick a date and time." };

  const { data: lender } = await supabase
    .from("lenders")
    .select("full_name, institution_id, territory")
    .eq("id", input.lenderId)
    .maybeSingle();
  if (!lender) return { error: "Partner not found." };

  const start = new Date(input.startAt);
  if (Number.isNaN(start.getTime())) return { error: "That date didn't look valid." };
  const minutes = MEETING_TYPE_DURATIONS[input.meetingType] ?? 60;

  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      user_id: user.id,
      institution_id: lender.institution_id,
      meeting_type: input.meetingType,
      title: `${input.meetingType.replace(/_/g, " ")} with ${lender.full_name}`,
      status: "tentative",
      tentative: true,
      start_at: start.toISOString(),
      end_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
      location_name: input.locationName?.trim() || null,
      territory: lender.territory,
      notes_status: "not_needed",
    })
    .select("id")
    .single();

  if (error || !meeting) return { error: error?.message ?? "Could not save the hold." };

  const { error: attendeeError } = await supabase.from("meeting_attendees").insert({
    user_id: user.id,
    meeting_id: meeting.id,
    lender_id: input.lenderId,
    response_status: "awaiting_reply",
  });
  if (attendeeError) return { error: attendeeError.message };

  revalidatePath("/dashboard");
  revalidatePath(`/partners/${input.lenderId}`);
  return {};
}

/**
 * Capture meeting notes straight from the dashboard so the "missing notes" row
 * has a real primary action (§5) instead of just a link somewhere else.
 */
export async function captureMeetingNotes(
  meetingId: string,
  rawNotes: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!rawNotes.trim()) return { error: "Add a line or two before saving." };

  const { error: noteError } = await supabase.from("meeting_notes").insert({
    user_id: user.id,
    meeting_id: meetingId,
    raw_notes: rawNotes.trim(),
    input_method: "typed",
  });
  if (noteError) return { error: noteError.message };

  const { error } = await supabase
    .from("meetings")
    .update({ notes_status: "captured" })
    .eq("id", meetingId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return {};
}


/** Mark a meeting's notes captured is handled elsewhere; this just clears the brief flag. */
export async function markBriefReviewed(meetingId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("meetings")
    .update({ meeting_brief_generated_at: new Date().toISOString() })
    .eq("id", meetingId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return {};
}

/**
 * Ask the assistant for a suggested next move (§1 "Ask Assistant"). AI is
 * optional — with no key configured this returns a clear explanation instead
 * of failing, and every other dashboard action keeps working.
 */
export async function askAssistant(
  question: string,
): Promise<{ answer?: string; error?: string; disabled?: boolean }> {
  const ai = getAiProvider();
  if (!ai.enabled) {
    return {
      disabled: true,
      error:
        "Assistant drafting is turned off. Add an Anthropic API key in Settings to switch it on — everything else on this dashboard works without it.",
    };
  }
  if (!question.trim()) return { error: "Type a question first." };

  const supabase = await createClient();
  const [lenders, { data: promises }, { data: loans }] = await Promise.all([
    getLendersWithCoverage(),
    supabase
      .from("promises")
      .select("description, due_at, direction, lender:lenders(full_name)")
      .eq("status", "open")
      .is("deleted_at", null)
      .limit(20),
    supabase
      .from("active_loans")
      .select("borrower_name, stage, next_update_due_at")
      .eq("updates_active", true)
      .is("deleted_at", null)
      .limit(20),
  ]);

  const active = lenders.filter((l) => l.active);
  const needsAttention = active
    .filter((l) => l.coverage.personal !== "on_track")
    .slice(0, 25)
    .map(
      (l) =>
        `${l.full_name} (${l.institution?.name ?? "no institution"}, ${l.territory ?? "no territory"}): ${
          l.coverage.daysSincePersonal === null
            ? "never personally contacted"
            : `${l.coverage.daysSincePersonal} days since personal contact`
        }`,
    );

  // Relationship context only — never loan documents or financials (§33).
  const context = [
    `Active lenders: ${active.length}.`,
    `Personally on track: ${active.filter((l) => l.coverage.personal === "on_track").length}.`,
    needsAttention.length > 0 ? `Needs attention:\n${needsAttention.join("\n")}` : "",
    (promises ?? []).length > 0
      ? `Open promises:\n${(promises ?? [])
          .map(
            (p) =>
              `${p.direction === "i_promised" ? "I owe" : "They owe"} — ${p.description} (${
                (p.lender as unknown as { full_name: string } | null)?.full_name ?? "unassigned"
              }, due ${p.due_at ?? "no date"})`,
          )
          .join("\n")}`
      : "",
    (loans ?? []).length > 0
      ? `Active loans awaiting weekly communication:\n${(loans ?? [])
          .map((l) => `${l.borrower_name} — ${l.stage}, next update due ${l.next_update_due_at ?? "unset"}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const result = await ai.draft({
      kind: "personal_outreach",
      instruction: `Answer this question about my lender relationships in a few short sentences. Be specific and name lenders where it helps. Question: ${question.trim()}`,
      context,
    });
    return { answer: result.text };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The assistant could not answer just now." };
  }
}
