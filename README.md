# North

A personal lender relationship and communication command center for an SBA 504
Business Development Officer. Built from `lender_crm_build_spec.md`.

> **⚠️ Not yet deployed — action needed**
> The app is code-complete for the foundational slice but the Supabase
> project **hasn't been created yet**. Follow [`DEPLOYMENT.md`](./DEPLOYMENT.md)
> to provision Supabase, Vercel, and (optionally) Resend. Until then, every
> page redirects to a setup notice.

## What's built (foundational slice)

- **Auth** — separate CRM email/password via Supabase Auth, password reset,
  session handling in the proxy. Private per-user workspace enforced by Row
  Level Security on every table.
- **Full database schema** — all ~35 tables from the spec (lenders,
  institutions, activities, meetings, promises, opportunities, active loans,
  campaigns, trips, expenses, voice profile, audit log…) as SQL migrations in
  `supabase/migrations/`, with RLS policies, soft deletion + 90-day purge,
  audit logging, and an institution-change function that preserves history.
- **Sample data** — new accounts are seeded with clearly-labeled fictional
  data (24 lenders, 8 institutions, meetings, promises, deals, loans, a
  St. George trip). Importing your real list deletes it after confirmation.
- **Coverage engine** — rolling 30-day goal + 10-day grace, "visible" vs
  "personally engaged" tracking, confirmed-future-meeting handling. Unit
  tested (`npm test`).
- **Screens** — Dashboard (priority-ordered: missing notes → overdue promises
  → loan updates due → weekly Top 10 → upcoming meetings), Lenders (views,
  typo-tolerant search), Lender profile (timeline, personal details,
  promises, institution history, text-and-log flow), Institutions, Add
  Lender (duplicate check, follow-up timing), Excel Import wizard (mapping,
  preview, dedupe, note-tag suggestions, import report), Follow-ups
  (promises front and center), Needs Attention queue, Settings, Trash
  (restore / permanent delete), CSV export.
- **Abstractions ready for keys** — AI provider (Anthropic) and outbound
  email (Resend) are behind feature flags; the CRM is fully usable with both
  off. Microsoft integration is stubbed per spec and never blocks the app.

## Not yet built (next sessions, per spec build order)

Meetings & scheduling composer, meeting briefs & note capture with
reminders, weekly Top 10 AI generation, outreach drafting UI, campaigns &
batch queue, deal intake / opportunity detail, active-loan update center,
assistant, reports, trips UI, expenses, daily digest job.

## Development

```bash
npm install
cp .env.example .env.local   # fill in Supabase values
npm run dev
```

- `npm test` — coverage-engine and follow-up-sequence unit tests
- `npm run lint` / `npx tsc --noEmit`
- Database smoke tests (needs local PostgreSQL 16): apply
  `supabase/tests/local_harness.sql`, the four migrations, then
  `supabase/tests/smoke_test.sql` — validates RLS isolation, sample-data
  lifecycle, coverage view semantics, and the 90-day purge.

## Stack

Next.js (App Router, TypeScript) · Tailwind CSS v4 · Supabase (Postgres,
Auth, RLS) · Vercel · PWA-installable on iPhone.
