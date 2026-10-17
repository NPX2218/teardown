/** Camera pan from Shift+arrows and the Reset view button. Not a flight command. */
export const cameraNudge = { x: 0, y: 0, z: 0 };

export function clearCameraNudge(): void {
  cameraNudge.x = 0;
  cameraNudge.y = 0;
  cameraNudge.z = 0;
}
