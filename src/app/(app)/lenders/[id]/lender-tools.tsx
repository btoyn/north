"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProposeMeeting } from "@/components/propose-meeting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  ACTIVITY_TYPE_LABELS,
  COMMUNICATION_STYLE_LABELS,
  HEALTH_LABELS,
  PERSONAL_DETAIL_CATEGORY_LABELS,
  TERRITORIES,
} from "@/lib/labels";
import { logActivity, addPromise } from "../../activity-actions";
import {
  addPersonalDetail,
  changeLenderInstitution,
  removePersonalDetail,
  softDeleteLender,
  updateLender,
} from "../actions";

const LOGGABLE_TYPES = [
  "personal_email",
  "incoming_email",
  "text",
  "call",
  "lunch",
  "breakfast",
  "golf",
  "office_visit",
  "pop_in",
  "sba_question",
  "deal_conversation",
  "note",
] as const;

interface LenderSummary {
  id: string;
  full_name: string;
  first_name: string;
  email: string | null;
  mobile_phone: string | null;
  office_phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  relationship_tier: string;
  relationship_health: string | null;
  communication_style: string | null;
  territory: string | null;
  notes: string | null;
}

export function LenderTools({
  lender,
  personalDetails,
  institutionNames,
  currentInstitution,
}: {
  lender: LenderSummary;
  personalDetails: { id: string; category: string; detail: string; label: string }[];
  institutionNames: string[];
  currentInstitution: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<
    "none" | "log" | "promise" | "detail" | "edit" | "move" | "delete"
  >("none");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showTextLog, setShowTextLog] = useState(false);

  function run(action: () => Promise<{ error?: string; formerInstitution?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      if (result && "formerInstitution" in result && result.formerInstitution) {
        setNotice(
          `${result.formerInstitution} may need a replacement contact now that ${lender.first_name} has moved.`,
        );
      }
      setPanel("none");
      router.refresh();
    });
  }

  function handleTextClick() {
    // Spec §20: open native Messages; we can't verify the send, so prompt to log.
    setShowTextLog(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {notice && (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{notice}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <ProposeMeeting lenderId={lender.id}>
            {(open) => (
              <Button size="sm" onClick={open}>
                <CalendarPlus className="h-3.5 w-3.5" /> Propose a meeting
              </Button>
            )}
          </ProposeMeeting>
          <Button size="sm" variant="secondary" onClick={() => setPanel(panel === "log" ? "none" : "log")}>
            <Plus className="h-3.5 w-3.5" /> Log activity
          </Button>
          {lender.mobile_phone && (
            <a
              href={`sms:${lender.mobile_phone.replace(/[^\d+]/g, "")}`}
              onClick={handleTextClick}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-primary-soft"
            >
              <MessageSquare className="h-3.5 w-3.5" /> Text
            </a>
          )}
          <Button size="sm" variant="secondary" onClick={() => setPanel(panel === "promise" ? "none" : "promise")}>
            Add promise
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setPanel(panel === "edit" ? "none" : "edit")}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        </div>

        {showTextLog && (
          <div className="rounded-lg border border-border bg-primary-soft/40 p-3 text-sm">
            <p className="mb-2 font-medium">Did the text go out? Log it so it counts as a touch.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const summary = String(new FormData(e.currentTarget).get("summary") ?? "");
                run(() =>
                  logActivity({ lenderId: lender.id, activityType: "text", summary }),
                );
                setShowTextLog(false);
              }}
              className="space-y-2"
            >
              <Input name="summary" placeholder="Quick summary (optional)" />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pending}>
                  Log this text
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowTextLog(false)}>
                  Skip
                </Button>
              </div>
            </form>
          </div>
        )}

        {panel === "log" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(() =>
                logActivity({
                  lenderId: lender.id,
                  activityType: String(f.get("activityType")),
                  summary: String(f.get("summary") ?? ""),
                  occurredAt: String(f.get("occurredAt") ?? ""),
                  initiatedByLender: f.get("initiatedByLender") === "on",
                }),
              );
            }}
            className="space-y-3 rounded-lg border border-border p-3"
          >
            <div>
              <Label>What happened?</Label>
              <Select name="activityType" defaultValue="personal_email">
                {LOGGABLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACTIVITY_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>When</Label>
              <Input name="occurredAt" type="datetime-local" defaultValue={localNowValue()} />
            </div>
            <div>
              <Label>Summary</Label>
              <Textarea name="summary" rows={2} placeholder="What did you talk about?" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="initiatedByLender" className="h-4 w-4 rounded border-border" />
              They reached out to me
            </label>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save activity"}
            </Button>
          </form>
        )}

        {panel === "promise" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(() =>
                addPromise({
                  lenderId: lender.id,
                  direction: String(f.get("direction")) as "i_promised" | "they_promised",
                  description: String(f.get("description") ?? ""),
                  dueAt: String(f.get("dueAt") ?? ""),
                }),
              );
            }}
            className="space-y-3 rounded-lg border border-border p-3"
          >
            <div>
              <Label>Who promised?</Label>
              <Select name="direction" defaultValue="i_promised">
                <option value="i_promised">I promised</option>
                <option value="they_promised">They promised</option>
              </Select>
            </div>
            <div>
              <Label>What was promised?</Label>
              <Input name="description" required placeholder="e.g. send the 504 comparison sheet" />
            </div>
            <div>
              <Label>Due</Label>
              <Input name="dueAt" type="date" />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save promise"}
            </Button>
          </form>
        )}

        {panel === "edit" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(() =>
                updateLender(lender.id, {
                  relationship_tier: String(f.get("tier")),
                  manual_tier_override: true,
                  relationship_health: String(f.get("health")) || null,
                  communication_style: String(f.get("style")) || null,
                  territory: String(f.get("territory")) || null,
                  email: String(f.get("email")) || null,
                  mobile_phone: String(f.get("mobile")) || null,
                  office_phone: String(f.get("office")) || null,
                  address: String(f.get("address")) || null,
                  city: String(f.get("city")) || null,
                  state: String(f.get("state")) || null,
                }),
              );
            }}
            className="space-y-3 rounded-lg border border-border p-3"
          >
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Tier</Label>
                <Select name="tier" defaultValue={lender.relationship_tier}>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                  <option value="unassigned">No tier</option>
                </Select>
              </div>
              <div>
                <Label>Health</Label>
                <Select name="health" defaultValue={lender.relationship_health ?? ""}>
                  <option value="">—</option>
                  {Object.entries(HEALTH_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label>Communication style</Label>
              <Select name="style" defaultValue={lender.communication_style ?? ""}>
                <option value="">—</option>
                {Object.entries(COMMUNICATION_STYLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Territory</Label>
              <Select name="territory" defaultValue={lender.territory ?? ""}>
                <option value="">—</option>
                {TERRITORIES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Email</Label>
                <Input name="email" type="email" defaultValue={lender.email ?? ""} />
              </div>
              <div>
                <Label>Mobile</Label>
                <Input name="mobile" type="tel" defaultValue={lender.mobile_phone ?? ""} />
              </div>
            </div>
            <div>
              <Label>Office phone</Label>
              <Input name="office" type="tel" defaultValue={lender.office_phone ?? ""} />
            </div>
            <div>
              <Label>Address</Label>
              <Input
                name="address"
                defaultValue={lender.address ?? ""}
                placeholder="Street, if you visit them there"
              />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
              <div>
                <Label>City</Label>
                <Input name="city" defaultValue={lender.city ?? ""} />
              </div>
              <div>
                <Label>State</Label>
                <Input name="state" maxLength={2} defaultValue={lender.state ?? ""} />
              </div>
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        )}

        {/* Personal details */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Personal notes & interests</p>
            <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "detail" ? "none" : "detail")}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          {personalDetails.length === 0 && panel !== "detail" && (
            <p className="text-sm text-muted">
              Nothing yet — golf, family, favorite lunch spot… anything that helps the relationship.
            </p>
          )}
          <ul className="space-y-1.5">
            {personalDetails.map((d) => (
              <li key={d.id} className="group flex items-start justify-between gap-2 text-sm">
                <span>
                  <Badge variant="muted" className="mr-1.5">
                    {d.label}
                  </Badge>
                  {d.detail}
                </span>
                <button
                  title="Remove"
                  className="invisible text-muted hover:text-danger group-hover:visible"
                  onClick={() => run(() => removePersonalDetail(d.id, lender.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {panel === "detail" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(() =>
                  addPersonalDetail(lender.id, String(f.get("category")), String(f.get("detail") ?? "")),
                );
              }}
              className="mt-2 space-y-2 rounded-lg border border-border p-3"
            >
              <Select name="category" defaultValue="long_term_interest">
                {Object.entries(PERSONAL_DETAIL_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <Input name="detail" required placeholder="e.g. Kids play club soccer" />
              <Button type="submit" size="sm" disabled={pending}>
                Save
              </Button>
            </form>
          )}
        </div>

        {/* Institution change + delete */}
        <div className="space-y-2 border-t border-border pt-3">
          <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "move" ? "none" : "move")}>
            Changed banks?
          </Button>
          {panel === "move" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(() =>
                  changeLenderInstitution(
                    lender.id,
                    String(f.get("institution") ?? ""),
                    String(f.get("title") ?? ""),
                  ),
                );
              }}
              className="space-y-2 rounded-lg border border-border p-3"
            >
              <p className="text-sm text-muted">
                {lender.first_name} keeps their full history — only the current institution changes.
                {currentInstitution ? ` Currently at ${currentInstitution}.` : ""}
              </p>
              <Input name="institution" required list="move-institutions" placeholder="New institution" />
              <datalist id="move-institutions">
                {institutionNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <Input name="title" placeholder="New title (optional)" />
              <Button type="submit" size="sm" disabled={pending}>
                Move lender
              </Button>
            </form>
          )}

          <Button size="sm" variant="ghost" className="text-danger" onClick={() => setPanel(panel === "delete" ? "none" : "delete")}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          {panel === "delete" && (
            <div className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm">
              <p className="mb-2">
                Move {lender.full_name} to the Trash? You can restore within 90 days.
              </p>
              <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => softDeleteLender(lender.id))}>
                {pending ? "Deleting…" : "Move to Trash"}
              </Button>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </CardContent>
    </Card>
  );
}

function localNowValue(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}
