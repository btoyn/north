# North — what it is, and what it isn't

Written 18 Sep 2026, from an interview with Brandon. This is the decision
record: what the app is for, what gets cut, and what the rules are. When code
and this document disagree, this document is the one to argue with.

---

## 1. What the numbers said before we started

Every row in the live database, counted:

| | |
|---|---|
| Lenders (real, non-sample) | 142 |
| …who have ever sent a look or a loan | **14** |
| …who have ever been touched at all | 22 |
| …completely cold | **116** |
| Activities logged, ever | 53 (Jun 3 → Jul 22 → Aug 25 → **Sep 3**) |
| Loans on the books | 16 |
| Meeting proposals ever created | **0** |
| Meetings ever held | **0** |
| Availability windows ever configured | **0** |
| Lenders tiered | **0** |
| Promises completed | **0** of 4 |
| Tables in the schema | **41** |

Twenty of those 41 tables have never held a row: expenses, monthly budgets,
drop-offs, templates, voice examples, SBA questions, locations, meeting notes,
assistant suggestions, availability rules.

The first reading was "the scheduling feature is unloved". That was wrong.
Brandon is still in build mode and hasn't launched it on himself. The real
finding is narrower and more useful: **scheduling has never been used because
availability windows were never set, so it had nothing to suggest from.** The
feature was gated behind a setup step nobody was told to do.

*Fixed, 21 Sep.* The app ships default windows and uses them until someone
saves their own, so a proposal works on a fresh account. Turning a meeting
type off still works, because an off switch is now stored explicitly rather
than implied by a missing row.

---

## 2. The one-sentence version

> North is the book of record for the bankers who send Brandon deals: who
> they are, what they've sent, when he last saw them, and what's next on the
> calendar.

Everything below either serves that sentence or gets cut.

---

## 3. What survives, and why

Confirmed in the interview. All four screens Brandon listed were kept when
forced to choose three, so nothing in this list is negotiable.

| Screen | Job |
|---|---|
| **Today** | What needs me + who to call today. The phone home screen. |
| **Bankers** | All 142, grouped by bank / territory / tier / custom list. |
| **Looks** | Deals coming in, and who sent them. |
| **Loans** | Files on the books, and keeping the referrer updated. |
| **Log** | Two taps. The single most important thing on a phone. |

Looks and Loans stay **separate screens** — explicitly decided. A look is a
sales funnel; a loan is a file being serviced. Different jobs.

Nav: `Today · Bankers · Looks · Loans · Log`. This replaces the
`Dashboard · Spheres · Pipeline · Loan updates · Follow-ups` naming shipped
this week. "Spheres" and "Pipeline" are our words, not his.

---

## 4. What gets cut

Decided, not proposed.

- **Campaign vs personal email as separate activity types.** One "email"
  type. (Sending a campaign *to a group* is still wanted — see §7 — it just
  isn't a distinct thing to record afterwards.)
- **Audit log, trash, CSV import.** 18 audit rows, 0 trash, import used once.
  Plumbing screens that cost navigation space and earn nothing. Import can be
  a one-off script when he needs it.
- **The twenty empty tables.** Expenses, budgets, annual goals, drop-offs,
  templates, voice examples/preferences, SBA questions, locations, meeting
  notes, assistant suggestions, trips and trip targets, weekly relationship
  plans. Drop them. They are schema for features that were never finished and
  that nobody asked to finish.

**Kept despite low usage** — he chose to keep them and they were never given a
fair run: momentum charts, promises and tasks, coverage percentages, the tier
system.

---

## 5. Tiers — the actual definitions

Four tiers, in his words, and now applied to all 137 lenders:

| Tier | Definition | Cadence | Count |
|---|---|---|---|
| **A** | Has sent me looks or deals | Monthly | 33 |
| **B** | Hasn't yet, but has real potential | Monthly | 41 |
| **C** | Good relationship, 2.5 years of marketing and nothing | Quarterly | 45 |
| **D** | No deals, not a great relationship — stay on the radar | Twice a year | 17 |
| — | Untiered | Workspace default | 1 |

Two weeks was rejected as overkill. **Monthly is the ceiling**, and A and B
share it: the difference between them is the bar for what counts, not how
often.

### A does not mean "has a row in this database"

Only 14 of the 33 A's show a deal in North. That is not a contradiction —
the deal history predates the tool, and some are in flight right now. The
consequence is a rule:

> **North never sets or changes a tier on its own.** Not from deal count,
> not from how long it has been. The tier is his judgement, and the app's job
> is to remember it.

An earlier draft of this document had the app auto-promoting producers to A.
That would have been wrong in both directions: it would have demoted 19 people
whose deals it simply has not been told about.

### What counts as a touch

| Tier | Bar |
|---|---|
| A, B | A real exchange — a call, a meeting, a text, or **a reply from them**. An email he sent into silence does not count. |
| C, D | Any contact. The point at this level is that they heard from him. |
| Anyone | A campaign blast never counts, at any tier. |

The failure this prevents: a stack of unanswered emails showing as a fully
covered A list, going green at exactly the moment the relationships went
quiet. The rule is `countsAsTouch` in `lib/tiers.ts`, and the coverage view
carries a matching `last_conversation_at` column. **Eleven lenders today have
outbound email and nothing else** — under the old rule they read as touched.

### Workload

A and B monthly, measured on conversations, is ~74 people a month. Most are
texts and calls, not lunches.

## 6. Groups

All four kinds are wanted: **bank, territory, tier, and lists he makes
himself.** The first three are facts about a lender and were already grouped
on. The fourth is the grouping that exists only in his head.

*Built, 21 Sep.* One model serves both halves of what he asked for ("probably
a combo of the first two"). From a list you see who is on it; from a lender
you tick the lists they belong to, which is a tag in everything but name. The
rows are the same either way.

A list surfaces as a sphere, so every screen that already renders spheres
renders lists too without knowing they exist. Unlike the other filtered views,
a list survives being empty: someone made it deliberately, and one that
vanished when its last member came off would look like the app had lost it.

## 7. Scheduling and email — the thing that has to work

The current flow asks him to pick dates by hand, generate an email, paste it
into Outlook, wait, copy the reply back in, and confirm. That is why it has
zero uses. What he asked for:

1. North **reads his Outlook calendar** and proposes two or three real
   openings.
2. It **writes the email and leaves it in his Outlook drafts.** He proofs it
   and presses send. Not auto-send — decided, and not "start with drafts and
   graduate later" either. Drafts, full stop.
3. It **watches for the reply and reads it itself.** He should not copy
   anything back into the app. "Tuesday works" should show up in North as
   Tuesday winning.
4. He presses Confirm. It goes on the calendar with the invite.

Point 3 is the one that changes the economics. Pasting replies is why nobody
pastes replies.

Group sends (a campaign to a list) are wanted if they come cheap off the same
plumbing, and are fine to skip if they don't.

**Prerequisite, honestly stated:** all of this needs an app registration in
Microsoft Entra on the `im504.com` tenant. There is no route to reading a work
calendar or a work inbox that avoids it. The good news is that it is probably
his own ten minutes, not an IT ticket — see §9.

---

## 8. How it should perform

- **Phone = logging.** That is the phone's entire job. Two taps: person, type.
  Date is today. Notes optional and usually skipped. It must work one-handed,
  in a car, in under ten seconds, and it must be reachable from anywhere in the
  app — not a screen you navigate to.
- **Desktop = everything else.** Scheduling, emailing, planning, tiering.
- **First screen on the phone:** what needs me *and* who to call today. Both,
  in that order.

---

## 9. The Microsoft question, answered

**What is being asked for.** An "app registration" in Microsoft Entra ID — a
record saying "an application called North exists, and may ask users of this
tenant for permission". It grants nothing by itself. North then asks
Brandon, personally, for four delegated permissions:

| Permission | What it lets North do | What it does NOT do |
|---|---|---|
| `Calendars.ReadWrite` | See when he's busy; create the confirmed meeting | Touch anyone else's calendar |
| `Mail.ReadWrite` | Read replies to its own asks; leave drafts in his Outlook | Send anything |
| `Mail.Send` | Send, if he ever turns that on | Nothing is sent today — the code path exists and is uncalled |
| `offline_access` | Stay connected past one hour | — |

"Delegated" is the important word: North acts **as Brandon, with Brandon's
own access**, and can never see more than he can. It reaches nobody else's
mailbox. He can revoke it from his Microsoft account page at any moment.

**Is there a way around it?** Partly.

- *Putting a confirmed meeting on his calendar* — yes. A downloadable `.ics`
  file does this with no Microsoft integration at all.
- *Emailing the banker* — yes, a `mailto:` link opens his mail client with the
  draft filled in. Clumsier than an Outlook draft, but it works today.
- *Reading his calendar to suggest real openings* — **no.** Nothing can do this
  without calendar access.
- *Reading the reply so he doesn't paste it* — **no.** Nothing can do this
  without mailbox access.

Since 3 and 4 are the two things that make scheduling worth using, the
registration is the price of the feature.

**Who has to do it.** Probably him. By default, a Microsoft 365 tenant lets any
user register an application, and lets any user consent to low-risk delegated
permissions for themselves. If `im504.com` is on those defaults, Brandon can do
the whole thing in about ten minutes with no admin involved. If the tenant has
tightened either setting, Entra will say so plainly and an admin has to approve
once, for him only. `DEPLOYMENT.md` §5 has the click-by-click steps.

---

## 10. Data cleanup, before launch

Named as a go-live condition:

- Sample rows out of the live database.
- 16 loans linked to the bankers who sent them (the referral fix shipped this
  week makes the credit work; the links themselves still need doing).
- Duplicates resolved.
- 12 lenders have no email address and can't be scheduled with at all.
- ~~142 lenders tiered via the spreadsheet~~ — **done**, 18 Sep. 137 tiered,
  5 portfolio-manager and treasury contacts removed (seen in passing, never
  someone to call), 3 bank moves followed the person rather than deleting them.
  Ryan Stevenson is the one still untiered.

---

## 11. Sequence

1. ~~Tier the 142.~~ Done.
2. Clean the data.
3. Microsoft registration → calendar reading + drafts + reply reading.
4. Rename the nav, cut the dead screens and the twenty empty tables.
5. Rebuild the phone logging path to two taps.
6. Custom lists and tags.
