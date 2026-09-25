"use client";

import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { describeSlot } from "@/lib/scheduling";
import { formatNameList, tallyGroupReplies, type SlotVerdict } from "@/lib/group-proposal";
import { MEETING_TYPE_LABELS } from "@/lib/labels";
import type { GroupProposalRow } from "@/lib/dashboard";

/**
 * Group asks with a yes on them, surfaced so he doesn't have to go looking.
 *
 * A single-partner proposal has one answer and lands on the dashboard the
 * moment it arrives. A group one accumulates, and the moment worth acting on
 * is the first yes — after that there is a date he could confirm. Counting is
 * `lib/group-proposal`; wall-clock, so it runs here rather than on the server.
 */
export function GroupProposalsNeedingAttention({
  proposals,
}: {
  proposals: GroupProposalRow[];
}) {
  const ready = proposals
    .map((p) => ({
      proposal: p,
      tally: tallyGroupReplies({
        offeredSlots: p.offeredSlots.map((s) => new Date(s)),
        attendees: p.attendees.map((a) => ({
          lenderId: a.lenderId,
          name: a.name,
          firstName: a.firstName,
          repliedAt: a.repliedAt,
          replyText: a.replyText,
          verdicts: a.verdicts as SlotVerdict[],
          counteredSlot: a.counteredSlot,
        })),
      }),
    }))
    .filter((r) => r.tally.hasAnyYes);

  if (ready.length === 0) return null;

  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-teal-border bg-teal-soft/50">
      <p className="border-b border-teal-border px-4 py-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-[#1f6b60]">
        Group meetings you could confirm
      </p>
      <ul className="divide-y divide-teal-border">
        {ready.map(({ proposal, tally }) => {
          const best = tally.slots[tally.bestIndex!];
          const label =
            proposal.customLabel?.trim() ||
            MEETING_TYPE_LABELS[proposal.meetingType] ||
            "Meeting";
          return (
            <li key={proposal.id}>
              <Link
                href={`/proposals/${proposal.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-teal-soft"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium">
                    {label} with {proposal.institutionName}
                  </span>
                  <p className="truncate text-sm text-muted">
                    {formatNameList(best.yesNames)} free {describeSlot(best.slot)}
                    {tally.notReplied.length > 0 &&
                      ` · ${tally.notReplied.length} still quiet`}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1f6b60]">
                  <CalendarCheck className="h-4 w-4" />
                  {best.yes} yes
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
