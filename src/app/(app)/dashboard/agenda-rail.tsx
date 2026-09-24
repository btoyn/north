import Link from "next/link";
import {
  CalendarCheck2,
  CalendarPlus,
  Clock,
  FileCheck2,
  MapPin,
  MailQuestion,
  Plane,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { DateTile, IconCircle } from "@/components/ui/icon-circle";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import { MEETING_TYPE_LABELS } from "@/lib/labels";
import type { UpcomingData } from "@/lib/dashboard";

/**
 * Up Next — a vertical agenda rather than a stack of cards. One spine, date
 * tiles down the left, and a single direct action per item.
 */
export function AgendaRail({ data }: { data: UpcomingData }) {
  const { meetings, tentative, trip } = data;
  const nextMeeting = meetings[0];
  const laterMeetings = meetings.slice(1, 3);

  return (
    <section>
      <p className="eyebrow mb-2 text-navy/70">Up next</p>

      <div className="rounded-[20px] border border-border/80 bg-surface p-5 shadow-[0_10px_30px_rgba(16,24,40,0.05)]">
        <ol className="relative flex flex-col gap-5">
          {/* The spine */}
          <span
            aria-hidden="true"
            className="absolute bottom-3 left-[22px] top-3 w-px bg-border"
          />

          {/* ---- A. Next confirmed meeting ---- */}
          <li className="relative flex gap-3.5">
            {nextMeeting ? (
              <>
                <DateTile date={nextMeeting.start_at} tone="teal" className="relative z-10" />
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-[3px] text-[11px] font-semibold text-[#1f6b60]">
                      <CalendarCheck2 className="h-3 w-3" />
                      {MEETING_TYPE_LABELS[nextMeeting.meeting_type] ?? nextMeeting.meeting_type}
                    </span>
                    {!nextMeeting.meeting_brief_generated_at && (
                      <span className="rounded-full bg-gold-soft px-2 py-[3px] text-[11px] font-semibold text-[#8a6215]">
                        Brief not ready
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[14.5px] font-semibold leading-snug">
                    {nextMeeting.title}
                  </p>
                  <dl className="mt-1.5 flex flex-col gap-1 text-[12.5px] text-muted">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <dd>{formatDateTime(nextMeeting.start_at)}</dd>
                    </div>
                    {nextMeeting.location_name && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <dd>{nextMeeting.location_name}</dd>
                      </div>
                    )}
                    {nextMeeting.attendees.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 shrink-0" />
                        <dd className="truncate">{nextMeeting.attendees.join(", ")}</dd>
                      </div>
                    )}
                  </dl>
                  {!nextMeeting.meeting_brief_generated_at && (
                    <Link
                      href="/tiers/upcoming-meetings"
                      className={cn(buttonVariants({ variant: "secondary", size: "xs" }), "mt-2.5 h-11 px-3.5 sm:h-7 sm:px-2.5")}
                    >
                      <FileCheck2 className="h-3.5 w-3.5" />
                      Prepare brief
                    </Link>
                  )}

                  {laterMeetings.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-1.5 border-t border-border/70 pt-2.5">
                      {laterMeetings.map((m) => (
                        <li key={m.id} className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[12.5px] text-foreground/80">
                            {m.title}
                          </span>
                          <span className="shrink-0 text-[11.5px] text-muted">
                            {formatDate(m.start_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <>
                <IconCircle icon={CalendarPlus} tone="teal" size="lg" className="relative z-10" />
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-[14px] font-semibold">No upcoming meetings</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                    Your calendar is clear. Schedule time with a lender from this week&apos;s list.
                  </p>
                  <Link
                    href="#this-week"
                    className={cn(buttonVariants({ variant: "secondary", size: "xs" }), "mt-2.5 h-11 px-3.5 sm:h-7 sm:px-2.5")}
                  >
                    Schedule meeting
                  </Link>
                </div>
              </>
            )}
          </li>

          {/* ---- B. Trip ---- */}
          {trip && (
            <li className="relative flex gap-3.5">
              <DateTile date={trip.start_date} tone="gold" className="relative z-10" />
              <div className="min-w-0 flex-1 pt-0.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2 py-[3px] text-[11px] font-semibold text-[#8a6215]">
                  <Plane className="h-3 w-3" />
                  {trip.status.replace(/_/g, " ")}
                </span>
                <p className="mt-1.5 text-[14.5px] font-semibold leading-snug">{trip.name}</p>
                <p className="mt-1.5 text-[12.5px] text-muted">
                  {trip.start_date ? formatDate(trip.start_date) : "Dates not set"}
                  {trip.end_date ? ` – ${formatDate(trip.end_date)}` : ""}
                  {trip.territory ? ` · ${trip.territory}` : ""}
                </p>
                <p className="mt-1 text-[12.5px] text-muted">
                  <span className="font-semibold text-foreground">
                    {trip.confirmedCount} of {trip.targetCount}
                  </span>{" "}
                  stops confirmed
                </p>
                <Link
                  href="/tiers/needs-contact"
                  className={cn(buttonVariants({ variant: "secondary", size: "xs" }), "mt-2.5 h-11 px-3.5 sm:h-7 sm:px-2.5")}
                >
                  Plan trip
                </Link>
              </div>
            </li>
          )}

          {/* ---- C. Waiting on replies ---- */}
          <li className="relative flex gap-3.5">
            <IconCircle
              icon={MailQuestion}
              tone={tentative.length > 0 ? "gold" : "slate"}
              size="lg"
              className="relative z-10"
            />
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-[14px] font-semibold">
                Waiting on replies
                {tentative.length > 0 && (
                  <span className="ml-1.5 text-[12.5px] font-medium text-muted tabular-nums">
                    {tentative.length}
                  </span>
                )}
              </p>

              {tentative.length === 0 ? (
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  No open scheduling threads right now.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {tentative.map((t) => (
                    <li key={`${t.kind}-${t.id}`} className="flex items-center gap-2.5">
                      <Avatar name={t.lenderName ?? t.title} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">
                          {t.lenderName ?? t.title}
                        </span>
                        <span className="text-[11.5px] text-muted">
                          {t.detail ?? t.status.replace(/_/g, " ")}
                          {t.waitingDays !== null &&
                            ` · waiting ${t.waitingDays === 0 ? "today" : `${t.waitingDays}d`}`}
                        </span>
                      </span>
                      <Link
                        href="#this-week"
                        className={cn(buttonVariants({ variant: "quiet", size: "xs" }), "h-11 px-3 sm:h-7 sm:px-2.5")}
                      >
                        Follow up
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        </ol>
      </div>

      <Link
        href="/tiers/needs-contact"
        className="mt-4 block rounded-xl border border-dashed border-border px-4 py-3 text-center text-[13px] font-semibold text-primary transition-colors hover:border-primary/35 hover:bg-primary-soft"
      >
        Open needs-attention queue →
      </Link>
    </section>
  );
}
