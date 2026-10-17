import { PAD_PITCH, PAD_YAW } from "@/lib/flight/launch-camera";

/** Drag orbit around the chase camera. Not React state, so a drag does not re-render the HUD. */
export const chaseOrbit = { yaw: PAD_YAW, pitch: PAD_PITCH };

export function resetChaseOrbit(): void {
  chaseOrbit.yaw = PAD_YAW;
  chaseOrbit.pitch = PAD_PITCH;
}
