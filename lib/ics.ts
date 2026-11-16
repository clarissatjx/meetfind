import ICAL from "ical.js";
import { DateTime, IANAZone } from "luxon";
import { HttpError } from "./db";
import type { Interval } from "./types";

/** Parse .ics text into its VEVENT components (each keeps its VCALENDAR parent, so VTIMEZONEs resolve). */
export function veventsFromText(text: string): ICAL.Component[] {
  let jcal: any;
  try {
    jcal = ICAL.parse(text);
  } catch {
    throw new HttpError(400, "not a valid .ics file");
  }
  const roots: any[] = typeof jcal[0] === "string" ? [jcal] : jcal;
  return roots.flatMap((j) => new ICAL.Component(j).getAllSubcomponents("vevent"));
}

function toMs(t: ICAL.Time, tzid: string | undefined, groupTz: string): number {
  const z: any = t.zone;
  // UTC, or a zone resolved from the file's VTIMEZONE: ical.js knows the offset.
  if (z && z.tzid !== "floating") return t.toUnixTime() * 1000;
  // Floating / unresolved TZID: read the wall clock in the named IANA zone (else the group's).
  const zone = tzid && IANAZone.isValidZone(tzid) ? tzid : groupTz;
  return DateTime.fromObject(
    { year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute, second: t.second },
    { zone },
  ).toMillis();
}

/** Busy intervals overlapping `range`. Skips all-day, TRANSPARENT and CANCELLED events; expands recurrences. */
export function busyFromVevents(vevents: ICAL.Component[], range: Interval, groupTz: string): Interval[] {
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const c of vevents) {
    const ev = new ICAL.Event(c);
    if (!ev.startDate) continue;
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid + "|" + masters.size, ev);
  }
  const byUid = new Map<string, ICAL.Event>();
  for (const [k, m] of masters) byUid.set(m.uid, m);
  const orphans: ICAL.Event[] = [];
  for (const ex of exceptions) {
    const m = byUid.get(ex.uid);
    if (m) m.relateException(ex);
    else orphans.push(ex);
  }

  const out: Interval[] = [];
  const emit = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    if (start.isDate) return;
    const transp = String(item.component.getFirstPropertyValue("transp") ?? "OPAQUE").toUpperCase();
    const status = String(item.component.getFirstPropertyValue("status") ?? "").toUpperCase();
    if (transp === "TRANSPARENT" || status === "CANCELLED") return;
    const tzid = item.component.getFirstProperty("dtstart")?.getParameter("tzid") as string | undefined;
    const s = toMs(start, tzid, groupTz);
    const e = toMs(end, tzid, groupTz);
    if (e > s && s < range.end.getTime() && e > range.start.getTime()) out.push({ start: new Date(s), end: new Date(e) });
  };

  for (const m of masters.values()) {
    if (!m.isRecurring()) {
      emit(m, m.startDate, m.endDate);
      continue;
    }
    const it = m.iterator();
    const tzid = m.component.getFirstProperty("dtstart")?.getParameter("tzid") as string | undefined;
    for (let guard = 0; guard < 20000; guard++) {
      const next = it.next();
      if (!next) break;
      const d = m.getOccurrenceDetails(next);
      if (toMs(d.startDate, tzid, groupTz) >= range.end.getTime()) break;
      emit(d.item, d.startDate, d.endDate);
    }
  }
  for (const o of orphans) emit(o, o.startDate, o.endDate);
  return out;
}

export function busyFromIcs(text: string, range: Interval, groupTz: string): Interval[] {
  return busyFromVevents(veventsFromText(text), range, groupTz);
}
