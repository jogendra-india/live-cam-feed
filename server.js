/**
 * LAN-STREAM Server
 * --------------------------------------------------------------
 * Responsibilities:
 *   1. WebRTC signaling between broadcasters and viewers
 *   2. Maintain registry of active streams (multi-broadcaster)
 *   3. Receive recording chunks from broadcasters → write to disk
 *   4. Relay viewer remote-control commands to broadcasters
 *   5. Expose REST API for stream list & recording management
 */

const express  = require("express");
const http     = require("http");
const https    = require("https");
const fs       = require("fs");
const path     = require("path");
const os       = require("os");
const { Server } = require("socket.io");

const RECORDINGS_DIR = path.join(__dirname, "recordings");
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

const DATA_DIR = path.join(__dirname, "data");
const TM_MODELS_FILE = path.join(DATA_DIR, "tm_models.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/recordings", express.static(RECORDINGS_DIR));

// ───────────────────────────────────────────────────────────────────
//   STATE
// ───────────────────────────────────────────────────────────────────
/**
 * streams: streamId → {
 *   socketId, name, hasVideo, hasAudio, videoEnabled,
 *   allowRemoteControl, startedAt, viewers: Set<socketId>,
 *   recording: { active, filename, startedAt, writeStream } | null
 * }
 */
const streams        = new Map();
const viewerToStream = new Map(); // viewerSocketId → streamId

const ID_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // unambiguous chars

function isValidPreferredId(s) {
  if (typeof s !== "string" || s.length !== 4) return false;
  const up = s.toUpperCase();
  for (const c of up) if (!ID_CHARS.includes(c)) return false;
  return true;
}

function generateStreamId(preferred) {
  // If the broadcaster is reconnecting after a refresh, they pass back the
  // streamId they were last assigned. We honor it iff it parses as one of
  // our IDs and isn't currently in use, so viewers' bookmarks stay valid.
  if (preferred && isValidPreferredId(preferred)) {
    const up = preferred.toUpperCase();
    if (!streams.has(up)) return up;
  }
  let id;
  do {
    id = "";
    for (let i = 0; i < 4; i++) id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  } while (streams.has(id));
  return id;
}

function publicStream(id, s) {
  return {
    id,
    name: s.name,
    hasAudio: s.hasAudio,
    videoEnabled: s.videoEnabled,
    allowRemoteControl: s.allowRemoteControl,
    viewers: s.viewers.size,
    startedAt: s.startedAt,
    recording: s.recording ? {
      active: true,
      startedAt: s.recording.startedAt,
      filename: s.recording.filename
    } : { active: false }
  };
}

function getStreamList() {
  return Array.from(streams.entries()).map(([id, s]) => publicStream(id, s));
}

function broadcastStreamList() {
  io.emit("streams:updated", getStreamList());
}

function sanitizeFilename(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
}

// ───────────────────────────────────────────────────────────────────
//   TEACHABLE MACHINE MODEL REGISTRY (shared across all viewers)
// ───────────────────────────────────────────────────────────────────
function loadTMModels() {
  try {
    if (!fs.existsSync(TM_MODELS_FILE)) return [];
    const raw = fs.readFileSync(TM_MODELS_FILE, "utf8");
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn("Could not read tm_models.json:", e.message);
    return [];
  }
}
function saveTMModels(list) {
  try {
    fs.writeFileSync(TM_MODELS_FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error("Could not save tm_models.json:", e.message);
  }
}
function normalizeTMUrl(raw) {
  let u = String(raw || "").trim();
  u = u.replace(/(model\.json|metadata\.json)(\?.*)?$/i, "");
  if (u && !u.endsWith("/")) u += "/";
  return u;
}
let tmModels = loadTMModels(); // [{ url, name, classes, addedAt }]
function broadcastTMModels() { io.emit("tm-models:updated", tmModels); }

// ───────────────────────────────────────────────────────────────────
//   REST API
// ───────────────────────────────────────────────────────────────────
app.get("/api/streams", (_req, res) => res.json(getStreamList()));

app.get("/api/streams/:id", (req, res) => {
  const id = req.params.id.toUpperCase();
  const s  = streams.get(id);
  if (!s) return res.status(404).json({ error: "Stream not found" });
  res.json(publicStream(id, s));
});

app.get("/api/recordings", (_req, res) => {
  fs.readdir(RECORDINGS_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    const list = files
      .filter(f => f.endsWith(".webm"))
      .map(f => {
        const stat = fs.statSync(path.join(RECORDINGS_DIR, f));
        return {
          filename: f,
          url: `/recordings/${f}`,
          size: stat.size,
          createdAt: stat.birthtimeMs || stat.ctimeMs,
          modifiedAt: stat.mtimeMs
        };
      })
      .sort((a, b) => b.modifiedAt - a.modifiedAt);
    res.json(list);
  });
});

app.delete("/api/recordings/:filename", (req, res) => {
  const safe = path.basename(req.params.filename);
  const file = path.join(RECORDINGS_DIR, safe);
  if (!file.startsWith(RECORDINGS_DIR)) return res.status(400).json({ error: "Invalid path" });
  fs.unlink(file, (err) => {
    if (err) return res.status(404).json({ error: err.message });
    res.json({ ok: true });
  });
});

// ── Custom AI model registry (Teachable Machine URLs) ──
app.get("/api/tm-models", (_req, res) => res.json(tmModels));

app.post("/api/tm-models", (req, res) => {
  const { url, name, classes } = req.body || {};
  if (!url || !/^https?:\/\//i.test(String(url))) {
    return res.status(400).json({ error: "Invalid URL" });
  }
  const finalUrl = normalizeTMUrl(url);
  if (!finalUrl) return res.status(400).json({ error: "Invalid URL" });
  if (tmModels.find(m => m.url === finalUrl)) {
    return res.status(409).json({ error: "Model already registered" });
  }
  const entry = {
    url: finalUrl,
    name: String(name || "").trim() ||
          finalUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    classes: Array.isArray(classes) ? classes.map(String) : [],
    addedAt: Date.now()
  };
  tmModels.push(entry);
  saveTMModels(tmModels);
  broadcastTMModels();
  console.log(`[TM+] ${entry.name} (${entry.classes.length} classes) ${entry.url}`);
  res.json(entry);
});

app.delete("/api/tm-models", (req, res) => {
  const url = normalizeTMUrl(req.query.url || "");
  const idx = tmModels.findIndex(m => m.url === url);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  const removed = tmModels.splice(idx, 1)[0];
  saveTMModels(tmModels);
  broadcastTMModels();
  console.log(`[TM-] ${removed.name} ${removed.url}`);
  res.json({ ok: true, removed });
});

// ───────────────────────────────────────────────────────────────────
//   HTTP / HTTPS auto-detection
// ───────────────────────────────────────────────────────────────────
let server;
let isHttps = false;
try {
  const key  = fs.readFileSync(path.join(__dirname, "certs", "key.pem"));
  const cert = fs.readFileSync(path.join(__dirname, "certs", "cert.pem"));
  server  = https.createServer({ key, cert }, app);
  isHttps = true;
} catch {
  server = http.createServer(app);
}

const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e8 // 100 MB to allow large recording chunks
});

// ───────────────────────────────────────────────────────────────────
//   SOCKET.IO
// ───────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  socket.emit("streams:updated", getStreamList());
  socket.emit("tm-models:updated", tmModels);

  // ── BROADCASTER ───────────────────────────────────────────────
  socket.on("broadcaster:register", ({ name, preferredStreamId } = {}, cb) => {
    const streamId = generateStreamId(preferredStreamId);
    streams.set(streamId, {
      socketId: socket.id,
      name: (name || "").trim() || `Cam-${streamId}`,
      hasAudio: false,
      hasVideo: true,
      videoEnabled: true,
      allowRemoteControl: true,
      startedAt: Date.now(),
      viewers: new Set(),
      recording: null
    });
    socket.streamId = streamId;
    socket.role = "broadcaster";
    console.log(`[B+] "${streams.get(streamId).name}" → ${streamId}`);
    if (typeof cb === "function") cb({ streamId, name: streams.get(streamId).name });
    broadcastStreamList();
  });

  // Broadcaster reports state changes (audio/video toggled, remote control on/off)
  socket.on("broadcaster:state", ({ hasAudio, videoEnabled, allowRemoteControl }) => {
    const s = streams.get(socket.streamId);
    if (!s) return;
    if (typeof hasAudio === "boolean") s.hasAudio = hasAudio;
    if (typeof videoEnabled === "boolean") s.videoEnabled = videoEnabled;
    if (typeof allowRemoteControl === "boolean") s.allowRemoteControl = allowRemoteControl;
    broadcastStreamList();
    // Tell viewers of this stream too (they may show indicators)
    s.viewers.forEach(vid => io.to(vid).emit("stream:state", publicStream(socket.streamId, s)));
  });

  // Broadcaster ends the stream without disconnecting the socket
  socket.on("broadcaster:unregister", () => {
    if (socket.role !== "broadcaster" || !socket.streamId) return;
    const s = streams.get(socket.streamId);
    if (s) {
      if (s.recording) finalizeRecording(socket.streamId);
      s.viewers.forEach(vid => {
        io.to(vid).emit("broadcaster:offline", { streamId: socket.streamId });
        viewerToStream.delete(vid);
      });
      streams.delete(socket.streamId);
      console.log(`[B-] Stream unregistered: ${socket.streamId}`);
      broadcastStreamList();
    }
    socket.streamId = null;
  });

  // ── REMOTE ALARM (viewer → broadcaster) ──────────────────────
  socket.on("alarm:start", ({ streamId }) => {
    streamId = (streamId || "").toUpperCase();
    const s = streams.get(streamId);
    if (s) io.to(s.socketId).emit("alarm:incoming", { action: "start", from: socket.id });
  });

  socket.on("alarm:stop", ({ streamId }) => {
    streamId = (streamId || "").toUpperCase();
    const s = streams.get(streamId);
    if (s) io.to(s.socketId).emit("alarm:incoming", { action: "stop", from: socket.id });
  });

  // ── TALKBACK STATUS (informational only — audio flows over WebRTC) ──
  socket.on("talkback:state", ({ streamId, talking }) => {
    streamId = (streamId || "").toUpperCase();
    const s = streams.get(streamId);
    if (s) io.to(s.socketId).emit("talkback:viewer", { talking: !!talking, from: socket.id });
  });

  // WebRTC signaling
  socket.on("broadcaster:offer", ({ viewerId, offer }) => {
    io.to(viewerId).emit("broadcaster:offer", {
      offer, streamId: socket.streamId, broadcasterSocketId: socket.id
    });
  });

  socket.on("broadcaster:ice", ({ viewerId, candidate }) => {
    io.to(viewerId).emit("broadcaster:ice", { candidate });
  });

  // ── RECORDING ─────────────────────────────────────────────────
  socket.on("recording:start", ({ streamId }) => {
    streamId = (streamId || socket.streamId || "").toUpperCase();
    const s  = streams.get(streamId);
    if (!s)            return socket.emit("recording:error", { message: "Stream not found" });
    if (s.recording)   return socket.emit("recording:error", { message: "Already recording" });

    // Create file
    const ts       = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const safeName = sanitizeFilename(s.name);
    const filename = `${streamId}-${safeName}-${ts}.webm`;
    const filepath = path.join(RECORDINGS_DIR, filename);

    s.recording = {
      filename,
      filepath,
      startedAt: Date.now(),
      writeStream: fs.createWriteStream(filepath),
      bytes: 0
    };

    // Tell broadcaster to start MediaRecorder
    io.to(s.socketId).emit("recording:start", { streamId, filename });

    // Notify all clients
    io.emit("recording:status", {
      streamId, active: true, filename, startedAt: s.recording.startedAt
    });
    broadcastStreamList();
    console.log(`[REC▶] ${streamId} → ${filename}`);
  });

  socket.on("recording:stop", ({ streamId }) => {
    streamId = (streamId || socket.streamId || "").toUpperCase();
    const s = streams.get(streamId);
    if (!s || !s.recording) return;
    finalizeRecording(streamId);
  });

  // Receive a chunk from broadcaster
  socket.on("recording:chunk", ({ streamId, chunk }) => {
    streamId = (streamId || socket.streamId || "").toUpperCase();
    const s  = streams.get(streamId);
    if (!s || !s.recording || !s.recording.writeStream) return;
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    s.recording.writeStream.write(buf);
    s.recording.bytes += buf.length;
  });

  // ── REMOTE CONTROL (viewer → broadcaster) ─────────────────────
  socket.on("control:request", ({ streamId, action }) => {
    streamId = (streamId || "").toUpperCase();
    const s  = streams.get(streamId);
    if (!s) return socket.emit("control:error", { message: "Stream not found" });
    if (!s.allowRemoteControl) return socket.emit("control:error", { message: "Remote control disabled" });

    const allowed = ["pause_video", "resume_video", "flip_camera", "toggle_audio", "start_recording", "stop_recording"];
    if (!allowed.includes(action)) return socket.emit("control:error", { message: "Unknown action" });

    // Recording actions go through their dedicated server-side handlers
    if (action === "start_recording") { handleRecordingStart(streamId); return; }
    if (action === "stop_recording")  { finalizeRecording(streamId);    return; }

    io.to(s.socketId).emit("control:apply", { action, requestedBy: socket.id });
  });

  // ── VIEWER ────────────────────────────────────────────────────
  socket.on("viewer:watch", ({ streamId }) => {
    streamId = (streamId || "").toUpperCase();
    const s  = streams.get(streamId);
    if (!s) return socket.emit("viewer:error", { message: "Stream not found", streamId });

    const oldId = viewerToStream.get(socket.id);
    if (oldId && oldId !== streamId) {
      const old = streams.get(oldId);
      if (old) {
        old.viewers.delete(socket.id);
        io.to(old.socketId).emit("viewer:left", { viewerId: socket.id });
      }
    }

    s.viewers.add(socket.id);
    viewerToStream.set(socket.id, streamId);
    socket.role = "viewer";
    io.to(s.socketId).emit("viewer:joined", { viewerId: socket.id });
    socket.emit("stream:state", publicStream(streamId, s));
    broadcastStreamList();
  });

  socket.on("viewer:answer", ({ answer }) => {
    const sid = viewerToStream.get(socket.id);
    const s   = sid && streams.get(sid);
    if (s) io.to(s.socketId).emit("viewer:answer", { viewerId: socket.id, answer });
  });

  socket.on("viewer:ice", ({ candidate }) => {
    const sid = viewerToStream.get(socket.id);
    const s   = sid && streams.get(sid);
    if (s) io.to(s.socketId).emit("viewer:ice", { viewerId: socket.id, candidate });
  });

  socket.on("viewer:unwatch", () => {
    const sid = viewerToStream.get(socket.id);
    const s   = sid && streams.get(sid);
    if (s) {
      s.viewers.delete(socket.id);
      io.to(s.socketId).emit("viewer:left", { viewerId: socket.id });
      broadcastStreamList();
    }
    viewerToStream.delete(socket.id);
  });

  // ── DISCONNECT ────────────────────────────────────────────────
  socket.on("disconnect", () => {
    if (socket.role === "broadcaster" && socket.streamId) {
      const s = streams.get(socket.streamId);
      if (s) {
        // Finalize any active recording
        if (s.recording) finalizeRecording(socket.streamId);
        // Notify viewers
        s.viewers.forEach(vid => {
          io.to(vid).emit("broadcaster:offline", { streamId: socket.streamId });
          viewerToStream.delete(vid);
        });
        streams.delete(socket.streamId);
        console.log(`[B-] Stream ended: ${socket.streamId}`);
        broadcastStreamList();
      }
    }
    if (socket.role === "viewer") {
      const sid = viewerToStream.get(socket.id);
      const s   = sid && streams.get(sid);
      if (s) {
        s.viewers.delete(socket.id);
        io.to(s.socketId).emit("viewer:left", { viewerId: socket.id });
        broadcastStreamList();
      }
      viewerToStream.delete(socket.id);
    }
  });

  // Helper used by control:request action="start_recording"
  function handleRecordingStart(streamId) {
    const s = streams.get(streamId);
    if (!s || s.recording) return;
    const ts       = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const safeName = sanitizeFilename(s.name);
    const filename = `${streamId}-${safeName}-${ts}.webm`;
    const filepath = path.join(RECORDINGS_DIR, filename);
    s.recording = {
      filename, filepath, startedAt: Date.now(),
      writeStream: fs.createWriteStream(filepath), bytes: 0
    };
    io.to(s.socketId).emit("recording:start", { streamId, filename });
    io.emit("recording:status", {
      streamId, active: true, filename, startedAt: s.recording.startedAt
    });
    broadcastStreamList();
    console.log(`[REC▶] ${streamId} → ${filename}`);
  }
});

// Finalize: close write stream, notify everyone
function finalizeRecording(streamId) {
  const s = streams.get(streamId);
  if (!s || !s.recording) return;
  const { writeStream, filename, startedAt, bytes } = s.recording;
  const duration = Math.round((Date.now() - startedAt) / 1000);
  writeStream.end();
  s.recording = null;

  // Tell broadcaster to stop MediaRecorder
  io.to(s.socketId).emit("recording:stop", { streamId });

  io.emit("recording:status", {
    streamId, active: false, filename, duration, bytes
  });
  broadcastStreamList();
  console.log(`[REC■] ${streamId} → ${filename} (${duration}s, ${(bytes/1024/1024).toFixed(1)} MB)`);
}

// ───────────────────────────────────────────────────────────────────
//   START
// ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  const proto = isHttps ? "https" : "http";
  const nets  = os.networkInterfaces();
  const ips   = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) ips.push(net.address);
    }
  }

  console.log("\n┌────────────────────────────────────────────────────────┐");
  console.log("│           LAN-STREAM v3  ·  Live Server                  │");
  console.log("├────────────────────────────────────────────────────────┤");
  console.log(`│  Mode    : ${(isHttps ? "HTTPS (secure)" : "HTTP").padEnd(44)}│`);
  console.log(`│  Local   : ${proto}://localhost:${PORT}`.padEnd(57) + "│");
  ips.forEach(ip =>
    console.log(`│  LAN     : ${proto}://${ip}:${PORT}`.padEnd(57) + "│")
  );
  console.log("├────────────────────────────────────────────────────────┤");
  console.log("│  📱 Broadcaster  →  /broadcast.html                      │");
  console.log("│  🖥️  Full viewer  →  /view.html                          │");
  console.log("│  🪟 Embed        →  /embed.html?id=XXXX                 │");
  console.log("│  💾 Recordings   →  /recordings.html                     │");
  console.log("│  🔌 REST API     →  /api/streams · /api/recordings      │");
  console.log("└────────────────────────────────────────────────────────┘");
  if (!isHttps) {
    console.log("\n  ⚠  HTTP mode — mobile browsers may block camera access.");
    console.log("     For HTTPS:  npm run gen-certs  &&  npm start\n");
  } else {
    console.log("\n  ✓  HTTPS mode (self-signed) — accept browser warning on first visit.\n");
  }
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n⏻  Shutting down — finalizing active recordings…");
  for (const [id, s] of streams.entries()) {
    if (s.recording) finalizeRecording(id);
  }
  process.exit(0);
});
