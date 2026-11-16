import { createDAVClient } from "tsdav";
import { HttpError } from "./db";
import { veventsFromText } from "./ics";
import type { Interval } from "./types";
import type ICAL from "ical.js";

async function icloudClient(email: string, password: string) {
  return createDAVClient({
    serverUrl: "https://caldav.icloud.com",
    credentials: { username: email, password },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
}

function mapError(e: any): never {
  const msg = String(e?.message || e);
  if (/401|403|auth|credential|forbidden|unauthori|principal/i.test(msg))
    throw new HttpError(400, "iCloud rejected the login. Use an app-specific password, not your Apple ID password.");
  throw new HttpError(400, "iCloud error: " + msg.slice(0, 120));
}

export type IcloudCalendar = { id: string; name: string };

export async function listIcloudCalendars(email: string, password: string): Promise<IcloudCalendar[]> {
  try {
    const client = await icloudClient(email, password);
    return (await client.fetchCalendars())
      .filter((c) => !c.components || c.components.includes("VEVENT"))
      .map((c) => ({ id: c.url, name: typeof c.displayName === "string" && c.displayName.trim() ? c.displayName.trim() : "(unnamed calendar)" }));
  } catch (e) {
    return mapError(e);
  }
}

/** Read VEVENTs from iCloud via CalDAV (all calendars, or only those whose url is in `urls`). The app-specific password is used for this call only. */
export async function fetchIcloudEvents(email: string, password: string, range: Interval, urls?: string[]): Promise<ICAL.Component[]> {
  try {
    const client = await icloudClient(email, password);
    const out: ICAL.Component[] = [];
    for (const calendar of await client.fetchCalendars()) {
      if (calendar.components && !calendar.components.includes("VEVENT")) continue;
      if (urls && urls.length && !urls.includes(calendar.url)) continue;
      try {
        const objs = await client.fetchCalendarObjects({
          calendar,
          timeRange: { start: range.start.toISOString(), end: range.end.toISOString() },
        });
        for (const o of objs) if (typeof o.data === "string") out.push(...veventsFromText(o.data));
      } catch {
        /* skip calendars that fail (e.g. subscribed/shared quirks) */
      }
    }
    return out;
  } catch (e) {
    return mapError(e);
  }
}
