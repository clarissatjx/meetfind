import { HttpError, db } from "@/lib/db";
import { authMember, getGroup, groupRange, storeBusy } from "@/lib/groups";
import { handle, json } from "@/lib/http";
import { busyFromIcs } from "@/lib/ics";

type P = { params: Promise<{ id: string; mid: string }> };

export const POST = handle(async (req: Request, { params }: P) => {
  const { id, mid } = await params;
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "file missing");
  if (file.size > 10_000_000) throw new HttpError(400, "calendar too large");
  const p = await db();
  const g = await getGroup(p, id);
  await authMember(p, id, mid, String(fd.get("token") ?? ""));
  const source = String(fd.get("source") || "ics").replace(/[^a-z0-9_-]/gi, "").slice(0, 20) || "ics";
  await storeBusy(p, mid, source, busyFromIcs(await file.text(), groupRange(g), g.tz));
  return json({ ok: true });
});
