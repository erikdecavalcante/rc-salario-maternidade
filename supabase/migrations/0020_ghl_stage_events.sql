-- Webhook do GoHighLevel (GHL): duas novas etapas do funil vindas do CRM da
-- equipe de vendas — "Lead Qualificado" e "Contrato Assinado". Diferente do
-- webhook da Guru (transação de compra, trck_user_id sempre via utm_term),
-- aqui o GHL não tem noção do trck_user_id — o matching é por email/telefone
-- na maioria das vezes (mesmo mecanismo de matchVisitor() já usado pela
-- Guru, só que como caminho principal em vez de fallback).

-- Token do webhook GHL — mesmo padrão do webhook_token da Guru (Vault,
-- comparado via hash no path da rota, nunca em query string).
alter table settings add column if not exists ghl_webhook_token_id uuid references vault.secrets (id);

-- Idempotência por (ghl_contact_id, stage): se a automação do GHL rodar de
-- novo pro mesmo contato na mesma etapa (reprocessamento, teste manual),
-- atualiza a linha mas não redispara pro Meta/GA4 — mesma lógica de
-- purchase_event_id em purchases.
create table ghl_stage_events (
  id uuid primary key default gen_random_uuid(),
  ghl_contact_id text not null,
  stage text not null check (stage in ('lead_qualificado', 'contrato_assinado')),
  trck_user_id text,
  visitor_id uuid references visitors (id) on delete set null,
  match_method text not null default 'unmatched',
  contact_name text,
  contact_email text,
  contact_email_hash text,
  contact_phone text,
  contact_phone_hash text,
  value numeric,
  currency text,
  dispatch_event_id uuid references events_log (id) on delete set null,
  raw_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ghl_contact_id, stage)
);

create index idx_ghl_stage_events_visitor on ghl_stage_events (visitor_id);
create index idx_ghl_stage_events_stage on ghl_stage_events (stage);

alter table ghl_stage_events enable row level security;
create policy "authenticated read" on ghl_stage_events for select to authenticated using (true);
create policy "service role write" on ghl_stage_events for all to service_role using (true) with check (true);

comment on column ghl_stage_events.match_method is 'trck_user_id | email | phone | unmatched — igual match-visitor.ts';

-- Funil realinhado com o vocabulário real de eventos deste negócio (sem
-- checkout/compra via Guru, que nunca disparam aqui): visitou -> iniciou o
-- quiz -> chegou no cadastro -> lead -> lead qualificado -> contrato
-- assinado. coalesce(trck_user_id, id::text) nas duas etapas novas pelo
-- mesmo motivo de 'purchase' na versão anterior: evento vindo do GHL pode
-- não ter trck_user_id (contato sem match), e count(distinct x) ignora NULL
-- — sem o coalesce, todo lead não-casado sumiria da contagem do funil.
create or replace function funnel_counts(date_from timestamptz default null, date_to timestamptz default null)
returns table (stage text, visitor_count bigint)
language sql
stable
as $$
  select 'visited'::text as stage, count(distinct trck_user_id) as visitor_count
  from events_log
  where (date_from is null or created_at >= date_from)
    and (date_to is null or created_at <= date_to)
  union all
  select 'iniciou_quiz'::text, count(distinct trck_user_id)
  from events_log
  where event_name = 'IniciouQuiz'
    and (date_from is null or created_at >= date_from)
    and (date_to is null or created_at <= date_to)
  union all
  select 'cadastro'::text, count(distinct trck_user_id)
  from events_log
  where event_name = 'ViewContent'
    and (date_from is null or created_at >= date_from)
    and (date_to is null or created_at <= date_to)
  union all
  select 'lead'::text, count(distinct trck_user_id)
  from events_log
  where event_name = 'Lead'
    and (date_from is null or created_at >= date_from)
    and (date_to is null or created_at <= date_to)
  union all
  select 'lead_qualificado'::text, count(distinct coalesce(trck_user_id, id::text))
  from events_log
  where event_name = 'LeadQualificado'
    and (date_from is null or created_at >= date_from)
    and (date_to is null or created_at <= date_to)
  union all
  select 'contrato_assinado'::text, count(distinct coalesce(trck_user_id, id::text))
  from events_log
  where event_name = 'ContratoAssinado'
    and (date_from is null or created_at >= date_from)
    and (date_to is null or created_at <= date_to);
$$;
