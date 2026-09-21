"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, FieldHint } from "@/components/ui/input";
import { DEFAULT_AVAILABILITY } from "@/lib/scheduling";
import { cn } from "@/lib/utils";
import { updateAvailability } from "./actions";

/**
 * When each kind of meeting is possible (spec §15).
 *
 * One window per meeting type rather than a full week-by-week grid: the rules
 * people actually hold are shaped like "lunches Tuesday and Thursday, 11 to 1",
 * and a 35-cell grid would be a chore to fill in for a gain nobody asked for.
 */

const TYPES = [
  { value: "lunch", label: "Lunch", hint: "60 minutes" },
  { value: "breakfast", label: "Breakfast", hint: "60 minutes" },
  { value: "office_visit", label: "Office visit", hint: "15 minutes" },
  { value: "golf", label: "Golf", hint: "2.5 hours" },
  { value: "general", label: "Anything else", hint: "60 minutes" },
] as const;

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface AvailabilityRuleState {
  meetingType: string;
  weekdays: number[];
  startMinute: number;
  endMinute: number;
}

const toTimeValue = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function fromTimeValue(value: string, fallback: number): number {
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return fallback;
  return h * 60 + m;
}

export function AvailabilityCard({
  initialRules,
  initialScheduling,
}: {
  initialRules: AvailabilityRuleState[];
  initialScheduling: {
    propose_horizon_days: number;
    proposal_chase_days: number;
    proposal_slot_count: number;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nothing saved means the app is scheduling against the defaults, so the form
  // opens showing those rather than five empty rows. Otherwise the screen would
  // say "no days selected", which reads as "nothing will be proposed", while
  // the app happily proposes lunches.
  const untouched = initialRules.length === 0;
  const [rules, setRules] = useState<AvailabilityRuleState[]>(() =>
    TYPES.map((t) => {
      const existing = initialRules.find((r) => r.meetingType === t.value);
      if (existing) return existing;
      const fallback = DEFAULT_AVAILABILITY.find((r) => r.meetingType === t.value);
      return {
        meetingType: t.value,
        weekdays: untouched && fallback ? [...fallback.weekdays] : [],
        startMinute: fallback?.startMinute ?? 11 * 60,
        endMinute: fallback?.endMinute ?? 13 * 60,
      };
    }),
  );
  const [scheduling, setScheduling] = useState(initialScheduling);

  function toggleDay(meetingType: string, day: number) {
    setRules((prev) =>
      prev.map((r) =>
        r.meetingType === meetingType
          ? {
              ...r,
              weekdays: r.weekdays.includes(day)
                ? r.weekdays.filter((d) => d !== day)
                : [...r.weekdays, day].sort((a, b) => a - b),
            }
          : r,
      ),
    );
  }

  function patch(meetingType: string, fields: Partial<AvailabilityRuleState>) {
    setRules((prev) =>
      prev.map((r) => (r.meetingType === meetingType ? { ...r, ...fields } : r)),
    );
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateAvailability(rules, scheduling);
      if (result.error) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <Card id="availability">
      <CardHeader>
        <CardTitle className="text-base">When you can meet</CardTitle>
        <CardDescription>
          Used to suggest dates when you propose a meeting. Leave a row with no days selected and
          it won&apos;t suggest that kind at all.
        </CardDescription>
        {untouched && (
          <p className="mt-2 rounded-lg border border-teal-border bg-teal-soft px-3 py-2 text-[13px] text-[#1f6b60]">
            These are the starting windows, already in use. Change anything that&apos;s wrong and
            save — nothing here is set in stone.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5">
          {TYPES.map((type) => {
            const rule = rules.find((r) => r.meetingType === type.value)!;
            const on = rule.weekdays.length > 0;
            return (
              <div key={type.value} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[13.5px] font-semibold">{type.label}</p>
                  <span className="text-[12px] text-muted">{type.hint}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex gap-1" role="group" aria-label={`${type.label} days`}>
                    {DAY_INITIALS.map((initial, day) => {
                      const active = rule.weekdays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={active}
                          aria-label={`${DAY_NAMES[day]} for ${type.label}`}
                          onClick={() => toggleDay(type.value, day)}
                          className={cn(
                            "h-9 w-9 rounded-[9px] border text-[12.5px] font-semibold transition-colors",
                            active
                              ? "border-primary bg-primary text-white"
                              : "border-border bg-background text-muted hover:border-primary/40 hover:text-foreground",
                          )}
                        >
                          {initial}
                        </button>
                      );
                    })}
                  </div>

                  <div
                    className={cn(
                      "flex items-center gap-1.5 transition-opacity",
                      !on && "pointer-events-none opacity-40",
                    )}
                  >
                    <Input
                      type="time"
                      aria-label={`${type.label} earliest time`}
                      className="w-[8.5rem]"
                      value={toTimeValue(rule.startMinute)}
                      onChange={(e) =>
                        patch(type.value, {
                          startMinute: fromTimeValue(e.target.value, rule.startMinute),
                        })
                      }
                    />
                    <span className="text-[13px] text-muted">to</span>
                    <Input
                      type="time"
                      aria-label={`${type.label} latest time`}
                      className="w-[8.5rem]"
                      value={toTimeValue(rule.endMinute)}
                      onChange={(e) =>
                        patch(type.value, {
                          endMinute: fromTimeValue(e.target.value, rule.endMinute),
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}

          <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
            <div>
              <Label htmlFor="av-horizon">Look ahead</Label>
              <Input
                id="av-horizon"
                type="number"
                min={3}
                max={90}
                value={scheduling.propose_horizon_days}
                onChange={(e) =>
                  setScheduling((s) => ({ ...s, propose_horizon_days: Number(e.target.value) }))
                }
              />
              <FieldHint>Days out to look for openings.</FieldHint>
            </div>
            <div>
              <Label htmlFor="av-slots">Dates to offer</Label>
              <Input
                id="av-slots"
                type="number"
                min={1}
                max={3}
                value={scheduling.proposal_slot_count}
                onChange={(e) =>
                  setScheduling((s) => ({ ...s, proposal_slot_count: Number(e.target.value) }))
                }
              />
              <FieldHint>How many choices to give them.</FieldHint>
            </div>
            <div>
              <Label htmlFor="av-chase">Chase after</Label>
              <Input
                id="av-chase"
                type="number"
                min={1}
                max={30}
                value={scheduling.proposal_chase_days}
                onChange={(e) =>
                  setScheduling((s) => ({ ...s, proposal_chase_days: Number(e.target.value) }))
                }
              />
              <FieldHint>Days of silence before it tells you.</FieldHint>
            </div>
          </div>

          {error && <p className="text-[13.5px] text-danger">{error}</p>}

          <div className="flex items-center gap-3">
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save availability"}
            </Button>
            {saved && <span className="text-[13.5px] text-teal">Saved.</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
