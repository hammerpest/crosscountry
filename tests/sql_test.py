"""Tests supabase/01-setup.sql on a throwaway local Postgres (pgserver), before it goes near Supabase.
Supabase's own parts (auth.uid, storage, realtime) are replaced by small stand-ins.
Run: python3 tests/sql_test.py   (needs: pip install pgserver "psycopg[binary]")"""
import os, sys, tempfile, threading, uuid
import pgserver, psycopg

HERE = os.path.dirname(os.path.abspath(__file__))
SQL = os.path.join(HERE, "..", "supabase")
STUBS = """
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
create schema if not exists realtime;
create table if not exists realtime.messages (id bigserial primary key, topic text, payload jsonb);
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text language sql stable as
  $$ select current_setting('realtime.topic', true) $$;
grant usage on schema realtime to authenticated;
grant select, insert on realtime.messages to authenticated;
grant usage on sequence realtime.messages_id_seq to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;
"""
HASH = {"recorder": "8cfe2f27", "results": "a097e893", "org": "d218e917"}
fails = []
def check(ok, name):
    print(("ok  " if ok else "FAIL"), name); ok or fails.append(name)

tmp = tempfile.mkdtemp(prefix="xc-pg-")
srv = pgserver.get_server(tmp, cleanup_mode="stop")
URI = srv.get_uri()
admin = psycopg.connect(URI, autocommit=True)
admin.execute(STUBS)
# XC_WITH_ATHS=1: load the athletics setup first, to check cross country can share its Supabase project
ATHS = "/Users/jordan.dennis/ATHS 2027- App/ccas-athletics/supabase"
if os.environ.get("XC_WITH_ATHS") == "1":
    for n in ["01-setup.sql", "02-parent-results.sql"]: admin.execute(open(os.path.join(ATHS, n)).read())
    print("athletics setup loaded first")
setup = open(os.path.join(SQL, "01-setup.sql")).read()
admin.execute(setup); admin.execute(setup)  # safe to run twice
parents = open(os.path.join(SQL, "02-parent-results.sql")).read()
admin.execute(parents); admin.execute(parents)
admin.execute("""insert into xc_roster values ('F', '{"students":[{"id":"s-a","s":"Ashby","f":"Ava","h":"B","x":"F","g":12},{"id":"s-b","s":"Barlow","f":"Bea","h":"J","x":"F","g":12}]}'),
  ('M', '{"students":[{"id":"s-c","s":"Corwin","f":"Cal","h":"N","x":"M","g":14}]}')""")
admin.execute("""insert into xc_config values ('main', '{"eventName":"Test","pointsTop":85,"houses":[{"code":"B","name":"Bradman"}]}')""")

class Dev:
    """One device: its own anonymous user and connection."""
    def __init__(self):
        self.uid = str(uuid.uuid4())
        self.c = psycopg.connect(URI, autocommit=True)
        self.c.execute("set role authenticated")
        self.c.execute("select set_config('request.jwt.claim.sub', %s, false)", (self.uid,))
    def q(self, sql, args=()):
        return self.c.execute(sql, args).fetchall()
    def ok(self, sql, args=()):
        try: self.c.execute(sql, args); return True
        except psycopg.Error: return False
    def err(self, sql, args=()):
        try: self.c.execute(sql, args); return None
        except psycopg.Error as e: return e.sqlstate
    def pin(self, role): return self.q("select xc_claim_role(%s)", (HASH[role],))[0][0]

T = lambda t, sid: '{"t":%d,"sid":"%s","n":"x","x":"F","g":12,"h":"B"}' % (t, sid)
x = Dev()
check(x.q("select count(*) from xc_roster")[0][0] == 0, "no job: cannot read students")
check(x.q("select count(*) from xc_config")[0][0] == 0, "no job: cannot read settings")
check(not x.ok("insert into xc_finishes values ('00001', %s)", (T(1, "s-a"),)), "no job: cannot record a ticket")
check(x.q("select xc_claim_role('0000')")[0][0] is None, "wrong PIN refused")
check(not x.ok("select * from xc_private.pins"), "page cannot read the PIN table")
for role in HASH: check(Dev().pin(role) == role, "test PIN gives " + role)

r = Dev(); r.pin("recorder")
check(r.q("select count(*) from xc_roster")[0][0] == 2, "recorder reads students")
check(r.ok("insert into xc_finishes values ('00001', %s)", (T(1, "s-a"),)), "recorder records ticket 1")
r2 = Dev(); r2.pin("recorder")
check(r2.err("insert into xc_finishes values ('00001', %s)", (T(1, "s-b"),)) == "23505", "second recorder: ticket 1 already there (no overwrite)")
check(r.q("select doc->>'sid' from xc_finishes where id = '00001'")[0][0] == "s-a", "ticket 1 still has the first runner")
check(r.err("insert into xc_finishes values ('00002', %s)", (T(3, "s-b"),)) == "22023", "ticket row must match its number")
check(r.err("insert into xc_finishes values ('00002', %s)", ('{"t":2}',)) == "22023", "ticket row must name a runner")
check(r.ok("update xc_finishes set doc = %s where id = '00001'", (T(1, "s-b"),)), "recorder edits a ticket")
check(r.ok("insert into xc_extras values ('x-1', '{\"id\":\"x-1\",\"s\":\"Day\",\"f\":\"Dee\",\"h\":\"B\",\"x\":\"M\",\"g\":14}')"), "recorder adds a runner on the day")
check(not r.ok("insert into xc_roster values ('Z', '{}')"), "recorder cannot change the student list")
r.ok("update xc_config set doc = doc || '{\"locked\":true}' where id = 'main'")
check(admin.execute("select coalesce(doc->>'locked','false') from xc_config where id = 'main'").fetchone()[0] == "false", "recorder cannot lock results")

v = Dev(); v.pin("results")
check(v.q("select count(*) from xc_finishes")[0][0] == 1, "results job reads tickets")
check(not v.ok("insert into xc_finishes values ('00005', %s)", (T(5, "s-a"),)), "results job cannot record")
v.ok("delete from xc_finishes")
check(v.q("select count(*) from xc_finishes")[0][0] == 1, "nothing deleted by the results job")

o = Dev(); o.pin("org")
check(o.ok("update xc_config set doc = doc || '{\"locked\":true}' where id = 'main'"), "organiser locks results")
check(not r.ok("insert into xc_finishes values ('00007', %s)", (T(7, "s-a"),)), "locked: recorder cannot record")
check(o.ok("insert into xc_finishes values ('00007', %s)", (T(7, "s-a"),)), "locked: organiser still can")
check(o.ok("update xc_config set doc = doc || '{\"locked\":false}' where id = 'main'"), "organiser unlocks")
# PIN change: the hash moves to the private table; settings keep only "set"
newrec = "12345678"
check(o.ok("update xc_config set doc = doc || jsonb_build_object('pins', jsonb_build_object('recorder', %s::text)) where id = 'main'", (newrec,)), "organiser changes the Recorder PIN")
check(o.q("select doc->'pins'->>'recorder' from xc_config where id = 'main'")[0][0] == "set", "settings keep no PIN hash")
check(Dev().q("select xc_claim_role(%s)", (newrec,))[0][0] == "recorder", "new Recorder PIN works")
check(Dev().q("select xc_claim_role(%s)", (HASH["recorder"],))[0][0] is None, "old Recorder PIN refused")
check(not o.ok("update xc_config set doc = doc || jsonb_build_object('pins', jsonb_build_object('results', %s::text)) where id = 'main'", (HASH["org"],)), "two jobs cannot share a PIN")
# too many wrong PINs
y = Dev()
for _ in range(5): y.q("select xc_claim_role('bad')")
check(y.q("select xc_claim_role(%s)", (HASH["org"],))[0][0] == "wait", "5 wrong PINs: told to wait, even with the right PIN")
check(r.q("select xc_release_role()") is not None and r.q("select xc_my_role()")[0][0] is None, "sign out clears the job")

# parents page
import json as _json
anon = psycopg.connect(URI, autocommit=True); anon.execute("set role anon")
pr = lambda have="": anon.execute("select xc_parent_results(%s)", (have,)).fetchone()[0]
check(pr() == {"off": True}, "parents: off by default, nothing given")
check(not psycopg.connect(URI, autocommit=True).execute("set role anon").execute("select 1") is None, "anon connects")
check(anon.execute("select has_table_privilege('anon','public.xc_finishes','select')").fetchone()[0] is False, "parents cannot read tables")
admin.execute("update xc_config set doc = doc || '{\"parents\": true}' where id = 'main'")
d = pr(); raw = _json.dumps(d)
check(len(d["finishes"]) == 2 and all(f["n"] is None for f in d["finishes"]), "parents: tickets, no names by default")
check("Ashby" not in raw and "Barlow" not in raw and "s-a" not in raw and "pins" not in raw, "parents: no full names, ids or PINs")
check(d["entrants"].get("F12") == 2 and d["entrants"].get("M14") == 2, "parents: entrants per age group")
check(pr(d["v"]) == {"v": d["v"], "same": True}, "parents: same version gives a tiny answer")
admin.execute("update xc_config set doc = doc || '{\"parentsNames\": \"short\"}' where id = 'main'")
d2 = pr(); raw2 = _json.dumps(d2)
check(any(f["n"] == "Bea B." for f in d2["finishes"]) and "Barlow" not in raw2, "parents: names on shows first name and surname initial only")
admin.execute("update xc_config set doc = doc || '{\"parents\": false}' where id = 'main'")
check(pr() == {"off": True}, "parents: turned off again, nothing is given")

if os.environ.get("XC_WITH_ATHS") == "1":
    a1 = Dev()
    check(a1.q("select claim_role('cfaf6170')")[0][0] == "org", "athletics: its organiser PIN still works beside cross country")
    check(a1.q("select xc_my_role()")[0][0] is None, "athletics job gives no cross country job")
    check(a1.q("select count(*) from xc_roster")[0][0] == 0, "athletics job cannot read cross country students")
    x1 = Dev(); x1.pin("org")
    check(x1.q("select my_role()")[0][0] is None, "cross country job gives no athletics job")
    check(x1.q("select count(*) from roster")[0][0] == 0, "cross country job cannot read athletics students")
    check(admin.execute("select count(*) from pg_policies where tablename = 'messages' and policyname in ('job can listen','xc job can listen')").fetchone()[0] == 2, "both apps keep their live channel rules")
print("\n%d failed" % len(fails))
for n in fails: print("  FAIL", n)
sys.exit(1 if fails else 0)
