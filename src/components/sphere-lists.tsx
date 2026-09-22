"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { CoverageBadge, SampleBadge } from "@/components/ui/badge";
import { TierBadge } from "@/components/tier-picker";
import { describeLastTouch, type TerritorySection } from "@/lib/lender-groups";
import type { CoverageStatus } from "@/lib/coverage";
import { cn } from "@/lib/utils";

/**
 * The two ways a sphere lists its lenders: flat, or grouped by territory and
 * bank.
 *
 * Both open the lender in the slide-over by putting them in the URL rather than
 * navigating away, so the list — and how far down it you had scrolled — is
 * still there behind the panel.
 */

/** Only what a row needs to render. */
export interface SphereListLender {
  id: string;
  fullName: string;
  title: string | null;
  institution: string | null;
  territory: string | null;
  isSample: boolean;
  tier: string;
  daysSincePersonal: number | null;
  /** Any touch, campaign included — drives the group's last-touch line. */
  daysSinceVisible: number | null;
  coverageStatus: CoverageStatus;
  /** Inside their window on the weekly loan update alone. */
  dealOnly: boolean;
}

/** Adds the lender to the current URL, keeping the search and the sphere. */
function useLenderHref(): (id: string) => string {
  const pathname = usePathname();
  const params = useSearchParams();
  return (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("lender", id);
    // A panel opened on a fresh lender starts on their whole timeline.
    next.delete("timeline");
    return `${pathname}?${next.toString()}`;
  };
}

function TouchLine({ days }: { days: number | null }) {
  return (
    <span className="text-muted" title="Days since last personal touch">
      {days !== null ? (days === 0 ? "today" : `${days}d ago`) : "no personal touch"}
    </span>
  );
}

export function FlatLenderList({ lenders }: { lenders: SphereListLender[] }) {
  const hrefFor = useLenderHref();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <ul className="divide-y divide-border">
        {lenders.map((l) => (
          <li key={l.id}>
            <Link
              href={hrefFor(l.id)}
              scroll={false}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-primary-soft/40"
            >
              <TierBadge tier={l.tier} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{l.fullName}</span>
                  {l.isSample && <SampleBadge />}
                  {l.dealOnly && <DealOnlyBadge />}
                </div>
                <p className="truncate text-sm text-muted">
                  {[l.institution, l.title, l.territory].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <TouchLine days={l.daysSincePersonal} />
                <CoverageBadge status={l.coverageStatus} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GroupedLenderList({
  sections,
  /** Expanded from the start when a filter or search has already narrowed things. */
  startExpanded = false,
}: {
  sections: TerritorySection<SphereListLender>[];
  startExpanded?: boolean;
}) {
  const hrefFor = useLenderHref();
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(startExpanded ? sections.flatMap((s) => s.groups.map((g) => g.key)) : []),
  );

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allKeys = sections.flatMap((s) => s.groups.map((g) => g.key));
  const allOpen = allKeys.length > 0 && allKeys.every((k) => open.has(k));

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(allKeys))}
          className="text-[12.5px] font-medium text-primary hover:underline"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>

      {sections.map((section) => (
        <section key={section.territory}>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{section.territory}</h2>
            <span className="text-[12.5px] text-muted">
              {section.total} {section.total === 1 ? "lender" : "lenders"}
              {section.groups.length > 1 && ` · ${section.groups.length} institutions`}
            </span>
            {section.needingAttention > 0 && (
              <span className="text-[12.5px] font-semibold text-[#9a6f14]">
                {section.needingAttention} need attention
              </span>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            {section.groups.map((group, i) => {
              const isOpen = open.has(group.key);
              return (
                <div key={group.key} className={i > 0 ? "border-t border-border" : undefined}>
                  <button
                    type="button"
                    onClick={() => toggle(group.key)}
                    aria-expanded={isOpen}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary-soft/40",
                      isOpen && "bg-primary-soft/25",
                    )}
                  >
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted transition-transform duration-150",
                        isOpen && "rotate-90",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-[14.5px] font-semibold">{group.institution}</span>
                      <span className="ml-2 text-[12.5px] text-muted">
                        {group.members.length}{" "}
                        {group.members.length === 1 ? "person" : "people"}
                        {" · "}
                        {describeLastTouch(group.lastTouchDays)}
                      </span>
                    </span>
                    {group.needingAttention > 0 && (
                      <span className="shrink-0 rounded-full bg-gold-soft px-2 py-0.5 text-[11.5px] font-bold tabular-nums text-[#9a6f14]">
                        {group.needingAttention} to reach
                      </span>
                    )}
                  </button>

                  {isOpen && (
                    <ul className="divide-y divide-border border-t border-border bg-background/40">
                      {group.members.map((l) => (
                        <li key={l.id}>
                          <Link
                            href={hrefFor(l.id)}
                            scroll={false}
                            className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 pl-11 pr-4 transition-colors hover:bg-primary-soft/40"
                          >
                            <TierBadge tier={l.tier} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[14px] font-medium">{l.fullName}</span>
                                {l.isSample && <SampleBadge />}
                              </div>
                              {l.title && (
                                <p className="truncate text-[12.5px] text-muted">{l.title}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-[13px]">
                              <TouchLine days={l.daysSincePersonal} />
                              <CoverageBadge status={l.coverageStatus} />
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Marks a lender the Friday email is carrying on its own.
 *
 * Deliberately quiet: they are covered, so this is a note rather than a
 * warning. It sits beside the name so it reads as something true about the
 * relationship, not as a job on a list.
 */
function DealOnlyBadge() {
  return (
    <span
      title="Covered by the weekly loan update and nothing else"
      className="shrink-0 rounded-full border border-plum-border bg-plum-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-plum"
    >
      Deal only
    </span>
  );
}
