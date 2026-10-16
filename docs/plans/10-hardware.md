# 10 · Hardware Firmware Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, verify on the device, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** An ESP32 inside a rocket prop streams its orientation, a knob position and a button state over USB, 50 times a second.
**Architecture:** BNO055 does sensor fusion on-chip and reports a quaternion over I²C. The ESP32 reads it plus one potentiometer and one button, and prints one comma-separated line per sample. No Bluetooth, no Wi-Fi.
**Tech Stack:** Arduino IDE 2 (or PlatformIO), ESP32 board package, Adafruit BNO055 + Adafruit Unified Sensor libraries.
**Spec:** planning doc §2 feature 5 "Physical rocket".
**Owner:** A. **Needs:** nothing (do it any time hardware is in hand).

## Global Constraints
See `00-index.md`. **Wire format (shared with 11, MUST match `lib/serial-parse.ts`):**
```
qw,qx,qy,qz,knob,btn\n
```
- `qw..qz`: floats, 4 decimals. `knob`: integer 0–4095 (raw ESP32 ADC). `btn`: `1` pressed, `0` released.
- 115200 baud, 50 Hz (one line every 20 ms).

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
- [ ] **Step 2:** `loop()`: every 20 ms (use `millis()`, not `delay`) read `bno.getQuat()`, `analogRead(34)`, and `digitalRead(27) == LOW`; print the line in the wire format above.
- [ ] **Step 3: Verify** in Serial Monitor at 115200: lines arrive steadily; rotating the board changes `qx..qz`; the knob sweeps ~0 to ~4095; the button prints `1` only while held.
- [ ] **Step 4:** Commit `feat: esp32 firmware streaming orientation, knob, button`.

### Task 3: Calibration and mounting

- [ ] **Step 1:** BNO055 needs a few seconds of gentle movement after power-up to calibrate. Print `CAL,sys,gyro,accel,mag` once per second until `sys == 3`, then stop printing it. (The browser parser drops these lines because they don't match the format.)
- [ ] **Step 2:** Mount the board in the prop with the sensor's X axis along the rocket's long axis. Note the actual orientation in `firmware/README.md`; 11 Task 3 may need an axis remap.
- [ ] **Step 3:** Put the knob and button on the base so they're easy to reach during the demo; leave the USB cable long enough to hand the prop to a judge.
- [ ] **Step 4:** Commit `docs: firmware mounting notes`.

**Fallback:** with an MPU6050 instead, use a library that outputs a fused quaternion (e.g. its DMP mode) and keep the same wire format, so nothing in the browser changes.
