# Setting up Supabase for cross country (XC Opt 15)

About 10 minutes. Cost: $0 (free plan). Made-up data only until the principal and ICT approve real names.

The free plan allows only 2 active projects, and swimming and athletics use them. So everything cross country puts in
Supabase starts with `xc_` (tables, functions, the live channel). It can go in the athletics project
(`ccas-athletics-staging`) without changing anything athletics uses, or in a project of its own (Jordan decides).

**In the athletics project:** skip steps 1 and 2 (already done there) and start at step 3.

1. Make the project at https://supabase.com: name `ccas-crosscountry-staging`, region **Asia-Pacific (Sydney)**, plan
   Free. Save the generated database password in your password manager. Do not share it.
2. **Authentication**, then **Sign In / Providers**: turn on **Allow anonymous sign-ins**. Then **Rate Limits**: set the
   anonymous limit to **100**.
3. **SQL Editor**, then **+ New query**: paste all of `supabase/01-setup.sql` and press **Run**. It should say Success.
   It is safe to run again.
4. **SQL Editor**, then **+ New query**: paste all of `supabase/02-parent-results.sql` and press **Run**.
5. **Project Settings**, then **Data API**: copy the **Project URL**. Then **API Keys**: copy the **publishable** key
   (starts `sb_publishable_`). Send both to Claude, or put them in `js/config.js` (`url` and `key`).
   Never use the secret or service_role key.
6. Test PINs while testing: Recorder 1111, Results 2222, Carnival Organiser 9999. Change them in Setup, Job PINs,
   before staff use the app.
7. Load the student list in Setup (paste from the sport list). For now use made-up names only.

Add `?mode=local` to the address for test mode with no Supabase (this device only, made-up data).
