"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Check,
  ChevronLeft,
  Coffee,
  DoorOpen,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Undo2,
  Utensils,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { matchScore } from "@/lib/fuzzy";
import { cn, relativeDays } from "@/lib/utils";
import { quickLogTouch, undoQuickLog } from "@/app/(app)/activity-actions";
import type { QuickLogData, QuickLogLender } from "@/lib/data";

/** The handful of things actually logged ad hoc. Call leads — it's the common one. */
const TYPES = [
  { value: "call", label: "Call", icon: Phone },
  { value: "text", label: "Text", icon: MessageSquare },
  { value: "personal_email", label: "Email", icon: Mail },
  { value: "lunch", label: "Lunch", icon: Utensils },
  { value: "breakfast", label: "Coffee", icon: Coffee },
  { value: "pop_in", label: "Pop-in", icon: DoorOpen },
] as const;

type ActivityType = (typeof TYPES)[number];

/** What a finished save hands back so the toast can name it and take it back. */
interface Logged {
  activityId?: string;
  label: string;
}

function localNow(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function QuickLog({
  data,
  children,
}: {
  data: QuickLogData;
  /** Render prop for the trigger, so callers control placement. */
  children: (open: () => void) => React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [logged, setLogged] = useState<Logged | null>(null);
  const triggerWrap = useRef<HTMLSpanElement>(null);

  /** Send focus back to the trigger on close, so keyboard users don't lose their place. */
  const close = useCallback(() => {
    setIsOpen(false);
    triggerWrap.current?.querySelector<HTMLElement>("button, a")?.focus();
  }, []);

  const onLogged = useCallback(
    (result: Logged) => {
      setLogged(result);
      close();
    },
    [close],
  );

  return (
    <>
      {/* display:contents keeps the caller's layout untouched */}
      <span ref={triggerWrap} className="contents">
        {children(() => setIsOpen(true))}
      </span>
      {isOpen && <Sheet data={data} onClose={close} onLogged={onLogged} />}
      {logged && <UndoBar logged={logged} onDismiss={() => setLogged(null)} />}
    </>
  );
}

/**
 * The price of committing on the second tap: a mis-tap has to be takeable-back
 * without hunting for the row. Sits above the mobile tab bar, gone in ten
 * seconds.
 */
function UndoBar({ logged, onDismiss }: { logged: Logged; onDismiss: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(onDismiss, 10_000);
    return () => clearTimeout(t);
  }, [logged, onDismiss]);

  function undo() {
    if (!logged.activityId) return;
    setError(null);
    startTransition(async () => {
      const result = await undoQuickLog(logged.activityId!);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onDismiss();
    });
  }

  return (
    <div
      role="status"
      className="animate-row-settle fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-40 mx-auto flex w-[min(100%-1.5rem,420px)] items-center gap-3 rounded-[14px] border border-border bg-surface px-4 py-3 shadow-[0_12px_32px_rgba(16,24,40,0.22)] sm:bottom-6"
    >
      <Check className="h-4 w-4 shrink-0 text-[#1f6b60]" />
      <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
        {error ?? `${logged.label} logged`}
      </p>
      {logged.activityId && !error && (
        <button
          onClick={undo}
          disabled={pending}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[13.5px] font-semibold text-primary transition-colors hover:bg-primary-soft disabled:opacity-50"
        >
          <Undo2 className="h-3.5 w-3.5" />
          {pending ? "Undoing…" : "Undo"}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-black/[0.05] hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Sheet({
  data,
  onClose,
  onLogged,
}: {
  data: QuickLogData;
  onClose: () => void;
  onLogged: (result: Logged) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<QuickLogLender | null>(null);
  /** Step 2 defaults to the six tiles; the full form is opt-in. */
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [showPromise, setShowPromise] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Escape closes; body scroll locks while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    if (!selected) searchRef.current?.focus();
  }, [selected]);

  const byId = useMemo(
    () => new Map(data.lenders.map((l) => [l.id, l])),
    [data.lenders],
  );

  const results = useMemo(() => {
    if (!query.trim()) {
      return data.suggestedIds
        .map((id) => byId.get(id))
        .filter((l): l is QuickLogLender => Boolean(l));
    }
    // matchScore already gates weak fuzzy hits internally, so anything above
    // zero is a real match — same threshold the lender list uses.
    return data.lenders
      .map((l) => ({
        lender: l,
        score: matchScore(query, { name: l.name, institution: l.institution }),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.lender);
  }, [query, data.lenders, data.suggestedIds, byId]);

  function pick(lender: QuickLogLender) {
    setSelected(lender);
    setShowDetails(false);
    setError(null);
  }

  function back() {
    setSelected(null);
    setShowDetails(false);
    setShowPromise(false);
    setError(null);
  }

  /**
   * The two-tap path: person, kind, done. Occurred-at is left off so the server
   * stamps now, which is the truth in every case this path is for — the ones
   * you're backdating go through Details.
   */
  function quickSave(type: ActivityType) {
    if (!selected || pending) return;
    const lender = selected;
    setError(null);
    setSaving(type.value);
    startTransition(async () => {
      const result = await quickLogTouch({
        lenderId: lender.id,
        activityType: type.value,
      });
      setSaving(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onLogged({
        activityId: result.activityId,
        label: `${type.label} with ${lender.name.split(" ")[0]}`,
      });
    });
  }

  function submit(form: HTMLFormElement, keepOpen: boolean) {
    if (!selected) return;
    const f = new FormData(form);
    const description = String(f.get("promise") ?? "").trim();
    const lender = selected;
    const kind = String(f.get("kind"));

    setError(null);
    startTransition(async () => {
      const result = await quickLogTouch({
        lenderId: lender.id,
        activityType: kind,
        occurredAt: String(f.get("occurredAt") ?? ""),
        summary: String(f.get("summary") ?? ""),
        initiatedByLender: f.get("inbound") === "on",
        promise: description
          ? {
              direction: String(f.get("direction")) as "i_promised" | "they_promised",
              description,
              dueAt: String(f.get("promiseDue") ?? "") || undefined,
            }
          : undefined,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      router.refresh();

      if (keepOpen) {
        setSavedCount((n) => n + 1);
        setJustSaved(lender.name);
        back();
      } else {
        const label = TYPES.find((t) => t.value === kind)?.label ?? "Touch";
        onLogged({
          activityId: result.activityId,
          label: `${label} with ${lender.name.split(" ")[0]}`,
        });
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-navy/35 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quicklog-title"
        className="animate-row-settle relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[20px] border border-border bg-surface shadow-[0_20px_60px_rgba(16,24,40,0.28)] sm:max-w-[520px] sm:rounded-[20px]"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          {selected && (
            <button
              onClick={back}
              aria-label="Back to lender list"
              className="-ml-1 rounded-lg p-1.5 text-muted transition-colors hover:bg-black/[0.05] hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <h2 id="quicklog-title" className="flex-1 text-[16px] font-semibold">
            {selected ? `Log with ${selected.name.split(" ")[0]}` : "Log a call"}
          </h2>
          {savedCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2.5 py-1 text-[11.5px] font-semibold text-[#1f6b60]">
              <Check className="h-3 w-3" />
              {savedCount} logged
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-black/[0.05] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step 1 — who */}
        {!selected ? (
          <div className="flex min-h-0 flex-col">
            <div className="relative border-b border-border px-5 py-3">
              <Search className="pointer-events-none absolute left-8 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search lenders…"
                aria-label="Search lenders"
                className="h-11 w-full rounded-[10px] border border-border bg-background pl-9 pr-3 text-[14.5px] outline-none transition-colors focus:border-primary/40"
              />
            </div>

            {justSaved && (
              <p className="border-b border-border bg-teal-soft/50 px-5 py-2.5 text-[13px] text-[#1f6b60]">
                Logged with {justSaved}. Pick the next one.
              </p>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {!query.trim() && (
                <p className="px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  This week &amp; recent
                </p>
              )}

              {results.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-[14px] font-medium">No lender matches “{query}”</p>
                  <p className="mt-1 text-[13px] text-muted">
                    Check the spelling, or add them first.
                  </p>
                  <Link
                    href="/lenders/new"
                    onClick={onClose}
                    className="mt-3 inline-flex text-[13.5px] font-semibold text-primary hover:underline"
                  >
                    Add a new lender →
                  </Link>
                </div>
              ) : (
                <ul className="pb-2">
                  {results.map((lender) => (
                    <li key={lender.id}>
                      <button
                        onClick={() => pick(lender)}
                        className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-primary-soft/60"
                      >
                        <Avatar name={lender.name} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[14.5px] font-semibold">
                              {lender.name}
                            </span>
                            {lender.onThisWeeksList && (
                              <span className="shrink-0 rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1a4ad9]">
                                This week
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted">
                            {lender.institution && (
                              <>
                                <Building2 className="h-3 w-3 shrink-0" />
                                <span className="truncate">{lender.institution}</span>
                              </>
                            )}
                            <span className="shrink-0">
                              {lender.institution ? "· " : ""}
                              last spoke {relativeDays(lender.lastTouchAt)}
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : !showDetails ? (
          /* Step 2 — one tap finishes it */
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-4 px-5 py-4">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                <Avatar name={selected.name} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold">{selected.name}</p>
                  <p className="text-[12.5px] text-muted">
                    {selected.institution ?? "No institution"} · last spoke{" "}
                    {relativeDays(selected.lastTouchAt)}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[13px] font-medium">What happened? Tap to save.</p>
                <div className="grid grid-cols-3 gap-2.5">
                  {TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => quickSave(t)}
                      disabled={pending}
                      aria-busy={saving === t.value}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 rounded-[14px] border border-border bg-background py-4 text-[13.5px] font-semibold transition-colors",
                        "hover:border-primary/50 hover:bg-primary-soft hover:text-primary",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                        saving === t.value && "border-primary bg-primary-soft text-primary",
                        pending && saving !== t.value && "opacity-50",
                      )}
                    >
                      <t.icon className="h-5 w-5" />
                      {saving === t.value ? "Saving…" : t.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-muted">
                  Saves it as right now. You can undo straight after.
                </p>
              </div>

              {error && <p className="text-[13.5px] text-danger">{error}</p>}

              <button
                type="button"
                onClick={() => setShowDetails(true)}
                disabled={pending}
                className="self-start text-[13.5px] font-semibold text-primary hover:underline disabled:opacity-50"
              >
                Add a summary, backdate it, or catch a promise →
              </button>
            </div>
          </div>
        ) : (
          /* Step 2, the long way — everything the tiles leave out */
          <form
            className="min-h-0 flex-1 overflow-y-auto"
            onSubmit={(e) => {
              e.preventDefault();
              submit(e.currentTarget, false);
            }}
          >
            <div className="flex flex-col gap-4 px-5 py-4">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                <Avatar name={selected.name} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold">{selected.name}</p>
                  <p className="text-[12.5px] text-muted">
                    {selected.institution ?? "No institution"} · last spoke{" "}
                    {relativeDays(selected.lastTouchAt)}
                  </p>
                </div>
              </div>

              <fieldset>
                <legend className="mb-1.5 text-[13px] font-medium">What happened?</legend>
                <div className="flex flex-wrap gap-2">
                  {TYPES.map((t, i) => (
                    <label key={t.value} className="cursor-pointer" title={t.label}>
                      <input
                        type="radio"
                        name="kind"
                        value={t.value}
                        defaultChecked={i === 0}
                        className="peer sr-only"
                      />
                      <span className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border border-border px-3 text-[13.5px] font-medium transition-colors peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary sm:h-9">
                        <t.icon className="h-4 w-4" />
                        {t.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <Label htmlFor="ql-when">When</Label>
                <Input
                  id="ql-when"
                  name="occurredAt"
                  type="datetime-local"
                  defaultValue={localNow()}
                />
                <p className="mt-1 text-[12px] text-muted">
                  Backdate it if you&apos;re catching up — coverage counts from when you spoke.
                </p>
              </div>

              <div>
                <Label htmlFor="ql-summary">Summary (optional)</Label>
                <Input
                  id="ql-summary"
                  name="summary"
                  placeholder="What did you talk about?"
                />
              </div>

              <label className="flex items-center gap-2.5 text-[13.5px]">
                <input
                  type="checkbox"
                  name="inbound"
                  className="h-4 w-4 rounded border-border text-primary"
                />
                They reached out to me
              </label>

              {/* Optional promise — collapsed so the fast path stays fast */}
              {showPromise ? (
                <div className="flex flex-col gap-2.5 rounded-xl border border-plum-border bg-plum-soft/40 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[13.5px] font-semibold">Anything promised?</p>
                    <button
                      type="button"
                      onClick={() => setShowPromise(false)}
                      className="text-[12.5px] font-medium text-muted hover:text-foreground"
                    >
                      Remove
                    </button>
                  </div>
                  <Select name="direction" defaultValue="i_promised" aria-label="Who promised">
                    <option value="i_promised">I promised</option>
                    <option value="they_promised">They promised</option>
                  </Select>
                  <Input name="promise" placeholder="e.g. send the 504 comparison sheet" />
                  <div>
                    <Label htmlFor="ql-promise-due">Due</Label>
                    <Input id="ql-promise-due" name="promiseDue" type="date" />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowPromise(true)}
                  className="self-start text-[13.5px] font-semibold text-primary hover:underline"
                >
                  + Add a promise from this call
                </button>
              )}

              {error && <p className="text-[13.5px] text-danger">{error}</p>}
            </div>

            <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-border bg-surface px-5 py-3.5">
              <Button type="submit" size="touch" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                size="touch"
                variant="secondary"
                disabled={pending}
                onClick={(e) => {
                  const form = (e.currentTarget as HTMLElement).closest("form");
                  if (form) submit(form as HTMLFormElement, true);
                }}
              >
                Save &amp; log another
              </Button>
              <Button
                type="button"
                size="touch"
                variant="quiet"
                onClick={onClose}
                className={cn(pending && "pointer-events-none opacity-50")}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
