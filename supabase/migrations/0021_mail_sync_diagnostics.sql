-- Why a sweep matched nothing, in aggregate.
--
-- A scan that reads 115 messages and logs none could be a broken sender
-- lookup, an address book that disagrees with reality, or a quiet quarter.
-- This holds the counts that tell them apart, plus sender domains and how
-- often each appeared. Domains only, never addresses or subjects: enough to
-- see that the banks are in there, not enough to be a copy of an inbox.
alter table mail_sync_state add column last_diagnostics jsonb;
