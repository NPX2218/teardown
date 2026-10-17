/**
 * Offline preview entry. The Next route is app/presentation/page.tsx.
 * Rebuild public/presentation/deck.js with components/presentation/build-preview.mjs
 * after editing the deck. Source in this folder wins if the bundle is stale.
 */
import { createRoot } from "react-dom/client";
import { Deck } from "./Deck";

const root = document.getElementById("root");
if (root) createRoot(root).render(<Deck mediaBase="media/" />);
