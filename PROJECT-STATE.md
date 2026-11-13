# CCAS Cross Country Carnival app: project state

Version g, 13 November 2026 (replaces version f, same day: both SQL files run in the athletics project; live test passed).

## 1. What this is

The web app for the CCAS cross country carnival. Results are recorded by finish ticket. Four views: Record, Results
(Combined, Girls, Boys, HRIS team, Newsletter), Houses and Setup.

Until today the app lived only as a Claude artifact, "Opt 13": https://claude.ai/artifact/T2Q1iJZvt36RdPcHrzcTQ4.
It saves to the artifact's shared store (window.claude), so it only records results when opened in Claude.

## 2. What was done on 13 November 2026

### 2.1 XC Opt 13 saved here (commit ee67bb9)

The artifact's page, untouched, saved as `index.html`. It still works the same way.

### 2.2 Test tools (commit fbc528a)

- `tests/claude-shim.js`: test mode only. Stands in for the Claude runtime with made-up data (112 made-up students,
  74 results, tickets 23 and 41 missing, one runner added on the day). Options: `&empty=1`, `&locked=1`, `&view=1`.
- `tests/shots.py`: a screenshot of every screen and state (27) at phone 390 x 844, iPad 1180 x 820 and 820 x 1180,
  MacBook 1512 x 982, light and dark: 216 shots. Fails on page errors or sideways scroll.

### 2.3 XC Opt 14: the swimming app's new look (design S1.46 version 4)

The same look as Swim Opt 2.24, 2.25 and 2.28 and Aths Opt 2.2, so the three apps are one family. In `index.html`,
the "XC Opt 14" CSS block at the end of the first style sheet, and one line near the top that sets `html.jobs`.

- Kept: the navy CCAS header with the crest, every screen and feature, medals, house colours, the ticket box, the green,
  yellow and red messages, light and dark themes.
- New: landing background; dashed lanes instead of boxes; uppercase Red Hat Display headings; Red Hat Text for body text
  and Red Hat Mono uppercase labels (were Source Sans 3 and IBM Plex Mono); the chosen view, Girls/Boys/All and age chip
  in yellow; yellow main buttons (Record, Save settings, Lock results, the quick confirm box); "Record a finisher" ringed
  in yellow; the Record button outlined and dashed until it is ready; house points with house-coloured bars and the
  yellow end dot; age champions as lanes with a gold edge; every button, chip and box at least 48 px tall.
- No ticker and no brand bar: cross country has no PIN or Choose your job screen, which is where swimming shows them.
- Test mode: add `?mode=local` to the address to load the made-up data.

### 2.4 Checks

- Check 1 (pixel compare, `shots-before/` against `shots-after/`): all 216 shots differ, on purpose. No shot changed
  width; no shot grew or shrank by more than 25%. Every changed screen looked at.
- Check 2 (Claude in Chrome, local test page): recorded a finisher (ticket 80), went through every view and results
  mode; no sideways scroll, no console errors, nothing under 44 px except the Top 10 tick box, now fixed (its label is
  48 px). Phone width checked in the screenshot run (no sideways scroll at 390 px).
- Check 3 (fresh-eyes review by a separate agent): see 2.5.

### 2.5 Fresh-eyes review

Verdict PASS, nothing must fix. Fixed after it (then all 216 shots taken again; no width change, no height change
over 25%):
- outlines on inputs, buttons and chips were too faint for a control edge: the dashed and outline colour is now darker
  (light 50%, dark 40%, up from 30% and 28%), so they pass 3:1. Note: swimming and athletics still use the fainter
  outline; question 6.
- no yellow end dot on a house bar with 0 points;
- gold, silver and bronze result rows and the leading house tint no longer look muddy in dark;
- "ticket 14" no longer splits across lines in Age champions;
- the "row(s) need checking" opener and the "Spot open" HRIS text were too small or faint (already so in Opt 13): fixed;
- the Record button text is a little smaller on a phone so it does not take three lines.

Looked into, no change: the reviewer thought the labels might not be in Red Hat Mono; checked, the font loads and is used.
Left as notes: the chosen yellow has no outline (it is clear next to the outlined ones); "Tap again to lock" looks the
same as "Lock results as final" (as in Opt 13).

### 2.6 XC Opt 15: ready for onlinecarnivals.au/crosscountry (commits 915ce91 and 67b252f, local only)

Jordan said "yes, same front screen and job PINs" and "go" (decisions 6 and 7). Built like the athletics app:
- Files: `index.html`, `css/styles.css`, `js/config.js`, `js/store.js`, `js/app.js`, `img/crest.png`, `parents/`,
  `supabase/`, `.github/workflows/pages.yml` (main at the site root, staging at /staging/).
- Front screens in the landing look: ticker, brand bar, big heading "Cross Country Carnival", PIN keypad, Choose your
  job lanes (1 Recorder, 2 Results, 3 Carnival Organiser in navy; slide in and name scramble on a Mac).
- Job PINs replace Claude's sharing. Test PINs: Recorder 1111 (Record, Results, Houses), Results 2222 (Results and
  Houses, look only), Carnival Organiser 9999 (everything, Setup too). A Recorder or Results PIN goes straight to its
  job; the organiser chooses. Job badge and job menu (change job, sign out) in the navy header. PINs changed in Setup
  (new panel, Job PINs).
- Store: test mode (empty `js/config.js` or `?mode=local`: this device only, made-up data) and Supabase. A new ticket
  is insert only, so two recorders cannot overwrite each other; the second is told who has that ticket. Tickets saved
  with no signal wait on the device, as before, and send once the device has a job that can record.
- Supabase: the free plan allows 2 active projects and swimming and athletics use both, so everything cross country
  puts on the server starts with `xc_` (tables, functions, live channel). It can go in the athletics project without
  touching athletics (tested: each app's PINs open only its own data). `supabase/01-setup.sql`, `02-parent-results.sql`
  and `SETUP.md` (click-by-click steps).
- Parents page (`parents/`): House points, By age group, Age champions, in the landing look. Off until the organiser
  turns it on in Setup (new panel, Parents page). No names unless the organiser chooses "First name and surname
  initial"; never full names, student ids or PINs.
- "Polish with Claude" is gone from the Newsletter view (decision 4). Export CSV saves a file.

Checks:
- Server rules: `tests/sql_test.py`, 47 checks pass, also with the athletics setup loaded first.
- Check 1: 296 shots (37 screens, 4 sizes, light and dark), no page errors, no sideways scroll. Against `baseline/`:
  only the header changed on the approved screens (job badge, job menu; the phone header is 78 px taller as it
  wraps) and Setup has the two new panels.
- Check 2: Claude in Chrome on the test page: each PIN opens the right job and views, recording and the used-ticket
  check work, a changed PIN works and the old one is refused, no app console errors.
- Check 3: fresh-eyes review FAIL on two Supabase-mode faults (a refused delete reported as done; a false "Every PIN
  must be different" after PINs are changed), plus smaller ones (no time limit on the PIN screen with no signal; "PIN
  not right" when it should say wait; some refusals treated as no signal; the job menu off the edge on a phone; the
  workflow stopping with no staging branch; the add-runner form left open when locked). All fixed in 67b252f and
  checked again.
- Not yet run: the app against a real Supabase project. That needs Jordan's setup steps first (next step 1).

## 3. How to run

- Serve: `python3 -m http.server 8160 --bind 127.0.0.1` from this folder, then open
  `http://127.0.0.1:8160/index.html?mode=local`.
- Shots: `"../SWIM 2027- App/.venv/bin/python" tests/shots.py http://127.0.0.1:8160/index.html shots-after`
  (about 3 minutes). `shots-*` folders are not committed.

## 4. Open questions for Jordan

8. (Answered, decision 9.) Supabase: put cross country in the athletics project (`ccas-athletics-staging`, nothing new to make), or a project
   of its own (needs a second Supabase organisation or a paid plan, as the free plan allows 2 projects)? Recommended:
   the athletics project. Note: the 100 anonymous sign-ins an hour would then be shared by both apps.
9. GitHub: a new repo `hammerpest/crosscountry` (like `athletics`), so the site shows it at onlinecarnivals.au/crosscountry/.
   This Mac has no push token, so files go up through github.com in your Chrome, as for athletics. OK to make it?
10. The swimming and athletics apps may have two of the faults the review found here (a refused delete reported as done;
    "PIN not right" when there were too many tries). Check them in their own projects?

## 5. Decisions

1. (13 November 2026, answers question 1) Jordan approved the XC Opt 14 look, including the darker outlines. From now
   on any visual change needs Jordan's OK. `baseline/` holds the approved shots (216) to compare future builds against:
   `tests/shots.py ... shots-new`, then compare with `baseline/` (same names).
2. (13 November 2026, answers question 2) Cross country lives with the other two carnivals: onlinecarnivals.au, GitHub
   Pages and Supabase, like swimming and athletics.
3. (13 November 2026, answers question 3) The Claude artifact (Opt 13) stays as it is until the move.
4. (13 November 2026, answers question 5) The plain draft newsletter article is enough; "Polish with Claude" can go
   when the app moves.
5. (13 November 2026, answers question 6) All three apps should look alike: swimming and athletics get the same darker
   outlines (light rgba(20,32,63,.5), dark rgba(255,255,255,.4) for --lt-line). Done in their own projects, not here
   (Swim Opt 2.29 and Aths Opt 2.3).
6. (13 November 2026, answers question 4) Cross country gets the same front screen and job PINs as swimming and
   athletics, in place of Claude's sharing.
7. (13 November 2026, answers question 7) Start the move now ("go"). Built as XC Opt 15 (2.6).
8. (13 November 2026) Jordan approved XC Opt 15: the front screens, job PINs, job menu, the Setup panels (Parents
   page, Job PINs) and the parents page. `baseline/` now holds its 296 shots. Any visual change needs Jordan's OK.
9. (13 November 2026, answers question 8) Cross country goes in the athletics Supabase project, ccas-athletics-staging
   ("make it fit"). `js/config.js` has its address and publishable key. Its xc_ tables and functions are not there until
   Jordan runs `supabase/01-setup.sql` and `02-parent-results.sql` in that project's SQL Editor.
   Done the same day: Jordan ran both files. Live test (`tests/supabase_live.py`, five devices, made-up names): 18 of 18
   pass. Organiser PIN and student list; Recorder PIN straight to Record; ticket 1 shows as taken on the second
   recorder at once; two recorders saving the same new ticket together: one saved, the other told who has it; Results
   job sees only Results and Houses, live; lock turns recording off; parents page shows first name and surname initial
   only; clean-up (results deleted, student list deleted, unlocked, parents page off). No page errors.

## 6. Next steps

1. Question 9 (GitHub repo), then staging.
2. GitHub repo and Pages, staging first (onlinecarnivals.au/crosscountry/staging/), then main once Jordan agrees. The
   landing page already links to /crosscountry/ and /crosscountry/parents/.
