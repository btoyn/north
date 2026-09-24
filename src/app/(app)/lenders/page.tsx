import { redirect } from "next/navigation";

/**
 * The old lender list. Spheres replaced it.
 *
 * Kept as a redirect rather than deleted because every filter chip that used to
 * live here was a URL somebody may have bookmarked, and each one has a sphere
 * that means the same thing.
 */
const VIEW_TO_SPHERE: Record<string, string> = {
  all: "by-institution",
  on_track: "on-track",
  needs_contact: "needs-contact",
  no_personal_touch: "no-personal-touch",
  campaign_only: "campaign-only",
  recently_contacted: "recently-contacted",
  upcoming_meetings: "upcoming-meetings",
  st_george: "territory-southern-utah",
  salt_lake: "territory-wasatch-front",
  active_loans: "active-loans",
  overdue_promises: "overdue-promises",
};

export default async function LendersRedirect({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const { view = "all", q } = await searchParams;
  const sphere = VIEW_TO_SPHERE[view] ?? "by-institution";
  redirect(`/tiers/${sphere}${q ? `?q=${encodeURIComponent(q)}` : ""}`);
}
