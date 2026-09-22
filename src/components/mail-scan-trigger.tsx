"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Kicks the mailbox sweep off once, quietly, after the app has painted.
 *
 * There is no cron behind this. Running it from the browser is what lets the
 * sweep act as the signed-in user, so it reads and writes through the same
 * row-level security as everything else and this feature needs no service key
 * anywhere. The cost is that it only happens while somebody has the app open,
 * which for a tool you check every morning is often enough.
 *
 * Fires after paint and never blocks a render. The route itself refuses to run
 * more than twice an hour, so the worst a stray call can do is get a no.
 */
const ONCE_PER_TAB = "north:mail-scan";

export function MailScanTrigger() {
  const router = useRouter();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(ONCE_PER_TAB)) return;
      sessionStorage.setItem(ONCE_PER_TAB, "1");
    } catch {
      // Private browsing, blocked storage. Falling through means it runs once
      // per page load instead of once per tab, which the route rate-limits.
    }

    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/microsoft/mail-sync", { method: "POST" });
        const result = (await res.json()) as { logged?: number };
        // Only disturb the screen when something actually landed on it.
        if (!cancelled && result.logged) router.refresh();
      } catch {
        // A sweep that didn't happen is the state the app was in a minute ago.
      }
    };

    // requestIdleCallback where it exists, so this never competes with the
    // first interaction.
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 2000));
    const handle = idle(run);

    return () => {
      cancelled = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(handle as number);
    };
  }, [router]);

  return null;
}
