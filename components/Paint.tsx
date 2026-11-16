"use client";
import { useEffect, useRef, useState } from "react";
import { api, type Me } from "./api";

type G = { start: string; end: string; day_start: string; day_end: string; slot_min: number };
const mins = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const hhmm = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;

export default function Paint({ gid, me, run }: { gid: string; me: Me; run: (p: Promise<unknown>, ok?: string) => void }) {
  const [g, setG] = useState<G | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [imp, setImp] = useState<Set<string>>(new Set());
  const mode = useRef<boolean | null>(null);
  const url = `/api/groups/${gid}/members/${me.member_id}/manual`;

  useEffect(() => {
    Promise.all([api<G>(`/api/groups/${gid}`), api<{ slots: string[]; imported: string[] }>(`${url}?token=${me.token}`)]).then(([g, m]) => {
      setG(g); setSel(new Set(m.slots)); setImp(new Set(m.imported));
    });
    const up = () => (mode.current = null);
    addEventListener("mouseup", up);
    return () => removeEventListener("mouseup", up);
  }, [gid, url, me.token]);

  if (!g) return <p className="mut">Loading…</p>;
  const days: { d: string; w: string }[] = [];
  for (let d = new Date(g.start + "T00:00"); d <= new Date(g.end + "T00:00"); d.setDate(d.getDate() + 1))
    days.push({ d: d.toLocaleDateString("en-CA"), w: d.toLocaleDateString("en", { weekday: "short" }) });
  const rows: string[] = [];
  for (let t = mins(g.day_start); t + g.slot_min <= mins(g.day_end); t += g.slot_min) rows.push(hhmm(t));

  const apply = (k: string) => setSel((s) => { const n = new Set(s); mode.current ? n.add(k) : n.delete(k); return n; });

  return (
    <>
      <p className="mut">
        Your availability: <span style={{ background: "#d9a441", padding: "0 6px", borderRadius: 3 }}>&nbsp;</span> busy from your calendar,{" "}
        <span style={{ background: "#b3261e", padding: "0 6px", borderRadius: 3 }}>&nbsp;</span> busy (painted by you),{" "}
        <span style={{ background: "#eee", padding: "0 6px", borderRadius: 3 }}>&nbsp;</span> free. Click or drag to mark more busy times, then Save.
      </p>
      <div className="grid" style={{ gridTemplateColumns: `44px repeat(${days.length},minmax(34px,1fr))`, userSelect: "none" }}>
        <div />
        {days.map((x) => <div key={x.d} className="hd">{x.w}<br />{x.d.slice(5)}</div>)}
        {rows.map((r) => (
          <FragmentRow key={r} r={r} days={days} sel={sel} imp={imp}
            down={(k) => { mode.current = !sel.has(k); apply(k); }}
            enter={(k) => { if (mode.current !== null) apply(k); }} />
        ))}
      </div>
      <p>
        <button onClick={() => run(api(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: me.token, slots: [...sel] }) }), "✓ Saved.")}>Save</button>{" "}
        <button className="ghost" onClick={() => setSel(new Set())}>Clear all</button>
      </p>
    </>
  );
}

function FragmentRow({ r, days, sel, imp, down, enter }: { r: string; days: { d: string }[]; sel: Set<string>; imp: Set<string>; down: (k: string) => void; enter: (k: string) => void }) {
  return (
    <>
      <div className="tl">{r.endsWith(":00") ? r : ""}</div>
      {days.map((x) => {
        const k = `${x.d} ${r}`;
        return <div key={k} className="cell" style={{ background: sel.has(k) ? "#b3261e" : imp.has(k) ? "#d9a441" : "#eee" }}
          onMouseDown={(e) => { e.preventDefault(); down(k); }} onMouseEnter={() => enter(k)} />;
      })}
    </>
  );
}
