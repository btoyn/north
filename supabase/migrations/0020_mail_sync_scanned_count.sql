-- "It logged nothing" was not a diagnosable sentence.
--
-- The first real run against a live mailbox came back clean and wrote zero
-- rows, and the stored state could not tell the two explanations apart: a
-- sweep that saw no messages, and a sweep that saw hundreds and matched none.
-- Those need completely different fixes. The count of what was looked at
-- splits them in one number.
alter table mail_sync_state
  add column last_scanned_count int not null default 0,
  add column last_detail text;
