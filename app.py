import ipaddress
import os
import secrets
import socket
import sqlite3
import urllib.parse
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
import recurring_ical_events
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from icalendar import Calendar
from pydantic import BaseModel

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8000").rstrip("/")
G_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
G_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
DB_PATH = os.environ.get("DB_PATH", "meetfind.db")
MAX_DAYS = 60

app = FastAPI()


def db():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c


with db() as c:
    c.executescript(
        """
        CREATE TABLE IF NOT EXISTS groups(
            id TEXT PRIMARY KEY, name TEXT, start TEXT, end TEXT,
            day_start TEXT, day_end TEXT, slot_min INTEGER, tz TEXT);
        CREATE TABLE IF NOT EXISTS members(
            id TEXT PRIMARY KEY, group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
            name TEXT, token TEXT);
        CREATE TABLE IF NOT EXISTS busy(
            member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
            source TEXT, start TEXT, end TEXT);
        CREATE INDEX IF NOT EXISTS busy_m ON busy(member_id);
        """
    )


# ---------- models ----------
class GroupIn(BaseModel):
    name: str
    start: date
    end: date
    day_start: str = "09:00"
    day_end: str = "22:00"
    slot_min: int = 30
    tz: str = "Asia/Singapore"


class JoinIn(BaseModel):
    name: str


class CaldavIn(BaseModel):
    token: str
    email: str
    app_password: str


class ManualIn(BaseModel):
    token: str
    slots: list[str]  # "YYYY-MM-DD HH:MM" slot starts (group tz)


class UrlIn(BaseModel):
    token: str
    url: str
    source: str = "ics"


# ---------- helpers ----------
def get_group(c, gid):
    g = c.execute("SELECT * FROM groups WHERE id=?", (gid,)).fetchone()
    if not g:
        raise HTTPException(404, "group not found")
    return g


def auth_member(c, gid, mid, token):
    m = c.execute(
        "SELECT * FROM members WHERE id=? AND group_id=? AND token=?", (mid, gid, token)
    ).fetchone()
    if not m:
        raise HTTPException(403, "bad member token")
    return m


def group_range(g):
    tz = ZoneInfo(g["tz"])
    s = datetime.combine(date.fromisoformat(g["start"]), time.min, tz)
    e = datetime.combine(date.fromisoformat(g["end"]) + timedelta(days=1), time.min, tz)
    return s, e


def store_busy(c, member_id, source, intervals):
    c.execute("DELETE FROM busy WHERE member_id=? AND source IN (?,?)", (member_id, source, "_" + source))
    c.execute("INSERT INTO busy VALUES(?,?,?,?)", (member_id, "_" + source, "", ""))
    c.executemany(
        "INSERT INTO busy VALUES(?,?,?,?)",
        [(member_id, source, s.astimezone(timezone.utc).isoformat(),
          e.astimezone(timezone.utc).isoformat()) for s, e in intervals],
    )


def parse_ics(data, g):
    tz = ZoneInfo(g["tz"])
    start, end = group_range(g)
    if isinstance(data, Calendar):
        cal = data
    else:
        try:
            cal = Calendar.from_ical(data)
        except Exception:
            raise HTTPException(400, "not a valid .ics file")
    out = []
    for ev in recurring_ical_events.of(cal).between(start, end):
        if str(ev.get("TRANSP", "OPAQUE")).upper() == "TRANSPARENT":
            continue
        if str(ev.get("STATUS", "")).upper() == "CANCELLED":
            continue
        ds = ev.get("DTSTART")
        if ds is None:
            continue
        s = ds.dt
        if not isinstance(s, datetime):  # all-day events don't block
            continue
        de = ev.get("DTEND")
        if de is not None and isinstance(de.dt, datetime):
            e = de.dt
        elif ev.get("DURATION") is not None:
            e = s + ev["DURATION"].dt
        else:
            e = s
        if s.tzinfo is None:
            s = s.replace(tzinfo=tz)
        if e.tzinfo is None:
            e = e.replace(tzinfo=tz)
        if e > s:
            out.append((s, e))
    return out


def safe_fetch(url: str) -> bytes:
    url = url.strip()
    if url.startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]
    p = urllib.parse.urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise HTTPException(400, "invalid URL")
    try:
        for info in socket.getaddrinfo(p.hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            if not ip.is_global:
                raise HTTPException(400, "URL not allowed")
    except socket.gaierror:
        raise HTTPException(400, "cannot resolve host")
    try:
        r = httpx.get(url, timeout=20, follow_redirects=False)
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(400, f"fetch failed: {e}")
    if len(r.content) > 10_000_000:
        raise HTTPException(400, "calendar too large")
    return r.content


# ---------- groups ----------
@app.post("/api/groups")
def create_group(b: GroupIn):
    if b.end < b.start or (b.end - b.start).days >= MAX_DAYS:
        raise HTTPException(400, f"range must be 1-{MAX_DAYS} days")
    if b.slot_min not in (15, 30, 60):
        raise HTTPException(400, "slot_min must be 15, 30 or 60")
    try:
        ZoneInfo(b.tz)
        time.fromisoformat(b.day_start)
        time.fromisoformat(b.day_end)
    except Exception:
        raise HTTPException(400, "bad tz or time")
    if b.day_start >= b.day_end:
        raise HTTPException(400, "day_end must be after day_start")
    gid = secrets.token_urlsafe(6)
    with db() as c:
        c.execute(
            "INSERT INTO groups VALUES(?,?,?,?,?,?,?,?)",
            (gid, b.name.strip() or "Untitled", b.start.isoformat(), b.end.isoformat(),
             b.day_start, b.day_end, b.slot_min, b.tz),
        )
    return {"id": gid}


@app.post("/api/groups/{gid}/join")
def join(gid: str, b: JoinIn):
    with db() as c:
        get_group(c, gid)
        mid, tok = secrets.token_urlsafe(6), secrets.token_urlsafe(16)
        c.execute("INSERT INTO members VALUES(?,?,?,?)", (mid, gid, b.name.strip()[:40] or "Anon", tok))
    return {"member_id": mid, "token": tok}


@app.post("/api/groups/{gid}/members/{mid}/ics")
async def upload_ics(gid: str, mid: str, token: str = Form(...), source: str = Form("ics"),
                     file: UploadFile = File(...)):
    with db() as c:
        g = get_group(c, gid)
        auth_member(c, gid, mid, token)
        data = await file.read()
        store_busy(c, mid, source, parse_ics(data, g))
    return {"ok": True}


@app.post("/api/groups/{gid}/members/{mid}/ics-url")
def ics_url(gid: str, mid: str, b: UrlIn):
    with db() as c:
        g = get_group(c, gid)
        auth_member(c, gid, mid, b.token)
        store_busy(c, mid, b.source, parse_ics(safe_fetch(b.url), g))
    return {"ok": True}


@app.delete("/api/groups/{gid}/members/{mid}")
def leave(gid: str, mid: str, token: str):
    with db() as c:
        auth_member(c, gid, mid, token)
        c.execute("DELETE FROM members WHERE id=?", (mid,))
    return {"ok": True}



# ---------- apple (iCloud CalDAV) ----------
def fetch_icloud(email: str, password: str, g) -> Calendar:
    import caldav
    start, end = group_range(g)
    merged = Calendar()
    merged.add("prodid", "-//meetfind//")
    merged.add("version", "2.0")
    try:
        with caldav.DAVClient(url="https://caldav.icloud.com/", username=email, password=password) as client:
            for cal in client.principal().calendars():
                try:
                    objs = cal.search(start=start, end=end, event=True)
                except Exception:
                    continue  # reminders lists, etc.
                for o in objs:
                    for comp in Calendar.from_ical(o.data).walk("VEVENT"):
                        merged.add_component(comp)
    except HTTPException:
        raise
    except Exception as e:
        name = type(e).__name__
        if "Authorization" in name or "401" in str(e):
            raise HTTPException(400, "iCloud rejected the login. Use an app-specific password, not your Apple ID password.")
        raise HTTPException(400, f"iCloud error: {name}")
    return merged


@app.post("/api/groups/{gid}/members/{mid}/caldav")
def caldav_import(gid: str, mid: str, b: CaldavIn):
    # password is used once for this request and never stored or logged
    with db() as c:
        g = get_group(c, gid)
        auth_member(c, gid, mid, b.token)
    cal = fetch_icloud(b.email.strip(), b.app_password.strip(), g)
    with db() as c:
        store_busy(c, mid, "apple", parse_ics(cal, g))
    return {"ok": True}


# ---------- manual paint ----------
def grid_slots(g):
    tz = ZoneInfo(g["tz"])
    step = timedelta(minutes=g["slot_min"])
    ds, de = time.fromisoformat(g["day_start"]), time.fromisoformat(g["day_end"])
    d, last = date.fromisoformat(g["start"]), date.fromisoformat(g["end"])
    while d <= last:
        t, end_t = datetime.combine(d, ds, tz), datetime.combine(d, de, tz)
        while t + step <= end_t:
            yield t, t + step
            t += step
        d += timedelta(days=1)


@app.get("/api/groups/{gid}/members/{mid}/manual")
def manual_get(gid: str, mid: str, token: str):
    with db() as c:
        g = get_group(c, gid)
        auth_member(c, gid, mid, token)
        iv = [(datetime.fromisoformat(r["start"]), datetime.fromisoformat(r["end"]))
              for r in c.execute("SELECT start,end FROM busy WHERE member_id=? AND source='manual'", (mid,))]
    out = [s.strftime("%Y-%m-%d %H:%M") for s, e in grid_slots(g) if any(bs <= s and be >= e for bs, be in iv)]
    return {"slots": out}


@app.put("/api/groups/{gid}/members/{mid}/manual")
def manual_put(gid: str, mid: str, b: ManualIn):
    with db() as c:
        g = get_group(c, gid)
        auth_member(c, gid, mid, b.token)
        want = set(b.slots)
        step = timedelta(minutes=g["slot_min"])
        iv = []
        for s, e in grid_slots(g):
            if s.strftime("%Y-%m-%d %H:%M") in want:
                if iv and iv[-1][1] == s:
                    iv[-1] = (iv[-1][0], e)
                else:
                    iv.append((s, e))
        store_busy(c, mid, "manual", iv)
    return {"ok": True}

# ---------- google ----------
@app.get("/api/config")
def config():
    return {"google": bool(G_ID and G_SECRET)}


@app.get("/auth/google/start")
def g_start(gid: str, mid: str, token: str):
    if not (G_ID and G_SECRET):
        raise HTTPException(501, "Google not configured (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)")
    with db() as c:
        auth_member(c, gid, mid, token)
    q = urllib.parse.urlencode({
        "client_id": G_ID, "redirect_uri": f"{BASE_URL}/auth/google/callback",
        "response_type": "code", "scope": "https://www.googleapis.com/auth/calendar.freebusy",
        "prompt": "select_account", "state": f"{gid}.{mid}.{token}",
    })
    return RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth?" + q)


@app.get("/auth/google/callback")
def g_callback(code: str = "", state: str = "", error: str = ""):
    try:
        gid, mid, token = state.split(".", 2)
    except ValueError:
        raise HTTPException(400, "bad state")
    if error or not code:
        return RedirectResponse(f"/g/{gid}?err=google_denied")
    with db() as c:
        g = get_group(c, gid)
        auth_member(c, gid, mid, token)
        tr = httpx.post("https://oauth2.googleapis.com/token", data={
            "code": code, "client_id": G_ID, "client_secret": G_SECRET,
            "redirect_uri": f"{BASE_URL}/auth/google/callback", "grant_type": "authorization_code"})
        if tr.status_code != 200:
            raise HTTPException(400, "token exchange failed")
        at = tr.json()["access_token"]
        s, e = group_range(g)
        fb = httpx.post("https://www.googleapis.com/calendar/v3/freeBusy",
                        headers={"Authorization": f"Bearer {at}"},
                        json={"timeMin": s.isoformat(), "timeMax": e.isoformat(),
                              "items": [{"id": "primary"}]})
        if fb.status_code != 200:
            raise HTTPException(400, f"freebusy failed: {fb.text}")
        busy = fb.json()["calendars"]["primary"].get("busy", [])
        iv = [(datetime.fromisoformat(b["start"].replace("Z", "+00:00")),
               datetime.fromisoformat(b["end"].replace("Z", "+00:00"))) for b in busy]
        store_busy(c, mid, "google", iv)
    return RedirectResponse(f"/g/{gid}")


# ---------- availability ----------
@app.get("/api/groups/{gid}/availability")
def availability(gid: str, min_minutes: int = 60, exclude: str = ""):
    """exclude: comma-separated member ids to ignore."""
    skip = set(filter(None, exclude.split(",")))
    with db() as c:
        g = get_group(c, gid)
        members = [dict(m) for m in c.execute("SELECT id,name FROM members WHERE group_id=?", (gid,))]
        connected = {r[0] for r in c.execute(
            "SELECT DISTINCT member_id FROM busy WHERE member_id IN (SELECT id FROM members WHERE group_id=?)", (gid,))}
        # members who synced but have zero busy rows still count: track via sources marker
        busy = {}
        for r in c.execute("SELECT member_id,source,start,end FROM busy WHERE member_id IN "
                           "(SELECT id FROM members WHERE group_id=?)", (gid,)):
            if r["source"].startswith("_"):
                connected.add(r["member_id"])
                continue
            busy.setdefault(r["member_id"], []).append(
                (datetime.fromisoformat(r["start"]), datetime.fromisoformat(r["end"])))
    for m in members:
        m["connected"] = m["id"] in connected
    active = [m for m in members if m["connected"] and m["id"] not in skip]
    tz = ZoneInfo(g["tz"])
    ds, de = time.fromisoformat(g["day_start"]), time.fromisoformat(g["day_end"])
    step = timedelta(minutes=g["slot_min"])
    d, last = date.fromisoformat(g["start"]), date.fromisoformat(g["end"])
    days = []
    while d <= last:
        slots = []
        t = datetime.combine(d, ds, tz)
        end_t = datetime.combine(d, de, tz)
        while t + step <= end_t:
            te = t + step
            free = [m["id"] for m in active
                    if not any(bs < te and be > t for bs, be in busy.get(m["id"], []))]
            slots.append({"t": t.strftime("%H:%M"), "free": free})
            t = te
        days.append({"date": d.isoformat(), "dow": d.strftime("%a"), "slots": slots})
        d += timedelta(days=1)

    # best windows: runs where free count is max possible (all active), else best run per day
    need = max(1, -(-min_minutes // g["slot_min"]))
    total = len(active)
    windows = []
    for day in days:
        i = 0
        sl = day["slots"]
        while i < len(sl):
            if total and len(sl[i]["free"]) == total:
                j = i
                while j + 1 < len(sl) and len(sl[j + 1]["free"]) == total:
                    j += 1
                if j - i + 1 >= need:
                    end_dt = datetime.combine(date.fromisoformat(day["date"]),
                                              time.fromisoformat(sl[j]["t"])) + step
                    windows.append({"date": day["date"], "dow": day["dow"], "start": sl[i]["t"],
                                    "end": end_dt.strftime("%H:%M"), "minutes": (j - i + 1) * g["slot_min"]})
                i = j + 1
            else:
                i += 1
    windows.sort(key=lambda w: (-w["minutes"], w["date"], w["start"]))
    return {"group": dict(g), "members": members, "active": len(active),
            "days": days, "windows": windows[:15]}


@app.get("/api/groups/{gid}")
def group_info(gid: str):
    with db() as c:
        return dict(get_group(c, gid))


# ---------- pages ----------
@app.get("/")
@app.get("/g/{gid}")
def index(gid: str = ""):
    return FileResponse("static/index.html")
