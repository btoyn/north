-- Close the one door that could erase other people's work.
--
-- `purge_soft_deleted` is SECURITY DEFINER, so it runs past row-level security
-- by design: it has to, because it sweeps every user's trash. But it was also
-- granted to `anon` and `authenticated`, which means anyone holding the
-- publishable key — a value that ships in every browser bundle and is meant to
-- be public — could POST to /rest/v1/rpc/purge_soft_deleted with a retention of
-- zero and permanently delete every soft-deleted row belonging to everyone.
--
-- Nothing in the app calls it and there is no scheduled job for it, so the fix
-- costs nothing: take the grant away, and put an admin check inside the function
-- as well so a future grant can't reopen the same hole by accident.

revoke execute on function public.purge_soft_deleted(interval) from anon, authenticated, public;

create or replace function public.purge_soft_deleted(retention interval default '90 days'::interval)
returns table(table_name text, purged bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t text;
  n bigint;
begin
  if not is_workspace_admin() then
    raise exception 'Only an admin can purge deleted records';
  end if;

  -- A short retention is how an accident becomes unrecoverable. Trash is the
  -- safety net for a bad click, so it keeps at least a fortnight whatever the
  -- caller asks for.
  if retention < interval '14 days' then
    raise exception 'Retention must be at least 14 days';
  end if;

  foreach t in array array[
    'activities', 'tasks', 'promises', 'meetings', 'lender_personal_details',
    'opportunities', 'opportunity_files', 'sba_questions', 'active_loans',
    'campaigns', 'templates', 'trips', 'locations', 'drop_offs', 'expenses',
    'voice_examples', 'lenders', 'institutions'
  ] loop
    execute format(
      'delete from %I where deleted_at is not null and deleted_at < now() - $1',
      t
    ) using retention;
    get diagnostics n = row_count;
    if n > 0 then
      table_name := t;
      purged := n;
      return next;
    end if;
  end loop;
end;
$function$;

-- CREATE OR REPLACE restores the default grant, so revoke again after.
revoke execute on function public.purge_soft_deleted(interval) from anon, authenticated, public;

-- A trigger function is not an API. It errors when called directly, but there
-- is no reason for it to be on the exposed surface at all. The auth service
-- still needs it, since it is what fires on a new signup.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- Seeding and unseeding are for a signed-in person acting on themselves.
revoke execute on function public.create_sample_data(uuid) from anon;
revoke execute on function public.delete_sample_data(uuid) from anon;
revoke execute on function public.has_sample_data(uuid) from anon;

-- Admin-only either way; the check is inside. Signed out, there is nothing to
-- check against.
revoke execute on function public.create_signup_invite(text) from anon;
revoke execute on function public.list_signup_invites() from anon;
revoke execute on function public.revoke_signup_invite(text) from anon;
revoke execute on function public.is_workspace_admin() from anon;

-- Pin the search_path on the two functions that were missing it, so a role with
-- a different path can't shadow the tables they touch.
alter function public.set_updated_at() set search_path to 'public';
alter function public.change_lender_institution(uuid, uuid, text) set search_path to 'public';
