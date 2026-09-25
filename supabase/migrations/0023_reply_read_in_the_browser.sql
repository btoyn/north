-- Move the reading of a reply out of the sweep and into the browser.
--
-- The sweep ran `readReply` server-side with `now: new Date()`, which on Vercel
-- is UTC and not his clock. Every other piece of scheduling deliberately does
-- its wall-clock work in the browser and sends only absolute instants back, and
-- this one call broke that rule: a reply saying "Thursday works" resolved
-- against a UTC today, so an evening reply could land on the wrong Thursday.
--
-- The sweep now stores only what it fetched -- that they answered, and the text
-- of the answer -- and the screens read it. Which means the stored verdict has
-- two different empty states that used to look identical:
--
--   reply_text set, reply_read_at null  -- fetched, nobody has read it yet
--   reply_text set, reply_read_at set   -- read, and the reader abstained
--
-- Without this column the browser cannot tell "not looked at" from "looked at
-- and genuinely unclear", so it would re-read and re-write a verdict Brandon
-- had already settled by hand on every single page load.
alter table meeting_proposal_attendees
  add column reply_read_at timestamptz;

comment on column meeting_proposal_attendees.reply_read_at is
  'When the reply text was interpreted, in the browser, against his local clock. Null with reply_text present means it is still waiting to be read.';

-- Everything already on the table was read by the old server-side pass or
-- recorded by hand. Backfilling the ones that carry a verdict keeps them from
-- being re-read; the ones sitting unclear are exactly the rows that should get
-- a second look from the fixed reader.
update meeting_proposal_attendees
   set reply_read_at = coalesce(updated_at, replied_at)
 where reply_intent is not null;
