import { db } from "@/lib/db";
import { getGroup } from "@/lib/groups";
import { handle, json } from "@/lib/http";

export const GET = handle(async (_: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return json(await getGroup(await db(), id));
});
