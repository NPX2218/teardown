// Local stand-in for 01's ToolResult. Contract delta: import this from "@/lib/types" once that file lands.

export interface ToolResult {
  ok: boolean;
  error?: string;
  data?: unknown;
}
