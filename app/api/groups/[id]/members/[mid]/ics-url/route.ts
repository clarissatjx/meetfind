import { db } from "@/lib/db";
import { authMember, getGroup, groupRange, storeBusy } from "@/lib/groups";
import { handle, json } from "@/lib/http";
import { busyFromIcs } from "@/lib/ics";
import { safeFetchText } from "@/lib/safeFetch";

type P = { params: Promise<{ id: string; mid: string }> };

export const POST = handle(async (req: Request, { params }: P) => {
  const { id, mid } = await params;
  const b = await req.json().catch(() => ({}));
  const p = await db();
  const g = await getGroup(p, id);
  await authMember(p, id, mid, String(b.token ?? ""));
  const source = String(b.source || "ics").replace(/[^a-z0-9_-]/gi, "").slice(0, 20) || "ics";
  const text = await safeFetchText(String(b.url ?? ""));
  await storeBusy(p, mid, source, busyFromIcs(text, groupRange(g), g.tz));
  return json({ ok: true });
});
