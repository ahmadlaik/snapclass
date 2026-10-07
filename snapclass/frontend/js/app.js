/* SnapClass — views & router */
const app = $("#app");
let cleanup = [];
const onLeave = (fn) => cleanup.push(fn);

/* ============================================================ router */
const routes = [];
const route = (re, fn, role) => routes.push({ re, fn, role });

async function navigate() {
  cleanup.forEach((f) => { try { f(); } catch (e) { /* noop */ } });
  cleanup = []; killCharts(); Bio.stopAll();
  const hash = location.hash.replace(/^#/, "") || "/";
  for (const r of routes) {
    const m = hash.match(r.re);
    if (!m) continue;
    if (r.role && (!API.user || API.user.role !== r.role || !API.token)) {
      return (location.hash = r.role === "teacher" ? "#/teacher/login" : "#/student/login");
    }
    if (!r.role && API.token && API.user && /^\/(teacher|student)\/(login|register)$/.test(hash)) {
      return (location.hash = API.user.role === "teacher" ? "#/t" : "#/s");
    }
    window.scrollTo(0, 0);
    try { await r.fn(...m.slice(1)); }
    catch (e) {
      if (e.status === 401) return (location.hash = "#/");
      app.innerHTML = `<div class="page-loading"><div class="card center"><h3>Something went wrong</h3><p class="muted mt-s">${esc(e.message)}</p><a class="btn mt" href="#/">Go home</a></div></div>`;
    }
    return;
  }
  location.hash = "#/";
}
window.addEventListener("hashchange", navigate);

function logout() { API.clear(); toast("Logged out"); location.hash = "#/"; }

/* ============================================================ shells */
function shell(active, inner, head = "") {
  const t = API.user.role === "teacher";
  const nav = t
    ? [["#/t", "home", "Dashboard"], ["#/t/classes", "book", "My classes"], ["#/t/attend", "camera", "Take attendance"]]
    : [["#/s", "home", "Dashboard"], ["#/s/join", "qr", "Join a class"]];
  app.innerHTML = `
    <div class="shell">
      <aside class="side">
        ${logoHTML(t ? "#/t" : "#/s")}
        <nav>${nav.map(([h, i, l]) => `<a href="${h}" class="${active === h ? "on" : ""}">${I[i]}<span>${l}</span></a>`).join("")}</nav>
        <div class="me"><div class="avatar">${esc(initials(API.user.name))}</div>
          <div style="min-width:0"><div class="nm">${esc(API.user.name)}</div><div class="rl">${t ? "Teacher" : "Student"}</div></div>
          <button title="Log out" id="logout">${I.logout.replace("<svg", '<svg width="20" height="20"')}</button></div>
      </aside>
      <main class="main">${head}${inner}</main>
    </div>`;
  $("#logout").onclick = logout;
  return $(".main");
}
const pageHead = (title, sub = "", actions = "", crumb = "") =>
  `<div class="page-head"><div>${crumb}<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="row wrap no-print">${actions}</div></div>`;

function authShell(kind, title, sub, inner, side) {
  const teacher = kind === "teacher";
  app.innerHTML = `
    <div class="auth-wrap">
      <aside class="auth-side">
        ${logoHTML()}
        <div style="position:relative;z-index:1">
          <h2>${side.title}</h2><p>${side.text}</p>
          <ul>${side.points.map((p) => `<li><i>✓</i>${p}</li>`).join("")}</ul>
        </div>
        <p class="small" style="color:var(--v-300);position:relative;z-index:1">${teacher ? "Teacher workspace" : "Student space"} · SnapClass</p>
      </aside>
      <section class="auth-main"><div class="auth-box">
        <div class="mobile-only" style="margin-bottom:22px;display:none">${logoHTML()}</div>
        <h1>${title}</h1><p class="sub">${sub}</p>${inner}</div></section>
    </div>`;
  if (window.innerWidth <= 960) $(".mobile-only").style.display = "block";
}
const teacherSide = {
  title: "Take attendance in a snap.",
  text: "Upload a few classroom photos. SnapClass recognises every enrolled student and marks them present — once.",
  points: ["Share one QR code with your class", "Group photos, multiple angles", "Duplicate faces counted only once", "Instant dashboards & CSV export"],
};
const studentSide = {
  title: "Your face and voice are your pass.",
  text: "Enrol once by scanning your teacher's QR. After that, you're marked present just by being in class.",
  points: ["Enrol with face + voice in 1 minute", "Log in with password, face or voice", "Track your attendance per subject", "No proxies — one face, one student"],
};

/* ============================================================ landing */
route(/^\/$/, async () => {
  app.innerHTML = `
    <header class="hero">
      <div class="landing-nav" style="padding:0 0 40px;max-width:1100px;margin:0 auto">
        ${logoHTML()}
        <div class="row"><a class="btn sm outline" href="#/student/login">Student login</a><a class="btn sm light" href="#/teacher/login">Teacher login</a></div>
      </div>
      <div class="hero-inner">
        <div>
          <span class="chip dark" style="background:rgba(255,255,255,.14)">✨ AI-powered smart attendance</span>
          <h1 style="margin-top:18px">Attendance that <em>marks itself.</em></h1>
          <p class="lead">Students enrol once with their face and voice. Teachers snap a few photos of the class — SnapClass recognises everyone and records attendance in seconds.</p>
          <div class="row wrap mt-l"><a class="btn lg light" href="#/teacher/register">I'm a teacher</a><a class="btn lg outline" href="#/student/login">I'm a student</a></div>
        </div>
        <div class="scan-art"><div class="frame"></div><div class="face"></div><div class="beam"></div>
          <span class="tag a">✓ Asha · present</span><span class="tag b">✓ Ravi · present</span></div>
      </div>
    </header>
    <div class="roles">
      <a class="role-card" href="#/teacher/login"><div class="ic">${I.book.replace("<svg", '<svg width="26" height="26"')}</div>
        <h3>Teacher</h3><p>Create your class, share the QR, upload photos and watch attendance fill in.</p>
        <div class="row"><span class="btn sm">Log in</span><span class="btn sm ghost">Create account</span></div></a>
      <a class="role-card" href="#/student/login"><div class="ic">${I.face.replace("<svg", '<svg width="26" height="26"')}</div>
        <h3>Student</h3><p>Scan your teacher's QR, enrol your face and voice, and track your attendance.</p>
        <div class="row"><span class="btn sm">Log in</span><span class="btn sm ghost">Scan QR to join</span></div></a>
    </div>
    <section class="section">
      <h2>How SnapClass works</h2><p class="sub">Four steps, no roll calls.</p>
      <div class="steps">
        <div class="step"><div class="n">1</div><h4>Teacher creates a class</h4><p>Name, subject, code and section — a QR code is generated instantly.</p></div>
        <div class="step"><div class="n">2</div><h4>Students scan &amp; enrol</h4><p>They register through the QR and capture face and voice samples once.</p></div>
        <div class="step"><div class="n">3</div><h4>Snap the class</h4><p>Upload one or many photos. Faces are matched to the enrolled roster.</p></div>
        <div class="step"><div class="n">4</div><h4>Review &amp; share</h4><p>Present once per student, absent otherwise. Override, export, done.</p></div>
      </div>
    </section>
    <footer class="footer">Face matching runs in your browser — photos are never uploaded, only numeric face prints.</footer>`;
});

/* ============================================================ teacher auth */
route(/^\/teacher\/(login|register)$/, async (mode) => {
  const reg = mode === "register";
  authShell("teacher", reg ? "Create your teacher account" : "Welcome back", reg ? "Set up your first class — you can add more later." : "Log in to your classes.",
    `<form class="stack" novalidate>
      ${reg ? `<label class="field"><span>Your name</span><input name="name" placeholder="e.g. Anita Rao" required autocomplete="name"></label>` : ""}
      <div class="grid2"><label class="field" style="${reg ? "" : "grid-column:1/-1"}"><span>Email</span><input type="email" name="email" placeholder="you@school.edu" required autocomplete="email"></label>
      <label class="field" style="${reg ? "" : "grid-column:1/-1"}"><span>Password</span><input type="password" name="password" placeholder="min 6 characters" required autocomplete="${reg ? "new-password" : "current-password"}"></label></div>
      ${reg ? `<div class="card flat" style="background:var(--v-50)"><h3 style="font-size:15px;margin-bottom:12px">Your first class</h3>
        <label class="field"><span>Subject name</span><input name="subject" placeholder="e.g. Physics" required></label>
        <div class="grid2 mt-s"><label class="field"><span>Subject code</span><input name="code" placeholder="e.g. PHY101" required></label>
        <label class="field"><span>Class / section</span><input name="section" placeholder="e.g. CSE-A" required></label></div></div>` : ""}
      <div class="form-err"></div>
      <button class="btn lg block" type="submit">${reg ? "Create account &amp; generate QR" : "Log in"}</button>
      <p class="center small muted">${reg ? `Already registered? <a href="#/teacher/login">Log in</a>` : `New here? <a href="#/teacher/register">Create a teacher account</a>`} · <a href="#/student/login">I'm a student</a></p>
    </form>`, teacherSide);
  bindForm($("form"), async (d) => {
    const r = await API.post(`/teacher/${reg ? "register" : "login"}`, d);
    API.save(r.token, r.user);
    toast(reg ? "Account created 🎉" : "Welcome back, " + r.user.name.split(" ")[0]);
    if (reg) { const c = (await API.get("/classes")).classes[0]; location.hash = `#/t/class/${c.id}`; } else location.hash = "#/t";
  });
});

/* ============================================================ teacher dashboard */
route(/^\/t$/, async () => {
  const main = shell("#/t", `<div class="page-loading"><span class="spinner dark"></span></div>`);
  const [ov, cl] = await Promise.all([API.get("/teacher/overview"), API.get("/classes")]);
  const first = API.user.name.split(" ")[0];
  const hour = new Date().getHours();
  main.innerHTML = pageHead(`${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${esc(first)} 👋`,
    "Here's how attendance looks across your classes.", `<a class="btn" href="#/t/attend">${I.camera} Take attendance</a>`) + `
    <div class="stat-grid">
      <div class="stat hero-stat"><div class="ic">${I.chart}</div><div class="lbl">Average attendance</div><div class="val">${pct(ov.average)}</div></div>
      <div class="stat"><div class="ic">${I.book}</div><div class="lbl">Classes</div><div class="val">${ov.classes}</div></div>
      <div class="stat"><div class="ic">${I.users}</div><div class="lbl">Students enrolled</div><div class="val">${ov.students}</div></div>
      <div class="stat"><div class="ic">${I.scan}</div><div class="lbl">Sessions taken</div><div class="val">${ov.sessions}</div></div>
    </div>
    <div class="two-col mt">
      <div class="card"><div class="row spread"><h3>Attendance trend</h3><span class="chip">last ${ov.trend.length || 0} sessions</span></div>
        ${ov.trend.length ? `<div class="chart-box mt-s"><canvas id="trend"></canvas></div>` : `<div class="empty"><div class="big">${I.chart}</div><h3>No sessions yet</h3><p>Take your first attendance to see trends here.</p></div>`}</div>
      <div class="card"><h3>Needs attention</h3><p class="small muted">Students under 75% attendance</p>
        <div class="stack mt-s">${ov.at_risk.length ? ov.at_risk.map((r) => `
          <div><div class="row spread"><span style="font-weight:600">${esc(r.name)}</span><span class="chip absent">${Math.round(r.pct)}%</span></div>
          <div class="small muted">${esc(r.code)} · ${esc(r.section)}</div><div class="meter low"><i style="width:${r.pct}%"></i></div></div>`).join("") :
          `<div class="empty" style="padding:26px 0"><div class="big">${I.shield}</div><p>Everyone's on track. 🎉</p></div>`}</div></div>
    </div>
    <div class="row spread mt-l"><h2 style="font-size:20px">Your classes</h2><a href="#/t/classes">View all</a></div>
    <div class="grid-auto mt-s">${cl.classes.slice(0, 3).map(classCard).join("") || ""}</div>`;
  if (!cl.classes.length) $(".grid-auto", main).innerHTML = `<div class="card empty" style="grid-column:1/-1"><h3>No classes yet</h3><a class="btn mt-s" href="#/t/classes">Create a class</a></div>`;
  if (ov.trend.length) {
    const ctx = $("#trend").getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, 260); g.addColorStop(0, "rgba(116,68,223,.35)"); g.addColorStop(1, "rgba(116,68,223,0)");
    makeChart($("#trend"), { type: "line", data: { labels: ov.trend.map((t) => `${fmtDay(t.taken_at)} · ${t.code}`),
      datasets: [{ data: ov.trend.map((t) => Math.round(t.pct)), borderColor: "#7444df", backgroundColor: g, fill: true, tension: .38, borderWidth: 3, pointBackgroundColor: "#fff", pointBorderColor: "#7444df", pointBorderWidth: 2.5, pointRadius: 5, clip: false }] },
      options: { maintainAspectRatio: false, layout: { padding: { top: 10, right: 6 } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.parsed.y + "% present" } } },
        scales: { y: { min: 0, max: 100, ticks: { callback: (v) => v + "%" }, grid: { color: "#efeafc" }, border: { display: false } }, x: { offset: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } } } } });
  }
}, "teacher");

function classCard(c) {
  const low = c.avg_attendance != null && c.avg_attendance < 75;
  return `<a class="card class-card" href="#/t/class/${c.id}">
    <div class="row spread"><span class="code">${esc(c.code)}</span><span class="chip">Sec ${esc(c.section)}</span></div>
    <h3>${esc(c.subject)}</h3>
    <div class="small muted">${c.student_count} student${c.student_count === 1 ? "" : "s"} · ${c.session_count} session${c.session_count === 1 ? "" : "s"}</div>
    <div class="row spread mt-s small"><span class="muted">Avg attendance</span><b>${pct(c.avg_attendance)}</b></div>
    <div class="meter ${low ? "low" : ""}"><i style="width:${c.avg_attendance || 0}%"></i></div></a>`;
}

route(/^\/t\/classes$/, async () => {
  const main = shell("#/t/classes", `<div class="page-loading"><span class="spinner dark"></span></div>`);
  const { classes } = await API.get("/classes");
  main.innerHTML = pageHead("My classes", "Every class has its own QR code.", `<button class="btn" id="new">${I.plus} New class</button>`) +
    (classes.length ? `<div class="grid-auto">${classes.map(classCard).join("")}</div>` :
      `<div class="card empty"><div class="big">${I.book}</div><h3>No classes yet</h3><p>Create one to generate a QR code for your students.</p></div>`);
  $("#new").onclick = () => {
    const m = modal(`<h2>New class</h2><p class="muted small" style="margin-bottom:18px">A fresh QR code is generated for it.</p>
      <form class="stack"><label class="field"><span>Subject name</span><input name="subject" required placeholder="e.g. Chemistry"></label>
      <div class="grid2"><label class="field"><span>Subject code</span><input name="code" required placeholder="CHE201"></label>
      <label class="field"><span>Class / section</span><input name="section" required placeholder="CSE-B"></label></div>
      <div class="form-err"></div><div class="row"><button type="button" class="btn ghost grow" data-x>Cancel</button><button class="btn grow" type="submit">Create</button></div></form>`);
    $("[data-x]", m.el).onclick = m.close;
    bindForm($("form", m.el), async (d) => { const r = await API.post("/classes", d); m.close(); location.hash = `#/t/class/${r.class_.id}`; });
  };
}, "teacher");

route(/^\/t\/attend$/, async () => {
  const main = shell("#/t/attend", `<div class="page-loading"><span class="spinner dark"></span></div>`);
  const { classes } = await API.get("/classes");
  main.innerHTML = pageHead("Take attendance", "Choose the class you're teaching right now.") +
    (classes.length ? `<div class="grid-auto">${classes.map((c) => `<a class="card class-card" href="#/t/class/${c.id}/attend">
      <span class="code">${esc(c.code)}</span><h3>${esc(c.subject)}</h3><div class="small muted">Section ${esc(c.section)} · ${c.student_count} enrolled</div>
      <div class="btn sm mt-s">${I.camera} Start</div></a>`).join("")}</div>` :
      `<div class="card empty"><h3>Create a class first</h3><a class="btn mt-s" href="#/t/classes">New class</a></div>`);
}, "teacher");

/* ============================================================ teacher: class detail */
route(/^\/t\/class\/(\d+)$/, async (id) => {
  const main = shell("#/t/classes", `<div class="page-loading"><span class="spinner dark"></span></div>`);
  const d = await API.get(`/classes/${id}`);
  const c = d.class_;
  const info = await API.get("/server-info").catch(() => ({}));
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  let saved = ""; try { saved = localStorage.getItem("snapclass.base") || ""; } catch (e) { /* ignore */ }
  const guess = info.public_url || (info.lan_ip ? `${info.https ? "https" : location.protocol.replace(":", "")}://${info.lan_ip}:${info.port}` : location.origin);
  const base = (saved || (isLocal ? guess : location.origin)).replace(/\/+$/, "");
  const link = `${base}/#/join/${c.join_code}`;
  const qrUrl = `/api/qr/${c.join_code}.png?base=${encodeURIComponent(base)}`;
  const tot = d.sessions.length;
  const avg = tot ? d.sessions.reduce((a, s) => a + (s.total ? (s.present * 100) / s.total : 0), 0) / tot : null;
  main.innerHTML = pageHead(esc(c.subject), `${esc(c.code)} · Section ${esc(c.section)}`,
    `<button class="btn ghost" id="csv">${I.download} Export CSV</button><a class="btn" href="#/t/class/${c.id}/attend">${I.camera} Take attendance</a>`,
    `<a class="crumb" href="#/t/classes">← My classes</a>`) + `
    <div class="stat-grid" style="margin-bottom:18px">
      <div class="stat hero-stat"><div class="ic">${I.chart}</div><div class="lbl">Average attendance</div><div class="val">${pct(avg)}</div></div>
      <div class="stat"><div class="ic">${I.users}</div><div class="lbl">Students</div><div class="val">${c.student_count}</div></div>
      <div class="stat"><div class="ic">${I.scan}</div><div class="lbl">Sessions</div><div class="val">${tot}</div></div>
    </div>
    <div class="two-col class-cols">
      <div class="stack">
        <div class="card"><div class="row spread"><h3>Students</h3><span class="chip">${d.students.length} enrolled</span></div>
          ${d.students.length ? `<div class="scroll-x mt-s"><table class="tbl"><thead><tr><th>Student</th><th>Roll no</th><th>Present</th><th>Attendance</th><th></th></tr></thead><tbody>
          ${d.students.map((s) => `<tr><td><div class="who"><div class="avatar">${esc(initials(s.name))}</div><div>${esc(s.name)}<div class="small muted" style="font-weight:400">${esc(s.email)}</div></div></div></td>
            <td>${esc(s.roll_no || "—")}</td><td>${s.present}/${s.total}</td>
            <td style="min-width:130px"><b>${pct(s.percent)}</b><div class="meter ${s.percent != null && s.percent < 75 ? "low" : ""}"><i style="width:${s.percent || 0}%"></i></div></td>
            <td><button class="btn sm danger" data-rm="${s.id}" title="Remove from class">${I.trash.replace("<svg", '<svg width="15" height="15"')}</button></td></tr>`).join("")}</tbody></table></div>` :
          `<div class="empty"><div class="big">${I.qr}</div><h3>Waiting for students</h3><p>Show the QR code on the right. Students scan it and enrol their face &amp; voice.</p></div>`}</div>
        <div class="card"><div class="row spread"><h3>Session history</h3></div>
          ${tot ? `<div class="chart-box mt-s" style="height:200px"><canvas id="hist"></canvas></div>
          <div class="scroll-x mt-s"><table class="tbl"><thead><tr><th>Date</th><th>Photos</th><th>Present</th><th>Unmatched faces</th><th></th></tr></thead><tbody>
          ${d.sessions.map((s) => `<tr><td class="nowrap">${fmtDate(s.taken_at)}</td><td>${s.photos}</td><td><span class="chip present">${s.present}/${s.total}</span></td><td>${s.faces_unknown}</td>
          <td class="row" style="justify-content:flex-end"><a class="btn sm ghost" href="#/t/session/${s.id}">View</a><button class="btn sm danger" data-ds="${s.id}">${I.trash.replace("<svg", '<svg width="15" height="15"')}</button></td></tr>`).join("")}</tbody></table></div>` :
          `<div class="empty"><div class="big">${I.camera}</div><h3>No sessions yet</h3><p>Upload class photos to take your first attendance.</p></div>`}</div>
      </div>
      <div class="stack">
        <div class="card qr-card"><h3>Join QR code</h3><p class="small muted mt-s">Students scan this to register for ${esc(c.code)}</p>
          <img class="mt-s" id="qrimg" alt="QR code to join ${esc(c.subject)}" src="${qrUrl}">
          <div class="join-code">${esc(c.join_code)}</div><p class="small muted">or enter this code manually</p>
          <div class="row wrap mt-s no-print" style="justify-content:center"><button class="btn sm ghost" id="copy">${I.copy} Copy link</button><button class="btn sm ghost" id="print">${I.print} Print</button><a class="btn sm ghost" id="dlqr" href="${qrUrl}" download="snapclass-${esc(c.code)}-qr.png">${I.download} PNG</a></div>
          <div class="mt-s" style="text-align:left"><label class="field"><span>Address the QR points to</span><input id="basein" value="${esc(base)}" spellcheck="false"></label>
          <div class="row mt-s"><button class="btn sm ghost" id="basego">Update QR</button><button class="btn sm line" id="basereset">Reset</button></div>
          <p class="small muted mt-s">Your friend's phone must be able to open this address. <b>localhost</b> only works on this computer.</p>
          ${base.startsWith("http://") && !/^http:\/\/(localhost|127\.)/.test(base) ? `<p class="small mt-s alert">This address is plain <b>http</b>: the page will open on a phone, but its <b>camera and microphone are blocked</b>, so registration can't finish. Use an <b>https</b> address (ngrok, or start the server with HTTPS=1).</p>` : ""}</div></div>
        <div class="card no-print"><h3>Danger zone</h3><p class="small muted mt-s">Deleting a class removes its sessions and attendance records.</p><button class="btn danger sm mt-s" id="delclass">${I.trash.replace("<svg", '<svg width="15" height="15"')} Delete class</button></div>
      </div>
    </div>`;
  $("#csv").onclick = () => API.download(`/classes/${c.id}/export.csv`, `${c.code}-${c.section}-attendance.csv`).catch((e) => toast(e.message, "err"));
  $("#copy").onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Join link copied"); } catch (e) { prompt("Copy this link", link); } };
  $("#print").onclick = () => window.print();
  $("#basego").onclick = () => { let v = $("#basein").value.trim(); if (v && !/^https?:\/\//.test(v)) v = "https://" + v; try { localStorage.setItem("snapclass.base", v); } catch (e) { /* ignore */ } navigate(); };
  $("#basereset").onclick = () => { try { localStorage.removeItem("snapclass.base"); } catch (e) { /* ignore */ } navigate(); };
  $$("[data-rm]", main).forEach((b) => b.onclick = async () => { if (!confirm("Remove this student from the class?")) return; await API.del(`/classes/${c.id}/students/${b.dataset.rm}`); toast("Student removed"); navigate(); });
  $$("[data-ds]", main).forEach((b) => b.onclick = async () => { if (!confirm("Delete this attendance session?")) return; await API.del(`/sessions/${b.dataset.ds}`); toast("Session deleted"); navigate(); });
  $("#delclass").onclick = async () => { if (!confirm(`Delete ${c.subject} (${c.section}) and all its attendance?`)) return; await API.del(`/classes/${c.id}`); toast("Class deleted"); location.hash = "#/t/classes"; };
  if (tot) {
    const ss = [...d.sessions].reverse();
    makeChart($("#hist"), { type: "bar", data: { labels: ss.map((s) => fmtDay(s.taken_at)), datasets: [{ data: ss.map((s) => s.total ? Math.round((s.present * 100) / s.total) : 0), backgroundColor: "#8b66ee", hoverBackgroundColor: "#6132c2", borderRadius: 8, maxBarThickness: 36 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => x.parsed.y + "% present" } } }, scales: { y: { min: 0, max: 100, ticks: { callback: (v) => v + "%" }, grid: { color: "#efeafc" }, border: { display: false } }, x: { grid: { display: false } } } } });
  }
}, "teacher");

/* ============================================================ teacher: take attendance */
route(/^\/t\/class\/(\d+)\/attend$/, async (id) => {
  const main = shell("#/t/attend", `<div class="page-loading"><span class="spinner dark"></span></div>`);
  const { class_: c } = await API.get(`/classes/${id}`).then((d) => d);
  let files = [], ready = false;
  Bio.ensureModels().then(() => { ready = true; const el = $("#ai-state"); if (el) { el.className = "chip present"; el.textContent = "● AI engine ready"; } }).catch((e) => { const el = $("#ai-state"); if (el) { el.className = "chip absent"; el.textContent = e.message; } });

  main.innerHTML = pageHead(`Attendance · ${esc(c.subject)}`, `${esc(c.code)} · Section ${esc(c.section)} · ${c.student_count} enrolled`,
    `<span class="chip" id="ai-state"><span class="spinner dark" style="width:12px;height:12px;border-width:2px"></span>&nbsp;Loading AI engine</span>`,
    `<a class="crumb" href="#/t/class/${c.id}">← ${esc(c.subject)}</a>`) + `
    <div class="stepper"><div class="s on" data-s="1"><i></i>1 · Upload photos</div><div class="s" data-s="2"><i></i>2 · Recognise faces</div><div class="s" data-s="3"><i></i>3 · Review &amp; save</div></div>
    <div id="stage"></div>`;
  const stage = $("#stage"), setStep = (n) => $$(".stepper .s").forEach((s) => { const k = +s.dataset.s; s.classList.toggle("on", k === n); s.classList.toggle("done", k < n); });

  if (!c.student_count) {
    stage.innerHTML = `<div class="card empty"><div class="big">${I.qr}</div><h3>No students yet</h3><p>Students must scan this class's QR code and enrol before you can take attendance.</p><a class="btn mt" href="#/t/class/${c.id}">Show QR code</a></div>`;
    return;
  }

  function renderUpload() {
    setStep(1);
    stage.innerHTML = `<div class="card">
      <label class="drop" id="drop"><div class="big">${I.upload}</div><h3>Drop class photos here, or click to browse</h3>
        <p class="muted small mt-s">Add several photos from different angles. A student who appears in more than one photo is still counted once.</p>
        <input type="file" id="files" accept="image/*" multiple hidden></label>
      <div class="thumbs" id="thumbs"></div>
      <div class="row spread mt no-print"><span class="muted small" id="count"></span><button class="btn lg" id="go" disabled>${I.scan} Mark attendance</button></div></div>`;
    const drop = $("#drop"), input = $("#files");
    const draw = () => {
      $("#thumbs").innerHTML = files.map((f, i) => `<div class="thumb"><img src="${f.url}" alt="Photo ${i + 1}"><button data-i="${i}" title="Remove">×</button></div>`).join("");
      $$("#thumbs button").forEach((b) => b.onclick = () => { URL.revokeObjectURL(files[b.dataset.i].url); files.splice(b.dataset.i, 1); draw(); });
      $("#count").textContent = files.length ? `${files.length} photo${files.length > 1 ? "s" : ""} selected` : "";
      $("#go").disabled = !files.length;
    };
    const add = (list) => { [...list].filter((f) => f.type.startsWith("image/")).forEach((f) => files.push({ file: f, url: URL.createObjectURL(f) })); draw(); };
    input.onchange = () => { add(input.files); input.value = ""; };
    ["dragover", "dragenter"].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (ev) => add(ev.dataTransfer.files));
    $("#go").onclick = analyze; draw();
  }

  const loadImg = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Couldn't read one of the photos.")); i.src = url; });

  async function analyze() {
    setStep(2);
    stage.innerHTML = `<div class="card center" style="padding:44px 24px"><div class="spinner dark" style="width:34px;height:34px;border-width:4px"></div>
      <h3 class="mt" id="ptitle">Preparing…</h3><p class="muted small mt-s" id="psub">Loading the face recognition engine</p>
      <div class="progress mt" style="max-width:420px;margin-inline:auto"><i id="bar"></i></div></div>`;
    try {
      await Bio.ensureModels();
      const photos = [], faces = [];
      for (let i = 0; i < files.length; i++) {
        $("#ptitle").textContent = `Scanning photo ${i + 1} of ${files.length}`; $("#psub").textContent = "Finding every face…";
        $("#bar").style.width = (i / files.length) * 100 + "%";
        await new Promise((r) => setTimeout(r, 30));
        const img = await loadImg(files[i].url);
        const det = await Bio.detectFaces(img);
        photos.push(det);
        det.faces.forEach((f, j) => faces.push({ key: `${i}-${j}`, photo: i, descriptor: f.descriptor }));
      }
      $("#bar").style.width = "100%"; $("#ptitle").textContent = "Matching with enrolled students"; $("#psub").textContent = `${faces.length} face${faces.length === 1 ? "" : "s"} found`;
      if (!faces.length) throw new Error("No faces were found in these photos. Try clearer, well-lit photos where faces are visible.");
      const res = await API.post(`/classes/${c.id}/attendance`, { faces, photos: files.length });
      renderReview(res.session, res.faces, photos);
    } catch (e) {
      stage.innerHTML = `<div class="card center"><div class="empty"><div class="big" style="background:var(--absent-soft);color:var(--absent)">${I.alert}</div><h3>Couldn't finish</h3><p>${esc(e.message)}</p></div><button class="btn" id="back">Back to photos</button></div>`;
      $("#back").onclick = renderUpload; setStep(1);
    }
  }

  function renderReview(session, results, photos) {
    setStep(3);
    const byKey = Object.fromEntries(results.map((r) => [r.key, r]));
    const unknown = results.filter((r) => r.status === "unknown").length, dups = results.filter((r) => r.status === "duplicate").length;
    stage.innerHTML = `
      <div class="stat-grid"><div class="stat hero-stat"><div class="lbl">Present</div><div class="val" id="s-present">${session.present}<span style="font-size:18px;opacity:.7"> / ${session.total}</span></div></div>
        <div class="stat"><div class="lbl">Absent</div><div class="val" id="s-absent">${session.total - session.present}</div></div>
        <div class="stat"><div class="lbl">Duplicates merged</div><div class="val">${dups}</div></div>
        <div class="stat"><div class="lbl">Unrecognised faces</div><div class="val">${unknown}</div></div></div>
      <div class="two-col mt"><div class="card"><h3>Recognised in your photos</h3><p class="small muted">Solid boxes = marked present · light = same student seen again (counted once) · orchid = unknown</p>
        <div class="stack mt-s" id="photos"></div></div>
        <div class="card"><div class="row spread"><h3>Roster</h3><span class="small muted">Flip the switch to correct</span></div><div class="roster mt-s" id="roster"></div>
        <div class="row mt no-print"><button class="btn grow" id="finish">${I.check} Save &amp; finish</button></div>
        <p class="small muted mt-s">Attendance is already saved. Any corrections you make are saved instantly.</p></div></div>`;
    const wrap = $("#photos");
    photos.forEach((p, i) => {
      const cv = document.createElement("canvas"); cv.width = p.canvas.width; cv.height = p.canvas.height;
      const cx = cv.getContext("2d"); cx.drawImage(p.canvas, 0, 0);
      const lw = Math.max(2, cv.width / 380), fs = Math.max(13, cv.width / 62);
      p.faces.forEach((f, j) => {
        const r = byKey[`${i}-${j}`]; if (!r) return;
        const col = r.status === "matched" ? "#7444df" : r.status === "duplicate" ? "#b9a2fa" : "#b9457c";
        const label = r.status === "unknown" ? "Unknown" : r.name.split(" ")[0] + (r.status === "duplicate" ? " ↺" : " ✓");
        cx.lineWidth = lw; cx.strokeStyle = col; cx.setLineDash(r.status === "duplicate" ? [lw * 3, lw * 2] : []);
        const b = f.box; cx.strokeRect(b.x, b.y, b.width, b.height);
        cx.font = `700 ${fs}px "Plus Jakarta Sans", sans-serif`; cx.setLineDash([]);
        const tw = cx.measureText(label).width + fs * .9, th = fs * 1.5, ty = b.y > th ? b.y - th : b.y + b.height;
        cx.fillStyle = col; cx.beginPath(); cx.roundRect(b.x - lw / 2, ty, tw, th, fs * .4); cx.fill();
        cx.fillStyle = "#fff"; cx.textBaseline = "middle"; cx.fillText(label, b.x + fs * .35, ty + th / 2 + 1);
      });
      const box = document.createElement("div"); box.className = "photo-result"; box.appendChild(cv);
      const cap = document.createElement("div"); cap.className = "small muted"; cap.style.margin = "6px 2px 0";
      cap.textContent = `Photo ${i + 1} · ${p.faces.length} face${p.faces.length === 1 ? "" : "s"}`;
      const w = document.createElement("div"); w.append(box, cap); wrap.appendChild(w);
    });
    drawRoster($("#roster"), session, (s) => { $("#s-present").innerHTML = `${s.present}<span style="font-size:18px;opacity:.7"> / ${s.total}</span>`; $("#s-absent").textContent = s.total - s.present; });
    $("#finish").onclick = () => { toast("Attendance saved ✓"); location.hash = `#/t/class/${c.id}`; };
  }
  renderUpload();
  onLeave(() => files.forEach((f) => URL.revokeObjectURL(f.url)));
}, "teacher");

/** Roster list with present/absent switch (used in review + session view). */
function drawRoster(el, session, onChange) {
  const draw = (s) => {
    el.innerHTML = s.records.map((r) => `<div class="item ${r.status}">
      <div class="avatar" style="width:34px;height:34px;border-radius:11px;font-size:13px;background:${r.status === "present" ? "var(--v-600);color:#fff" : "var(--v-100);color:var(--v-800)"}">${esc(initials(r.name))}</div>
      <div class="grow" style="min-width:0"><div style="font-weight:700">${esc(r.name)}</div>
        <div class="small muted">${esc(r.roll_no || "")}${r.roll_no ? " · " : ""}${r.status === "present" ? (r.method === "manual" ? "marked manually" : `face match${r.appearances > 1 ? ` · seen ${r.appearances}× (counted once)` : ""}`) : r.method === "manual" ? "marked absent manually" : "not found in photos"}</div></div>
      <span class="chip ${r.status}">${r.status === "present" ? "Present" : "Absent"}</span>
      <label class="switch" title="Toggle"><input type="checkbox" data-sid="${r.student_id}" ${r.status === "present" ? "checked" : ""}><span></span></label></div>`).join("");
    $$("input[data-sid]", el).forEach((cb) => cb.onchange = async () => {
      cb.disabled = true;
      try { const r = await API.patch(`/sessions/${s.id}/records/${cb.dataset.sid}`, { status: cb.checked ? "present" : "absent" }); session = r.session; draw(session); onChange && onChange(session); }
      catch (e) { toast(e.message, "err"); cb.checked = !cb.checked; cb.disabled = false; }
    });
  };
  draw(session);
}

route(/^\/t\/session\/(\d+)$/, async (id) => {
  const main = shell("#/t/classes", `<div class="page-loading"><span class="spinner dark"></span></div>`);
  const { session: s } = await API.get(`/sessions/${id}`);
  main.innerHTML = pageHead("Attendance session", fmtDate(s.taken_at), `<button class="btn ghost" onclick="history.back()">← Back</button>`) + `
    <div class="stat-grid"><div class="stat hero-stat"><div class="lbl">Present</div><div class="val" id="s-present">${s.present}<span style="font-size:18px;opacity:.7"> / ${s.total}</span></div></div>
      <div class="stat"><div class="lbl">Photos</div><div class="val">${s.photos}</div></div><div class="stat"><div class="lbl">Faces detected</div><div class="val">${s.faces_detected}</div></div>
      <div class="stat"><div class="lbl">Unrecognised</div><div class="val">${s.faces_unknown}</div></div></div>
    <div class="card mt"><h3>Roster</h3><div class="roster mt-s" id="roster"></div></div>`;
  drawRoster($("#roster"), s, (n) => { $("#s-present").innerHTML = `${n.present}<span style="font-size:18px;opacity:.7"> / ${n.total}</span>`; });
}, "teacher");

/* ============================================================ student auth */
route(/^\/student\/login$/, async () => {
  let method = "password";
  authShell("student", "Student login", "Choose how you'd like to sign in.", `
    <label class="field"><span>Email</span><input id="email" type="email" placeholder="you@school.edu" autocomplete="email"></label>
    <div class="tabs mt-s" id="tabs"><button data-m="password" class="on">${I.key.replace("<svg", '<svg width="15" height="15" style="vertical-align:-3px"')} Password</button><button data-m="face">${I.face.replace("<svg", '<svg width="15" height="15" style="vertical-align:-3px"')} Face</button><button data-m="voice">${I.mic.replace("<svg", '<svg width="15" height="15" style="vertical-align:-3px"')} Voice</button></div>
    <div id="pane" class="mt"></div><div id="err" class="mt-s"></div>
    <p class="center small muted mt-l">New student? Ask your teacher for the class QR · <a href="#/s/join-scan">Scan QR</a><br><a href="#/teacher/login">I'm a teacher</a></p>`, studentSide);
  const pane = $("#pane"), err = $("#err"); let widget;
  const emailVal = () => { const v = $("#email").value.trim(); if (!v) { $("#email").focus(); throw new Error("Enter your email first."); } return v; };
  const finish = (r) => { API.save(r.token, r.user); toast("Welcome, " + r.user.name.split(" ")[0] + " ✓"); location.hash = "#/s"; };
  const fail = (e) => { err.innerHTML = `<div class="alert">${esc(e.message)}</div>`; };
  const show = (m) => {
    method = m; err.innerHTML = ""; widget && widget.destroy(); widget = null; Bio.stopAll();
    $$("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
    if (m === "password") {
      pane.innerHTML = `<form class="stack"><label class="field"><span>Password</span><input type="password" name="password" required autocomplete="current-password"></label><button class="btn lg block" type="submit">Log in</button></form>`;
      $("form", pane).onsubmit = async (ev) => { ev.preventDefault(); err.innerHTML = ""; const b = $("button", pane); try { const email = emailVal(); finish(await withBusy(b, () => API.post("/student/login", { email, method: "password", password: ev.target.password.value }), "Checking")); } catch (e) { fail(e); } };
    } else if (m === "face") {
      widget = mountFaceScan(pane, { onDescriptor: async (d) => { err.innerHTML = ""; try { finish(await API.post("/student/login", { email: emailVal(), method: "face", descriptor: d })); } catch (e) { fail(e); } } });
    } else {
      widget = mountVoice(pane, { count: 1, seconds: 4, onDone: async (list, { reset }) => { err.innerHTML = ""; try { finish(await API.post("/student/login", { email: emailVal(), method: "voice", audio: list[0] })); } catch (e) { fail(e); reset(); } } });
    }
  };
  $$("#tabs button").forEach((b) => b.onclick = () => show(b.dataset.m));
  show("password"); onLeave(() => widget && widget.destroy());
});

route(/^\/s\/join-scan$/, async () => {
  const code = await scanQR();
  location.hash = code ? `#/join/${code}` : (API.user ? "#/s" : "#/student/login");
});

/** Student registration, reached from the QR code. */
route(/^\/join\/([A-Za-z0-9]+)$/, async (code) => {
  code = code.toUpperCase();
  let info;
  try { info = await API.get(`/join/${code}`); } catch (e) {
    app.innerHTML = `<div class="page-loading"><div class="card center" style="max-width:420px"><div class="empty"><div class="big" style="background:var(--absent-soft);color:var(--absent)">${I.alert}</div><h3>Invalid QR code</h3><p>${esc(e.message)}</p></div><a class="btn" href="#/">Home</a></div></div>`;
    return;
  }
  const banner = `<div class="join-banner"><div class="badge">${esc(info.code.slice(0, 3))}</div><div><div style="font-weight:800">${esc(info.subject)} <span class="muted" style="font-weight:600">· ${esc(info.code)}</span></div><div class="small muted">Section ${esc(info.section)} · ${esc(info.teacher_name)}</div></div></div>`;

  // already a logged-in student: just join
  if (API.user && API.user.role === "student" && API.token) {
    authShell("student", "Join this class", `You're signed in as ${esc(API.user.name)}.`, `${banner}<button class="btn lg block" id="j">Join ${esc(info.subject)}</button><p class="center small mt"><a href="#/s">Cancel</a></p>`, studentSide);
    $("#j").onclick = (ev) => withBusy(ev.currentTarget, async () => { await API.post("/student/join", { join_code: code }); toast("Joined " + info.subject + " ✓"); location.hash = "#/s"; });
    return;
  }

  const data = { face: null, voice: null };
  let step = 1, widget;
  const stepper = () => `<div class="stepper">${["Details", "Face", "Voice"].map((l, i) => `<div class="s ${i + 1 === step ? "on" : i + 1 < step ? "done" : ""}"><i></i>${i + 1} · ${l}</div>`).join("")}</div>`;
  authShell("student", "Register for class", "Create your account and enrol your biometrics — takes about a minute.", `<div id="wiz"></div>`, studentSide);
  const wiz = $("#wiz");
  const render = () => {
    widget && widget.destroy(); widget = null; Bio.stopAll();
    if (step === 1) {
      wiz.innerHTML = `${banner}${stepper()}<form class="stack" novalidate>
        <label class="field"><span>Full name</span><input name="name" required autocomplete="name" placeholder="e.g. Asha Verma" value="${esc(data.name || "")}"></label>
        <div class="grid2"><label class="field"><span>Roll number</span><input name="roll_no" placeholder="e.g. 21CS042" value="${esc(data.roll_no || "")}"></label>
        <label class="field"><span>Email</span><input type="email" name="email" required autocomplete="email" value="${esc(data.email || "")}"></label></div>
        <label class="field"><span>Password</span><input type="password" name="password" required minlength="6" autocomplete="new-password" placeholder="min 6 characters"></label>
        <div class="form-err"></div><button class="btn lg block" type="submit">Continue to face enrolment →</button>
        <p class="center small muted">Already have an account? <a href="#/student/login" id="lg">Log in</a> and then scan again.</p></form>`;
      bindForm($("form", wiz), async (d) => {
        if (!d.name.trim() || !d.email.trim()) throw new Error("Name and email are required.");
        if (d.password.length < 6) throw new Error("Password must be at least 6 characters.");
        Object.assign(data, d); step = 2; render();
      });
    } else if (step === 2) {
      wiz.innerHTML = `${stepper()}<h3 class="center" style="margin-bottom:14px">Enrol your face</h3><div id="fe"></div><p class="center mt"><a href="#" id="bk">← Back</a></p>`;
      widget = mountFaceEnroll($("#fe"), { need: 4, onDone: (caps) => { data.face = caps; setTimeout(() => { step = 3; render(); }, 700); } });
      $("#bk").onclick = (e) => { e.preventDefault(); step = 1; render(); };
    } else {
      wiz.innerHTML = `${stepper()}<h3 class="center" style="margin-bottom:6px">Enrol your voice</h3><p class="center small muted">Record the phrase 3 times in your natural voice.</p><div id="ve" class="mt"></div><div id="verr" class="mt-s"></div><p class="center mt"><a href="#" id="bk">← Back</a></p>`;
      widget = mountVoice($("#ve"), { count: 3, seconds: 4, onDone: async (samples, { reset }) => {
        try {
          $("#verr").innerHTML = `<div class="alert info"><span class="spinner dark" style="width:14px;height:14px;border-width:2px"></span>&nbsp; Creating your account…</div>`;
          const r = await API.post("/student/register", { name: data.name, email: data.email, password: data.password, roll_no: data.roll_no, join_code: code, face_descriptors: data.face, voice_samples: samples });
          API.save(r.token, r.user); toast("You're in! Welcome to " + info.subject + " 🎉"); location.hash = "#/s";
        } catch (e) {
          $("#verr").innerHTML = `<div class="alert">${esc(e.message)}</div>`;
          if (/face/i.test(e.message) && !/voice/i.test(e.message)) { data.face = null; step = 2; setTimeout(render, 1600); } else reset();
        }
      } });
      $("#bk").onclick = (e) => { e.preventDefault(); step = 2; render(); };
    }
  };
  render(); onLeave(() => widget && widget.destroy());
});

/* ============================================================ student dashboard */
route(/^\/s$/, async () => {
  const main = shell("#/s", `<div class="page-loading"><span class="spinner dark"></span></div>`);
  const { classes } = await API.get("/student/classes");
  const present = classes.reduce((a, c) => a + c.present, 0), total = classes.reduce((a, c) => a + c.total, 0);
  const overall = total ? (present * 100) / total : null, low = classes.filter((c) => c.percent != null && c.percent < 75).length;
  main.innerHTML = pageHead(`Hi, ${esc(API.user.name.split(" ")[0])} 👋`, "Your attendance across all classes.",
    `<a class="btn" href="#/s/join">${I.qr} Join a class</a>`) + `
    <div class="stat-grid">
      <div class="stat hero-stat"><div class="ic">${I.chart}</div><div class="lbl">Overall attendance</div><div class="val">${pct(overall)}</div></div>
      <div class="stat"><div class="ic">${I.book}</div><div class="lbl">Classes</div><div class="val">${classes.length}</div></div>
      <div class="stat"><div class="ic">${I.check}</div><div class="lbl">Days present</div><div class="val">${present}<span style="font-size:18px;color:var(--muted)"> / ${total}</span></div></div>
      <div class="stat"><div class="ic">${I.alert}</div><div class="lbl">Below 75%</div><div class="val">${low}</div></div></div>
    <div class="two-col mt">
      <div class="stack">${classes.length ? classes.map((c) => `<div class="card"><div class="row" style="gap:18px;align-items:flex-start">
        <div class="ring ${c.percent != null && c.percent < 75 ? "low" : ""}" style="--p:${c.percent || 0}"><b>${pct(c.percent)}</b></div>
        <div class="grow" style="min-width:0"><div class="row spread wrap"><span class="code chip">${esc(c.code)}</span><span class="chip">Sec ${esc(c.section)}</span></div>
        <h3 style="margin-top:8px;font-size:19px">${esc(c.subject)}</h3><div class="small muted">${esc(c.teacher_name)} · ${c.present} of ${c.total} sessions attended</div>
        ${c.history.length ? `<div class="hist" title="Most recent first">${c.history.slice(0, 40).map((h) => `<i class="${h.status === "present" ? "" : "a"}" title="${fmtDate(h.taken_at)} — ${h.status}"></i>`).join("")}</div>` : `<p class="small muted mt-s">No sessions yet.</p>`}
        ${c.percent != null && c.percent < 75 ? `<div class="alert mt-s small">Below 75% — attend the next few classes to catch up.</div>` : ""}</div></div></div>`).join("") :
        `<div class="card empty"><div class="big">${I.qr}</div><h3>No classes yet</h3><p>Scan a QR code from your teacher to join.</p><a class="btn mt-s" href="#/s/join">Join a class</a></div>`}</div>
      <div class="card"><h3>Present vs absent</h3>${total ? `<div class="chart-box mt-s"><canvas id="donut"></canvas></div>` : `<div class="empty"><p>Your chart appears after the first session.</p></div>`}
        <div class="alert info small mt"><b>${I.shield.replace("<svg", '<svg width="14" height="14" style="vertical-align:-2px"')} Your biometrics</b><br>Only numeric face &amp; voice prints are stored — never your photos.</div></div>
    </div>`;
  if (total) makeChart($("#donut"), { type: "doughnut", data: { labels: ["Present", "Absent"], datasets: [{ data: [present, total - present], backgroundColor: ["#7444df", "#e9b5cf"], borderWidth: 0, hoverOffset: 6 }] }, options: { maintainAspectRatio: false, cutout: "68%", plugins: { legend: { position: "bottom", labels: { usePointStyle: true, padding: 18 } } } } });
}, "student");

route(/^\/s\/join$/, async () => {
  const main = shell("#/s/join", "");
  main.innerHTML = pageHead("Join a class", "Scan the QR code your teacher shares, or type the 6-character code.") + `
    <div class="grid2"><div class="card center"><div class="empty"><div class="big">${I.qr}</div><h3>Scan with camera</h3><p>Point your camera at the class QR code.</p></div><button class="btn lg" id="scan">${I.camera} Scan QR</button></div>
    <div class="card"><h3>Enter code</h3><form class="stack mt-s"><label class="field"><span>Join code</span><input name="code" maxlength="6" placeholder="ABC123" style="text-transform:uppercase;letter-spacing:.25em;font-weight:800;font-size:20px;text-align:center" required></label><div class="form-err"></div><button class="btn block" type="submit">Join class</button></form></div></div>`;
  const go = async (code) => { const info = await API.get(`/join/${code}`); await API.post("/student/join", { join_code: code }); toast(`Joined ${info.subject} ✓`); location.hash = "#/s"; };
  $("#scan").onclick = async () => { const c = await scanQR(); if (c) { try { await go(c); } catch (e) { toast(e.message, "err"); } } };
  bindForm($("form", main), async (d) => { const c = parseJoinCode(d.code); if (!c) throw new Error("Codes are 6 letters/numbers."); await go(c); });
}, "student");

/* ============================================================ boot */
(async function boot() {
  if (API.token) {
    try { const r = await API.get("/me"); API.user = r.user; } catch (e) { API.clear(); }
  }
  navigate();
})();
