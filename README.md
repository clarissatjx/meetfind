# meetfind

A better when2meet: create a group, everyone adds a calendar, see when all are free.
Next.js (App Router) + Postgres. Calendar sources: Google (OAuth, free/busy only), Apple (iCloud CalDAV or public link), TimeTree (local export), `.ics` file/URL, or paint busy times by hand.

## Run locally
```
npm install
cp .env.example .env.local     # set DATABASE_URL
npm run dev                    # http://localhost:3000
npm test
```
Tables are created automatically on first request.

## Deploy on Vercel
1. Import this repo in Vercel.
2. Add a Postgres database (Storage tab → Neon) — this sets `DATABASE_URL`.
3. Optional Google Calendar: create an OAuth *Web* client, enable the Google Calendar API, add the redirect URI
   `https://<your-domain>/api/auth/google/callback`, then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (and `BASE_URL=https://<your-domain>` if you use a custom domain).
