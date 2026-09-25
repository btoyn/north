"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Mail } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MAILTO_SAFE_LENGTH,
  firstDraft,
  firstDraftCursor,
  fitsInMailto,
  handoffDraft,
  mailtoUrl,
  updateSubject,
} from "@/lib/loan-email";
import {
  getDraftContext,
  recordUpdateSent,
  saveBorrowerEmail,
  type DraftContext,
} from "./actions";

/**
 * This week's update email.
 *
 * Opens with last week's text, or a skeleton the first time. Everything after
 * that is the user's own words carried forward — there is no stage to pick and
 * no wording the app re-imposes each week.
 */
export function UpdateDraft({
  loanId,
  mode,
  construction,
  onDone,
}: {
  loanId: string;
  mode: "weekly" | "handoff";
  construction?: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [context, setContext] = useState<DraftContext | null>(null);
  const [body, setBody] = useState("");
  const [toBorrower, setToBorrower] = useState(false);
  const [borrowerEmail, setBorrowerEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  // Pinned once: the subject carries a date, and it should be the date the
  // draft was opened rather than shifting under a long edit.
  const [today] = useState(() => new Date());

  useEffect(() => {
    let live = true;
    getDraftContext(loanId).then((result) => {
      if (!live) return;
      if (result.error || !result.context) {
        setError(result.error ?? "Could not open the draft.");
        return;
      }
      const ctx = result.context;
      setContext(ctx);
      setBorrowerEmail(ctx.borrowerEmail ?? "");

      if (mode === "handoff") {
        setBody(
          handoffDraft({
            lenderName: ctx.lenderName,
            borrowerName: ctx.borrowerName,
            signature: ctx.signature,
            construction: Boolean(construction),
          }),
        );
        return;
      }

      // Last week's email is the starting point. Only week one is composed.
      if (ctx.lastBody) {
        setBody(ctx.lastBody);
        return;
      }
      const draft = firstDraft({
        lenderName: ctx.lenderName,
        borrowerName: ctx.borrowerName,
        signature: ctx.signature,
      });
      setBody(draft);
      requestAnimationFrame(() => {
        const el = textarea.current;
        if (!el) return;
        const at = firstDraftCursor(draft);
        el.focus();
        el.setSelectionRange(at, at);
      });
    });
    return () => {
      live = false;
    };
  }, [loanId, mode, construction]);

  if (error && !context) {
    return (
      <div className="mt-3 rounded-xl border border-border bg-background p-3.5">
        <p className="text-[13px] text-danger">{error}</p>
      </div>
    );
  }

  if (!context) {
    return (
      <div className="mt-3 rounded-xl border border-border bg-background p-3.5">
        <p className="text-[13px] text-muted">Opening the draft…</p>
      </div>
    );
  }

  // Captured past the null guards above, so the closures below narrow too.
  const ctx = context;
  const subject = updateSubject(ctx.borrowerName, today);
  const recipients = [ctx.lenderEmail ?? "", toBorrower ? borrowerEmail.trim() : ""].filter(Boolean);
  const tooLong = !fitsInMailto({ to: recipients, subject, body });
  const noLenderEmail = !ctx.lenderEmail;

  function markSent() {
    startTransition(async () => {
      if (toBorrower && borrowerEmail.trim() !== (ctx.borrowerEmail ?? "")) {
        await saveBorrowerEmail(loanId, borrowerEmail);
      }
      const result = await recordUpdateSent({
        loanId,
        body,
        toBorrower,
        closing: mode === "handoff",
        // Wall-clock, from the browser: which day an approval landed on is a
        // calendar fact, and the server's UTC midnight is a different day.
        approvedOn: mode === "handoff" ? todayLocal() : null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onDone();
    });
  }

  async function copyBody() {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-background p-3.5">
      <div>
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">Subject</p>
        <p className="text-[13.5px] font-medium">{subject}</p>
      </div>

      <div>
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">To</p>
        <p className="text-[13.5px]">
          {ctx.lenderEmail ?? (
            <span className="text-danger">
              {ctx.lenderName ?? "This partner"} has no email address on file
            </span>
          )}
        </p>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-[13.5px] font-medium">
          <input
            type="checkbox"
            checked={toBorrower}
            onChange={(e) => setToBorrower(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Send to the borrower too
        </label>
        {toBorrower && (
          <div>
            <Label htmlFor={`be-${loanId}`}>Borrower&apos;s email</Label>
            <Input
              id={`be-${loanId}`}
              type="email"
              value={borrowerEmail}
              autoFocus={!ctx.borrowerEmail}
              onChange={(e) => setBorrowerEmail(e.target.value)}
              placeholder="dave@example.com"
            />
            <p className="mt-1 text-[12px] text-muted">
              Saved with the loan, so you only type it once. They get the same email you send the
              lender.
            </p>
          </div>
        )}
      </div>

      <div>
        <Label htmlFor={`body-${loanId}`}>
          {mode === "handoff" ? "Last email on this loan" : "This week's update"}
        </Label>
        <textarea
          id={`body-${loanId}`}
          ref={textarea}
          value={body}
          rows={14}
          onChange={(e) => setBody(e.target.value)}
          className="w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 font-[inherit] text-[13.5px] leading-relaxed outline-none transition-colors focus:border-primary/40"
        />
        {mode === "weekly" && (
          <p className="mt-1 text-[12px] text-muted">
            {ctx.lastBody
              ? "This is what you sent last week. Change what changed."
              : "First one — the greeting and sign-off are set up, write the news in the middle. Next week opens with whatever you send today."}
          </p>
        )}
      </div>

      {tooLong && (
        <p className="rounded-[10px] bg-gold-soft px-3 py-2 text-[12.5px] text-[#8a6215]">
          This is long enough that Outlook may cut it short. Use <strong>Copy</strong> and paste it
          into a new email instead — over about {MAILTO_SAFE_LENGTH} characters the handoff isn&apos;t
          reliable.
        </p>
      )}

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {noLenderEmail || tooLong ? (
          <Button size="touch" disabled>
            <Mail className="h-4 w-4" /> Open in Outlook
          </Button>
        ) : (
          // A real anchor, so the mailto: hand-off happens inside the click
          // itself rather than after an await, which some browsers block.
          <a
            href={mailtoUrl({ to: recipients, subject, body })}
            onClick={markSent}
            className={cn(buttonVariants({ size: "touch" }))}
          >
            <Mail className="h-4 w-4" /> Open in Outlook
          </a>
        )}
        <Button size="touch" variant="secondary" onClick={copyBody} disabled={pending}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        {(noLenderEmail || tooLong) && (
          <Button size="touch" variant="secondary" onClick={markSent} disabled={pending}>
            {pending ? "Saving…" : "Mark as sent"}
          </Button>
        )}
        <Button size="touch" variant="quiet" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>

      <p className="text-[12px] text-muted">
        {mode === "handoff"
          ? "Opening the draft stops the weekly updates on this loan. The app can't see whether you actually press send in Outlook."
          : "Opening the draft marks this week done and starts the clock again. The app can't see whether you actually press send in Outlook."}
      </p>
    </div>
  );
}

/** Today as the browser reckons it. */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
