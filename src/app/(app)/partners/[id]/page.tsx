import { LenderDetail } from "@/components/lender-detail";

/**
 * A partner on their own page.
 *
 * Spheres opens the same thing in a slide-over; this route stays because a
 * partner is worth linking to, and the panel's "Open full page" has to go
 * somewhere.
 */
export default async function LenderProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ timeline?: string }>;
}) {
  const { id } = await params;
  const { timeline = "all" } = await searchParams;

  return <LenderDetail id={id} timeline={timeline} variant="page" />;
}
