import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { CloudLayer } from "@/components/flight/fx/CloudLayer";
import { StageSeparation } from "@/components/flight/fx/StageSeparation";
import { EnginePlume } from "@/components/flight/fx/EnginePlume";
import { buildGroundGeometry } from "@/components/flight/env/groundGeometry";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { EARTH_RADIUS } from "@/lib/flight/scene-types";

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

function clouds(altitudeKm = 0): THREE.Group {
  const world = new THREE.Group();
  world.scale.setScalar(EARTH_RADIUS);
  mount(CloudLayer({ altitudeKm, ignited: false }) as unknown as MeshElement, world);
  world.updateMatrixWorld(true);
  return world.children[0] as THREE.Group;
}

// REGRESSION GUARD for PR #34, 2026-10-17: local cloud meshes must not pierce the planet in the globe intro.
describe("flight surface visibility", () => {
  it("S1: every cloud-deck triangle remains outside Earth (PR #34)", () => {
    const root = clouds();
    const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
    for (const shell of root.children.slice(0, 4) as THREE.Mesh[]) {
      const positions = shell.geometry.attributes.position;
      const indices = shell.geometry.index!;
      const triangle = new THREE.Triangle();
      const closest = new THREE.Vector3();
      let minimum = Infinity;
      for (let index = 0; index < indices.count; index += 3) {
        triangle.a.fromBufferAttribute(positions, indices.getX(index)).multiplyScalar(shell.scale.x);
        triangle.b.fromBufferAttribute(positions, indices.getX(index + 1)).multiplyScalar(shell.scale.x);
        triangle.c.fromBufferAttribute(positions, indices.getX(index + 2)).multiplyScalar(shell.scale.x);
        triangle.closestPointToPoint(sphere.center, closest);
        minimum = Math.min(minimum, closest.length());
      }
      expect((minimum - sphere.radius) * EARTH_RADIUS_M).toBeGreaterThan(0);
    }
  });

  it("S2: globe intro and overview hide the local cloud decks (PR #34)", () => {
    const root = clouds();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(14, 8, 14);
    frame.callback!({ camera, clock: { elapsedTime: 0 } });
    expect(root.children.slice(0, 4).every((shell) => !shell.visible)).toBe(true);
  });

  it("S3: a near-ground follow view still sees atmospheric cloud decks (PR #34)", () => {
    const root = clouds();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, EARTH_RADIUS + 100e-6, 0);
    frame.callback!({ camera, clock: { elapsedTime: 0 } });
    expect(root.children.slice(0, 4).every((shell) => shell.visible)).toBe(true);
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
    expect((root.children[4] as THREE.InstancedMesh).count).toBe(0);
    expect(root.children[root.children.length - 1].visible).toBe(false);
  });
  it("S7: smoke behind the rocket respects opaque scene depth (PR #34)", () => {
    const root = new THREE.Group();
    mount(EnginePlume({ throttle: 1, altitudeKm: 0 }) as unknown as MeshElement, root);
    const smoke = root.children[0].children[0] as THREE.InstancedMesh;
    expect((smoke.material as THREE.ShaderMaterial).depthTest).toBe(true);
  });
});
