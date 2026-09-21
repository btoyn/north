/**
 * What a click looks like before the server answers.
 *
 * Without this file the App Router holds the previous page on screen, inert,
 * until the data arrives. Every navigation reads as a freeze rather than a
 * wait, and the app feels broken in proportion to how far the database is —
 * which here is a different coast.
 *
 * The shape is deliberately generic: a heading, a line of description, and a
 * few cards. It stands in for every screen in the app, and a skeleton that
 * guesses the exact layout of the page you are going to is worse than one that
 * clearly means "this is arriving", because the guess is wrong half the time
 * and the correction is a second flash of movement.
 */

function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-[color:var(--color-border)]/60 ${className}`} />;
}

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Loading</span>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="w-full max-w-sm">
          <Bar className="h-7 w-48" />
          <Bar className="mt-2.5 h-4 w-72 max-w-full" />
        </div>
        <Bar className="h-9 w-28" />
      </div>

      <div className="space-y-5">
        {[0, 1, 2].map((card) => (
          <div
            key={card}
            className="rounded-[20px] border border-border/80 bg-surface p-6 shadow-[0_10px_30px_rgba(16,24,40,0.05)]"
          >
            <Bar className="h-4 w-40" />
            <div className="mt-5 space-y-3.5">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-3">
                  <Bar className="h-2.5 w-2.5 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <Bar className="h-3.5 w-1/3 min-w-[8rem]" />
                    <Bar className="mt-2 h-3 w-1/4 min-w-[6rem]" />
                  </div>
                  <Bar className="h-8 w-20 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
