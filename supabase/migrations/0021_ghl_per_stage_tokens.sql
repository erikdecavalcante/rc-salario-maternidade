-- Substitui o webhook único do GHL (uma URL, `stage` digitado no corpo) por
-- um webhook POR ETAPA (etapa implícita na URL, um token cada). Motivo:
-- `stage` sendo digitado à mão em cada automação do GHL é erro humano
-- esperando pra acontecer (duplicar a automação de lead_qualificado pra
-- fazer a de contrato_assinado e esquecer de trocar o campo) — com uma URL
-- por etapa, não existe mais esse campo pra errar.
alter table settings add column if not exists ghl_lead_qualificado_token_id uuid references vault.secrets (id);
alter table settings add column if not exists ghl_contrato_assinado_token_id uuid references vault.secrets (id);
alter table settings drop column if exists ghl_webhook_token_id;
