import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSettings } from "@/lib/config/settings";
import { readSecret } from "@/lib/vault/secrets";
import { ghlWebhookSchema } from "@/lib/ghl/webhook-schema";
import { processGhlStageEvent } from "@/lib/ghl/process-stage-event";
import { isInternalIp } from "@/lib/tracking/internal-ips";
import { isMetaBotTraffic } from "@/lib/tracking/meta-bot-traffic";
import { getClientIp, getUserAgent } from "@/lib/tracking/request-meta";

/** Mesmo mecanismo do webhook da Guru: compara hashes (tamanho fixo) em vez
 * dos tokens crus — evita timing attack e o throw do timingSafeEqual quando
 * os buffers têm tamanhos diferentes. */
function tokensMatch(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/webhook/ghl/[token]">) {
  const { token } = await ctx.params;

  const settings = await getSettings();
  if (!settings.ghl_webhook_token_id) {
    return NextResponse.json({ error: "Webhook não configurado." }, { status: 503 });
  }

  const expectedToken = await readSecret(settings.ghl_webhook_token_id);
  if (!token || !tokensMatch(token, expectedToken)) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = ghlWebhookSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // O GHL não manda IP/UA do lead (é servidor-a-servidor) — essas checagens
  // aqui são só por consistência com os outros pontos de entrada; na prática
  // não devem barrar nada vindo de um webhook legítimo.
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);
  if (await isInternalIp(ip)) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  if (await isMetaBotTraffic(ip, userAgent)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const result = await processGhlStageEvent(parsed.data, json);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Erro ao processar webhook GHL:", err);
    return NextResponse.json({ error: "Erro ao processar." }, { status: 500 });
  }
}
