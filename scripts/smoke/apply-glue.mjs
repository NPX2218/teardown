// Apply the post-merge voice/mascot glue in a throwaway worktree.
// Product lines: import onVoiceState, import bindVoiceActivity, bindVoiceActivity(onVoiceState).
// The call sits in the GuideLauncher mount effect. Module scope would run on the server.
// The window hook is harness-only so Playwright can call setVoiceState. It is not app code.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const file = resolve(root, "components/ui/GuideLauncher.tsx");
let source = readFileSync(file, "utf8");

if (source.includes('from "@/lib/voice/activity"') && source.includes("bindVoiceActivity(onVoiceState)")) {
  console.log(`glue already present in ${file}`);
  process.exit(0);
}

const activityImport = 'import { useMascotActivity } from "@/lib/mascot/activity";';
const bridgeImport = 'import { connectVoiceActivity } from "@/lib/mascot/voice-bridge";';
const effect = "  useEffect(() => connectVoiceActivity(), []);";

if (!source.includes(activityImport) || !source.includes(bridgeImport) || !source.includes(effect)) {
  console.error("glue: GuideLauncher.tsx does not match the expected #15 shape");
  process.exit(2);
}

source = source.replace(
  activityImport,
  'import { setVoiceState, useMascotActivity } from "@/lib/mascot/activity";',
);
source = source.replace(
  bridgeImport,
  [
    'import { bindVoiceActivity } from "@/lib/mascot/voice-bridge";',
    'import { onVoiceState } from "@/lib/voice/activity";',
  ].join("\n"),
);
source = source.replace(
  effect,
  [
    "  useEffect(() => {",
    "    const stop = bindVoiceActivity(onVoiceState);",
    "    const hook = window as unknown as { __teardownSetVoiceState?: typeof setVoiceState };",
    "    hook.__teardownSetVoiceState = setVoiceState;",
    "    return () => {",
    "      stop();",
    "      hook.__teardownSetVoiceState = undefined;",
    "    };",
    "  }, []);",
  ].join("\n"),
);

writeFileSync(file, source);
console.log(`glue applied in ${file}`);
