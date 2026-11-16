import { NextResponse } from "next/server";
import { HttpError, db } from "@/lib/db";
import { getGroup, groupRange, storeBusy } from "@/lib/groups";
import { baseUrl, handle } from "@/lib/http";

export const maxDuration = 30;

export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  const state = u.searchParams.get("state") ?? "", code = u.searchParams.get("code");
  const p = await db();
  const st = await p.query(
    "DELETE FROM oauth_states WHERE nonce=$1 AND created_at > now() - interval '1 hour' RETURNING group_id, member_id", [state]);
  if (!st.rows[0]) throw new HttpError(400, "bad or expired state");
  const { group_id: gid, member_id: mid } = st.rows[0];
  if (!code || u.searchParams.get("error")) return NextResponse.redirect(`${baseUrl(req)}/g/${gid}?err=google_denied`);
  const g = await getGroup(p, gid);
  const tr = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${baseUrl(req)}/api/auth/google/callback`, grant_type: "authorization_code",
    }),
  });
  if (!tr.ok) throw new HttpError(400, "token exchange failed");
  const { access_token } = await tr.json();
  const range = groupRange(g);
  const fb = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: range.start.toISOString(), timeMax: range.end.toISOString(), items: [{ id: "primary" }] }),
  });
  if (!fb.ok) throw new HttpError(400, "Google freebusy failed");
  const data = await fb.json();
  const busy: { start: string; end: string }[] = data.calendars?.primary?.busy ?? [];
  await storeBusy(p, mid, "google", busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) })));
  return NextResponse.redirect(`${baseUrl(req)}/g/${gid}`);
});
