import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  HeartHandshake,
  Minus,
  MessageSquareDot,
} from "lucide-react";
import { Sparkline } from "@/components/charts/sparkline";
import { DateTile, IconCircle, type IconCircleTone } from "@/components/ui/icon-circle";
import { MEETING_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { CoverageSplitKey, CoverageSplitSegment, LoanStatus } from "@/lib/dashboard";

/**
 * Relationship Momentum — one composed surface, three zones, then a full-width
 * coverage bar. Colour carries meaning: blue for relationship activity, gold for
 * pending work, teal for confirmed and healthy.
 *
 * Approval volume and dollars are deliberately absent: this app tracks lenders,
 * not loans, and production numbers live in the separate system Brandon uses.
 */

export interface MomentumProps {
  coverage: {
    pct: number;
    covered: number;
    active: number;
    change30: number | null;
    trend: number[];
    /** One entry per active lender, for the no-history fallback. */
    dots: CoverageSplitKey[];
  };
  loans: { statuses: LoanStatus[]; dueNow: number };
  meetings: {
    upcoming: number;
    next: { title: string; startAt: string | null; type: string; withWhom: string | null } | null;
    awaitingNotes: number;
  };
  split: CoverageSplitSegment[];
}

const DOT_STYLE: Record<CoverageSplitKey, string> = {
  personal: "bg-primary",
  campaign: "bg-gold",
  uncovered: "bg-[#ccd3e0]",
};

const DOT_LABEL: Record<CoverageSplitKey, string> = {
  personal: "Personal touch",
  campaign: "Campaign only",
  uncovered: "Uncovered",
};

/** Faint alpine contour texture. Decorative, 3% opacity, stretches to fill. */
function ContourTexture() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.03]"
      viewBox="0 0 1200 300"
      preserveAspectRatio="none"
      fill="none"
    >
      {[0, 30, 60, 90, 120, 150, 180, 210, 240].map((offset, i) => (
        <path
          key={offset}
          d={`M-40 ${250 - offset} C 140 ${218 - offset}, 250 ${276 - offset}, 430 ${242 - offset} S 700 ${186 - offset}, 880 ${226 - offset} S 1120 ${266 - offset}, 1240 ${210 - offset}`}
          stroke="#0b1d3a"
          strokeWidth={i % 3 === 0 ? 1.6 : 1}
        />
      ))}
    </svg>
  );
}

function ZoneHead({
  icon,
  tone,
  label,
  right,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: IconCircleTone;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2.5">
        <IconCircle icon={icon} tone={tone} size="sm" />
        <span className="eyebrow text-muted">{label}</span>
      </span>
      {right}
    </div>
  );
}

function TrendLabel({ change }: { change: number }) {
  const flat = change === 0;
  const up = change > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11.5px] font-semibold",
        flat ? "text-muted" : up ? "text-teal" : "text-danger",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {flat ? "Flat in 30 days" : `${up ? "+" : "−"}${Math.abs(change)} points in 30 days`}
    </span>
  );
}

// Three zones into a 1/2/3-column grid: at the two-column width the third zone
// would leave a hole beside it, so it spans the full row instead.
const ZONE_BORDERS = [
  "",
  "border-t border-border/70 sm:border-t-0 sm:border-l",
  "border-t border-border/70 sm:col-span-2 xl:col-span-1 xl:border-t-0 xl:border-l",
];

export function RelationshipMomentum({ coverage, loans, meetings, split }: MomentumProps) {
  const total = split.reduce((sum, s) => sum + s.count, 0);
  const updatedLoans = loans.statuses.filter((l) => l.state === "updated").length;
  const overdueLoans = loans.statuses.filter((l) => l.state === "overdue").length;
  // The headline counts completed touches, so it stays navy; urgency lives in
  // the per-loan blocks, the icon tint and the action button.
  const loanTone = loans.statuses.length === 0 ? "text-muted" : "text-navy";

  return (
    <section>
      <div className="relative overflow-hidden rounded-[20px] border border-border/70 bg-[linear-gradient(168deg,#eef2fa_0%,#f8fafd_46%,#fdfdff_100%)] shadow-[0_10px_30px_rgba(16,24,40,0.05)]">
        <ContourTexture />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(700px 280px at 88% -14%, rgba(242,185,75,0.13) 0%, rgba(242,185,75,0.05) 42%, rgba(242,185,75,0) 72%)",
          }}
        />

        <div className="relative">
          <div className="flex items-baseline justify-between gap-3 px-5 pt-4 sm:px-6">
            <h2 className="eyebrow text-navy/70">Relationship momentum</h2>
            <span className="text-[11.5px] text-muted">rolling 30-day goal</span>
          </div>

          <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {/* ---- A. Personal coverage ---- */}
            <div className={cn("flex min-h-[186px] flex-col p-5 sm:p-6", ZONE_BORDERS[0])}>
              <ZoneHead icon={HeartHandshake} tone="blue" label="Personal coverage" />
              <Link href="/tiers/needs-contact" className="group mt-3 block">
                <p className="text-[38px] font-bold leading-none tracking-[-0.03em] text-primary tabular-nums group-hover:text-primary-hover">
                  {coverage.pct}
                  <span className="text-[22px] font-semibold">%</span>
                </p>
                <p className="mt-1.5 text-[13px] text-muted">
                  <span className="font-semibold text-foreground">
                    {coverage.covered} of {coverage.active}
                  </span>{" "}
                  lenders
                </p>
              </Link>

              <div className="mt-auto pt-4">
                {coverage.trend.length >= 2 ? (
                  <>
                    <Sparkline
                      values={coverage.trend}
                      className="h-10 w-full"
                      label="Personal coverage across the last eight weeks"
                    />
                    {coverage.change30 !== null && (
                      <div className="mt-1">
                        <TrendLabel change={coverage.change30} />
                      </div>
                    )}
                  </>
                ) : (
                  /* No history yet — show the roster itself rather than an empty chart. */
                  <>
                    <div className="flex flex-wrap gap-[5px]" role="img" aria-label={dotSummary(coverage.dots)}>
                      {coverage.dots.map((state, i) => (
                        <span
                          key={i}
                          title={DOT_LABEL[state]}
                          className={cn("h-[9px] w-[9px] rounded-full", DOT_STYLE[state])}
                        />
                      ))}
                    </div>
                    <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
                      {(["personal", "campaign", "uncovered"] as CoverageSplitKey[]).map((k) => (
                        <li key={k} className="inline-flex items-center gap-1.5 text-[10.5px] text-muted">
                          <span className={cn("h-2 w-2 rounded-full", DOT_STYLE[k])} />
                          {DOT_LABEL[k]}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>

            {/* ---- B. Weekly loan communication ---- */}
            <div className={cn("flex min-h-[186px] flex-col p-5 sm:p-6", ZONE_BORDERS[1])}>
              <ZoneHead
                icon={MessageSquareDot}
                tone={overdueLoans > 0 ? "red" : loans.dueNow > 0 ? "gold" : "teal"}
                label="Loan communication"
              />
              <p className={cn("mt-3 text-[38px] font-bold leading-none tracking-[-0.03em] tabular-nums", loanTone)}>
                {loans.statuses.length === 0 ? "—" : updatedLoans}
                {loans.statuses.length > 0 && (
                  <span className="text-[22px] font-semibold text-muted">
                    {" "}
                    of {loans.statuses.length}
                  </span>
                )}
              </p>
              <p className="mt-1.5 text-[13px] text-muted">
                {loans.statuses.length === 0 ? "No active loans" : "updated this week"}
              </p>

              <div className="mt-auto pt-4">
                {loans.statuses.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {loans.statuses.slice(0, 8).map((loan) => (
                      <span
                        key={loan.id}
                        title={`${loan.borrower} — ${
                          loan.state === "updated"
                            ? "updated"
                            : loan.state === "overdue"
                              ? `overdue by ${loan.daysLate} days`
                              : "update due"
                        }`}
                        className={cn(
                          "h-2.5 min-w-[28px] flex-1 rounded-full",
                          loan.state === "updated"
                            ? "bg-teal"
                            : loan.state === "overdue"
                              ? "bg-danger"
                              : "bg-gold",
                        )}
                      />
                    ))}
                  </div>
                )}
                {loans.dueNow > 0 ? (
                  <Link
                    href="/loans"
                    className="mt-2.5 inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-gold px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#b47d16] sm:h-8 sm:px-3"
                  >
                    {loans.dueNow} update{loans.dueNow === 1 ? "" : "s"} due
                  </Link>
                ) : (
                  <p className="mt-2.5 text-[11.5px] font-semibold text-teal">
                    {loans.statuses.length === 0 ? "Nothing to chase" : "All current"}
                  </p>
                )}
              </div>
            </div>

            {/* ---- C. Meetings ---- */}
            <div className={cn("flex min-h-[186px] flex-col p-5 sm:p-6", ZONE_BORDERS[2])}>
              <ZoneHead icon={CalendarDays} tone="teal" label="Meetings" />
              <p className="mt-3 text-[38px] font-bold leading-none tracking-[-0.03em] text-teal tabular-nums">
                {meetings.upcoming}
              </p>
              <p className="mt-1.5 text-[13px] text-muted">confirmed ahead</p>

              <div className="mt-auto pt-4">
                {meetings.next ? (
                  <Link
                    href="/tiers/upcoming-meetings"
                    className="flex items-center gap-3 rounded-xl border border-border p-2 transition-colors hover:border-teal-border hover:bg-teal-soft/50"
                  >
                    <DateTile date={meetings.next.startAt} tone="teal" />
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-semibold text-foreground">
                        {MEETING_TYPE_LABELS[meetings.next.type] ?? meetings.next.type}
                        {meetings.next.withWhom ? ` · ${meetings.next.withWhom}` : ""}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-muted">
                        {meetings.next.startAt
                          ? new Date(meetings.next.startAt).toLocaleString("en-US", {
                              weekday: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "Time not set"}
                      </span>
                    </span>
                  </Link>
                ) : (
                  <p className="text-[12px] leading-relaxed text-muted">
                    Nothing booked. Scheduling one covers that lender immediately.
                  </p>
                )}
              </div>
            </div>

          </div>

          {/* ---- Full-width coverage split ---- */}
          {total > 0 && (
            <div className="border-t border-border/70 px-5 py-4 sm:px-6">
              <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-black/[0.04]">
                {split
                  .filter((s) => s.count > 0)
                  .map((s) => (
                    <Link
                      key={s.key}
                      href={s.href}
                      title={`${s.label}: ${s.count} — ${s.hint}`}
                      className="h-full transition-opacity first:rounded-l-full last:rounded-r-full hover:opacity-80"
                      style={{
                        width: `${(s.count / total) * 100}%`,
                        backgroundColor: s.color,
                        minWidth: 8,
                      }}
                    >
                      <span className="sr-only">
                        {s.label}: {s.count} lenders
                      </span>
                    </Link>
                  ))}
              </div>
              <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
                {split.map((s) => (
                  <li key={s.key}>
                    <Link
                      href={s.href}
                      className="-mx-1 inline-flex min-h-[40px] items-center gap-1.5 px-1 text-[12.5px] text-muted transition-colors hover:text-foreground sm:min-h-0"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.label}
                      <span className="font-semibold text-foreground tabular-nums">{s.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function dotSummary(dots: CoverageSplitKey[]): string {
  const counts = dots.reduce<Record<string, number>>((acc, d) => {
    acc[d] = (acc[d] ?? 0) + 1;
    return acc;
  }, {});
  return `${counts.personal ?? 0} with a personal touch, ${counts.campaign ?? 0} campaign only, ${counts.uncovered ?? 0} uncovered`;
}
