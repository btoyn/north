"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Search, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CoverageBadge } from "@/components/ui/badge";
import { TierBadge } from "@/components/tier-picker";
import { matchScore } from "@/lib/fuzzy";
import { describeLastTouch } from "@/lib/lender-groups";
import { cn } from "@/lib/utils";
import type { CoverageStatus } from "@/lib/coverage";

export interface SearchableLender {
  id: string;
  name: string;
  institution: string | null;
  email: string | null;
  tier: string;
  coverageStatus: CoverageStatus;
  /** Any touch, campaign included — the same figure the partner list shows. */
  daysSinceTouch: number | null;
}

/** Enough to choose from without becoming a list to read. */
const MAX_RESULTS = 6;

/**
 * Jump straight to a person from the dashboard.
 *
 * The whole list is already on the page — the dashboard loads every partner to
 * work out coverage — so matching happens in the browser with no round trip.
 * Typing gives answers on the keystroke, which is the difference between a
 * search box people use and one they scroll past on their way to the nav.
 *
 * Fuzzy, by name, bank or email, using the same scorer as the partner list and
 * the quick-log sheet. One definition of "matches", so the same three letters
 * find the same person wherever they are typed.
 */
export function LenderSearch({ lenders }: { lenders: SearchableLender[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return lenders
      .map((l) => ({
        lender: l,
        score: matchScore(query, { name: l.name, institution: l.institution, email: l.email }),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.lender);
  }, [query, lenders]);

  // Clicking away closes the results without clearing what was typed.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // "/" focuses the box, the way every search field worth using does. Ignored
  // while something else is already taking typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (typing) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function go(id: string) {
    setOpen(false);
    setQuery("");
    router.push(`/partners/${id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (query) setQuery("");
      else inputRef.current?.blur();
      return;
    }
    if (results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active].id);
    }
  }

  const showResults = open && query.trim().length > 0;

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          // Back to the top on every keystroke, so the highlight is always on
          // a row that still exists as the list narrows under it.
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search partners by name, bank or email"
        aria-label="Search partners"
        role="combobox"
        aria-expanded={showResults}
        aria-controls="lender-search-results"
        aria-autocomplete="list"
        className="h-12 w-full rounded-[12px] border border-border bg-surface pl-10 pr-10 text-[15px] shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-colors focus:border-primary/40"
      />
      {query && (
        <button
          onClick={() => {
            setQuery("");
            setActive(0);
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted transition-colors hover:bg-black/[0.05] hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {showResults && (
        <ul
          id="lender-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-[12px] border border-border bg-surface shadow-[0_12px_32px_rgba(16,24,40,0.18)]"
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-[13.5px] text-muted">
              No lender matches “{query}”
            </li>
          ) : (
            results.map((lender, i) => (
              <li key={lender.id} role="option" aria-selected={i === active}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(lender.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    i === active && "bg-primary-soft/60",
                  )}
                >
                  <Avatar name={lender.name} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14.5px] font-semibold">{lender.name}</span>
                      <TierBadge tier={lender.tier} />
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted">
                      {lender.institution && (
                        <>
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{lender.institution}</span>
                          <span className="shrink-0">·</span>
                        </>
                      )}
                      <span className="shrink-0">{describeLastTouch(lender.daysSinceTouch)}</span>
                    </span>
                  </span>
                  <CoverageBadge status={lender.coverageStatus} />
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
