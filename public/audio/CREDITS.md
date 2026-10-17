# Audio credits

`manifest.json` is the Grok voice cache. It ships empty. Narration files added there are named by hash. They are not music.

Background music is separate from that cache and from the phone engine sounds.

| File | Source | Licence | Note |
|---|---|---|---|
| background-placeholder.mp3 | `scripts/make-background-music.sh` in this repo | CC0 1.0 — original sine-tone synthesis, no third-party recording | 60 s pad, mono, 48 kbps. Plays when `background.mp3` is missing. |
| background.mp3 | Your local file | Yours to confirm | Gitignored. Drop a track you have the rights to play at this path. Never commit it. |

Steps: [docs/background-music.md](../../docs/background-music.md).
