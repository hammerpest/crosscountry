# CCAS Cross Country Carnival app

Web app to run the Central Coast Adventist School (CCAS) cross country carnival: results by finish ticket, HRIS team,
house points, a newsletter draft, and a results page for parents.

Owner: Jordan, PDHPE Head of Department at CCAS (uses they/them).

**Cross country only.** The swimming app (`SWIM 2027- App/ccas-swimming`) and the athletics app
(`ATHS 2027- App/ccas-athletics`) are separate projects. Reuse their code and lessons, but never change them from here.

## Where the truth lives

1. **`PROJECT-STATE.md`** (the latest dated version): decisions, open questions, next steps. It wins over anything else.
2. **`baseline/`**: screenshots of the approved look (XC Opt 15, 296 shots).

## Rules for every reply, file and screen

- Australian spelling. Simple, direct language.
- No em dashes anywhere. En dashes are fine in number ranges (Years 7–10).
- No emojis.
- Never use these words: delve, realm, unleash, tapestry, holistic, synthesize, substantiate, paramount, empirical,
  transcend, pivotal.
- Number every app change as **XC Opt X.Y** (Opt 13 was the Claude artifact; XC Opt 14 the new look; XC Opt 15 the move).
- After any decision, answered question or finished work, write a new dated version of `PROJECT-STATE.md` and tell Jordan.
- Made-up data only, until the principal and ICT approve real names. No date of birth is ever stored.

## The look

The swimming and athletics look (design S1.46 version 4, the onlinecarnivals.au landing look): Red Hat Display, Text
and Mono; CCAS navy #1d3160 and yellow #ffc907; house colours Bradman red, Jackson green, Newcombe blue; medals;
touch targets of 48 px or more; light and dark themes. Any visual change needs Jordan's OK first.

## Checks before Jordan sees a build

1. **Pixel compare:** `tests/shots.py` (every screen, 4 sizes, light and dark), compared with `baseline/` or the
   previous commit's shots. List every changed screen and look at it.
2. **Walk-through** in Jordan's Chrome (Claude in Chrome) or the built-in browser, with the console checked.
3. **Fresh-eyes review** by a separate agent: before and after, both themes, contrast, tap targets, no sideways scroll.

## How it is built (same as athletics)

- Plain HTML, CSS and JavaScript, no build step. `index.html`, `css/styles.css`, `js/config.js`, `js/store.js`,
  `js/app.js`, `img/`, `parents/` (results for parents, no PIN).
- **Store:** Supabase (Sydney). Everything on the server starts with `xc_` so it can share a project with another
  carnival app (the free plan allows 2 projects). `supabase/01-setup.sql` and `02-parent-results.sql` are safe to run
  again; test them with `tests/sql_test.py` (add `XC_WITH_ATHS=1` to load the athletics setup first) before Jordan runs them.
- **Test mode:** `?mode=local`, or empty `js/config.js`: this device only, made-up data (`&fresh=1` starts again,
  `&empty=1` a blank carnival, `&locked=1` locked results).
- **Jobs and PINs:** Recorder 1111, Results 2222, Carnival Organiser 9999 (test PINs, changed in Setup). Checked on the
  server. Only the public publishable key goes in the page.
- **Hosting:** GitHub Pages, `main` at the site root and `staging` at `/staging/`
  (`.github/workflows/pages.yml`), served at onlinecarnivals.au/crosscountry/. Push only when Jordan says so.
- Tools: `/Users/jordan.dennis/SWIM 2027- App/.venv` (Python 3.9, Playwright, Pillow, pgserver, psycopg). Serve with
  `python3 -m http.server 8160 --bind 127.0.0.1` in the background. The school's network filter blocks
  onlinecarnivals.au on this Mac; github.com works.
