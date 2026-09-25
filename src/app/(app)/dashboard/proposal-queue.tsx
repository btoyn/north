"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarCheck, Clock, MessageSquareReply, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { readReply } from "@/lib/reply-reader";
import { isUnreadReply } from "@/lib/proposal-replies";
import { describeSlot } from "@/lib/scheduling";
import { describeGroupProgress, tallyGroupReplies, type SlotVerdict } from "@/lib/group-proposal";
import { MEETING_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  bookProposal,
  cancelProposal,
  nudgeProposal,
  recordProposalReply,
} from "@/app/(app)/scheduling/actions";
import type { GroupProposalRow, ProposalQueue as QueueData, ProposalRow } from "@/lib/dashboard";

/**
 * Meetings he's asked for and hasn't nailed down yet (spec §15, steps 11–13).
 *
 * Reading the reply happens here, in the browser, because resolving "the 21st"
 * needs his wall clock. The reading is always shown before anything is booked —
 * an auto-booked meeting nobody agreed to is the one failure worth designing
 * against.
 */
export function ProposalQueue({ data }: { data: QueueData }) {
  if (data.needsDecision.length === 0 && data.waiting.length === 0 && data.groups.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[18px] border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <h2 className="eyebrow text-navy/70">Meetings in the works</h2>
        {data.waiting.length > 0 && (
          <span className="text-[12.5px] text-muted">
            {data.waiting.length} waiting on a reply
          </span>
        )}
      </div>

      <ul className="flex flex-col divide-y divide-hairline">
        {data.needsDecision.map((p) => (
          <DecisionRow key={p.id} proposal={p} />
        ))}
        {data.groups.map((p) => (
          <GroupRow key={p.id} proposal={p} chaseDays={data.chaseDays} />
        ))}
        {data.waiting.map((p) => (
          <WaitingRow key={p.id} proposal={p} chaseDays={data.chaseDays} />
        ))}
      </ul>
    </section>
  );
}

function typeLabel(p: ProposalRow): string {
  return p.customLabel?.trim() || MEETING_TYPE_LABELS[p.meetingType] || "Meeting";
}

/** A custom label like "a ballgame" is written lower-case; capitalise it when
 *  it has to start a sentence. */
function typeLabelLeading(p: ProposalRow): string {
  const label = typeLabel(p);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Replied, and needs a yes or no from him. */
function DecisionRow({ proposal }: { proposal: ProposalRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const slotIso =
    proposal.status === "countered" ? proposal.counteredSlot : proposal.offeredSlots[0];
  const slot = slotIso ? new Date(slotIso) : null;

  function book() {
    if (!slotIso) return;
    setError(null);
    startTransition(async () => {
      const result = await bookProposal(proposal.id, slotIso);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function dismiss() {
    startTransition(async () => {
      await cancelProposal(proposal.id);
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-2.5 py-3.5 first:pt-0">
      <div className="flex items-start gap-3">
        <Avatar name={proposal.lenderName} size="md" status="inbound" />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold">
            <Link href={`/partners/${proposal.lenderId}`} className="hover:underline">
              {proposal.lenderName}
            </Link>{" "}
            <span className="font-normal text-muted">
              {proposal.status === "countered" ? "suggested a different time" : "said yes"}
            </span>
          </p>
          {slot && (
            <p className="mt-0.5 text-[13.5px] text-foreground">
              {typeLabel(proposal)} · {describeSlot(slot)}
            </p>
          )}
          {proposal.counteredConflicts && (
            <p className="mt-1 text-[12.5px] font-medium text-[#8a6215]">
              That&apos;s outside the hours you set for {typeLabel(proposal).toLowerCase()}.
            </p>
          )}
        </div>
      </div>

      {proposal.replyText && (
        <blockquote className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13px] leading-relaxed text-muted">
          {proposal.replyText.length > 240
            ? `${proposal.replyText.slice(0, 240)}…`
            : proposal.replyText}
        </blockquote>
      )}

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button size="touch" onClick={book} disabled={pending || !slotIso}>
          <CalendarCheck className="h-4 w-4" />
          Schedule it
        </Button>
        <Button size="touch" variant="quiet" onClick={dismiss} disabled={pending}>
          Not now
        </Button>
      </div>
    </li>
  );
}

/** Sent, silent. Paste the reply when it comes, or nudge. */
function WaitingRow({ proposal, chaseDays }: { proposal: ProposalRow; chaseDays: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  const offered = proposal.offeredSlots.map((s) => new Date(s));
  const reading = text.trim()
    ? readReply({ text, offeredSlots: offered, now })
    : null;

  function submit() {
    if (!reading) return;
    setError(null);
    startTransition(async () => {
      const result = await recordProposalReply({
        proposalId: proposal.id,
        replyText: text,
        intent: reading.intent,
        slot: reading.slot ? reading.slot.toISOString() : null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setText("");
      router.refresh();
    });
  }

  function nudge() {
    startTransition(async () => {
      await nudgeProposal(proposal.id);
      router.refresh();
    });
  }

  return (
    <li className="py-3 first:pt-0">
      <div className="flex items-center gap-3">
        <Avatar
          name={proposal.lenderName}
          size="md"
          status={proposal.overdue ? "overdue" : "none"}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">
            <Link href={`/partners/${proposal.lenderId}`} className="hover:underline">
              {proposal.lenderName}
            </Link>
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted">
            <Clock className="h-3 w-3 shrink-0" />
            {typeLabelLeading(proposal)} asked{" "}
            {proposal.waitingDays === 0 ? "today" : `${proposal.waitingDays}d ago`}
            {proposal.overdue && (
              <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[#a8434a]">
                No reply
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded-[9px] border border-border px-2.5 py-1.5 text-[12.5px] font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary-soft/50"
        >
          <MessageSquareReply className="mr-1 inline h-3.5 w-3.5" />
          They replied
        </button>
      </div>

      {open && (
        <div className="mt-2.5 flex flex-col gap-2.5 rounded-xl border border-border bg-background p-3.5">
          <label htmlFor={`reply-${proposal.id}`} className="text-[13px] font-medium">
            Paste {proposal.firstName}&apos;s reply
          </label>
          <textarea
            id={`reply-${proposal.id}`}
            value={text}
            rows={4}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the whole email — the quoted part underneath is ignored."
            className="w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13.5px] leading-relaxed outline-none transition-colors focus:border-primary/40"
          />

          {reading && (
            <div
              className={cn(
                "rounded-[10px] px-3 py-2.5 text-[13px] leading-relaxed",
                reading.intent === "accepted" && "bg-teal-soft text-[#1f6b60]",
                reading.intent === "countered" && "bg-gold-soft text-[#6d5210]",
                reading.intent === "declined" && "bg-danger-soft text-[#a8434a]",
                reading.intent === "unclear" && "bg-plum-soft text-[#5a4880]",
              )}
            >
              <p className="font-semibold">
                {reading.intent === "accepted" && reading.slot
                  ? `Reads as a yes to ${describeSlot(reading.slot)}.`
                  : reading.intent === "countered" && reading.slot
                    ? `Reads as a counter-offer: ${describeSlot(reading.slot)}.`
                    : reading.intent === "declined"
                      ? "Reads as a no."
                      : "Not sure what this means."}
              </p>
              <p className="mt-0.5">{reading.reason}</p>
              {reading.intent === "unclear" && (
                <p className="mt-1">
                  It&apos;ll stay on this list — read it yourself and book the meeting by hand.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-[13px] text-danger">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <Button size="touch" onClick={submit} disabled={pending || !reading}>
              Save reply
            </Button>
            {proposal.overdue && (
              <Button size="touch" variant="secondary" onClick={nudge} disabled={pending}>
                No reply yet — remind me in {chaseDays}d
              </Button>
            )}
            <Button
              size="touch"
              variant="quiet"
              onClick={() => {
                setOpen(false);
                setText("");
              }}
            >
              <X className="h-4 w-4" />
              Close
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * A group ask, summed up in one line: how many have written back, and how many
 * of them are free on the date that's winning.
 *
 * Counting happens in `lib/group-proposal` so this row and the proposal screen
 * can never disagree about which date is best.
 */
function GroupRow({ proposal, chaseDays }: { proposal: GroupProposalRow; chaseDays: number }) {
  const tally = tallyGroupReplies({
    offeredSlots: proposal.offeredSlots.map((s) => new Date(s)),
    attendees: proposal.attendees.map((a) => ({
      lenderId: a.lenderId,
      name: a.name,
      firstName: a.firstName,
      repliedAt: a.repliedAt,
      replyText: a.replyText,
      verdicts: a.verdicts as SlotVerdict[],
      counteredSlot: a.counteredSlot,
    })),
  });

  const silent = tally.replied.length === 0 && proposal.waitingDays >= chaseDays;

  // Spotted by the mailbox sweep and not yet read. The sweep never sees the
  // body, so all it can say is that somebody answered.
  const unread = proposal.attendees.filter((a) => isUnreadReply(a));
  const label =
    proposal.customLabel?.trim() || MEETING_TYPE_LABELS[proposal.meetingType] || "Meeting";

  return (
    <li className="py-3 first:pt-0">
      <Link href={`/proposals/${proposal.id}`} className="flex items-center gap-3 group">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Users className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold group-hover:underline">
            {label} with {proposal.institutionName}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted">
            <Clock className="h-3 w-3 shrink-0" />
            {describeGroupProgress(tally)}
            {silent && (
              <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[#a8434a]">
                No replies
              </span>
            )}
          </span>
        </span>
        {unread.length > 0 ? (
          <span className="shrink-0 rounded-full bg-gold-soft px-2 py-0.5 text-[11.5px] font-semibold text-[#6d5210]">
            {unread.length === 1 ? `${unread[0].firstName} replied` : `${unread.length} replied`}
          </span>
        ) : (
          tally.hasAnyYes && (
            <span className="shrink-0 rounded-full bg-teal-soft px-2 py-0.5 text-[11.5px] font-semibold text-[#1f6b60]">
              Ready to confirm
            </span>
          )
        )}
      </Link>
    </li>
  );
}
