-- CCAS Cross Country Carnival, XC Opt 15: database setup for Supabase.
-- Paste the whole file into the Supabase SQL Editor and press Run. Safe to run again.
-- Built the same way as the athletics app (Aths Opt 1.6).
-- Everything here starts with xc_ (tables xc_config, xc_roster, xc_extras, xc_finishes; schema xc_private; functions
-- xc_claim_role, xc_my_role, xc_release_role; channel xc-carnival), so it can sit in the same Supabase project as another
-- carnival app without touching it. The free plan allows only 2 active projects.
--
-- One table per collection. Each row is one document: id, doc (JSON), updated_at.
-- Security: each device signs in anonymously, then claim_role(PIN hash) gives it a job.
-- Row-level security reads that job to decide what the device can read and write.
-- Jobs: recorder (records tickets, adds runners on the day), results (look only), org (Carnival Organiser, everything).

-- ---------- private schema (never reachable from the page) ----------
create schema if not exists xc_private;
revoke all on schema xc_private from public, anon;

create table if not exists xc_private.pins (
  role text primary key,
  hash text not null,
  test_hash text not null
);
create table if not exists xc_private.sessions (
  user_id uuid primary key,
  role text not null,
  at timestamptz not null default now()
);
create table if not exists xc_private.pin_tries (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists pin_tries_at on xc_private.pin_tries (at);
alter table xc_private.pins enable row level security;
alter table xc_private.sessions enable row level security;
alter table xc_private.pin_tries enable row level security;
revoke all on all tables in schema xc_private from public, anon, authenticated;

-- Test PINs: Recorder 1111, Results 2222, Carnival Organiser 9999. Stored as the same hash the page makes.
-- Change them in the app (Setup, Job PINs) before the carnival. Running this file again keeps any PIN already changed.
insert into xc_private.pins (role, hash, test_hash) values
  ('recorder', '8cfe2f27', '8cfe2f27'),
  ('results',  'a097e893', 'a097e893'),
  ('org',      'd218e917', 'd218e917')
on conflict (role) do nothing;

-- ---------- document tables ----------
do $$
declare t text;
begin
  foreach t in array array['xc_config','xc_roster','xc_extras','xc_finishes'] loop
    execute format('create table if not exists public.%I (id text primary key, doc jsonb not null, updated_at timestamptz not null default now())', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- updated_at is always the server's clock: the parents page asks "has anything changed?" with it.
create or replace function xc_private.touch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['xc_config','xc_roster','xc_extras','xc_finishes'] loop
    execute format('drop trigger if exists xc_touch on public.%I', t);
    execute format('create trigger xc_touch before insert or update on public.%I for each row execute function xc_private.touch()', t);
  end loop;
end $$;

-- ---------- helpers ----------
create or replace function xc_private.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from xc_private.sessions where user_id = auth.uid()
$$;

create or replace function xc_private.is_locked() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (doc->>'locked')::boolean from public.xc_config where id = 'main'), false)
$$;

-- Who can write each collection. The organiser writes everything. When results are locked, only the organiser can write.
create or replace function xc_private.can_write(tbl text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare r text := xc_private.my_role();
begin
  if r is null then return false; end if;
  if r = 'org' then return true; end if;
  if xc_private.is_locked() then return false; end if;
  return r = 'recorder' and tbl in ('xc_finishes', 'xc_extras');
end $$;

grant usage on schema xc_private to authenticated;
revoke all on all functions in schema xc_private from public, anon;
grant execute on function xc_private.my_role(), xc_private.is_locked(), xc_private.can_write(text) to authenticated;

-- ---------- row-level security on the document tables ----------
do $$
declare t text;
begin
  foreach t in array array['xc_config','xc_roster','xc_extras','xc_finishes'] loop
    execute format('drop policy if exists "job can read" on public.%I', t);
    execute format('drop policy if exists "job can add" on public.%I', t);
    execute format('drop policy if exists "job can change" on public.%I', t);
    execute format('drop policy if exists "job can delete" on public.%I', t);
    execute format('create policy "job can read" on public.%I for select to authenticated using (xc_private.my_role() is not null)', t);
    execute format('create policy "job can add" on public.%I for insert to authenticated with check (xc_private.can_write(%L))', t, t);
    execute format('create policy "job can change" on public.%I for update to authenticated using (xc_private.can_write(%L)) with check (xc_private.can_write(%L))', t, t, t);
    execute format('create policy "job can delete" on public.%I for delete to authenticated using (xc_private.can_write(%L))', t, t);
  end loop;
end $$;

-- A ticket is one row (id = the ticket number, 5 digits). A new ticket is only ever inserted, so two recorders
-- typing the same ticket at once cannot overwrite each other: the second gets "already there" and is told who has it.
-- A ticket row must name its own ticket number and a runner.
create or replace function xc_private.finish_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(new.doc->'t') <> 'number' or (new.doc->>'t')::int < 1
     or lpad((new.doc->>'t')::int::text, 5, '0') <> new.id
     or coalesce(new.doc->>'sid', '') = '' then
    raise exception 'A ticket needs its number and a runner' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists finish_check on public.xc_finishes;
create trigger finish_check before insert or update on public.xc_finishes
  for each row execute function xc_private.finish_check();

-- ---------- PINs ----------
-- Every wrong PIN is counted. More than 5 wrong in 5 minutes on one device,
-- or 100 wrong in 10 minutes in total, and every PIN is refused for a while.
create or replace function xc_private.too_many_tries() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from xc_private.pin_tries where user_id = auth.uid() and at > now() - interval '5 minutes') >= 5
      or (select count(*) from xc_private.pin_tries where at > now() - interval '10 minutes') >= 100
$$;

create or replace function public.xc_claim_role(pin_hash text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r text;
begin
  if uid is null then return null; end if;
  delete from xc_private.pin_tries where at < now() - interval '1 day';
  -- too many tries: the page says to wait, rather than that the PIN is wrong
  if xc_private.too_many_tries() then return 'wait'; end if;
  select role into r from xc_private.pins where hash = pin_hash;
  if r is null then
    insert into xc_private.pin_tries (user_id) values (uid);
    return null;
  end if;
  insert into xc_private.sessions (user_id, role, at) values (uid, r, now())
    on conflict (user_id) do update set role = excluded.role, at = now();
  return r;
end $$;

create or replace function public.xc_my_role() returns text
language sql stable security definer set search_path = '' as $$
  select xc_private.my_role()
$$;

create or replace function public.xc_release_role() returns void
language sql volatile security definer set search_path = '' as $$
  delete from xc_private.sessions where user_id = auth.uid()
$$;

-- The organiser changes PINs by saving config/main with pins in it.
-- The hashes go into xc_private.pins; config/main only keeps "set" for each changed PIN,
-- so no job can read a PIN hash. Every PIN must be different.
create or replace function xc_private.config_pins() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text; v text; marks jsonb;
begin
  if new.id <> 'main' then return new; end if;
  if jsonb_typeof(new.doc->'pins') = 'object' then
    for k, v in select key, value #>> '{}' from jsonb_each(new.doc->'pins') loop
      if v is not null and v <> 'set' then
        update xc_private.pins set hash = v where role = k;
      end if;
    end loop;
    if (select count(distinct hash) from xc_private.pins) < (select count(*) from xc_private.pins) then
      raise exception 'Every PIN must be different' using errcode = '23505';
    end if;
  end if;
  select coalesce(jsonb_object_agg(role, 'set'), '{}'::jsonb) into marks from xc_private.pins where hash <> test_hash;
  new.doc := jsonb_set(new.doc, '{pins}', marks);
  return new;
end $$;
drop trigger if exists config_pins on public.xc_config;
create trigger config_pins before insert or update on public.xc_config
  for each row execute function xc_private.config_pins();

revoke all on function public.xc_claim_role(text), public.xc_my_role(), public.xc_release_role() from public, anon;
grant execute on function public.xc_claim_role(text), public.xc_my_role(), public.xc_release_role() to authenticated;

-- ---------- live updates ----------
-- Row changes reach a device only if it can read the row (row-level security above).
do $$
declare t text;
begin
  foreach t in array array['xc_config','xc_roster','xc_extras','xc_finishes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- The private "xc-carnival" channel. Only a device with a job can join it.
drop policy if exists "xc job can listen" on realtime.messages;
drop policy if exists "xc job can send" on realtime.messages;
create policy "xc job can listen" on realtime.messages for select to authenticated
  using (realtime.topic() = 'xc-carnival' and xc_private.my_role() is not null);
create policy "xc job can send" on realtime.messages for insert to authenticated
  with check (realtime.topic() = 'xc-carnival' and xc_private.my_role() is not null);
