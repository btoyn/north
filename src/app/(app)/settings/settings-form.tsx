"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, FieldHint } from "@/components/ui/input";
import { signOut, updatePreferences, updateProfile } from "./actions";

export function SettingsForm({
  profile,
  prefs,
}: {
  profile: { display_name: string; home_city: string; email: string; email_signature: string };
  prefs: {
    default_contact_goal_days: number;
    contact_grace_days: number;
    weekly_top_count: number;
    weekly_on_deck_count: number;
    default_campaign_batch_size: number;
    look_follow_up_days: number;
    daily_digest_enabled: boolean;
    daily_digest_time: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const [p1, p2] = await Promise.all([
        updateProfile({
          display_name: String(f.get("display_name") ?? ""),
          home_city: String(f.get("home_city") ?? ""),
          email_signature: String(f.get("email_signature") ?? ""),
        }),
        updatePreferences({
          default_contact_goal_days: Number(f.get("goal_days")),
          contact_grace_days: Number(f.get("grace_days")),
          weekly_top_count: Number(f.get("top_count")),
          weekly_on_deck_count: Number(f.get("on_deck_count")),
          default_campaign_batch_size: Number(f.get("batch_size")),
          look_follow_up_days: Number(f.get("look_days")),
          daily_digest_enabled: f.get("digest_enabled") === "on",
          daily_digest_time: String(f.get("digest_time") ?? "08:00"),
        }),
      ]);
      const err = p1.error ?? p2.error;
      if (err) setError(err);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your preferences</CardTitle>
        <CardDescription>Signed in as {profile.email}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="display_name">Your name</Label>
              <Input id="display_name" name="display_name" defaultValue={profile.display_name} />
            </div>
            <div>
              <Label htmlFor="home_city">Home base</Label>
              <Input id="home_city" name="home_city" defaultValue={profile.home_city} />
            </div>
          </div>

          <div>
            <Label htmlFor="email_signature">Email signature</Label>
            <textarea
              id="email_signature"
              name="email_signature"
              rows={4}
              defaultValue={profile.email_signature}
              placeholder={"Brandon Toynbee\nBusiness Development Officer\nInterMountain Business Lending\n(801) 555-0100"}
              className="w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13.5px] leading-relaxed outline-none transition-colors focus:border-primary/40"
            />
            <FieldHint>
              Signs off the first loan-update email on each loan. After that, each week starts from
              what you sent last week, so edits carry forward on their own.
            </FieldHint>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="goal_days">Contact goal (days)</Label>
              <Input
                id="goal_days"
                name="goal_days"
                type="number"
                min={7}
                max={120}
                defaultValue={prefs.default_contact_goal_days}
              />
              <FieldHint>Every partner, same goal. Tier changes priority, not the window.</FieldHint>
            </div>
            <div>
              <Label htmlFor="grace_days">Grace period (days)</Label>
              <Input
                id="grace_days"
                name="grace_days"
                type="number"
                min={0}
                max={30}
                defaultValue={prefs.contact_grace_days}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="top_count">Weekly Top list</Label>
              <Input id="top_count" name="top_count" type="number" min={3} max={25} defaultValue={prefs.weekly_top_count} />
            </div>
            <div>
              <Label htmlFor="on_deck_count">On Deck list</Label>
              <Input id="on_deck_count" name="on_deck_count" type="number" min={0} max={25} defaultValue={prefs.weekly_on_deck_count} />
            </div>
            <div>
              <Label htmlFor="batch_size">Campaign batch size</Label>
              <Input id="batch_size" name="batch_size" type="number" min={5} max={100} defaultValue={prefs.default_campaign_batch_size} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="look_days">Follow up on a look after</Label>
              <Input
                id="look_days"
                name="look_days"
                type="number"
                min={1}
                max={30}
                defaultValue={prefs.look_follow_up_days}
              />
              <FieldHint>
                Days before a lender&apos;s possible deal comes back for a reply.
              </FieldHint>
            </div>
          </div>

          <div className="flex items-end gap-3">
            <label className="flex h-10 items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="digest_enabled"
                defaultChecked={prefs.daily_digest_enabled}
                className="h-4 w-4 rounded border-border"
              />
              Weekday morning digest
            </label>
            <div>
              <Label htmlFor="digest_time">at</Label>
              <Input
                id="digest_time"
                name="digest_time"
                type="time"
                defaultValue={prefs.daily_digest_time}
                className="w-32"
              />
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {saved && <p className="text-sm text-success">Saved.</p>}

          <div className="flex items-center justify-between">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save settings"}
            </Button>
            <Button type="button" variant="ghost" className="text-muted" onClick={() => startTransition(() => signOut())}>
              Sign out
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
