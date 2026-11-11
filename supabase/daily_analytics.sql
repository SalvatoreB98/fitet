-- ============================================================
--  Analytics GDPR-Compliant - Supabase (PostgreSQL)
--  Nessun cookie, nessun IP, nessun dato personale salvato.
--  Esegui questo script nell'SQL Editor di Supabase.
-- ============================================================

-- 1) Tabella giornaliera aggregata
create table if not exists public.daily_analytics (
  date date not null default current_date,
  type text not null,
  target text not null,
  count int not null default 1,
  constraint daily_analytics_pkey primary key (date, type, target)
);

comment on table public.daily_analytics is 'Metriche giornaliere anonime GDPR-compliant (pagine viste, click e transizioni di flusso)';
comment on column public.daily_analytics.date is 'Data della metrica (UTC / CURRENT_DATE Postgres)';
comment on column public.daily_analytics.type is 'Tipo evento: page, click o flow';
comment on column public.daily_analytics.target is 'Path pagina, nome pulsante/azione o transizione (es. Home -> Tornei)';
comment on column public.daily_analytics.count is 'Conteggio giornaliero aggregato';

-- Indice per interrogazioni veloci su intervalli 7/30 giorni e filtro per tipo
create index if not exists idx_daily_analytics_date_type
  on public.daily_analytics (date desc, type);

-- 2) Funzione RPC atomica increment_metric(p_type, p_target)
create or replace function public.increment_metric(p_type text, p_target text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := left(btrim(coalesce(p_type, '')), 32);
  v_target text := left(btrim(coalesce(p_target, '')), 200);
begin
  if v_type = '' or v_target = '' then
    return;
  end if;

  insert into public.daily_analytics (date, type, target, count)
  values (current_date, v_type, v_target, 1)
  on conflict (date, type, target)
  do update set count = daily_analytics.count + 1;
end;
$$;

-- 3) Row Level Security (RLS): accesso tabella riservato al backend
alter table public.daily_analytics enable row level security;

-- Nessuna policy pubblica in lettura/scrittura diretta sulla tabella:
-- il backend usa SUPABASE_SERVICE_ROLE_KEY (che bypassa RLS),
-- mentre increment_metric() è SECURITY DEFINER per consentire l'RPC atomica.
grant execute on function public.increment_metric(text, text) to anon, authenticated, service_role;
