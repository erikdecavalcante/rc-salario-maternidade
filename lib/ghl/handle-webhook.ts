import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSettings, type Settings } from "@/lib/config/settings";
import { readSecret } from "@/lib/vault/secrets";
import { ghlStagePayloadSchema, type GhlStage } from "./webhook-schema";
import { processGhlStageEvent } from "./process-stage-event";
import { isInternalIp } from "@/lib/tracking/internal-ips";
import { isMetaBotTraffic } from "@/lib/tracking/meta-bot-traffic";
import { getClientIp, getUserAgent } from "@/lib/tracking/request-meta";

// Uma coluna de token por etapa (não uma só com `stage` no corpo) — a etapa
// fica implícita na URL, sem depender de alguém digitar o valor certo no
// JSON de cada automação do GHL. Ver conversa com o usuário sobre a troca.
const STAGE_TOKEN_COLUMN: Record<GhlStage, keyof Settings> = {
  lead_qualificado: "ghl_lead_qualificado_token_id",
  contrato_assinado: "ghl_contrato_assinado_token_id",
};

/** Mesmo mecanismo do webhook da Guru: compara hashes (tamanho fixo) em vez
 * dos tokens crus — evita timing attack e o throw do timingSafeEqual quando
 * os buffers têm tamanhos diferentes. */
function tokensMatch(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export async function handleGhlWebhook(request: NextRequest, token: string, stage: GhlStage): Promise<NextResponse> {
  const settings = await getSettings();
  const tokenId = settings[STAGE_TOKEN_COLUMN[stage]] as string | null;
  if (!tokenId) {
    return NextResponse.json({ error: "Webhook não configurado." }, { status: 503 });
  }

  const expectedToken = await readSecret(tokenId);
  if (!token || !tokensMatch(token, expectedToken)) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = ghlStagePayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // O GHL não manda IP/UA do lead (é servidor-a-servidor) — checagens aqui
  // só por consistência com os outros pontos de entrada.
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);
  if (await isInternalIp(ip)) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  if (await isMetaBotTraffic(ip, userAgent)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const result = await processGhlStageEvent(stage, parsed.data, json);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(`Erro ao processar webhook GHL (${stage}):`, err);
    return NextResponse.json({ error: "Erro ao processar." }, { status: 500 });
  }
}
