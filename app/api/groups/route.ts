import { DateTime, IANAZone } from "luxon";
import { HttpError, db, newId } from "@/lib/db";
import { handle, json } from "@/lib/http";

const MAX_DAYS = 60;
const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;

export const POST = handle(async (req: Request) => {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim().slice(0, 80) || "Untitled";
  const s = DateTime.fromISO(String(b.start)), e = DateTime.fromISO(String(b.end));
  if (!s.isValid || !e.isValid) throw new HttpError(400, "bad dates");
  const days = e.diff(s, "days").days;
  if (days < 0 || days >= MAX_DAYS) throw new HttpError(400, `range must be 1-${MAX_DAYS} days`);
  const slot = Number(b.slot_min ?? 30);
  if (![15, 30, 60].includes(slot)) throw new HttpError(400, "slot_min must be 15, 30 or 60");
  const tz = String(b.tz ?? "UTC");
  if (!IANAZone.isValidZone(tz)) throw new HttpError(400, "bad time zone");
  const ds = String(b.day_start ?? "09:00"), de = String(b.day_end ?? "22:00");
  if (!hhmm.test(ds) || !hhmm.test(de)) throw new HttpError(400, "bad time");
  if (ds >= de) throw new HttpError(400, "day_end must be after day_start");
  const p = await db();
  const id = newId(6);
  await p.query(
    "INSERT INTO groups(id,name,start_date,end_date,day_start,day_end,slot_min,tz) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [id, name, s.toISODate(), e.toISODate(), ds, de, slot, tz],
  );
  return json({ id });
});
