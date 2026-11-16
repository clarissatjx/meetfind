# meetfind — a better when2meet

Group scheduling: create group (date range + daily hours) → members join → each adds a calendar → app shows windows where everyone is free and a heatmap.

## Stack
FastAPI + SQLite (stdlib) in `app.py`; single-page vanilla JS front end in `static/index.html`.
Run: `pip install -r requirements.txt && uvicorn app:app --reload` (env: `DB_PATH`, `BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

## Data model
`groups`, `members` (id + secret token returned on join, kept in browser localStorage), `busy` (member_id, source, start, end — UTC ISO).
Only busy intervals are stored, never event titles. Each source writes a marker row `_<source>` so a member with an empty calendar still counts as "connected". Re-importing a source replaces its rows. Availability is computed server-side in the group's time zone (`/api/groups/{id}/availability`).

## Calendar sources
- **Google**: OAuth, scope `calendar.freebusy` only; tokens not stored. Needs OAuth web client, redirect `$BASE_URL/auth/google/callback`. UNTESTED (needs real creds).
- **Apple**: iCloud CalDAV (`caldav` lib) with a user-generated app-specific password, used once, never stored. Auth-failure path tested; a successful sync is UNTESTED. Fallback: public webcal:// link or .ics upload.
- **TimeTree**: no official API and its sync is one-way INTO TimeTree. UI shows a command running the unofficial `timetree-exporter` (MIT, https://github.com/eoleedi/TimeTree-Exporter) on the user's own machine and curl-uploading the .ics, so the TimeTree password never reaches the server.
- **Manual paint**: user paints busy slots; stored as source `manual`.
- **.ics** import skips all-day, TRANSPARENT and cancelled events; recurrences expanded via recurring_ical_events. URL fetch blocks non-global IPs (SSRF guard).

## Next steps
1. Dockerfile + Render/Fly config for a public deploy; test Google and Apple end to end.
2. "Best partial overlap" ranking when nobody-all-free windows don't exist.
3. Optional interactive artifact demo (no Google/CalDAV).
4. Tests (pytest) for parse_ics, availability, manual paint.

## Preferences
Owner (Clarissa) prefers terse answers and complete working code over walkthroughs.
