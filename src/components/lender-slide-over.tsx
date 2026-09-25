"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, X } from "lucide-react";

/**
 * The partner panel on Spheres.
 *
 * Opening a partner shouldn't cost you your place in the list — you are usually
 * working down a sphere, and coming back to the top of it every time is how a
 * tidy-up session stops being one. So the detail slides over the list and the
 * list stays behind it.
 *
 * The content is a Server Component passed in as children, which is why all of
 * that partner's queries stay on the server: this shell never imports it.
 */
export function LenderSlideOver({
  name,
  /** Where Close goes back to — the sphere, without the partner in the URL. */
  closeHref,
  lenderId,
  children,
}: {
  name: string;
  closeHref: string;
  lenderId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(closeHref, { scroll: false });
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [router, closeHref]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <Link
        href={closeHref}
        scroll={false}
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-navy/35 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lender-panel-title"
        className="animate-row-settle relative flex h-full w-full flex-col border-l border-border bg-background shadow-[0_20px_60px_rgba(16,24,40,0.28)] sm:max-w-[640px]"
      >
        <div className="flex items-start gap-3 border-b border-border bg-surface px-5 py-4">
          <h2 id="lender-panel-title" className="min-w-0 flex-1 text-[17px] font-semibold">
            {name}
          </h2>
          <Link
            href={`/partners/${lenderId}`}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-muted transition-colors hover:bg-black/[0.05] hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Full page
          </Link>
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-black/[0.05] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Link>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
