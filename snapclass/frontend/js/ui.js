/* UI helpers + reusable biometric widgets */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const initials = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const fmtDate = (iso) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const fmtDay = (iso) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
const pct = (v) => (v == null ? "—" : Math.round(v) + "%");

const ico = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const I = {
  home: ico('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
  users: ico('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.7 2.8 2.3 3 5.2"/>'),
  book: ico('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/>'),
  camera: ico('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  scan: ico('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>'),
  logout: ico('<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M16 8l4 4-4 4M20 12H9"/>'),
  qr: ico('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 17v4"/>'),
  check: ico('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  plus: ico('<path d="M12 5v14M5 12h14"/>'),
  mic: ico('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  upload: ico('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
  download: ico('<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1"/>'),
  copy: ico('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  trash: ico('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/>'),
  chart: ico('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'),
  print: ico('<path d="M7 9V3h10v6M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2"/><rect x="7" y="14" width="10" height="7" rx="1"/>'),
  shield: ico('<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  face: ico('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M9 10v1.5M15 10v1.5M9.5 15c1.4 1.2 3.6 1.2 5 0"/>'),
  key: ico('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>'),
  alert: ico('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.01"/>'),
};
const LOGO = `<svg viewBox="0 0 34 34"><rect width="34" height="34" rx="10" fill="#7444df"/><path d="M9.5 14v-3a1.5 1.5 0 0 1 1.5-1.5h3M20 9.5h3a1.5 1.5 0 0 1 1.5 1.5v3M24.5 20v3a1.5 1.5 0 0 1-1.5 1.5h-3M14 24.5h-3a1.5 1.5 0 0 1-1.5-1.5v-3" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M13 17.2l2.8 2.8 5.4-6" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const logoHTML = (href = "#/") => `<a class="logo" href="${href}">${LOGO}<span>Snap<b>Class</b></span></a>`;

function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind; el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), kind === "err" ? 5200 : 2800);
}

function modal(html, { wide = false, onClose } = {}) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { bg.remove(); Bio.stopAll(); onClose && onClose(); };
  bg.addEventListener("mousedown", (e) => { if (e.target === bg) close(); });
  document.body.appendChild(bg);
  return { el: $(".modal", bg), close };
}

async function withBusy(btn, fn, busyText) {
  const old = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${busyText || ""}`;
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = old; }
}

function bindForm(form, handler) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", form), err = $(".form-err", form);
    if (err) err.innerHTML = "";
    try {
      await withBusy(btn, () => handler(Object.fromEntries(new FormData(form))), "Please wait");
    } catch (ex) {
      if (err) err.innerHTML = `<div class="alert">${esc(ex.message)}</div>`; else toast(ex.message, "err");
    }
  });
}

/* ---------- biometric widgets ---------- */

/** Guided face enrolment: captures `need` frames, hands back the descriptors. */
function mountFaceEnroll(el, { need = 4, onDone }) {
  const prompts = ["Look straight at the camera", "Turn your head slightly left", "Turn your head slightly right", "Look straight again and smile", "One more, any angle"];
  const caps = [];
  el.innerHTML = `
    <div class="cam"><video playsinline muted></video><div class="oval"></div><div class="flash"></div>
      <div class="overlay"><span><span class="spinner"></span><br><span class="small">Starting camera &amp; loading AI…</span></span></div></div>
    <div class="dots">${Array.from({ length: need }, () => "<i></i>").join("")}</div>
    <p class="center" style="font-weight:700" data-prompt>${prompts[0]}</p>
    <p class="center small muted mt-s" data-msg>Good light on your face. Only you in the frame.</p>
    <div class="center mt"><button type="button" class="btn lg" data-snap disabled>${I.camera} Capture <span data-n>1</span>/${need}</button></div>`;
  const video = $("video", el), overlay = $(".overlay", el), btn = $("[data-snap]", el), msg = $("[data-msg]", el);
  let stream, alive = true;
  (async () => {
    try {
      await Promise.all([Bio.ensureModels(), (async () => { stream = await Bio.startCamera(video); })()]);
      if (!alive) return Bio.stopStream(stream);
      overlay.remove(); btn.disabled = false;
    } catch (e) { overlay.innerHTML = `<span>${esc(e.message)}<br><br><button type="button" class="btn sm light" data-retry>Try again</button></span>`; $("[data-retry]", el).onclick = () => mountFaceEnroll(el, { need, onDone }); }
  })();
  btn.onclick = async () => {
    btn.disabled = true; msg.className = "center small muted mt-s";
    try {
      caps.push(await Bio.captureFace(video));
      $(".flash", el).classList.add("go");
      setTimeout(() => $(".flash", el).classList.remove("go"), 400);
      $$(".dots i", el)[caps.length - 1].classList.add("done");
      if (caps.length >= need) {
        Bio.stopStream(stream); alive = false;
        $(".oval", el).classList.add("ok");
        $("[data-prompt]", el).textContent = "Face captured ✓"; btn.remove(); msg.textContent = "";
        onDone(caps);
      } else {
        $("[data-prompt]", el).textContent = prompts[caps.length];
        $("[data-n]", el).textContent = caps.length + 1; btn.disabled = false;
      }
    } catch (e) { msg.textContent = e.message; msg.className = "center small mt-s"; msg.style.color = "var(--absent)"; btn.disabled = false; }
  };
  return { destroy() { alive = false; Bio.stopStream(stream); } };
}

/** Single-shot face scan (login). */
function mountFaceScan(el, { onDescriptor, label = "Scan my face" }) {
  el.innerHTML = `
    <div class="cam"><video playsinline muted></video><div class="oval"></div>
      <div class="overlay"><span><span class="spinner"></span><br><span class="small">Starting camera &amp; loading AI…</span></span></div></div>
    <p class="center small muted mt-s" data-msg>Centre your face in the oval.</p>
    <div class="center mt-s"><button type="button" class="btn lg" data-snap disabled>${I.face} ${label}</button></div>`;
  const video = $("video", el), overlay = $(".overlay", el), btn = $("[data-snap]", el), msg = $("[data-msg]", el);
  let stream, alive = true;
  (async () => {
    try {
      await Promise.all([Bio.ensureModels(), (async () => { stream = await Bio.startCamera(video); })()]);
      if (!alive) return Bio.stopStream(stream);
      overlay.remove(); btn.disabled = false;
    } catch (e) { overlay.innerHTML = `<span>${esc(e.message)}</span>`; }
  })();
  btn.onclick = async () => {
    msg.style.color = "";
    try {
      await withBusy(btn, async () => {
        msg.textContent = "Scanning…";
        const d = await Bio.captureFace(video);
        await onDescriptor(d);
      }, "Checking");
    } catch (e) { msg.textContent = e.message; msg.style.color = "var(--absent)"; }
  };
  return { destroy() { alive = false; Bio.stopStream(stream); } };
}

/** Voice recorder. `count` recordings are collected, then onDone(list of base64 wavs). */
function mountVoice(el, { count = 1, seconds = 4, phrase = "Hello SnapClass, this is my voice and I am present today.", onDone, label }) {
  const got = [];
  el.innerHTML = `
    <div class="mic">
      <p class="small muted">Read this aloud in your normal voice:</p>
      <div class="phrase mt-s">“${esc(phrase)}”</div>
      <div class="bars">${Array.from({ length: 24 }, () => "<i></i>").join("")}</div>
      <p class="small muted" data-msg style="min-height:20px">Tap the mic and speak for ${seconds} seconds.</p>
      ${count > 1 ? `<div class="dots">${Array.from({ length: count }, () => "<i></i>").join("")}</div>` : ""}
      <button type="button" class="mic-btn" data-rec aria-label="Record">${I.mic.replace("<svg", '<svg width="36" height="36"')}</button>
      <p class="small mt-s" style="font-weight:700;color:var(--v-700)" data-label>${label || (count > 1 ? `Recording 1 of ${count}` : "Tap to record")}</p>
    </div>`;
  const bars = $$(".bars i", el), btn = $("[data-rec]", el), msg = $("[data-msg]", el), lab = $("[data-label]", el);
  const level = (l) => bars.forEach((b, i) => { b.style.height = 6 + (l > 0 ? Math.max(0, l * 36 * (0.45 + 0.55 * Math.abs(Math.sin(i * 1.7 + Date.now() / 120)))) : 0) + "px"; });
  btn.onclick = async () => {
    btn.disabled = true; btn.classList.add("rec"); msg.style.color = ""; msg.textContent = "Listening… speak now";
    let left = seconds; lab.textContent = left + "s";
    const tick = setInterval(() => { left--; if (left > 0) lab.textContent = left + "s"; }, 1000);
    try {
      const wav = await Bio.recordWav(seconds * 1000, level);
      got.push(wav);
      if (count > 1) $$(".dots i", el)[got.length - 1].classList.add("done");
      if (got.length >= count) {
        btn.classList.remove("rec"); btn.style.display = "none";
        msg.textContent = ""; lab.textContent = "Voice captured ✓";
        await onDone(got, { reset: () => { got.length = 0; btn.style.display = ""; btn.disabled = false; lab.textContent = label || "Tap to record"; } });
      } else {
        msg.textContent = "Nice. Once more.";
        lab.textContent = `Recording ${got.length + 1} of ${count}`; btn.disabled = false;
      }
    } catch (e) {
      msg.textContent = e.message; msg.style.color = "var(--absent)"; btn.disabled = false;
    } finally { clearInterval(tick); btn.classList.remove("rec"); if (btn.style.display !== "none") lab.textContent = label || (count > 1 ? `Recording ${got.length + 1} of ${count}` : "Tap to record"); }
  };
  return { destroy() { Bio.stopAll(); } };
}

/** Camera QR scanner modal -> resolves with a join code (or null if closed). */
function scanQR() {
  return new Promise((resolve) => {
    let done = false, stream, raf;
    const m = modal(`<h2>Scan class QR</h2><p class="muted small" style="margin-bottom:14px">Point the camera at your teacher's QR code.</p>
      <div class="cam"><video playsinline muted style="transform:none"></video></div>
      <p class="small center muted mt-s" data-msg></p>
      <div class="center mt"><button class="btn ghost" data-x>Cancel</button></div>`, { onClose: () => finish(null) });
    function finish(code) { if (done) return; done = true; cancelAnimationFrame(raf); Bio.stopStream(stream); m.close && m.close(); resolve(code); }
    const video = $("video", m.el), msg = $("[data-msg]", m.el), cv = document.createElement("canvas"), cx = cv.getContext("2d", { willReadFrequently: true });
    $("[data-x]", m.el).onclick = () => finish(null);
    Bio.startCamera(video).then((s) => {
      stream = s;
      if (done) return Bio.stopStream(s);
      const loop = () => {
        if (done) return;
        if (video.videoWidth) {
          cv.width = video.videoWidth; cv.height = video.videoHeight;
          cx.drawImage(video, 0, 0);
          const r = jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
          if (r) { const c = parseJoinCode(r.data); if (c) return finish(c); msg.textContent = "That QR isn't a SnapClass code."; }
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
    }).catch((e) => { msg.textContent = e.message; });
  });
}
function parseJoinCode(text) {
  const t = String(text).trim();
  const m = t.match(/#\/join\/([A-Za-z0-9]{4,12})/);
  if (m) return m[1].toUpperCase();
  return /^[A-Za-z0-9]{6}$/.test(t) ? t.toUpperCase() : null;
}

/* charts: one place so every chart uses the violet family */
const charts = [];
function killCharts() { while (charts.length) charts.pop().destroy(); }
function chartDefaults() {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = "#6c6590";
}
function makeChart(canvas, cfg) { chartDefaults(); const c = new Chart(canvas, cfg); charts.push(c); return c; }
