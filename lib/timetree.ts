import { randomUUID } from "node:crypto";
import { DateTime, IANAZone } from "luxon";
import { HttpError } from "./db";

/**
 * Unofficial TimeTree web API (same private endpoints the TimeTree web app and
 * github.com/eoleedi/TimeTree-Exporter use). May change or break without notice.
 * Credentials are used for this call only and are never stored or logged.
 */
const BASE = "https://timetreeapp.com/api/v1";
const HEADERS = { "Content-Type": "application/json", "X-Timetreea": "web/2.1.0/en" };

export type TTEvent = {
  uuid?: string;
  start_at: number;
  end_at: number;
  start_timezone?: string;
  end_timezone?: string;
  all_day?: boolean;
  recurrences?: string[] | null;
  type?: number; // 0 normal, 1 birthday
  category?: number; // 1 normal, 2 memo
};

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/email/signin`, {
    method: "PUT",
    headers: HEADERS,
    body: JSON.stringify({ uid: email, password, uuid: randomUUID().replace(/-/g, "") }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => {
    throw new HttpError(400, "Could not reach TimeTree");
  });
  if (res.status !== 200) {
    const code = (await res.json().catch(() => null))?.error?.code;
    if (code === -702) throw new HttpError(400, "Wrong TimeTree email or password (accounts created with Google/Apple/LINE sign-in have no password and can't be used here).");
    if (code === -495) throw new HttpError(429, "TimeTree is rate-limiting logins. Try again later.");
    throw new HttpError(400, "TimeTree login failed");
  }
  const cookies: string[] = (res.headers as any).getSetCookie?.() ?? [];
  const m = cookies.map((c) => /(?:^|\s)_session_id=([^;]+)/.exec(c)).find(Boolean);
  if (!m) throw new HttpError(400, "TimeTree login failed (no session)");
  return m[1];
}

async function get(session: string, path: string): Promise<any> {
  const res = await fetch(BASE + path, {
    headers: { ...HEADERS, Cookie: `_session_id=${session}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let why = "";
    try { const j = JSON.parse(body); why = ` code=${j?.error?.code ?? ""} ${j?.error?.message ?? j?.message ?? ""}`.trimEnd(); } catch { why = " " + body.slice(0, 120); }
    console.warn(`[timetree] GET ${path.replace(/\d{4,}/g, "N")} -> ${res.status}${why}`);
    throw new HttpError(400, `TimeTree request failed: ${path.split("?")[0].replace(/\d{4,}/g, "N")} returned ${res.status}${why}`);
  }
  return res.json();
}

export type TTCalendar = { id: number; name: string };

async function listCalendars(session: string): Promise<TTCalendar[]> {
  const cals: any[] = (await get(session, "/calendars?since=0")).calendars ?? [];
  return cals.map((c) => ({ id: c.id, name: String(c.name || "").trim() || "(unnamed calendar)" }));
}

export async function listTimetreeCalendars(email: string, password: string): Promise<TTCalendar[]> {
  return listCalendars(await login(email, password));
}

/** Events from the chosen calendars (all if `ids` is empty/undefined). Calendars that fail to sync are skipped. */
export async function fetchTimetreeEvents(
  email: string,
  password: string,
  ids?: number[],
): Promise<{ events: TTEvent[]; skipped: number; total: number }> {
  const session = await login(email, password);
  let cals = await listCalendars(session);
  if (ids && ids.length) cals = cals.filter((c) => ids.includes(c.id));
  const events: TTEvent[] = [];
  let skipped = 0;
  let lastErr: unknown;
  for (const c of cals) {
    try {
      const got: TTEvent[] = [];
      let since: number | null = null;
      for (let page = 0; page < 50; page++) {
        const r: any = await get(session, `/calendar/${c.id}/events/sync` + (since === null ? "" : `?since=${since}`));
        got.push(...(r.events ?? []));
        if (r.chunk !== true) break;
        since = r.since;
      }
      events.push(...got);
    } catch (e) {
      // Some calendars (e.g. old/inactive ones) answer -425 on sync; skip them and keep the rest.
      skipped++;
      lastErr = e;
    }
  }
  if (cals.length > 0 && skipped === cals.length) throw lastErr;
  return { events, skipped, total: cals.length };
}

const fmtLocal = (ms: number, zone: string) => DateTime.fromMillis(ms, { zone }).toFormat("yyyyLLdd'T'HHmmss");
const fmtUtc = (ms: number) => DateTime.fromMillis(ms, { zone: "utc" }).toFormat("yyyyLLdd'T'HHmmss'Z'");

/** Convert TimeTree events to iCalendar text so the normal .ics pipeline (recurrence expansion etc.) can be reused. */
export function timetreeEventsToIcs(events: TTEvent[]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//meetfind//timetree//EN"];
  events.forEach((e, i) => {
    if (e.all_day || e.type === 1 || e.category === 2) return; // all-day, birthdays, memos don't block
    if (typeof e.start_at !== "number" || typeof e.end_at !== "number" || e.end_at <= e.start_at) return;
    const sz = e.start_timezone && IANAZone.isValidZone(e.start_timezone) ? e.start_timezone : "UTC";
    const ez = e.end_timezone && IANAZone.isValidZone(e.end_timezone) ? e.end_timezone : sz;
    const dt = (ms: number, z: string) => (z === "UTC" ? `:${fmtUtc(ms)}` : `;TZID=${z}:${fmtLocal(ms, z)}`);
    lines.push("BEGIN:VEVENT", `UID:${(e.uuid ?? "ev" + i).replace(/[^\w-]/g, "")}`, `DTSTART${dt(e.start_at, sz)}`, `DTEND${dt(e.end_at, ez)}`);
    for (const r of e.recurrences ?? []) {
      let line = String(r).trim();
      if (!line) continue;
      // date-only UNTIL with a timed DTSTART: use end of that local day, in UTC
      line = line.replace(/UNTIL=(\d{4})(\d{2})(\d{2})(?![\dT])/i, (_m, y, mo, d) =>
        "UNTIL=" + DateTime.fromObject({ year: +y, month: +mo, day: +d, hour: 23, minute: 59, second: 59 }, { zone: sz }).toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'"));
      if (/^(RRULE|EXDATE|RDATE)[:;]/i.test(line)) lines.push(line);
    }
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
