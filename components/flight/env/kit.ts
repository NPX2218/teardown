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
  /**
   * Shared rendering/collision meaning. Deck tops define the resting bell plane.
   * `holder` is the tower, erector, clamps, or mount that keeps the rocket on the pad.
   */
  role?: "launchDeck" | "tank" | "holder";
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
const BUILDING = srgb(0.72, 0.74, 0.76);
const ROOF = srgb(0.22, 0.25, 0.28);
const WINDOW = srgb(0.12, 0.2, 0.27);

/**
 * The October 17 collision report exposed arms narrower than the fairing.
 * A 2.6 m fairing radius plus the arm's 1.3 m half-width needs 3.9 m.
 * Place each arm another 0.5 m outboard for visible physical clearance.
 * This geometry is used by rendering and collisions, so neither needs a grace timer.
 * Upright ascent stays open. The arms are part of the pad holder and do not end the flight.
 */
const ARM_CENTER_M = 4.4;

export interface SiteKit {
  boxes: Instance[];
  cylinders: Instance[];
  spheres: Instance[];
}
const ROAD = srgb(0.18, 0.17, 0.15);
const STRONGBACK = srgb(0.9, 0.9, 0.86);

function box(
  position: [number, number, number],
  size: [number, number, number],
  color: [number, number, number],
  rotation?: [number, number, number],
  role?: Instance["role"],
): Instance {
  return { position, size, color, rotation, ...(role ? { role } : {}) };
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
export function starbaseKit(): SiteKit {
  const y0 = SURFACE_LIFT_M;
  const boxes: Instance[] = [];
  const cylinders: Instance[] = [];
  const spheres: Instance[] = [];

  for (let i = 0; i < 8; i += 1) {
    const theta = (i / 8) * Math.PI * 2;
    boxes.push(box(
      [Math.cos(theta) * 11, y0 + 4, Math.sin(theta) * 11],
      [2.4, 8, 2.4],
      OLM,
      undefined,
      "holder",
    ));
  }
  cylinders.push({
    position: [0, y0 + 9.2, 0],
    size: [14, 2.4, 14],
    color: STEEL,
    role: "launchDeck",
  });
  cylinders.push({
    position: [0, y0 + 10.6, 0],
    size: [6.5, 1.2, 6.5],
    color: OLM,
    role: "launchDeck",
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
    boxes.push(box([x, y0 + height / 2, z], [2.3, height, 2.3], TOWER, undefined, "holder"));
  }
  for (let level = 1; level <= 8; level += 1) {
    const y = y0 + level * 16;
    boxes.push(box([0, y, towerZ + span / 2], [span + 2, 1.5, 1.5], TOWER, undefined, "holder"));
    boxes.push(box([0, y, towerZ - span / 2], [span + 2, 1.5, 1.5], TOWER, undefined, "holder"));
    boxes.push(box([span / 2, y, towerZ], [1.5, 1.5, span + 2], TOWER, undefined, "holder"));
    boxes.push(box([-span / 2, y, towerZ], [1.5, 1.5, span + 2], TOWER, undefined, "holder"));
    const diagonal = Math.hypot(span, 16);
    const angle = Math.atan2(span, 16) * (level % 2 === 0 ? 1 : -1);
    for (const side of [-1, 1]) {
      boxes.push(box([0, y - 8, towerZ + side * span / 2], [0.75, diagonal, 0.75], STEEL, [0, 0, angle], "holder"));
      boxes.push(box([side * span / 2, y - 8, towerZ], [0.75, diagonal, 0.75], STEEL, [angle, 0, 0], "holder"));
    }
  }
  boxes.push(box([0, y0 + 132, towerZ], [14, 10, 13], TOWER, undefined, "holder"));
  // Chopsticks reach from the tower over the mount.
  boxes.push(box([ARM_CENTER_M, y0 + 108, -6], [2.6, 3.2, 36], ARM, undefined, "holder"));
  boxes.push(box([-ARM_CENTER_M, y0 + 114, -6], [2.6, 3.2, 36], ARM, undefined, "holder"));

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      const tall = (row + col) % 2 === 0;
      const heightM = tall ? 22 : 15;
      cylinders.push({
        position: [-18 - row * 14, y0 + heightM / 2, 42 + col * 12],
        size: [3.7, heightM, 3.7],
        color: tall ? WHITE : GREY,
        role: "tank",
      });
      const tankX = -18 - row * 14;
      const tankZ = 42 + col * 12;
      spheres.push({ position: [tankX, y0 + heightM, tankZ], size: [3.7, 3.7, 3.7], color: tall ? WHITE : GREY });
    }
  }

  for (const [x, z, width, height, depth] of [[-10, 78, 18, 6.4, 12], [-48, 30, 24, 8, 16], [36, 48, 20, 5.2, 14]]) {
    boxes.push(box([x, y0 + height / 2, z], [width, height, depth], BUILDING));
    boxes.push(box([x, y0 + height + 0.3, z], [width + 0.8, 0.6, depth + 0.8], ROOF));
    boxes.push(box([x - width * 0.3, y0 + height * 0.3, z + depth / 2 + 0.05], [width * 0.18, height * 0.6, 0.1], STEEL));
    for (const fraction of [-0.1, 0.15, 0.4]) {
      boxes.push(box([x + width * fraction, y0 + height * 0.65, z + depth / 2 + 0.05], [width * 0.12, height * 0.22, 0.1], WINDOW));
    }
    boxes.push(box([x + width * 0.2, y0 + height + 1, z], [width * 0.2, 1.4, depth * 0.25], GREY));
  }

  boxes.push(box([-70, y0 + 0.5, 30], [180, 1, 9], ROAD));
  boxes.push(box([-46, y0 + 0.5, 78], [8, 1, 90], ROAD));

  return { boxes, cylinders, spheres };
}

/** A short strongback and mast so Cape and Vandenberg still read as pads. */
export function falconKit(): SiteKit {
  const y0 = SURFACE_LIFT_M;
  const boxes: Instance[] = [
    box([0, y0 + 1.2, 0], [28, 2.4, 22], srgb(0.55, 0.54, 0.5), undefined, "launchDeck"),
    box([0, y0 + 26, -14], [4, 48, 3], STRONGBACK, [-0.22, 0, 0], "holder"),
    box([-16, y0 + 28, 0], [3.2, 52, 3.2], STEEL, undefined, "holder"),
    box([-16, y0 + 40, 6], [2.4, 2.4, 14], STEEL, undefined, "holder"),
    box([18, y0 + 22, 14], [1.6, 44, 1.6], GREY),
    box([-18, y0 + 22, 14], [1.6, 44, 1.6], GREY),
  ];
  return { boxes, cylinders: [], spheres: [] };
}

export function kitFor(site: LaunchSiteSpec): SiteKit {
  return siteKind(site) === "starbase" ? starbaseKit() : falconKit();
}

const padLifts = new Map<SiteKind, number>();

/** The visible deck is solid; the rocket rests just above it rather than inside it. */
export function launchPadLiftM(site: LaunchSiteSpec): number {
  const kind = siteKind(site);
  const cached = padLifts.get(kind);
  if (cached !== undefined) return cached;
  const kit = kitFor(site);
  const top = Math.max(0, ...[...kit.boxes, ...kit.cylinders]
    .filter((item) => item.role === "launchDeck")
    .map((item) => item.position[1] + item.size[1] / 2));
  const lift = top + 0.6;
  padLifts.set(kind, lift);
  return lift;
}
