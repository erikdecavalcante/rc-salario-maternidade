import "server-only";
import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashEmail, hashPhone, splitName } from "@/lib/meta/hashing";
import { dispatchEvent } from "@/lib/tracking/dispatch-event";
import { matchVisitor, type VisitorMatch } from "@/lib/guru/match-visitor";
import type { GhlWebhookPayload } from "./webhook-schema";

// Nome do evento por etapa: PascalCase pra Meta (mesma convenção de
// IniciouQuiz/ViewContent/Lead), snake_case pro GA4 (convenção do MP, igual
// "purchase" no fluxo da Guru). Eventos CUSTOM, não os padrão da Meta — não
// existe "Lead"/"Purchase" de novo aqui de propósito, pra não contar duas
// vezes a mesma pessoa como duas conversões do MESMO tipo no Ads Manager.
const STAGE_EVENT_NAMES: Record<GhlWebhookPayload["stage"], { meta: string; ga4: string }> = {
  lead_qualificado: { meta: "LeadQualificado", ga4: "lead_qualificado" },
  contrato_assinado: { meta: "ContratoAssinado", ga4: "contrato_assinado" },
};

export type ProcessStageEventResult = {
  id: string;
  dispatched: boolean;
  matchMethod: string;
};

/**
 * Idempotente por (ghl_contact_id, stage): reenvio do mesmo contato na mesma
 * etapa (reprocessamento do GHL, teste manual) faz UPDATE mas só dispara uma
 * vez — checa dispatch_event_id, mesmo mecanismo de purchase_event_id na
 * Guru. Disparo pro Meta/GA4 em segundo plano (waitUntil) — mesmo motivo do
 * timeout de entrega já resolvido pro webhook da Guru: responder rápido,
 * deixar a chamada de rede pra depois.
 */
export async function processGhlStageEvent(payload: GhlWebhookPayload, rawPayload: unknown): Promise<ProcessStageEventResult> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("ghl_stage_events")
    .select("id, dispatch_event_id")
    .eq("ghl_contact_id", payload.contact_id)
    .eq("stage", payload.stage)
    .maybeSingle();

  const match = await matchVisitor(admin, {
    trckUserId: payload.trck_user_id ?? null,
    email: payload.email ?? null,
    phone: payload.phone ?? null,
  });

  const fields = {
    trck_user_id: payload.trck_user_id ?? match.visitor?.trck_user_id ?? null,
    visitor_id: match.visitor?.id ?? null,
    match_method: match.method,
    contact_name: payload.name ?? null,
    contact_email: payload.email ?? null,
    contact_email_hash: payload.email ? hashEmail(payload.email) : null,
    contact_phone: payload.phone ?? null,
    contact_phone_hash: payload.phone ? hashPhone(payload.phone) : null,
    value: payload.value ?? null,
    currency: payload.currency ?? null,
    raw_payload: rawPayload,
    updated_at: new Date().toISOString(),
  };

  let id: string;
  const alreadyDispatched = existing?.dispatch_event_id != null;

  if (existing) {
    id = existing.id;
    await admin.from("ghl_stage_events").update(fields).eq("id", id);
  } else {
    const { data: inserted, error } = await admin
      .from("ghl_stage_events")
      .insert({ ghl_contact_id: payload.contact_id, stage: payload.stage, ...fields })
      .select("id")
      .single();
    if (error) throw new Error(`Falha ao criar ghl_stage_events: ${error.message}`);
    id = inserted.id;
  }

  const shouldDispatch = !alreadyDispatched;

  if (shouldDispatch) {
    waitUntil(
      dispatchStageEvent({ admin, payload, id, match }).catch((err) => {
        console.error("Erro ao disparar evento GHL em segundo plano:", err);
      }),
    );
  }

  return { id, dispatched: shouldDispatch, matchMethod: match.method };
}

async function dispatchStageEvent(args: {
  admin: ReturnType<typeof createAdminClient>;
  payload: GhlWebhookPayload;
  id: string;
  match: VisitorMatch;
}): Promise<void> {
  const { admin, payload, id, match } = args;
  const eventNames = STAGE_EVENT_NAMES[payload.stage];
  const eventId = `ghl-${payload.contact_id}-${payload.stage}`;

  const { firstName, lastName } = splitName(payload.name ?? match.visitor?.name ?? "");

  const result = await dispatchEvent({
    ga4EventName: eventNames.ga4,
    metaEventName: eventNames.meta,
    eventId,
    ip: null,
    userAgent: null,
    userData: {
      email: payload.email ?? match.visitor?.email,
      phone: payload.phone ?? match.visitor?.phone,
      firstName,
      lastName,
      city: match.visitor?.geo_city,
      state: match.visitor?.geo_region,
      country: match.visitor?.geo_country,
      fbp: match.visitor?.fbp,
      fbc: match.visitor?.fbc,
      externalId: payload.trck_user_id ?? match.visitor?.trck_user_id,
    },
    customData: {
      value: payload.value ?? undefined,
      currency: payload.currency ?? undefined,
    },
    ga4Params: {
      value: payload.value ?? undefined,
      currency: payload.currency ?? undefined,
    },
    ga4: {
      clientId: match.visitor?.ga_client_id,
      sessionId: match.visitor?.ga_session_id,
    },
    serverOnly: true,
  });

  const { data: eventRow } = await admin
    .from("events_log")
    .insert({
      event_id: eventId,
      event_name: eventNames.meta,
      trck_user_id: payload.trck_user_id ?? match.visitor?.trck_user_id ?? null,
      visitor_id: match.visitor?.id ?? null,
      value: payload.value ?? null,
      currency: payload.currency ?? null,
      geo_country: match.visitor?.geo_country ?? null,
      geo_region: match.visitor?.geo_region ?? null,
      geo_city: match.visitor?.geo_city ?? null,
      status: result.status,
      payload_meta: result.payloadMeta,
      response_meta: result.responseMeta,
      payload_ga4: result.payloadGa4,
      response_ga4: result.responseGa4,
    })
    .select("id")
    .single();

  await admin.from("ghl_stage_events").update({ dispatch_event_id: eventRow?.id ?? null }).eq("id", id);
}
