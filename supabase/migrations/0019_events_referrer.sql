-- Referrer por evento (não só do visitante): mesmo motivo das utms na
-- migration 0011/tracker.js pós-deploy — visitors.referrer só reflete a
-- primeira visita (identify() só sobrescreve quando vem um valor novo), então
-- cair pro referrer do visitante mostraria o referrer errado pra eventos de
-- visitas recorrentes sem referrer novo (ex: navegação interna, SPA). Cada
-- evento passa a guardar o referrer da PÁGINA que o disparou.
alter table events_log add column if not exists referrer text;
