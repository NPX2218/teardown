/** About copy. Kid wording, with SpaceX's sentences kept exact and sourced. */

export const ABOUT = {
  eyebrow: "About this exhibit",
  hero: "Down to Earth",
  motto: "Bringing rocket science down to Earth.",
  sourceHref: "https://www.spacex.com/mission/",
  sourceLabel: "Read it on spacex.com",
  mission: [
    "SpaceX wants people to live on more than one planet. They call this making humanity multiplanetary. Mars is the place they talk about first.",
    "On their mission page, SpaceX says they are building reusable rockets that can carry humans to Mars and other places in the solar system. Reusable means the rocket can land and fly again. SpaceX says that is how a trip to space can cost less.",
  ],
  why: [
    "Teardown is a hands-on way to learn how a real rocket works. You can look at the parts and try a flight.",
    "We built it at HackHarvard. A few weeks earlier, we talked with engineers and recruiters at a university event. Those talks made the mission even more fascinating to us than before.",
  ],
  flightData: {
    title: "How flight paths reach the globe",
    paragraphs: [
      "Your rocket's position comes from a three-dimensional simulation. The line ahead predicts where it would coast with its engines off.",
      "A reference path uses height to set its distance from Earth's center, and distance along the ground to bend it around a spherical Earth. We rotate that path to the launch site and heading. This is a simplified map, not a measured latitude-and-longitude track.",
      "Practice uses a simulated reference. For Sentinel-6 Michael Freilich, our sources provide approximate event times but no reusable measured trajectory. We show those milestones without inventing a real path.",
    ],
    sourceHref: "https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-6/Launch",
    sourceLabel: "Sentinel-6 launch timeline — ESA",
  },
  authors: "Made by Neel Bansal and Anders Haroldson",
  disclaimer: "Student project. Not affiliated with SpaceX or xAI.",
  model: "Model: “Falcon 9 - SpaceX” by Stanley Creative, CC BY 4.0",
  modelHref: "https://creativecommons.org/licenses/by/4.0/",
  quotes: [
    {
      text: "Building on the achievements of Falcon 9 and Falcon Heavy, SpaceX is working on a next generation of fully reusable launch vehicles that will be the most powerful ever built, capable of carrying humans to Mars and other destinations in the solar system.",
      note: "SpaceX, on its mission page.",
    },
    {
      text: "SpaceX believes a fully and rapidly reusable rocket is the pivotal breakthrough needed to substantially reduce the cost of space access.",
      note: "SpaceX, on the same page. Pivotal means the most important step.",
    },
    {
      text: "You want to wake up in the morning and think the future is going to be great - and that's what being a spacefaring civilization is all about. It's about believing in the future and thinking that the future will be better than the past. And I can't think of anything more exciting than going out there and being among the stars.",
      note: "Elon Musk, on the same page. Spacefaring means traveling and living in space.",
    },
  ],
} as const;
