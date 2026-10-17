# Phone rocket — realtime notes (Neel)

Per-device evidence for slice 10. Update after HTTPS testing on physical hardware.

## Pending gates (not verified in CI)

| Device | HTTPS motion | Gravity sign (`?debug=1`) | ~20 fps | Wake lock 3+ min | Sounds 1 m | Vibration | Mic / listen |
|---|---|---|---|---|---|---|---|
| Demo Android | pending | pending | pending | pending | pending (await `public/sounds/*.mp3` from 05) | pending | pending |
| iPhone (judge phone) | pending | pending | pending | pending | pending | N/A | pending |

## Simulator / desktop

- Desktop Chrome at `/rocket`: after tap, **NO SENSORS** after ~3 s (expected; no motion hardware).
- Sensor math and message routing covered by vitest fixtures (`lib/__tests__/sensors.test.ts`, `phone.test.ts`, `rocket-voice.test.ts`).
- The relay is the local WebSocket relay (`lib/rocket/dev-relay.ts`, port 8787). For a real phone, `npm run tunnel` starts it, opens cloudflared quick tunnels for the app and the relay, and writes `NEXT_PUBLIC_ROCKET_RELAY=local` and `NEXT_PUBLIC_ROCKET_RELAY_URL=wss://<relay tunnel>` into the local env file. It waits for both tunnels before printing READY, because scanning a brand-new trycloudflare host too early makes the Wi-Fi DNS cache a miss for about 60 s.
- `NEXT_PUBLIC_ROCKET_RELAY=broadcast` uses a BroadcastChannel and only works between tabs of one browser (dev and tests). Two devices need `local`. See `docs/SIM-PHONE.md`.
- Production with no relay configured still rejects `openLink` with "relay not configured", and the phone shows OFFLINE with retry.

## Observations

_(Fill in after device pass: permission prompts, silent switch behavior, recording MIME type, any `NOSE_AXIS` adjustment.)_
