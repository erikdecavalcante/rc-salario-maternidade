import type { NextRequest } from "next/server";
import { handleGhlWebhook } from "@/lib/ghl/handle-webhook";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/webhook/ghl/contrato-assinado/[token]">) {
  const { token } = await ctx.params;
  return handleGhlWebhook(request, token, "contrato_assinado");
}
