import { db } from "@/lib/db";
import { authMember, getGroup, groupRange, storeBusy } from "@/lib/groups";
import { handle, json } from "@/lib/http";
import { busyFromIcs } from "@/lib/ics";
import { fetchTimetreeEvents, timetreeEventsToIcs } from "@/lib/timetree";

export const maxDuration = 60;
type P = { params: Promise<{ id: string; mid: string }> };

export const POST = handle(async (req: Request, { params }: P) => {
  // The TimeTree password is used for this request only: never stored or logged.
  const { id, mid } = await params;
  const b = await req.json().catch(() => ({}));
  const p = await db();
  const g = await getGroup(p, id);
  await authMember(p, id, mid, String(b.token ?? ""));
  const events = await fetchTimetreeEvents(String(b.email ?? "").trim(), String(b.password ?? ""));
  await storeBusy(p, mid, "timetree", busyFromIcs(timetreeEventsToIcs(events), groupRange(g), g.tz));
  return json({ ok: true, events: events.length });
});
