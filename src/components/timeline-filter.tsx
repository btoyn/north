"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { TIMELINE_FILTERS } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Timeline filter chips.
 *
 * Builds its links from whatever URL it finds itself on, so the same chips work
 * on the partner page (`/partners/x?timeline=deals`) and inside the Spheres
 * slide-over (`/tiers/tier-a?partner=x&timeline=deals`) without either screen
 * having to hand down a base path.
 */
export function TimelineFilter({ active }: { active: string }) {
  const pathname = usePathname();
  const params = useSearchParams();

  function hrefFor(key: string): string {
    const next = new URLSearchParams(params.toString());
    if (key === "all") next.delete("timeline");
    else next.set("timeline", key);
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {TIMELINE_FILTERS.map((f) => (
        <Link
          key={f.key}
          href={hrefFor(f.key)}
          scroll={false}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            active === f.key
              ? "border-primary bg-primary-soft text-primary"
              : "border-border text-muted hover:text-foreground",
          )}
        >
          {f.label}
        </Link>
      ))}
    </div>
  );
}
