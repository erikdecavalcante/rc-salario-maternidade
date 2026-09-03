export type GhlStage = "lead_qualificado" | "contrato_assinado";

export type GhlStagePayload = {
  contact_id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  trck_user_id: string | null;
  value: number | null;
  currency: string | null;
  // Geo autodeclarada do contato no GHL (city/state/postal_code na raiz do
  // payload nativo — não veio de nenhuma config nossa, é endereço cadastrado
  // no CRM). Único sinal de geo disponível quando o contato não casa com
  // nenhum visitante rastreado (nunca visitou o site rastreado por nós —
  // indicação, WhatsApp direto etc.): sem isso, um evento assim ia pro Meta
  // só com telefone+nome, quando dava pra mandar city/state/zip/country
  // também. Mesmo princípio de prioridade do Purchase da Guru (endereço
  // declarado > geo de navegação).
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

/**
 * O GHL, na ação de Webhook com "Dados personalizados", NÃO manda um JSON
 * plano só com as chaves configuradas — manda o payload nativo inteiro do
 * contato (dezenas de campos: CPF, endereço, tags, location, workflow...) e
 * aninha o que foi configurado dentro de um objeto `customData`. Descoberto
 * com o primeiro evento real de "Contrato Assinado": contact_id/phone
 * "funcionaram" só porque o GHL também manda esses dois nativamente na
 * raiz — email/name/value, que só existiam dentro de customData, ficaram
 * invisíveis até esta função existir. customData tem prioridade (é o que a
 * pessoa configurou deliberadamente); os campos nativos do GHL na raiz
 * (contact_id, phone, full_name/first_name+last_name) são só fallback.
 */
function parseValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    // Merge tag não resolvido no GHL vira texto literal (ex: "custom_values")
    // em vez do número — tratar como ausente, não como erro que derruba o
    // evento inteiro (perder a conversão inteira por causa de um campo
    // secundário mal configurado seria o pior cenário possível aqui).
    const cleaned = raw.trim().replace(/[^\d,.-]/g, "").replace(",", ".");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseGhlStagePayload(raw: unknown): GhlStagePayload | { error: string } {
  const root = asRecord(raw);
  const custom = asRecord(root.customData);
  const contact = asRecord(root.contact);

  const contactId = firstNonEmptyString(custom.contact_id, root.contact_id, contact.id);
  if (!contactId) return { error: "contact_id é obrigatório (nem em customData, nem na raiz do payload)." };

  const name = firstNonEmptyString(
    custom.name,
    root.full_name,
    root.name,
    [root.first_name, root.last_name].filter((v) => typeof v === "string" && v.trim()).join(" "),
  );

  // Mesmo raciocínio do value: um email mal formado (merge tag quebrado,
  // texto solto) vira ausente em vez de derrubar o evento inteiro — email é
  // só mais um sinal de match entre vários (fbp/fbc/telefone/nome/geo
  // continuam valendo mesmo sem ele).
  const rawEmail = firstNonEmptyString(custom.email, root.email, contact.email);
  const email = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail.toLowerCase() : null;

  return {
    contact_id: contactId,
    email,
    phone: firstNonEmptyString(custom.phone, root.phone, contact.phone),
    name,
    trck_user_id: firstNonEmptyString(custom.trck_user_id, root.trck_user_id),
    value: parseValue(custom.value ?? root.value),
    currency: firstNonEmptyString(custom.currency, root.currency),
    city: firstNonEmptyString(custom.city, root.city, contact.city),
    state: firstNonEmptyString(custom.state, root.state, contact.state),
    zip: firstNonEmptyString(custom.zip, custom.postal_code, root.postal_code, contact.postal_code),
    country: firstNonEmptyString(custom.country, root.country, contact.country),
  };
}
