import { HttpError, db, hashToken, newId } from "@/lib/db";
import { getGroup } from "@/lib/groups";
import { handle, json } from "@/lib/http";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const p = await db();
  await getGroup(p, id);
  const count = await p.query("SELECT count(*)::int AS n FROM members WHERE group_id=$1", [id]);
  if (count.rows[0].n >= 50) throw new HttpError(400, "group is full");
  const mid = newId(6), token = newId(16);
  await p.query("INSERT INTO members(id,group_id,name,token_hash) VALUES($1,$2,$3,$4)", [
    mid, id, String(b.name ?? "").trim().slice(0, 40) || "Anon", hashToken(token),
  ]);
  return json({ member_id: mid, token });
});
