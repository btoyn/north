import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { LenderDetail } from "@/components/lender-detail";
import { LenderSlideOver } from "@/components/lender-slide-over";
import { FlatLenderList, GroupedLenderList, type SphereListLender } from "@/components/sphere-lists";
import { getLenderLists, getSphereRows } from "@/lib/data";
import { listSpheres } from "@/lib/lists";
import { findSphere, lendersInSphere, sphereCounts } from "@/lib/spheres";
import { groupLenders } from "@/lib/lender-groups";
import { TIER_CADENCE } from "@/lib/tiers";
import { matchScore } from "@/lib/fuzzy";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  // A list's name lives in the database, so the tab title needs it too.
  const lists = await getLenderLists();
  return { title: findSphere(key, listSpheres(lists))?.label ?? "Sphere" };
}

/**
 * One sphere: its lenders, and whoever you have open.
 *
 * The lender lives in the URL rather than in component state, so the panel
 * survives a refresh and can be linked to — and closing it is a navigation back
 * to the list you were already looking at, not a re-fetch of it.
 */
export default async function SpherePage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ q?: string; lender?: string; timeline?: string }>;
}) {
  const { key } = await params;
  const { q, lender: openLenderId, timeline = "all" } = await searchParams;

  const [rows, lists] = await Promise.all([getSphereRows(), getLenderLists()]);
  const extra = listSpheres(lists);

  const sphere = findSphere(key, extra);
  if (!sphere) notFound();

  const counts = sphereCounts(rows, extra);
  const count = counts.get(sphere.key)!;

  let list = lendersInSphere(rows, sphere);

  if (q) {
    // Ranked by how well the name matched, so grouping would throw the answer
    // away — a search always shows the flat list.
    list = list
      .map((row) => ({
        row,
        score: matchScore(q, { name: row.fullName, institution: row.institution ?? undefined }),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.row);
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const openLender = openLenderId ? byId.get(openLenderId) : undefined;

  const lenders: SphereListLender[] = list.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    title: row.title,
    institution: row.institution,
    territory: row.territory,
    isSample: row.isSample,
    tier: row.tier,
    daysSincePersonal: row.coverage.daysSincePersonal,
    daysSinceVisible: row.coverage.daysSinceVisible,
    coverageStatus: row.coverage.personal,
    dealOnly: row.dealOnly,
  }));

  const grouped = sphere.layout === "grouped" && !q;
  const sections = grouped
    ? groupLenders(lenders, (l) => ({
        territory: l.territory,
        institution: l.institution,
        needsAttention: l.coverageStatus !== "on_track",
        daysSinceTouch: l.daysSinceVisible,
      }))
    : [];

  /* Closing the panel drops the lender from the URL and keeps everything else. */
  const closeParams = new URLSearchParams();
  if (q) closeParams.set("q", q);
  const closeHref = closeParams.toString()
    ? `/spheres/${sphere.key}?${closeParams.toString()}`
    : `/spheres/${sphere.key}`;

  return (
    <>
      <Link
        href="/spheres"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        All spheres
      </Link>

      <PageHeader
        title={sphere.label}
        description={
          sphere.tier
            ? `${sphere.description} · ${TIER_CADENCE[sphere.tier].toLowerCase()} · ${count.covered} of ${count.total} inside the window`
            : `${sphere.description} · ${count.total} lender${count.total === 1 ? "" : "s"}`
        }
      />

      <div className="mb-4">
        <Suspense>
          <SearchInput placeholder="Search by name or bank…" />
        </Suspense>
      </div>

      {lenders.length === 0 ? (
        <EmptyState
          title={q ? `Nobody here matches “${q}”` : "This sphere is empty"}
          description={
            q
              ? "Try a different spelling — search checks names and institutions."
              : "Nobody meets this view's rule right now. That's usually good news."
          }
        />
      ) : grouped ? (
        <GroupedLenderList sections={sections} startExpanded={lenders.length <= 40} />
      ) : (
        <FlatLenderList lenders={lenders} />
      )}

      {openLenderId && (
        <LenderSlideOver
          name={openLender?.fullName ?? "Lender"}
          lenderId={openLenderId}
          closeHref={closeHref}
        >
          {/* A Server Component passed as children: its queries never reach the
              browser, and the panel shell stays a thin client wrapper. */}
          <LenderDetail id={openLenderId} timeline={timeline} variant="panel" />
        </LenderSlideOver>
      )}
    </>
  );
}
