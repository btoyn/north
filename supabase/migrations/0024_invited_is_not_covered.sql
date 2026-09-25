-- Being invited is not the same as being covered.
--
-- A group invitation now goes to everyone who was asked once two people have
-- said yes, so that the quiet ones can accept in Outlook rather than write back
-- and wait for him to read it. That is the point of it. But it means a
-- `meeting_attendees` row no longer implies the person agreed to anything, and
-- this view credited every row on a confirmed meeting as a touch.
--
-- Left alone, sending the invite would have marked four people covered for
-- ninety days on the strength of an email they never answered -- the one
-- outcome this whole app exists to prevent.
--
-- So the credit now follows `response_status`. Everything written before today
-- was inserted as 'confirmed', so nothing already in the database changes; only
-- the new 'invited' rows sit outside it, until he logs that they turned up.
drop view lender_coverage;


create view lender_coverage
with (security_invoker = true) as
select
  l.id as lender_id,
  l.user_id,
  greatest(
    (select max(a.occurred_at) from activities a
      where a.lender_id = l.id and a.deleted_at is null and a.counts_for_coverage),
    (select max(m.start_at) from meetings m
       join meeting_attendees ma on ma.meeting_id = m.id
      where ma.lender_id = l.id and m.deleted_at is null
        and m.status = 'confirmed' and ma.response_status = 'confirmed'
        and m.start_at <= now())
  ) as last_visible_touch_at,
  greatest(
    (select max(a.occurred_at) from activities a
      where a.lender_id = l.id and a.deleted_at is null and a.counts_for_coverage
        and a.activity_type <> 'campaign_email'),
    (select max(m.start_at) from meetings m
       join meeting_attendees ma on ma.meeting_id = m.id
      where ma.lender_id = l.id and m.deleted_at is null
        and m.status = 'confirmed' and ma.response_status = 'confirmed'
        and m.start_at <= now())
  ) as last_personal_touch_at,
  greatest(
    (select max(a.occurred_at) from activities a
      where a.lender_id = l.id and a.deleted_at is null and a.counts_for_coverage
        and a.activity_type in (
          'incoming_email','text','call','lunch','breakfast','golf',
          'office_visit','pop_in','general_meeting','deal_conversation','sba_question'
        )),
    (select max(m.start_at) from meetings m
       join meeting_attendees ma on ma.meeting_id = m.id
      where ma.lender_id = l.id and m.deleted_at is null
        and m.status = 'confirmed' and ma.response_status = 'confirmed'
        and m.start_at <= now())
  ) as last_conversation_at,
  (select max(a.occurred_at) from activities a
    where a.lender_id = l.id and a.deleted_at is null and a.counts_for_coverage
      and a.activity_type = 'loan_update') as last_deal_update_at,
  exists (
    select 1 from meetings m
      join meeting_attendees ma on ma.meeting_id = m.id
     where ma.lender_id = l.id and m.deleted_at is null
       and m.status = 'confirmed' and ma.response_status = 'confirmed'
       and m.start_at > now()
  ) as has_confirmed_future_meeting
from lenders l
where l.deleted_at is null;
