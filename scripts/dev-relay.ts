// scripts/dev-relay.ts — `npm run relay:dev`. Owner: Neel.
// Listens on 127.0.0.1:8787 unless ROCKET_RELAY_PORT is set.
import { startDevRelay } from "../lib/rocket/dev-relay";

const port = Number(process.env.ROCKET_RELAY_PORT ?? 8787);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error("ROCKET_RELAY_PORT must be an integer from 0 to 65535");
  process.exit(1);
}

startDevRelay(port).then(
  (relay) => {
    console.log(`rocket relay on ${relay.url}`);
  },
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
