# ParkPulse

Anonymous salary and interview insights for Kerala's IT ecosystem. **Phase 1**: browse → share one experience → unlock the approved database.

Browsing is open to everyone. Signing in (Google) is needed only to contribute, save, follow and keep a preparation checklist.

Stack: Next.js (App Router) · TypeScript · Tailwind · Supabase (Auth, Postgres, RLS, FTS) · Recharts.

## Setup

1. Create a Supabase project.
2. Run the files in `supabase/migrations/` **in order** in the SQL editor (or `supabase db push`):
   `20260919000000_phase1_init.sql`, then `20260921000000_open_browse_engagement.sql`.
   The first seeds `public.admins` with the admin email; edit that insert first if the admin should differ.
   The second is additive and keeps existing rows.
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
- Approved reports are readable by everyone (`browse_experiences`, `company_breakdown`, direct selects). Pending and rejected rows are visible only to their author and the admin.
- Saved reports, follows, checklists and demand requests are per-user (RLS) and never public. Demand requests have no direct table access; admins read them through `requested_companies()`.
- Moderation goes through `moderate_submission()`, which checks `is_admin()` (JWT email in `public.admins`).
- Company aggregates are recomputed by trigger from approved submissions only.
- Analytics events store only names, a visitor id, an optional company id and UTM tags, never report content. Browsers may log page-level events only; outcome events come from server actions.

## Instagram campaign

Share `/launch` with UTM tags, e.g. `/launch?utm_source=instagram&utm_medium=bio&utm_campaign=first50`. The first-touch UTM is stored in a 30-day cookie and attached to later events; the admin page shows visitors and submissions by source.

## Phase discipline

Phase 1 plus the open-browse / engagement improvements are implemented. AI features are deliberately deferred.
