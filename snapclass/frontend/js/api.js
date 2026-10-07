/* Tiny API client + session store */
const API = {
  token: null,
  user: null,
  load() {
    try {
      this.token = localStorage.getItem("snapclass.token");
      this.user = JSON.parse(localStorage.getItem("snapclass.user") || "null");
    } catch (e) { /* storage blocked */ }
  },
  save(token, user) {
    this.token = token; this.user = user;
    try {
      localStorage.setItem("snapclass.token", token);
      localStorage.setItem("snapclass.user", JSON.stringify(user));
    } catch (e) { /* ignore */ }
  },
  clear() {
    this.token = null; this.user = null;
    try { localStorage.removeItem("snapclass.token"); localStorage.removeItem("snapclass.user"); } catch (e) { /* ignore */ }
  },
  async req(method, path, body) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.token) headers.Authorization = "Bearer " + this.token;
    let res;
    try {
      res = await fetch("/api" + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new Error("Can't reach the server. Is it running?");
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* non-json */ }
    if (!res.ok) {
      const err = new Error(data.error || "Something went wrong (" + res.status + ")");
      err.status = res.status;
      if (res.status === 401 && this.token && !path.includes("/login")) { this.clear(); }
      throw err;
    }
    return data;
  },
  get(p) { return this.req("GET", p); },
  post(p, b) { return this.req("POST", p, b || {}); },
  patch(p, b) { return this.req("PATCH", p, b || {}); },
  del(p) { return this.req("DELETE", p); },
  async download(path, filename) {
    const res = await fetch("/api" + path, { headers: { Authorization: "Bearer " + this.token } });
    if (!res.ok) throw new Error("Download failed");
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};
API.load();
