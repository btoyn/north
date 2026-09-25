"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { readGroupReply } from "@/lib/group-proposal";
import { repliesAwaitingReading } from "@/lib/proposal-replies";
import { recordReplyReading } from "@/app/(app)/scheduling/group-actions";

/**
 * Finishes the job the mailbox sweep starts.
 *
 * The sweep fetches a reply's text and deliberately stops, because working out
 * what it says is wall-clock work: "Thursday works" is only a date if you know
 * what today is, and the sweep's today is UTC on a server in Oregon. This runs
 * where every other scheduling decision runs — his browser, his clock — and
 * sends back only the verdict.
 *
 * It draws nothing. It sits on the screens that show replies, reads whatever
 * arrived unread, and refreshes once so the tally redraws with the answer in
 * it. A reading it writes stamps `reply_read_at`, so the next render has
 * nothing left to do and this goes quiet.
 */

export interface UnreadReply {
  proposalId: string;
  lenderId: string;
  replyText: string | null;
  replyReadAt: string | null;
  /** The proposal's offered dates as ISO instants, in order. */
  offeredSlots: string[];
}

export function AutoReadReplies({ replies }: { replies: UnreadReply[] }) {
  const router = useRouter();
  // Survives the re-render that `router.refresh()` causes, so a reply the
  // server has not caught up on yet is not read and posted a second time.
  const done = useRef(new Set<string>());

  useEffect(() => {
    const pending = repliesAwaitingReading(replies).filter(
      (r) => r.offeredSlots.length > 0 && !done.current.has(`${r.proposalId}:${r.lenderId}`),
    );
    if (pending.length === 0) return;

    let cancelled = false;
    const now = new Date();

    (async () => {
      let wrote = 0;
      for (const reply of pending) {
        done.current.add(`${reply.proposalId}:${reply.lenderId}`);
        const offeredSlots = reply.offeredSlots.map((iso) => new Date(iso));
        const { reading, verdicts } = readGroupReply({
          text: reply.replyText!,
          offeredSlots,
          now,
        });
        // Best effort, like the sweep that fetched it. A reading that fails to
        // save leaves the reply exactly as it was: flagged, and waiting for
        // him. Nothing is lost and nothing is wrong.
        const result = await recordReplyReading({
          proposalId: reply.proposalId,
          lenderId: reply.lenderId,
          intent: reading.intent,
          slotVerdicts: verdicts,
          counteredSlot: reading.slot ? reading.slot.toISOString() : null,
        });
        if (!result.error) wrote += 1;
      }
      if (wrote > 0 && !cancelled) router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [replies, router]);

  return null;
}
