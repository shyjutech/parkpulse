# ParkPulse

Anonymous salary and interview insights for Kerala's IT ecosystem. **Phase 1**: browse → share one experience → unlock the approved database.

Stack: Next.js (App Router) · TypeScript · Tailwind · Supabase (Auth, Postgres, RLS, FTS) · Recharts.

## Setup

1. Create a Supabase project.
2. Run `supabase/migrations/20260919000000_phase1_init.sql` in the SQL editor (or `supabase db push`).
   It seeds `public.admins` with the admin email; edit that insert first if the admin should differ.
3. Authentication → Providers → enable **Google** (create OAuth credentials in Google Cloud; the authorised redirect URI is shown in Supabase).
4. Authentication → URL Configuration: set the Site URL and add `http://localhost:3000/auth/callback` and `<your-domain>/auth/callback` as redirect URLs.
5. `cp .env.example .env.local` and fill in the values. Never commit `.env.local`.
6. `npm install && npm run dev`

Deploy on Vercel with the same environment variables. `SUPABASE_SERVICE_ROLE_KEY` is not used by Phase 1 code, so leave it unset unless a later phase needs it.

## Tests

```
npm test          # unit tests + RLS/security tests
npm run typecheck
npm run lint
```

The database tests apply the real migration to an in-process Postgres (PGlite) with a stub of Supabase's `auth` schema (`tests/db/stub_supabase.sql`), so they need no Docker or credentials.

## Security model (all enforced in Postgres)

- `submissions.user_id` is not selectable by any API role, so authors are never exposed. `status` and `moderated_at` are not writable by clients.
- Approved rows are readable only when `profiles.has_contributed` is true; `search_submissions` and `company_breakdown` re-check the gate and return nothing for locked users.
- `has_contributed` / `contribution_count` are set by a trigger on submission insert; users have no UPDATE grant on them.
- Moderation goes through `moderate_submission()`, which checks `is_admin()` (JWT email in `public.admins`).
- Company aggregates are recomputed by trigger from approved submissions only.

## Phase discipline

Only Phase 1 is implemented. See the phased prompt for what comes next; don't start Phase 2 until real usage data exists.
