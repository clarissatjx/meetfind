import { db } from "@/lib/db";
import { authMember, getGroup, gridSlots, storeBusy } from "@/lib/groups";
import { handle, json } from "@/lib/http";
import type { Interval } from "@/lib/types";

type P = { params: Promise<{ id: string; mid: string }> };

export const GET = handle(async (req: Request, { params }: P) => {
  const { id, mid } = await params;
  const p = await db();
  const g = await getGroup(p, id);
  await authMember(p, id, mid, new URL(req.url).searchParams.get("token") ?? "");
  const r = await p.query("SELECT start_ts, end_ts FROM busy WHERE member_id=$1 AND source='manual'", [mid]);
  const slots: string[] = [];
  for (const s of gridSlots(g))
    if (r.rows.some((b) => b.start_ts <= s.start && b.end_ts >= s.end)) slots.push(`${s.date} ${s.time}`);
  return json({ slots });
});

export const PUT = handle(async (req: Request, { params }: P) => {
  const { id, mid } = await params;
  const b = await req.json().catch(() => ({}));
  const p = await db();
  const g = await getGroup(p, id);
  await authMember(p, id, mid, String(b.token ?? ""));
  const want = new Set<string>(Array.isArray(b.slots) ? b.slots.map(String) : []);
  const iv: Interval[] = [];
  for (const s of gridSlots(g)) {
    if (!want.has(`${s.date} ${s.time}`)) continue;
    const last = iv[iv.length - 1];
    if (last && last.end.getTime() === s.start.getTime()) last.end = s.end;
    else iv.push({ start: s.start, end: s.end });
  }
  await storeBusy(p, mid, "manual", iv);
  return json({ ok: true });
});
