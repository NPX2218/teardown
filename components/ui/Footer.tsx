"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Credits } from "./Credits";

// Credits overlap the bottom dock, so on mouse devices they stay hidden until the pointer nears the bottom edge.
// Band height is arbitrary: roughly the credits' own height plus a little reach.
const REVEAL_BAND_PX = 96;
const DOCKS = '[data-guide], [data-slot="voice"]';

export function Footer() {
  const path = usePathname();
  const hidden = path === "/rocket" || path.startsWith("/rocket/");

  useEffect(() => {
    if (hidden) return;
    const onMove = (e: PointerEvent) => {
      // The Grok guide and the voice dock live in the same band; hovering them is about them, not the credits.
      const onDock = e.target instanceof Element && e.target.closest(DOCKS) !== null;
      // Only over the credits' own text, so heading for the guide in the right corner doesn't reveal them.
      const legal = document.querySelector(".legal");
      const textRight = legal ? Math.max(...Array.from(legal.children,(c) => c.getBoundingClientRect().right)) : Infinity;
      const near = !onDock && e.clientY > window.innerHeight - REVEAL_BAND_PX && e.clientX < textRight;
      if ((document.body.dataset.creditsNear === "1") !== near) document.body.dataset.creditsNear = near ? "1" : "0";
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      delete document.body.dataset.creditsNear;
    };
  }, [hidden]);

  if (hidden) return null;
  return <Credits />;
}
