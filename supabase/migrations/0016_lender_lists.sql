-- Lists a person makes up themselves: "guys I golf with", "construction
-- lenders", "invite to the Masters party".
--
-- Bank, territory and tier are facts about a lender and are already grouped
-- on. These are the groupings that exist only in his head, and they are the
-- ones he asked for by name.
--
-- One model serves both halves of what he asked for. Reached from a list, it
-- behaves like a list: open it, see who is on it. Reached from a lender, it
-- behaves like a tag: tick the lists this person belongs to. Same rows.
create table lender_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique per person and case-insensitively, so "Golf" and "golf" cannot both
-- exist and quietly split a group in two.
create unique index lender_lists_user_name_idx on lender_lists (user_id, lower(name));
create index lender_lists_user_idx on lender_lists (user_id);

create table lender_list_members (
  list_id uuid not null references lender_lists (id) on delete cascade,
  lender_id uuid not null references lenders (id) on delete cascade,
  -- Denormalised so a row can be checked against its owner without joining
  -- the list, which is what keeps the policies below single-table.
  user_id uuid not null references users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (list_id, lender_id)
);

create index lender_list_members_lender_idx on lender_list_members (lender_id);
create index lender_list_members_user_idx on lender_list_members (user_id);

alter table lender_lists enable row level security;
alter table lender_list_members enable row level security;

create policy "lender_lists owner select" on lender_lists
  for select using (auth.uid() = user_id);
create policy "lender_lists owner insert" on lender_lists
  for insert with check (auth.uid() = user_id);
create policy "lender_lists owner update" on lender_lists
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lender_lists owner delete" on lender_lists
  for delete using (auth.uid() = user_id);

create policy "lender_list_members owner select" on lender_list_members
  for select using (auth.uid() = user_id);
create policy "lender_list_members owner insert" on lender_list_members
  for insert with check (auth.uid() = user_id);
create policy "lender_list_members owner update" on lender_list_members
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lender_list_members owner delete" on lender_list_members
  for delete using (auth.uid() = user_id);
