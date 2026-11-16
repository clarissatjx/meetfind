# meetfind — a better when2meet

Group scheduling: create group (date range + daily hours) → members join → each adds a calendar → app shows windows where everyone is free and a heatmap.

## Stack
Next.js 15 App Router + TypeScript, Postgres via `pg` (`DATABASE_URL`), deployed on Vercel. No ORM; schema is created on first request in `lib/db.ts`.
- `app/api/**/route.ts` — route handlers (Next 15: `params` is a Promise)
- `lib/ics.ts` — .ics → busy intervals (ical.js; handles TZID w/o VTIMEZONE, RRULE/EXDATE/exceptions; skips all-day, TRANSPARENT, CANCELLED). Tested in `tests/ics.test.ts`.
- `lib/availability.ts` — pure slot grid + "everyone free" windows, computed in the group's time zone (luxon)
- `lib/groups.ts` — group/member helpers, `storeBusy` (replaces one source's rows in a transaction)
- `lib/caldav.ts` (tsdav, iCloud), `lib/safeFetch.ts` (SSRF-guarded URL fetch)
- `components/*` — client UI (GroupView, Sources tabs, Paint grid, Results heatmap)

## Data model
`groups`, `members` (secret token returned on join, stored hashed, kept in browser localStorage), `member_sources` (which sources a member connected; an empty calendar still counts as connected), `busy` (member_id, source, start_ts, end_ts), `oauth_states` (nonce for Google OAuth). Only busy intervals are stored, never event titles.

## Calendar sources
- **Google**: OAuth, scope `calendar.freebusy` only; tokens not stored. Redirect `$BASE_URL/api/auth/google/callback`. UNTESTED (needs real creds).
- **Apple**: iCloud CalDAV with a user-generated app-specific password, used once, never stored. Auth-failure path tested; successful sync UNTESTED. Fallback: public webcal:// link or .ics upload.
- **TimeTree**: no official API; its sync is one-way INTO TimeTree. `lib/timetree.ts` logs in to the private web API (email+password accounts only; password used once, never stored; UNTESTED against a real account) and converts events to ICS. The UI also offers a local command that runs the unofficial `timetree-exporter` (MIT, github.com/eoleedi/TimeTree-Exporter) on the user's machine and curl-uploads the .ics, so the password never reaches the server.
- **Manual paint**: busy slots stored as source `manual`.

## Next steps
1. Deploy to Vercel + Neon; test Google and Apple end to end.
2. "Best partial overlap" ranking when nobody-all-free windows don't exist.
3. Rate limiting on join/import endpoints; group expiry/cleanup.
4. Windows TZIDs (e.g. "Singapore Standard Time") without a VTIMEZONE fall back to the group's time zone.

## Preferences
Owner (Clarissa) prefers terse answers and complete working code over walkthroughs.
