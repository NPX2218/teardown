# Phone simulator

Steer the exhibit without a handset. The script joins channel `rocket-<CODE>` as `phone` and sends the same `{ from, m }` envelopes as `/rocket`, using `lib/rocket/protocol.ts`.

## Which relay

| Situation | What to set |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set, and `NEXT_PUBLIC_ROCKET_RELAY` is unset | Supabase, the same path as production. Nothing else is required. |
| No keys, or you want two processes on one machine | `NEXT_PUBLIC_ROCKET_RELAY=local` on the Next app and the simulator. Start `npm run relay:dev` first. |
| Two tabs in one browser, no server | `NEXT_PUBLIC_ROCKET_RELAY=broadcast`. A separate Node process cannot see that channel. |

Dev and test builds with no keys and no override use BroadcastChannel inside the app. The simulator is a separate process, so it defaults to the local relay when the keys are missing. Point the app at that same relay:

```bash
npm run relay:dev
NEXT_PUBLIC_ROCKET_RELAY=local npm run dev
npm run sim:phone -- ABCD
npm run sim:phone -- ABCD --mount portrait
```

`ABCD` is the code on the laptop. The local relay listens on `ws://127.0.0.1:8787` (`ROCKET_RELAY_PORT` / `NEXT_PUBLIC_ROCKET_RELAY_URL` to move it).

`--mount` chooses how the phone sits in the shell. The default is `s24fe` (Galaxy S24 FE, buttons toward the nose, `landscape-primary`). Also `landscape-left` (same axes as `s24fe`), `landscape-right`, and `portrait`. Sensor values are built in the rocket frame and rotated into device axes.

## Keys

| Key | Effect |
|---|---|
| ← / → | Pitch 5° left or right |
| l | Lift, a sustained push up the nose (launch) |
| ↑ | Shake, the launch fallback (about 0.6 s) |
| f | Flick sideways (stage) |
| a | Hold upside down for 2.5 s (abort) |
| d | Stop sending frames. The laptop pauses the flight after 2 s |
| r | Send frames again |
| h | Hold upright (0°) |
| x | Over-tilt (120°, the laptop clamps it) |
| j | Toggle a little jitter |
| q | Quit |

## JSON replay

```bash
npm run sim:phone -- ABCD --replay scripts/sim-phone.sample.json
```

The file is an array of steps. `t` is milliseconds from the start, `pitchDeg` is the held pitch, and `shake: true` fires the launch shake. `gesture` may be `lift`, `flick`, `abort`, or `shake`:

```json
[
  { "t": 0, "pitchDeg": 0 },
  { "t": 1500, "pitchDeg": 0, "shake": true },
  { "t": 4000, "pitchDeg": 10 }
]
```

`scripts/sim-phone.sample.json` is a 30 second pitch-up from upright through 85°.
