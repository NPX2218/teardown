# Teardown: HackHarvard 2026 Plan

**Team:** 2 people, building in parallel
**Event:** HackHarvard 2026, Oct 16–18, Harvard. Hacking starts Fri ~4:00 PM; Devpost closes **Sun 8:00 AM** (aim for 7:00).
**One-liner:** Pick up a model rocket and say "launch it." Grok narrates a real Falcon 9 mission while the 3D model separates on the real timeline. Then ask "what if two engines fail?" and get a live answer.

---

## 1. What we're entering

| Prize | Type | Requirement | How we meet it |
|---|---|---|---|
| **SpaceXAI: Make It Legendary** | Challenge (core) | Real space data; built with Cursor; uses Grok Imagine or Voice. Bonus for Grok Bot planning | Real NASA/Falcon 9 models, real specs, real launch timelines. Grok Voice agent + Grok Imagine. All code in Cursor |
| **Hardware for Good** | Main track (core) | Sensors, Arduino/ESP32, devices | ESP32 + BNO055 motion sensor inside a rocket prop; knob = explode, button = launch |
| Daytona | Challenge (dropped) | Sandboxes meaningful to the product | Dropped to fund the new features below |
| Chalk | Challenge (optional) | Data-driven agent, judged on evals | Only if time: eval that checks narration numbers against the parts data |

**Other tracks, not a fit:** Reinvent Clinical Trials (Regeneron), Save the Earth (ASUS), Digital Trust, Nessie, Photon, Factory.

**To confirm at the 3 PM opening ceremony:** can one project enter a main track plus several challenges?

**ASUS content challenge:** only for teams on the Save the Earth track. We're not on it, so skip.

---

## 2. Product

### MVP core (proven in the prototype)
- Load Falcon 9, auto-spin, drag to rotate
- **Explode** into ~10 named parts (fairing halves, second stage, MVac, interstage, grid fins, cold gas thrusters, first stage, octaweb, Merlins, landing legs)
- **Click a part:** it glows, everything else fades, camera flies to it, card shows real specs
- **Narrated tour** of 9 parts with captions

### Added to the Friday deliverables
| # | Feature | What it does | Real data / AI |
|---|---|---|---|
| 1 | **Grok voice agent controls the scene** | "Show me what lands back on Earth." Grok calls our functions (`explode`, `selectPart`, `flyTo`, `startReplay`, `setEnginesOut`) and the scene moves while it talks | Grok function calling + Grok Voice |
| 2 | **Mission replay** | Pick a real Falcon 9 flight. Model animates the real timeline: liftoff → max-Q → MECO → stage separation → fairing separation → boostback → entry burn → landing. Shows booster serial and flight count | Public launch data (Launch Library 2) + the mission's published timeline |
| 3 | **Engine-out simulator** | Click Merlins to switch them off. Live liftoff thrust-to-weight shows whether the vehicle can still lift off | Math on real specs (below) |
| 4 | **Grok Imagine from the current view** | Screenshot the 3D view, Imagine shows that part in action ("this booster landing on a droneship at night") | Grok Imagine |
| 5 | **Physical rocket** (Hardware track) | Twist the prop and the model follows; knob explodes; button launches the replay | ESP32 + BNO055 |

**Engine-out numbers** (liftoff, from public specs: 845 kN per Merlin at sea level, 549,054 kg liftoff mass → 5,386 kN weight):

| Engines running | Thrust | Thrust-to-weight | Lifts off? |
|---|---|---|---|
| 9 | 7,605 kN | 1.41 | Yes |
| 8 | 6,760 kN | 1.26 | Yes |
| 7 | 5,915 kN | 1.10 | Barely |
| 6 | 5,070 kN | 0.94 | No |

This is a liftoff-only simplification. Real engine-out tolerance depends on flight phase; say so in the UI.

### Demo script (2 minutes)
1. Falcon 9 spins on screen.
2. Judge picks up the physical rocket and twists it. Screen follows.
3. Judge says "launch it." Mission replay runs on a real flight's timeline with Grok narrating; stages separate, booster flies back and lands.
4. Judge asks "what if two engines fail?" Grok switches off two Merlins, the simulator shows T/W 1.10, Grok explains.
5. "Show me this landing." Grok Imagine renders the booster landing from the current angle.

---

## 3. Architecture

```text
 ┌──────────── Browser (Chrome) ─────────────┐        ┌──── Next.js API routes ─────┐
 │ 3D viewer (react-three-fiber + drei)      │        │ (xAI key lives here only)    │
 │  spin · explode · select · tour · replay  │──────▶ │ /api/agent   → Grok + tools  │
 │                                           │ ◀───── │ /api/voice   → Grok Voice    │
 │ Voice agent UI: push-to-talk, tool calls  │        │ /api/imagine → Grok Imagine  │
 │ Engine-out panel: live T/W math           │        │ /api/launch  → Launch Library│
 │ Web Serial ◀── USB ── ESP32 + BNO055      │        │                (cached)      │
 └───────────────────────────────────────────┘        └──────────────────────────────┘
  Static data: public/models/falcon9.glb · data/parts/falcon9.json
               data/missions/<id>.json (timeline) · public/audio cache
```

| Layer | Choice | Why |
|---|---|---|
| App | Next.js + TypeScript | One repo; API keys stay server-side |
| 3D | react-three-fiber + drei | Orbit controls, GLTF loader, HTML labels built in |
| State | zustand | Connects A's viewer with B's agent |
| Agent | Grok with function calling | Grok decides which scene action to run; we execute it |
| Hardware link | Web Serial API | Chrome reads the ESP32 over USB; no backend, no pairing |
| Sensor | BNO055 | Outputs orientation directly; MPU6050 works with a fusion library |
| Launch data | Launch Library 2 (cached) | Free public launch API; unauthenticated use is rate-limited, so cache one or two missions as JSON |

### Shared contract (write together in the first 30 minutes)

`data/parts/falcon9.json`
```json
{
  "model": "falcon9",
  "glb": "/models/falcon9.glb",
  "groups": [{
    "id": "merlins",
    "nodes": ["Engine Rotator"],
    "name": "Merlin 1D engines",
    "role": "Nine first-stage engines",
    "specs": { "thrust_sl_kN": 845, "count": 9, "propellant": "RP-1/LOX" },
    "explode": { "up": -0.17, "radial": 0 },
    "tourOrder": 8,
    "source": "SpaceX Falcon 9 public specs"
  }]
}
```

`data/missions/<id>.json`
```json
{
  "id": "example-mission",
  "name": "Mission name from Launch Library 2",
  "booster": { "serial": "B10xx", "flight": 0 },
  "landing": "droneship | landing zone",
  "events": [
    { "t": 0,   "id": "liftoff",  "say": "Liftoff." },
    { "t": 72,  "id": "maxq" },
    { "t": 150, "id": "meco" },
    { "t": 154, "id": "stage_sep" },
    { "t": 200, "id": "fairing_sep" }
  ]
}
```
Event times above are placeholders. Fill them from the chosen mission's published timeline.

`lib/store.ts`
```ts
{
  model, selectedId, explode,            // viewer state
  tour: { active, step },
  replay: { missionId, t, playing },     // mission replay clock
  enginesOut: number[],                  // indexes of switched-off Merlins
  orientation,                           // from hardware
  // actions = the agent's tools, one to one:
  selectPart(id), setExplode(t), flyTo(id), startTour(),
  startReplay(missionId), setEnginesOut(ids), imagine(prompt)
}
```
**Rule:** the store's actions are exactly the tools Grok can call. A builds them, B wires Grok to them.

### File ownership
| Person | Owns |
|---|---|
| **A · 3D + Hardware** | `app/page.tsx`, `components/viewer/*`, `components/replay/*`, `components/engines/*`, `lib/serial.ts`, `firmware/` |
| **B · AI + Data + Server** | `app/api/*`, `lib/grok.ts`, `components/voice/*`, `data/parts/*`, `data/missions/*`, `README.md` |
| **Both** | `lib/types.ts`, `lib/store.ts`, `.cursor/rules/` (announce changes) |

---

## 4. Task split

### Shared
- [ ] **S1** Create the Next.js + TS repo; both clone and open in Cursor
- [ ] **S2** Write `lib/types.ts` + `lib/store.ts` together (contract above)
- [ ] **S3** Add `.cursor/rules/` (overview, contract, ownership)
- [ ] **S4** Plan in a Grok Bot thread; screenshot it (bonus)
- [ ] **S5** Ask at the opening ceremony about entering a track + challenges
- [ ] **S6** Sun: screenshot both Cursor usage pages for Oct 16–18
- [ ] **S7** Sun: Devpost submission, all prizes we qualify for, by 7:00 AM

### Person A: 3D + Hardware
**Fri 4:30–9:00 PM: core viewer**
- [ ] **A1** r3f canvas, lights, starfield; load Falcon 9 with auto-rotate
- [ ] **A2** Group nodes per parts JSON (**match sanitized names**, see Prototype lessons)
- [ ] **A3** Explode (vertical stages, radial legs/fairings); camera backs off 1.5× when exploded
- [ ] **A4** Click select: glow, fade others, info card, camera fly-to
- [ ] **A5** Store actions `selectPart`, `setExplode`, `flyTo`, `startTour` callable from anywhere

**Fri 9:00 PM–2:00 AM: new features**
- [ ] **A6** Replay engine: play a mission JSON on a clock; each event animates the model (stage sep, fairing sep, booster flip/return, legs deploy)
- [ ] **A7** Replay HUD: mission name, T+ clock, event list, booster serial and flight count
- [ ] **A8** Engine-out panel: click Merlins on/off, live T/W from the table above, "lifts off / doesn't" state
- [ ] **A9** `getViewSnapshot()` returns a PNG of the canvas (for Imagine)

**Sat: hardware + polish**
- [ ] **A10** Firmware: ESP32 prints `qw,qx,qy,qz,knob,btn` at ~50 Hz
- [ ] **A11** `lib/serial.ts`: Connect button, parse into store; orientation with a zero button; knob → explode; button → `startReplay`
- [ ] **A12** Mount sensor in the rocket prop; mouse/keyboard fallback if unplugged
- [ ] **A13** Sun: record the 2-minute demo video; hardware photos

### Person B: AI + Data + Server
**Fri 4:30–6:00 PM: unblock A**
- [ ] **B1** xAI key in `.env.local` (gitignored)
- [ ] **B2** curl-test Grok Voice, Grok Imagine, and Grok function calling; note latency and formats
- [ ] **B3** Commit `falcon9.json` by 5:30 PM (copy groups from the prototype)

**Fri 6:00 PM–2:00 AM: agent + data**
- [ ] **B4** `/api/agent`: Grok with tool definitions mirroring the store actions; facts-only system prompt (parts JSON + mission JSON)
- [ ] **B5** Client loop: run each tool call against the store, send results back, speak the final answer with Grok Voice
- [ ] **B6** Push-to-talk UI and transcript
- [ ] **B7** Pick 1–2 real missions; fetch from Launch Library 2 once; write `data/missions/*.json` with real event times and booster info
- [ ] **B8** `/api/imagine`: takes A's snapshot + part context, returns an image; cache results for the demo
- [ ] **B9** Pre-generate tour and replay narration audio as a fallback

**Sat**
- [ ] **B10** Agent prompt tuning: refuses to invent numbers; says "I don't have data on that"
- [ ] **B11** Optional eval: every number in narration must appear in the JSON
- [ ] **B12** SpaceXAI workshop 1:30 PM: ask how Cursor use is judged and about rate limits
- [ ] **B13** Sun: README (architecture, Built with Cursor, Grok usage, CC-BY credit, data sources); Devpost text

### Sync points
| Time | Check |
|---|---|
| Fri 6:00 PM | Viewer loads B's parts JSON |
| Fri 9:00 PM | Click → card with real specs; agent can call `selectPart` |
| **Fri 2:00 AM** | **All five features demoable, rough** |
| Sat 1:00 PM | Voice agent drives replay end to end |
| Sat 9:00 PM | Physical rocket controls the screen |
| Sat 12:00 AM | Feature freeze |
| Sun 7:00 AM | Submitted |

### If we fall behind (cut in this order)
1. Grok Imagine (#4)
2. Second mission (keep one)
3. Engine-out simulator (#3)
4. Live voice Q&A → keep the cached replay narration

**Never cut:** explode, mission replay, hardware control.

**Honest note:** five features by Friday 2 AM with two people is aggressive. The prototype took ~1 hour for the core viewer, so it's possible, but expect Saturday morning to absorb overflow.

---

## 5. Research we already did

### 3D models (21 tested by reading each file's part tree)
| Model | Parts | License | Verdict |
|---|---|---|---|
| **Falcon 9** by Stanley Creative (Sketchfab, via GitHub `abdalhmanalfoly/falcon-9`) | 59 named | CC-BY 4.0 (credit required) | **Use this.** 6 MB, clean names |
| Falcon 9 (`elodin-sys/elodin`) | 74 named | Repo Apache-2.0; model origin unknown | Backup; 17.7 MB |
| Mars 2020 Perseverance (NASA) | 64 named | NASA media guidelines | Good second model |
| Ingenuity (NASA) | 6 | NASA | Simple, clean |
| JWST (NASA) | 1,600 | NASA | Explode subassemblies only |
| Hubble, Shuttle, SRB, Viking, Voyager | 1–4 | NASA | Rejected: nothing to explode |
| Saturn V, Apollo LM, Gemini, Redstone, Cassini | many | NASA | Rejected: junk part names |
| Starship (3 files), Starlink | 1 mesh / broken | — | Rejected |

NASA models: github.com/nasa/NASA-3D-Resources.
Still missing: a usable Starship or Dragon. Search Sketchfab (downloadable + CC license) by hand.

### Falcon 9 node map (from the prototype; these are the nodes we move)
| Part | Nodes |
|---|---|
| Payload fairing | `Fairing 1`, `Fairing 2` |
| Second stage | `Second Stage` |
| Merlin Vacuum | `Merlin 1D Engine Center.001` |
| Interstage | `Interstage` |
| Grid fins | `Grid Fin Curve` |
| Cold gas thrusters | `Cold Gas Thrusters Rotator` |
| First stage | `First Stage` (everything left over) |
| Octaweb | `Engine Octaweb Rotator` |
| Merlin 1D engines | `Engine Rotator` (all 9 are merged into two meshes, so they can't fan out individually) |
| Landing legs | `Landing Leg 1–4`, `Landing Leg Hydraulic Holder 1–4` |

### Prototype lessons
- **GLTFLoader renames nodes:** spaces become `_` and dots are removed (`Fairing 1` → `Fairing_1`). Look up with `THREE.PropertyBinding.sanitizeNodeName(name)`.
- **Detach before exploding:** `root.attach(node)` pulls each part to the root while keeping its world position, so nested parts (MVac inside Second Stage) move independently.
- **Clone materials per mesh** before highlighting, or one glow recolors shared parts.
- **Camera:** pull back ~1.5× when fully exploded; frame parts by their largest dimension, not the diagonal (the split fairing is very wide).
- **Card overlap:** `camera.setViewOffset` shifts the render left while the info card is open.
- **Hidden browser tabs throttle animation**; demo in a focused Chrome window.

### Style
Matches spacex.com's look without copying it: black background, off-white text (#F0F0FA), DIN-style uppercase type (Barlow Semi Condensed as a free stand-in for D-DIN), huge bold headings, thin outlined buttons. **No SpaceX logo or wordmark**, own name "Teardown," and a "not affiliated with SpaceX" line.

---

## 6. Proving Cursor use
- Both teammates code in Cursor on their own accounts; use Agent mode heavily.
- Keep Cursor's `Co-authored-by: Cursor` commit trailer on in this repo.
- Commit `.cursor/rules/`.
- Screenshot the agent building key features; put 3–4 in the README and Devpost.
- Sun morning: screenshot each usage page (Oct 16–18). A Cursor Team admin can export a CSV for both.
- Add a "Built with Cursor" README section.

## 7. Risks
| Risk | Fallback |
|---|---|
| Grok Voice slow live | Pre-generated narration audio |
| Grok function calling unreliable | Keyword fallback: "launch" → `startReplay`, part names → `selectPart` |
| Grok Imagine rate limits | Generate before judging, cache |
| Launch Library 2 rate limit | Fetch once, commit mission JSON |
| No BNO055 | MPU6050 + fusion library |
| Web Serial is Chrome-only | Demo in Chrome; mouse fallback |
| Pre-written code rule | Prototype is a reference only; rebuild after kickoff in Cursor |

## 8. Links
- Prototype (private, share with teammate): https://claude.ai/artifact/FboohZL9DrPPJfZF4wvZF6
- Shared task board (private, share with teammate): https://claude.ai/artifact/BoevsPTNqWMXiAsa3Prud8
- Event site: https://hhuh.io
- Falcon 9 model: https://sketchfab.com/3d-models/falcon-9-spacex-394f7cf52d124bbd9db69f24d1ff2f08
- NASA 3D models: https://github.com/nasa/NASA-3D-Resources
