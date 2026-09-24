"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarPlus,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Phone,
  RefreshCw,
  Clock3,
  Utensils,
} from "lucide-react";
import { Avatar, type AvatarStatus } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { logActivity } from "../activity-actions";
import { replacePlanItem } from "./actions";
import { ProposeMeeting } from "@/components/propose-meeting";

/** Why this lender surfaced, as a short chip rather than a sentence. */
export interface ReasonChip {
  label: string;
  tone: "blue" | "gold" | "red" | "teal" | "plum" | "slate";
}

/** The one dominant action a row leads with. */
export type PrimaryActionKind = "draft_checkin" | "invite_lunch" | "log_followup" | "draft_update";

export interface RelationshipRow {
  itemId: string;
  lenderId: string;
  name: string;
  firstName: string;
  institution: string | null;
  territory: string | null;
  email: string | null;
  mobile: string | null;
  status: AvatarStatus;
  /** Left rail colour: matches the avatar status. */
  chips: ReasonChip[];
  suggestion: string;
  primary: PrimaryActionKind;
}

const CHIP_TONE: Record<ReasonChip["tone"], string> = {
  blue: "bg-primary-soft text-[#1a4ad9]",
  gold: "bg-gold-soft text-[#8a6215]",
  red: "bg-danger-soft text-[#a8434a]",
  teal: "bg-teal-soft text-[#1f6b60]",
  plum: "bg-plum-soft text-[#5e4a85]",
  slate: "bg-[#eef1f7] text-[#59678a]",
};

const RAIL: Record<Exclude<AvatarStatus, "none">, string> = {
  overdue: "bg-danger",
  grace: "bg-gold",
  inbound: "bg-teal",
  priority: "bg-primary",
};

const PRIMARY_LABEL: Record<PrimaryActionKind, string> = {
  draft_checkin: "Draft check-in",
  invite_lunch: "Invite to lunch",
  log_followup: "Log follow-up",
  draft_update: "Draft update",
};

const PRIMARY_ICON: Record<PrimaryActionKind, React.ComponentType<{ className?: string }>> = {
  draft_checkin: Mail,
  invite_lunch: Utensils,
  log_followup: Phone,
  draft_update: Mail,
};

const VISIBLE = 5;

export function RelationshipRows({
  rows,
  completed,
  total,
  hasPlan,
}: {
  rows: RelationshipRow[];
  completed: number;
  total: number;
  hasPlan: boolean;
}) {
  const visible = rows.slice(0, VISIBLE);
  const pct = total === 0 ? 0 : (completed / total) * 100;

  return (
    <section id="this-week">
      <p className="eyebrow mb-2 text-navy/70">This week</p>

      <div className="overflow-hidden rounded-[20px] border border-border/80 bg-surface shadow-[0_10px_30px_rgba(16,24,40,0.05)]">
        <header className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div>
            <h2 className="text-[22px] font-bold tracking-[-0.02em]">
              This week&apos;s relationships
            </h2>
            <p className="mt-1 text-[13.5px] text-muted">Worst-slipping first.</p>
          </div>

          <div className="w-full max-w-[220px] shrink-0">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[12px] font-medium text-muted">Done this week</span>
              <span className="text-[13px] font-bold tabular-nums">
                {completed}
                <span className="font-medium text-muted"> of {total}</span>
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#1e5bff_0%,#5b7ce6_100%)] transition-[width] duration-500"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] font-semibold">
              <Link href="/tiers/needs-contact" className="text-primary hover:underline">
                View all Top {total || 10}
              </Link>
              <Link href="/tiers/needs-contact" className="text-muted hover:text-foreground">
                Open On Deck
              </Link>
            </div>
          </div>
        </header>

        {rows.length === 0 ? (
          <div className="px-5 pb-6 sm:px-6">
            <EmptyState
              title={hasPlan ? "Everyone on this week's list is done" : "No weekly plan yet"}
              description={
                hasPlan
                  ? "The list rebuilds at the start of next week."
                  : "Press Start weekly outreach in the header and the plan builds itself from your coverage."
              }
              className="py-10"
            />
          </div>
        ) : (
          <ul>
            {visible.map((row, i) => (
              <Row key={row.itemId} row={row} alt={i % 2 === 1} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Row({ row, alt }: { row: RelationshipRow; alt: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<"none" | "log">("none");
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      setPanel("none");
      setShowMore(false);
      router.refresh();
    });
  }

  const mailto = row.email
    ? `mailto:${row.email}?subject=${encodeURIComponent("Checking in")}`
    : null;
  const sms = row.mobile ? `sms:${row.mobile.replace(/[^\d+]/g, "")}` : null;
  const PrimaryIcon = PRIMARY_ICON[row.primary];

  /** Inviting someone out has its own screen — it needs dates, not a blank email. */
  const primaryIsProposal = row.primary === "invite_lunch";
  /** Otherwise: email where we can, else open the log panel. */
  const primaryIsEmail = !primaryIsProposal && row.primary !== "log_followup" && Boolean(mailto);

  return (
    <li
      className={cn(
        "group relative border-t border-border/70 transition-colors",
        alt ? "bg-[#FAFBFE]" : "bg-surface",
        "hover:bg-primary-soft/40",
      )}
    >
      {/* Priority rail */}
      {row.status !== "none" && (
        <span
          aria-hidden="true"
          className={cn("absolute inset-y-0 left-0 w-[3px]", RAIL[row.status])}
        />
      )}

      <div className="flex items-start gap-4 p-5 pl-6 sm:p-6 sm:pl-7">
        <Avatar name={row.name} size="xl" status={row.status} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Link
              href={`/lenders/${row.lenderId}`}
              className="text-[15.5px] font-semibold leading-tight transition-colors hover:text-primary"
            >
              {row.name}
            </Link>
            {row.institution && (
              <span className="text-[13px] text-muted">{row.institution}</span>
            )}
            {row.territory && (
              <span className="text-[12.5px] text-muted/80">· {row.territory}</span>
            )}
          </div>

          {/* Reason chips replace the old prose line */}
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {row.chips.map((chip) => (
              <li
                key={chip.label}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11.5px] font-medium",
                  CHIP_TONE[chip.tone],
                )}
              >
                {chip.tone === "red" || chip.tone === "gold" ? (
                  <Clock3 className="h-3 w-3" />
                ) : null}
                {chip.label}
              </li>
            ))}
          </ul>

          <p className="mt-2.5 text-[13.5px] text-muted">
            <span className="font-semibold text-foreground">Suggested: </span>
            {row.suggestion}
          </p>

          {/* One dominant action, quiet secondaries, the rest behind overflow */}
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {primaryIsProposal ? (
              <ProposeMeeting lenderId={row.lenderId}>
                {(open) => (
                  <Button size="touch" variant="primary" onClick={open}>
                    <PrimaryIcon className="h-4 w-4" />
                    {PRIMARY_LABEL[row.primary]}
                  </Button>
                )}
              </ProposeMeeting>
            ) : primaryIsEmail && mailto ? (
              <a
                href={mailto}
                onClick={() => setPanel("log")}
                className={buttonVariants({ variant: "primary", size: "touch" })}
              >
                <PrimaryIcon className="h-4 w-4" />
                {PRIMARY_LABEL[row.primary]}
              </a>
            ) : (
              <Button
                size="touch"
                variant="primary"
                onClick={() => setPanel(panel === "log" ? "none" : "log")}
              >
                <PrimaryIcon className="h-4 w-4" />
                {PRIMARY_LABEL[row.primary]}
              </Button>
            )}

            {sms && (
              <a
                href={sms}
                onClick={() => setPanel("log")}
                className={buttonVariants({ variant: "quiet", size: "touch" })}
                title={`Text ${row.firstName}`}
              >
                <MessageSquare className="h-4 w-4" />
                Text
              </a>
            )}
            <ProposeMeeting lenderId={row.lenderId}>
              {(open) => (
                <Button size="touch" variant="quiet" onClick={open}>
                  <CalendarPlus className="h-4 w-4" />
                  Schedule
                </Button>
              )}
            </ProposeMeeting>

            <div className="relative">
              <Button
                size="touch"
                variant="quiet"
                aria-label="More actions"
                aria-expanded={showMore}
                title="More actions"
                onClick={() => setShowMore((v) => !v)}
                className="px-2"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              {showMore && (
                <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-[0_10px_30px_rgba(16,24,40,0.12)]">
                  <button
                    disabled={pending}
                    onClick={() => run(() => replacePlanItem(row.itemId))}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13.5px] transition-colors hover:bg-primary-soft"
                  >
                    <RefreshCw className="h-4 w-4 text-muted" />
                    Replace this week
                  </button>
                  <Link
                    href={`/lenders/${row.lenderId}`}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13.5px] transition-colors hover:bg-primary-soft"
                  >
                    <Mail className="h-4 w-4 text-muted" />
                    Open full profile
                  </Link>
                </div>
              )}
            </div>
          </div>

          {panel === "log" && (
            <form
              className="animate-row-settle mt-3 space-y-2.5 rounded-xl border border-border bg-background p-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(() =>
                  logActivity({
                    lenderId: row.lenderId,
                    activityType: String(f.get("kind")),
                    summary: String(f.get("summary") ?? ""),
                  }),
                );
              }}
            >
              <p className="text-[13.5px] font-semibold">
                Log it so {row.firstName} counts as covered.
              </p>
              <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">
                <Select name="kind" defaultValue={row.primary === "log_followup" ? "call" : "personal_email"} aria-label="What happened">
                  <option value="personal_email">Email</option>
                  <option value="call">Call</option>
                  <option value="text">Text</option>
                  <option value="office_visit">Office visit</option>
                </Select>
                <Input name="summary" placeholder="Quick summary (optional)" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="touch" disabled={pending}>
                  {pending ? "Saving…" : "Log it"}
                </Button>
                <Button type="button" size="touch" variant="quiet" onClick={() => setPanel("none")}>
                  Not yet
                </Button>
              </div>
            </form>
          )}

          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      </div>
    </li>
  );
}
