"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSecret, updateSecret } from "@/lib/vault/secrets";
import { getSettings } from "@/lib/config/settings";
import { settingsSchema } from "@/lib/validation/config-schemas";

export type SettingsActionState = { error: string } | undefined;

export async function updateSettings(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const parsed = settingsSchema.safeParse({
    currency: formData.get("currency"),
    timezone: formData.get("timezone"),
    retention_days: formData.get("retention_days"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { error } = await admin
    .from("settings")
    .update({
      currency: parsed.data.currency,
      timezone: parsed.data.timezone,
      retention_days: parsed.data.retention_days,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) return { error: "Erro ao salvar: " + error.message };

  revalidatePath("/configuracoes");
  redirect("/configuracoes");
}

export async function regenerateWebhookToken() {
  const settings = await getSettings();
  const token = randomBytes(24).toString("hex");
  const admin = createAdminClient();

  if (settings.webhook_token_id) {
    await updateSecret(settings.webhook_token_id, token);
  } else {
    const secretId = await createSecret(token, "webhook_token");
    await admin.from("settings").update({ webhook_token_id: secretId }).eq("id", true);
  }

  revalidatePath("/configuracoes");
}

export type SetWebhookTokenState = { error: string } | undefined;

export async function setWebhookToken(
  _prev: SetWebhookTokenState,
  formData: FormData,
): Promise<SetWebhookTokenState> {
  const token = (formData.get("token") as string | null)?.trim();
  if (!token || token.length < 16) {
    return { error: "O token precisa ter pelo menos 16 caracteres." };
  }

  const settings = await getSettings();
  const admin = createAdminClient();

  if (settings.webhook_token_id) {
    await updateSecret(settings.webhook_token_id, token);
  } else {
    const secretId = await createSecret(token, "webhook_token");
    await admin.from("settings").update({ webhook_token_id: secretId }).eq("id", true);
  }

  revalidatePath("/configuracoes");
}

// --- Webhook do GHL: uma URL/token POR ETAPA (lead_qualificado e
// contrato_assinado), não uma só com `stage` no corpo — evita depender de
// alguém digitar o valor certo em cada automação do GHL. Com 2 colunas
// (+ a webhook_token_id da Guru = 3 no total), a duplicação já compensa
// generalizar num par de helpers, diferente do webhookToken acima (só 1 caso).

type GhlStageTokenColumn = "ghl_lead_qualificado_token_id" | "ghl_contrato_assinado_token_id";

async function regenerateStageToken(column: GhlStageTokenColumn, secretLabel: string) {
  const settings = await getSettings();
  const token = randomBytes(24).toString("hex");
  const admin = createAdminClient();
  const currentId = settings[column];

  if (currentId) {
    await updateSecret(currentId, token);
  } else {
    const secretId = await createSecret(token, secretLabel);
    await admin.from("settings").update({ [column]: secretId }).eq("id", true);
  }

  revalidatePath("/configuracoes");
}

async function setStageToken(
  column: GhlStageTokenColumn,
  secretLabel: string,
  formData: FormData,
): Promise<SetWebhookTokenState> {
  const token = (formData.get("token") as string | null)?.trim();
  if (!token || token.length < 16) {
    return { error: "O token precisa ter pelo menos 16 caracteres." };
  }

  const settings = await getSettings();
  const admin = createAdminClient();
  const currentId = settings[column];

  if (currentId) {
    await updateSecret(currentId, token);
  } else {
    const secretId = await createSecret(token, secretLabel);
    await admin.from("settings").update({ [column]: secretId }).eq("id", true);
  }

  revalidatePath("/configuracoes");
}

export async function regenerateGhlLeadQualificadoToken() {
  await regenerateStageToken("ghl_lead_qualificado_token_id", "ghl_lead_qualificado_token");
}

export async function setGhlLeadQualificadoToken(
  _prev: SetWebhookTokenState,
  formData: FormData,
): Promise<SetWebhookTokenState> {
  return setStageToken("ghl_lead_qualificado_token_id", "ghl_lead_qualificado_token", formData);
}

export async function regenerateGhlContratoAssinadoToken() {
  await regenerateStageToken("ghl_contrato_assinado_token_id", "ghl_contrato_assinado_token");
}

export async function setGhlContratoAssinadoToken(
  _prev: SetWebhookTokenState,
  formData: FormData,
): Promise<SetWebhookTokenState> {
  return setStageToken("ghl_contrato_assinado_token_id", "ghl_contrato_assinado_token", formData);
}
