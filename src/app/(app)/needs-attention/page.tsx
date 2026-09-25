import { redirect } from "next/navigation";

/**
 * Needs Attention folded into Spheres.
 *
 * It was one saved view wearing a nav item, and its filters were the same
 * filters the partner list had. Each one lands on the sphere that means it.
 */
const FILTER_TO_SPHERE: Record<string, string> = {
  all: "needs-contact",
  grace: "needs-contact",
  overdue: "needs-contact",
  seriously_overdue: "needs-contact",
  campaign_only: "campaign-only",
  no_personal: "no-personal-touch",
  active_loan: "active-loans",
  open_promise: "overdue-promises",
};

export default async function NeedsAttentionRedirect({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const { f = "all" } = await searchParams;
  redirect(`/tiers/${FILTER_TO_SPHERE[f] ?? "needs-contact"}`);
}
