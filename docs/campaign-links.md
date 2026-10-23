# Campaign links

Ready-to-copy links for Instagram, so visits and submissions show up under
their real source on the admin dashboard instead of as "direct". 752 of 778
visitors so far have no `utm_source`, which almost certainly means the bio
link and story/reel links weren't tagged — use these instead of the bare URL
from now on.

Swap `https://parkpulse-nine.vercel.app` for the live domain if that changes
(check `NEXT_PUBLIC_SITE_URL` in Vercel). Every link points at `/launch`,
the campaign page built for this push.

## How it works

The first `utm_source`/`utm_medium`/`utm_campaign` a visitor arrives with is
stored in a 30-day cookie (`src/lib/attribution.ts`) and attached to every
event they trigger afterward, even ones logged much later (signing in,
submitting). The admin dashboard's "By traffic source" table groups on this.

Keep `utm_campaign` the same across a single push so its numbers roll up
together; change it for the next one (`first50` → `first100`, etc.).

## Bio link

One link, used in the Instagram bio itself:

```
https://parkpulse-nine.vercel.app/launch?utm_source=instagram&utm_medium=bio&utm_campaign=first50
```

## Story (link sticker)

```
https://parkpulse-nine.vercel.app/launch?utm_source=instagram&utm_medium=story&utm_campaign=first50
```

## Reel caption / "link in bio" callout

Use this one directly if the reel's caption or comment pin carries a real
link; otherwise point people at the bio link above.

```
https://parkpulse-nine.vercel.app/launch?utm_source=instagram&utm_medium=reel&utm_campaign=first50
```

## DMs / replying to comments

For links sent one-to-one, so they're distinguishable from the broadcast
placements above:

```
https://parkpulse-nine.vercel.app/launch?utm_source=instagram&utm_medium=dm&utm_campaign=first50
```

## WhatsApp groups

```
https://parkpulse-nine.vercel.app/launch?utm_source=whatsapp&utm_medium=group&utm_campaign=first50
```

## Checking it's working

After using a tagged link, open `/admin` and look at "By traffic source"
under the funnel — a new row should appear for `instagram` (or whichever
source) with a non-zero visitor count within a few minutes.
