-- XC Opt 15: results for parents (the page at /crosscountry/parents/). Safe to run again.
-- Run it after 01-setup.sql, in the Supabase SQL Editor. Built the same way as the athletics parents page.
--
-- Parents need no PIN and no sign-in. They call one function that hands out only what the results page needs:
--   - nothing at all unless the organiser has turned the parents page on (Setup, Parents page: config/main "parents": true);
--   - for each ticket: the ticket number, age group, sex and house, and a name only when the organiser has chosen
--     "First name and surname initial" (config/main "parentsNames": "short"). The default is no names.
--   - how many students are in each age group (for "6 of 8 finished");
--   - no student ids, no full names, no PINs.
-- The page asks every minute with the version it has; when nothing changed the answer is tiny.
create or replace function public.xc_parent_results(have text default '') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cfg jsonb; v text; names_on boolean;
begin
  select doc into cfg from public.xc_config where id = 'main';
  if cfg is null or coalesce(cfg->'parents', 'false'::jsonb) <> 'true'::jsonb then
    return jsonb_build_object('off', true);
  end if;
  names_on := coalesce(cfg->>'parentsNames', 'none') = 'short';
  v := concat_ws('.',
    (select count(*) || '-' || coalesce(floor(extract(epoch from max(updated_at)) * 1000)::bigint, 0) from public.xc_finishes),
    (select count(*) || '-' || coalesce(floor(extract(epoch from max(updated_at)) * 1000)::bigint, 0) from public.xc_roster),
    (select count(*) || '-' || coalesce(floor(extract(epoch from max(updated_at)) * 1000)::bigint, 0) from public.xc_extras),
    (select coalesce(floor(extract(epoch from max(updated_at)) * 1000)::bigint, 0) from public.xc_config));
  if v = have then
    return jsonb_build_object('v', v, 'same', true);
  end if;
  return (
    with st as (
      select s->>'id' as id, s->>'f' as f, s->>'s' as sn, s->>'h' as h, s->>'x' as x,
             nullif(s->>'g', '')::int as g
      from public.xc_roster r, jsonb_array_elements(case when jsonb_typeof(r.doc->'students') = 'array' then r.doc->'students' else '[]'::jsonb end) s
      union all
      select x.doc->>'id', x.doc->>'f', x.doc->>'s', x.doc->>'h', x.doc->>'x', nullif(x.doc->>'g', '')::int
      from public.xc_extras x
    ),
    fin as (
      select (f.doc->>'t')::int as t,
             coalesce(st.x, f.doc->>'x') as x,
             coalesce(st.g, nullif(f.doc->>'g', '')::int) as g,
             coalesce(st.h, f.doc->>'h') as h,
             case when names_on and st.id is not null then btrim(coalesce(st.f, '') || ' ' || left(coalesce(st.sn, ''), 1) || case when coalesce(st.sn, '') <> '' then '.' else '' end) end as n
      from public.xc_finishes f left join st on st.id = f.doc->>'sid'
    )
    select jsonb_build_object(
      'v', v,
      'config', jsonb_build_object('eventName', cfg->'eventName', 'pointsTop', cfg->'pointsTop', 'distances', cfg->'distances',
        'houses', cfg->'houses', 'locked', cfg->'locked', 'lockedAt', cfg->'lockedAt', 'names', names_on),
      'finishes', coalesce((select jsonb_agg(jsonb_build_object('t', t, 'x', x, 'g', g, 'h', h, 'n', n) order by t) from fin), '[]'::jsonb),
      'entrants', coalesce((select jsonb_object_agg(k, c) from (select x || least(18, greatest(12, g))::text as k, count(*) as c from st where g is not null group by 1) e), '{}'::jsonb)
    )
  );
end $$;
revoke all on function public.xc_parent_results(text) from public;
grant execute on function public.xc_parent_results(text) to anon, authenticated;
