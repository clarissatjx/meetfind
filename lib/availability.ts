import { DateTime } from "luxon";
import type { Group, Interval } from "./types";
import { gridSlots } from "./groups";

export type Member = { id: string; name: string; connected: boolean };
export type Slot = { t: string; free: string[] };
export type Day = { date: string; dow: string; slots: Slot[] };
export type Window = { date: string; dow: string; start: string; end: string; minutes: number };

/** Pure: slot grid + windows where every active member is free. */
export function computeAvailability(
  g: Group,
  members: Member[],
  busy: Record<string, Interval[]>,
  minMinutes: number,
  exclude: Set<string>,
) {
  const active = members.filter((m) => m.connected && !exclude.has(m.id));
  const byDate = new Map<string, Slot[]>();
  for (const s of gridSlots(g)) {
    const free = active
      .filter((m) => !(busy[m.id] || []).some((b) => b.start < s.end && b.end > s.start))
      .map((m) => m.id);
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push({ t: s.time, free });
  }
  const days: Day[] = [...byDate.entries()].map(([date, slots]) => ({
    date,
    dow: DateTime.fromISO(date).toFormat("ccc"),
    slots,
  }));

  const need = Math.max(1, Math.ceil(minMinutes / g.slot_min));
  const total = active.length;
  const windows: Window[] = [];
  for (const day of days) {
    const sl = day.slots;
    let i = 0;
    while (i < sl.length) {
      if (total && sl[i].free.length === total) {
        let j = i;
        while (j + 1 < sl.length && sl[j + 1].free.length === total) j++;
        if (j - i + 1 >= need) {
          const end = DateTime.fromISO(`${day.date}T${sl[j].t}`).plus({ minutes: g.slot_min }).toFormat("HH:mm");
          windows.push({ date: day.date, dow: day.dow, start: sl[i].t, end, minutes: (j - i + 1) * g.slot_min });
        }
        i = j + 1;
      } else i++;
    }
  }
  windows.sort((a, b) => b.minutes - a.minutes || a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  return { active: total, days, windows: windows.slice(0, 15) };
}
