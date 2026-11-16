import { createDAVClient } from "tsdav";
import { HttpError } from "./db";
import { veventsFromText } from "./ics";
import type { Interval } from "./types";
import type ICAL from "ical.js";

/** Read VEVENTs from iCloud via CalDAV. The app-specific password is used for this call only. */
export async function fetchIcloudEvents(email: string, password: string, range: Interval): Promise<ICAL.Component[]> {
  try {
    const client = await createDAVClient({
      serverUrl: "https://caldav.icloud.com",
      credentials: { username: email, password },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });
    const calendars = await client.fetchCalendars();
    const out: ICAL.Component[] = [];
    for (const calendar of calendars) {
      if (calendar.components && !calendar.components.includes("VEVENT")) continue;
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
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/401|403|auth|credential|forbidden|unauthori|principal/i.test(msg))
      throw new HttpError(400, "iCloud rejected the login. Use an app-specific password, not your Apple ID password.");
    throw new HttpError(400, "iCloud error: " + msg.slice(0, 120));
  }
}
