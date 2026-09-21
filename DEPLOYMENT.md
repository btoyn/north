# Deployment checklist

You chose to provision infrastructure later. This is the reminder. 🙂
Work top to bottom; the app is unusable until step 2 is done.

## 1. Supabase project (~10 min)

Your org already has two active projects (IMBL Portal, Golf App). On the free
tier only two can be active, so this third project may need the $10/mo Pro
plan — still well inside the spec's $50/mo budget.

1. Create a project at [database.new](https://database.new) (name: `lender-crm`,
   region: `us-west-2` to match your others).
2. Apply migrations **in order** via the SQL editor (or `supabase db push`):
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_rls.sql`
   - `supabase/migrations/0003_functions.sql`
   - `supabase/migrations/0004_sample_data.sql`
3. Auth settings → URL configuration: set the site URL to your Vercel domain
   and add `https://<domain>/auth/callback` to redirect URLs.
4. (Recommended) Enable daily backups (Pro plan includes them).
5. (Later) Schedule the purge: `select purge_soft_deleted();` daily via
   pg_cron or a Supabase scheduled edge function.

## 2. Vercel project (~5 min)

1. Import this GitHub repo into the IMBL Vercel team as a new project.
2. Set environment variables:

   | Variable | Value | Required |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | ✅ |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API (anon/publishable) | ✅ |
   | `ANTHROPIC_API_KEY` | console.anthropic.com | optional — turns on AI drafting |
   | `AI_MODEL` | defaults to `claude-sonnet-5` | optional |
   | `RESEND_API_KEY` | resend.com (free tier: 3,000/mo) | optional — email digest |
   | `EMAIL_FROM` | e.g. `Lender CRM <crm@yourdomain>` (verified in Resend) | with Resend |

3. Deploy. Visit the URL — you should see the login screen, not the setup
   notice.

## 2b. Dashboard hero image — done

The hero photograph lives at `public/images/mountain-sunrise-header.png`
(2172×724). It is served through `next/image`, so the 1.7 MB source is
re-encoded and resized per device — about 37 KB of WebP on a desktop and 9 KB on
a phone. To swap the picture later, replace that file; no code changes needed.

## 3. First run

1. Create your account (this is the separate CRM login, not Microsoft).
2. The dashboard seeds itself with **sample data** so every screen is alive.
3. Go to **Import**, upload your real lender Excel file, confirm sample-data
   removal, review the mapping, and import.

## 4. Later phases (don't need decisions now)

- **Resend domain verification** for nicer from-addresses.
- **Daily digest cron**: a Vercel cron hitting an API route at 8:00 AM
  America/Denver (14:00 UTC in daylight time, Mon–Fri) — route to be added with the
  digest feature.


## 5. Connecting Microsoft 365

Everything here is one-time setup. Until it is done, North behaves exactly as
it did before: dates come from your availability windows and the meetings it
already knows about, and the ask opens in your mail client through a `mailto:`
link. Nothing breaks while this is undone.

Budget twenty minutes. You will end up with four values to paste into Vercel.

### What you are actually asking Microsoft for

An **app registration** is a record in your organisation's directory saying
"an application called North exists, and may ask people here for
permission". On its own it grants nothing.

North then asks **you, personally**, for these. They are *delegated*
permissions, which means North acts as you, with your own access, and can
never reach anything you could not reach yourself:

| Permission | What it buys | What it does not do |
|---|---|---|
| `offline_access` | Stays connected past the first hour | — |
| `User.Read` | Shows which account is connected | Read anyone else's profile |
| `Calendars.ReadWrite` | Real free/busy; the invite when you press Confirm | Touch another person's calendar |
| `Mail.ReadWrite` | Reads replies to its own asks; leaves drafts in Outlook | Send anything |
| `Mail.Send` | Sending directly, if you ever switch it on | Nothing calls this today |

You can revoke the whole thing at any time from
<https://myapps.microsoft.com> → the North tile → *Manage* → *Revoke*.

### Do you need IT?

Quite possibly, and it is worth checking before you start rather than finding
out at step 5.

Registering the app is the easy half: tenants let any user do that by default.
Consent is the half that bites. The usual modern default is "allow user
consent for apps from verified publishers, for selected permissions", and
"selected permissions" means Microsoft's low-impact set — `User.Read`,
`offline_access`, `openid`, `profile`, `email`. **`Calendars.ReadWrite`,
`Mail.ReadWrite` and `Mail.Send` are not in that set.** They are precisely the
class carved out of self-consent, and North will not be a verified
publisher.

Check which policy `im504.com` is on: **Identity → Enterprise applications →
Consent and permissions → User consent settings**. "Allow user consent for all
applications" means you can finish alone. Either of the other two means an
administrator has to approve it.

If they do, forward them this section. The approval is one click, applies to
this account only, and everything in steps 1–4 still stands.

### Step 1 — Register the app

Go to <https://entra.microsoft.com> and sign in with your work account.

1. Left sidebar → **Identity** → **Applications** → **App registrations**.
   *(If your tenant sends you to the old Azure portal instead, it is
   <https://portal.azure.com> → search "App registrations". Same screens.)*
2. **+ New registration**.
3. Fill in:
   - **Name**: `North` — this is the name you will see on the consent
     screen, so make it one you will recognise.
   - **Supported account types**: *Accounts in this organizational directory
     only (im504 only - Single tenant)*.
   - **Redirect URI**: change the dropdown from the default to **Web**, and
     paste:

     ```
     https://north-chi-three.vercel.app/api/microsoft/callback
     ```

     This must match character for character, including `https://` and with no
     trailing slash. A mismatch is the single most common failure, and
     Microsoft's error message names the URI it expected — if you see that,
     copy what it expected.

     The odd-looking host is Vercel's, not a typo: `north.vercel.app` was
     already taken, so the project was given `north-chi-three`. If a custom
     domain is ever added, add its callback address here as a second redirect
     URI rather than replacing this one — Entra accepts several, and keeping
     both means the old address does not break the moment DNS moves.
4. **Register**.

You land on the Overview page. Copy two values from it now:

- **Application (client) ID** → this becomes `MICROSOFT_CLIENT_ID`
- **Directory (tenant) ID** → this becomes `MICROSOFT_TENANT_ID`

### Step 2 — Create a client secret

1. Left menu → **Certificates & secrets** → **Client secrets** tab →
   **+ New client secret**.
2. Description: `North on Vercel`. Expiry: 24 months is the usual maximum.
3. **Add**.
4. **Copy the `Value` column immediately.** Not `Secret ID` — the one next to
   it. It is shown once and never again; if you navigate away you delete it
   and make another. This becomes `MICROSOFT_CLIENT_SECRET`.

Put a reminder in your calendar for a month before it expires. When a secret
expires the connection stops with a "reconnect" message, and the fix is a new
secret rather than anything you did wrong.

### Step 3 — Add the permissions

1. Left menu → **API permissions**.
2. **+ Add a permission** → **Microsoft Graph** → **Delegated permissions**.
3. Search for and tick each of these, then **Add permissions**:
   - `offline_access`
   - `User.Read` *(usually already there from step 1)*
   - `Calendars.ReadWrite`
   - `Mail.ReadWrite`
   - `Mail.Send`
4. If you see a **Grant admin consent for im504** button and you are an
   administrator, press it. It is not required — you can consent for yourself
   at the end — but it removes the prompt.

### Step 4 — Put the four values into Vercel

<https://vercel.com/imbl/north> → **Settings** → **Environment
Variables**. Add each for **Production** (and Preview, if you want the preview
deployments to work too — they need their own redirect URI added in step 1).

| Variable | Value |
|---|---|
| `MICROSOFT_CLIENT_ID` | Application (client) ID from step 1 |
| `MICROSOFT_CLIENT_SECRET` | The secret **Value** from step 2 |
| `MICROSOFT_TENANT_ID` | Directory (tenant) ID from step 1 |
| `MICROSOFT_TOKEN_ENCRYPTION_KEY` | A long random string — `openssl rand -base64 48` |

`MICROSOFT_TOKEN_ENCRYPTION_KEY` encrypts the refresh tokens before they are
written to the database. It is not optional: without it, North refuses to
start the connection rather than store standing mailbox access in the clear.
**Changing it later makes every existing connection unreadable** — the fix is
to reconnect, but do not rotate it casually.

Then **Deployments** → the newest one → **Redeploy**. Environment variables are
read at build time, so the values do nothing until you do this.

### Step 5 — Connect

In North: **Settings** → **Microsoft 365** → **Connect**.

Microsoft asks which account, then shows the consent screen listing exactly
the permissions from step 3. Approve, and you land back on Settings.

The card then lists what was actually granted, one line per capability. A
partial grant is normal and each line says what still works without it.

### When it does not work

| What you see | What it means |
|---|---|
| No Connect button, "Missing: …" | The environment variables are not live. Redeploy after adding them. |
| `AADSTS50011` redirect mismatch | The URI in step 1 does not match. The error names what it expected. |
| "An administrator has to approve" | Your tenant has user consent switched off. Send them this section. |
| `AADSTS7000215` invalid client secret | You copied `Secret ID` instead of `Value`, or the secret expired. |
| Connected, but "Calendar reading wasn't granted" | Consent was partial. Reconnect and approve everything. |
| Worked for weeks, now says reconnect | Usually an expired client secret (step 2) or a password change. |

Disconnecting from the Settings card makes North forget the tokens. It does
not revoke the app at Microsoft — do that at <https://myapps.microsoft.com>.
