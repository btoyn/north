import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MailScanTrigger } from "@/components/mail-scan-trigger";
import { createClient } from "@/lib/supabase/server";
import { getNavCounts, getQuickLogLenders } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [counts, quickLog] = await Promise.all([getNavCounts(), getQuickLogLenders()]);

  return (
    <AppShell userEmail={user.email} counts={counts} quickLog={quickLog}>
      <MailScanTrigger />
      {children}
    </AppShell>
  );
}
