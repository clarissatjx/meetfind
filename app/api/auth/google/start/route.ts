import { NextResponse } from "next/server";
import { HttpError, db, newId } from "@/lib/db";
import { authMember } from "@/lib/groups";
import { baseUrl, handle } from "@/lib/http";

export const GET = handle(async (req: Request) => {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id || !process.env.GOOGLE_CLIENT_SECRET) throw new HttpError(501, "Google not configured (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)");
  const u = new URL(req.url);
  const gid = u.searchParams.get("gid") ?? "", mid = u.searchParams.get("mid") ?? "";
  const p = await db();
  await authMember(p, gid, mid, u.searchParams.get("token") ?? "");
  const nonce = newId(24);
  await p.query("DELETE FROM oauth_states WHERE created_at < now() - interval '1 hour'");
  await p.query("INSERT INTO oauth_states(nonce, group_id, member_id) VALUES($1,$2,$3)", [nonce, gid, mid]);
  const q = new URLSearchParams({
    client_id: id,
    redirect_uri: `${baseUrl(req)}/api/auth/google/callback`,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.freebusy",
    prompt: "select_account",
    state: nonce,
  });
  return NextResponse.redirect("https://accounts.google.com/o/oauth2/v2/auth?" + q);
});
