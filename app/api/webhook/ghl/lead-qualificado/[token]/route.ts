import type { NextRequest } from "next/server";
import { handleGhlWebhook } from "@/lib/ghl/handle-webhook";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/webhook/ghl/lead-qualificado/[token]">) {
  const { token } = await ctx.params;
  return handleGhlWebhook(request, token, "lead_qualificado");
}
