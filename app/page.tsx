"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, post } from "@/components/api";

const iso = (d: Date) => d.toLocaleDateString("en-CA");

export default function Home() {
  const router = useRouter();
  const today = new Date();
  const [f, setF] = useState({
    name: "", start: iso(today), end: iso(new Date(today.getTime() + 14 * 864e5)),
    day_start: "09:00", day_end: "22:00", slot_min: 30,
    tz: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: k === "slot_min" ? +e.target.value : e.target.value });

  const go = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api<{ id: string }>("/api/groups", post(f));
      router.push("/g/" + r.id);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <>
      <h1>meetfind</h1>
      <div className="mut">Find a time everyone's actually free — from real calendars.</div>
      <div className="card">
        <h2>Create group</h2>
        <label>Group name</label>
        <input value={f.name} onChange={set("name")} placeholder="Dinner with the gang" />
        <div className="row">
          <div><label>From</label><input type="date" value={f.start} onChange={set("start")} /></div>
          <div><label>To</label><input type="date" value={f.end} onChange={set("end")} /></div>
        </div>
        <div className="row">
          <div><label>Day starts</label><input type="time" value={f.day_start} onChange={set("day_start")} /></div>
          <div><label>Day ends</label><input type="time" value={f.day_end} onChange={set("day_end")} /></div>
          <div>
            <label>Slot</label>
            <select value={f.slot_min} onChange={set("slot_min")}>
              <option value={15}>15 min</option><option value={30}>30 min</option><option value={60}>60 min</option>
            </select>
          </div>
        </div>
        <label>Time zone</label>
        <input value={f.tz} onChange={set("tz")} />
        <p>
          <button onClick={go} disabled={busy}>Create group</button> <span className="err">{err}</span>
        </p>
      </div>
    </>
  );
}
