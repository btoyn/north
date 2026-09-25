import { cn } from "@/lib/utils";

/**
 * Partner avatar. Tints come from a controlled five-colour palette — pale blue,
 * teal, plum, gold, slate — so a long list stays calm and nothing reads as a
 * random bright colour.
 */
const TINTS = [
  "bg-[#e6ecfb] text-[#2c4bab]", // pale blue
  "bg-[#e6f3f0] text-[#206a5f]", // pale teal
  "bg-[#f0ebf8] text-[#5c4886]", // pale plum
  "bg-[#faf0da] text-[#8a6215]", // pale gold
  "bg-[#e9edf4] text-[#4a5875]", // pale slate
] as const;

/** Status shown as a dot on the avatar. Always paired with a text label nearby. */
export type AvatarStatus = "overdue" | "grace" | "inbound" | "priority" | "none";

const STATUS_RING: Record<Exclude<AvatarStatus, "none">, string> = {
  overdue: "bg-danger",
  grace: "bg-gold",
  inbound: "bg-teal",
  priority: "bg-primary",
};

export const AVATAR_STATUS_LABEL: Record<Exclude<AvatarStatus, "none">, string> = {
  overdue: "Overdue",
  grace: "Grace period",
  inbound: "Recent inbound contact",
  priority: "Strategic priority",
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable per-name tint so the same partner always looks the same. */
function tintFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 9973;
  return TINTS[hash % TINTS.length];
}

const SIZES = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-xs",
  lg: "h-11 w-11 text-[13px]",
  xl: "h-11 w-11 text-[13px] sm:h-[44px] sm:w-[44px] sm:text-sm",
} as const;

export function Avatar({
  name,
  size = "md",
  status = "none",
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  status?: AvatarStatus;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex items-center justify-center rounded-full font-semibold tracking-tight",
          SIZES[size],
          tintFor(name),
        )}
      >
        {initialsOf(name)}
      </span>
      {status !== "none" && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white",
            STATUS_RING[status],
          )}
          title={AVATAR_STATUS_LABEL[status]}
        >
          <span className="sr-only">{AVATAR_STATUS_LABEL[status]}</span>
        </span>
      )}
    </span>
  );
}
