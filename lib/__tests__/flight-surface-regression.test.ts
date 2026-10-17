import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { CloudLayer } from "@/components/flight/fx/CloudLayer";
import { StageSeparation } from "@/components/flight/fx/StageSeparation";
import { EnginePlume } from "@/components/flight/fx/EnginePlume";
import { buildGroundGeometry } from "@/components/flight/env/groundGeometry";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { EARTH_RADIUS } from "@/lib/flight/scene-types";
import { puffVertex } from "@/components/flight/fx/shaders";
import { sampleAtmosphere } from "@/components/flight/env/scattering";

const frame = vi.hoisted(() => ({ callback: null as null | ((state: { camera: THREE.PerspectiveCamera; clock: { elapsedTime: number } }) => void) }));
vi.mock("@react-three/fiber", () => ({ useFrame: (callback: typeof frame.callback) => { frame.callback = callback; } }));
vi.mock("@/components/flight/fx/motion", () => ({ useFxReduced: () => false }));
vi.mock("@/components/flight/fx/softTexture", async (original) => ({ ...await original<typeof import("@/components/flight/fx/softTexture")>(), softParticleTexture: () => new THREE.Texture() }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useRef: (current: unknown) => ({ current }),
  useMemo: (factory: () => unknown) => factory(),
  useEffect: () => {},
}));

interface MeshElement {
  type: string;
  ref?: { current: THREE.Object3D | null } | ((node: THREE.Object3D) => void);
  props: { children?: MeshElement | MeshElement[]; args?: [THREE.BufferGeometry, THREE.Material, number]; geometry?: THREE.BufferGeometry; material?: THREE.Material; scale?: number; visible?: boolean };
}

function mount(element: MeshElement | MeshElement[], parent: THREE.Object3D): void {
  if (Array.isArray(element)) { element.forEach((child) => mount(child, parent)); return; }
  if (!element) return;
  const props = element.props;
  const node = element.type === "group" ? new THREE.Group()
    : element.type === "instancedMesh" ? new THREE.InstancedMesh(...props.args!)
    : new THREE.Mesh(props.geometry, props.material);
  if (props.scale !== undefined) node.scale.setScalar(props.scale);
  if (props.visible !== undefined) node.visible = props.visible;
  parent.add(node);
  if (typeof element.ref === "function") element.ref(node);
  else if (element.ref) element.ref.current = node;
  if (props.children) mount(props.children, node);
}

function clouds(altitudeKm = 0, ignited = false): THREE.Group {
  const world = new THREE.Group();
  world.scale.setScalar(EARTH_RADIUS);
  mount(CloudLayer({ altitudeKm, ignited }) as unknown as MeshElement, world);
  world.updateMatrixWorld(true);
  return world.children[0] as THREE.Group;
}

// REGRESSION GUARD for PR #34, 2026-10-17: local cloud meshes must not pierce the planet in the globe intro.
describe("flight surface visibility", () => {
  it("S1: sky has no spherical cloud sheets (2026-10-17 watery-sky report)", () => {
    const root = clouds();
    expect(root.children.filter((node) => node instanceof THREE.Mesh && node.geometry instanceof THREE.SphereGeometry)).toHaveLength(0);
  });

  it("S2: globe intro and overview hide the local cloud decks (PR #34)", () => {
    const root = clouds();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(14, 8, 14);
    frame.callback!({ camera, clock: { elapsedTime: 0 } });
    const puffs = root.children.find((node) => node instanceof THREE.InstancedMesh && (node.material as THREE.ShaderMaterial).vertexShader === puffVertex) as THREE.InstancedMesh;
    expect(puffs.count).toBe(0);
  });

  it("S3: the near-ground follow view has open sky (2026-10-17 watery-sky report)", () => {
    const root = clouds();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, EARTH_RADIUS + 100e-6, 0);
    frame.callback!({ camera, clock: { elapsedTime: 0 } });
    expect(root.children.filter((node) => node instanceof THREE.Mesh && node.geometry instanceof THREE.SphereGeometry)).toHaveLength(0);
    expect(root.children[root.children.length - 1].visible).toBe(false);
  });

  it("S4: the entire pad cap faces outward, including the centre fan (PR #34)", () => {
    const geometry = buildGroundGeometry();
    const positions = geometry.attributes.position;
    const indices = geometry.index!;
    const triangle = new THREE.Triangle();
    for (let index = 0; index < indices.count; index += 3) {
      triangle.a.fromBufferAttribute(positions, indices.getX(index));
      triangle.b.fromBufferAttribute(positions, indices.getX(index + 1));
      triangle.c.fromBufferAttribute(positions, indices.getX(index + 2));
      const outward = triangle.a.clone().add(new THREE.Vector3(0, EARTH_RADIUS_M, 0)).normalize();
      expect(triangle.getNormal(new THREE.Vector3()).dot(outward)).toBeGreaterThan(0);
    }
    geometry.dispose();
  });

  it("S5: a coasting upper stage has no powered exhaust (PR #34)", () => {
    const root = new THREE.Group();
    mount(StageSeparation({ stage: 1, elapsedS: 3, throttle: 0 } as Parameters<typeof StageSeparation>[0]) as unknown as MeshElement, root);
    const plumes: THREE.Mesh[] = [];
    root.traverse((node) => {
      if (node instanceof THREE.Mesh && node.material instanceof THREE.ShaderMaterial) plumes.push(node);
    });
    expect(plumes.length).toBeGreaterThan(0);
    expect(plumes.every((plume) => !plume.visible)).toBe(true);
  });

  it("S6: overview never inherits cockpit fog from a rocket inside the clouds (PR #34)", () => {
    const root = clouds(6.4);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(14, 8, 14);
    frame.callback!({ camera, clock: { elapsedTime: 0 } });
    const puffs = root.children.find((node) => node instanceof THREE.InstancedMesh && (node.material as THREE.ShaderMaterial).vertexShader === puffVertex) as THREE.InstancedMesh;
    expect(puffs.count).toBe(0);
    expect(root.children[root.children.length - 1].visible).toBe(false);
  });
  it("S7: smoke behind the rocket respects opaque scene depth (PR #34)", () => {
    const root = new THREE.Group();
    mount(EnginePlume({ throttle: 1, altitudeKm: 0 }) as unknown as MeshElement, root);
    const smoke = root.children[0].children[0] as THREE.InstancedMesh;
    expect((smoke.material as THREE.ShaderMaterial).depthTest).toBe(true);
  });

  it.each([6.4, 13, 20, 100])("S8: cloud crossing at %s km keeps only local puffs and brief fog (2026-10-17 watery-sky report)", (altitudeKm) => {
    const root = clouds(altitudeKm);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, EARTH_RADIUS + altitudeKm * 1000e-6, 0);
    camera.updateMatrixWorld();
    frame.callback!({ camera, clock: { elapsedTime: 0 } });
    const puffs = root.children.find((node) => node instanceof THREE.InstancedMesh && (node.material as THREE.ShaderMaterial).vertexShader === puffVertex) as THREE.InstancedMesh;
    const fog = root.children[root.children.length - 1] as THREE.Mesh;
    if (altitudeKm === 6.4) {
      expect(puffs.count).toBeGreaterThan(0);
      expect(fog.visible).toBe(true);
    } else {
      expect(puffs.count).toBe(0);
      expect((puffs.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0);
      expect(fog.visible).toBe(false);
      expect((fog.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0);
    }
    if (altitudeKm >= 100) expect(sampleAtmosphere({ altitudeKm, viewElevationDeg: 90, sunElevationDeg: 12, viewFromSunDeg: 0 }).alpha).toBe(0);
  });

  it("S9: engine ignition cannot surround the body with a second steam wall (2026-10-17 skin-loss report)", () => {
    const root = clouds(0.1, true);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, EARTH_RADIUS + 200e-6, 0);
    camera.updateMatrixWorld();
    frame.callback!({ camera, clock: { elapsedTime: 1 } });
    const visible = root.children.filter((node) => node instanceof THREE.Mesh && node.visible
      && (!(node instanceof THREE.InstancedMesh) || node.count > 0)
      && (node.material as THREE.ShaderMaterial).uniforms.uOpacity.value > 0);
    expect(visible).toHaveLength(0);
  });
});
