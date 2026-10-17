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
- Relay join requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (11 Task 0); without them `openLink` rejects and the phone shows OFFLINE with retry.

## Observations

_(Fill in after device pass: permission prompts, silent switch behavior, recording MIME type, any `NOSE_AXIS` adjustment.)_
