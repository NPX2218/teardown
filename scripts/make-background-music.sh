#!/bin/sh
# Rebuild the original laptop music placeholder.
# Sine tones only. No downloaded audio.
# A local track belongs at public/audio/background.mp3, which is gitignored.
set -eu
cd "$(dirname "$0")/.."
out="public/audio/background-placeholder.mp3"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# 60 s at these frequencies is an exact number of cycles, so the loop meets itself.
# 110 Hz and 111 Hz beat once per second, which is what makes the pad move.
# Render three minutes, then keep the middle minute. Filters are settled there,
# and every tone above still lines up with itself after 60 seconds.
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "sine=frequency=55:sample_rate=22050:duration=180" \
  -f lavfi -i "sine=frequency=82.5:sample_rate=22050:duration=180" \
  -f lavfi -i "sine=frequency=110:sample_rate=22050:duration=180" \
  -f lavfi -i "sine=frequency=111:sample_rate=22050:duration=180" \
  -f lavfi -i "sine=frequency=165:sample_rate=22050:duration=180" \
  -f lavfi -i "sine=frequency=220:sample_rate=22050:duration=180" \
  -f lavfi -i "sine=frequency=330:sample_rate=22050:duration=180" \
  -filter_complex "\
    [0:a]volume=0.16,tremolo=f=0.1:d=0.30[a];\
    [1:a]volume=0.07,tremolo=f=0.2:d=0.25[b];\
    [2:a]volume=0.09,tremolo=f=0.1:d=0.40[c];\
    [3:a]volume=0.035,tremolo=f=0.1:d=0.40[d];\
    [4:a]volume=0.05,tremolo=f=0.2:d=0.22[e];\
    [5:a]volume=0.03,tremolo=f=0.1:d=0.18[f];\
    [6:a]volume=0.015,tremolo=f=0.2:d=0.15[g];\
    [a][b][c][d][e][f][g]amix=inputs=7:normalize=0,lowpass=f=900,atrim=start=60:end=120,asetpts=PTS-STARTPTS\
  " \
  -c:a pcm_s16le "$tmp/pad.wav"

# Peak near -6 dB so the 40% default is quiet, and 100% is still clean.
peak=$(ffmpeg -hide_banner -i "$tmp/pad.wav" -af volumedetect -f null - 2>&1 | awk -F': ' '/max_volume/ {print $2}')
gain=$(awk -v peak="$peak" 'BEGIN { p=peak+0; if (p==0) p=-1; printf "%.2f", -6 - p }')
ffmpeg -y -hide_banner -loglevel error \
  -i "$tmp/pad.wav" \
  -af "volume=${gain}dB" \
  -c:a libmp3lame -b:a 48k -ac 1 -ar 22050 \
  "$out"

echo "wrote $out"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$out"
