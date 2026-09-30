// Client-side meeting recorder: composites all participant video tiles onto a
// canvas and mixes everyone's audio, then records to a downloadable .webm.
// No screen-share prompt required.

function drawCover(ctx, video, x, y, w, h) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return false;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(video, dx, dy, dw, dh);
  return true;
}

export class MeetingRecorder {
  constructor(getSources) {
    this.getSources = getSources; // () => [{stream, name, video}]
    this.videoEls = new Map(); // streamId -> <video>
    this.audioAdded = new Set(); // streamId
    this.chunks = [];
    this.raf = null;
    this.recording = false;
  }

  _videoFor(stream) {
    if (!stream) return null;
    let el = this.videoEls.get(stream.id);
    if (!el) {
      el = document.createElement("video");
      el.muted = true;
      el.playsInline = true;
      el.autoplay = true;
      el.srcObject = stream;
      el.play().catch(() => {});
      this.videoEls.set(stream.id, el);
    }
    return el;
  }

  _drawFrame() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.fillStyle = "#090A0F";
    ctx.fillRect(0, 0, W, H);

    const sources = (this.getSources() || []).filter((s) => s && s.stream);
    const n = Math.max(sources.length, 1);
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const gap = 8;
    const cw = (W - gap * (cols + 1)) / cols;
    const ch = (H - gap * (rows + 1)) / rows;

    sources.forEach((s, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = gap + c * (cw + gap);
      const y = gap + r * (ch + gap);

      // Mix in late-joining audio
      if (s.stream.getAudioTracks().length && !this.audioAdded.has(s.stream.id)) {
        try {
          const node = this.audioCtx.createMediaStreamSource(s.stream);
          node.connect(this.audioDest);
          this.audioAdded.add(s.stream.id);
        } catch (e) {
          /* ignore */
        }
      }

      ctx.save();
      ctx.fillStyle = "#12151E";
      ctx.fillRect(x, y, cw, ch);
      ctx.beginPath();
      ctx.rect(x, y, cw, ch);
      ctx.clip();

      const hasVideo = s.video && s.stream.getVideoTracks().some((t) => t.enabled);
      let drew = false;
      if (hasVideo) {
        const el = this._videoFor(s.stream);
        if (el && el.readyState >= 2) drew = drawCover(ctx, el, x, y, cw, ch);
      }
      if (!drew) {
        const initial = (s.name || "?").charAt(0).toUpperCase();
        const cx = x + cw / 2;
        const cy = y + ch / 2 - 10;
        const rad = Math.min(cw, ch) * 0.16;
        ctx.fillStyle = "#262A38";
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#E07A5F";
        ctx.font = `bold ${rad}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(initial, cx, cy);
      }
      ctx.restore();

      // Name label
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      const label = s.name || "Guest";
      ctx.font = "14px Arial";
      const tw = ctx.measureText(label).width + 16;
      ctx.fillRect(x + 8, y + ch - 30, tw, 22);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + 16, y + ch - 19);
    });

    this.raf = requestAnimationFrame(() => this._drawFrame());
  }

  async start() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.ctx = this.canvas.getContext("2d");

    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.audioDest = this.audioCtx.createMediaStreamDestination();

    this._drawFrame();

    const canvasStream = this.canvas.captureStream(30);
    const tracks = [
      ...canvasStream.getVideoTracks(),
      ...this.audioDest.stream.getAudioTracks(),
    ];
    this.mixed = new MediaStream(tracks);

    const types = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
    this.recorder = new MediaRecorder(this.mixed, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.recorder.start(1000);
    this.recording = true;
  }

  stop(filename = "engraved-word-recording.webm") {
    return new Promise((resolve) => {
      if (!this.recorder || !this.recording) return resolve(null);
      this.recorder.onstop = () => {
        cancelAnimationFrame(this.raf);
        const blob = new Blob(this.chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        this.videoEls.forEach((el) => (el.srcObject = null));
        this.videoEls.clear();
        try { this.audioCtx.close(); } catch (e) { /* ignore */ }
        this.recording = false;
        resolve(blob);
      };
      this.recorder.stop();
    });
  }
}
