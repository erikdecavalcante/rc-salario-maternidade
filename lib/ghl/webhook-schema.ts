import { z } from "zod";

export type GhlStage = "lead_qualificado" | "contrato_assinado";

/**
 * Payload do webhook do GoHighLevel — formato que A GENTE define (o
 * workflow do GHL manda um corpo JSON customizado, montado à mão com os
 * merge fields do contato/oportunidade). SEM campo `stage`: cada etapa tem
 * sua própria URL/token (ver app/api/webhook/ghl/[stage]/[token]/route.ts)
 * — evita depender de alguém digitar o valor certo no corpo do webhook.
 */
export const ghlStagePayloadSchema = z.object({
  contact_id: z.string().trim().min(1, { error: "contact_id é obrigatório." }),
  email: z.string().trim().toLowerCase().email().nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  name: z.string().trim().max(255).nullable().optional(),
  trck_user_id: z.string().trim().nullable().optional(),
  value: z.coerce.number().nullable().optional(),
  currency: z.string().trim().length(3).nullable().optional(),
});

export type GhlStagePayload = z.infer<typeof ghlStagePayloadSchema>;
