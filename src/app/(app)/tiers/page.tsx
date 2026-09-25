import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { GroupProposalsNeedingAttention } from "@/components/group-proposals-attention";
import { getGroupProposals } from "@/lib/dashboard";
import { getLenderLists, getSphereRows } from "@/lib/data";
import { listSpheres } from "@/lib/lists";
import {
  SPHERE_GROUP_ORDER,
  sphereCounts,
  visibleSpheres,
  type SphereCount,
  type SphereDef,
} from "@/lib/spheres";
import { TIER_CADENCE, TIER_GOAL_DAYS } from "@/lib/tiers";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tiers" };

/**
 * Spheres — the front door to the partner book.
 *
 * Tiers first, because how often someone is worth contacting is the decision
 * everything else follows from. Underneath, the filters that used to be a row
 * of chips above the partner list, now named views you can go to.
 */
export default async function SpheresPage() {
  const [rows, groupProposals, lists] = await Promise.all([
    getSphereRows(),
    getGroupProposals(),
    getLenderLists(),
  ]);
  // A person's own lists are spheres too, they just live in a table rather
  // than in the source.
  const extra = listSpheres(lists);
  const counts = sphereCounts(rows, extra);
  const shown = visibleSpheres(counts, extra);

  const tiers = shown.filter((s) => s.group === "Tiers");
  const untiered = counts.get("tier-none")?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Tiers"
        description={`${rows.length} partner${rows.length === 1 ? "" : "s"}, sorted by who sends you deals`}
        actions={
          <Link href="/partners/new" className={buttonVariants({ variant: "primary", size: "md" })}>
            <Plus className="h-4 w-4" /> Add lender
          </Link>
        }
      />

      {/* A group ask with a yes on it has a date he could take. Needs Attention
          used to carry this; Tiers is where it lives now. */}
      <GroupProposalsNeedingAttention proposals={groupProposals} />

      {/* Tiers — the top row, each with its count and how covered it is. */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiers.map((sphere) => (
          <TierCard key={sphere.key} sphere={sphere} count={counts.get(sphere.key)!} />
        ))}
      </div>

      {untiered > 0 && (
        <p className="mb-6 rounded-xl border border-gold-border bg-gold-soft px-4 py-3 text-[13px] leading-relaxed text-[#6d5210]">
          <span className="font-semibold">
            {untiered} {untiered === 1 ? "partner has" : "partners have"} no tier yet.
          </span>{" "}
          Until one is set they&apos;re measured against the workspace goal. Open{" "}
          <Link href="/tiers/tier-none" className="font-semibold underline">
            No tier
          </Link>{" "}
          and set them from the panel — it&apos;s one tap per person.
        </p>
      )}

      {/* Saved views */}
      <div className="space-y-6">
        {SPHERE_GROUP_ORDER.filter((g) => g !== "Tiers").map((group) => {
          const inGroup = shown.filter((s) => s.group === group);
          if (inGroup.length === 0) return null;

          return (
            <section key={group}>
              <h2 className="eyebrow mb-2 text-navy/70">{group}</h2>
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <ul className="divide-y divide-border">
                  {inGroup.map((sphere) => (
                    <li key={sphere.key}>
                      <Link
                        href={`/tiers/${sphere.key}`}
                        className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-primary-soft/40"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{sphere.label}</span>
                          <span className="block truncate text-sm text-muted">
                            {sphere.description}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-muted">
                          {counts.get(sphere.key)?.total ?? 0}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

/**
 * One tier: how many, and how many of those are inside that tier's own window.
 *
 * The bar is measured against the tier's cadence, so an A tier at 60% means
 * 60% touched in the last fortnight — a harder bar than the same number on C,
 * which is the point of separating them.
 */
function TierCard({ sphere, count }: { sphere: SphereDef; count: SphereCount }) {
  const tier = sphere.tier!;
  const goal = TIER_GOAL_DAYS[tier];

  return (
    <Link
      href={`/tiers/${sphere.key}`}
      className="group flex flex-col rounded-[18px] border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:border-primary/35 hover:bg-primary-soft/25"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold">{sphere.label}</span>
        <span className="text-[22px] font-bold leading-none tabular-nums text-navy">
          {count.total}
        </span>
      </div>
      <p className="mt-0.5 text-[12.5px] text-muted">
        {sphere.description} · {TIER_CADENCE[tier].toLowerCase()}
        {goal ? ` (${goal}d)` : ""}
      </p>

      <div className="mt-3">
        <div
          className="flex h-2 w-full overflow-hidden rounded-full bg-black/[0.06]"
          role="img"
          aria-label={`${count.covered} of ${count.total} inside the window`}
        >
          <span
            className={cn(
              "h-full rounded-full transition-[width]",
              count.pct >= 80 ? "bg-teal" : count.pct >= 50 ? "bg-primary" : "bg-gold",
            )}
            style={{ width: `${count.pct}%` }}
          />
        </div>
        <p className="mt-1.5 text-[12px] text-muted">
          {count.total === 0 ? (
            "Nobody here yet"
          ) : (
            <>
              <span className="font-semibold text-foreground tabular-nums">{count.pct}%</span>{" "}
              covered · {count.covered} of {count.total}
            </>
          )}
        </p>
      </div>
    </Link>
  );
}
