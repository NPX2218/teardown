# xAI API notes (04 Task 0)

Checked on: 2026-10-17 · No `XAI_API_KEY` was available in this environment, so nothing below is a live call. Latency, rate-limit headers, and a real tool-call round trip are **pending**. Do not treat these notes as a successful provider acceptance.

Docs read:

- Text chat (legacy): <https://docs.x.ai/developers/model-capabilities/legacy/chat-completions> and <https://docs.x.ai/developers/rest-api-reference/inference/chat-completions>
- Current text guidance: <https://docs.x.ai/developers/model-capabilities/text/best-practices> and <https://docs.x.ai/developers/tools/function-calling>
- Speech to speech: <https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech>
- Ephemeral tokens: <https://docs.x.ai/developers/model-capabilities/audio/ephemeral-tokens> and <https://docs.x.ai/developers/rest-api-reference/inference/voice>
- Text to speech: <https://docs.x.ai/developers/model-capabilities/audio/text-to-speech>

## Text (04)

- Model id → `XAI_TEXT_MODEL`: **not pinned by a live probe**. Docs examples use `grok-4.7`. The client refuses to guess: `grokChat` throws `XAI_TEXT_MODEL missing` until the env var is set.
- Endpoint this slice calls: `POST https://api.x.ai/v1/chat/completions`
- OpenAI-compatible: **yes, as a legacy endpoint**. The current docs say new integrations should use `POST https://api.x.ai/v1/responses` because Chat Completions cannot return encrypted reasoning, so multi-turn tool calls drop the model's earlier thinking.
- `tool_calls` format on Chat Completions: OpenAI shape. `choices[0].message.tool_calls[]` = `{ id, type: "function", function: { name, arguments } }` and `arguments` is a JSON **string**. `parallel_tool_calls` exists (set false to allow only one call). `tool_choice` is documented, including `"auto"`.
- Responses API shape (not what `grokChat` sends today): `output[]` items with `type: "function_call"`, `call_id`, `name`, `arguments` (JSON string), plus reasoning items. Tool results go back as `{ type: "function_call_output", call_id, output }`.
- Why this slice still uses Chat Completions: the stage contract (`ChatMessage`, `tool_calls`, `/api/agent`) is the OpenAI tool-call loop. Switching to Responses without a live probe would be another guess. `lib/agent/normalize.ts` is the seam if a later probe shows we must move.
- Latency (3 runs, simple tool call): **not measured** / **not measured** / **not measured**
- Rate limits: **not stated** on the pages above and **not observed** from response headers. Do not assume a number.

## Voice, speech to speech (05) — this is the interactive path

- WebSocket: `wss://api.x.ai/v1/realtime?model=grok-voice-latest`
- `grok-voice-latest` is the docs' alias for `grok-voice-3.0`. `grok-voice-2.0` is deprecated. Same events and price as 2.0, according to the speech-to-speech page (no dollar amount was printed there).
- Browser auth: browsers cannot set an `Authorization` header on `WebSocket`. Mint a short-lived token with `POST https://api.x.ai/v1/realtime/client_secrets` using the server key, body `{ "expires_after": { "seconds": 300 } }`. The docs note says this body does **not** support `session` or `expires_after.anchor`.
- Response fields: `value` (the ephemeral token) and `expires_at` (unix seconds). The docs' example token begins with the realtime client-secret marker; no sample token is copied here.
- Browser handshake: `new WebSocket(url, [clientSecretProtocolPrefix + value])`, where the prefix is the one printed in the ephemeral-token docs (`xai` + `-client-secret.`).
- Server handshake (cache script / server synthesizer only): `Authorization: Bearer $XAI_API_KEY`. The key never goes to the browser.
- Session: client sends `{ type: "session.update", session: { voice, instructions, turn_detection, audio } }`. Default voice in the docs is `eve`. Default audio is `audio/pcm` at 24000 Hz, both directions. JSON transport sends output audio as base64 on `response.output_audio.delta` (alias `response.audio.delta` on the overview).
- Speak a known line: `conversation.item.create` with `input_text`, then `response.create`. Audio deltas follow until `response.done`.
- Listen: set `turn_detection` to `null` for push-to-talk, append PCM with `input_audio_buffer.append`, then `input_audio_buffer.commit`. User transcript events `conversation.item.input_audio_transcription.updated` / `.completed` are emitted only when `audio.input.transcription.model` is `"grok-transcribe"`. `updated` is cumulative, not a delta.
- Function calls on the voice socket (`response.function_call_arguments.done`) are **not** used for exhibit tools. Scene tools stay on the text agent so a voice turn cannot steer, launch, or award a flight.
- Latency, rate limits, price: **not measured**. No key.

## Text to speech (05 narration files)

Confirmed on the text-to-speech page, not guessed:

- `POST https://api.x.ai/v1/tts`
- JSON body: `text` (required), `language` (required, this slice sends `"en"`), `voice_id` (optional, docs default `eve`, override `XAI_VOICE`).
- Success body: raw audio bytes. Default format is MP3 at 24 kHz / 128 kbps. Optional `output_format.codec` includes `mp3`.
- `GET /v1/tts/voices` lists voice ids. Not called here.
- This is the narration cache and `/api/voice` byte fallback. It is not the microphone path.
- Latency, rate limits, price: **not measured**.

## Speech to text

- The old plan's `POST https://api.x.ai/v1/stt` was a guess. This slice does **not** call it.
- The voice REST reference also describes a streaming transcription WebSocket. Push-to-talk uses the speech-to-speech socket and `grok-transcribe` instead, so the browser needs one confirmed connection.
- `/api/listen` accepts raw `audio/pcm` or `audio/wav` and feeds that PCM to the same realtime session from the server. A WebM container is rejected: the confirmed session wants PCM, μ-law, A-law, or raw Opus packets, not a MediaRecorder container.
- Latency, rate limits, price: **not measured**.

## Imagine (09) → `XAI_IMAGE_MODEL`

- **Not confirmed in this pass.** Stage 09 is out of scope. The agent `imagine` tool validates arguments and returns `imagine not available yet`. It does not invent an image URL or call an image endpoint.
- Endpoint, request body, response, latency, rate limits, price: **pending a 09 docs pass with a key**.

## Fallback when the provider is down

- Text: 8 s upstream abort, 9 s browser round, 15 s whole tool loop. Cancellation is silent (`reply: ""`). Keyword fallback may select a part, start the tour, start a historical replay, or open the flight **briefing**. It never turns engines off, never launches, and never awards orbit.
- Voice: cached file, then Grok TTS, then the browser voice. `stopSay` is sent before a phone line falls back to the laptop. Speech failure does not pause or finish a flight.
- Missing key: routes return an error. Tests mock `fetch`. No test or route fabricates a successful xAI body.
