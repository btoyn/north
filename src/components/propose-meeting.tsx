"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, Check, Copy, Mail, Settings2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { GroupProposalSheet } from "@/components/propose-group-meeting";
import { describeSlot, draftProposalEmail, findOpenSlots } from "@/lib/scheduling";
import { MEETING_TYPE_DURATIONS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { getProposalContext, saveProposal } from "@/app/(app)/scheduling/actions";
import type { ProposalContext } from "@/app/(app)/scheduling/actions";

/**
 * "Propose lunch" — the screen behind the button on every partner (spec §15).
 *
 * Dates are worked out here rather than on the server because availability is
 * wall-clock ("lunches 11 to 1") and the browser is the only place that knows
 * which wall clock he's on. Everything sent to the server is an absolute
 * instant.
 */

const TYPES = [
  { value: "lunch", label: "Lunch" },
  { value: "breakfast", label: "Breakfast" },
  { value: "office_visit", label: "Office visit" },
  { value: "golf", label: "Golf" },
  { value: "general", label: "Other" },
] as const;

export function ProposeMeeting({
  lenderId,
  children,
}: {
  lenderId: string;
  children: (open: () => void) => React.ReactNode;
}) {
  // The group sheet is the same ask with more people on it, so it opens from
  // here rather than sending him somewhere else to start again.
  const [mode, setMode] = useState<"closed" | "single" | "group">("closed");
  const [groupInstitutionId, setGroupInstitutionId] = useState<string | null>(null);
  const triggerWrap = useRef<HTMLSpanElement>(null);

  function close() {
    setMode("closed");
    // Put focus back where it came from without reading activeElement.
    triggerWrap.current?.querySelector<HTMLElement>("button, a")?.focus();
  }

  return (
    <>
      {/* display:contents keeps the caller's layout untouched */}
      <span ref={triggerWrap} className="contents">
        {children(() => setMode("single"))}
      </span>
      {mode === "single" && (
        <Sheet
          lenderId={lenderId}
          onClose={close}
          onInviteOthers={(institutionId) => {
            setGroupInstitutionId(institutionId);
            setMode("group");
          }}
        />
      )}
      {mode === "group" && groupInstitutionId && (
        <GroupProposalSheet
          institutionId={groupInstitutionId}
          preselectLenderIds={[lenderId]}
          onClose={close}
        />
      )}
    </>
  );
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Sheet({
  lenderId,
  onClose,
  onInviteOthers,
}: {
  lenderId: string;
  onClose: () => void;
  onInviteOthers: (institutionId: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [context, setContext] = useState<ProposalContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [meetingType, setMeetingType] = useState<string>("lunch");
  const [customLabel, setCustomLabel] = useState("");
  const [locationName, setLocationName] = useState("");

  // The suggested dates and wording are derived from the rules; these hold his
  // edits and win once set. Changing the kind of meeting clears them, so the
  // suggestion comes back rather than stale text for the wrong meeting.
  const [slotOverride, setSlotOverride] = useState<Date[] | null>(null);
  const [textOverride, setTextOverride] = useState<{ subject: string; body: string } | null>(null);

  // Pinned at mount so re-renders don't quietly shift the candidate dates.
  const [now] = useState(() => new Date());

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
    let alive = true;
    getProposalContext(lenderId).then((r) => {
      if (!alive) return;
      if (r.error || !r.context) setLoadError(r.error ?? "Could not load this partner.");
      else setContext(r.context);
    });
    return () => {
      alive = false;
    };
  }, [lenderId]);

  const rule = useMemo(
    () => context?.rules.find((r) => r.meetingType === meetingType) ?? null,
    [context, meetingType],
  );

  const suggestedSlots = useMemo(() => {
    if (!context || !rule) return [];
    return findOpenSlots({
      rule,
      durationMinutes: MEETING_TYPE_DURATIONS[meetingType] ?? 60,
      busy: context.busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) })),
      horizonDays: context.horizonDays,
      count: context.slotCount,
      now,
    });
  }, [context, rule, meetingType, now]);

  const slots = slotOverride ?? suggestedSlots;

  const draft = useMemo(
    () =>
      context
        ? draftProposalEmail({
            firstName: context.lender.firstName,
            meetingType,
            customLabel,
            slots,
            daysSinceContact: context.daysSinceContact,
          })
        : { subject: "", body: "" },
    [context, meetingType, customLabel, slots],
  );

  const subject = textOverride?.subject ?? draft.subject;
  const body = textOverride?.body ?? draft.body;

  function chooseType(next: string) {
    setMeetingType(next);
    setSlotOverride(null);
    setTextOverride(null);
  }

  const mailto = context
    ? `mailto:${context.lender.email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : "#";

  function persist(markSent: boolean) {
    if (!context) return;
    setError(null);
    startTransition(async () => {
      const result = await saveProposal({
        lenderId,
        meetingType,
        customLabel: meetingType === "general" ? customLabel : null,
        offeredSlots: slots.map((s) => s.toISOString()),
        locationName,
        subject,
        body,
        markSent,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function updateSlot(index: number, value: string) {
    const next = new Date(value);
    if (Number.isNaN(next.getTime())) return;
    setSlotOverride(slots.map((s, i) => (i === index ? next : s)));
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
        aria-labelledby="propose-title"
        className="animate-row-settle relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[20px] border border-border bg-surface shadow-[0_20px_60px_rgba(16,24,40,0.28)] sm:max-w-[560px] sm:rounded-[20px]"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <h2 id="propose-title" className="flex-1 text-[16px] font-semibold">
            {context ? `Propose a meeting with ${context.lender.firstName}` : "Propose a meeting"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-black/[0.05] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loadError ? (
          <p className="px-5 py-8 text-center text-[14px] text-danger">{loadError}</p>
        ) : !context ? (
          <p className="px-5 py-8 text-center text-[14px] text-muted">Finding open dates…</p>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex flex-col gap-4 px-5 py-4">
                {context.lender.institutionId && (
                  <button
                    type="button"
                    onClick={() => onInviteOthers(context.lender.institutionId!)}
                    className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3.5 py-2.5 text-left text-[13.5px] font-medium transition-colors hover:border-primary/40 hover:bg-primary-soft/50"
                  >
                    <UserPlus className="h-4 w-4 shrink-0 text-primary" />
                    <span>
                      Invite others from {context.lender.institutionName ?? "the same bank"}
                      <span className="block text-[12.5px] font-normal text-muted">
                        One email to the group, {context.lender.firstName} included
                      </span>
                    </span>
                  </button>
                )}

                <fieldset>
                  <legend className="mb-1.5 text-[13px] font-medium">What kind?</legend>
                  <div className="flex flex-wrap gap-2">
                    {TYPES.map((t) => (
                      <label key={t.value} className="cursor-pointer">
                        <input
                          type="radio"
                          name="meetingType"
                          value={t.value}
                          checked={meetingType === t.value}
                          onChange={() => chooseType(t.value)}
                          className="peer sr-only"
                        />
                        <span className="inline-flex h-11 items-center rounded-[10px] border border-border px-3 text-[13.5px] font-medium transition-colors peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary sm:h-9">
                          {t.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {meetingType === "general" && (
                  <div>
                    <Label htmlFor="pm-label">Call it what?</Label>
                    <Input
                      id="pm-label"
                      value={customLabel}
                      onChange={(e) => {
                        setCustomLabel(e.target.value);
                        setTextOverride(null);
                      }}
                      placeholder="e.g. a ballgame"
                    />
                  </div>
                )}

                {/* Dates */}
                {!rule ? (
                  <div className="rounded-xl border border-gold-border bg-gold-soft px-4 py-3">
                    <p className="text-[13.5px] font-semibold text-[#6d5210]">
                      No availability set for {TYPES.find((t) => t.value === meetingType)?.label}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-[#6d5210]">
                      Tell the app which days and times work and it can suggest dates.
                    </p>
                    <Link
                      href="/settings#availability"
                      onClick={onClose}
                      className="mt-2 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#6d5210] hover:underline"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      Set it up
                    </Link>
                  </div>
                ) : slots.length === 0 ? (
                  <div className="rounded-xl border border-gold-border bg-gold-soft px-4 py-3">
                    <p className="text-[13.5px] font-semibold text-[#6d5210]">
                      Nothing open in the next {context.horizonDays} days
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-[#6d5210]">
                      Every matching slot is taken or already offered to someone else. Widen the
                      window in Settings, or pick a date by hand below.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="mb-1.5 text-[13px] font-medium">
                      Offering {slots.length === 1 ? "this date" : "these dates"}
                    </p>
                    <div className="flex flex-col gap-2">
                      {slots.map((slot, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            type="datetime-local"
                            aria-label={`Date ${i + 1}`}
                            value={toLocalInputValue(slot)}
                            onChange={(e) => updateSlot(i, e.target.value)}
                          />
                          <button
                            type="button"
                            aria-label={`Remove ${describeSlot(slot)}`}
                            onClick={() => setSlotOverride(slots.filter((_, j) => j !== i))}
                            className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-black/[0.05] hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[12px] text-muted">
                      {context.calendar === "outlook"
                        ? "Worked out from your availability, what's already booked, and your Outlook calendar."
                        : context.calendar === "outlook_unavailable"
                          ? "Outlook didn't answer just now, so these avoid only what the app already knows about — check them before you send."
                          : "Worked out from your availability and what's already booked. It can't see your Outlook calendar yet — check these before you send."}
                    </p>
                  </div>
                )}

                <div>
                  <Label htmlFor="pm-location">Where (optional)</Label>
                  <Input
                    id="pm-location"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="e.g. Market Street Grill"
                  />
                </div>

                <div>
                  <Label htmlFor="pm-subject">Subject</Label>
                  <Input
                    id="pm-subject"
                    value={subject}
                    onChange={(e) => setTextOverride({ subject: e.target.value, body })}
                  />
                </div>

                <div>
                  <Label htmlFor="pm-body">Message</Label>
                  <textarea
                    id="pm-body"
                    value={body}
                    rows={7}
                    onChange={(e) => setTextOverride({ subject, body: e.target.value })}
                    className="w-full rounded-[10px] border border-border bg-background px-3 py-2.5 text-[14px] leading-relaxed outline-none transition-colors focus:border-primary/40"
                  />
                  {textOverride && (
                    <button
                      type="button"
                      onClick={() => setTextOverride(null)}
                      className="mt-1 text-[12.5px] font-medium text-primary hover:underline"
                    >
                      Reset to the suggested wording
                    </button>
                  )}
                </div>

                {!context.lender.email && (
                  <p className="text-[13px] text-muted">
                    No email address on file for {context.lender.firstName} — copy the message and
                    send it however you normally would.
                  </p>
                )}

                {error && <p className="text-[13.5px] text-danger">{error}</p>}
              </div>
            </div>

            <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-border bg-surface px-5 py-3.5">
              <a
                href={mailto}
                onClick={() => persist(true)}
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-[10px] bg-primary px-4 text-[14px] font-semibold text-white shadow-[0_2px_8px_rgba(30,91,255,0.3)] transition-colors hover:bg-primary/90",
                  (pending || slots.length === 0) && "pointer-events-none opacity-50",
                )}
              >
                <Mail className="h-4 w-4" />
                Open in email
              </a>
              <Button
                type="button"
                size="touch"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  navigator.clipboard?.writeText(body);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                type="button"
                size="touch"
                variant="secondary"
                disabled={pending || slots.length === 0}
                onClick={() => persist(false)}
              >
                <CalendarPlus className="h-4 w-4" />
                Save for later
              </Button>
              <Button type="button" size="touch" variant="quiet" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
