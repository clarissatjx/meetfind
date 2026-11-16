"use client";
import { Fragment, useEffect, useState } from "react";
import { api } from "./api";

type Member = { id: string; name: string; connected: boolean };
type Data = {
  members: Member[]; active: number;
  days: { date: string; dow: string; slots: { t: string; free: string[] }[] }[];
  windows: { date: string; dow: string; start: string; end: string; minutes: number }[];
};

export default function Results({ gid, meId, ver }: { gid: string; meId?: string; ver: number }) {
  const [d, setD] = useState<Data | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [minMin, setMinMin] = useState(60);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    api<Data>(`/api/groups/${gid}/availability?min_minutes=${minMin}&exclude=${[...excluded].join(",")}`).then(setD).catch(() => {});
  }, [gid, ver, minMin, excluded]);

  if (!d) return null;
  const name = Object.fromEntries(d.members.map((m) => [m.id, m.name]));
  const toggle = (id: string) => setExcluded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const times = d.days[0]?.slots.map((s) => s.t) ?? [];

  return (
    <>
      <div className="card">
        <h2>Members</h2>
        <div className="chips">
          {d.members.map((m) => (
            <span key={m.id} onClick={() => toggle(m.id)}
              className={`chip ${m.connected ? "" : "pending"} ${excluded.has(m.id) ? "off" : ""}`}
              title={m.connected ? "click to include/exclude" : "no calendar yet"}>
              {m.name}{m.id === meId ? " (you)" : ""}{m.connected ? "" : " · waiting"}
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ alignItems: "end" }}>
          <h2 style={{ flex: 2, margin: 0 }}>Everyone free</h2>
          <div>
            <label>Min duration</label>
            <select value={minMin} onChange={(e) => setMinMin(+e.target.value)}>
              {[30, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        </div>
        {d.windows.length ? d.windows.map((w, i) => (
          <div key={i} className="win">
            <span>{w.dow} {w.date} · <b>{w.start}–{w.end}</b></span><span className="mut">{w.minutes} min</span>
          </div>
        )) : (
          <p className="mut">{d.active ? "No window where everyone is free for that long. Try a shorter duration or exclude someone." : "Waiting for calendars…"}</p>
        )}
      </div>

      <div className="card">
        <h2>Heatmap <span className="mut">(darker = more people free)</span></h2>
        <div className="grid" style={{ gridTemplateColumns: `44px repeat(${d.days.length},minmax(34px,1fr))` }}>
          <div />
          {d.days.map((x) => <div key={x.date} className="hd">{x.dow}<br />{x.date.slice(5)}</div>)}
          {times.map((t, i) => (
            <Fragment key={t}>
              <div className="tl">{t.endsWith(":00") ? t : ""}</div>
              {d.days.map((x) => {
                const s = x.slots[i], n = s.free.length, tot = d.active, a = tot ? n / tot : 0;
                const bg = tot ? `rgba(47,111,79,${(0.08 + 0.92 * a ** 1.5).toFixed(2)})` : "#eee";
                const busy = d.members.filter((m) => m.connected && !excluded.has(m.id) && !s.free.includes(m.id)).map((m) => m.name).join(", ") || "—";
                const text = `${x.dow} ${x.date.slice(5)} ${s.t}\nFree (${n}/${tot}): ${s.free.map((id) => name[id]).join(", ") || "—"}\nBusy: ${busy}`;
                return <div key={x.date} className="cell" style={{ background: bg }}
                  onMouseMove={(e) => setTip({ x: Math.min(e.clientX + 12, innerWidth - 250), y: e.clientY + 12, text })}
                  onMouseLeave={() => setTip(null)} />;
              })}
            </Fragment>
          ))}
        </div>
      </div>
      {tip && <div id="tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
    </>
  );
}
