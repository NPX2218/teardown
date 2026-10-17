"use client";
// Temporary page fixture. Anders PR #3 owns components/voice/VoiceSlot.tsx.
// app/page.tsx imports this file so the build does not depend on that PR.
export function VoiceSlot() {
  return <div data-slot="voice" />;
}
