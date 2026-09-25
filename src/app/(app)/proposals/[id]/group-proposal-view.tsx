"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarCheck, Check, HelpCircle, MessageSquareReply, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { describeSlot } from "@/lib/scheduling";
import { MEETING_TYPE_LABELS } from "@/lib/labels";
import {
  attendeesForSlot,
  readGroupReply,
  tallyGroupReplies,
  formatNameList,
  type AttendeeReply,
  type SlotVerdict,
} from "@/lib/group-proposal";
import { AutoReadReplies, type UnreadReply } from "@/components/auto-read-replies";
import { cn } from "@/lib/utils";
import { confirmGroupMeeting, recordGroupReply } from "@/app/(app)/scheduling/group-actions";

/**
 * The group proposal, read back.
 *
 * Three things earn their place here: what each person said about each date,
 * which single date has the most yeses, and who hasn't answered. The tally is
 * `lib/group-proposal`, not this file — the screen only draws it.
 *
 * Nothing confirms itself. Not at three yeses, not at all of them.
 */

export interface GroupProposalAttendee {
  lenderId: string;
  name: string;
  firstName: string;
  repliedAt: string | null;
  replyText: string | null;
  replyIntent: string | null;
  /** When the browser interpreted `replyText`. Null means it still hasn't. */
  replyReadAt: string | null;
  verdicts: string[];
  counteredSlot: string | null;
}

export interface GroupProposalData {
  id: string;
  institutionName: string;
  meetingType: string;
  customLabel: string | null;
  /** ISO instants, in the order they went out in the email. */
  offeredSlots: string[];
  locationName: string | null;
  status: string;
  sentAt: string | null;
  meetingId: string | null;
  attendees: GroupProposalAttendee[];
}

const VERDICT_CHOICES: { value: SlotVerdict; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unclear", label: "Not sure" },
];

export function GroupProposalView({ data }: { data: GroupProposalData }) {
  const router = useRouter();
  const [now] = useState(() => new Date());
  const [openReply, setOpenReply] = useState<string | null>(null);

  const slots = useMemo(() => data.offeredSlots.map((s) => new Date(s)), [data.offeredSlots]);

  const attendees: AttendeeReply[] = useMemo(
    () =>
      data.attendees.map((a) => ({
        lenderId: a.lenderId,
        name: a.name,
        firstName: a.firstName,
        repliedAt: a.repliedAt,
        replyText: a.replyText,
        verdicts: a.verdicts as SlotVerdict[],
        counteredSlot: a.counteredSlot,
      })),
    [data.attendees],
  );

  const tally = useMemo(
    () => tallyGroupReplies({ offeredSlots: slots, attendees }),
    [slots, attendees],
  );

  const label = data.customLabel?.trim() || MEETING_TYPE_LABELS[data.meetingType] || "Meeting";
  const booked = data.status === "booked";

  // Replies the sweep fetched but nobody has interpreted. Reading them here,
  // in his timezone, is the whole reason this is a client component.
  const unread: UnreadReply[] = useMemo(
    () =>
      data.attendees.map((a) => ({
        proposalId: data.id,
        lenderId: a.lenderId,
        replyText: a.replyText,
        replyReadAt: a.replyReadAt,
        offeredSlots: data.offeredSlots,
      })),
    [data.id, data.attendees, data.offeredSlots],
  );

  return (
    <div className="flex flex-col gap-5">
      <AutoReadReplies replies={unread} />
      {/* The useful output: one date, called out. */}
      {booked ? (
        <div className="rounded-[18px] border border-teal-border bg-teal-soft px-5 py-4">
          <p className="text-[14px] font-semibold text-[#1f6b60]">On the calendar.</p>
          <p className="mt-0.5 text-[13.5px] text-[#1f6b60]">
            Everyone on it counts as covered from now, not from the day it happens.
          </p>
        </div>
      ) : tally.bestIndex !== null ? (
        <ConfirmCard
          data={data}
          slots={slots}
          attendees={attendees}
          bestIndex={tally.bestIndex}
          yesCount={tally.slots[tally.bestIndex].yes}
          onDone={() => router.refresh()}
        />
      ) : (
        <div className="rounded-[18px] border border-border bg-surface px-5 py-4">
          <p className="text-[14px] font-semibold">Nobody has said yes to a date yet.</p>
          <p className="mt-0.5 text-[13.5px] text-muted">
            {tally.replied.length === 0
              ? `${label} asked of ${attendees.length} ${attendees.length === 1 ? "person" : "people"} at ${data.institutionName}. No replies in yet.`
              : "Replies are in, but none of them landed on one of your dates."}
          </p>
        </div>
      )}

      {/* Who said what, by date. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who said what</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[380px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-medium text-muted">Attendee</th>
                  {slots.map((slot, i) => (
                    <th
                      key={i}
                      className={cn(
                        "px-2 py-2 text-center text-[12.5px] font-medium",
                        i === tally.bestIndex ? "text-primary" : "text-muted",
                      )}
                    >
                      {describeSlot(slot)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attendees.map((a) => (
                  <tr key={a.lenderId} className="border-b border-hairline last:border-b-0">
                    <td className="py-2.5 pr-3">
                      <Link href={`/partners/${a.lenderId}`} className="font-medium hover:underline">
                        {a.name}
                      </Link>
                      {!a.repliedAt && (
                        <span className="ml-2 text-[12px] text-muted">no reply yet</span>
                      )}
                    </td>
                    {slots.map((_, i) => (
                      <td key={i} className="px-2 py-2.5 text-center">
                        <VerdictMark verdict={a.repliedAt ? a.verdicts[i] : undefined} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td className="py-2 pr-3 text-[12.5px] font-medium text-muted">Yeses</td>
                  {tally.slots.map((t) => (
                    <td
                      key={t.index}
                      className={cn(
                        "px-2 py-2 text-center text-[13px] font-semibold",
                        t.index === tally.bestIndex ? "text-primary" : "text-muted",
                      )}
                    >
                      {t.yes}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          {tally.notReplied.length > 0 && (
            <p className="mt-3 text-[13px] text-muted">
              Waiting on {formatNameList(tally.notReplied.map((a) => a.firstName))}. Nobody gets
              chased and nobody&apos;s clock moves — they&apos;re just not on it.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recording replies, one at a time, as they land. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Replies</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          {data.attendees.map((a) => (
            <div key={a.lenderId} className="rounded-xl border border-border bg-background p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 text-[14px] font-medium">{a.name}</span>
                <button
                  type="button"
                  onClick={() => setOpenReply(openReply === a.lenderId ? null : a.lenderId)}
                  className="rounded-[9px] border border-border px-2.5 py-1.5 text-[12.5px] font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary-soft/50"
                >
                  <MessageSquareReply className="mr-1 inline h-3.5 w-3.5" />
                  {a.repliedAt ? "Update their reply" : "They replied"}
                </button>
              </div>

              {a.replyText && openReply !== a.lenderId && (
                <blockquote className="mt-2 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] leading-relaxed text-muted">
                  {a.replyText.length > 200 ? `${a.replyText.slice(0, 200)}…` : a.replyText}
                </blockquote>
              )}

              {openReply === a.lenderId && (
                <ReplyForm
                  proposalId={data.id}
                  attendee={a}
                  slots={slots}
                  now={now}
                  onDone={() => {
                    setOpenReply(null);
                    router.refresh();
                  }}
                  onCancel={() => setOpenReply(null)}
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function VerdictMark({ verdict }: { verdict?: SlotVerdict | string }) {
  if (verdict === "yes") return <Check className="mx-auto h-4 w-4 text-[#1f6b60]" />;
  if (verdict === "no") return <X className="mx-auto h-4 w-4 text-[#a8434a]" />;
  if (verdict === "unclear") return <HelpCircle className="mx-auto h-4 w-4 text-[#5a4880]" />;
  return <span className="text-muted">·</span>;
}

/**
 * Paste a reply, see what the reader made of it, correct it if it's wrong.
 *
 * The reader is run once over the whole reply and once per date, because a
 * group ask needs an answer per date and the reader answers one question at a
 * time. It abstains as it always has — the buttons underneath are how an
 * "either of those works" becomes two yeses without the app guessing.
 */
function ReplyForm({
  proposalId,
  attendee,
  slots,
  now,
  onDone,
  onCancel,
}: {
  proposalId: string;
  attendee: GroupProposalAttendee;
  slots: Date[];
  now: Date;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(attendee.replyText ?? "");
  const [override, setOverride] = useState<SlotVerdict[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = useMemo(
    () => (text.trim() ? readGroupReply({ text, offeredSlots: slots, now }) : null),
    [text, slots, now],
  );

  const reading = read?.reading ?? null;
  const verdicts = override ?? read?.verdicts ?? null;

  function submit() {
    if (!reading || !verdicts) return;
    setError(null);
    startTransition(async () => {
      const result = await recordGroupReply({
        proposalId,
        lenderId: attendee.lenderId,
        replyText: text,
        intent: reading.intent,
        slotVerdicts: verdicts,
        counteredSlot: reading.slot ? reading.slot.toISOString() : null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="mt-2.5 flex flex-col gap-2.5">
      <label htmlFor={`reply-${attendee.lenderId}`} className="text-[13px] font-medium">
        Paste {attendee.firstName}&apos;s reply
      </label>
      <textarea
        id={`reply-${attendee.lenderId}`}
        value={text}
        rows={4}
        autoFocus
        onChange={(e) => {
          setText(e.target.value);
          setOverride(null);
        }}
        placeholder="Paste the whole email — the quoted part underneath is ignored."
        className="w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13.5px] leading-relaxed outline-none transition-colors focus:border-primary/40"
      />

      {reading && (
        <p className="text-[13px] leading-relaxed text-muted">
          <span className="font-medium text-foreground">{reading.reason}</span>{" "}
          {reading.intent === "unclear" &&
            "Set each date yourself below — nothing is counted until you do."}
        </p>
      )}

      {verdicts && (
        <div className="flex flex-col gap-2">
          {slots.map((slot, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="min-w-[180px] flex-1 text-[13px]">{describeSlot(slot)}</span>
              <div className="flex gap-1">
                {VERDICT_CHOICES.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() =>
                      setOverride(verdicts.map((v, j) => (j === i ? choice.value : v)))
                    }
                    className={cn(
                      "rounded-[8px] border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                      verdicts[i] === choice.value
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border text-muted hover:text-foreground",
                    )}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button size="touch" onClick={submit} disabled={pending || !verdicts}>
          Save reply
        </Button>
        <Button size="touch" variant="quiet" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Pick the date, check who's coming, confirm. Never automatic. */
function ConfirmCard({
  data,
  slots,
  attendees,
  bestIndex,
  yesCount,
  onDone,
}: {
  data: GroupProposalData;
  slots: Date[];
  attendees: AttendeeReply[];
  bestIndex: number;
  yesCount: number;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [slotIndex, setSlotIndex] = useState(bestIndex);
  const [dropped, setDropped] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const going = useMemo(
    () => attendeesForSlot(attendees, slotIndex).filter((a) => !dropped.includes(a.lenderId)),
    [attendees, slotIndex, dropped],
  );

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmGroupMeeting({
        proposalId: data.id,
        startAtIso: slots[slotIndex].toISOString(),
        lenderIds: going.map((a) => a.lenderId),
      });
      if (result.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <div className="rounded-[18px] border border-primary/30 bg-primary-soft/40 px-5 py-4">
      <p className="eyebrow text-navy/70">Best date</p>
      <p className="mt-1 text-[17px] font-semibold">{describeSlot(slots[bestIndex])}</p>
      <p className="mt-0.5 text-[13.5px] text-muted">
        {yesCount} {yesCount === 1 ? "person is" : "people are"} free then
        {data.locationName ? ` · ${data.locationName}` : ""}
      </p>

      {slots.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {slots.map((slot, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setSlotIndex(i);
                setDropped([]);
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors",
                slotIndex === i
                  ? "border-primary bg-surface text-primary"
                  : "border-border bg-surface/70 text-muted hover:text-foreground",
              )}
            >
              {describeSlot(slot)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        <p className="text-[13px] font-medium">Who&apos;s on it</p>
        {attendeesForSlot(attendees, slotIndex).length === 0 ? (
          <p className="text-[13px] text-muted">Nobody said yes to that date.</p>
        ) : (
          attendeesForSlot(attendees, slotIndex).map((a) => (
            <label key={a.lenderId} className="flex min-h-9 items-center gap-2.5 text-[13.5px]">
              <input
                type="checkbox"
                checked={!dropped.includes(a.lenderId)}
                onChange={() =>
                  setDropped((prev) =>
                    prev.includes(a.lenderId)
                      ? prev.filter((id) => id !== a.lenderId)
                      : [...prev, a.lenderId],
                  )
                }
                className="h-4 w-4 accent-primary"
              />
              {a.name}
            </label>
          ))
        )}
      </div>

      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}

      <div className="mt-3.5">
        <Button size="touch" onClick={confirm} disabled={pending || going.length === 0}>
          <CalendarCheck className="h-4 w-4" />
          Confirm {describeSlot(slots[slotIndex])}
        </Button>
      </div>
    </div>
  );
}
