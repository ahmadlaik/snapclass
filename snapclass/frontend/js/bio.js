/* Biometrics in the browser: face detection + descriptors (face-api.js) and voice recording (WAV). */
const Bio = (() => {
  const streams = new Set();
  let modelsPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.faceapi) return resolve();
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("Could not load the face engine."));
      document.head.appendChild(s);
    });
  }

  function ensureModels() {
    if (!modelsPromise) {
      modelsPromise = (async () => {
        await loadScript("/vendor/face-api.js");
        // GPU (WebGL) when available, plain CPU otherwise. (The bundled WASM backend needs extra binaries.)
        for (const backend of ["webgl", "cpu"]) {
          try { if (await faceapi.tf.setBackend(backend)) { await faceapi.tf.ready(); break; } } catch (e) { /* try next */ }
        }
        const u = "/vendor/models";
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(u),
          faceapi.nets.faceLandmark68Net.loadFromUri(u),
          faceapi.nets.faceRecognitionNet.loadFromUri(u),
        ]);
      })().catch((e) => { modelsPromise = null; throw e; });
    }
    return modelsPromise;
  }

  /* ---------- camera ---------- */
  async function startCamera(video) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Camera needs a secure page. Open SnapClass on localhost or over HTTPS.");
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      throw new Error(e.name === "NotAllowedError" ? "Camera permission was blocked. Allow it in your browser and retry." : "No camera found.");
    }
    streams.add(stream);
    video.srcObject = stream;
    video.muted = true; video.playsInline = true;
    await video.play();
    return stream;
  }
  function stopStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
    streams.delete(stream);
  }
  function stopAll() { [...streams].forEach(stopStream); }

  const round = (arr) => Array.from(arr, (v) => Math.round(v * 1e5) / 1e5);

  /** One clear face from a live video -> 128 numbers, or throws a helpful error. */
  async function captureFace(video) {
    await ensureModels();
    const det = await faceapi
      .detectAllFaces(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))
      .withFaceLandmarks().withFaceDescriptors();
    if (det.length === 0) throw new Error("No face found. Centre your face in the oval with good light.");
    if (det.length > 1) throw new Error("More than one face in view. Only you should be in the frame.");
    const b = det[0].detection.box;
    if (b.width < video.videoWidth * 0.2) throw new Error("Move a little closer to the camera.");
    return round(det[0].descriptor);
  }

  /* ---------- group photos ---------- */
  function iou(a, b) {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width), y2 = Math.min(a.y + a.height, b.y + b.height);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return inter / (a.width * a.height + b.width * b.height - inter + 1e-9);
  }

  /**
   * Detect every face in an image. Large photos are also scanned in overlapping tiles so
   * small faces at the back of a classroom aren't missed; duplicates are merged by IoU.
   */
  async function detectFaces(img, maxSide = 1800) {
    await ensureModels();
    const sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
    const k = Math.min(1, maxSide / Math.max(sw, sh));
    const W = Math.round(sw * k), H = Math.round(sh * k);
    const base = document.createElement("canvas");
    base.width = W; base.height = H;
    base.getContext("2d").drawImage(img, 0, 0, W, H);

    const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
    const regions = [{ x: 0, y: 0, w: W, h: H }];
    if (Math.max(W, H) >= 900) {
      const tw = Math.round(W * 0.6), th = Math.round(H * 0.6);
      for (const x of [0, W - tw]) for (const y of [0, H - th]) regions.push({ x, y, w: tw, h: th });
    }
    const found = [];
    for (const r of regions) {
      let src = base, ox = 0, oy = 0;
      if (r.w !== W || r.h !== H) {
        src = document.createElement("canvas");
        src.width = r.w; src.height = r.h;
        src.getContext("2d").drawImage(base, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        ox = r.x; oy = r.y;
      }
      const res = await faceapi.detectAllFaces(src, opts).withFaceLandmarks().withFaceDescriptors();
      for (const d of res) {
        const b = d.detection.box;
        found.push({
          box: { x: b.x + ox, y: b.y + oy, width: b.width, height: b.height },
          score: d.detection.score, descriptor: round(d.descriptor),
        });
      }
    }
    found.sort((a, b) => b.score - a.score);
    const kept = [];
    for (const f of found) if (!kept.some((o) => iou(o.box, f.box) > 0.35)) kept.push(f);
    kept.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
    return { canvas: base, faces: kept };
  }

  /* ---------- voice ---------- */
  function encodeWav(samples, rate) {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buf], { type: "audio/wav" });
  }
  function resample(data, from, to) {
    if (from === to) return data;
    const n = Math.floor((data.length * to) / from), out = new Float32Array(n), ratio = from / to;
    for (let i = 0; i < n; i++) {
      const p = i * ratio, i0 = Math.floor(p), i1 = Math.min(i0 + 1, data.length - 1), f = p - i0;
      out[i] = data[i0] * (1 - f) + data[i1] * f;
    }
    return out;
  }
  const blobToB64 = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

  /** Record `ms` of mono audio, return a base64 16 kHz WAV data-URL. onLevel(0..1) drives the visualiser. */
  async function recordWav(ms = 4000, onLevel = () => {}) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Microphone needs a secure page. Open SnapClass on localhost or over HTTPS.");
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true }, video: false });
    } catch (e) {
      throw new Error(e.name === "NotAllowedError" ? "Microphone permission was blocked. Allow it and retry." : "No microphone found.");
    }
    streams.add(stream);
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(d));
      let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      onLevel(Math.min(1, Math.sqrt(s / d.length) * 6));
    };
    src.connect(proc); proc.connect(ctx.destination);
    await new Promise((r) => setTimeout(r, ms));
    proc.disconnect(); src.disconnect(); stopStream(stream);
    const rate = ctx.sampleRate; ctx.close();
    const total = chunks.reduce((n, c) => n + c.length, 0), all = new Float32Array(total);
    let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    onLevel(0);
    return blobToB64(encodeWav(resample(all, rate, 16000), 16000));
  }

  return { ensureModels, startCamera, stopStream, stopAll, captureFace, detectFaces, recordWav };
})();
