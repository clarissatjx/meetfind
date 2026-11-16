import { DateTime } from "luxon";
import type { Pool } from "pg";
import { HttpError, hashToken } from "./db";
import type { Group, Interval } from "./types";

export async function getGroup(p: Pool, id: string): Promise<Group> {
  const r = await p.query("SELECT * FROM groups WHERE id=$1", [id]);
  if (!r.rows[0]) throw new HttpError(404, "group not found");
  const g = r.rows[0];
  return { id: g.id, name: g.name, start: g.start_date, end: g.end_date, day_start: g.day_start, day_end: g.day_end, slot_min: g.slot_min, tz: g.tz };
}

export async function authMember(p: Pool, gid: string, mid: string, token: string) {
  const r = await p.query("SELECT id FROM members WHERE id=$1 AND group_id=$2 AND token_hash=$3", [mid, gid, hashToken(token || "")]);
  if (!r.rows[0]) throw new HttpError(403, "bad member token");
}

/** [start, end) of the whole group range as instants, in the group's tz. */
export function groupRange(g: Group): Interval {
  const start = DateTime.fromISO(g.start, { zone: g.tz }).startOf("day");
  const end = DateTime.fromISO(g.end, { zone: g.tz }).plus({ days: 1 }).startOf("day");
  return { start: start.toJSDate(), end: end.toJSDate() };
}

/** Every slot of the group's grid, in order. */
export function* gridSlots(g: Group): Generator<{ date: string; time: string; start: Date; end: Date }> {
  const [dsh, dsm] = g.day_start.split(":").map(Number);
  const [deh, dem] = g.day_end.split(":").map(Number);
  let d = DateTime.fromISO(g.start, { zone: g.tz });
  const last = DateTime.fromISO(g.end, { zone: g.tz });
  while (d <= last) {
    let t = d.set({ hour: dsh, minute: dsm, second: 0, millisecond: 0 });
    const endT = d.set({ hour: deh, minute: dem, second: 0, millisecond: 0 });
    while (t.plus({ minutes: g.slot_min }) <= endT) {
      const e = t.plus({ minutes: g.slot_min });
      yield { date: t.toISODate()!, time: t.toFormat("HH:mm"), start: t.toJSDate(), end: e.toJSDate() };
      t = e;
    }
    d = d.plus({ days: 1 });
  }
}

/** Replace all busy rows for (member, source). An empty list still marks the source as connected. */
export async function storeBusy(p: Pool, memberId: string, source: string, intervals: Interval[]) {
  const c = await p.connect();
  try {
    await c.query("BEGIN");
    await c.query("DELETE FROM busy WHERE member_id=$1 AND source=$2", [memberId, source]);
    await c.query(
      "INSERT INTO member_sources(member_id, source) VALUES($1,$2) ON CONFLICT (member_id, source) DO UPDATE SET synced_at=now()",
      [memberId, source],
    );
    if (intervals.length) {
      await c.query(
        "INSERT INTO busy(member_id, source, start_ts, end_ts) SELECT $1, $2, s, e FROM unnest($3::timestamptz[], $4::timestamptz[]) AS t(s, e)",
        [memberId, source, intervals.map((i) => i.start), intervals.map((i) => i.end)],
      );
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
