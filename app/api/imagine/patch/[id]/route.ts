// app/api/imagine/patch/[id]/route.ts — the picture a mission-patch QR points at. Owner: Anders.
import { getPatch } from "@/lib/imagine/patch-cache";

export const runtime = "nodejs";

const PATCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, context: { params: { id: string } }): Promise<Response> {
  const id = context.params?.id ?? "";
  if (!PATCH_ID.test(id)) return new Response("not found", { status: 404 });
  const patch = getPatch(id);
  if (!patch) return new Response("not found", { status: 404 });
  return new Response(patch.bytes, {
    headers: {
      "content-type": patch.contentType,
      "cache-control": "public, max-age=86400",
    },
  });
}
