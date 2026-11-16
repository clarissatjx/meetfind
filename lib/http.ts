import { NextResponse } from "next/server";
import { HttpError } from "./db";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

export function handle<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A): Promise<Response> => {
    try {
      return await fn(...a);
    } catch (e: any) {
      if (e instanceof HttpError) {
        console.warn(`[http ${e.status}] ${e.message}`);
        return json({ detail: e.message }, e.status);
      }
      console.error(e);
      return json({ detail: "server error" }, 500);
    }
  };
}

export const baseUrl = (req: Request) => (process.env.BASE_URL || new URL(req.url).origin).replace(/\/$/, "");
