"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, Check, Mail, Plus, RotateCcw, Search, Trash2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { matchScore } from "@/lib/fuzzy";
import type { LoanState } from "@/lib/loan-cadence";
import { LOAN_OUTCOME_LABEL, approvedTotal, isLoanOutcome, parseAmount, splitLoanBook } from "@/lib/loans";
import { cn, formatCurrency, formatDate, relativeDays } from "@/lib/utils";
import { closeLoan, createLoan, deleteLoan, reopenLoan, setApprovedAmount } from "./actions";
import { UpdateDraft } from "./update-draft";

export interface LoanRow {
  id: string;
  borrower: string;
  lenderId: string | null;
  lenderName: string | null;
  institution: string | null;
  active: boolean;
  closingOutcome: string | null;
  approvedOn: string | null;
  approvedAmount: number | null;
  lastUpdateAt: string | null;
  daysLate: number;
  state: LoanState;
}

export interface LoanLender {
  id: string;
  name: string;
  institution: string | null;
}

const STATE_STYLE: Record<LoanState, { dot: string; label: string; tone: string }> = {
  updated: { dot: "bg-teal", label: "Up to date", tone: "text-teal" },
  due: { dot: "bg-gold", label: "Due now", tone: "text-[#8a6215]" },
  overdue: { dot: "bg-danger", label: "Overdue", tone: "text-danger" },
  closed: { dot: "bg-[#c9cfdd]", label: "Not tracking", tone: "text-muted" },
};

/** Today as the browser reckons it — an approval lands on a calendar day. */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function LoanList({ rows, lenders }: { rows: LoanRow[]; lenders: LoanLender[] }) {
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<"active" | "approved">("active");

  const book = useMemo(() => splitLoanBook(rows), [rows]);
  const total = useMemo(() => approvedTotal(rows), [rows]);
  const needing = book.active.filter((r) => r.state !== "updated").length;

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Loans"
        className="flex gap-1 rounded-xl border border-hairline bg-[#f6f8fb] p-1"
      >
        <Tab
          selected={tab === "active"}
          onSelect={() => setTab("active")}
          label="Being worked"
          count={book.active.length}
        />
        <Tab
          selected={tab === "approved"}
          onSelect={() => setTab("approved")}
          label="SBA approved"
          count={book.approved.length}
        />
      </div>

      {tab === "active" ? (
        <>
          <Card>
            <CardContent className="pt-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[14px]">
                  {book.active.length === 0 ? (
                    <span className="text-muted">Nothing being tracked yet.</span>
                  ) : (
                    <>
                      <span className="font-semibold">
                        {book.active.length - needing} of {book.active.length}
                      </span>{" "}
                      <span className="text-muted">up to date this week</span>
                    </>
                  )}
                </p>
                {!adding && (
                  <Button size="sm" onClick={() => setAdding(true)}>
                    <Plus className="h-4 w-4" /> Add a loan
                  </Button>
                )}
              </div>

              {adding && <AddLoan lenders={lenders} onDone={() => setAdding(false)} />}

              {book.active.length === 0 && !adding ? (
                <EmptyState
                  title="No loans being tracked"
                  description="Add one and it starts asking for a weekly update. Logging that update also counts as a touch with the partner who sent it over."
                  className="py-8"
                />
              ) : (
                <ul className="divide-y divide-hairline">
                  {book.active.map((loan) => (
                    <LoanItem key={loan.id} loan={loan} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {book.dead.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <p className="mb-1 text-[13px] font-semibold text-muted">
                  Didn&apos;t happen ({book.dead.length})
                </p>
                <p className="mb-3 text-[12.5px] text-muted">
                  A deal that died still counts as a referral on the lender who sent it — the
                  weekly asking stops, the credit doesn&apos;t.
                </p>
                <ul className="divide-y divide-hairline">
                  {book.dead.map((loan) => (
                    <LoanItem key={loan.id} loan={loan} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="pt-6">
            {book.approved.length === 0 ? (
              <EmptyState
                title="Nothing approved yet"
                description="When a loan gets SBA approval, mark it on the other tab. It stops asking for weekly updates and lands here."
                className="py-8"
              />
            ) : (
              <>
                <div className="mb-4">
                  <p className="text-[14px]">
                    <span className="font-semibold">{total.count}</span>{" "}
                    <span className="text-muted">
                      approved{total.amount > 0 && ", "}
                    </span>
                    {total.amount > 0 && (
                      <span className="font-semibold">{formatCurrency(total.amount)}</span>
                    )}
                  </p>
                  {total.missingAmount > 0 && (
                    // Said out loud, because a total covering some of the book
                    // reads as the whole book.
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {total.missingAmount} without an amount, so the total is short.
                    </p>
                  )}
                </div>
                <ul className="divide-y divide-hairline">
                  {book.approved.map((loan) => (
                    <ApprovedItem key={loan.id} loan={loan} />
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Tab({
  selected,
  onSelect,
  label,
  count,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex-1 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
        selected ? "bg-white text-foreground shadow-sm" : "text-muted hover:text-foreground",
      )}
    >
      {label}{" "}
      <span className={cn("tabular-nums", selected ? "text-muted" : "")}>({count})</span>
    </button>
  );
}

/**
 * An approved loan: the date, the amount, and a way to add the amount later.
 *
 * No weekly-update machinery, because there is nothing left to chase. This is
 * the win column.
 */
function ApprovedItem({ loan }: { loan: LoanRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    const parsed = parseAmount(amount);
    if (parsed === null) {
      setError("Give me a number greater than zero.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setApprovedAmount(loan.id, parsed);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <li className="py-3.5 first:pt-0">
      <div className="flex flex-wrap items-start gap-3">
        <BadgeCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold">{loan.borrower}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {loan.lenderId ? (
              <Link
                href={`/partners/${loan.lenderId}`}
                className="hover:text-foreground hover:underline"
              >
                {loan.lenderName}
              </Link>
            ) : (
              "No partner linked"
            )}
            {loan.institution && ` · ${loan.institution}`}
          </p>
          <p className="mt-1 text-[12.5px] font-medium text-teal">
            Approved{loan.approvedOn && ` ${formatDate(loan.approvedOn)}`}
            {loan.approvedAmount != null && ` · ${formatCurrency(loan.approvedAmount)}`}
          </p>

          {loan.approvedAmount == null &&
            (editing ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  autoFocus
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1,250,000"
                  aria-label={`Approved amount for ${loan.borrower}`}
                  className="w-40"
                />
                <Button size="sm" onClick={save} disabled={pending}>
                  Save
                </Button>
                <Button size="sm" variant="quiet" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-1 text-[12.5px] text-primary hover:underline"
              >
                Add the amount
              </button>
            ))}
          {error && <p className="mt-1 text-[12.5px] text-danger">{error}</p>}
        </div>
      </div>
    </li>
  );
}

function AddLoan({ lenders, onDone }: { lenders: LoanLender[]; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [borrower, setBorrower] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<LoanLender | null>(null);
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
      const result = await createLoan({ borrowerName: borrower, lenderId: picked?.id ?? "" });
      if (result.error) {
        setError(result.error);
        return;
      }
      setBorrower("");
      setPicked(null);
      setQuery("");
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-border bg-background p-4">
      <div>
        <Label htmlFor="loan-borrower">Borrower</Label>
        <Input
          id="loan-borrower"
          value={borrower}
          autoFocus
          onChange={(e) => setBorrower(e.target.value)}
          placeholder="e.g. Cedar Ridge Dental"
        />
      </div>

      <div>
        <Label htmlFor="loan-lender">Who sent it over?</Label>
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
                id="loan-lender"
                value={query}
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

      {error && <p className="text-[13.5px] text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button size="touch" onClick={submit} disabled={pending || !borrower.trim() || !picked}>
          {pending ? "Adding…" : "Add loan"}
        </Button>
        <Button size="touch" variant="quiet" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function LoanItem({ loan }: { loan: LoanRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<"draft" | "handoff" | "approve" | null>(null);
  const [construction, setConstruction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const style = STATE_STYLE[loan.state];

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      setPanel(null);
      router.refresh();
    });
  }

  return (
    <li className="py-3.5 first:pt-0">
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden="true"
          className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", style.dot)}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold">{loan.borrower}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {loan.lenderId ? (
              <Link href={`/partners/${loan.lenderId}`} className="hover:text-foreground hover:underline">
                {loan.lenderName}
              </Link>
            ) : (
              "No partner linked"
            )}
            {loan.institution && ` · ${loan.institution}`}
          </p>
          <p className={cn("mt-1 text-[12.5px] font-medium", style.tone)}>
            {isLoanOutcome(loan.closingOutcome)
              ? LOAN_OUTCOME_LABEL[loan.closingOutcome]
              : style.label}
            {loan.state === "overdue" && ` · ${loan.daysLate} days late`}
            {loan.lastUpdateAt
              ? ` · last update ${relativeDays(loan.lastUpdateAt)}`
              : loan.active && " · never updated"}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {loan.active ? (
            <>
              <Button
                size="sm"
                onClick={() => setPanel((p) => (p === "draft" ? null : "draft"))}
                disabled={pending}
              >
                <Mail className="h-3.5 w-3.5" /> Draft update
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPanel((p) => (p === "approve" ? null : "approve"))}
                disabled={pending}
                title="Record the approval and stop the weekly updates"
              >
                <BadgeCheck className="h-3.5 w-3.5" /> SBA approved
              </Button>
              <Button
                size="sm"
                variant="quiet"
                onClick={() => setPanel((p) => (p === "handoff" ? null : "handoff"))}
                disabled={pending}
                title="Write the approval email to the partner, and mark it approved"
              >
                <Check className="h-3.5 w-3.5" /> Approved + email
              </Button>
              <Button
                size="sm"
                variant="quiet"
                onClick={() => run(() => closeLoan(loan.id, "did_not_happen"))}
                disabled={pending}
                title="Stops the weekly updates and sends nothing. The referral still counts."
              >
                <XCircle className="h-3.5 w-3.5" /> Deal died
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => run(() => reopenLoan(loan.id))}
                disabled={pending}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Track again
              </Button>
              <Button
                size="sm"
                variant="quiet"
                onClick={() => run(() => deleteLoan(loan.id))}
                disabled={pending}
                title="Move to Trash"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {panel === "draft" && (
        <UpdateDraft loanId={loan.id} mode="weekly" onDone={() => setPanel(null)} />
      )}

      {panel === "approve" && (
        <ApprovalForm loan={loan} onDone={() => setPanel(null)} />
      )}

      {panel === "handoff" && (
        <>
          <label className="mt-3 flex items-center gap-2 text-[13px] font-medium">
            <input
              type="checkbox"
              checked={construction}
              onChange={(e) => setConstruction(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Construction involved
          </label>
          <UpdateDraft
            loanId={loan.id}
            mode="handoff"
            construction={construction}
            onDone={() => setPanel(null)}
          />
        </>
      )}

      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
    </li>
  );
}

/**
 * The two facts worth capturing at the moment of approval.
 *
 * The date defaults to today and the amount can be left blank, because the
 * approval itself is what has to be recorded now — an amount he has to go and
 * look up would turn a one-tap action into a task for later, and later is when
 * things stop getting recorded. The Approved tab asks for what's missing.
 */
function ApprovalForm({ loan, onDone }: { loan: LoanRow; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [approvedOn, setApprovedOn] = useState(todayLocal());
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const typed = amount.trim();
    const parsed = typed === "" ? null : parseAmount(typed);
    if (typed !== "" && parsed === null) {
      setError("That amount doesn't look like a number. Leave it blank to add later.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await closeLoan(loan.id, "sba_approved", {
        approvedOn: approvedOn || null,
        amount: parsed,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-teal-border bg-teal-soft p-3.5">
      <p className="text-[13px] font-semibold">SBA approved — {loan.borrower}</p>
      <p className="mt-0.5 text-[12.5px] text-muted">
        Stops the weekly updates and moves it to the approved tab. The referral still counts.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor={`approved-on-${loan.id}`}>Approved on</Label>
          <Input
            id={`approved-on-${loan.id}`}
            type="date"
            value={approvedOn}
            onChange={(e) => setApprovedOn(e.target.value)}
            className="w-44"
          />
        </div>
        <div>
          <Label htmlFor={`approved-amount-${loan.id}`}>Amount (optional)</Label>
          <Input
            id={`approved-amount-${loan.id}`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1,250,000"
            className="w-44"
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={submit} disabled={pending}>
            <BadgeCheck className="h-3.5 w-3.5" /> Mark approved
          </Button>
          <Button size="sm" variant="quiet" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}
