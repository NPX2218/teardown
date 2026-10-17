// Part names and roles the Imagine prompt may use until 02's data/parts/falcon9.json lands.
// Text is copied from docs/specs/02-parts-data.spec.md. Contract delta: the route should import that JSON.

export interface ImaginePart {
  id: string;
  name: string;
  role: string;
}

export const CATALOG: readonly ImaginePart[] = [
  {
    id: "fairing",
    name: "Payload fairing",
    role: "The fairing is the rocket's nose cone. It protects the satellite from wind and heat on the way up. High above the air, its two halves split open and fall away.",
  },
  {
    id: "stage2",
    name: "Second stage",
    role: "The second stage is the top part of the rocket. It takes over after the booster lets go. It carries the satellite into orbit, a path around the Earth.",
  },
  {
    id: "mvac",
    name: "Merlin Vacuum engine",
    role: "This engine works where there is almost no air. Its giant bell lets the hot gas spread out and push harder in space.",
  },
  {
    id: "interstage",
    name: "Interstage",
    role: "The interstage joins the booster to the second stage. Its pushers shove the booster away at stage separation, when it lets go.",
  },
  {
    id: "gridfins",
    name: "Grid fins",
    role: "Grid fins look like waffles. They fold out when the booster falls back to Earth. They tilt to steer it through the air toward the landing spot.",
  },
  {
    id: "rcs",
    name: "Cold gas thrusters",
    role: "These small jets puff out gas to turn the booster around after it lets go. No fire, just a strong puff of gas.",
  },
  {
    id: "stage1",
    name: "First stage",
    role: "The first stage is the big booster at the bottom. It holds most of the fuel and does the hardest work at liftoff. Then it flies back and lands, so it can fly again.",
  },
  {
    id: "octaweb",
    name: "Octaweb",
    role: "The octaweb is the frame that holds the engines. It puts eight engines in a ring around one in the middle.",
  },
  {
    id: "merlins",
    name: "Merlin 1D engines",
    role: "These are the booster's engines. They burn kerosene fuel and liquid oxygen to push the rocket off the ground.",
  },
  {
    id: "legs",
    name: "Landing legs",
    role: "The landing legs stay folded on the way up. Just before touchdown they swing out, so the booster can land standing up.",
  },
];

export function findImaginePart(id: string): ImaginePart | undefined {
  return CATALOG.find((part) => part.id === id);
}
