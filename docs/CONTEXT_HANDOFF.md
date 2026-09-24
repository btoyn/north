# North — Context Handoff

**For an assistant picking this project up cold.** Read `docs/PRODUCT_SPEC.md` for what the product
*is* and why. This document is where the work actually stands, how it is built, what to be careful
about, and what is still undecided.

Snapshot date: **August 2026.** Numbers below are live-database counts at that point and will drift.

---

## 1. How to work with Brandon

These are not preferences to be polite about — they were stated directly and repeatedly.

- **Be brief.** Short answers, plain words, no preamble or recap. Give the steps or the result, not
  the reasoning behind them unless asked.
- **Do not build until told.** Explicitly: *"from now on, do not build anything until I
  specifically tell you."* Design discussions are common and often span several exchanges; treat
  "let's talk through this" and "don't build yet" as hard stops.
- **Ask questions instead of assuming.** *"if you have questions along the way, ask the question.
  Don't assume."* When a decision would change the work, ask. He answers directly.
- **He pushes back well, and is usually right.** He reversed a too-narrow definition of a
  "look," rejected a five-stage loan pipeline, killed predicted SBA dates, and caught a deck full
  of stray outlines. Take the pushback seriously and check rather than defend.
- **Cost is not the objection; approval is.** *"i didn't say if it costs money its a no go, just
  that we need to get approval first."*

---

## 2. Stack and infrastructure

| Piece | Detail |
|---|---|
| Framework | **Next.js 16.3.0**, App Router, React 19.2, Turbopack, TypeScript |
| Styling | **Tailwind CSS v4** with `@theme inline` custom properties in `src/app/globals.css` |
| Database | **Supabase** Postgres, project `oflcbdnidtbqbwzpmvgp` ("lender-crm"), region `us-west-2` |
| Auth | Supabase Auth, email + password, publishable (`sb_publishable_…`) keys |
| Hosting | **Vercel**, project `north` (`prj_epKWAZtO4PAIA3DSrxmxH1xyUmsV`), team `imbl`, functions pinned to `pdx1` to sit beside the database |
| Live at | `north-chi-three.vercel.app` |
| Repo | `btoyn/north`, default branch `main` |
| Tests | **Vitest**, 117 tests across 8 files, all pure logic |

**Naming, as it actually stands.** Product, GitHub repo and Vercel project are all `north`. The
repo kept its numeric id through the rename, so old clone URLs redirect and Vercel's link to it
survived. The old Vercel project `fable-tracker` still exists and still serves
`fable-tracker.vercel.app`; it was kept rather than deleted because it was the only working
deployment while `north` was being set up, and it is safe to remove once nothing points at it.

### There is a hard rule about Next.js in this repo

`AGENTS.md` (loaded via `CLAUDE.md`) says this version has breaking changes versus training data,
and that the relevant guide in `node_modules/next/dist/docs/` should be read before writing code.
That block is written and re-added by `next dev`. **Do not delete it from a diff** — that only
re-creates the uncommitted change. Commit it with the work.

---

## 3. Repository layout

```
src/
  app/
    (app)/          authenticated screens; each has actions.ts for server actions
    (auth)/         login, signup, reset-password
    auth/callback   Supabase auth handler
    export/         full data export route
    setup/          shown when Supabase env is missing
  components/       shared UI; brand.tsx holds the logo marks
  lib/              all business logic — pure where possible, tested
supabase/migrations/  0001 … 0009, applied in order
docs/                 spec, handoff, guide, original plan, brand sheet
```

### The logic modules that matter

| File | What it owns | Tested |
|---|---|---|
| `lib/coverage.ts` | The coverage engine — goal, grace, personal vs visible | ✅ |
| `lib/scheduling.ts` | Finding open meeting slots from availability rules | ✅ |
| `lib/reply-reader.ts` | Understanding a lender's emailed reply | ✅ |
| `lib/loan-cadence.ts` | The weekly loan-update clock | ✅ |
| `lib/loan-email.ts` | Composing the update email, mailto limits | ✅ |
| `lib/looks.ts` | The look follow-up clock and titles | ✅ |
| `lib/lender-groups.ts` | Territory → institution grouping and roll-ups | ✅ |
| `lib/followup.ts` | Follow-up scheduling helpers | ✅ |
| `lib/dashboard.ts` | Dashboard aggregation queries |  |
| `lib/data.ts` | Shared queries, nav counts |  |
| `lib/ai/` | Provider abstraction; `DisabledProvider` when no key |  |
| `lib/flags.ts` | Feature flags, all env-driven, all default off |  |
| `lib/fuzzy.ts` | Trigram matching — "Whitfeild" finds Whitfield |  |
| `lib/audit.ts` | Append-only audit log writes |  |

**Convention worth preserving:** anything with a rule in it gets extracted into `lib/` as a pure
function and unit-tested, then imported by both the screen and any aggregation that needs it. This
is why the loan cadence exists in one place instead of three.

---

## 4. Database

**9 migrations**, `0001` … `0009`. **38 tables.** Applied to the live project — verify with
`list_migrations` rather than assuming.

Core: `users`, `user_preferences`, `institutions`, `lenders`, `activities`, `meetings`,
`opportunities` (= looks), `active_loans`, `promises`, `tasks`, `audit_log`.

Supporting: `lender_institution_history`, `lender_personal_details`, `meeting_attendees`,
`meeting_notes`, `active_loan_recipients`, `campaigns` + recipients + batches, `sba_questions`,
`assistant_suggestions`, `weekly_relationship_plans` + items, `templates`, `opportunity_files`,
`trips`, `trip_targets`, `locations`, `drop_offs`, `expenses`, `monthly_budgets`, `annual_goals`,
`voice_examples`, `voice_preferences`, `territories`, `signup_invites`, `availability_rules`,
`meeting_proposals`.

**One view:** `lender_coverage` — the aggregation the coverage engine reads.

**Security-definer RPCs:** `invite_is_valid`, `redeem_invite`, `create_signup_invite`,
`list_signup_invites`, `revoke_signup_invite`, `is_workspace_admin`, `create_sample_data`,
`delete_sample_data`, `has_sample_data`, `change_lender_institution`, `purge_soft_deleted`.

### Things to know before touching the schema

- **RLS is on every owned table** with four identical policies keyed on `user_id` (`id` for
  `users`). `audit_log` has no update/delete. `territories` is global read-only.
- **A lot of tables have no screen yet.** `campaigns`, `trips`, `expenses`, `voice_examples`,
  `drop_offs`, `monthly_budgets`, `annual_goals` are storage waiting on UI. Do not assume an empty
  table means a dead feature.
- **`opportunities` predates the Looks screen** and carries a longer stage list from when it modelled
  a full early-deal pipeline. `isLookOpen()` treats anything not explicitly closed as open, so old
  records surface rather than vanishing.

### Live data at snapshot

| | |
|---|---|
| Lenders | **142**, all real, **zero sample data** |
| Institutions | 24 |
| Active loans | 12 |
| Looks | 2 |
| Activities logged | 22 |
| Meetings / proposals | 0 / 0 |
| Availability rules | **0** |
| Users | 1 |

**Read those last two carefully.** Availability is unset, so the propose-a-meeting flow has nothing
to search. Only 22 activities are logged against 142 lenders, so coverage currently reads almost
everyone as `never_contacted` — the dashboard looks alarming and means little. That fills in with
use. He knows, and has said not to keep raising it.

---

## 5. What works, what's blocked, what isn't built

### Working, no dependencies
Lender and institution database with Excel import · coverage tracking with the two-clock split ·
Needs Attention queue · weekly relationship list · grouped lender browsing · meeting proposals with
reply reading and chase · Looks with follow-up clock and who's-reaching-out · loan updates with the
draft composer and two endings · promises both directions · tasks · personal details · bank-change
history · full timeline per lender · import, export, 90-day trash, audit log · single-use invite
codes · admin invite screen

### Needs an Anthropic API key
Drafting in his voice · plain-English reply understanding · pre-meeting briefs. Today `Ask
assistant` is the only AI path, and it explains itself when the key is absent.

### Needs IT (Microsoft Entra app registration)
Real Outlook drafts · reply monitoring · calendar conflict checks · sending actual meeting
invitations · a Bookings self-service link.

**Current workaround:** loan updates hand off through a `mailto:` link, which cannot confirm a send
— so *opening* the draft is treated as sent. Long bodies (>~1800 characters) disable the button and
point at Copy, because mailto implementations truncate silently.

### Not built
Voice samples screen · monthly SBA update (needs real email sending) · St. George trip planner ·
meeting briefs · expenses and drop-off logging · job-change alerts · campaigns.

---

## 6. Recent work, newest first

| Commit | What |
|---|---|
| `532429f` | Grouped the lender list by territory then bank, with roll-up headers |
| `e82369e` | Corrected six stale or wrong facts in the user guide |
| `00e7601` | Rebrand to North — traced logo, palette, renamed everywhere |
| `2b893d2` | The weekly loan-update email composer, no stage picker |
| `6ccf7e1` | Looks — logging deal mentions and who brings them |
| `654a728` | Kept the original August build plan in the repo |
| `2017208` | The Loans page, so the weekly clock had a front door |
| `d5b937a` | Wrote down the hands-off scheduling goal and its blockers |
| `c0bfff2` | Propose meetings, read replies, chase silence |
| `e542b4b` | Single-use invite codes; signups closed |

---

## 7. Open questions

Genuinely undecided. Do not resolve these unilaterally.

1. **Does the Institutions page still earn a sidebar slot?** The grouped Lenders list now overlaps
   it. Either grouped-Lenders becomes the browse surface, or Institutions does and Lenders reverts
   to search-and-filter.
2. **Should lender groups sort worst-first or alphabetically?** Currently worst-first, matching every
   other queue. Alphabetical would be more predictable for muscle memory. One-line change.
3. **Does the borrower need different wording than the lender** on a loan update? Today they receive
   the identical email. He approved that, but it was never tested against a real send.
4. **The St. George Monday exception.** Mondays are office days *except* when he is in St. George.
   The availability model cannot express this. Parked until the trip planner is designed.
5. **The monthly SBA update needs a sending path** — an email service, plus CAN-SPAM handling
   (accurate sender, physical address, working unsubscribe) and list segmentation so it never
   collides with one-to-one outreach.

## 8. Loose ends he needs to do himself

1. **Supabase Site URL** still points at `fable-tracker.vercel.app`, the project from before the
   rename. It is a *different field* from the redirect list, and it is what confirmation and
   password-reset links are built from — this is what broke a login link sent to a coworker. The
   redirect list needs the preview wildcard too, or signing in on a preview build fails.
2. **Check availability** in Settings. Defaults are in use until something is saved.
3. **Add an email signature** in Settings. Blank, so every loan's first draft has no sign-off.
4. **12 lenders have no email address** and cannot receive a proposal or an update.

---

## 9. Environment and verification gotchas

These have caused real mistakes. They are worth reading before claiming something works.

**Supabase is unreachable from the Claude Code sandbox over plain HTTP** — the egress proxy returns
`CONNECT tunnel failed, 403`. The Supabase **MCP tools do work**, so schema and data can be
inspected and migrations applied. But the *running app* cannot reach the database from the sandbox,
so authenticated screens cannot be rendered there. Verify UI against mock data through a temporary
preview route, and say so rather than implying a live check.

**LibreOffice cannot convert anything in the sandbox** — it fails on a plain `.txt`. Office-document
QA has to be done another way.

**Headless Chromium gives a viewport ~87px shorter than `--window-size` requests.** Screenshots
silently crop the bottom of the page unless the requested height is padded.

**Never claim a check that wasn't run.** An earlier session reported that invite-code rejection was
verified when the failure was actually a network error showing the same message. If something wasn't
tested against real data, say that.

**Temporary preview routes and `.env.local` must be deleted before committing.** Also remove any
`PUBLIC_PATHS` bypass added to `src/proxy.ts` to reach them, and clear `.next` afterwards — a stale type
validator will keep referencing the deleted route and fail the build.

---

## 10. Standing decisions not to reopen without asking

- **The tool drafts; a person presses send.** Not a limitation to engineer away.
- **No amounts, no stages, no production numbers.** A second copy is always the stale one.
- **The reply reader abstains rather than guesses.**
- **No predicted SBA dates.**
- **RLS per user, with no cross-user visibility even for the admin.**
- **The app must work fully with AI switched off.**
- **Coffee is not a meeting type.**
