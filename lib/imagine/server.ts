// lib/imagine/server.ts — the only Imagine module that reads the xAI key. Owner: Anders.
import "server-only";

export interface ImagineServerConfig {
  apiKey: string | undefined;
  model: string | undefined;
}

/** Empty strings count as missing. The browser never imports this file. */
export function readImagineConfig(): ImagineServerConfig {
  const apiKey = process.env.XAI_API_KEY;
  const model = process.env.XAI_IMAGE_MODEL;
  return {
    apiKey: typeof apiKey === "string" && apiKey !== "" ? apiKey : undefined,
    model: typeof model === "string" && model !== "" ? model : undefined,
  };
}
