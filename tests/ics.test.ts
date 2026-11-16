import { describe, expect, it } from "vitest";
import { busyFromIcs } from "../lib/ics";

const range = { start: new Date("2026-11-15T16:00:00Z"), end: new Date("2026-11-23T16:00:00Z") }; // 16-22 Nov SGT
const wrap = (b: string) => `BEGIN:VCALENDAR\nVERSION:2.0\n${b}END:VCALENDAR\n`;
const iso = (i: { start: Date; end: Date }) => [i.start.toISOString(), i.end.toISOString()];

describe("busyFromIcs", () => {
  it("TZID without VTIMEZONE + RRULE", () => {
    const r = busyFromIcs(wrap(`BEGIN:VEVENT\nUID:1\nDTSTART;TZID=Asia/Singapore:20261116T100000\nDTEND;TZID=Asia/Singapore:20261116T120000\nRRULE:FREQ=DAILY;COUNT=2\nEND:VEVENT\n`), range, "UTC");
    expect(r.map(iso)).toEqual([
      ["2026-11-16T02:00:00.000Z", "2026-11-16T04:00:00.000Z"],
      ["2026-11-17T02:00:00.000Z", "2026-11-17T04:00:00.000Z"],
    ]);
  });
  it("UTC times", () => {
    const r = busyFromIcs(wrap(`BEGIN:VEVENT\nUID:2\nDTSTART:20261118T010000Z\nDTEND:20261118T020000Z\nEND:VEVENT\n`), range, "Asia/Singapore");
    expect(r.map(iso)).toEqual([["2026-11-18T01:00:00.000Z", "2026-11-18T02:00:00.000Z"]]);
  });
  it("floating uses group tz", () => {
    const r = busyFromIcs(wrap(`BEGIN:VEVENT\nUID:3\nDTSTART:20261118T090000\nDTEND:20261118T100000\nEND:VEVENT\n`), range, "Asia/Singapore");
    expect(r.map(iso)).toEqual([["2026-11-18T01:00:00.000Z", "2026-11-18T02:00:00.000Z"]]);
  });
  it("skips all-day, transparent, cancelled", () => {
    const r = busyFromIcs(wrap(
      `BEGIN:VEVENT\nUID:a\nDTSTART;VALUE=DATE:20261118\nDTEND;VALUE=DATE:20261119\nEND:VEVENT\n` +
      `BEGIN:VEVENT\nUID:b\nDTSTART:20261118T010000Z\nDTEND:20261118T020000Z\nTRANSP:TRANSPARENT\nEND:VEVENT\n` +
      `BEGIN:VEVENT\nUID:c\nDTSTART:20261118T010000Z\nDTEND:20261118T020000Z\nSTATUS:CANCELLED\nEND:VEVENT\n`), range, "UTC");
    expect(r).toEqual([]);
  });
  it("embedded VTIMEZONE", () => {
    const vtz = `BEGIN:VTIMEZONE\nTZID:Custom/Zone\nBEGIN:STANDARD\nDTSTART:19700101T000000\nTZOFFSETFROM:+0800\nTZOFFSETTO:+0800\nEND:STANDARD\nEND:VTIMEZONE\n`;
    const r = busyFromIcs(wrap(vtz + `BEGIN:VEVENT\nUID:d\nDTSTART;TZID=Custom/Zone:20261118T090000\nDTEND;TZID=Custom/Zone:20261118T100000\nEND:VEVENT\n`), range, "UTC");
    expect(r.map(iso)).toEqual([["2026-11-18T01:00:00.000Z", "2026-11-18T02:00:00.000Z"]]);
  });
  it("recurrence exception (moved occurrence) and EXDATE", () => {
    const r = busyFromIcs(wrap(
      `BEGIN:VEVENT\nUID:e\nDTSTART:20261116T010000Z\nDTEND:20261116T020000Z\nRRULE:FREQ=DAILY;COUNT=4\nEXDATE:20261117T010000Z\nEND:VEVENT\n` +
      `BEGIN:VEVENT\nUID:e\nRECURRENCE-ID:20261118T010000Z\nDTSTART:20261118T050000Z\nDTEND:20261118T060000Z\nEND:VEVENT\n`), range, "UTC");
    expect(r.map(iso)).toEqual([
      ["2026-11-16T01:00:00.000Z", "2026-11-16T02:00:00.000Z"],
      ["2026-11-18T05:00:00.000Z", "2026-11-18T06:00:00.000Z"],
      ["2026-11-19T01:00:00.000Z", "2026-11-19T02:00:00.000Z"],
    ]);
  });
  it("rejects garbage", () => {
    expect(() => busyFromIcs("nope", range, "UTC")).toThrow();
  });
});
