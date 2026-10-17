import { describe, expect, it, vi } from "vitest";
import { Html } from "@react-three/drei";
import { Marker } from "@/components/flight/map/Marker";
import { OrbitPath } from "@/components/flight/map/OrbitPath";

vi.mock("@react-three/fiber", () => ({ useFrame: () => {}, useThree: () => ({}) }));
vi.mock("@react-three/drei", () => ({ Html: function Html() {} }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useRef: (current: unknown) => ({ current }) }));
vi.mock("@/components/flight/map/useOrbitMap", () => ({
  useOrbitMap: () => ({
    predicted: [], flown: [], groundPredicted: [], groundFlown: [],
    impact: [0, 1, 0], apoapsis: [0, 1.1, 0], periapsis: [0, 1.05, 0], apoLabel: "Ap 100 km", periLabel: "Pe 50 km",
  }),
}));

interface Element { type: unknown; props: { children?: Element | Element[]; distanceFactor?: number } }
function all(node: Element | Element[]): Element[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!node) return [];
  return [node, ...all(node.props.children ?? [])];
}
const state = { points: [], closed: false, hitsEarth: true, periapsis: null, apoapsis: null, elements: { periapsisAltitudeM: null, apoapsisAltitudeM: null, eccentricity: null, bound: false } };

// REGRESSION GUARD for PR #34, 2026-10-17: metre-scale follow cameras must never enter globe-scale marker meshes.
describe("orbit marker visibility", () => {
  it.each(["mission", "replay"])("M1: %s follow view omits every orbit marker (PR #34)", () => {
    const tree = OrbitPath({ state, showMarkers: false } as Parameters<typeof OrbitPath>[0]);
    expect(all(tree as unknown as Element).filter((node) => node.type === Marker)).toHaveLength(0);
  });
  it("M2: overview still shows impact and apsis markers (PR #34)", () => {
    const tree = OrbitPath({ state, showMarkers: true } as Parameters<typeof OrbitPath>[0]);
    expect(all(tree as unknown as Element).filter((node) => node.type === Marker)).toHaveLength(3);
  });
  it("M3: map label text keeps a fixed pixel size while zooming (PR #34)", () => {
    const tree = Marker({ position: [0, 1, 0], label: "Impact", tone: "primary" });
    const label = all(tree as unknown as Element).find((node) => node.type === Html);
    expect(label).toBeDefined();
    expect(label!.props.distanceFactor).toBeUndefined();
  });
});
