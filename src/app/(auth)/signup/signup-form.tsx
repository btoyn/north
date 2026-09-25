"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, FieldHint } from "@/components/ui/input";

export function SignupForm({ requireInvite = false }: { requireInvite?: boolean }) {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    // Check the code before creating anything, so a bad code fails cleanly
    // instead of leaving a half-made account behind.
    if (requireInvite) {
      const { data: valid, error: inviteError } = await supabase.rpc("invite_is_valid", {
        p_code: inviteCode,
      });
      if (inviteError || !valid) {
        setError("That invite code isn't valid, or it has already been used.");
        setLoading(false);
        return;
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Burn the code. A failure here is not worth blocking the new account for.
    if (requireInvite) await supabase.rpc("redeem_invite", { p_code: inviteCode });

    if (data.session) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setNeedsConfirm(true);
      setLoading(false);
    }
  }

  if (needsConfirm) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">Check your email</CardTitle>
          <CardDescription>
            We sent a confirmation link to {email}. Click it to finish creating your account.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-lg">Create your account</CardTitle>
        <CardDescription>
          {requireInvite
            ? "Accounts are by invitation. Your workspace is private — nobody else can see your partners and notes."
            : "Your workspace is private — only you can see your partners and notes."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {requireInvite && (
            <div>
              <Label htmlFor="inviteCode">Invite code</Label>
              <Input
                id="inviteCode"
                required
                autoComplete="off"
                spellCheck={false}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
              <FieldHint>The code you were sent. Each one works once.</FieldHint>
            </div>
          )}
          <div>
            <Label htmlFor="displayName">Your name</Label>
            <Input
              id="displayName"
              autoComplete="name"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <FieldHint>This is your CRM login — separate from your Microsoft 365 account.</FieldHint>
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <FieldHint>At least 8 characters.</FieldHint>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
