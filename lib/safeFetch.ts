import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "./db";

function isPrivate(ip: string): boolean {
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 192 && b === 0) || a >= 224
    );
  }
  const l = ip.toLowerCase();
  return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb");
}

/** Fetch a calendar URL server-side without letting it reach private networks. */
export async function safeFetchText(raw: string): Promise<string> {
  let url = raw.trim();
  if (url.startsWith("webcal://")) url = "https://" + url.slice("webcal://".length);
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new HttpError(400, "invalid URL");
  }
  if (!["http:", "https:"].includes(u.protocol)) throw new HttpError(400, "invalid URL");
  try {
    const addrs = await lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivate(a.address))) throw new HttpError(400, "URL not allowed");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "cannot resolve host");
  }
  let res: Response;
  try {
    res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(20000) });
  } catch {
    throw new HttpError(400, "fetch failed");
  }
  if (!res.ok) throw new HttpError(400, `fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > 10_000_000) throw new HttpError(400, "calendar too large");
  return text;
}
