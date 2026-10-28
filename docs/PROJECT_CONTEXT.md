# ParkPulse — project context

Everything a fresh session needs to pick up work on this repo. Keep it current:
update the "Status" and "Open threads" sections whenever a feature ships.

_Last updated: 2026-10-28 (main at 8f02db7)._

## What it is

Anonymous salary and interview reports for Kerala's IT parks (Infopark,
Technopark, Cyberpark). People browse freely; signed-in users (Google) share
one experience at a time, which an admin reviews before it goes public.
Contributing earns free AI mock interviews.

- Owner: shyjutech, promoted via Instagram @shyju.tech.
- Live: https://parkpulse-nine.vercel.app (Vercel; check `NEXT_PUBLIC_SITE_URL`).
- Repo: https://github.com/shyjutech/parkpulse — work happens on `main`, short
  feature branches merged back and then deleted.

## Core promise (never break)

Authors are never exposed. All access control lives in Postgres (RLS +
`SECURITY DEFINER` functions such as `is_admin()`, `moderate_submission()`),
not in Next.js. `src/proxy.ts` only refreshes the session, sets the anonymous
visitor cookie and stores first-touch UTM tags — it is not an auth layer.

- `submissions.user_id` is never selectable by API roles.
- `status` / `moderated_at` are never client-writable.
- Public reads see approved rows only.
- `SUPABASE_SERVICE_ROLE_KEY` is not used anywhere — keep it that way.
- User-facing copy stays honest: show sample sizes (`sampleNote`), and
  "reviewed" is not "verified".
- No resumes, names, emails or phone numbers in the interview feature.

## Stack

Next.js 16.3 (App Router; `proxy.ts` replaces middleware — read
`node_modules/next/dist/docs/` before writing Next code, per `AGENTS.md`),
React 19, Tailwind 4, Supabase (Auth, Postgres, RLS, FTS) via `@supabase/ssr`,
Recharts, Zod 4. Tests: Vitest 4, DB tests on PGlite (no Docker).

```
npm run dev        # local
npm test           # unit + DB/RLS tests
npm run typecheck
npm run lint
```

All three checks must pass before calling anything done.

## Layout

```
src/app/
  page.tsx                 home
  experiences/, companies/, company/[slug]/, search/   browsing
  submit/ (+ actions.ts, done/)                         share an experience
  interview/ (+ actions.ts)  api/interview/respond/     AI mock interview
  dashboard/               "My space": my submissions, credits, saves, follows
  prep/[slug]/             per-company prep checklist
  launch/                  Instagram campaign landing page
  admin/ (+ actions.ts)    moderation, funnel, sources, growth, demand
  api/events/              client analytics (page-level events only)
  api/companies/suggest/   company autocomplete
  auth/callback, auth/signout, login/, privacy/
src/components/            UI (SubmitForm, InterviewFlow, ContributeNudge, InlineNudge, SalaryChart, ...)
src/lib/
  supabase/{client,server,env}.ts
  attribution.ts           UTM cookie + anon visitor id
  events.ts, clientEvents.ts   analytics (outcome events server-side only)
  engagement.ts, validation.ts, constants.ts, types.ts, nav.ts, session.ts
  interview/               constants, prompt, grounding, feedback, openrouter (provider-neutral client)
supabase/migrations/       ordered, additive SQL
tests/db/                  rls.test.ts, upgrade.test.ts, stub_supabase.sql
docs/                      this file, campaign-links, interview manual test checklist, rollback snippets
```

Top nav: Experiences · Companies · Share · Mock interview · My space · Admin.

## Database

Migrations (run in order; never edit an old one — add a new timestamped file):

1. `20260919000000_phase1_init.sql` — companies, submissions, profiles, admins, moderation, aggregates, FTS. Seeds the admin email.
2. `20260921000000_open_browse_engagement.sql` — saves, follows, prep plans/items, company requests, events/UTM.
3. `20261023000000_submit_funnel_events.sql` — real submission funnel events.
4. `20261024000000_ai_interview_credits.sql` — `interview_credits` ledger + grant trigger.
5. `20261025000000_ai_interview_turns.sql` — `ai_interview_sessions`, turn recording.
6. `20261026000000_ai_interview_abandonment.sql` — idle-session abandonment + credit restore.
7. `20261027000000_credit_submission_fk_fix.sql` — deleting a submission detaches, never removes, its credit.
8. `20261028000000_ai_interview_surface_metrics.sql` — interview surfacing metrics.
9. `20261029000000_ai_interview_feedback.sql` — `ai_interview_feedback` (star rating).

Tables: `admins, profiles, companies, submissions, saved_experiences,
company_follows, company_requests, prep_plans, prep_items, events,
interview_credits, ai_interview_sessions, ai_interview_feedback`.

Key functions: `is_admin, moderate_submission, browse_experiences,
company_breakdown, search_submissions, public_stats, growth_metrics,
requested_companies, my_submissions, my_followed_companies,
my_new_experiences, my_reminders, start_ai_interview, record_ai_turn,
complete_ai_session, fail_ai_session, abandon_stale_sessions,
submit_ai_interview_feedback, max_free_credits, max_daily_ai_sessions,
abandon_timeout_minutes`.

For any schema change: new migration file, plus RLS tests in
`tests/db/rls.test.ts` and an upgrade test in `tests/db/upgrade.test.ts`.
Emergency SQL lives in `docs/rollback-snippets.md`.

## AI mock interview

- Env (server-only, never `NEXT_PUBLIC_`): `AI_API_KEY`, `AI_BASE_URL`,
  `AI_MODEL` (all required; starting fails clearly without calling anything if
  one is missing), `AI_INTERVIEW_MAX_QUESTIONS` (default 6, max 15). Any
  OpenAI-compatible host (OpenRouter in use; key has a hard spend cap).
- Credits: 1 per approved submission, max 3 lifetime, idempotent, permanent.
  Max 2 sessions/day. A session idle 20 min is abandoned; credit restored if
  fewer than 2 answers. Enforced on use, no cron.
- Questions: real reported questions for the company first, verbatim, no model
  call; then model-generated, labelled "Generic for this role". Difficulty is
  calibrated to the stated experience level.
- After completion: written feedback (strengths/gaps) and a star rating.
- Check `docs/manual-test-checklist-interview.md` before switching provider/model.

## Analytics and campaign

- Funnel on /admin: visitors → form_view → form_start → signin_prompted →
  signin_returned → submit_completed. `submit_started` is retired (kept only so
  old rows stay valid).
- First-touch UTM stored for 30 days and attached to later events. Use the
  tagged links in `docs/campaign-links.md` (campaign `first50`, goal 50 early
  contributors).
- Baseline before the AI interview (Oct 2026): 778 visitors, 222 form starts,
  42 signed-in users, 12 submissions (all approved), 1 returning contributor.
  Hypothesis under test: the free mock interview raises contributions and
  brings contributors back.

## Status

Done: Phase 1 (directory, submission, moderation, anonymity); open browsing
with soft nudges instead of a contribute-to-unlock gate (don't bring a gate
back unless asked); engagement (saves, follows, prep checklists, request an
experience, UTM attribution, admin source analytics); AI mock interview in four
phases (funnel, credits, interviewer, surfacing + metrics) plus feedback rating.

## Open threads

- Measure the AI interview hypothesis against the baseline above.
- Confirm every migration through `20261029000000` is applied in production
  (one-query check in `docs/rollback-snippets.md`).

## Related files outside the repo

- `~/Downloads/parkpulse-ai-interview-phased-prompt.md`,
  `~/Downloads/parkpulse-claude-code-phased-prompt.md` — the phased build briefs.
- `~/Downloads/parkpulse-film*.mp4` — launch videos (English, voiceover, Malayalam).
- `~/Downloads/parkpulse-vercel.env` — production env (secrets; never commit or paste).

## Working conventions

- Commit only when asked; push only when asked. Branch for multi-step features,
  merge to `main`, delete the branch.
- Big features run as phases: stop after each, report what changed / how to
  test / what's open, wait for go-ahead.
