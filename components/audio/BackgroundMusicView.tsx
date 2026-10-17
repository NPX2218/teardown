import { forwardRef } from "react";
import { BACKGROUND_MUSIC_SRC, type MusicMount } from "@/lib/audio/background";

/** No controls and no autoplay. The player starts it after a gesture. */
export const BackgroundMusicView = forwardRef<HTMLAudioElement, { mount: MusicMount }>(
  function BackgroundMusicView({ mount }, ref) {
    if (mount === "off") return null;
    return (
      <audio
        ref={ref}
        src={BACKGROUND_MUSIC_SRC}
        loop
        preload="auto"
        aria-hidden="true"
      />
    );
  },
);
