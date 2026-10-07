# SnapClass — AI smart attendance

Teachers create a class and get a QR code. Students scan it, register, and enrol their **face + voice**.
To take attendance the teacher uploads class photos; every recognised student is marked present
(**once**, even if they appear in several photos), everyone else absent.

## Run it

```bash
cd snapclass/backend
pip install -r requirements.txt
python app.py            # -> http://localhost:5000
```

Everything is bundled (face-api.js, models, Chart.js, jsQR) — no internet needed except the optional Google Font.

**Phones / QR scanning:** camera and microphone only work on `localhost` or HTTPS, and a phone can't
open your PC's `localhost`. For real devices serve over HTTPS (e.g. `ngrok http 5000`, or Caddy/nginx with a
certificate) and open the app via that URL before showing the QR — the QR encodes whatever address
the teacher's browser is on.

### Letting other devices (phones) join

`localhost` only exists on your own machine, so a QR that points to it fails on a friend's phone. SnapClass now
shows an editable **"Address the QR points to"** box on the class page (defaults to your computer's network IP).
Camera/mic on phones also need **HTTPS**, so pick one:

```bash
HTTPS=1 python app.py                 # self-signed; phone must accept the certificate warning once
# or
ngrok http 5000                       # then paste the https://....ngrok-free.app address into the box
PUBLIC_URL=https://your.domain python app.py   # when deployed
```
Same Wi-Fi is required for the network-IP option.

## Flow

| Who | What |
|---|---|
| Teacher | Register (name, email, password, subject, subject code, section) → QR generated → share/print |
| Student | Scan QR (phone camera, or in-app scanner, or type the 6-char code) → details → face enrolment (4 captures) → voice enrolment (3 recordings) |
| Student login | Email + **password**, **face** or **voice** |
| Teacher | Take attendance → upload photos → faces detected in-browser → matched on server → review/override → saved |
| Dashboards | Teacher: averages, trend, at-risk students, per-class roster, session history, CSV export. Student: per-class %, history, overall donut |

## Layout

```
backend/app.py        Flask API, SQLite, JWT auth, matching logic
backend/voice.py      MFCC voice fingerprint (swap for a neural embedding in production)
backend/test_api.py   end-to-end API tests (pytest)
frontend/             vanilla JS SPA (index.html, js/, css/), vendor/ = bundled libs + models
```

Config via env vars: `PORT`, `SNAPCLASS_SECRET` (JWT key; auto-generated otherwise), `SNAPCLASS_DATA` (db folder),
`FACE_THRESHOLD` (default 0.5, lower = stricter), `VOICE_THRESHOLD` (default 0.95).

## How matching works

- Browser (face-api.js) finds faces and turns each into a 128-number descriptor; large photos are also scanned in tiles so small faces at the back are caught. **Photos never leave the browser.**
- Server compares descriptors with each enrolled student's templates. A student can claim only one face per photo; extra sightings in other photos are tagged "duplicate" and ignored → counted once.
- Registration rejects a face that already belongs to another account (anti-proxy).

## Honest limitations

- **No liveness detection** — a printed photo or screen could pass the face check. Add a blink/head-turn challenge before relying on this for anything high-stakes.
- **Voice is demo-grade** (MFCC statistics, text-independent). It separates clearly different voices in tests but real-world accuracy needs tuning of `VOICE_THRESHOLD` with real recordings, or a neural speaker model. Voice is used for login only; attendance is face-based.
- Face accuracy drops with poor light, tiny faces, masks, or heavy angles. Teachers can always override in the review screen.
- Flask dev server + SQLite are fine for a class/department; use gunicorn + HTTPS (and Postgres if scaling) for production.

## Deploy

The repo ships a `Dockerfile` (gunicorn, 1 worker) and `render.yaml`. Needs: **HTTPS** (hosts give this free) and a
**persistent volume mounted at `/data`** (the SQLite database + secret live there).

**Render:** push the folder to GitHub → Render dashboard → New → Blueprint → pick the repo (uses `render.yaml`).
**Railway / Fly.io:** deploy the Dockerfile, attach a volume at `/data`, set `SNAPCLASS_SECRET` to a long random string.
After deploy open your `https://` URL — the QR address defaults to it automatically.
