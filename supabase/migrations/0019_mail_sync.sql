-- Where the mailbox scan keeps its place.
--
-- One row per user. `last_synced_at` is the high-water mark the next sweep
-- starts from; it moves only on a clean run, so a Graph outage halfway through
-- means the next attempt covers the same ground again rather than skipping it.
-- Re-covering ground is free because every logged mail carries its Graph
-- message id.
create table mail_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Null means never synced, which is what triggers the first backfill.
  last_synced_at timestamptz,
  last_run_at timestamptz,
  -- 'ok', or the Graph failure that stopped it, kept so Settings can say why.
  last_result text,
  last_logged_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table mail_sync_state enable row level security;

create policy "mail_sync_state_select_own" on mail_sync_state
  for select using ((select auth.uid()) = user_id);
create policy "mail_sync_state_insert_own" on mail_sync_state
  for insert with check ((select auth.uid()) = user_id);
create policy "mail_sync_state_update_own" on mail_sync_state
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "mail_sync_state_delete_own" on mail_sync_state
  for delete using ((select auth.uid()) = user_id);

create trigger mail_sync_state_updated_at
  before update on mail_sync_state
  for each row execute function set_updated_at();

-- Dedupe, enforced by the database rather than by the scan remembering to
-- check. A message that reaches two lenders gets two rows, so the id carries
-- the lender as well and the pair is what has to be unique.
create unique index activities_external_id_unique
  on activities (user_id, external_id)
  where external_id is not null;
