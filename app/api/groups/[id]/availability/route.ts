import { computeAvailability, type Member } from "@/lib/availability";
import { db } from "@/lib/db";
import { getGroup } from "@/lib/groups";
import { handle, json } from "@/lib/http";
import type { Interval } from "@/lib/types";

export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const u = new URL(req.url);
  const minMinutes = Math.max(15, Number(u.searchParams.get("min_minutes") ?? 60) || 60);
  const exclude = new Set((u.searchParams.get("exclude") ?? "").split(",").filter(Boolean));
  const p = await db();
  const g = await getGroup(p, id);
  const mr = await p.query(
    `SELECT m.id, m.name, EXISTS(SELECT 1 FROM member_sources s WHERE s.member_id=m.id) AS connected
     FROM members m WHERE m.group_id=$1 ORDER BY m.created_at`, [id]);
  const members: Member[] = mr.rows;
  const br = await p.query(
    "SELECT b.member_id, b.start_ts, b.end_ts FROM busy b JOIN members m ON m.id=b.member_id WHERE m.group_id=$1", [id]);
  const busy: Record<string, Interval[]> = {};
  for (const r of br.rows) (busy[r.member_id] ||= []).push({ start: r.start_ts, end: r.end_ts });
  return json({ group: g, members, ...computeAvailability(g, members, busy, minMinutes, exclude) });
});
