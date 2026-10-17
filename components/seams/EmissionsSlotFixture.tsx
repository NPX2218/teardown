"use client";
// Temporary page fixture. Anders PR #1 owns components/emissions/EmissionsSlot.tsx.
// app/page.tsx imports this file so the build does not depend on that PR.
export function EmissionsSlot() {
  return <div data-slot="emissions" />;
}
