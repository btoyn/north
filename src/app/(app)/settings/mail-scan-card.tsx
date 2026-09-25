"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mailbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface MailScanState {
  /** False when there is no Microsoft connection to scan with. */
  available: boolean;
  lastRunAt: string | null;
  lastResult: string | null;
  lastLoggedCount: number;
  lastScannedCount: number;
  everSynced: boolean;
}

const FAILURE_TEXT: Record<string, string> = {
  not_connected: "No Microsoft account is connected.",
  reconnect_needed: "Microsoft stopped accepting the connection. Reconnect above.",
  missing_scope: "Reading mail wasn't granted. An administrator has to approve it.",
  not_configured: "This deployment has no app registration yet.",
  unavailable: "Microsoft didn't answer. It will try again.",
};

/**
 * What the mailbox scan is doing, and the button to make it do it now.
 *
 * The scan runs on its own while the app is open, so this exists to answer
 * "did it work" rather than to be used. The one thing worth spelling out here
 * is what it does not keep, because that is the question anyone sensible asks
 * before pointing software at their inbox.
 */
export function MailScanCard({ state }: { state: MailScanState }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function scanNow() {
    setRunning(true);
    setNote(null);
    try {
      const res = await fetch("/api/microsoft/mail-sync?force=1", { method: "POST" });
      const result = (await res.json()) as {
        logged?: number;
        scanned?: number;
        ok?: boolean;
        failure?: string;
        error?: string;
      };
      if (result.error) setNote(result.error);
      else if (result.failure) setNote(FAILURE_TEXT[result.failure] ?? "That didn't work.");
      else {
        // Both numbers, always. "Nothing new" on its own hides the difference
        // between a quiet mailbox and a sweep that is matching nobody.
        const scanned = result.scanned ?? 0;
        setNote(
          `Read ${scanned} message${scanned === 1 ? "" : "s"}, logged ${result.logged ?? 0}.`,
        );
      }
      router.refresh();
    } catch {
      setNote("That didn't work. Try again.");
    } finally {
      setRunning(false);
    }
  }

  const failed = state.lastResult && state.lastResult !== "ok";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mailbox className="h-4 w-4 text-primary" />
              Email scanning
            </CardTitle>
            <CardDescription>
              Logs email to and from the lenders in your list, so coverage keeps itself
              up to date without you logging anything.
            </CardDescription>
          </div>
          <Badge variant={state.available && !failed ? "success" : "muted"}>
            {!state.available ? "Off" : failed ? "Needs attention" : "On"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <ul className="space-y-1.5 text-muted">
          <li>
            Only mail where the other address belongs to one of your lenders is kept.
            Everything else is passed over.
          </li>
          <li>
            The subject line and the date are stored. The message text is never
            requested, so there is no borrower detail sitting in North.
          </li>
          <li>
            Mail from a lender counts as a conversation. Mail you sent counts as a
            sent email, which for tier A and B does not mark them covered on its own.
          </li>
        </ul>

        {!state.available ? (
          <p className="text-muted">
            Connect a Microsoft account above and this starts on its own, reaching back
            ninety days the first time.
          </p>
        ) : (
          <p className="text-muted">
            {state.lastRunAt
              ? `Last checked ${new Date(state.lastRunAt).toLocaleString()}: read ${
                  state.lastScannedCount
                } message${state.lastScannedCount === 1 ? "" : "s"}, logged ${
                  state.lastLoggedCount
                }.`
              : "Not run yet. The first sweep reaches back ninety days."}
            {failed ? ` ${FAILURE_TEXT[state.lastResult!] ?? state.lastResult}` : ""}
          </p>
        )}

        {state.available && (
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="md" onClick={scanNow} disabled={running}>
              {running ? "Checking…" : "Check now"}
            </Button>
            {note && <span className="text-[13px] text-muted">{note}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
