# Background music

The laptop plays one quiet loop on every page except `/rocket`. The phone engine rumble is a different sound. It lives in `public/sounds/` and follows engine power. This track does not.

## What plays

| | |
|---|---|
| Track | `public/audio/background.mp3` — Mokka - No Copyright Music, first 2 minutes, about 128 kbps, with a 3 second fade at the end |
| Fallback | `public/audio/background-placeholder.mp3` when that file is missing (404). Original sine pad, not the Mokka recording. |
| Player | `components/audio/BackgroundMusic.tsx`, mounted once in `app/layout.tsx` |
| Starts | After the first tap, click, or key press. Browsers block sound before that. |
| Loop | Yes. The same element stays mounted when you change laptop pages, so the song does not restart. |
| Phone | `/rocket` does not mount the player, and it does not request either file. |
| Level | Music slider × Master sound slider. Both are 0–100%. |
| Default | Music 40%, Master 100%, so the first visit is gentle. |
| Saved in | `localStorage` key `teardown.settings`, field `musicPercent`, next to the other settings. |
| Fade | The player fades the level in and out (about 0.75 s). Reduced motion sets the level at once. The file itself also fades out over its last 3 seconds. |

Turning the phone's engine sound off does not mute this track. Master sound does.

Credit, on the settings sheet and in the README: Music: Mokka - No Copyright Music.

## The placeholder

`public/audio/background-placeholder.mp3` is an original 60 second pad made of sine tones (`scripts/make-background-music.sh`). It plays only when `background.mp3` is missing. Rebuild it with:

```bash
sh scripts/make-background-music.sh
```

You need ffmpeg with `libmp3lame`. The script writes only the placeholder.

Do not add either file to `public/audio/manifest.json`. That manifest is only the Grok voice cache.
