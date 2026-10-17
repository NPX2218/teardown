# Scratch integration

These notes are for the unpushed stack that combines Neel `neel/12-integration` with the mascot, the Earth skins, and Anders's branches. They are not wired on the `neel/*` branches, because those files arrive with Anders's PRs.

## Imagine

When `lib/imagine/client.ts` is present, the agent tool map should call the real client:

```ts
import { runImagineTool } from "@/lib/imagine/client";

imagine: (args) => runImagineTool(args)
```

Do not add that import on a Neel branch that does not contain `lib/imagine/client.ts`.

## Mascot voice

The mascot subscribes to `lib/voice/activity.ts` (`onVoiceState`, `getMicStream`, `getOutputNode`). That subscription belongs to the mascot agent. Flight code exposes `warningLevel` and `failureReason` on the scene store for the mascot to read.
