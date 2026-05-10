# LAN-STREAM

> Self-hosted, multi-broadcaster live video over your local network. Mobile cameras stream to any viewer with sub-100ms latency, plus tap-to-talk, remote alarm, server-side recording, viewer-side digital zoom & portrait/landscape framing, AI object detection (80 standard classes + drop-in Teachable Machine custom models), and remote camera control — all over WebRTC peer-to-peer with zero cloud services.

[![Node.js](https://img.shields.io/badge/Node.js-≥16.0.0-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![WebRTC](https://img.shields.io/badge/transport-WebRTC%20P2P-orange.svg)]()
[![No Cloud](https://img.shields.io/badge/cloud%20deps-zero-success.svg)]()

---

## Table of Contents

- [What It Does](#what-it-does)
- [Features](#features)
- [Quick Start](#quick-start)
- [Usage Guide](#usage-guide)
  - [Broadcasting (mobile or desktop)](#broadcasting-mobile-or-desktop)
  - [Watching a stream](#watching-a-stream)
  - [Tap-to-talk (viewer → broadcaster)](#tap-to-talk-viewer--broadcaster)
  - [Remote alarm](#remote-alarm)
  - [AI object detection](#ai-object-detection)
  - [Server-side recording](#server-side-recording)
  - [Remote camera control](#remote-camera-control)
  - [Embedding a stream](#embedding-a-stream)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Extending the AI Detection](#extending-the-ai-detection)
- [Troubleshooting](#troubleshooting)
- [File Structure](#file-structure)
- [Roadmap](#roadmap)
- [License](#license)

---

## What It Does

LAN-STREAM is a small Node.js server you run on any PC on your local network. Phones, tablets, or laptops on the same Wi-Fi can:

- 📱 **Broadcast** their camera + (optionally) microphone
- 🖥️ **Watch** any live stream from any other device
- 🔍 **Zoom + pan** the broadcaster's stream (digital, viewer-side)
- 🖥️/📱 **Switch landscape ↔ portrait** framing on the fly (auto-detected from the source)
- 🎙️ **Talk back** to the broadcaster (push-to-talk)
- 🚨 **Sound a remote alarm** on the broadcaster's device
- 🎯 **Run AI object detection** in the browser — 80 standard objects out of the box, plus add your own [Teachable Machine](https://teachablemachine.withgoogle.com) models from the UI
- 💾 **Record streams** server-side
- 🛰️ **Remotely control** the broadcaster's camera (pause/flip/audio toggle)

Video flows **directly peer-to-peer** between devices using WebRTC, so latency is in the tens of milliseconds on a typical LAN. The server handles only the initial handshake and recording storage — it never relays video bytes.

```
      ┌────────────┐                                    ┌────────────┐
      │  Mobile    │      WebRTC (signaling + ICE)      │  Viewer    │
      │ Broadcaster│ ◄───────────────► Server ◄────────►│ PC / Phone │
      │            │                                    │            │
      └─────┬──────┘                                    └──────▲─────┘
            │                                                  │
            └────── Direct P2P video + bidirectional audio ────┘
                       (LAN, ~10-100ms latency)
```

---

## Features

### Broadcasting
- 📱 **Mobile-first interface** — open in a phone browser, camera preview is instant; bottom controls auto-compact for narrow screens and swipe-scroll if anything still doesn't fit
- ⚡ **Auto go-live** — page open = stream available, no extra tap needed
- 🎯 **Multiple simultaneous broadcasters** — each gets a unique 4-character ID and a friendly name
- 🔄 **Front/rear camera flip** mid-stream, no reconnection
- 🎙️ **Audio off by default** — broadcaster opts in (no second permission prompt later)
- 📷 **Pause / resume camera** without ending the stream
- 🛡️ **Master "Allow remote control" switch** — broadcaster can disable viewer commands at any time

### Watching
- 🖥️ **Auto-discovery** — landing page shows all live streams in real-time
- 🔍 **Digital zoom + pan** — wheel / pinch / `+` `−` controls; click-drag or one-finger drag to pan; double-click toggles 1×↔2×
- 🖥️/📱 **Landscape ↔ portrait toggle** — auto-detected from the broadcaster's resolution, manual override available
- 🎛️ **Remote control panel** — pause/resume the camera, flip front/back, toggle audio
- 🎙️ **Tap-to-talk** — push-and-hold to send your mic audio to the broadcaster
- 🚨 **Remote alarm** — siren on broadcaster's device until you tap stop
- 🎯 **AI object detection** — 80 standard objects (COCO-SSD) plus unlimited custom Teachable Machine models added directly from the UI; rings a local alarm when a target appears in frame
- ⏺️ **Server recording** — start/stop a recording from any viewer
- 📸 **Snapshot** — save current frame as PNG (also handy for collecting training images)
- ⊞ **Picture-in-Picture** support
- ⛶ **Fullscreen**, volume, live stats (FPS, bitrate, resolution)
- 🪟 **Embed endpoint** — minimal, iframe-friendly URL with query params

### Recording
- 💾 **Server-side WebM files** saved in `recordings/` directory
- ▶️ **Triggerable from anywhere** — broadcaster or any viewer can start/stop
- 📂 **Built-in browser** at `/recordings.html` — list, play, download, delete
- 🔒 **Auto-finalized** if broadcaster disconnects mid-recording
- 🔌 **REST API** for programmatic access

### Other
- 🔌 **REST API** — `GET /api/streams`, `GET /api/recordings`
- 🔒 **HTTPS auto-detect** — drops self-signed certs in `certs/` and the server uses them
- 🚫 **No accounts, no cloud, no telemetry** — fully self-contained
- 🆓 **MIT licensed**

---

## Quick Start

### 1. Install
```bash
git clone https://github.com/jogendra-india/live-cam-feed.git
cd live-cam-feed
npm install
```

### 2. (Strongly recommended) Generate HTTPS certificates
Mobile browsers usually block camera access on plain HTTP. Generate a self-signed cert:
```bash
npm run gen-certs
```
This creates `certs/key.pem` and `certs/cert.pem`. The server auto-detects them on next start.

### 3. Start the server
```bash
npm start
```

You should see:
```
┌────────────────────────────────────────────────────────┐
│           LAN-STREAM v3  ·  Live Server                │
├────────────────────────────────────────────────────────┤
│  Mode    : HTTPS (secure)                              │
│  Local   : https://localhost:3000                      │
│  LAN     : https://192.168.1.42:3000                   │
└────────────────────────────────────────────────────────┘
```

### 4. Broadcast (from a phone on the same Wi-Fi)
1. Open `https://192.168.1.42:3000/broadcast.html` in the phone browser
2. Accept the self-signed certificate warning (one-time per device)
3. Enter a name for your stream (e.g. "Front Camera")
4. Allow camera + microphone access
5. **You're live immediately** — no further tap needed. The button shows a red square (tap to stop).

### 5. Watch (from any other device)
1. Open `https://192.168.1.42:3000/` in any browser
2. The live grid shows your stream — click it
3. Stream appears with full controls in the right sidebar

---

## Usage Guide

### Broadcasting (mobile or desktop)

```
URL: /broadcast.html
```

**Steps:**
1. Open the URL → enter a stream name → tap Continue → grant camera+mic
2. Stream auto-registers and goes live; viewer-list updates instantly
3. Use the bottom controls:

| Button | Action |
|--------|--------|
| 🔇 → 🎙️ | Toggle microphone (off by default; broadcaster opts in) |
| ⏺ | Start/stop recording (saves to server) |
| Red circle/square | Stop or restart the broadcast |
| 📷 → 📵 | Pause/resume camera (stream stays alive, just black) |
| ⟳ | Flip front/rear camera |
| ⚙ (top-right) | Settings (toggle "Allow remote control") |

**Top-bar indicators:**
- 🔴 LIVE pill — broadcasting
- 👁 N viewers — current viewer count
- 🎙️ TALK — a viewer is currently using tap-to-talk
- 🚨 ALARM — a viewer triggered remote alarm
- ● REC — recording in progress

---

### Watching a stream

```
URL: /view.html             (full UI, picks stream from sidebar)
URL: /view.html?id=A3K9     (direct link)
```

**Sidebar panels (top to bottom):**
1. **Live Streams** — list of all active broadcasts; click to switch
2. **Remote Control** — pause / flip / mute / Hold-to-talk
3. **Server Recording** — start/stop, see elapsed time
4. **Remote Alarm** — sound siren on broadcaster's device
5. **Object Detection** — AI-based watching (standard + custom models)
6. **Connection** — live stats (FPS, bitrate, P2P state, resolution)

**Player bar:**
- 🔇/🔊 mute toggle, volume slider, 📸 snapshot, 🖥️/📱 landscape/portrait toggle, ⊞ Picture-in-Picture, ⛶ fullscreen

**On-video controls:**
- Bottom-right `−` / level / `+` / ⊙ — digital zoom (1× to 5×) and reset
- Mouse wheel zooms toward the cursor; double-click toggles 1×↔2×
- When zoomed, click-drag (mouse) or one-finger drag (touch) to pan
- Two-finger pinch zooms on touch devices

> **Note:** The video starts muted by default (browser autoplay policy). Click the mute button or move the volume slider to hear audio.

---

### Tap-to-talk (viewer → broadcaster)

The fourth button in the **Remote Control** panel is **🎙️ Hold to Talk**.

- **Press and hold** the button → your microphone audio streams to the broadcaster in real-time
- **Release** → audio stops immediately
- Works on touchscreen and mouse
- Broadcaster sees a green **🎙️ TALK** pill at the top of their screen while you're talking

**How it works:** Audio rides on the *same* WebRTC peer connection as the video — no separate channel, no extra latency, no additional bandwidth on the server. The broadcaster pre-allocates a `recvonly` audio transceiver when the connection is set up, and the viewer's `replaceTrack()` call swaps in the mic without renegotiation.

---

### Remote alarm

In the **Remote Alarm** panel, tap **🚨 Sound Alarm on Broadcaster**.

- A two-tone siren generated by Web Audio API plays on the broadcaster's device
- Their screen shows a shaking red **🚨 ALARM** pill at the top
- Tap the same button again to stop

**No audio file needed** — the siren is synthesized client-side with `OscillatorNode`. The server simply relays a `start` / `stop` event between viewer and broadcaster.

---

### AI object detection

In the **Object Detection** panel, tap **⚡ Enable AI Detection** (one-time, ~5 MB model download from CDN). The viewer ships with two model types out of the box:

- **Standard** — COCO-SSD, 80 common objects, ready immediately
- **Custom** — Teachable Machine classifiers you add by pasting a model URL (no code edits, no rebuild)

Once detection is enabled:
1. Pick a target from the **Watch for…** dropdown — it lists all available classes grouped by source (`Standard · People & Animals`, `Custom · YourModelName`, …)
2. Tap **👁️ Start Watching**
3. The model scans the video every 1.5 seconds
4. When a match appears:
   - Status panel turns red, shows the matched class + confidence percentage
   - 🚨 Local siren rings on **your** device (different tone from the remote alarm)
   - Alarm auto-stops 3 seconds after the object leaves the frame

The video itself is kept clean — no boxes drawn over the feed. Detection state lives in the sidebar status line.

**80 standard objects** (COCO-80), grouped:

| Group | Examples |
|-------|----------|
| People & Animals | person, dog, cat, bird, horse, sheep, cow, bear, zebra, giraffe, elephant |
| Vehicles | car, truck, bus, motorcycle, bicycle, boat, train, airplane |
| Outdoor & Street | bench, traffic light, fire hydrant, stop sign, parking meter |
| Sports & Recreation | sports ball, skis, snowboard, surfboard, skateboard, frisbee, kite, tennis racket, baseball bat/glove |
| Personal Items | backpack, handbag, suitcase, umbrella, tie |
| Kitchenware | bottle, cup, bowl, fork, knife, spoon, wine glass |
| Food | apple, banana, orange, broccoli, carrot, pizza, donut, cake, sandwich, hot dog |
| Furniture | chair, couch, bed, dining table, toilet, potted plant |
| Electronics | tv, laptop, cell phone, mouse, keyboard, remote |
| Appliances | microwave, oven, toaster, sink, refrigerator |
| Other Indoor | book, clock, scissors, teddy bear, vase, hair drier, toothbrush |

#### Adding a custom Teachable Machine model

The Object Detection panel has a **Custom Models · Teachable Machine** section. To add a model:

1. Train one at [teachablemachine.withgoogle.com](https://teachablemachine.withgoogle.com) → New Project → Image Project → Standard image model
2. Click **Export Model** → **Tensorflow.js** → **Upload (shareable link)** → copy the URL (e.g. `https://teachablemachine.withgoogle.com/models/AbCdEfGh/`)
3. Paste it into the input field and tap **+ Add**
4. The model loads in the background (~2-5 s); its classes appear automatically in the **Watch for…** dropdown under `Custom · <model name>`

You can add as many custom models as you want. Each is listed in the panel with a remove (✕) button. **Model URLs are stored on the server** (`data/tm_models.json`) and pushed to every connected viewer in real time — train once on browser A, the model is immediately available to browsers B, C, D… No re-pasting, no per-browser setup.

> **Note:** Teachable Machine's standard image model is a *classifier*, not a detector — it tells you which class the frame most resembles. That's exactly the right shape for "is X in the frame right now?" questions; it does not produce bounding boxes.

#### Tuning the match threshold

The **MIN CONF** slider directly under the target picker sets how confident the model must be before raising the alarm. It's per-model-type:

- When you've selected a **Standard** (COCO-SSD) class, the slider tunes the COCO threshold (default 55%)
- When you've selected a **Custom** (Teachable Machine) class, the slider tunes the TM threshold (default 70%)

The two values are remembered separately in `localStorage`, so once you've found the right sensitivity for each type, every reload starts there. Drag the slider higher to suppress false positives at the cost of occasional missed detections; lower for the opposite tradeoff.

This setting is per-viewer (personal preference about acceptable false-alarm rate), not server-shared.

**Performance:** ~100-300 ms per inference on a modern device, runs at ~0.7 FPS detection rate (configurable in code). All inference is client-side — no data sent to the server, no API keys, no cloud.

---

### Server-side recording

Either the broadcaster (red ⏺ button at the bottom) or **any viewer** (in the Server Recording panel) can start/stop a recording.

What happens:
1. Broadcaster's `MediaRecorder` produces 1-second WebM chunks
2. Chunks are uploaded to the server via Socket.io
3. Server appends them to: `recordings/{streamId}-{name}-{timestamp}.webm`
4. On stop (or broadcaster disconnect), the file is finalized

Browse all recordings at `/recordings.html`:
- ▶ Play in-browser
- ⬇ Download
- 🗑 Delete

**Format:** WebM with VP9/Opus or VP8/Opus depending on the broadcaster's browser. Plays natively in most modern players (VLC, Chrome, Firefox).

---

### Remote camera control

Available to viewers when the broadcaster has remote-control enabled (default ON). The **Remote Control** panel shows three command buttons + the tap-to-talk button:

| Button | Effect on broadcaster |
|--------|----------------------|
| ⏸ Pause Camera | Disables broadcaster's video track (stream stays alive, viewers see black) |
| ▶ Resume | Re-enables video track |
| 🎙️ Toggle Mic | Enables or mutes broadcaster's microphone |
| ⟳ Flip Camera | Switches front/rear camera |

The broadcaster can disable this at any time via the ⚙ settings panel — the entire Remote Control panel will read "Broadcaster has disabled remote control."

---

### Embedding a stream

```
URL: /embed.html?id=XXXX[&audio=1][&controls=1][&fit=cover]
```

A minimal, iframe-friendly viewer with no UI.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `id` | *required* | The 4-character stream ID |
| `audio` | `0` | Set `1` to unmute |
| `controls` | `0` | Set `1` to show native HTML5 video controls |
| `fit` | `contain` | `contain` or `cover` |

**Example:**
```html
<iframe
  src="https://192.168.1.42:3000/embed.html?id=A3K9&audio=1"
  width="640" height="360"
  allow="autoplay; fullscreen; picture-in-picture"
  style="border:0">
</iframe>
```

The embed page auto-reconnects if the broadcaster goes offline and comes back.

---

## Architecture

### Connection flow (one viewer joining one broadcaster)

```
BROADCASTER          SERVER          VIEWER
    │                  │                │
    │── register ─────►│                │       ─┐
    │◄── streamId ─────│                │        │ Signaling
    │                  │◄── watch(id) ──│        │ phase:
    │◄── viewer:joined │                │        │ ~5 small
    │                  │                │        │ JSON
    │── offer (SDP) ──►│──── offer ────►│        │ messages
    │                  │◄─── answer ────│        │
    │◄── answer ───────│                │        │
    │                  │                │        │
    │── ICE ──────────►│──── ICE ──────►│        │ Network
    │◄─── ICE ─────────│◄─── ICE ───────│        │ path
    │                  │                │       ─┘ discovery
    │                  │                │
    │═════ WebRTC P2P video + audio ════│       (server out of the loop)
    │                                   │
    │ ◄════ Tap-to-talk audio (same PC) │
    │                                   │
    │  ┌── Recording: chunks ──►│       │       (only for recording)
    │                                   │
    │  ┌─ Alarm/control events ◄┤       │       (small relay events)
```

### Why WebRTC?

WebRTC delivers **sub-100 ms latency on LAN** — far better than HLS (~6-10s), MJPEG (~1-2s), or RTMP (~2-5s). It's the same transport Zoom, Google Meet, and YouTube Live's low-latency mode use.

The server is intentionally lightweight: it brokers the initial handshake (~5 small JSON messages per viewer), then steps out of the way. Video bytes never touch the server *unless* recording is active, in which case the broadcaster *additionally* uploads chunks. Tap-to-talk audio rides the same P2P channel as the video.

---

## API Reference

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/streams` | JSON array of active streams |
| GET | `/api/streams/:id` | Single stream details (404 if not found) |
| GET | `/api/recordings` | JSON array of all saved recordings |
| GET | `/recordings/:filename` | Download a recording (WebM file) |
| DELETE | `/api/recordings/:filename` | Delete a recording |
| GET | `/api/tm-models` | JSON array of registered Teachable Machine models |
| POST | `/api/tm-models` | Register a TM model — body `{ url, name?, classes? }`. Broadcasts `tm-models:updated` to all sockets. Returns 409 if already registered. |
| DELETE | `/api/tm-models?url=...` | Unregister a TM model. Broadcasts `tm-models:updated`. |

### Stream object schema

```json
{
  "id": "A3K9",
  "name": "Front Camera",
  "hasAudio": true,
  "videoEnabled": true,
  "allowRemoteControl": true,
  "viewers": 2,
  "startedAt": 1714386123000,
  "recording": {
    "active": true,
    "startedAt": 1714386200000,
    "filename": "A3K9-Front_Camera-2024-04-29T08-23-20.webm"
  }
}
```

### Recording object schema

```json
{
  "filename": "A3K9-Front_Camera-2024-04-29T08-23-20.webm",
  "url": "/recordings/A3K9-Front_Camera-2024-04-29T08-23-20.webm",
  "size": 12483920,
  "createdAt": 1714386200000,
  "modifiedAt": 1714386890000
}
```

### Socket.io events

For developers building custom clients on top of the same server.

**Client → Server (broadcaster):**

| Event | Payload | Description |
|-------|---------|-------------|
| `broadcaster:register` | `{ name }` | Register stream, callback gets `{ streamId, name }` |
| `broadcaster:unregister` | — | Remove stream from registry |
| `broadcaster:state` | `{ hasAudio?, videoEnabled?, allowRemoteControl? }` | Update stream state |
| `broadcaster:offer` | `{ viewerId, offer }` | WebRTC offer to specific viewer |
| `broadcaster:ice` | `{ viewerId, candidate }` | ICE candidate |
| `recording:start` | `{ streamId }` | Start server-side recording |
| `recording:stop` | `{ streamId }` | Stop recording |
| `recording:chunk` | `{ streamId, chunk }` | Binary WebM chunk to append |

**Client → Server (viewer):**

| Event | Payload | Description |
|-------|---------|-------------|
| `viewer:watch` | `{ streamId }` | Subscribe to a stream |
| `viewer:unwatch` | — | Stop watching |
| `viewer:answer` | `{ answer }` | WebRTC answer |
| `viewer:ice` | `{ candidate }` | ICE candidate |
| `control:request` | `{ streamId, action }` | Remote-control command |
| `alarm:start` / `alarm:stop` | `{ streamId }` | Trigger alarm on broadcaster |
| `talkback:state` | `{ streamId, talking }` | Notify broadcaster of mic activity |

Valid `control:request` actions: `pause_video`, `resume_video`, `flip_camera`, `toggle_audio`, `start_recording`, `stop_recording`.

**Server → Client:**

| Event | Payload | Description |
|-------|---------|-------------|
| `streams:updated` | `Stream[]` | Active streams list changed |
| `stream:state` | `Stream` | A specific stream's state changed |
| `viewer:joined` / `viewer:left` | `{ viewerId }` | Tells broadcaster about viewer activity |
| `broadcaster:offer` | `{ offer, broadcasterSocketId, streamId }` | Tells viewer to answer |
| `recording:status` | `{ streamId, active, filename, duration?, bytes? }` | Recording state changed |
| `control:apply` | `{ action, requestedBy }` | Tells broadcaster to execute action |
| `alarm:incoming` | `{ action }` | Tells broadcaster to start/stop alarm |
| `talkback:viewer` | `{ talking, from }` | Tells broadcaster a viewer is talking |
| `broadcaster:offline` | `{ streamId }` | Stream ended |
| `tm-models:updated` | `Array<{url,name,classes,addedAt}>` | The shared TM model registry has changed |

---

## Configuration

### Port
```bash
PORT=8080 npm start
```

### HTTPS
Drop `key.pem` and `cert.pem` in a `certs/` folder; the server picks them up automatically. Generate with:
```bash
npm run gen-certs   # or use openssl manually
```
For production, replace the self-signed cert with a real one from your CA.

### Firewall

**Windows (PowerShell as admin):**
```powershell
New-NetFirewallRule -DisplayName "LAN-STREAM" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

**Linux:**
```bash
sudo ufw allow 3000/tcp
```

**macOS:** System Preferences → Security & Privacy → Firewall → Allow Node.

---

## Extending the AI Detection

The default standard model is **COCO-SSD** (80 classes). The viewer can also load any number of **Teachable Machine** image classifiers added via the UI — that's the supported, no-code path. The remaining options here are for power users who need bounding boxes for custom objects, very high accuracy, or non-image inputs.

### Option 1: Teachable Machine *(zero-code, recommended)*

Train a classifier in your browser at [teachablemachine.withgoogle.com](https://teachablemachine.withgoogle.com), export as TensorFlow.js with the **Upload (shareable link)** option, and paste the resulting URL into the **Custom Models** input in the viewer. See [Adding a custom Teachable Machine model](#adding-a-custom-teachable-machine-model) above. No code changes, no rebuild, no server restart — and the model URL is remembered in `localStorage` so you only do it once per browser.

### Option 2: Roboflow Universe *(pre-trained, free)*
[universe.roboflow.com](https://universe.roboflow.com) hosts thousands of community models trained on specific objects (fire, helmets, masks, packages, weapons, etc.). Export to TF.js. These typically *are* detectors (with bboxes), so they need a small inference adapter in `view.html` rather than the URL-paste path.

### Option 3: Custom YOLOv8 *(advanced, best accuracy)*
Train a YOLOv8 model with [Ultralytics](https://docs.ultralytics.com/), export to TF.js:
```bash
yolo export model=best.pt format=tfjs
```
Then load with `tf.loadGraphModel()` and adapt the inference call (YOLOv8 outputs are different from COCO-SSD or TM).

### Option 4: Server-side Python *(heaviest, most flexible)*
Run a small FastAPI service with full PyTorch/Ultralytics. The viewer captures frames and POSTs them to the Python service, which returns detections. Drop-in replacement at the `runDetection()` dispatch in `view.html`.

The relevant code section is clearly marked in `view.html`:
```javascript
// ─── Object detection — multi-model registry.
// Key 'coco' is the built-in 80-class detector; 'tm:<url>' entries are
// user-added Teachable Machine classifiers loaded from the UI at runtime.
const models = new Map();
```

To add a new model *type* (beyond `coco` and `tm`), add a new branch in `runDetection()` that calls your model's inference API and produces a `{ detected, confidence }` pair.

---

## Troubleshooting

### Camera doesn't open on mobile
- Use **HTTPS** (`npm run gen-certs`). Most mobile browsers block `getUserMedia` on plain HTTP.
- Accept the self-signed cert warning on first visit.
- Camera permission must be allowed in browser settings for the site.

### Viewer page shows black screen until fullscreen
- Browser autoplay policy blocks unmuted videos. The viewer page now starts **muted**; tap the mute button or volume slider to enable audio.

### Stuck on "Connecting… joining stream XXXX"
- The broadcaster page must be open in a browser somewhere on the LAN.
- Check the broadcaster's red square indicator — if it's a circle, the broadcaster is in stopped state.
- Reload both pages if peer connection state shows `failed`.

### Tap-to-talk button does nothing
- The broadcaster must be running the latest code. Reload their page so the WebRTC peer connection includes the talkback transceiver.
- Viewer must grant microphone permission on first press.

### Recording fails or the file is corrupt
- Broadcaster's browser must support `MediaRecorder`. iOS Safari supports it from iOS 14.3+.
- Recordings save on the **server** (the PC running `npm start`), not on the mobile device.
- If the broadcaster's connection drops mid-recording, the partial file is auto-finalized and is still playable.

### AI detection is very slow
- The model needs ~5 MB to download on first enable.
- On low-power devices, increase the detection interval in `view.html`: `setInterval(runDetection, 1500)` → `3000`.
- The lite mobilenet base is already used for speed; the full model would be slower.

### Viewers can't connect from another device
- Confirm both devices are on the **same Wi-Fi network**.
- Check Windows/Linux/macOS firewall (see [Configuration](#configuration)).
- The 4-character stream ID is case-insensitive but must be exact.

### Broadcaster's stream appears in the list but viewers can't join
- Make sure you have the latest `broadcast.html` and `server.js`. Earlier versions had a registration race condition that has been fixed.

---

## File Structure

```
live-cam-feed/
├── server.js                    # Signaling, recording, alarm/control relay
├── package.json
├── README.md
├── LICENSE                      # MIT
├── .gitignore
├── certs/                       # optional, HTTPS certificates
│   ├── key.pem
│   └── cert.pem
├── recordings/                  # WebM files saved at runtime
│   └── .gitkeep
├── data/                        # Server-side persisted state
│   └── tm_models.json           # Shared Teachable Machine model registry
└── public/
    ├── index.html               # Landing — live channels grid
    ├── broadcast.html           # Mobile broadcaster
    ├── view.html                # Full viewer (all features)
    ├── embed.html               # Minimal iframe-friendly viewer
    └── recordings.html          # Recordings browser
```

---

## Roadmap

Things that could be added but aren't yet:

- 🔐 Stream-level passwords / authentication
- 🎬 Codec preferences (force H.264 hardware encoding)
- 📈 Bitrate caps for bandwidth-constrained networks
- 📡 SFU mode (server-side relay) for very high viewer counts per stream
- 🔔 Browser notifications when a stream goes live
- 📱 Native iOS/Android apps
- 📦 Docker image for one-line deployment
- 🎯 First-class support for Roboflow / YOLOv8 detector models in the same UI add-flow

PRs welcome!

---

## License

MIT — see [LICENSE](LICENSE).

---

## Acknowledgements

Built with [Express](https://expressjs.com/), [Socket.io](https://socket.io/), and the browser's native [WebRTC](https://webrtc.org/), [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder), [Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API), and [Picture-in-Picture](https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API) APIs. AI object detection by [TensorFlow.js](https://www.tensorflow.org/js) with the [COCO-SSD](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd) model and Google's [Teachable Machine](https://teachablemachine.withgoogle.com) for in-browser custom training. No paid SDKs or cloud services required.
