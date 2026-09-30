-- Guestbook + song suggestions for y2k-site.
-- Run this in the Supabase SQL editor. It is written to be re-runnable.
--
-- The anon key in script.js is public. These policies are the actual lock:
-- anyone may read and insert, nobody using that key may update or delete.

-- Review probes from 2026-09-30. The anon key cannot delete these itself.
do $$
begin
  if to_regclass('public.guestbook_entries') is not null then
    delete from public.guestbook_entries
    where id in (2, 5, 6, 7, 8, 9, 10)
      and (
        message = 'temporary security probe, delete me'
        or (name = 'x' and message ~ '^a+$' and char_length(message) between 2 and 280)
      );
  end if;

  if to_regclass('public.song_suggestions') is not null then
    delete from public.song_suggestions
    where id = 1
      and song = 'rls-probe'
      and notes = 'temporary security probe, delete me';
  end if;
end $$;

create table if not exists public.guestbook_entries (
  id bigint generated always as identity primary key,
  name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.song_suggestions (
  id bigint generated always as identity primary key,
  song text not null,
  notes text not null,
  created_at timestamptz not null default now()
);

alter table public.guestbook_entries drop constraint if exists guestbook_name_len;
alter table public.guestbook_entries
  add constraint guestbook_name_len check (char_length(btrim(name)) between 2 and 40);

alter table public.guestbook_entries drop constraint if exists guestbook_message_len;
alter table public.guestbook_entries
  add constraint guestbook_message_len check (char_length(btrim(message)) between 2 and 280);

alter table public.song_suggestions drop constraint if exists song_len;
alter table public.song_suggestions
  add constraint song_len check (char_length(btrim(song)) between 2 and 100);

alter table public.song_suggestions drop constraint if exists song_notes_len;
alter table public.song_suggestions
  add constraint song_notes_len check (char_length(btrim(notes)) between 2 and 280);

alter table public.guestbook_entries enable row level security;
alter table public.song_suggestions enable row level security;

-- Drop update/delete (and FOR ALL) policies so a leaked anon key cannot rewrite the book.
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('guestbook_entries', 'song_suggestions')
      and cmd in ('UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

drop policy if exists "public read guestbook" on public.guestbook_entries;
create policy "public read guestbook"
  on public.guestbook_entries
  for select
  to anon, authenticated
  using (true);

drop policy if exists "public insert guestbook" on public.guestbook_entries;
create policy "public insert guestbook"
  on public.guestbook_entries
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "public read songs" on public.song_suggestions;
create policy "public read songs"
  on public.song_suggestions
  for select
  to anon, authenticated
  using (true);

drop policy if exists "public insert songs" on public.song_suggestions;
create policy "public insert songs"
  on public.song_suggestions
  for insert
  to anon, authenticated
  with check (true);

-- Private log used only by the rate-limit trigger. No policies: anon cannot read the IPs.
create table if not exists public.submission_log (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('guestbook', 'song')),
  client_ip text not null,
  created_at timestamptz not null default now()
);

alter table public.submission_log enable row level security;
revoke all on public.submission_log from anon, authenticated;

create or replace function public.client_ip()
returns text
language sql
stable
as $$
  select left(coalesce(
    nullif(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), ''),
    'unknown'
  ), 64);
$$;

create or replace function public.enforce_submit_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ip text := public.client_ip();
  kind text := TG_ARGV[0];
  recent int;
begin
  if kind = 'guestbook' then
    if char_length(btrim(new.name)) < 2 or char_length(btrim(new.message)) < 2 then
      raise exception 'Write a little more.';
    end if;
  elsif kind = 'song' then
    if char_length(btrim(new.song)) < 2 or char_length(btrim(new.notes)) < 2 then
      raise exception 'Write a little more.';
    end if;
  end if;

  select count(*) into recent
  from public.submission_log
  where client_ip = ip
    and created_at > now() - interval '10 minutes';

  if recent >= 3 then
    raise exception 'Too many notes. Please wait a few minutes.';
  end if;

  insert into public.submission_log (kind, client_ip) values (kind, ip);
  return new;
end;
$$;

drop trigger if exists guestbook_rate on public.guestbook_entries;
create trigger guestbook_rate
  before insert on public.guestbook_entries
  for each row execute function public.enforce_submit_rate('guestbook');

drop trigger if exists song_rate on public.song_suggestions;
create trigger song_rate
  before insert on public.song_suggestions
  for each row execute function public.enforce_submit_rate('song');
