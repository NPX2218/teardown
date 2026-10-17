/** Drag orbit around the chase camera. Not React state, so a drag does not re-render the HUD. */
export const chaseOrbit = { yaw: 0.62, pitch: 0.22 };

export function resetChaseOrbit(): void {
  chaseOrbit.yaw = 0.62;
  chaseOrbit.pitch = 0.22;
}
