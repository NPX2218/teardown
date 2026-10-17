import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useScene } from "@/lib/store";
import { MISSIONS } from "@/data/missions/index";
import type { Mission, PartGroup, PartsFile } from "@/lib/types";

const initial = useScene.getState();

const group = (id: string, tourOrder: number | null): PartGroup => ({
  id,
  nodes: [id],
  name: id,
  eyebrow: "",
  role: "",
  specs: {},
  explode: { up: 0, radial: 0 },
  tourOrder,
  say: "",
  source: "",
});

const FIXTURE_PARTS: PartsFile = {
  model: "fixture",
  glb: "/models/fixture.glb",
  vehicle: {
    heightM: 70,
    diameterM: 3.7,
    liftoffMassKg: 549054,
    payloadLeoKg: 22800,
    merlinThrustSlKN: 845,
    merlinCount: 9,
  },
  groups: [group("legs", 1), group("merlins", 2)],
  glossary: {},
};

const FIXTURE_ID = "fixture-mission";
const FIXTURE_MISSION: Mission = {
  id: FIXTURE_ID,
  name: "Fixture",
  date: "2020-01-01",
  booster: { serial: "B0000", flight: 1 },
  landing: "droneship",
  source: "https://example.com",
  events: [
    { t: 0, id: "liftoff", say: "Liftoff!" },
    { t: 72, id: "maxq", say: "Max-Q!" },
  ],
};

beforeAll(() => {
  MISSIONS[FIXTURE_ID] = FIXTURE_MISSION;
});
afterAll(() => {
  delete MISSIONS[FIXTURE_ID];
});
beforeEach(() => {
  useScene.setState(initial, true);
  useScene.getState().setParts(FIXTURE_PARTS);
});

const s = () => useScene.getState();

describe("scene store (01 Task 3, replay kept)", () => {
  it("S1 selectPart rejects unknown id", () => {
    expect(s().selectPart("wings")).toEqual({ ok: false, error: "unknown part: wings" });
    expect(s().selectedId).toBeNull();
    expect(s().selectPart("legs")).toEqual({ ok: true });
    expect(s().selectedId).toBe("legs");
    expect(s().selectPart(null).ok).toBe(true);
    expect(s().selectedId).toBeNull();
  });

  it("S2 setExplode rejects out of range", () => {
    expect(s().setExplode(7).ok).toBe(false);
    expect(s().setExplode(NaN).ok).toBe(false);
    expect(s().explode).toBe(0);
    expect(s().setExplode(0.5).ok).toBe(true);
    expect(s().explode).toBe(0.5);
  });

  it("S4 startReplay rejects unknown mission", () => {
    expect(s().startReplay("not-a-mission")).toEqual({ ok: false, error: "unknown mission: not-a-mission" });
    expect(s().startReplay("toString").ok).toBe(false);
    expect(s().replay.missionId).toBeNull();
  });

  it("S5 startTour stops replay", () => {
    useScene.setState({ replay: { missionId: null, t: 0, playing: true } });
    s().startTour();
    expect(s().replay.playing).toBe(false);
    expect(s().explode).toBe(1);
    expect(s().tour).toEqual({ active: true, step: 0 });
  });

  it("S8 startTour clears the replay", () => {
    s().startReplay(FIXTURE_ID);
    s().startTour();
    expect(s().replay.missionId).toBeNull();
  });

  it("S11 resumeReplay continues from the current t", () => {
    s().startReplay(FIXTURE_ID);
    s().setReplayTime(42);
    s().pauseReplay();
    s().resumeReplay();
    expect(s().replay).toEqual({ missionId: FIXTURE_ID, t: 42, playing: true });
  });

  it("S16 setLevel rejects an unknown level", () => {
    expect(s().setLevel("scientist" as never)).toEqual({ ok: false, error: "unknown level: scientist" });
    expect(s().level).toBe("kid");
    expect(s().setLevel("engineer")).toEqual({ ok: true });
    expect(s().level).toBe("engineer");
  });
});
