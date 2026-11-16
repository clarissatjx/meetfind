"use client";
import { useState } from "react";
import { api, post, type Me } from "./api";
import Paint from "./Paint";

type Tab = "apple" | "timetree" | "paint" | "ics" | null;

export default function Sources({ gid, me, google, onDone }: { gid: string; me: Me; google: boolean; onDone: () => void }) {
  const [tab, setTab] = useState<Tab>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const base = `/api/groups/${gid}/members/${me.member_id}`;

  const run = async (p: Promise<unknown>, ok = "✓ Imported.") => {
    setErr(""); setMsg("");
    try { await p; setMsg(ok); setTab(null); onDone(); } catch (e: any) { setErr(e.message); }
  };
  const uploadFile = (source: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("token", me.token); fd.append("source", source); fd.append("file", f);
    run(api(`${base}/ics`, { method: "POST", body: fd }));
  };
  const tabs: [Exclude<Tab, null>, string][] = [["apple", "Apple Calendar"], ["timetree", "TimeTree"], ["paint", "Paint busy times"], ["ics", "Other .ics"]];

  return (
    <div className="card">
      <h2>Add your calendar</h2>
      <div className="row" style={{ alignItems: "center" }}>
        <div className="fit">
          {google ? (
            <a className="btn" href={`/api/auth/google/start?gid=${gid}&mid=${me.member_id}&token=${me.token}`}>Google Calendar</a>
          ) : (
            <button disabled title="Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET">Google Calendar (not configured)</button>
          )}
        </div>
        <div className="mut">Only busy/free blocks are read — event titles are never stored.</div>
      </div>
      <div className="tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className="ghost" style={tab === k ? { background: "#e9f2ec" } : undefined} onClick={() => { setErr(""); setMsg(""); setTab(tab === k ? null : k); }}>
            {label}
          </button>
        ))}
      </div>
      {tab === "apple" && <Apple base={base} token={me.token} run={run} uploadFile={uploadFile} />}
      {tab === "timetree" && <TimeTree base={base} token={me.token} run={run} uploadFile={uploadFile} />}
      {tab === "paint" && <Paint gid={gid} me={me} run={run} />}
      {tab === "ics" && <UrlOrFile base={base} token={me.token} source="ics" run={run} uploadFile={uploadFile} />}
      {msg && <p>{msg}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}

type RunFn = (p: Promise<unknown>, ok?: string) => void;
type Upload = (s: string) => (e: React.ChangeEvent<HTMLInputElement>) => void;

function UrlOrFile({ base, token, source, run, uploadFile, hint }: { base: string; token: string; source: string; run: RunFn; uploadFile: Upload; hint?: string }) {
  const [url, setUrl] = useState("");
  return (
    <>
      <p className="mut">{hint ?? "Any iCalendar link or file (Outlook, Fastmail, Proton, …)."}</p>
      <div className="row">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="webcal:// or https:// link" />
        <button className="fit" onClick={() => run(api(`${base}/ics-url`, post({ token, url, source })))}>Import</button>
      </div>
      <div className="mut" style={{ margin: "6px 0" }}>or upload a .ics file</div>
      <input type="file" accept=".ics,text/calendar" onChange={uploadFile(source)} />
    </>
  );
}

function Apple({ base, token, run, uploadFile }: { base: string; token: string; run: RunFn; uploadFile: Upload }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <p className="mut">
        <b>Live sync (recommended).</b> Apple has no sign-in for calendars, so create an{" "}
        <a href="https://account.apple.com" target="_blank" rel="noreferrer">app-specific password</a> (Sign-In and Security → App-Specific Passwords).
        It's used once to read busy times and never stored.
      </p>
      <div className="row">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Apple Account email" autoComplete="off" />
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="xxxx-xxxx-xxxx-xxxx" autoComplete="off" />
        <button className="fit" disabled={busy} onClick={async () => {
          setBusy(true);
          await run(api(`${base}/caldav`, post({ token, email, app_password: pw })), "✓ Connected.");
          setBusy(false);
        }}>Connect</button>
      </div>
      <p className="mut" style={{ marginTop: 14 }}>
        <b>Or</b> use a public calendar link (Calendar → share → Public Calendar → copy webcal:// link):
      </p>
      <UrlOrFile base={base} token={token} source="apple" run={run} uploadFile={uploadFile} hint="" />
    </>
  );
}

function TimeTree({ base, token, run, uploadFile }: { base: string; token: string; run: RunFn; uploadFile: Upload }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const cmd = `uvx timetree-exporter -o tt.ics && curl -sS -F token=${token} -F source=timetree -F file=@tt.ics ${location.origin}${base}/ics`;
  return (
    <>
      <p className="mut">
        TimeTree has no official API, so this signs in to TimeTree's private web endpoints once, reads your event times, and discards the login.
        Your password is not stored or logged. It only works for <b>email + password</b> accounts (not Google/Apple/LINE sign-in), may break if TimeTree changes,
        and reads all calendars you're in (skipping all-day events, birthdays and memos).
      </p>
      <div className="row">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="TimeTree email" autoComplete="off" />
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="TimeTree password" autoComplete="off" />
        <button className="fit" disabled={busy} onClick={async () => {
          setBusy(true);
          await run(api(`${base}/timetree`, post({ token, email, password: pw })), "✓ Connected.");
          setBusy(false);
        }}>Connect</button>
      </div>
      <details style={{ marginTop: 14 }}>
        <summary className="mut" style={{ cursor: "pointer" }}>Prefer not to share your password? Export on your own computer instead</summary>
        <p className="mut">
          Run this locally (needs <a href="https://docs.astral.sh/uv/" target="_blank" rel="noreferrer">uv</a>). It asks for your TimeTree login on your machine; nothing reaches this server except the calendar file. Uses{" "}
          <a href="https://github.com/eoleedi/TimeTree-Exporter" target="_blank" rel="noreferrer">TimeTree-Exporter</a>.
        </p>
        <pre className="cmd">{cmd}</pre>
        <button className="ghost" onClick={() => { navigator.clipboard.writeText(cmd); setCopied(true); }}>{copied ? "Copied" : "Copy command"}</button>{" "}
        <span className="mut">or upload an exported file:</span><br /><br />
        <input type="file" accept=".ics,text/calendar" onChange={uploadFile("timetree")} />
      </details>
    </>
  );
}
