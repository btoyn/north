-- The dedupe index could not actually be used for dedupe.
--
-- 0019 created it as a partial index, `where external_id is not null`, which
-- reads sensibly: only synced rows carry an id, so only they need to be unique.
-- But Postgres will not use a partial index as an ON CONFLICT target unless the
-- statement repeats the same predicate, and the client does not emit one. Every
-- insert from the mailbox sweep failed with "no unique or exclusion constraint
-- matching the ON CONFLICT specification", was caught, and reported as zero
-- logged. A live mailbox read 113 messages, found six from known partners, and
-- wrote none of them.
--
-- Dropping the predicate costs nothing. Postgres treats nulls as distinct in a
-- unique index, so the thousands of hand-logged activities with no external_id
-- still coexist happily.
drop index if exists activities_external_id_unique;

create unique index activities_external_id_unique
  on activities (user_id, external_id);
