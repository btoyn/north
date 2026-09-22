-- A fourth clock: the last time a loan update went out.
--
-- A weekly update about someone's own borrower is not a blast. They read it,
-- it is about their file, and being in their inbox every Friday is contact by
-- any honest reading. So it now restarts the clock for A and B as well, not
-- only for C and D.
--
-- It is kept separate from `last_conversation_at` rather than folded into it
-- because the two answer different questions. A lender whose only contact all
-- quarter has been the Friday loan email is covered, but he is also someone
-- you have not actually spoken to, and the screens need to be able to say so.
-- Folding it in would lose that distinction forever.
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
        and m.status = 'confirmed' and m.start_at <= now())
  ) as last_visible_touch_at,
  greatest(
    (select max(a.occurred_at) from activities a
      where a.lender_id = l.id and a.deleted_at is null and a.counts_for_coverage
        and a.activity_type <> 'campaign_email'),
    (select max(m.start_at) from meetings m
       join meeting_attendees ma on ma.meeting_id = m.id
      where ma.lender_id = l.id and m.deleted_at is null
        and m.status = 'confirmed' and m.start_at <= now())
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
        and m.status = 'confirmed' and m.start_at <= now())
  ) as last_conversation_at,
  (select max(a.occurred_at) from activities a
    where a.lender_id = l.id and a.deleted_at is null and a.counts_for_coverage
      and a.activity_type = 'loan_update') as last_deal_update_at,
  exists (
    select 1 from meetings m
      join meeting_attendees ma on ma.meeting_id = m.id
     where ma.lender_id = l.id and m.deleted_at is null
       and m.status = 'confirmed' and m.start_at > now()
  ) as has_confirmed_future_meeting
from lenders l
where l.deleted_at is null;
