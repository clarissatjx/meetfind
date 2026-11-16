import { db } from "@/lib/db";
import { fetchIcloudEvents } from "@/lib/caldav";
import { authMember, getGroup, groupRange, storeBusy } from "@/lib/groups";
import { handle, json } from "@/lib/http";
import { busyFromVevents } from "@/lib/ics";

export const maxDuration = 60;
type P = { params: Promise<{ id: string; mid: string }> };

export const POST = handle(async (req: Request, { params }: P) => {
  // The app-specific password is used for this request only: never stored or logged.
  const { id, mid } = await params;
  const b = await req.json().catch(() => ({}));
  const p = await db();
  const g = await getGroup(p, id);
  await authMember(p, id, mid, String(b.token ?? ""));
  const range = groupRange(g);
  const events = await fetchIcloudEvents(String(b.email ?? "").trim(), String(b.app_password ?? "").trim(), range);
  await storeBusy(p, mid, "apple", busyFromVevents(events, range, g.tz));
  return json({ ok: true });
});
