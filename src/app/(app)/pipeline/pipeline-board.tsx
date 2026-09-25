"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Search, Trash2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { matchScore } from "@/lib/fuzzy";
import {
  PIPELINE_COLUMNS,
  lookTitle,
  type LookState,
  type LookStatus,
} from "@/lib/looks";
import { describeReferrals } from "@/lib/referrals";
import { cn, relativeDays } from "@/lib/utils";
import { deleteLook, logLook, moveLook } from "./actions";

/**
 * Pipeline — every look on a board, in the column it's actually in.
 *
 * A list sorted by follow-up date answered "what's late". It never answered
 * "how much is moving", which is the question a pipeline is for. Three columns
 * do: raised, chased, closed as business.
 *
 * Cards drag, and they also carry arrows. Dragging is the fast path on a
 * laptop; the arrows are how this works on a phone in a parking lot, which is
 * where most of these get logged.
 */

export interface LookRow {
  id: string;
  borrowerName: string | null;
  notes: string | null;
  stage: string;
  status: LookStatus;
  receivedAt: string | null;
  lenderId: string | null;
  lenderName: string | null;
  institution: string | null;
  attempts: number;
  dormantReason: string | null;
  daysLate: number;
  state: LookState;
}

export interface LookLender {
  id: string;
  name: string;
  institution: string | null;
}

/** A partner and everything they've sent you, however it ended. */
export interface ReferrerRow {
  id: string;
  name: string;
  count: number;
  funded: number;
  died: number;
}

const STATE_STYLE: Record<LookState, { dot: string; label: string; tone: string }> = {
  scheduled: { dot: "bg-teal", label: "Follow-up set", tone: "text-teal" },
  due: { dot: "bg-gold", label: "Follow up now", tone: "text-[#8a6215]" },
  overdue: { dot: "bg-danger", label: "Follow-up overdue", tone: "text-danger" },
  became_loan: { dot: "bg-primary", label: "Became a loan", tone: "text-primary" },
  went_nowhere: { dot: "bg-[#c9cfdd]", label: "Went nowhere", tone: "text-muted" },
};

const COLUMN_ORDER = PIPELINE_COLUMNS.map((c) => c.status);

export function PipelineBoard({
  rows,
  lenders,
  topLenders,
}: {
  rows: LookRow[];
  lenders: LookLender[];
  topLenders: ReferrerRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<LookStatus | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);

  /** A card dropped on a column is the same move its arrows make. */
  function drop(status: LookStatus, lookId: string) {
    setDropError(null);
    startTransition(async () => {
      const result = await moveLook(lookId, status);
      if (result.error) {
        setDropError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const onBoard = rows.filter((r) => r.status !== "went_nowhere");
  const offBoard = rows.filter((r) => r.status === "went_nowhere");
  const owed = onBoard.filter((r) => r.state === "due" || r.state === "overdue").length;

  return (
    <div className="space-y-5" aria-busy={pending}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px]">
          {onBoard.length === 0 ? (
            <span className="text-muted">Nothing on the board.</span>
          ) : owed === 0 ? (
            <>
              <span className="font-semibold">{onBoard.length}</span>{" "}
              <span className="text-muted">
                {onBoard.length === 1 ? "look" : "looks"} in play, all followed up
              </span>
            </>
          ) : (
            <>
              <span className="font-semibold text-[#8a6215]">{owed}</span>{" "}
              <span className="text-muted">
                {owed === 1 ? "needs" : "need"} a follow-up · {onBoard.length} in play
              </span>
            </>
          )}
        </p>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Log a look
          </Button>
        )}
      </div>

      {adding && (
        <Card>
          <CardContent className="pt-6">
            <AddLook lenders={lenders} onDone={() => setAdding(false)} />
          </CardContent>
        </Card>
      )}

      {dropError && <p className="text-[13px] text-danger">{dropError}</p>}

      {rows.length === 0 && !adding && (
        <EmptyState
          title="No looks yet"
          description="Any time a partner mentions a possible deal — even a vague one, even without a borrower name — log it here and it will come back for follow-up."
          className="py-8"
        />
      )}

      {/* The board. One column per phase, scrolling sideways on a phone. */}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {PIPELINE_COLUMNS.map((column) => {
          const cards = onBoard.filter((r) => r.status === column.status);
          return (
            <section
              key={column.status}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                setOver(column.status);
              }}
              onDragLeave={() => setOver((c) => (c === column.status ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) drop(column.status, id);
              }}
              className={cn(
                "flex w-[86vw] shrink-0 snap-start flex-col rounded-[18px] border bg-surface transition-colors sm:w-[320px] md:w-auto",
                over === column.status
                  ? "border-primary bg-primary-soft/40"
                  : "border-border/80",
              )}
            >
              <div className="border-b border-border/70 px-4 py-3">
                <p className="flex items-baseline gap-2">
                  <span className="text-[14px] font-semibold">{column.label}</span>
                  <span className="text-[13px] tabular-nums text-muted">{cards.length}</span>
                </p>
                <p className="mt-0.5 text-[12px] text-muted">{column.description}</p>
              </div>

              <div className="flex min-h-[120px] flex-col gap-2.5 p-3">
                {cards.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[12.5px] text-muted">
                    Nothing here
                  </p>
                ) : (
                  cards.map((look) => (
                    <LookCard
                      key={look.id}
                      look={look}
                      onDragStart={() => setDragging(look.id)}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      dragging={dragging === look.id}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {topLenders.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-1 text-[13px] font-semibold">Who&apos;s reaching out</p>
            <p className="mb-3 text-[12.5px] text-muted">
              Every deal they&apos;ve brought you — looks and loans, funded or not
            </p>
            <ul className="space-y-2.5">
              {topLenders.map((l) => (
                <li key={l.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/partners/${l.id}`}
                      className="block truncate text-[13.5px] font-medium hover:underline"
                    >
                      {l.name}
                    </Link>
                    <span className="block text-[11.5px] text-muted">
                      {describeReferrals({
                        lenderId: l.id,
                        total: l.count,
                        funded: l.funded,
                        died: l.died,
                        open: l.count - l.funded - l.died,
                      })}
                    </span>
                  </span>
                  <div
                    aria-hidden="true"
                    className="h-1.5 rounded-full bg-primary"
                    style={{ width: `${(l.count / topLenders[0].count) * 30 + 8}%` }}
                  />
                  <span className="w-6 shrink-0 text-right text-[13px] tabular-nums text-muted">
                    {l.count}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {offBoard.length > 0 && <WentNowhere looks={offBoard} />}
    </div>
  );
}

/** Closed as nothing. Off the board, still findable. */
function WentNowhere({ looks }: { looks: LookRow[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardContent className="pt-6">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 text-left"
        >
          <span className="flex-1 text-[13px] font-semibold text-muted">
            Went nowhere ({looks.length})
          </span>
          <ChevronRight
            className={cn(
              "h-4 w-4 text-muted transition-transform duration-150",
              open && "rotate-90",
            )}
          />
        </button>

        {open && (
          <ul className="mt-3 flex flex-col gap-2.5">
            {looks.map((look) => (
              <LookCard key={look.id} look={look} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type Panel = "note" | "nowhere" | null;

function LookCard({
  look,
  onDragStart,
  onDragEnd,
  dragging = false,
}: {
  look: LookRow;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  dragging?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<Panel>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const style = STATE_STYLE[look.state];
  const index = COLUMN_ORDER.indexOf(look.status);
  const previous = index > 0 ? COLUMN_ORDER[index - 1] : null;
  const next = index >= 0 && index < COLUMN_ORDER.length - 1 ? COLUMN_ORDER[index + 1] : null;

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      setPanel(null);
      setNote("");
      router.refresh();
    });
  }

  /** Moving into "Followed up" is worth a note; everything else just moves. */
  function move(status: LookStatus) {
    if (status === "followed_up") {
      setPanel((p) => (p === "note" ? null : "note"));
      return;
    }
    run(() => moveLook(look.id, status));
  }

  return (
    <li
      draggable={Boolean(onDragStart)}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", look.id);
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onDrop={(e) => e.preventDefault()}
      className={cn(
        "list-none rounded-xl border border-border bg-background p-3 transition-opacity",
        onDragStart && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", style.dot)}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold leading-snug">
            {lookTitle({ borrowerName: look.borrowerName, notes: look.notes })}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {look.lenderId ? (
              <Link
                href={`/partners/${look.lenderId}`}
                className="hover:text-foreground hover:underline"
              >
                {look.lenderName}
              </Link>
            ) : (
              "No partner linked"
            )}
            {look.receivedAt && ` · ${relativeDays(look.receivedAt)}`}
          </p>
          <p className={cn("mt-1 text-[12px] font-medium", style.tone)}>
            {style.label}
            {look.state === "overdue" && ` · ${look.daysLate}d late`}
            {look.attempts > 0 && ` · ${look.attempts}×`}
            {look.dormantReason && ` · ${look.dormantReason}`}
          </p>
          {look.borrowerName && look.notes && (
            <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-muted">
              {look.notes}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-1">
        {previous && (
          <button
            type="button"
            onClick={() => move(previous)}
            disabled={pending}
            aria-label={`Move back to ${PIPELINE_COLUMNS[index - 1].label}`}
            title={`Move back to ${PIPELINE_COLUMNS[index - 1].label}`}
            className="rounded-lg border border-border p-1.5 text-muted transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}
        {next && (
          <button
            type="button"
            onClick={() => move(next)}
            disabled={pending}
            aria-label={`Move to ${PIPELINE_COLUMNS[index + 1].label}`}
            title={`Move to ${PIPELINE_COLUMNS[index + 1].label}`}
            className="rounded-lg border border-border p-1.5 text-muted transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}

        <span className="flex-1" />

        {look.status === "went_nowhere" ? (
          <>
            <Button
              size="xs"
              variant="secondary"
              onClick={() => run(() => moveLook(look.id, "new"))}
              disabled={pending}
            >
              Reopen
            </Button>
            <button
              type="button"
              onClick={() => run(() => deleteLook(look.id))}
              disabled={pending}
              aria-label="Move to Trash"
              title="Move to Trash"
              className="rounded-lg p-1.5 text-muted transition-colors hover:text-danger disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setPanel((p) => (p === "nowhere" ? null : "nowhere"))}
            disabled={pending}
            aria-label="Went nowhere"
            title="Went nowhere"
            className="rounded-lg p-1.5 text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {panel === "note" && (
        <div className="mt-2.5 space-y-2 rounded-lg border border-border bg-surface p-3">
          <Label htmlFor={`fu-${look.id}`} className="text-[12.5px]">
            What did you tell them? (optional)
          </Label>
          <textarea
            id={`fu-${look.id}`}
            value={note}
            rows={3}
            autoFocus
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Walked him through the 51% occupancy rule. Sending a sources and uses."
            className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] leading-relaxed outline-none transition-colors focus:border-primary/40"
          />
          <p className="text-[11.5px] text-muted">
            Saved to {look.lenderName ?? "the partner"}&apos;s timeline, counts as a touch, and sets
            the next follow-up.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => run(() => moveLook(look.id, "followed_up", note))}
              disabled={pending}
            >
              {pending ? "Saving…" : "Log it"}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setPanel(null)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {panel === "nowhere" && (
        <div className="mt-2.5 space-y-2 rounded-lg border border-border bg-surface p-3">
          <Label htmlFor={`nw-${look.id}`} className="text-[12.5px]">
            Why? (optional)
          </Label>
          <Input
            id={`nw-${look.id}`}
            value={note}
            autoFocus
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Borrower went conventional"
          />
          <p className="text-[11.5px] text-muted">Stops the follow-up clock. The record stays.</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => run(() => moveLook(look.id, "went_nowhere", note))}
              disabled={pending}
            >
              {pending ? "Saving…" : "Close it"}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setPanel(null)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
    </li>
  );
}

function AddLook({ lenders, onDone }: { lenders: LookLender[]; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<LookLender | null>(null);
  const [notes, setNotes] = useState("");
  const [borrower, setBorrower] = useState("");
  const [error, setError] = useState<string | null>(null);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return lenders
      .map((l) => ({ l, score: matchScore(query, { name: l.name, institution: l.institution }) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((r) => r.l);
  }, [query, lenders]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await logLook({
        lenderId: picked?.id ?? "",
        notes,
        borrowerName: borrower,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotes("");
      setBorrower("");
      setPicked(null);
      setQuery("");
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="look-lender">Who brought it up?</Label>
        {picked ? (
          <div className="flex items-center gap-2 rounded-[10px] border border-primary/40 bg-primary-soft/50 px-3 py-2">
            <span className="flex-1 text-[14px] font-medium">{picked.name}</span>
            <button
              type="button"
              onClick={() => setPicked(null)}
              aria-label="Pick a different partner"
              className="rounded-lg p-1 text-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                id="look-lender"
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search partners…"
                className="pl-9"
              />
            </div>
            {results.length > 0 && (
              <ul className="mt-1 overflow-hidden rounded-[10px] border border-border">
                {results.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(l)}
                      className="flex w-full items-baseline gap-2 px-3 py-2 text-left transition-colors hover:bg-primary-soft/60"
                    >
                      <span className="text-[14px] font-medium">{l.name}</span>
                      {l.institution && (
                        <span className="text-[12.5px] text-muted">{l.institution}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div>
        <Label htmlFor="look-notes">What did they ask about?</Label>
        <textarea
          id="look-notes"
          value={notes}
          rows={3}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Wondered whether a dental practice buying its own building qualifies for 504. Owner-occupied, thinks around $2M. Said he'd get me the details."
          className="w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13.5px] leading-relaxed outline-none transition-colors focus:border-primary/40"
        />
      </div>

      <div>
        <Label htmlFor="look-borrower">Borrower, if there is one yet</Label>
        <Input
          id="look-borrower"
          value={borrower}
          onChange={(e) => setBorrower(e.target.value)}
          placeholder="Optional"
        />
      </div>

      {error && <p className="text-[13.5px] text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button size="touch" onClick={submit} disabled={pending || !picked || !notes.trim()}>
          {pending ? "Saving…" : "Log it"}
        </Button>
        <Button size="touch" variant="quiet" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
