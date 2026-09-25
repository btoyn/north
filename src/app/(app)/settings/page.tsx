import Link from "next/link";
import { Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getFlags } from "@/lib/flags";
import { SettingsForm } from "./settings-form";
import { AvailabilityCard } from "./availability-card";
import { InvitesCard } from "./invites-card";
import { MicrosoftCard } from "./microsoft-card";
import { MailScanCard } from "./mail-scan-card";
import { getConnection } from "@/lib/microsoft/tokens";
import { SCOPE_FOR, scopeSatisfied } from "@/lib/microsoft/config";
import { listInvites } from "./invite-actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ microsoft?: string }>;
}) {
  const { microsoft: microsoftResult } = await searchParams;
  const supabase = await createClient();
  const [
    { data: profile },
    { data: prefs },
    { data: availability },
    inviteResult,
    { data: mailState },
    connection,
  ] = await Promise.all([
    supabase.from("users").select("*").maybeSingle(),
    supabase.from("user_preferences").select("*").maybeSingle(),
    supabase
      .from("availability_rules")
      .select("meeting_type, weekdays, start_minute, end_minute"),
    listInvites(),
    supabase
      .from("mail_sync_state")
      .select("last_run_at, last_result, last_logged_count, last_scanned_count, last_synced_at")
      .maybeSingle(),
    getConnection(),
  ]);
  const flags = getFlags();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" />

      <div className="space-y-5">
        <SettingsForm
          profile={{
            display_name: profile?.display_name ?? "",
            home_city: profile?.home_city ?? "",
            email: profile?.email ?? "",
            email_signature: profile?.email_signature ?? "",
          }}
          prefs={{
            default_contact_goal_days: prefs?.default_contact_goal_days ?? 30,
            contact_grace_days: prefs?.contact_grace_days ?? 10,
            weekly_top_count: prefs?.weekly_top_count ?? 10,
            weekly_on_deck_count: prefs?.weekly_on_deck_count ?? 10,
            default_campaign_batch_size: prefs?.default_campaign_batch_size ?? 25,
            look_follow_up_days: prefs?.look_follow_up_days ?? 3,
            daily_digest_enabled: prefs?.daily_digest_enabled ?? true,
            daily_digest_time: (prefs?.daily_digest_time ?? "08:00").slice(0, 5),
          }}
        />

        <AvailabilityCard
          initialRules={(availability ?? []).map((r) => ({
            meetingType: r.meeting_type,
            weekdays: r.weekdays ?? [],
            startMinute: r.start_minute,
            endMinute: r.end_minute,
          }))}
          initialScheduling={{
            propose_horizon_days: prefs?.propose_horizon_days ?? 14,
            proposal_chase_days: prefs?.proposal_chase_days ?? 4,
            proposal_slot_count: prefs?.proposal_slot_count ?? 2,
          }}
        />

        <MicrosoftCard result={microsoftResult} />

        <MailScanCard
          state={{
            available: Boolean(
              connection &&
                !connection.invalidatedAt &&
                scopeSatisfied(connection.scopes, SCOPE_FOR.readMail),
            ),
            lastRunAt: mailState?.last_run_at ?? null,
            lastResult: mailState?.last_result ?? null,
            lastLoggedCount: mailState?.last_logged_count ?? 0,
            lastScannedCount: mailState?.last_scanned_count ?? 0,
            everSynced: Boolean(mailState?.last_synced_at),
          }}
        />

        {/* Only the workspace admin gets this — listInvites errors for everyone else. */}
        {inviteResult.invites && <InvitesCard initialInvites={inviteResult.invites} />}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connections</CardTitle>
            <CardDescription>
              The CRM works fully in manual mode — connections add drafting and scheduling help.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ConnectionRow
              name="AI drafting"
              enabled={flags.ai}
              detail={
                flags.ai
                  ? "On — drafts, meeting-note extraction, and weekly plan reasoning available."
                  : "Off. Add an Anthropic API key to enable drafting in your voice. Everything else keeps working without it."
              }
            />
            <ConnectionRow
              name="Digest email"
              enabled={flags.outboundEmail}
              detail={
                flags.outboundEmail
                  ? "On — the 8:00 AM weekday digest and 5:00 PM note reminders arrive by email."
                  : "Off. Add a Resend API key to receive the daily digest by email. Reminders still show in the app."
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import a partner list</CardTitle>
            <CardDescription>
              Bring in a spreadsheet of lenders. You&apos;ll review the column mapping and any
              duplicates before anything is saved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/import" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              <Upload className="h-4 w-4" /> Open import wizard
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Export your data</CardTitle>
            <CardDescription>
              Everything is yours — download it as CSV any time.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            {[
              ["lenders", "Lenders"],
              ["institutions", "Institutions"],
              ["activities", "Activities"],
              ["tasks", "Tasks"],
              ["promises", "Promises"],
              ["opportunities", "Looks"],
              ["active_loans", "Active loans"],
            ].map(([key, label]) => (
              <a
                key={key}
                href={`/export?entity=${key}`}
                className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-primary-soft hover:text-primary"
              >
                {label} CSV
              </a>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ConnectionRow({
  name,
  enabled,
  detail,
}: {
  name: string;
  enabled: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
      <div>
        <p className="font-medium">{name}</p>
        <p className="mt-0.5 text-muted">{detail}</p>
      </div>
      <Badge variant={enabled ? "success" : "muted"}>{enabled ? "On" : "Off"}</Badge>
    </div>
  );
}
