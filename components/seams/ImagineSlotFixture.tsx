"use client";
// Temporary page fixture. Anders PR #4 owns components/imagine/ImagineSlot.tsx.
// app/page.tsx imports this file so the build does not depend on that PR.
export function ImagineSlot() {
  return <div data-slot="imagine" />;
}
