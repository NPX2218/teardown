// Guide surface for the corner mascot. Text and voice share one panel.
export type GuideStep = "closed" | "choose" | "text" | "voice";
export type GuideEvent = "toggle" | "text" | "voice" | "back" | "stop";

export interface GuideSuggestion {
  label: string;
  text: string;
}

/** The old guide questions, plus the demo chips for the tour and the reading level. */
export const GUIDE_SUGGESTIONS: readonly GuideSuggestion[] = [
  { label: "What is a stage?", text: "What is a stage?" },
  { label: "What does the booster do?", text: "What does the booster do?" },
  { label: "How do I fly?", text: "How do I fly?" },
  { label: "Give me a tour", text: "Give me a tour" },
  { label: "Explain like I'm a kid", text: "Explain like I'm a kid" },
  { label: "Explain like an engineer", text: "Explain like an engineer" },
];

/** Click path: the face opens the chooser; Text and Voice are the two options. */
export function stepGuide(step: GuideStep, event: GuideEvent): GuideStep {
  if (event === "toggle") return step === "closed" ? "choose" : "closed";
  if (step === "closed") return "closed";
  if (event === "back" || event === "stop") return "choose";
  if (event === "text") return "text";
  if (event === "voice") return "voice";
  return step;
}
