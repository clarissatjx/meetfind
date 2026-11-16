import { describe, expect, it } from "vitest";
import { busyFromIcs } from "../lib/ics";
import { timetreeEventsToIcs } from "../lib/timetree";

const range = { start: new Date("2026-11-15T16:00:00Z"), end: new Date("2026-11-23T16:00:00Z") };
const iso = (i: { start: Date; end: Date }) => [i.start.toISOString(), i.end.toISOString()];
const ms = (s: string) => new Date(s).getTime();

describe("timetreeEventsToIcs", () => {
  it("timed event in a named zone", () => {
    const ics = timetreeEventsToIcs([{ uuid: "a", start_at: ms("2026-11-17T02:00:00Z"), end_at: ms("2026-11-17T04:00:00Z"), start_timezone: "Asia/Singapore", end_timezone: "Asia/Singapore" }]);
    expect(busyFromIcs(ics, range, "UTC").map(iso)).toEqual([["2026-11-17T02:00:00.000Z", "2026-11-17T04:00:00.000Z"]]);
  });
  it("weekly RRULE with COUNT and UTC", () => {
    const ics = timetreeEventsToIcs([{ uuid: "b", start_at: ms("2026-11-16T01:00:00Z"), end_at: ms("2026-11-16T02:00:00Z"), start_timezone: "UTC", recurrences: ["RRULE:FREQ=DAILY;COUNT=3"] }]);
    expect(busyFromIcs(ics, range, "UTC")).toHaveLength(3);
  });
  it("date-only UNTIL is converted and respected", () => {
    const ics = timetreeEventsToIcs([{ uuid: "c", start_at: ms("2026-11-16T02:00:00Z"), end_at: ms("2026-11-16T03:00:00Z"), start_timezone: "Asia/Singapore", recurrences: ["RRULE:FREQ=DAILY;UNTIL=20261118"] }]);
    expect(busyFromIcs(ics, range, "UTC")).toHaveLength(3); // 16th, 17th, 18th
  });
  it("skips all-day, birthdays, memos, zero-length", () => {
    const base = { start_at: ms("2026-11-17T02:00:00Z"), end_at: ms("2026-11-17T03:00:00Z"), start_timezone: "UTC" };
    const ics = timetreeEventsToIcs([{ ...base, all_day: true }, { ...base, type: 1 }, { ...base, category: 2 }, { ...base, end_at: base.start_at }]);
    expect(busyFromIcs(ics, range, "UTC")).toEqual([]);
  });
});
