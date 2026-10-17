import { STARBASE, CAPE_SLC40, VSFB_SLC4E } from "./sites";
import { SURFACE_LIFT_M } from "./frame";
import type { LaunchSiteSpec } from "./types";

export type SiteKind = "starbase" | "cape" | "vsfb" | "generic";

export interface Instance {
  position: [number, number, number];
  /** Scale of a 1×1×1 box, or of a radius-1 height-1 cylinder. */
  size: [number, number, number];
  rotation?: [number, number, number];
  /** Linear RGB. */
  color: [number, number, number];
}

function srgb(r: number, g: number, b: number): [number, number, number] {
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [f(r), f(g), f(b)];
}

const TOWER = srgb(0.14, 0.15, 0.16);
const ARM = srgb(0.2, 0.21, 0.22);
const STEEL = srgb(0.28, 0.29, 0.3);
const OLM = srgb(0.24, 0.23, 0.21);
const WHITE = srgb(0.86, 0.85, 0.8);
const GREY = srgb(0.62, 0.63, 0.64);
const BUILDING = srgb(0.4, 0.38, 0.34);
const ROAD = srgb(0.18, 0.17, 0.15);
const STRONGBACK = srgb(0.9, 0.9, 0.86);

function box(
  position: [number, number, number],
  size: [number, number, number],
  color: [number, number, number],
  rotation?: [number, number, number],
): Instance {
  return { position, size, color, rotation };
}

export function siteKind(site: LaunchSiteSpec): SiteKind {
  const near = (known: LaunchSiteSpec) =>
    known.name === site.name || (Math.abs(known.lat - site.lat) < 0.05 && Math.abs(known.lon - site.lon) < 0.05);
  if (near(STARBASE)) return "starbase";
  if (near(CAPE_SLC40)) return "cape";
  if (near(VSFB_SLC4E)) return "vsfb";
  return "generic";
}

/** Boca Chica: mount at the origin, tower to the pilot's left, tanks to the right, ocean downrange. */
export function starbaseKit(): { boxes: Instance[]; cylinders: Instance[] } {
  const y0 = SURFACE_LIFT_M;
  const boxes: Instance[] = [];
  const cylinders: Instance[] = [];

  for (let i = 0; i < 8; i += 1) {
    const theta = (i / 8) * Math.PI * 2;
    boxes.push(box(
      [Math.cos(theta) * 11, y0 + 4, Math.sin(theta) * 11],
      [2.4, 8, 2.4],
      OLM,
    ));
  }
  cylinders.push({
    position: [0, y0 + 9.2, 0],
    size: [14, 2.4, 14],
    color: STEEL,
  });
  cylinders.push({
    position: [0, y0 + 10.6, 0],
    size: [6.5, 1.2, 6.5],
    color: OLM,
  });

  const towerZ = -24;
  const span = 10;
  const height = 142;
  const corners: [number, number][] = [
    [span / 2, towerZ + span / 2],
    [span / 2, towerZ - span / 2],
    [-span / 2, towerZ + span / 2],
    [-span / 2, towerZ - span / 2],
  ];
  for (const [x, z] of corners) {
    boxes.push(box([x, y0 + height / 2, z], [2.3, height, 2.3], TOWER));
  }
  for (let level = 1; level <= 8; level += 1) {
    const y = y0 + level * 16;
    boxes.push(box([0, y, towerZ + span / 2], [span + 2, 1.5, 1.5], TOWER));
    boxes.push(box([0, y, towerZ - span / 2], [span + 2, 1.5, 1.5], TOWER));
    boxes.push(box([span / 2, y, towerZ], [1.5, 1.5, span + 2], TOWER));
    boxes.push(box([-span / 2, y, towerZ], [1.5, 1.5, span + 2], TOWER));
  }
  boxes.push(box([0, y0 + 132, towerZ], [14, 10, 13], TOWER));
  // Chopsticks reach from the tower over the mount.
  boxes.push(box([3.2, y0 + 108, -6], [2.6, 3.2, 36], ARM));
  boxes.push(box([-3.2, y0 + 114, -6], [2.6, 3.2, 36], ARM));

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      const tall = (row + col) % 2 === 0;
      const heightM = tall ? 22 : 15;
      cylinders.push({
        position: [-18 - row * 14, y0 + heightM / 2, 42 + col * 12],
        size: [3.7, heightM, 3.7],
        color: tall ? WHITE : GREY,
      });
    }
  }

  boxes.push(box([-10, y0 + 3.2, 78], [18, 6.4, 12], BUILDING));
  boxes.push(box([-48, y0 + 4, 30], [24, 8, 16], BUILDING));
  boxes.push(box([36, y0 + 2.6, 48], [20, 5.2, 14], BUILDING));
  boxes.push(box([-70, y0 + 0.5, 30], [180, 1, 9], ROAD));
  boxes.push(box([-46, y0 + 0.5, 78], [8, 1, 90], ROAD));

  return { boxes, cylinders };
}

/** A short strongback and mast so Cape and Vandenberg still read as pads. */
export function falconKit(): { boxes: Instance[]; cylinders: Instance[] } {
  const y0 = SURFACE_LIFT_M;
  const boxes: Instance[] = [
    box([0, y0 + 1.2, 0], [28, 2.4, 22], srgb(0.55, 0.54, 0.5)),
    box([0, y0 + 26, -14], [4, 48, 3], STRONGBACK, [-0.22, 0, 0]),
    box([-16, y0 + 28, 0], [3.2, 52, 3.2], STEEL),
    box([-16, y0 + 40, 6], [2.4, 2.4, 14], STEEL),
    box([18, y0 + 22, 14], [1.6, 44, 1.6], GREY),
    box([-18, y0 + 22, 14], [1.6, 44, 1.6], GREY),
  ];
  return { boxes, cylinders: [] };
}

export function kitFor(site: LaunchSiteSpec): { boxes: Instance[]; cylinders: Instance[] } {
  return siteKind(site) === "starbase" ? starbaseKit() : falconKit();
}
