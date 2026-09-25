"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TIERS, TIER_CADENCE, TIER_LABEL, readTier, type Tier } from "@/lib/tiers";
import { cn } from "@/lib/utils";
import { setLenderTier } from "@/app/(app)/partners/actions";

/**
 * The tier, changed in place.
 *
 * Tier is the one field worth editing without opening a form: it sets how often
 * this partner is due, so deciding it is the whole job of working through an
 * untiered list. Optimistic, because the answer is already on screen and
 * waiting for a round trip to see it move would make sorting a hundred people
 * feel like work.
 */
export function TierPicker({
  lenderId,
  tier,
  className,
}: {
  lenderId: string;
  tier: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const current = readTier(tier);
  const [shown, setShown] = useOptimistic(current);

  function choose(next: Tier) {
    if (next === shown) return;
    setError(null);
    startTransition(async () => {
      setShown(next);
      const result = await setLenderTier(lenderId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className={cn("inline-flex flex-col gap-1", className)}>
      <div
        role="group"
        aria-label="Tier"
        className="inline-flex overflow-hidden rounded-full border border-border bg-surface"
      >
        {TIERS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => choose(t)}
            aria-pressed={shown === t}
            title={`${TIER_LABEL[t]} — ${TIER_CADENCE[t].toLowerCase()}`}
            className={cn(
              "min-h-8 border-r border-border px-2.5 text-[12px] font-semibold transition-colors last:border-r-0",
              shown === t
                ? "bg-primary text-white"
                : "text-muted hover:bg-primary-soft hover:text-primary",
            )}
          >
            {t === "unassigned" ? "None" : t}
          </button>
        ))}
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

/** Read-only tier badge for list rows. */
export function TierBadge({ tier, className }: { tier: string | null; className?: string }) {
  const t = readTier(tier);
  return (
    <span
      title={`${TIER_LABEL[t]} — ${TIER_CADENCE[t].toLowerCase()}`}
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
        t === "A" && "bg-primary text-white",
        t === "B" && "bg-primary-soft text-[#1a4ad9]",
        t === "C" && "bg-black/[0.05] text-muted",
        t === "unassigned" && "border border-dashed border-border text-muted",
        className,
      )}
    >
      {t === "unassigned" ? "—" : t}
    </span>
  );
}
