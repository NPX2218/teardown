# Background music

The laptop plays one quiet loop on every page except `/rocket`. The phone engine rumble is a different sound. It lives in `public/sounds/` and follows engine power. This track does not.

## What plays

| | |
|---|---|
| Your track | `public/audio/background.mp3` (gitignored) |
| Fallback | `public/audio/background-placeholder.mp3` when that file is missing (404) |
| Player | `components/audio/BackgroundMusic.tsx`, mounted once in `app/layout.tsx` |
| Starts | After the first tap, click, or key press. Browsers block sound before that. |
| Loop | Yes. The same element stays mounted when you change laptop pages, so the song does not restart. |
| Phone | `/rocket` does not mount the player, and it does not request either file. |
| Level | Music slider × Master sound slider. Both are 0–100%. |
| Default | Music 40%, Master 100%, so the first visit is gentle. |
| Saved in | `localStorage` key `teardown.settings`, field `musicPercent`, next to the other settings. |
| Fade | About 0.75 s in and out. If the visitor asked for reduced motion, the level changes at once. |

Turning the phone's engine sound off does not mute this track. Master sound does.

## Drop in your track

Put your MP3 at `public/audio/background.mp3`. That path is in `.gitignore`, so the real track is never committed.

1. Use a track you have the rights to play in this exhibit.
2. Encode it as MP3.
3. Save it as `public/audio/background.mp3`. Do not rename the placeholder over it, and do not `git add` it.
4. Reload the laptop page. The player checks that path first. `npm run dev` notices a new file right away. `npm start` reads the public folder when it boots, so restart it after you add the track.
5. Prefer a seamless loop of about 30–60 seconds, or a calm piece up to about 2 minutes.

If `background.mp3` is missing, the browser gets a 404 and the player switches to `background-placeholder.mp3`.

Do not download music from YouTube or any other copyrighted source.

A useful encode, if your source is already a wav you are allowed to use:

```bash
ffmpeg -y -i licensed-track.wav -t 120 -c:a libmp3lame -b:a 96k -ac 1 public/audio/background.mp3
```

## The placeholder in the repo

`public/audio/background-placeholder.mp3` is an original 60 second pad made of sine tones. It was synthesized with ffmpeg (`scripts/make-background-music.sh`). It is not a recording, not from YouTube, and not from a sample library. Rebuild it with:

```bash
sh scripts/make-background-music.sh
```

You need ffmpeg with `libmp3lame`. The script writes only `public/audio/background-placeholder.mp3`.

Do not add either file to `public/audio/manifest.json`. That manifest is only the Grok voice cache.
