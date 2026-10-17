# Background music

The laptop plays one quiet loop on every page except `/rocket`. The phone engine rumble is a different sound. It lives in `public/sounds/` and follows engine power. This track does not.

## What plays

| | |
|---|---|
| File | `public/audio/background.mp3` |
| Player | `components/audio/BackgroundMusic.tsx`, mounted once in `app/layout.tsx` |
| Starts | After the first tap, click, or key press. Browsers block sound before that. |
| Loop | Yes. The same element stays mounted when you change laptop pages, so the song does not restart. |
| Phone | `/rocket` does not mount the player. Nothing from this file downloads or plays there. |
| Level | Music slider × Master sound slider. Both are 0–100%. |
| Default | Music 40%, Master 100%, so the first visit is gentle. |
| Saved in | `localStorage` key `teardown.settings`, field `musicPercent`, next to the other settings. |
| Fade | About 0.75 s in and out. If the visitor asked for reduced motion, the level changes at once. |

Turning the phone's engine sound off does not mute this track. Master sound does.

## The file in the repo

`public/audio/background.mp3` is an original 60 second pad made of sine tones. It was synthesized with ffmpeg (`scripts/make-background-music.sh`). It is not a recording, not from YouTube, and not from a sample library. Rebuild it with:

```bash
sh scripts/make-background-music.sh
```

You need ffmpeg with `libmp3lame`. The script writes only `public/audio/background.mp3`.

## Swap in a licensed track

1. Use a track you have the rights to play in this exhibit (your own recording, a CC0 / public-domain piece, or a licence that allows this use).
2. Encode it as MP3.
3. Replace `public/audio/background.mp3`. Keep that exact path and file name.
4. Prefer a seamless loop of about 30–60 seconds, or a calm piece up to about 2 minutes. A short loop keeps the file small.
5. Do not add the file to `public/audio/manifest.json`. That manifest is only the Grok voice cache.
6. Note the source and licence in `public/audio/CREDITS.md` and in the README credits.

Do not download music from YouTube or any other copyrighted source and commit it.

A useful encode, if your source is already a wav you are allowed to use:

```bash
ffmpeg -y -i licensed-track.wav -t 120 -c:a libmp3lame -b:a 96k -ac 1 public/audio/background.mp3
```

Leave the player code alone. It always reads `/audio/background.mp3`.
