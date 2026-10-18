-- Locations can be archived (e.g. a home you've moved out of). Archiving a
-- location also hides everything inside it; restoring clears the date.
alter table public.locations add column archived_at timestamptz;
