/**
 * Story for the /presentation deck.
 * On-screen lines are the exhibit's plain language. Notes are the speaker script.
 * Nothing here is a measured result, a live-service claim, or a screenshot.
 */

export const MOTTO = "Bringing rocket science down to Earth.";

export const CREDIT = {
  authors: "Made by Neel Bansal and Anders Haroldson",
  disclaimer: "Student project. Not affiliated with SpaceX or xAI.",
  modelName: "Falcon 9 - SpaceX",
  modelBy: "Stanley Creative",
  licence: "CC BY 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
  modelPageUrl:
    "https://sketchfab.com/3d-models/falcon-9-spacex-394f7cf52d124bbd9db69f24d1ff2f08",
} as const;

/** Evidence that still has to be captured from a running build. Keep the README list in step. */
export const EVIDENCE_GAPS = [
  "Explore capture from the running app: the real model, parts pulled apart, and a selected part.",
  "Flight replay capture: a named launch, its source, and the limits on what is not known.",
  "Your mission capture: a crash caused by flying, a retry, and an orbit reached only by flying.",
  "Phone photo: the code, the motion permission, the zero pose, and a tilt, plus the pause when the phone disconnects.",
  "A local recording of a flight that was really flown, with no forced success.",
  "A live demo link that has been opened and checked.",
  "Measured presentation time in the confirmed event slot.",
  "Hallway notes from people who tried the finished exhibit.",
  "Neel's visual review of this deck against the running app.",
] as const;

export type SlideId =
  | "title"
  | "problem"
  | "explore"
  | "fly"
  | "phone"
  | "learn"
  | "how"
  | "close"
  | "sources"
  | "orbit"
  | "excluded"
  | "evidence";

export interface Beat {
  id: string;
  text: string;
}

export interface Slide {
  id: SlideId;
  part: "core" | "appendix";
  kicker: string;
  title: string;
  /** Uppercase display for short labels. Sentence case for a full line. */
  titleCase: "display" | "sentence";
  beats: Beat[];
  notes: string[];
  figure: "poster" | "sources" | "explore" | "fly" | "phone" | "learn" | "how" | "close" | "rules" | "orbit" | "excluded" | "evidence";
}

export const SLIDES: readonly Slide[] = [
  {
    id: "title",
    part: "core",
    kicker: "Walk-up exhibit",
    title: "Teardown",
    titleCase: "display",
    figure: "poster",
    beats: [
      { id: "motto", text: MOTTO },
      { id: "authors", text: CREDIT.authors },
      { id: "disclaimer", text: CREDIT.disclaimer },
    ],
    notes: [
      "Either person can open. Read the motto, then the two credit lines. Do not open with the stack.",
      "Point at the drawing and say it is a drawing for the story, not a picture of the exhibit. The app is not running on this branch.",
      "Then go to the problem. No audience size, no impact number, no timing.",
    ],
  },
  {
    id: "problem",
    part: "core",
    kicker: "Why it exists",
    title: "Watching is not the same as understanding",
    titleCase: "sentence",
    figure: "sources",
    beats: [
      { id: "watch", text: "A launch is easy to watch and hard to explain." },
      {
        id: "scattered",
        text: "The facts are public, but they sit in different pages, videos and tables.",
      },
      {
        id: "try",
        text: "None of that lets a kid take a rocket apart, ask it a question, or try to fly one.",
      },
    ],
    notes: [
      "Say the three lines slowly. Do not add “most-watched” or any other count. We have not measured an audience.",
      "The audience line, if you need it: if a 10-year-old cannot follow a screen, we rewrite the screen.",
      "Handoff stays with the speaker. The next slide is the idea of Explore, not a live model.",
    ],
  },
  {
    id: "explore",
    part: "core",
    kicker: "Explore",
    title: "Take the rocket apart",
    titleCase: "display",
    figure: "explore",
    beats: [
      {
        id: "turn",
        text: "Drag, pinch, or use the keys to turn a real Falcon 9 model and move closer.",
      },
      {
        id: "parts",
        text: "Pull the parts away from each other, then tap a part to read what it does.",
      },
      {
        id: "words",
        text: "Hard words stay, with a plain meaning in the same sentence.",
      },
    ],
    notes: [
      "The frame is a placeholder. Say that before you describe it. Do not call it a screenshot.",
      "The model credit is Stanley Creative, CC BY 4.0. The model file is not in this branch yet.",
      "Questions for the guide, and Grok itself, are specified. They are not connected here. If you mention them, say they are part of the plan.",
    ],
  },
  {
    id: "fly",
    part: "core",
    kicker: "Your mission",
    title: "Fly it from the ground",
    titleCase: "display",
    figure: "fly",
    beats: [
      {
        id: "pad",
        text: "You start on a launchpad, on a round Earth, with space behind it.",
      },
      {
        id: "controls",
        text: "Pitch is how you tilt. Throttle is how hard the engines push.",
      },
      {
        id: "miss",
        text: "Go straight up, or turn too hard, and the path falls back to Earth. That miss is computed. Nothing types in a win.",
      },
      {
        id: "goal",
        text: "The game goal is a path around Earth: lowest point at least 200 km up, highest point no more than 2,000 km up, engines off for ten seconds. Those are settings for the game, not a rating of a real rocket.",
      },
      {
        id: "demo",
        text: "Live demo: fly it only when the build can really fly. If it cannot, stay on this slide and say so.",
      },
    ],
    notes: [
      "This is the handoff to the driver, and only after Your mission actually runs. Until then there is no handoff. Stay on this slide.",
      "Do not press a key that pretends the rocket won. Do not play a clip of a success we did not fly. There is no recording yet.",
      "Altitude alone never wins. Say that if someone asks what “getting high enough” means.",
      "No duration is claimed. The old checkpoint timing is retired. Rehearse and measure only after the flight exists.",
    ],
  },
  {
    id: "phone",
    part: "core",
    kicker: "Optional controller",
    title: "The laptop flies. A phone can steer.",
    titleCase: "sentence",
    figure: "phone",
    beats: [
      {
        id: "local",
        text: "Mouse, touch and keyboard can fly the whole mission with no phone at all.",
      },
      {
        id: "steps",
        text: "To use a phone: scan a code, allow motion, hold still to set zero, then tilt to set pitch.",
      },
      {
        id: "drop",
        text: "If the phone drops away, the flight pauses. Old wiggles are thrown out. You choose to go on with the laptop.",
      },
    ],
    notes: [
      "Say the laptop path first. The phone is optional, and it is not built on this branch.",
      "There is no photo of a shell, a code, or a permission screen. The frame says Placeholder. Leave it labelled.",
      "HTTPS is required before a phone will share motion. We have not run that check on a handset.",
      "Do not claim the Hardware for Good sensors have been shown. Organizers said the accelerometer and speaker can count. We still owe the demo.",
    ],
  },
  {
    id: "learn",
    part: "core",
    kicker: "Flight replay",
    title: "A past launch, and your flight",
    titleCase: "sentence",
    figure: "learn",
    beats: [
      {
        id: "replay",
        text: "Replay shows published moments from a named launch, with the source and what we do not know. It is not a live feed of speed and tilt.",
      },
      {
        id: "sim",
        text: "Your mission is a simulation. Its numbers come from the model and your inputs.",
      },
      {
        id: "co2",
        text: "The carbon line is an estimate of direct engine carbon dioxide (CO₂) from fuel the simulation burned. It is not a measurement, not the rocket’s whole life, and not a soot score.",
      },
      {
        id: "gap",
        text: "A past launch and your flight do not share one total. If a number is missing, the screen should say so.",
      },
    ],
    notes: [
      "If someone asks for a tonne figure, say the calculator is not in this branch and you will not guess.",
      "Do not call planned sample times a real flight. There is no named mission loaded here.",
      "Emissions sit inside the flight. There is no separate Emissions destination.",
    ],
  },
  {
    id: "how",
    part: "core",
    kicker: "How it works",
    title: "One helper moves the rocket",
    titleCase: "sentence",
    figure: "how",
    beats: [
      {
        id: "hands",
        text: "Your hands set pitch and throttle. One owner at a time for each control.",
      },
      {
        id: "helper",
        text: "A physics helper is the only thing that moves the rocket. The picture cannot invent the path.",
      },
      {
        id: "guide",
        text: "The guide can explain the screen. It cannot steer, and it cannot award a win.",
      },
      {
        id: "grok",
        text: "Grok text, voice and pictures need a key that stays on the server. If they are unreachable, the flight still runs, and the screen says it could not reach Grok.",
      },
    ],
    notes: [
      "Point at the boundary: hands and the helper decide the flight. The guide only talks.",
      "The key is XAI_API_KEY, server only, never in the browser and never in the repo. Do not show a real key. None is configured here.",
      "No live Grok call has been made from this branch. Do not say the guide answered.",
    ],
  },
  {
    id: "close",
    part: "core",
    kicker: "Try it",
    title: "Take one apart. Watch one. Fly one.",
    titleCase: "sentence",
    figure: "close",
    beats: [
      { id: "idea", text: "That is the exhibit." },
      {
        id: "deck",
        text: "This page is the animated deck. The still copy is the PDF next to the speaker notes.",
      },
      {
        id: "later",
        text: "A public link and a timed recording are not ready. We will add them only after they work.",
      },
    ],
    notes: [
      "Stop. Do not add a result, a prize claim, or a submit confirmation. Nothing has been submitted.",
      "Invite questions. If you do not know, say the work is still in the specs.",
      "Credits again if you did not read them on the title slide: the author line, the student disclaimer, and the model licence are three separate lines.",
    ],
  },
  {
    id: "sources",
    part: "appendix",
    kicker: "Numbers",
    title: "Where a number may come from",
    titleCase: "sentence",
    figure: "rules",
    beats: [
      { id: "fact", text: "A published fact wears its source." },
      {
        id: "sim",
        text: "A simulated readout comes from the flight helper and named inputs.",
      },
      {
        id: "estimate",
        text: "An estimate wears that word, plus the assumptions it used.",
      },
      {
        id: "missing",
        text: "Missing data stays missing. We do not fill the gap with a sample flight.",
      },
    ],
    notes: [
      "Use this slide if a judge asks what is real. Do not invent a source URL that is not in the data files. Those files are not written yet.",
      "Sample practice times in the specs are labelled sample. They are not a flown mission.",
    ],
  },
  {
    id: "orbit",
    part: "appendix",
    kicker: "Orbit",
    title: "The orbit goal is a game setting",
    titleCase: "sentence",
    figure: "orbit",
    beats: [
      {
        id: "up",
        text: "Altitude alone never wins. A rocket that only goes up comes back down.",
      },
      {
        id: "bound",
        text: "The helper checks a bound path: periapsis at least 200 km, apoapsis at most 2,000 km, and ten seconds with the engines off.",
      },
      {
        id: "words",
        text: "Periapsis means the lowest part of the path around Earth. Apoapsis means the highest part.",
      },
      {
        id: "drag",
        text: "Low Earth orbit still feels drag. Ten quiet seconds are not a promise that the path lasts.",
      },
    ],
    notes: [
      "These cut-offs are classroom settings from the flight spec. They are not a Falcon 9 requirement and not a result we flew.",
      "The public idea of an orbit is NASA’s. Our numbers are not NASA’s numbers. Do not blur those.",
      "No successful input profile has been recorded. Do not sketch one from memory.",
    ],
  },
  {
    id: "excluded",
    part: "appendix",
    kicker: "Scope",
    title: "Left out on purpose",
    titleCase: "display",
    figure: "excluded",
    beats: [
      {
        id: "engines",
        text: "No engine-out sandbox, and no control that turns engines off to fake a lesson.",
      },
      { id: "dock", text: "No docking, and no space stations." },
      { id: "land", text: "No booster-landing game." },
      { id: "planets", text: "No trips to the Moon or other planets." },
      {
        id: "old",
        text: "The old checkpoint mission, coach hints and star scores are retired. They are not a hidden mode.",
      },
    ],
    notes: [
      "If an older README or demo script mentions stars, six gestures, or switching engines off, that script is retired. Do not perform it.",
      "Engine facts can still be read in Explore. That is not an engine-out game.",
    ],
  },
  {
    id: "evidence",
    part: "appendix",
    kicker: "Open items",
    title: "What we still have to capture",
    titleCase: "sentence",
    figure: "evidence",
    beats: [
      {
        id: "owe",
        text: "Every empty box on this slide is still empty. A placeholder is not evidence.",
      },
      {
        id: "when",
        text: "Replace a box only with a capture from the running app, a real handset, or a measured rehearsal.",
      },
    ],
    notes: [
      "Read two or three gaps, not the whole list, unless someone asks. The list is the same one as in the README.",
      "Neel reviews the look. Anders does not sign that review on Neel's behalf.",
    ],
  },
];

export const CORE_SLIDE_IDS = [
  "title",
  "problem",
  "explore",
  "fly",
  "phone",
  "learn",
  "how",
  "close",
] as const;

export function slideIndex(id: string): number {
  return SLIDES.findIndex((slide) => slide.id === id);
}
