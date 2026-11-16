import { json } from "@/lib/http";
export const GET = async () => json({ google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) });
