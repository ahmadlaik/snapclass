"""SnapClass - AI powered smart attendance. Flask + SQLite backend."""
import csv
import io
import json
import os
import re
import secrets
import socket
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

import jwt
import numpy as np
import qrcode
from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

import voice

BASE = Path(__file__).resolve().parent
DATA = Path(os.environ.get("SNAPCLASS_DATA", BASE / "data"))
DATA.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA / "snapclass.db"
FRONTEND = BASE.parent / "frontend"

FACE_THRESHOLD = float(os.environ.get("FACE_THRESHOLD", 0.5))  # euclidean distance, lower = stricter
FACE_DUP_THRESHOLD = 0.38  # block registering the same face twice under two accounts
VOICE_THRESHOLD = float(os.environ.get("VOICE_THRESHOLD", 0.95))  # cosine similarity

app = Flask(__name__, static_folder=str(FRONTEND), static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 40 * 1024 * 1024


def _secret():
    if os.environ.get("SNAPCLASS_SECRET"):
        return os.environ["SNAPCLASS_SECRET"]
    f = DATA / "secret.key"
    if not f.exists():
        f.write_text(secrets.token_hex(32))
    return f.read_text().strip()


SECRET = _secret()

SCHEMA = """
CREATE TABLE IF NOT EXISTS teachers(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS students(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, roll_no TEXT,
  password_hash TEXT NOT NULL, face_descriptors TEXT NOT NULL, voice_templates TEXT NOT NULL,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS classes(
  id INTEGER PRIMARY KEY, teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  subject TEXT NOT NULL, code TEXT NOT NULL, section TEXT NOT NULL,
  join_code TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS enrollments(
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL, PRIMARY KEY(class_id, student_id));
CREATE TABLE IF NOT EXISTS sessions(
  id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  taken_at TEXT NOT NULL, photos INTEGER NOT NULL DEFAULT 0, faces_detected INTEGER NOT NULL DEFAULT 0,
  faces_unknown INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS attendance(
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('present','absent')),
  method TEXT NOT NULL, confidence REAL, appearances INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(session_id, student_id));
"""


def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def close_db(_):
    d = g.pop("db", None)
    if d:
        d.close()


def init_db():
    c = sqlite3.connect(DB_PATH)
    c.executescript(SCHEMA)
    c.commit()
    c.close()


init_db()


# ---------------------------------------------------------------- helpers
def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class ApiError(Exception):
    def __init__(self, msg, status=400):
        self.msg, self.status = msg, status


@app.errorhandler(ApiError)
def _api_error(e):
    return jsonify(error=e.msg), e.status


@app.errorhandler(voice.VoiceError)
def _voice_error(e):
    return jsonify(error=str(e)), 422


@app.errorhandler(413)
def _too_big(_):
    return jsonify(error="Upload too large."), 413


def body():
    return request.get_json(silent=True) or {}


def need(data, *keys):
    for k in keys:
        v = data.get(k)
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ApiError(f"'{k}' is required.")
    return [data[k].strip() if isinstance(data[k], str) else data[k] for k in keys]


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def valid_email(email):
    email = email.strip().lower()
    if not EMAIL_RE.match(email):
        raise ApiError("Please enter a valid email address.")
    return email


def valid_password(pw):
    if len(pw) < 6:
        raise ApiError("Password must be at least 6 characters.")
    return pw


def make_token(role, uid):
    payload = {"sub": str(uid), "role": role, "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, SECRET, algorithm="HS256")


def auth(role):
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            h = request.headers.get("Authorization", "")
            if not h.startswith("Bearer "):
                raise ApiError("Please log in.", 401)
            try:
                p = jwt.decode(h[7:], SECRET, algorithms=["HS256"])
            except jwt.PyJWTError:
                raise ApiError("Session expired. Please log in again.", 401)
            if p["role"] != role:
                raise ApiError("This area is for " + role + "s only.", 403)
            table = "teachers" if role == "teacher" else "students"
            user = db().execute(f"SELECT * FROM {table} WHERE id=?", (int(p["sub"]),)).fetchone()
            if not user:
                raise ApiError("Account not found.", 401)
            g.user = user
            return fn(*a, **kw)

        return wrapper

    return deco


_attempts = {}


def throttle(key, ok=None, limit=6, window=300):
    """Tiny in-memory brute-force guard. throttle(key) checks, throttle(key, ok) records."""
    t = time.time()
    hist = [x for x in _attempts.get(key, []) if t - x < window]
    if ok is None:
        if len(hist) >= limit:
            raise ApiError("Too many failed attempts. Try again in a few minutes.", 429)
        return
    _attempts[key] = [] if ok else hist + [t]


def parse_descriptor(d):
    try:
        a = np.asarray(d, dtype=np.float64)
    except (TypeError, ValueError):
        raise ApiError("Invalid face data.")
    if a.shape != (128,) or not np.isfinite(a).all():
        raise ApiError("Invalid face data.")
    return a


def face_dist(desc, templates):
    if not templates:
        return 9.0
    return float(np.min(np.linalg.norm(np.asarray(templates) - desc, axis=1)))


def new_join_code():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        c = "".join(secrets.choice(alphabet) for _ in range(6))
        if not db().execute("SELECT 1 FROM classes WHERE join_code=?", (c,)).fetchone():
            return c


def class_dict(r, with_counts=True):
    d = {k: r[k] for k in ("id", "subject", "code", "section", "join_code", "created_at")}
    if "teacher_name" in r.keys():
        d["teacher_name"] = r["teacher_name"]
    if with_counts:
        d["student_count"] = db().execute("SELECT COUNT(*) FROM enrollments WHERE class_id=?", (r["id"],)).fetchone()[0]
        s = db().execute(
            "SELECT COUNT(*) n, MAX(taken_at) last FROM sessions WHERE class_id=?", (r["id"],)
        ).fetchone()
        d["session_count"], d["last_session"] = s["n"], s["last"]
    return d


def own_class(cid):
    r = db().execute("SELECT * FROM classes WHERE id=? AND teacher_id=?", (cid, g.user["id"])).fetchone()
    if not r:
        raise ApiError("Class not found.", 404)
    return r


# ---------------------------------------------------------------- pages / QR
@app.get("/")
def index():
    return send_from_directory(FRONTEND, "index.html")


@app.get("/api/qr/<code>.png")
def qr_png(code):
    base = request.args.get("base", "")
    if not re.match(r"^https?://[\w.\-:\[\]]+$", base):
        base = request.host_url.rstrip("/")
    img = qrcode.make(f"{base}/#/join/{code.upper()}", box_size=10, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(buf.getvalue(), mimetype="image/png", headers={"Cache-Control": "no-store"})


@app.get("/api/join/<code>")
def join_info(code):
    r = db().execute(
        "SELECT c.*, t.name teacher_name FROM classes c JOIN teachers t ON t.id=c.teacher_id WHERE join_code=?",
        (code.upper(),),
    ).fetchone()
    if not r:
        raise ApiError("This QR / join code is not valid.", 404)
    return jsonify(class_dict(r, with_counts=False))


# ---------------------------------------------------------------- teacher auth
@app.post("/api/teacher/register")
def teacher_register():
    d = body()
    name, email, pw, subject, code, section = need(d, "name", "email", "password", "subject", "code", "section")
    email, pw = valid_email(email), valid_password(pw)
    if db().execute("SELECT 1 FROM teachers WHERE email=?", (email,)).fetchone():
        raise ApiError("An account with this email already exists.", 409)
    cur = db().execute(
        "INSERT INTO teachers(name,email,password_hash,created_at) VALUES(?,?,?,?)",
        (name, email, generate_password_hash(pw), now()),
    )
    tid = cur.lastrowid
    db().execute(
        "INSERT INTO classes(teacher_id,subject,code,section,join_code,created_at) VALUES(?,?,?,?,?,?)",
        (tid, subject, code.upper(), section.upper(), new_join_code(), now()),
    )
    db().commit()
    return jsonify(token=make_token("teacher", tid), user={"id": tid, "name": name, "email": email, "role": "teacher"})


@app.post("/api/teacher/login")
def teacher_login():
    d = body()
    email, pw = need(d, "email", "password")
    email = email.lower()
    throttle("t:" + email)
    r = db().execute("SELECT * FROM teachers WHERE email=?", (email,)).fetchone()
    ok = bool(r and check_password_hash(r["password_hash"], pw))
    throttle("t:" + email, ok)
    if not ok:
        raise ApiError("Incorrect email or password.", 401)
    return jsonify(
        token=make_token("teacher", r["id"]),
        user={"id": r["id"], "name": r["name"], "email": r["email"], "role": "teacher"},
    )


# ---------------------------------------------------------------- student auth
def student_dict(r):
    return {"id": r["id"], "name": r["name"], "email": r["email"], "roll_no": r["roll_no"], "role": "student"}


def _enrol(student_id, class_row):
    db().execute(
        "INSERT OR IGNORE INTO enrollments(class_id,student_id,joined_at) VALUES(?,?,?)",
        (class_row["id"], student_id, now()),
    )


def _check_face_not_taken(desc, exclude_id=None):
    for r in db().execute("SELECT id,name,face_descriptors FROM students"):
        if r["id"] == exclude_id:
            continue
        if face_dist(desc, json.loads(r["face_descriptors"])) < FACE_DUP_THRESHOLD:
            raise ApiError("This face is already registered under another student account.", 409)


@app.post("/api/student/register")
def student_register():
    d = body()
    name, email, pw, join_code = need(d, "name", "email", "password", "join_code")
    email, pw = valid_email(email), valid_password(pw)
    roll = (d.get("roll_no") or "").strip()
    cls = db().execute("SELECT * FROM classes WHERE join_code=?", (join_code.upper(),)).fetchone()
    if not cls:
        raise ApiError("This QR / join code is not valid.", 404)
    if db().execute("SELECT 1 FROM students WHERE email=?", (email,)).fetchone():
        raise ApiError("An account with this email already exists. Log in and join the class instead.", 409)

    faces = d.get("face_descriptors") or []
    if len(faces) < 3:
        raise ApiError("Face enrolment needs at least 3 captures.")
    faces = [parse_descriptor(f) for f in faces][:8]
    # all captures must be the same person
    ref = faces[0]
    if any(np.linalg.norm(f - ref) > 0.6 for f in faces[1:]):
        raise ApiError("Face captures didn't match each other. Make sure only you are in the frame.")
    _check_face_not_taken(faces[0])

    samples = d.get("voice_samples") or []
    if len(samples) < 2:
        raise ApiError("Voice enrolment needs at least 2 recordings.")
    templates = [voice.extract(s) for s in samples][:5]
    sims = [voice.similarity(templates[0], t) for t in templates[1:]]
    if min(sims) < 0.85:
        raise ApiError("Voice recordings were inconsistent. Please record again in a quiet place.")

    cur = db().execute(
        "INSERT INTO students(name,email,roll_no,password_hash,face_descriptors,voice_templates,created_at)"
        " VALUES(?,?,?,?,?,?,?)",
        (name, email, roll, generate_password_hash(pw), json.dumps([f.tolist() for f in faces]), json.dumps(templates), now()),
    )
    _enrol(cur.lastrowid, cls)
    db().commit()
    r = db().execute("SELECT * FROM students WHERE id=?", (cur.lastrowid,)).fetchone()
    return jsonify(token=make_token("student", r["id"]), user=student_dict(r), joined=class_dict(cls, False))


@app.post("/api/student/login")
def student_login():
    d = body()
    email = (d.get("email") or "").strip().lower()
    method = d.get("method", "password")
    if not email:
        raise ApiError("Email is required.")
    throttle("s:" + email)
    r = db().execute("SELECT * FROM students WHERE email=?", (email,)).fetchone()
    ok, score = False, None
    if r:
        if method == "password":
            ok = check_password_hash(r["password_hash"], d.get("password") or "")
        elif method == "face":
            desc = parse_descriptor(d.get("descriptor"))
            score = face_dist(desc, json.loads(r["face_descriptors"]))
            ok = score < FACE_THRESHOLD
        elif method == "voice":
            probe = voice.extract(d.get("audio") or "")
            score = voice.best_similarity(probe, json.loads(r["voice_templates"]))
            ok = score >= VOICE_THRESHOLD
        else:
            raise ApiError("Unknown login method.")
    throttle("s:" + email, ok)
    if not ok:
        msg = {
            "password": "Incorrect email or password.",
            "face": "Face not recognised. Try again in better light, or use another method.",
            "voice": "Voice not recognised. Speak clearly and try again, or use another method.",
        }[method]
        raise ApiError(msg, 401)
    return jsonify(token=make_token("student", r["id"]), user=student_dict(r), method=method)


@app.get("/api/me")
def me():
    h = request.headers.get("Authorization", "")
    try:
        p = jwt.decode(h[7:], SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise ApiError("Not logged in.", 401)
    table = "teachers" if p["role"] == "teacher" else "students"
    r = db().execute(f"SELECT * FROM {table} WHERE id=?", (int(p["sub"]),)).fetchone()
    if not r:
        raise ApiError("Not logged in.", 401)
    if p["role"] == "teacher":
        return jsonify(user={"id": r["id"], "name": r["name"], "email": r["email"], "role": "teacher"})
    return jsonify(user=student_dict(r))


# ---------------------------------------------------------------- teacher: classes
@app.get("/api/classes")
@auth("teacher")
def list_classes():
    rows = db().execute("SELECT * FROM classes WHERE teacher_id=? ORDER BY id DESC", (g.user["id"],)).fetchall()
    out = []
    for r in rows:
        c = class_dict(r)
        avg = db().execute(
            "SELECT AVG(p) FROM (SELECT SUM(status='present')*100.0/COUNT(*) p FROM attendance a "
            "JOIN sessions s ON s.id=a.session_id WHERE s.class_id=? GROUP BY s.id)", (r["id"],)
        ).fetchone()[0]
        c["avg_attendance"] = round(avg, 1) if avg is not None else None
        out.append(c)
    return jsonify(classes=out)


@app.post("/api/classes")
@auth("teacher")
def create_class():
    subject, code, section = need(body(), "subject", "code", "section")
    cur = db().execute(
        "INSERT INTO classes(teacher_id,subject,code,section,join_code,created_at) VALUES(?,?,?,?,?,?)",
        (g.user["id"], subject, code.upper(), section.upper(), new_join_code(), now()),
    )
    db().commit()
    return jsonify(class_=class_dict(db().execute("SELECT * FROM classes WHERE id=?", (cur.lastrowid,)).fetchone()))


@app.delete("/api/classes/<int:cid>")
@auth("teacher")
def delete_class(cid):
    own_class(cid)
    db().execute("DELETE FROM classes WHERE id=?", (cid,))
    db().commit()
    return jsonify(ok=True)


def _student_stats(cid):
    """Per-student attendance summary for a class."""
    total = db().execute("SELECT COUNT(*) FROM sessions WHERE class_id=?", (cid,)).fetchone()[0]
    rows = db().execute(
        "SELECT st.id, st.name, st.email, st.roll_no, e.joined_at, "
        "(SELECT COUNT(*) FROM attendance a JOIN sessions s ON s.id=a.session_id "
        " WHERE s.class_id=e.class_id AND a.student_id=st.id AND a.status='present') present "
        "FROM enrollments e JOIN students st ON st.id=e.student_id WHERE e.class_id=? ORDER BY st.name",
        (cid,),
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["total"] = total
        d["percent"] = round(r["present"] * 100 / total, 1) if total else None
        out.append(d)
    return out


@app.get("/api/classes/<int:cid>")
@auth("teacher")
def class_detail(cid):
    c = own_class(cid)
    sessions = db().execute(
        "SELECT s.*, (SELECT COUNT(*) FROM attendance WHERE session_id=s.id AND status='present') present, "
        "(SELECT COUNT(*) FROM attendance WHERE session_id=s.id) total FROM sessions s "
        "WHERE class_id=? ORDER BY taken_at DESC", (cid,)
    ).fetchall()
    return jsonify(class_=class_dict(c), students=_student_stats(cid), sessions=[dict(s) for s in sessions])


@app.delete("/api/classes/<int:cid>/students/<int:sid>")
@auth("teacher")
def remove_student(cid, sid):
    own_class(cid)
    db().execute("DELETE FROM enrollments WHERE class_id=? AND student_id=?", (cid, sid))
    db().commit()
    return jsonify(ok=True)


@app.get("/api/classes/<int:cid>/export.csv")
@auth("teacher")
def export_csv(cid):
    c = own_class(cid)
    sessions = db().execute("SELECT * FROM sessions WHERE class_id=? ORDER BY taken_at", (cid,)).fetchall()
    students = _student_stats(cid)
    marks = {(r["session_id"], r["student_id"]): r["status"] for r in db().execute(
        "SELECT a.* FROM attendance a JOIN sessions s ON s.id=a.session_id WHERE s.class_id=?", (cid,))}
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Name", "Roll no", "Email"] + [s["taken_at"][:16].replace("T", " ") for s in sessions] + ["Present", "Total", "%"])
    for st in students:
        row = [st["name"], st["roll_no"], st["email"]]
        row += [{"present": "P", "absent": "A"}.get(marks.get((s["id"], st["id"])), "-") for s in sessions]
        row += [st["present"], st["total"], st["percent"] if st["percent"] is not None else ""]
        w.writerow(row)
    name = f"{c['code']}-{c['section']}-attendance.csv"
    return Response(out.getvalue(), mimetype="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------------------------------------------------------------- teacher: attendance
def match_faces(faces, candidates):
    """faces: [{key, photo, desc}], candidates: {student_id: (name, [templates])}.

    Each face is assigned to its closest enrolled student under the threshold. A student can
    only claim one face per photo (so two different people never collapse into one), and if the
    same student shows up in several photos the extra faces are tagged 'duplicate' - the student
    is still marked present only once.
    """
    pairs = []
    for fi, f in enumerate(faces):
        for sid, (_, tmpl) in candidates.items():
            dist = face_dist(f["desc"], tmpl)
            if dist < FACE_THRESHOLD:
                pairs.append((dist, fi, sid))
    pairs.sort()
    assigned, taken_in_photo = {}, set()
    for dist, fi, sid in pairs:
        photo = faces[fi]["photo"]
        if fi in assigned or (photo, sid) in taken_in_photo:
            continue
        assigned[fi] = (sid, dist)
        taken_in_photo.add((photo, sid))
    present, results = {}, []
    # walk in photo order so "first sighting" is deterministic
    order = sorted(range(len(faces)), key=lambda i: (faces[i]["photo"], i))
    status = {}
    for fi in order:
        if fi not in assigned:
            status[fi] = ("unknown", None, None)
            continue
        sid, dist = assigned[fi]
        p = present.setdefault(sid, {"best": dist, "n": 0})
        p["n"] += 1
        p["best"] = min(p["best"], dist)
        status[fi] = ("matched" if p["n"] == 1 else "duplicate", sid, dist)
    for fi, f in enumerate(faces):
        st, sid, dist = status[fi]
        results.append({
            "key": f["key"], "status": st, "student_id": sid,
            "name": candidates[sid][0] if sid else None,
            "distance": round(dist, 3) if dist is not None else None,
        })
    return present, results


@app.post("/api/classes/<int:cid>/attendance")
@auth("teacher")
def take_attendance(cid):
    own_class(cid)
    d = body()
    raw = d.get("faces") or []
    photos = int(d.get("photos") or 0)
    if photos < 1:
        raise ApiError("Upload at least one photo.")
    if len(raw) > 600:
        raise ApiError("Too many faces in one batch.")
    faces = []
    for i, f in enumerate(raw):
        faces.append({"key": f.get("key", i), "photo": int(f.get("photo", 0)), "desc": parse_descriptor(f.get("descriptor"))})
    cand = {}
    for r in db().execute(
        "SELECT st.id, st.name, st.face_descriptors FROM enrollments e JOIN students st ON st.id=e.student_id "
        "WHERE e.class_id=?", (cid,)):
        cand[r["id"]] = (r["name"], json.loads(r["face_descriptors"]))
    if not cand:
        raise ApiError("No students have joined this class yet. Share the QR code first.")
    present, results = match_faces(faces, cand)
    unknown = sum(1 for r in results if r["status"] == "unknown")
    cur = db().execute(
        "INSERT INTO sessions(class_id,taken_at,photos,faces_detected,faces_unknown) VALUES(?,?,?,?,?)",
        (cid, now(), photos, len(faces), unknown),
    )
    sid_session = cur.lastrowid
    for sid in cand:
        p = present.get(sid)
        db().execute(
            "INSERT INTO attendance(session_id,student_id,status,method,confidence,appearances) VALUES(?,?,?,?,?,?)",
            (sid_session, sid, "present" if p else "absent", "face" if p else "auto",
             round(max(0.0, 1 - p["best"]), 3) if p else None, p["n"] if p else 0),
        )
    db().commit()
    return jsonify(session=_session_payload(sid_session), faces=results)


def _session_payload(sid):
    s = db().execute("SELECT * FROM sessions WHERE id=?", (sid,)).fetchone()
    recs = db().execute(
        "SELECT a.*, st.name, st.roll_no FROM attendance a JOIN students st ON st.id=a.student_id "
        "WHERE a.session_id=? ORDER BY st.name", (sid,)).fetchall()
    d = dict(s)
    d["records"] = [dict(r) for r in recs]
    d["present"] = sum(1 for r in recs if r["status"] == "present")
    d["total"] = len(recs)
    return d


@app.get("/api/sessions/<int:sid>")
@auth("teacher")
def get_session(sid):
    s = db().execute("SELECT class_id FROM sessions WHERE id=?", (sid,)).fetchone()
    if not s:
        raise ApiError("Session not found.", 404)
    own_class(s["class_id"])
    return jsonify(session=_session_payload(sid))


@app.patch("/api/sessions/<int:sid>/records/<int:student_id>")
@auth("teacher")
def override_record(sid, student_id):
    s = db().execute("SELECT class_id FROM sessions WHERE id=?", (sid,)).fetchone()
    if not s:
        raise ApiError("Session not found.", 404)
    own_class(s["class_id"])
    status = body().get("status")
    if status not in ("present", "absent"):
        raise ApiError("Status must be present or absent.")
    cur = db().execute(
        "UPDATE attendance SET status=?, method='manual' WHERE session_id=? AND student_id=?", (status, sid, student_id))
    if not cur.rowcount:
        raise ApiError("Record not found.", 404)
    db().commit()
    return jsonify(session=_session_payload(sid))


@app.delete("/api/sessions/<int:sid>")
@auth("teacher")
def delete_session(sid):
    s = db().execute("SELECT class_id FROM sessions WHERE id=?", (sid,)).fetchone()
    if not s:
        raise ApiError("Session not found.", 404)
    own_class(s["class_id"])
    db().execute("DELETE FROM sessions WHERE id=?", (sid,))
    db().commit()
    return jsonify(ok=True)


@app.get("/api/teacher/overview")
@auth("teacher")
def teacher_overview():
    tid = g.user["id"]
    q = db().execute
    classes = q("SELECT COUNT(*) FROM classes WHERE teacher_id=?", (tid,)).fetchone()[0]
    students = q("SELECT COUNT(DISTINCT e.student_id) FROM enrollments e JOIN classes c ON c.id=e.class_id "
                 "WHERE c.teacher_id=?", (tid,)).fetchone()[0]
    sessions = q("SELECT COUNT(*) FROM sessions s JOIN classes c ON c.id=s.class_id WHERE c.teacher_id=?", (tid,)).fetchone()[0]
    trend = q(
        "SELECT s.id, s.taken_at, c.code, c.section, "
        "SUM(a.status='present')*100.0/COUNT(*) pct FROM sessions s JOIN classes c ON c.id=s.class_id "
        "JOIN attendance a ON a.session_id=s.id WHERE c.teacher_id=? GROUP BY s.id ORDER BY s.taken_at DESC LIMIT 12",
        (tid,)).fetchall()
    trend = [dict(t) for t in reversed(trend)]
    avg = round(sum(t["pct"] for t in trend) / len(trend), 1) if trend else None
    low = q(
        "SELECT st.name, c.code, c.section, "
        "SUM(a.status='present')*100.0/COUNT(*) pct, COUNT(*) n FROM attendance a "
        "JOIN sessions s ON s.id=a.session_id JOIN classes c ON c.id=s.class_id "
        "JOIN students st ON st.id=a.student_id WHERE c.teacher_id=? GROUP BY c.id, st.id "
        "HAVING pct < 75 ORDER BY pct LIMIT 6", (tid,)).fetchall()
    return jsonify(classes=classes, students=students, sessions=sessions, average=avg, trend=trend,
                   at_risk=[dict(r) for r in low])


# ---------------------------------------------------------------- student dashboard
@app.get("/api/student/classes")
@auth("student")
def student_classes():
    sid = g.user["id"]
    rows = db().execute(
        "SELECT c.*, t.name teacher_name FROM enrollments e JOIN classes c ON c.id=e.class_id "
        "JOIN teachers t ON t.id=c.teacher_id WHERE e.student_id=? ORDER BY e.joined_at DESC", (sid,)).fetchall()
    out = []
    for r in rows:
        d = class_dict(r, with_counts=False)
        total = db().execute("SELECT COUNT(*) FROM sessions WHERE class_id=? AND taken_at>=(SELECT joined_at FROM enrollments "
                             "WHERE class_id=? AND student_id=?)", (r["id"], r["id"], sid)).fetchone()[0]
        hist = db().execute(
            "SELECT s.id session_id, s.taken_at, a.status, a.method FROM attendance a JOIN sessions s ON s.id=a.session_id "
            "WHERE s.class_id=? AND a.student_id=? ORDER BY s.taken_at DESC", (r["id"], sid)).fetchall()
        present = sum(1 for h in hist if h["status"] == "present")
        d.update(total=len(hist), present=present,
                 percent=round(present * 100 / len(hist), 1) if hist else None,
                 history=[dict(h) for h in hist])
        out.append(d)
    return jsonify(classes=out)


@app.post("/api/student/join")
@auth("student")
def student_join():
    (code,) = need(body(), "join_code")
    cls = db().execute("SELECT * FROM classes WHERE join_code=?", (code.upper(),)).fetchone()
    if not cls:
        raise ApiError("This QR / join code is not valid.", 404)
    _enrol(g.user["id"], cls)
    db().commit()
    return jsonify(class_=class_dict(cls, False))


@app.put("/api/student/biometrics")
@auth("student")
def update_biometrics():
    """Re-enrol face and/or voice (requires current password)."""
    d = body()
    if not check_password_hash(g.user["password_hash"], d.get("password") or ""):
        raise ApiError("Password is incorrect.", 401)
    if d.get("face_descriptors"):
        faces = [parse_descriptor(f) for f in d["face_descriptors"]][:8]
        if len(faces) < 3:
            raise ApiError("Face enrolment needs at least 3 captures.")
        _check_face_not_taken(faces[0], exclude_id=g.user["id"])
        db().execute("UPDATE students SET face_descriptors=? WHERE id=?",
                     (json.dumps([f.tolist() for f in faces]), g.user["id"]))
    if d.get("voice_samples"):
        if len(d["voice_samples"]) < 2:
            raise ApiError("Voice enrolment needs at least 2 recordings.")
        t = [voice.extract(s) for s in d["voice_samples"]][:5]
        db().execute("UPDATE students SET voice_templates=? WHERE id=?", (json.dumps(t), g.user["id"]))
    db().commit()
    return jsonify(ok=True)


def lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as k:
            k.connect(("10.255.255.255", 1))
            return k.getsockname()[0]
    except OSError:
        return None


@app.get("/api/server-info")
def server_info():
    """Tells the UI which address other devices can use to reach this server (for the QR code)."""
    return jsonify(lan_ip=lan_ip(), port=int(os.environ.get("PORT", 5000)),
                   https=bool(os.environ.get("HTTPS")), public_url=os.environ.get("PUBLIC_URL", "").rstrip("/"))


@app.get("/api/health")
def health():
    return jsonify(ok=True, face_threshold=FACE_THRESHOLD, voice_threshold=VOICE_THRESHOLD)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n  SnapClass running ->  http://localhost:{port}\n")
    ctx = None
    if os.environ.get("HTTPS"):  # self-signed certificate: phones can use camera/mic after accepting the warning
        ctx = "adhoc"  # needs: pip install cryptography
        print("  HTTPS on - open  https://<this-computer-ip>:%d  (accept the certificate warning once)\n" % port)
    app.run(host="0.0.0.0", port=port, debug=bool(os.environ.get("DEBUG")), ssl_context=ctx)
