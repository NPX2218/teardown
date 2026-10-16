# 10 · Hardware Firmware Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, verify on the device, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** An ESP32 inside a rocket prop streams its orientation, motion (for the "fly it yourself" gestures), a knob position and a button state over USB, 50 times a second.
**Architecture:** BNO055 does sensor fusion on-chip and reports orientation, linear acceleration (gravity removed) and the gravity vector over I²C. The ESP32 reads those plus one potentiometer and one button, and prints one comma-separated line per sample. No Bluetooth, no Wi-Fi. Gesture detection happens in the browser (11), not on the chip, so it can be unit-tested and tuned without reflashing.
**Tech Stack:** Arduino IDE 2 (or PlatformIO), ESP32 board package, Adafruit BNO055 + Adafruit Unified Sensor libraries.
**Spec:** planning doc §2 feature 5 "Physical rocket".
**Owner:** A. **Needs:** nothing (do it any time hardware is in hand).

## Global Constraints
See `00-index.md`. **Wire format (shared with 11, MUST match `lib/serial-parse.ts`):**
```
qw,qx,qy,qz,ax,ay,az,gx,gy,gz,knob,btn\n
```
- `qw..qz`: quaternion, 4 decimals.
- `ax..az`: linear acceleration with gravity removed (`VECTOR_LINEARACCEL`), m/s², 2 decimals.
- `gx..gz`: gravity vector (`VECTOR_GRAVITY`), m/s², 2 decimals.
- `knob`: integer 0–4095 (raw ESP32 ADC). `btn`: `1` pressed, `0` released.
- 12 fields. 115200 baud, 50 Hz (one line every 20 ms; ~70 bytes per line fits easily).

---

### Task 1: Wiring

| Part | Pin | ESP32 DevKit pin |
|---|---|---|
| BNO055 | VIN | 3V3 |
| BNO055 | GND | GND |
| BNO055 | SDA | GPIO 21 |
| BNO055 | SCL | GPIO 22 |
| Potentiometer | outer legs | 3V3 and GND |
| Potentiometer | wiper | GPIO 34 (input-only ADC pin) |
| Push button | one leg | GPIO 27 |
| Push button | other leg | GND (uses the internal pull-up) |

- [ ] **Step 1:** Wire it on a breadboard first.
- [ ] **Step 2:** Run the Arduino "i2c_scanner" example. Expected: a device at `0x28` (or `0x29`).
- [ ] **Step 3:** Photograph the wiring for the README.

### Task 2: Firmware

**Files:**
- Create: `firmware/teardown/teardown.ino`

- [ ] **Step 1:** `setup()`: `Serial.begin(115200)`, `Wire.begin(21, 22)`, `bno.begin()` (on failure print `ERR,bno` once per second and keep trying), `pinMode(27, INPUT_PULLUP)`.
- [ ] **Step 2:** `loop()`: every 20 ms (use `millis()`, not `delay`) read `bno.getQuat()`, `bno.getVector(Adafruit_BNO055::VECTOR_LINEARACCEL)`, `bno.getVector(Adafruit_BNO055::VECTOR_GRAVITY)`, `analogRead(34)`, and `digitalRead(27) == LOW`; print the line in the wire format above.
- [ ] **Step 3: Verify** in Serial Monitor at 115200:
  - lines arrive steadily with 12 fields;
  - rotating the board changes `qx..qz`;
  - board lying still: `ax..az` near 0, and `gx..gz` has length ≈ 9.8 pointing at the floor;
  - lifting it quickly upward: the axis pointing up shows a spike above 2 m/s²;
  - the knob sweeps ~0 to ~4095; the button prints `1` only while held.
- [ ] **Step 4:** Commit `feat: esp32 firmware streaming orientation, motion, knob, button`.

### Task 3: Calibration and mounting

- [ ] **Step 1:** BNO055 needs a few seconds of gentle movement after power-up to calibrate. Print `CAL,sys,gyro,accel,mag` once per second until `sys == 3`, then stop printing it. (The browser parser drops these lines because they don't match the format.)
- [ ] **Step 2:** Mount the board in the prop with the sensor's **+X axis pointing toward the nose**. The gesture code (11 Task 4) assumes this; if you mount it differently, write the actual axis in `firmware/README.md` and set `NOSE_AXIS` in `lib/gestures.ts` to match.
- [ ] **Step 3:** Everything that moves with the rocket goes **inside or on the rocket**: ESP32, sensor, and the knob and button on the lower body. Judges lift the rocket off the table for "fly it yourself", so nothing can be wired to a fixed base. Use a long (2 m) flexible USB cable.
- [ ] **Step 4:** Make the bottom flat so it stands upright on the table; the "landed" gesture is "standing still and upright".
- [ ] **Step 5:** Commit `docs: firmware mounting notes`.

**Fallback:** with an MPU6050 instead, use a library that outputs a fused quaternion, gravity and linear acceleration (its DMP mode provides all three) and keep the same wire format, so nothing in the browser changes.
