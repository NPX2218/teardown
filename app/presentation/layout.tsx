import type { ReactNode } from "react";

/**
 * Nested layout only. The root app/layout.tsx belongs to Neel and is not
 * edited here. When that file exists, this route still fills the viewport
 * from inside .deck (position: fixed). See the contract note in
 * components/presentation/motion-fixture.ts.
 */
export default function PresentationLayout({ children }: { children: ReactNode }) {
  return children;
}
