-- Home Inventory schema.
-- Everything belongs to a household. A user can read and change a household's
-- data only while they are a member of it; row level security enforces this.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  default_currency text not null default 'MYR' check (default_currency ~ '^[A-Z]{3}$'),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members (user_id);

create table public.household_invites (
  code text primary key default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create index household_invites_household_idx on public.household_invites (household_id);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Deleting a location that still has sub-locations is refused.
  parent_id uuid references public.locations (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  description text,
  created_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create index locations_household_idx on public.locations (household_id);
create index locations_parent_idx on public.locations (parent_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  color text not null default '#5ac8fa' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Items in a deleted location move to "(unspecified)".
  location_id uuid references public.locations (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  description text,
  quantity integer not null default 1 check (quantity >= 0),
  value numeric(14, 2) check (value >= 0),
  currency text not null default 'MYR' check (currency ~ '^[A-Z]{3}$'),
  purchase_date date,
  purchased_from text,
  brand text,
  model text,
  serial_number text,
  barcode text,
  notes text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
create index items_household_idx on public.items (household_id);
create index items_location_idx on public.items (location_id);
create index items_category_idx on public.items (category_id);

create table public.item_tags (
  item_id uuid not null references public.items (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (item_id, tag_id)
);
create index item_tags_tag_idx on public.item_tags (tag_id);

create table public.item_files (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  kind text not null check (kind in ('photo', 'receipt', 'attachment')),
  -- Object path in the "item-files" storage bucket: <household_id>/<item_id>/<file>
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index item_files_item_idx on public.item_files (item_id);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

create or replace function public.touch_item() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger items_touch before update on public.items
  for each row execute function public.touch_item();

-- Rows that point at other rows must stay inside the same household, and the
-- location tree must not contain cycles.
create or replace function public.check_location() returns trigger
language plpgsql as $$
declare
  cur uuid;
  depth int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;
  if not exists (select 1 from public.locations
                 where id = new.parent_id and household_id = new.household_id) then
    raise exception 'Parent location belongs to a different household';
  end if;
  cur := new.parent_id;
  while cur is not null loop
    if cur = new.id then
      raise exception 'A location cannot be moved inside itself';
    end if;
    depth := depth + 1;
    if depth > 100 then
      raise exception 'Locations are nested too deeply';
    end if;
    select parent_id into cur from public.locations where id = cur;
  end loop;
  return new;
end;
$$;

create trigger locations_check before insert or update on public.locations
  for each row execute function public.check_location();

create or replace function public.check_item() returns trigger
language plpgsql as $$
begin
  if new.location_id is not null and not exists (
    select 1 from public.locations where id = new.location_id and household_id = new.household_id
  ) then
    raise exception 'Location belongs to a different household';
  end if;
  if new.category_id is not null and not exists (
    select 1 from public.categories where id = new.category_id and household_id = new.household_id
  ) then
    raise exception 'Category belongs to a different household';
  end if;
  return new;
end;
$$;

create trigger items_check before insert or update on public.items
  for each row execute function public.check_item();

create or replace function public.check_item_tag() returns trigger
language plpgsql as $$
begin
  if (select household_id from public.items where id = new.item_id)
     is distinct from (select household_id from public.tags where id = new.tag_id) then
    raise exception 'Tag belongs to a different household';
  end if;
  return new;
end;
$$;

create trigger item_tags_check before insert or update on public.item_tags
  for each row execute function public.check_item_tag();

create or replace function public.check_item_file() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.items
                 where id = new.item_id and household_id = new.household_id) then
    raise exception 'Item belongs to a different household';
  end if;
  if split_part(new.storage_path, '/', 1) <> new.household_id::text
     or split_part(new.storage_path, '/', 2) <> new.item_id::text then
    raise exception 'Storage path must start with <household_id>/<item_id>/';
  end if;
  return new;
end;
$$;

create trigger item_files_check before insert or update on public.item_files
  for each row execute function public.check_item_file();

-- ---------------------------------------------------------------------------
-- Membership helpers and RPCs
-- ---------------------------------------------------------------------------

-- security definer so policies on household_members can call it without
-- recursing into their own policy.
create or replace function public.is_household_member(hid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(hid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.create_household(p_name text, p_currency text default 'MYR')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  insert into public.households (name, default_currency, created_by)
    values (p_name, coalesce(p_currency, 'MYR'), auth.uid())
    returning id into hid;
  insert into public.household_members (household_id, user_id, role)
    values (hid, auth.uid(), 'owner');
  return hid;
end;
$$;

create or replace function public.join_household(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select household_id into hid from public.household_invites
    where code = upper(trim(p_code)) and expires_at > now();
  if hid is null then
    raise exception 'Invite code is invalid or has expired';
  end if;
  insert into public.household_members (household_id, user_id, role)
    values (hid, auth.uid(), 'member')
    on conflict do nothing;
  return hid;
end;
$$;

-- Members of a household with their email addresses (auth.users is not
-- readable by clients).
create or replace function public.household_member_list(p_household uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.role, m.joined_at
  from public.household_members m
  join auth.users u on u.id = m.user_id
  where m.household_id = p_household
    and public.is_household_member(p_household)
  order by m.joined_at;
$$;

revoke execute on function public.create_household(text, text) from anon, public;
revoke execute on function public.join_household(text) from anon, public;
revoke execute on function public.household_member_list(uuid) from anon, public;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.household_member_list(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.locations enable row level security;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.items enable row level security;
alter table public.item_tags enable row level security;
alter table public.item_files enable row level security;

-- Households are created through create_household().
create policy "members read household" on public.households
  for select to authenticated using (public.is_household_member(id));
create policy "owners update household" on public.households
  for update to authenticated
  using (public.is_household_owner(id)) with check (public.is_household_owner(id));
create policy "owners delete household" on public.households
  for delete to authenticated using (public.is_household_owner(id));

-- Memberships are created through create_household() and join_household().
create policy "members read memberships" on public.household_members
  for select to authenticated using (public.is_household_member(household_id));
create policy "owners update memberships" on public.household_members
  for update to authenticated
  using (public.is_household_owner(household_id))
  with check (public.is_household_owner(household_id));
-- Owners can remove anyone; members can leave.
create policy "remove memberships" on public.household_members
  for delete to authenticated
  using (public.is_household_owner(household_id) or user_id = auth.uid());

create policy "members manage invites" on public.household_invites
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members manage locations" on public.locations
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members manage categories" on public.categories
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members manage tags" on public.tags
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members manage items" on public.items
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members manage item tags" on public.item_tags
  for all to authenticated
  using (exists (select 1 from public.items i
                 where i.id = item_id and public.is_household_member(i.household_id)))
  with check (exists (select 1 from public.items i
                      where i.id = item_id and public.is_household_member(i.household_id)));

create policy "members manage item files" on public.item_files
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Storage: private bucket for photos, receipts and attachments.
-- Object names start with the household id, which the policies check.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('item-files', 'item-files', false, 52428800)
on conflict (id) do nothing;

create or replace function public.storage_household(object_name text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

create policy "members read item files" on storage.objects
  for select to authenticated
  using (bucket_id = 'item-files'
         and public.is_household_member(public.storage_household(name)));

create policy "members upload item files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'item-files'
              and public.is_household_member(public.storage_household(name)));

create policy "members update item files" on storage.objects
  for update to authenticated
  using (bucket_id = 'item-files'
         and public.is_household_member(public.storage_household(name)))
  with check (bucket_id = 'item-files'
              and public.is_household_member(public.storage_household(name)));

create policy "members delete item files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'item-files'
         and public.is_household_member(public.storage_household(name)));
