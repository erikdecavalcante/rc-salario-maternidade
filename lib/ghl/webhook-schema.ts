import { z } from "zod";

/**
 * Payload do webhook do GoHighLevel — diferente do da Guru (formato fixo,
 * documentado pela plataforma), este é um formato que A GENTE define: o
 * workflow do GHL manda um corpo JSON customizado, montado à mão com os
 * merge fields do contato/oportunidade. Ver instruções de configuração
 * entregues ao usuário (URL do webhook + corpo JSON exato).
 *
 * `stage` é literal, digitado no corpo do webhook de cada automação do GHL
 * (uma automação por etapa) — não vem de nenhum merge field.
 */
export const ghlWebhookSchema = z.object({
  stage: z.enum(["lead_qualificado", "contrato_assinado"]),
  contact_id: z.string().trim().min(1, { error: "contact_id é obrigatório." }),
  email: z.string().trim().toLowerCase().email().nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  name: z.string().trim().max(255).nullable().optional(),
  trck_user_id: z.string().trim().nullable().optional(),
  value: z.coerce.number().nullable().optional(),
  currency: z.string().trim().length(3).nullable().optional(),
});

export type GhlWebhookPayload = z.infer<typeof ghlWebhookSchema>;
