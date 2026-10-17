/**
 * Metres of physics per one scene unit. Physics stays in Float64 metres.
 * The rendered Earth is only a few units across, so the camera does not need
 * a floating origin. The rocket drawing is larger than this scale so it stays visible.
 */
export const METRES_TO_SCENE = 1e-6;

export function toScene(x: number, y: number, z = 0): [number, number, number] {
  return [x * METRES_TO_SCENE, y * METRES_TO_SCENE, z * METRES_TO_SCENE];
}
