"use client";
import { useCallback, useEffect, useState } from "react";
import { api, post, type Me } from "./api";
import Sources from "./Sources";
import Results from "./Results";

type Group = { name: string; start: string; end: string; day_start: string; day_end: string; tz: string };

export default function GroupView({ gid }: { gid: string }) {
  const [group, setGroup] = useState<Group | null | false>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [cfg, setCfg] = useState({ google: false });
  const [name, setName] = useState("");
  const [ver, setVer] = useState(0);
  const [googleErr, setGoogleErr] = useState(false);

  useEffect(() => {
    try { setMe(JSON.parse(localStorage.getItem("mf_" + gid) || "null")); } catch {}
    setGoogleErr(new URLSearchParams(location.search).get("err") === "google_denied");
    api("/api/config").then(setCfg).catch(() => {});
    api<Group>("/api/groups/" + gid).then(setGroup).catch(() => setGroup(false));
  }, [gid]);

  const refresh = useCallback(() => setVer((v) => v + 1), []);

  const join = async () => {
    const n = name.trim();
    if (!n) return;
    const m = await api<Me>(`/api/groups/${gid}/join`, post({ name: n }));
    localStorage.setItem("mf_" + gid, JSON.stringify(m));
    setMe(m);
    refresh();
  };

  if (group === null) return <p className="mut">Loading…</p>;
  if (group === false) return <p>Group not found.</p>;

  return (
    <>
      <h1>{group.name}</h1>
      <div className="mut">
        {group.start} → {group.end} · {group.day_start}–{group.day_end} · {group.tz} · share this page's URL to invite people
      </div>
      {googleErr && <p className="err">Google sign-in was cancelled.</p>}
      {me ? (
        <Sources gid={gid} me={me} google={cfg.google} onDone={refresh} />
      ) : (
        <div className="card">
          <h2>Join group</h2>
          <div className="row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" onKeyDown={(e) => e.key === "Enter" && join()} />
            <button className="fit" onClick={join}>Join</button>
          </div>
        </div>
      )}
      <Results gid={gid} meId={me?.member_id} ver={ver} />
    </>
  );
}
