import { db } from "@/lib/db";
import { listIcloudCalendars } from "@/lib/caldav";
import { authMember, getGroup } from "@/lib/groups";
import { handle, json } from "@/lib/http";

export const maxDuration = 30;
type P = { params: Promise<{ id: string; mid: string }> };

// Lists calendars so the user can pick which to import. Credentials are used for this request only.
export const POST = handle(async (req: Request, { params }: P) => {
  const { id, mid } = await params;
  const b = await req.json().catch(() => ({}));
  const p = await db();
  await getGroup(p, id);
  await authMember(p, id, mid, String(b.token ?? ""));
  return json({ calendars: await listIcloudCalendars(String(b.email ?? "").trim(), String(b.app_password ?? "").trim()) });
});
