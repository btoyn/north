"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, Check, Copy, Mail, Settings2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { describeSlot, findOpenSlots } from "@/lib/scheduling";
import { draftGroupProposalEmail, formatNameList } from "@/lib/group-proposal";
import { MEETING_TYPE_DURATIONS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  getGroupProposalContext,
  saveGroupProposal,
  type GroupProposalContext,
} from "@/app/(app)/scheduling/group-actions";

/**
 * Taking a bank's team to lunch.
 *
 * The same shape as the single-partner sheet — dates worked out here in his own
 * wall clock, one draft he proofs, nothing sent by the app — with a picker on
 * the front. Nobody is ticked to begin with: some of these banks have a dozen
 * people and inviting all of them is not the idea.
 */

const TYPES = [
  { value: "lunch", label: "Lunch" },
  { value: "breakfast", label: "Breakfast" },
  { value: "office_visit", label: "Office visit" },
  { value: "golf", label: "Golf" },
  { value: "general", label: "Other" },
] as const;

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function GroupProposalSheet({
  institutionId,
  preselectLenderIds = [],
  onClose,
}: {
  institutionId: string;
  /** Already chosen elsewhere — the partner he opened the single sheet on. */
  preselectLenderIds?: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [context, setContext] = useState<GroupProposalContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [selected, setSelected] = useState<string[]>(preselectLenderIds);
  const [showAllTerritories, setShowAllTerritories] = useState(false);
  const [meetingType, setMeetingType] = useState<string>("lunch");
  const [customLabel, setCustomLabel] = useState("");
  const [locationName, setLocationName] = useState("");
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
    getGroupProposalContext(institutionId).then((r) => {
      if (!alive) return;
      if (r.error || !r.context) setLoadError(r.error ?? "Could not load this institution.");
      else setContext(r.context);
    });
    return () => {
      alive = false;
    };
  }, [institutionId]);

  const territory = context?.planningTerritory ?? null;

  // Everyone at the bank, but the list starts on the territory this trip is
  // in — six banks straddle two of them and they're visited separately.
  const visible = useMemo(() => {
    if (!context) return [];
    if (showAllTerritories || !territory) return context.lenders;
    return context.lenders.filter((l) => l.territory === territory || selected.includes(l.id));
  }, [context, showAllTerritories, territory, selected]);

  const hiddenCount = (context?.lenders.length ?? 0) - visible.length;

  const chosen = useMemo(
    () => (context?.lenders ?? []).filter((l) => selected.includes(l.id)),
    [context, selected],
  );

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
      draftGroupProposalEmail({
        firstNames: chosen.map((l) => l.firstName),
        meetingType,
        customLabel,
        slots,
      }),
    [chosen, meetingType, customLabel, slots],
  );

  const subject = textOverride?.subject ?? draft.subject;
  const body = textOverride?.body ?? draft.body;

  // One email, everyone on it, all of them visible to each other. Seeing that
  // a peer is coming is half of why these work.
  const mailto = `mailto:${chosen
    .map((l) => l.email)
    .filter(Boolean)
    .join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  function toggle(lenderId: string) {
    setSelected((prev) =>
      prev.includes(lenderId) ? prev.filter((id) => id !== lenderId) : [...prev, lenderId],
    );
    setTextOverride(null);
  }

  function chooseType(next: string) {
    setMeetingType(next);
    setSlotOverride(null);
    setTextOverride(null);
  }

  function updateSlot(index: number, value: string) {
    const next = new Date(value);
    if (Number.isNaN(next.getTime())) return;
    setSlotOverride(slots.map((s, i) => (i === index ? next : s)));
  }

  function persist(markSent: boolean) {
    if (!context) return;
    setError(null);
    startTransition(async () => {
      const result = await saveGroupProposal({
        institutionId,
        lenderIds: selected,
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

  const ready = selected.length > 0 && slots.length > 0;

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
        aria-labelledby="group-propose-title"
        className="animate-row-settle relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[20px] border border-border bg-surface shadow-[0_20px_60px_rgba(16,24,40,0.28)] sm:max-w-[560px] sm:rounded-[20px]"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <h2 id="group-propose-title" className="flex-1 text-[16px] font-semibold">
            {context ? `Get the ${context.institution.name} group together` : "Group meeting"}
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
          <p className="px-5 py-8 text-center text-[14px] text-muted">Loading the team…</p>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex flex-col gap-4 px-5 py-4">
                {/* Who */}
                <fieldset>
                  <legend className="mb-1.5 text-[13px] font-medium">
                    Who&apos;s coming?
                    {territory && !showAllTerritories && (
                      <span className="ml-1.5 font-normal text-muted">{territory}</span>
                    )}
                  </legend>

                  {visible.length === 0 ? (
                    <p className="rounded-xl border border-border bg-background px-4 py-3 text-[13px] text-muted">
                      Nobody at this bank is in {territory}.
                    </p>
                  ) : (
                    <ul className="overflow-hidden rounded-xl border border-border">
                      {visible.map((l) => {
                        const invitable = Boolean(l.email);
                        const isOn = selected.includes(l.id);
                        return (
                          <li key={l.id} className="border-b border-border last:border-b-0">
                            <label
                              className={cn(
                                "flex min-h-11 cursor-pointer items-center gap-3 px-3.5 py-2.5",
                                isOn && "bg-primary-soft/50",
                                !invitable && "cursor-not-allowed opacity-60",
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isOn}
                                disabled={!invitable}
                                onChange={() => toggle(l.id)}
                                className="h-4 w-4 shrink-0 accent-primary"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[14px] font-medium">
                                  {l.fullName}
                                </span>
                                <span className="block truncate text-[12.5px] text-muted">
                                  {invitable
                                    ? [l.title, showAllTerritories ? l.territory : null]
                                        .filter(Boolean)
                                        .join(" · ")
                                    : "No email address on file — can't be sent a proposal"}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {territory && (hiddenCount > 0 || showAllTerritories) && (
                    <button
                      type="button"
                      onClick={() => setShowAllTerritories((v) => !v)}
                      className="mt-1.5 text-[12.5px] font-medium text-primary hover:underline"
                    >
                      {showAllTerritories
                        ? `Just ${territory}`
                        : `Show ${hiddenCount} more from other territories`}
                    </button>
                  )}
                </fieldset>

                <fieldset>
                  <legend className="mb-1.5 text-[13px] font-medium">What kind?</legend>
                  <div className="flex flex-wrap gap-2">
                    {TYPES.map((t) => (
                      <label key={t.value} className="cursor-pointer">
                        <input
                          type="radio"
                          name="groupMeetingType"
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
                    <Label htmlFor="gpm-label">Call it what?</Label>
                    <Input
                      id="gpm-label"
                      value={customLabel}
                      onChange={(e) => {
                        setCustomLabel(e.target.value);
                        setTextOverride(null);
                      }}
                      placeholder="e.g. a ballgame"
                    />
                  </div>
                )}

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
                      Everyone gets both dates and answers for themselves.{" "}
                      {context.calendar === "outlook"
                        ? "Checked against your Outlook calendar."
                        : context.calendar === "outlook_unavailable"
                          ? "Outlook didn't answer just now — check these before you send."
                          : "It can't see your Outlook calendar yet — check these before you send."}
                    </p>
                  </div>
                )}

                <div>
                  <Label htmlFor="gpm-location">Where (optional)</Label>
                  <Input
                    id="gpm-location"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="e.g. Market Street Grill"
                  />
                </div>

                <div>
                  <Label htmlFor="gpm-subject">Subject</Label>
                  <Input
                    id="gpm-subject"
                    value={subject}
                    onChange={(e) => setTextOverride({ subject: e.target.value, body })}
                  />
                </div>

                <div>
                  <Label htmlFor="gpm-body">Message</Label>
                  <textarea
                    id="gpm-body"
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

                {selected.length > 0 && (
                  <p className="text-[12.5px] text-muted">
                    One email to {formatNameList(chosen.map((l) => l.firstName))}, all on the same
                    message so they can see who else is coming.
                  </p>
                )}

                {error && <p className="text-[13.5px] text-danger">{error}</p>}
              </div>
            </div>

            <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-border bg-surface px-5 py-3.5">
              <a
                href={ready ? mailto : "#"}
                onClick={() => ready && persist(true)}
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-[10px] bg-primary px-4 text-[14px] font-semibold text-white shadow-[0_2px_8px_rgba(30,91,255,0.3)] transition-colors hover:bg-primary/90",
                  (pending || !ready) && "pointer-events-none opacity-50",
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
                disabled={pending || !ready}
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

/**
 * The button on an institution: propose one meeting to several of its people.
 */
export function ProposeGroupMeeting({
  institutionId,
  className,
}: {
  institutionId: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="touch"
        variant="secondary"
        className={className}
        onClick={() => setIsOpen(true)}
      >
        <Users className="h-4 w-4" />
        Propose a group meeting
      </Button>
      {isOpen && (
        <GroupProposalSheet institutionId={institutionId} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
