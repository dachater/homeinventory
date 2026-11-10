-- Security hardening (from Supabase's security advisor and a review).

-- 1. Pin search_path on every function so they can't be tricked into using
--    objects from another schema. They all use fully qualified names already.
alter function public.touch_item() set search_path = '';
alter function public.check_location() set search_path = '';
alter function public.check_item() set search_path = '';
alter function public.check_item_tag() set search_path = '';
alter function public.check_item_file() set search_path = '';
alter function public.storage_household(text) set search_path = '';

-- 2. Membership helpers are only needed by signed-in users (row level
--    security policies run as them). Nobody signed out should call them.
revoke execute on function public.is_household_member(uuid) from public, anon;
revoke execute on function public.is_household_owner(uuid) from public, anon;
revoke execute on function public.storage_household(text) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;
grant execute on function public.storage_household(text) to authenticated;

-- 3. A household must always keep at least one owner: refuse removing or
--    demoting the last one (otherwise nobody could manage it).
-- security definer: it must see every membership and auth.users, whoever deletes.
create or replace function public.keep_an_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     -- Allowed when the whole household, or the user's account, is being deleted.
     and exists (select 1 from public.households where id = old.household_id)
     and exists (select 1 from auth.users where id = old.user_id)
     and not exists (
       select 1 from public.household_members
       where household_id = old.household_id and role = 'owner' and user_id <> old.user_id
     ) then
    raise exception 'A household needs at least one owner';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger household_members_keep_owner
  before update or delete on public.household_members
  for each row execute function public.keep_an_owner();

revoke execute on function public.keep_an_owner() from public, anon, authenticated;

-- 4. Uploads: only photos, PDFs and common document types, at most 20 MB.
--    This blocks HTML, SVG and script files, which a browser could run.
update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
      'image/avif', 'image/bmp', 'image/tiff',
      'application/pdf', 'text/plain', 'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/zip',
      'video/mp4', 'video/quicktime'
    ]
where id = 'item-files';
