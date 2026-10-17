# Teardown: HackHarvard 2026 Plan

**Team:** 2 people, building in parallel
**Event:** HackHarvard 2026, Oct 16–18, Harvard. Hacking starts Fri ~4:00 PM; Devpost closes **Sun 8:00 AM** (aim for 7:00).
**Motto:** **Bringing rocket science down to Earth.**
**One-liner:** Slide your phone into a model rocket and fly a real Falcon 9 mission: lift off, hold steady through max-Q, flip at separation, land gently, while Grok explains each moment and the rocket rumbles in your hands.

---

## 0. Why we're building it

**The problem:** Rockets are one of the most-watched technologies in the world and one of the least understood.
- The data is public but scattered: specs in PDFs, mission timelines in webcast timestamps, booster histories in launch databases.
- People watch launches without understanding what they're seeing. "Stage separation" and "boostback" mean nothing until you've seen them happen.
- Learning it is passive. Diagrams and videos show a rocket; nothing lets a kid take one apart, ask it questions, or fly it.

**Who it's for:** anyone, **down to a young kid**. If a 10-year-old can't follow it, we rewrite it.

**What it could become:** an interactive exhibit in a space museum or science center (or a launch company's visitor space): walk up, pick up the rocket, take it apart, fly the mission, leave understanding how a reusable rocket works. We're a student project and not affiliated with SpaceX; "exhibit" is the form factor we're designing for, not a partnership.

**30-second pitch:**
> "Millions watch Falcon 9 launches, but almost nobody understands what they're seeing. The data exists, scattered across spec sheets, webcast timelines and launch databases. Teardown brings rocket science down to Earth. Take the rocket apart, ask Grok anything in plain words, watch a real mission replay, then slide your phone into the rocket and fly a guided mission: it rumbles at liftoff and clunks at separation. It's built to work like a museum exhibit: simple enough for a kid, accurate enough for an engineer."

**Design principles (apply to every screen and every spoken line):**
| Principle | What it means in practice |
|---|---|
| Kid-first words | Short sentences, everyday words. Any jargon is explained right away: "max-Q, the moment the air pushes hardest on the rocket". |
| Real, never made up | Numbers come only from our data files. Simpler words, same facts. |
| Hands before screens | The physical rocket is the main way in. Mouse and touch are backups. |
| No dead ends | Every screen has one obvious next thing to do. Idle → the exhibit invites you back. |
| Three levels | Kid (default), Curious, Engineer. Same facts, more depth as you go up. |

**Evidence to collect this weekend:** have 3–5 people (ideally including someone with no space background) try it. Note what they could explain afterwards and how long it took. Don't quote made-up statistics in the pitch.

---

## 1. What we're entering

| Prize | Type | Requirement | How we meet it |
|---|---|---|---|
| **SpaceXAI: Make It Legendary** | Challenge (core) | Real space data; built with Cursor; uses Grok Imagine or Voice. Bonus for Grok Bot planning | Real Falcon 9 model and specs, a real mission timeline and booster history. Grok Voice agent + Grok Imagine. All code in Cursor |
| **Hardware for Good** | Main track (core) | Sensors and devices | **Phone rocket:** a phone slides into a model rocket and becomes its motion sensor (accelerometer + orientation) and its speaker. **Organizers confirmed this counts.** |
| **Save the Earth** (ASUS) | Main track (**backup**) | Tools for real environmental problems | **Emissions view** (plan 13): sourced CO₂, soot and water vapor at every stage of a real flight, compared with cars and flights, with honest context. Switch to this track if the phone rocket doesn't count for Hardware for Good. The ASUS content challenge then applies too |
| Daytona | Challenge (dropped) | Sandboxes meaningful to the product | Dropped to fund the features below |
| Chalk | Challenge (optional) | Data-driven agent, judged on evals | Only if time: eval that checks narration numbers against the parts data |

**Other tracks, not a fit:** Reinvent Clinical Trials (Regeneron), Digital Trust, Nessie, Photon, Factory.
**ASUS content challenge:** only for teams on the Save the Earth track; do it if we switch (13 Task 6).

---

## 2. Product

### MVP core (proven in the prototype)
- Load Falcon 9, auto-spin, drag to rotate
- **Explode** into ~10 named parts (fairing halves, second stage, MVac, interstage, grid fins, cold gas thrusters, first stage, octaweb, Merlins, landing legs)
- **Click a part:** it glows, everything else fades, camera flies to it, card shows real specs
- **Narrated tour** of 9 parts with captions

### Features
| # | Feature | What it does | Real data / AI | Plan |
|---|---|---|---|---|
| 1 | **Grok voice agent controls the scene** | "Show me what lands back on Earth." Grok calls our functions and the scene moves while it talks. Kid / Curious / Engineer levels | Grok function calling + Grok Voice | 04, 05 |
| 2 | **Hands-free mission replay** | "Launch it": a real Falcon 9 flight replays on its real timeline (stage separation, fairing, boostback, landing) with booster serial and flight count. Used as the idle exhibit loop and the no-phone backup | Launch Library 2 + the mission's published timeline | 06, 07 |
| 3 | **Engine-out simulator** | Switch Merlins off; live liftoff thrust-to-weight says if it still lifts off | Math on real specs (below) | 08 |
| 4 | **Grok Imagine** | "Show this in action": the part rendered in use, grounded in the current 3D view | Grok Imagine | 09 |
| 5 | **Phone rocket** (Hardware track) | Scan a QR code, slide the phone into the model rocket. The 3D model turns with it; the rocket rumbles, clunks and plays launch music; it vibrates in your hands; **Grok talks from inside the rocket** like mission control ("Liftoff! We're entering the first phase of flight"). Optional: ask the rocket questions through the phone mic | Phone motion sensors + speaker + mic | 10, 11, 05 |
| 6 | **Guided mission** (the main mode) | Fly a real mission with the rocket. The real timeline runs, but **pauses at each big moment** until you do the move: lift off → lean → hold steady through max-Q → flip at separation → turn upright → land gently. Stars at the end; Grok celebrates | Real mission timeline + motion sensors + Grok | 07, 11 |

| 7 | **Emissions view** (backup track) | A switch from Rocket to Emissions: a running CO₂ counter climbs as the rocket flies (≈180 t by max-Q, ≈380 t by engine cutoff, ≈480 t by the end, all estimated), with car and flight comparisons, soot and water vapor, and a "where do these numbers come from?" panel. During the guided mission the rocket adds one emissions sentence per checkpoint | FAA environmental assessment (official CO₂ per engine-second), peer-reviewed soot studies, EPA car figures | 13 |

**Engine-out numbers** (liftoff, from public specs: 845 kN per Merlin at sea level, 549,054 kg liftoff mass → 5,386 kN weight):

| Engines running | Thrust | Thrust-to-weight | Lifts off? |
|---|---|---|---|
| 9 | 7,605 kN | 1.41 | Yes |
| 8 | 6,760 kN | 1.26 | Yes |
| 7 | 5,915 kN | 1.10 | Barely |
| 6 | 5,070 kN | 0.94 | No |

This is a liftoff-only simplification. Real engine-out tolerance depends on flight phase; say so in the UI.

### Guided mission checkpoints
| # | Real moment | What the visitor does | Rocket plays |
|---|---|---|---|
| 1 | Liftoff | Lift it off the table | Countdown → rumble + launch music + vibration |
| 2 | Leaning over (gravity turn) | Tilt it partway | Rumble |
| 3 | Max-Q | Hold it still for 2 s | Heavier rumble, pulses |
| 4 | Stage separation + boostback | Turn it upside down | Clunk, then a pop when the fairing separates |
| 5 | Entry burn | Turn it upright | Burn sound |
| 6 | Landing | Set it down gently | Thud, success chime |
While a checkpoint waits, a **coach** compares the rocket's live tilt and motion with the target and the rocket gives hints ("Keep going, all the way upside down!", "Not that much, just a little lean"); a gauge on screen shows you vs the target; Grok coaches live after 15 s; after 30 s it offers "I'll do this part for you."
Stars: ★ finished, ★ quick reactions, ★ soft landing (measured by the jolt at touchdown).

### Demo script (2 minutes)
1. Falcon 9 spins on screen; the idle loop replays a real mission.
2. Judge scans the QR code and slides their phone (or ours) into the rocket. The model turns as they turn it.
3. Turn the explode slider / ask Grok "what's inside?": it comes apart, Grok explains a part in kid-friendly words.
4. **"Let's fly."** Guided mission: the rocket itself counts down and calls each moment ("Liftoff! We're entering the first phase of flight"), rumbling and playing music: lean, hold steady through max-Q, flip at separation (clunk), turn upright, land gently. The rocket cheers; stars appear; Grok's full comment plays on the laptop.
5. "What if two engines fail?" Grok switches off two Merlins; T/W 1.10, "barely"; Grok explains.
6. "Show me this landing." Grok Imagine renders the booster landing from the current angle.

---

## 3. Architecture

```text
 ┌──── Phone in the rocket ────┐   realtime   ┌──────── Laptop (Chrome, exhibit screen) ─────────┐     ┌── Next.js API routes ──┐
 │ /rocket page (HTTPS)        │    relay     │ 3D viewer: explode · select · tour · replay      │     │ (xAI key lives here)   │
 │ motion sensors → frames ────┼─────────────►│ gestures → guided mission → stars                │────►│ /api/agent → Grok      │
 │ speaker: sounds + Grok ◄────┼──────────────│ sound + "say" commands · "listen" (mic, optional)│◄────│ /api/voice → Grok Voice│
 └─────────────────────────────┘  (QR code    │ voice UI (push-to-talk) · engine panel · Imagine │     │ /api/imagine → Imagine │
                                    pairing)  └──────────────────────────────────────────────────┘     └────────────────────────┘
  Facts: data/parts/falcon9.json · data/missions/<id>.json   Assets: public/models · public/audio (Grok Voice cache) · public/sounds (CC0)
```

| Layer | Choice | Why |
|---|---|---|
| App | Next.js + TypeScript, deployed on Vercel | One repo for laptop screen, phone page and API; HTTPS for the phone's sensors |
| 3D | react-three-fiber + drei | Orbit controls, GLTF loader, HTML labels built in |
| State | zustand | One store; its actions are Grok's tools |
| Agent | Grok with function calling | Grok decides which scene action to run; the browser runs it |
| Phone sensors | `DeviceOrientation` + `DeviceMotion` events | Work on Android Chrome and iPhone Safari, no app install |
| Phone ↔ laptop | Hosted realtime pub/sub (picked in 11 Task 0) | Phone and laptop can't talk directly; ~20 frames/s each way is light |
| Sound | Web Audio on the phone; CC0 / public-domain files | Instant playback, no licensing problems in the public video |
| Launch data | Launch Library 2 (fetched once, committed) | Free public launch API; rate-limited, so never called live |

**Contracts, file ownership and task split:** these live in the stage plans, which are the source of truth. Start with `GUIDE.md`, then `plans/00-index.md` and `plans/01-setup-contract.md`.

---

## 4. Schedule

| Time | Check |
|---|---|
| Fri 5:00 PM | 01 done: placeholders, practice data and page slots pushed; lanes split |
| Fri 9:00 PM | Click → card with real specs; agent can call `selectPart` |
| **Fri 2:00 AM** | Replay, engine-out, Imagine, voice demoable, rough; `/rocket` page reads motion over HTTPS |
| Sat 1:00 PM | Voice agent drives the replay end to end; rocket shell built |
| Sat 6:00 PM | Phone rocket paired by QR, turns the model, gestures detected |
| Sat 9:00 PM | A visitor flies the full guided mission with sound and gets stars |
| Sat 12:00 AM | Feature freeze |
| Sun 7:00 AM | Submitted |

### If we fall behind (cut in this order)
1. Grok Imagine (#4)
2. Second mission (keep one)
3. Engine-out simulator (#3)
4. The coach's live Grok hints and the skip button → keep the written hints
5. Live voice Q&A → keep the cached narration

**Never cut:** explode, the guided mission with the phone rocket, rocket sounds.

**Honest note:** this is a lot for two people. The prototype took ~1 hour for the core viewer, so it's possible, but expect Saturday morning to absorb Friday's overflow.

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
- Keep commits under each developer's own identity, without tool attribution or co-author trailers. Evidence of the build workflow comes from the screenshots below.
- Commit `.cursor/rules/`.
- Screenshot the agent building key features; put 3–4 in the README and Devpost.
- Sun morning: screenshot each usage page (Oct 16–18). A Cursor Team admin can export a CSV for both.
- Add a "Built with Cursor" README section.

## 7. Risks
| Risk | Fallback |
|---|---|
| Grok Voice slow live | Pre-generated narration audio |
| Grok function calling unreliable | Keyword fallback: "launch" → `startReplay`, part names → `selectPart`; `M` / `Space` keys run the guided mission |
| Grok Imagine rate limits | Generate before judging, cache |
| Launch Library 2 rate limit | Fetch once, commit mission JSON |
| Hackathon Wi-Fi blocks or drops the relay | Both devices on a phone hotspot; `Space` key completes checkpoints with no phone |
| Phone locks or sleeps in the rocket | Screen wake lock; auto-lock off and Do Not Disturb on the demo phone |
| iPhone asks for motion permission | The big "Tap to start" button requests it; a clear message if denied |
| Phone rattles in the shell | Foam padding; rattles look like shakes |
| Sound licensing | CC0 / public-domain only, credited; no copyrighted songs or webcast audio |
| Pre-written code rule | Prototype is a reference only; rebuild after kickoff in Cursor |

## 8. Links
- Prototype (private, share with teammate): https://claude.ai/artifact/FboohZL9DrPPJfZF4wvZF6
- Shared task board (private; out of date since the phone rocket change, so use `plans/` instead): https://claude.ai/artifact/BoevsPTNqWMXiAsa3Prud8
- Event site: https://hhuh.io
- Falcon 9 model: https://sketchfab.com/3d-models/falcon-9-spacex-394f7cf52d124bbd9db69f24d1ff2f08
- NASA 3D models: https://github.com/nasa/NASA-3D-Resources
