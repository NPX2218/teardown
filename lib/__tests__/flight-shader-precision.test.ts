import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { groundVertexShader, structureVertexShader } from "@/components/flight/env/shaders";
import { sitePlacement } from "@/components/flight/env/frame";
import { EARTH_RADIUS, STARBASE, VSFB_SLC4E, globeFrameFor } from "@/lib/flight/scene-types";
import { padShot } from "@/lib/flight/launch-camera";

/** Round GPU uniforms, products and sums rather than only the final vector. */
function gpuMultiply(matrix: THREE.Matrix4, vector: number[]): number[] {
  return [0, 1, 2, 3].map((row) => {
    let value = Math.fround(0);
    for (let column = 0; column < 4; column += 1) {
      value = Math.fround(value + Math.fround(Math.fround(matrix.elements[column * 4 + row]) * Math.fround(vector[column])));
    }
    return value;
  });
}

/** Evaluate the shader's actual projection chain with Float32 GPU arithmetic. */
function projectShader(shader: string, matrices: Record<string, THREE.Matrix4>, position: number[]): number[] {
  const declarations = Object.fromEntries(Array.from(shader.matchAll(/vec4\s+(\w+)\s*=\s*([^;]+);/g), ([, name, value]) => [name, value]));
  const evaluate = (expression: string): THREE.Matrix4 | number[] => {
    const values = expression.replace(/vec4\((?:position|transformed),\s*1\.0\)/g, "vertex").split("*").map((part): THREE.Matrix4 | number[] => {
      const name = part.trim();
      if (name === "vertex") return position;
      if (matrices[name]) return matrices[name];
      if (declarations[name]) return evaluate(declarations[name]);
      throw new Error(`Unknown projection operand: ${name}`);
    });
    // GLSL multiplication is left-associative. Preserve matrix products and
    // intermediate world-position rounding, rather than flattening the chain.
    return values.reduce((left, right) => {
      if (!(left instanceof THREE.Matrix4)) throw new Error("Matrix expected");
      if (Array.isArray(right)) return gpuMultiply(left, right);
      const columns = [0, 1, 2, 3].flatMap((column) => gpuMultiply(left, right.elements.slice(column * 4, column * 4 + 4)));
      return new THREE.Matrix4().fromArray(columns);
    });
  };
  const result = evaluate(shader.match(/gl_Position\s*=\s*([^;]+);/)![1]);
  if (!Array.isArray(result)) throw new Error("Projected vector expected");
  return result;
}

function pixels(clip: number[]): number[] {
  return [clip[0] / clip[3] * 960, clip[1] / clip[3] * 540];
}

// REGRESSION GUARD for PR #34, 2026-10-17: globe-sized world coordinates lost metre-scale pad detail.
describe("launch shader precision (PR #34)", () => {
  for (const site of [STARBASE, VSFB_SLC4E]) {
    it.each([["ground", groundVertexShader], ["structures", structureVertexShader]])("Q1: %s stays within a tenth of a pixel at " + site.name + " (PR #34)", (_name, shader) => {
      const shot = padShot(globeFrameFor(site));
      const camera = new THREE.PerspectiveCamera(shot.fov, 16 / 9, 5e-8, 80);
      camera.position.fromArray(shot.position);
      camera.up.fromArray(shot.up);
      camera.lookAt(new THREE.Vector3(...shot.target));
      camera.updateMatrixWorld();
      const placement = sitePlacement(site);
      const model = new THREE.Matrix4().compose(
        new THREE.Vector3(...placement.position).multiplyScalar(EARTH_RADIUS),
        new THREE.Quaternion(...placement.quaternion),
        new THREE.Vector3(1e-6, 1e-6, 1e-6),
      );
      const matrices = {
        modelMatrix: model,
        viewMatrix: camera.matrixWorldInverse,
        projectionMatrix: camera.projectionMatrix,
        modelViewMatrix: new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, model),
      };
      let worst = 0;
      let oldWorldPathError = 0;
      const worldPath = "vec4 worldPos = modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * worldPos;";
      for (let x = -80; x <= 80; x += 8) {
        for (let y = 0; y <= 70; y += 7) {
          const local = [x, y, 0, 1];
          const reference = new THREE.Vector4(...local as [number, number, number, number]).applyMatrix4(matrices.modelViewMatrix).applyMatrix4(camera.projectionMatrix);
          const expected = pixels(reference.toArray());
          const actual = pixels(projectShader(shader, matrices, local));
          worst = Math.max(worst, Math.hypot(actual[0] - expected[0], actual[1] - expected[1]));
          const old = pixels(projectShader(worldPath, matrices, local));
          oldWorldPathError = Math.max(oldWorldPathError, Math.hypot(old[0] - expected[0], old[1] - expected[1]));
        }
      }
      expect(worst).toBeLessThan(0.1);
      expect(oldWorldPathError).toBeGreaterThan(1);
    });
  }
});
