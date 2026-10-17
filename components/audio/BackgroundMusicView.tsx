import { forwardRef } from "react";
import type { MusicMount } from "@/lib/audio/background";

/** No controls and no autoplay. The player starts it after a gesture. */
export const BackgroundMusicView = forwardRef<
  HTMLAudioElement,
  { mount: MusicMount; src: string | null; onError?: () => void }
>(function BackgroundMusicView({ mount, src, onError }, ref) {
  if (mount === "off") return null;
  return (
    <audio
      ref={ref}
      src={src ?? undefined}
      loop
      preload={src ? "auto" : "none"}
      aria-hidden="true"
      onError={onError}
    />
  );
});
