"""End-to-end API tests using synthetic face descriptors and synthetic voices.

Run:  cd backend && python -m pytest -q
"""
import base64
import io
import os
import tempfile
import wave

import numpy as np
import pytest

os.environ["SNAPCLASS_DATA"] = tempfile.mkdtemp()
import app as appmod  # noqa: E402

rng = np.random.default_rng(7)


def face(seed):
    return np.random.default_rng(seed).normal(0, 0.25, 128)


def noisy(v, s=0.01):
    return (v + rng.normal(0, s, 128)).tolist()


def voice_wav(f0, formants, seconds=2.5, seed=0):
    sr = 16000
    r = np.random.default_rng(seed)
    t = np.arange(int(sr * seconds)) / sr
    f0 = f0 * (1 + 0.03 * np.sin(2 * np.pi * 0.7 * t + r.uniform(0, 6)))
    phase = 2 * np.pi * np.cumsum(f0) / sr
    sig = sum(np.sin(h * phase) / h for h in range(1, 40))
    out = np.zeros_like(sig)
    for fm in formants:  # crude formant resonators
        k = 2 * np.pi * fm / sr
        b = 0.96
        y = np.zeros_like(sig)
        for i in range(2, len(sig)):
            y[i] = sig[i] + 2 * b * np.cos(k) * y[i - 1] - b * b * y[i - 2]
        out += y / np.abs(y).max()
    out += r.normal(0, 0.01, len(out))
    out = out / np.abs(out).max() * 0.6
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(sr)
        w.writeframes((out * 32767).astype("<i2").tobytes())
    return base64.b64encode(buf.getvalue()).decode()


VOICES = {
    "asha": (110, [700, 1200, 2600]),
    "ravi": (190, [350, 2300, 3300]),
    "meera": (150, [500, 1700, 2500]),
}


@pytest.fixture(scope="module")
def c():
    return appmod.app.test_client()


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def reg_student(c, key, seed, code, voice_key=None):
    f0, fm = VOICES[voice_key or key]
    return c.post("/api/student/register", json={
        "name": key.title(), "email": f"{key}@x.com", "password": "secret1", "roll_no": key[:2].upper() + "01",
        "join_code": code, "face_descriptors": [noisy(face(seed)) for _ in range(4)],
        "voice_samples": [voice_wav(f0, fm, seed=i) for i in range(3)],
    })


def test_full_flow(c):
    # teacher
    r = c.post("/api/teacher/register", json={"name": "Ms Rao", "email": "rao@x.com", "password": "teach123",
                                              "subject": "Physics", "code": "phy101", "section": "a"})
    assert r.status_code == 200, r.json
    tok = r.json["token"]
    classes = c.get("/api/classes", headers=H(tok)).json["classes"]
    cid, code = classes[0]["id"], classes[0]["join_code"]
    assert classes[0]["code"] == "PHY101"
    assert c.get(f"/api/qr/{code}.png").mimetype == "image/png"
    assert c.get(f"/api/join/{code}").json["teacher_name"] == "Ms Rao"
    assert c.post("/api/teacher/login", json={"email": "rao@x.com", "password": "bad"}).status_code == 401
    assert c.post("/api/teacher/login", json={"email": "rao@x.com", "password": "teach123"}).status_code == 200

    # students
    for key, seed in (("asha", 1), ("ravi", 2), ("meera", 3)):
        r = reg_student(c, key, seed, code)
        assert r.status_code == 200, r.json
    assert reg_student(c, "asha", 1, code).status_code == 409  # email exists
    dup = c.post("/api/student/register", json={
        "name": "Clone", "email": "clone@x.com", "password": "secret1", "join_code": code,
        "face_descriptors": [noisy(face(1)) for _ in range(3)],
        "voice_samples": [voice_wav(*VOICES["asha"], seed=i) for i in range(2)]})
    assert dup.status_code == 409 and "already registered" in dup.json["error"]

    # student logins
    assert c.post("/api/student/login", json={"email": "asha@x.com", "password": "secret1"}).status_code == 200
    assert c.post("/api/student/login", json={"email": "asha@x.com", "password": "nope"}).status_code == 401
    ok = c.post("/api/student/login", json={"email": "asha@x.com", "method": "face", "descriptor": noisy(face(1), 0.02)})
    assert ok.status_code == 200
    bad = c.post("/api/student/login", json={"email": "asha@x.com", "method": "face", "descriptor": face(2).tolist()})
    assert bad.status_code == 401
    ok = c.post("/api/student/login", json={"email": "ravi@x.com", "method": "voice",
                                            "audio": voice_wav(*VOICES["ravi"], seed=99)})
    assert ok.status_code == 200, ok.json
    bad = c.post("/api/student/login", json={"email": "ravi@x.com", "method": "voice",
                                             "audio": voice_wav(*VOICES["asha"], seed=99)})
    assert bad.status_code == 401, "different voice must be rejected"
    # roles are separated
    stok = ok.json["token"]
    assert c.get("/api/classes", headers=H(stok)).status_code == 403
    assert c.get("/api/student/classes", headers=H(tok)).status_code == 403
    assert c.get("/api/classes").status_code == 401

    # attendance: Asha appears in photos 0 AND 1, Ravi in photo 0, an unknown stranger in photo 1, Meera absent
    faces = [
        {"key": "0-0", "photo": 0, "descriptor": noisy(face(1), 0.03)},
        {"key": "0-1", "photo": 0, "descriptor": noisy(face(2), 0.03)},
        {"key": "1-0", "photo": 1, "descriptor": noisy(face(1), 0.03)},
        {"key": "1-1", "photo": 1, "descriptor": face(999).tolist()},
    ]
    r = c.post(f"/api/classes/{cid}/attendance", json={"faces": faces, "photos": 2}, headers=H(tok))
    assert r.status_code == 200, r.json
    s = r.json["session"]
    by = {x["name"]: x for x in s["records"]}
    assert by["Asha"]["status"] == "present" and by["Asha"]["appearances"] == 2  # counted once
    assert by["Ravi"]["status"] == "present"
    assert by["Meera"]["status"] == "absent"
    assert s["present"] == 2 and s["total"] == 3 and s["faces_unknown"] == 1
    st = {f["key"]: f["status"] for f in r.json["faces"]}
    assert st == {"0-0": "matched", "0-1": "matched", "1-0": "duplicate", "1-1": "unknown"}

    # teacher override + analytics + export
    mid = by["Meera"]["student_id"]
    r = c.patch(f"/api/sessions/{s['id']}/records/{mid}", json={"status": "present"}, headers=H(tok))
    assert r.json["session"]["present"] == 3
    d = c.get(f"/api/classes/{cid}", headers=H(tok)).json
    assert len(d["students"]) == 3 and d["sessions"][0]["present"] == 3
    csvr = c.get(f"/api/classes/{cid}/export.csv", headers=H(tok))
    assert "Asha" in csvr.get_data(as_text=True)
    ov = c.get("/api/teacher/overview", headers=H(tok)).json
    assert ov["students"] == 3 and ov["sessions"] == 1

    # student dashboard
    sc = c.get("/api/student/classes", headers=H(stok)).json["classes"]
    assert sc[0]["present"] == 1 and sc[0]["percent"] == 100.0

    # a second teacher cannot touch the first teacher's class
    t2 = c.post("/api/teacher/register", json={"name": "Mr B", "email": "b@x.com", "password": "teach123",
                                               "subject": "Math", "code": "m1", "section": "b"}).json["token"]
    assert c.get(f"/api/classes/{cid}", headers=H(t2)).status_code == 404
    assert c.post(f"/api/classes/{cid}/attendance", json={"faces": [], "photos": 1}, headers=H(t2)).status_code == 404

    # student scans second teacher's QR while logged in
    code2 = c.get("/api/classes", headers=H(t2)).json["classes"][0]["join_code"]
    assert c.post("/api/student/join", json={"join_code": code2}, headers=H(stok)).status_code == 200
    assert len(c.get("/api/student/classes", headers=H(stok)).json["classes"]) == 2
