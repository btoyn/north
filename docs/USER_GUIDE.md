# North — Working Guide

One system for your ~140 commercial lenders across Salt Lake City and St. George. It answers one
question — *who is slipping?* — in five minutes a day. Your real list is loaded; this is not a demo.
Live at `north-chi-three.vercel.app`.

This file is the single source for the guide: it renders inside the app at **Guide** in the sidebar,
and reads as plain markdown on GitHub. Editing it updates both.

## How coverage works

The app keeps a running clock on every partner, counting from the last time you actually spoke —
never a calendar reset. Past the line, they surface. Inside it, they stay out of your way. You never
decide who to call; the app ranks them worst-first and tells you why.

| State | Days since personal contact | |
|---|---|---|
| On track | 0–30 | Nothing to do |
| Grace period | 31–40 | Just past the line |
| Overdue | 41–60 | A real gap |
| Seriously overdue | 61+ | Leads the weekly list |
| Never contacted | — | Same urgency as overdue |

- Goal window and grace are adjustable in Settings — 30 and 10 are defaults.
- **A confirmed future meeting covers a partner the moment you book it.** Cancel it and the clock
  silently resumes from your last real conversation.

### Two clocks per partner

**Overall** counts anything that reached them, mass email included. **Personal** counts one-to-one
only. Send a newsletter to 80 partners and their overall clock resets while personal keeps counting —
the app calls that **Campaign only** and treats it as the gap it is. Every headline number runs on
the *personal* clock.

- **Counts as personal:** calls, texts, emails you wrote, inbound emails, lunch, breakfast, golf,
  office visits, pop-ins, SBA questions, deal conversations, loan updates.
- **Doesn't:** campaign email (overall only), drop-offs where nobody talked to you, notes to
  yourself.

## Every morning — 5 minutes

The dashboard is ordered by urgency. Read down.

1. **The blue banner** — one sentence of what's outstanding, plus your personal coverage ring. If it
   says you're caught up, you are.
2. **Today's attention** — three kinds of item, urgent first, one button each: *promises* past their
   date → **Mark done**; *loan updates due* → **Log update** records it and pushes the next out a
   week; *meeting notes* → **Capture notes** opens a box inline. Write notes while they're fresh —
   everything downstream comes from that box.
3. **The right rail** — confirmed meetings, whether each brief is prepared, your next trip, and
   anything **waiting on a reply** so tentative invitations don't quietly die.

### The three cards — each links to the list behind it

| Card | What it tells you |
|---|---|
| Personal coverage | Share of active partners with a real one-to-one touch inside the window, plus the change since last week. The number to care about. |
| Weekly loan communication | Reads as `3/5`. Every active loan gets a weekly touch *even when nothing changed* — silence is what makes referral partners nervous. |
| Meetings | Confirmed meetings ahead, when the next is, how many await notes. |

Approval volume and dollars deliberately aren't here. This app tracks **partners**, not loans — your
production numbers live in the system you already use for them.

Below those: an **eight-week coverage line**, rebuilt from your activity on every page load (so
backdating a logged call redraws history honestly), and a **status bar** where every band and legend
row links to that exact list.

## Every Monday — 20 minutes

Press **Start weekly outreach** once a week. The app ranks everyone by who's slipping furthest,
builds ten with ten more on deck, and shows the first five. Each row carries their bank, territory,
days since you spoke, **why now**, and a **suggested action** matched to how they prefer to be
contacted.

You don't tick anything off — **logging a touch closes the row automatically** and fills the progress
bar. **View all** reveals the rest. Ten is the plan; five is what fits in a sitting.

## Asking someone to lunch

Press **Invite to lunch** on a weekly-list row, or **Propose a meeting** on anyone's profile.

It picks open dates from the hours you set in Settings, skipping anything already booked and any
date you've already dangled in front of somebody else. It writes the note — "are you free Thursday
the 13th or Tuesday the 18th around 11:30?" — and you edit whatever you like before sending. The
send opens your normal mail app, so the thread lives in Outlook where it belongs.

**It cannot see your Outlook calendar yet.** Until IT approves that, the dates come from your
availability rules alone, so glance at them before you send. Everything else about the screen stays
the same once that's connected.

When they write back, press **They replied** on your dashboard and paste the whole email in — the
quoted part underneath is ignored. It reads the answer:

- **A clear yes to one of your dates** → offers to schedule it
- **A different date** → checks it against your hours and asks "schedule it?"
- **Anything vague** → says so plainly and leaves it with you

It never books a meeting off its own reading. You always press the button.

**The paste is temporary and it's the wrong shape.** What this should do is read the reply on its
own and only interrupt you when it genuinely needs a decision. See *What it takes to stop pasting*
at the end of this guide — that's the target, not this.

If nobody answers within four days (adjustable), the proposal turns up on your dashboard marked
**No reply** so it doesn't quietly die.

| Button | What it does |
|---|---|
| Draft email | Opens Outlook addressed to them. You send it as yourself so replies land in your normal thread history; the app then asks whether it went out and logs it. It deliberately never sends partner mail on your behalf — system-address mail reads as bulk and hurts deliverability. |
| Text | Opens Messages with their number, then offers to log it. |
| Invite to lunch | Opens the scheduling screen described above. |
| Schedule | Same screen, for any kind of meeting. Durations default: lunch and breakfast 60 min, golf 150, office visits 15. |
| Replace | Drops them from this week and promotes the next partner on deck into the slot. Nothing is deleted — you're saying "not now." |

## Keeping referral partners informed

**Loan updates** in the sidebar. Add a loan — borrower name and who sent it over, nothing else.
No amounts, no stages: that lives in the system that already tracks production, and a second
half-kept copy would only ever be the wrong one.

From then on it asks for a touch every 7 days, whether or not anything changed. Silence is what
makes a referral partner nervous — they handed you a deal and then heard nothing.

| Colour | Meaning |
|---|---|
| Teal | Up to date |
| Gold | Due now, or up to a week past |
| Red | More than a week late |

**Draft update** writes the email. There are no stages to pick — you already know where the loan is,
so the app doesn't ask.

The first week it sets up a skeleton: greeting, "just wanted to give you my weekly update on the
Harris loan," your signature, and a gap in the middle for the news. Write the middle.

**Every week after, the box opens with exactly what you sent last week.** Change what changed. If
nothing changed, the email still says where the loan actually stands, which beats "no update."

Tick **Send to the borrower too** to put them on the same email. Type their address once and it's
saved with the loan — but they're off by default, so you decide each week.

**Open in Outlook** hands the draft to Outlook with the subject, recipients and body filled in. You
press send there. **That click marks the week done and restarts the clock** — the app can't see
whether you actually sent it, so if you get pulled away, that week still reads as done. If the email
is long enough that Outlook might truncate it, the button steps aside and tells you to use **Copy**.

Each update lands on the partner's timeline and **counts as a personal touch**, so keeping a partner
informed and keeping the relationship warm are the same act.

Two ways a loan ends:

| Button | What happens |
|---|---|
| **Sent to closing** | Drafts the handoff email — SBA approved, closing team reaching out, 45–90 days, or on certificate of occupancy if you tick *construction involved*. Sending it stops the weekly asking. |
| **✕** | Didn't happen. Stops the clock, sends nothing. You make the phone call. |

Nothing disappears either way — it moves to *No longer tracking*, labelled with which ending it was,
and the count of how many reached closing sits in that heading. You can put any of them back.

Set your signature in **Settings → Email signature**. It only seeds the first draft on each loan;
after that your own edits carry forward.

## When a partner mentions a deal

**Pipeline** in the sidebar. Any time a partner brings up a possible deal — a real referral, a
question about whether something would qualify, a vague *"I might have one for you"* — log it. Pick
who brought it up, type what they asked, done. **A borrower name is optional**, because most of the
time there isn't one yet.

It lands in **New look** and comes back for a follow-up after 3 days (change that in Settings). Miss
it and it goes gold, then red after a week, the same colours the loan clock uses.

The board has three columns and a card moves across them as the deal does. Drag it, or use the
arrows on the card — the arrows are the ones that work on a phone.

| Column | What it means |
|---|---|
| **New look** | They raised it, you haven't been back to them |
| **Followed up** | You circled back. Add what you told them; it counts as a touch |
| **Became a loan** | Real business. Add it on *Loan updates* to start the weekly cadence |

**✕** on a card closes it as went nowhere — optional reason, clock stops, record stays. Those sit in
a list under the board rather than a fourth column, because over time there are more of them than
everything else put together.

Logging a look **counts as a personal touch** — a partner who just brought you a deal shouldn't show
up as needing attention the next morning.

Two things fall out of this for free. **Who's reaching out** ranks your partners by how many looks
they've brought you, and each profile shows a **Looks given** count. That's the closest thing here to
an honest answer about which relationships produce and which are all lunch and no loans — the
original plan called it the one number worth measuring.

## As it happens — the four habits

**Log the touch.** Profile → *Log activity*: what happened, when, one line of summary. Tick *they
reached out to me* if they started it — inbound contact is a real health signal. Logging resets the
clock, feeds coverage, closes weekly rows, and builds the timeline you'll read before your next
meeting. An unlogged call may as well not have happened.

**Record promises.** Two directions, kept apart: **I promised** and **they promised**. Added from the
profile, surfaced in Today's attention when overdue, and all open ones live on **Follow-ups** to
complete, reschedule, or dismiss. The sidebar badge counts open promises and tasks together.

**Note the person.** Golf, kids' soccer, BYU tickets, the fact they only answer texts — categorized
on the profile and never expiring, because a coverage clock resets constantly but their daughter
plays club soccer for years. Also set their preferred contact method; the weekly list's suggested
action follows it. This is the material AI drafting draws on once it's switched on.

**Handle bank changes.** Profile → *Changed banks?* The partner keeps their entire history —
conversations, promises, personal notes — and only the current institution changes. The old bank
stays in their history, and the app flags it, since that branch may now need a replacement contact.

## Finding people — Tiers

**Tiers** is your whole referral book sorted by who actually sends you deals, with its other useful
slices given names. It replaced three separate screens (Partners, Institutions, Needs Attention)
that were all doors into the same table.

### The four tiers

Every partner has a tier, and the tier decides how often they're worth contacting:

| Tier | Who | How often |
|---|---|---|
| **A** | Has sent me deals | Monthly |
| **B** | Real potential | Monthly |
| **C** | Good relationship, no deals | Quarterly |
| **D** | Stay on the radar | Twice a year |
| **No tier** | Not sorted yet | Falls back to your Settings goal |

A and B share a cadence but not a bar. For those two a touch has to have been two-way — a call, a
lunch, a reply, or the weekly update on their own borrower. An email you sent into silence does not
restart their clock. For C and D any contact counts.

The top row is one card per tier with its count and a coverage bar, and the bar is measured against
that tier's own window — so 70% on A is a harder number than 70% on C. Everything else in the app
that says "overdue" means overdue *for their tier*.

Set a tier from the **A / B / C / D / None** buttons at the top of a partner's panel. Anyone still
untiered is measured against the workspace goal rather than quietly filed as quarterly, and the page
tells you how many are waiting.

### Saved views

Under the tiers, the filters that used to be a row of chips above the partner list:

| View | Who's in it |
|---|---|
| Needs contact | Past the window for their tier, worst first |
| No personal touch | Never had a one-to-one interaction |
| Campaign-only | Reached by mass email, never personally |
| Overdue promises | Something outstanding between you |
| Active-loan contacts | Referred a loan currently in process |
| Recently contacted | Spoken to in the last week |
| On track | Inside the window, nothing booked |
| Upcoming meetings | Has a confirmed meeting booked |
| Wasatch Front / Southern Utah | Salt Lake and St. George, for trips |
| By institution | Everyone, grouped by territory and bank |
| Everyone | The whole book, one flat list |

A view with nobody in it stays out of the list, so what you see is what there is to do.

**By institution** (and each territory) opens grouped by territory, then by bank — collapsed, so you
see about twenty headers instead of a hundred and forty names. Each header carries the count, when
anyone there was last touched, and how many are slipping, so a healthy bank can be skipped without
opening it. Banks with people in both territories appear under each one separately, because you
visit them on different trips.

Every sphere has typo-tolerant search across names and banks (*Whitfeild* finds Whitfield). Search
always shows a flat list — results are ranked by how well each name matched, and grouping would
throw that order away.

### The partner panel

Clicking anyone in a sphere slides their profile over the list instead of navigating away, so you
keep your place and how far down you had scrolled. Everything from the full profile is in there —
timeline, promises, looks, personal details, the lot — plus the tier buttons. **Full page** opens it
as its own page when you want to link to someone or work in the wide layout.

A bank's own page still exists at its own address: open a partner and follow their institution, which
is also where **Propose a group meeting** lives.

## Settings & import

- **Contact goal and grace** — the 30 and 10. If a month is too aggressive across 120 people, raise
  the goal rather than living with a permanently red dashboard.
- **Weekly list sizes** — Top and On Deck counts, ten and ten by default.
- **Your name and home base**, and **daily digest** on/off plus time.
- Settings also holds **Import**, **CSV export**, and on/off status for Microsoft 365, AI drafting,
  and digest email.

**Importing your real list** runs in four steps and saves nothing until the last: upload the file →
correct the column matching it guessed → review the count, likely duplicates, and suggested tags
pulled from your notes column (mention golf or BYU and it offers to file those as personal details;
your original note text is always kept) → import and get a report. If sample data is still present it
offers to clear it first, so demo and real partners never mix.

## Safety net

- **Nothing deletes immediately.** Deleting moves a record to **Trash**, restorable for 90 days.
  Delete the wrong partner and their whole history returns.
- **Your data is exportable** — one-click CSV for partners, institutions, activities, tasks, promises,
  referrals, and active loans.
- **Private by default.** The database enforces per-person access at its own level, not just in the
  app. An audit log records what changed and whether it was you, the assistant, or automation.
- **On your phone:** open the site and use *Add to Home Screen*. It installs like an app, which makes
  the "log that call from the car" habit realistic.

## How do I…

| Task | Where |
|---|---|
| Log a call I just had | Profile → Log activity → Call |
| Add a partner | Add, or Tiers → Add partner. Checks duplicates as you type. |
| Record something I owe | Profile → Add promise → I promised → due date |
| Log a deal a partner mentioned | Pipeline → Log a look. Borrower name optional. |
| See who actually sends me deals | Pipeline → Who's reaching out |
| See who's slipping | Tiers → Needs contact, or the Overdue band on the status bar |
| Plan a St. George trip | Tiers → Southern Utah |
| Ask someone to lunch | Schedule on their row, or Propose a meeting on their profile |
| Set when you can meet | Settings → When you can meet |
| Add another loan officer | Settings → Invite a loan officer |
| Send this week's loan update | Loans → Draft update → Open in Outlook |
| Set my email signature | Settings → Email signature |
| Write up a meeting | Dashboard → Capture notes |
| Note that someone moved banks | Profile → Changed banks? |
| Rebuild this week's list | Start weekly outreach in the banner |
| Undo a deletion | Trash → Restore (90 days) |
| Get my data out | Settings → Export your data |
| Change the 30-day goal | Settings → Contact goal and grace |
| Change the look follow-up delay | Settings → Follow up on a look after |

## What's live

So you don't hunt for a screen that isn't built.

| Area | State | Notes |
|---|---|---|
| Dashboard, coverage, weekly list | Working | Everything above |
| Tiers, profiles | Working | Saved views, search, timelines, bank changes |
| Promises, tasks, follow-ups | Working | Both directions, filters |
| Meetings | Working | Notes, brief status |
| Proposing a meeting | Working | Suggests dates, writes the ask, tracks the reply |
| Loan update tracking | Working | Weekly email drafts, borrower option, two endings |
| Pipeline of looks | Working | Board, follow-up clock, who's reaching out |
| Import, export, trash, audit | Working | Full wizard, 90-day restore |
| AI drafting in your voice | Needs key | Anthropic, a few dollars a month. Today it powers *Ask assistant* and nothing else. |
| Daily digest by email | Needs key | Resend. The summary shows in the app either way. |
| Real Outlook drafts & calendar | Needs IT | Entra app registration and admin consent. Today loan updates hand off via a mailto link, which can't confirm a send. |
| Your writing voice | Not built | Storage ready; needs the screen to paste samples |
| Campaigns | Not built | Storage ready; no screen, no sending |
| Trip planning | Not built | Shows in the rail if a trip exists; can't create one |
| Meeting briefs | Not built | Status shown; nothing generates them |
| Expenses, reports, drop-offs | Not built | Storage ready; no screens |

None of the "not built" items are hard — mostly screens over tables that already exist. The two worth
doing first are the voice screen and the monthly SBA update, since one improves every draft and the
other is the only touch that gives a banker something instead of asking for their time.

## What it takes to stop pasting

**The goal, stated plainly:** a partner replies, the app reads it, and it only comes to you if it
actually needs your call. No pasting, no checking. Scheduling comes off your plate.

That is the point of the whole project. Everything below is what stands between here and there.

### 1. Somewhere the app can read the replies — removes the paste

Nothing in software can read a partner's reply without access to where that reply landed. Two ways,
easier ask first:

| Route | The ask | Trade-off |
|---|---|---|
| **Shared mailbox** (preferred) | IT creates something like `crm@im504.com`. You add an Outlook rule copying meeting replies there. The app reads only that mailbox. | You're asking for one purpose-built mailbox, not your inbox. Much smaller conversation. Replies still land in your Outlook as normal — the rule copies, it doesn't move. |
| **Direct access** | `Mail.Read` on your own account, delegated. | Fewer moving parts, no rule to maintain. But it's the permission that makes an IT department pause, because the sentence is "this app reads my email." |

Either one deletes the paste step entirely. Nothing about the screens changes.

### 2. An Anthropic API key — removes most of the interruptions

Today the reading is ordinary code, so anything it isn't certain about comes to you. That's correct
behavior but it's a low bar: *"I'm slammed that week but the following Tuesday could work if it's
early"* is a perfectly clear answer to a human and this bounces it back.

With the key, replies like that get handled instead of interrupting you. This is independent of the
mailbox question and improves both the current version and the automatic one.

**This is a smaller ask than it used to be.** IMBL already pays Anthropic — roughly $350 a month
across five Claude seats — so this is a key on an account we already hold, not a new vendor. Billed
per use, a few dollars a month at your volume.

### Both are needed

The key removes the *interruptions*. The mailbox removes the *paste*. Neither alone gets to hands-off
scheduling — plan for both.

### Meanwhile: Claude in Outlook is already approved

IT has deployed the Claude add-in for Outlook, which is a different thing from the items above — it
sits in the Outlook sidebar, for you, and North cannot talk to it. But it is useful today. Open a
partner's reply and ask it what they are proposing; ask it to draft the lunch email in your voice. You
still move the text across by hand, so it does not remove the paste — it just means the drafting and
reading you want are available now rather than after the approvals land.

It also means the Anthropic relationship is already in place, which is why the key above is a small
ask.

### 3. Calendar access — removes the double-checking

Separate from replies: `Calendars.ReadWrite` lets it see your real free/busy instead of working from
the rules in Settings, so you stop having to sanity-check proposed dates against Outlook. It also
lets it send the actual meeting invitation once a date is agreed.

## Loose ends

1. **Fix the Site URL in Supabase** (Authentication → URL Configuration). It is a different field
   from the redirect list, and as of 21 Sep it still read `https://fable-tracker.vercel.app` — the
   old project, from before the rename. It is the address Supabase builds confirmation and
   password-reset links from, so until it points at `https://north-chi-three.vercel.app` those
   emails lead somewhere else, which is what broke the login link sent to a coworker.

   Add the redirect addresses on the same screen while you are there, with the `https://` prefix:
   the production host, the team alias `north-imbl.vercel.app`, and the wildcard
   `https://north-*-imbl.vercel.app/**`. That last one matters because every preview deployment
   gets its own address, and signing in on one fails without it.

2. **Check your availability** in Settings → *When you can meet*. It starts on sensible windows —
   lunches and breakfasts midweek, office visits across the working day, golf on a Friday — and
   those are live, so proposals work without you touching anything. Change what's wrong and save.
3. **Add your email signature** in Settings → *Email signature*. It is blank, so the first
   loan-update draft on each loan has no sign-off. After the first one your own text carries forward,
   so this is a one-time thing.
4. **Twelve partners have no email address.** They cannot receive a meeting proposal or a loan update
   — the draft screen says so rather than sending something broken. Worth filling in as you come
   across them.

Done: the Vercel login wall is off, so the site opens normally on any device and can be installed
to your home screen.

---

One habit carries the system: log the touch while you still remember it. If a week goes by where you
only do one thing, make it pressing **Start weekly outreach** and working the five names.
