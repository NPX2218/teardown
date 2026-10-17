# Local MVP preview

**Goal:** make the current Teardown design tangible in a runnable local app, improving the recovered browser prototype while showing which features work.
**Source:** `docs/specs/README.md`; the previously inspected Falcon 9 browser prototype and its licensed model.
**Architecture:** a dependency-free local Node server serves a browser app, vendored three.js and the real GLB. Pure TypeScript helpers own mission poses, checkpoint progression, engine math and local facts-based guide commands. This preview is a bounded implementation of the approved experience; the staged Next.js build remains specified separately.

| Task | Files | Acceptance |
|---|---|---|
| Recover assets and current facts | `mvp/assets`, `mvp/data`, `mvp/vendor` | Model loads locally; no external model/CDN dependency; model and library credits preserved. |
| Pin demo logic before implementation | `mvp/domain.helpers.ts`, `mvp/__tests__/domain.test.ts` | Red/green tests for replay determinism, six checkpoint moves, invalid inputs, engine totals and local guide intent. |
| Build the visible experience | `mvp/index.html`, `mvp/styles.css`, `mvp/viewer.js`, `mvp/app.js` | Real 3D selection/explosion, tour, replay/scrub, guided touch mission, engine-out and estimated emissions all respond. |
| Make the status honest | Feature dialog, `README.md` | Live API, relay, physical gestures and image generation are labelled as requiring setup; local guide never claims to be Grok. |
| Verify and show | `scripts/serve.mjs`, `scripts/build.mjs` | Tests, static build, browser interaction checks, desktop/mobile screenshots, visible local preview. |

**Review focus:** switching modes cancels narration/tours; scrubbing is deterministic; wrong moves never advance checkpoints; no disconnected service is presented as live; mobile panels stay usable with the model visible.

Build directly on the preview branch. Keep the result local, without registering hosting or publishing. No credentials are needed for this MVP. Core interactions remain usable with speech disabled or browser speech unavailable.
