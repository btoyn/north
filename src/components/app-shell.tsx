"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Layers,
  KanbanSquare,
  CheckSquare,
  Banknote,
  BookOpen,
  Settings,
  Trash2,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickLog } from "@/components/quick-log";
import { NorthLockup } from "@/components/brand";
import type { NavCounts, QuickLogData } from "@/lib/data";

/**
 * Five destinations, not seven.
 *
 * Partners, Institutions and Needs Attention were three doors into the same
 * table — Spheres is that table with its useful slices named. Looks became
 * Pipeline. Import still lives in Settings.
 */
const PRIMARY_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, count: null },
  { href: "/tiers", label: "Tiers", icon: Layers, count: "needsAttention" },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare, count: "looksDue" },
  { href: "/loans", label: "Loans", icon: Banknote, count: "loansDue" },
  { href: "/follow-ups", label: "Follow-ups", icon: CheckSquare, count: "followUps" },
] as const;

const UTILITY_NAV = [
  { href: "/guide", label: "Guide", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/trash", label: "Trash", icon: Trash2 },
];

/* The centre slot is the quick-log trigger, not a link — logging happens daily
   while adding a lender is occasional and already prominent on Spheres. */
const MOBILE_LEFT = [
  { href: "/dashboard", label: "Today", icon: LayoutDashboard },
  { href: "/tiers", label: "Tiers", icon: Layers },
];

const MOBILE_RIGHT = [
  { href: "/follow-ups", label: "Follow-ups", icon: CheckSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Badge tone carries urgency, not just a count. */
function badgeTone(
  kind: "followUps" | "needsAttention" | "loansDue" | "looksDue",
  count: number,
  active: boolean,
): string {
  if (active) return "bg-white/25 text-white";
  if (kind === "needsAttention") return "bg-danger-soft text-[#a8434a]";
  // A loan update or a look owed a reply is time-sensitive but not yet a problem.
  if (kind === "loansDue" || kind === "looksDue") return "bg-gold-soft text-[#8a6215]";
  return count > 5 ? "bg-gold-soft text-[#8a6215]" : "bg-primary-soft text-[#1a4ad9]";
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  count,
  countKind,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  count?: number;
  countKind?: "followUps" | "needsAttention" | "loansDue" | "looksDue";
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13.5px] font-medium transition-all duration-150",
        active
          ? "bg-primary text-white shadow-[0_2px_8px_rgba(30,91,255,0.3)]"
          : "text-[#25324c] hover:bg-primary-soft hover:text-primary",
      )}
    >
      <Icon className="h-[17px] w-[17px] shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && countKind && (
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums",
            badgeTone(countKind, count, active),
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

function MobileLink({
  href,
  label,
  icon: Icon,
  active,
  counts,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  counts?: NavCounts;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors active:bg-primary-soft",
        active ? "text-primary" : "text-muted",
      )}
    >
      <Icon className="h-5 w-5" />
      {label}
      {href === "/follow-ups" && (counts?.followUps ?? 0) > 0 && (
        <span className="absolute right-[22%] top-2 h-1.5 w-1.5 rounded-full bg-primary" />
      )}
    </Link>
  );
}

export function AppShell({
  children,
  userEmail,
  counts,
  quickLog,
}: {
  children: React.ReactNode;
  userEmail?: string;
  counts?: NavCounts;
  quickLog: QuickLogData;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen w-full">
      {/* Light sidebar, primary navigation grouped away from utilities */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 md:flex">
        <Link href="/dashboard" className="mb-5 flex items-center px-1.5">
          <NorthLockup size={16} />
        </Link>

        <QuickLog data={quickLog}>
          {(open) => (
            <button
              onClick={open}
              className="mb-4 flex h-10 items-center justify-center gap-2 rounded-[10px] bg-primary text-[13.5px] font-semibold text-white shadow-[0_2px_8px_rgba(30,91,255,0.28)] transition-all duration-150 hover:bg-primary-hover active:translate-y-px"
            >
              <Phone className="h-4 w-4" />
              Log a call
            </button>
          )}
        </QuickLog>

        <nav className="flex flex-col gap-0.5" aria-label="Main">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActive(item.href)}
              count={item.count ? counts?.[item.count] : undefined}
              countKind={item.count ?? undefined}
            />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-0.5 border-t border-sidebar-border pt-3">
          {UTILITY_NAV.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} />
          ))}
          {userEmail && (
            <p className="truncate px-3 pb-1 pt-2 text-[11.5px] text-muted" title={userEmail}>
              {userEmail}
            </p>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8">{children}</div>
      </main>

      {/* Mobile bottom nav — 44px+ touch targets */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Main"
      >
        {MOBILE_LEFT.map((item) => (
          <MobileLink key={item.href} {...item} active={isActive(item.href)} counts={counts} />
        ))}

        <QuickLog data={quickLog}>
          {(open) => (
            <button
              onClick={open}
              aria-label="Log a call"
              className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-primary transition-colors active:bg-primary-soft"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white shadow-[0_2px_6px_rgba(30,91,255,0.35)]">
                <Phone className="h-4 w-4" />
              </span>
              Log
            </button>
          )}
        </QuickLog>

        {MOBILE_RIGHT.map((item) => (
          <MobileLink key={item.href} {...item} active={isActive(item.href)} counts={counts} />
        ))}
      </nav>
    </div>
  );
}
