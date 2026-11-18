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

comment on table public.daily_analytics is 'Metriche giornaliere anonime GDPR-compliant (pagine viste, visitatori unici, click e transizioni di flusso)';
comment on column public.daily_analytics.date is 'Data della metrica (UTC / CURRENT_DATE Postgres)';
comment on column public.daily_analytics.type is 'Tipo evento: page, visitor, click o flow';
comment on column public.daily_analytics.target is 'Path pagina, nome pulsante/azione, transizione (es. Home -> Tornei) o unique per visitatori';
comment on column public.daily_analytics.count is 'Conteggio giornaliero aggregato';

-- Indice per interrogazioni veloci su intervalli 7/30 giorni e filtro per tipo
create index if not exists idx_daily_analytics_date_type
  on public.daily_analytics (date desc, type);

-- 2) Tabella effimera per deduplicazione visitatori unici giornalieri (solo hash HMAC ruotato ogni giorno)
create table if not exists public.daily_visitor_hashes (
  date date not null default current_date,
  visitor_hash text not null,
  constraint daily_visitor_hashes_pkey primary key (date, visitor_hash)
);

comment on table public.daily_visitor_hashes is 'Hash giornalieri anonimi (HMAC con salt ruotato per data UTC) per contare i visitatori unici senza salvare IP né cookie';

-- 3) Funzione RPC atomica increment_metric(p_type, p_target)
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

-- 4) Funzione RPC atomica track_daily_visitor(p_visitor_hash)
create or replace function public.track_daily_visitor(p_visitor_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := left(btrim(coalesce(p_visitor_hash, '')), 64);
begin
  if v_hash = '' then
    return;
  end if;

  -- Elimina gli hash dei giorni precedenti per mantenere solo i dati della giornata corrente
  delete from public.daily_visitor_hashes where date < current_date;

  insert into public.daily_visitor_hashes (date, visitor_hash)
  values (current_date, v_hash)
  on conflict (date, visitor_hash) do nothing;

  if found then
    insert into public.daily_analytics (date, type, target, count)
    values (current_date, 'visitor', 'unique', 1)
    on conflict (date, type, target)
    do update set count = daily_analytics.count + 1;
  end if;
end;
$$;

-- 5) Row Level Security (RLS): accesso tabelle riservato al backend
alter table public.daily_analytics enable row level security;
alter table public.daily_visitor_hashes enable row level security;

-- Nessuna policy pubblica in lettura/scrittura diretta sulle tabelle:
-- il backend usa SUPABASE_SERVICE_ROLE_KEY (che bypassa RLS),
-- mentre le RPC sono SECURITY DEFINER per consentire gli incrementi atomici.
grant execute on function public.increment_metric(text, text) to anon, authenticated, service_role;
grant execute on function public.track_daily_visitor(text) to anon, authenticated, service_role;

-- 6) Tabella effimera per deduplicare le dimensioni (paese, dispositivo, OS, browser, modalità)
create table if not exists public.daily_dimension_hashes (
  date date not null default current_date,
  visitor_hash text not null,
  constraint daily_dimension_hashes_pkey primary key (date, visitor_hash)
);

comment on table public.daily_dimension_hashes is 'Hash giornalieri anonimi usati per contare una sola volta al giorno paese, dispositivo, OS, browser e modalità (PWA/browser) per visitatore';

-- 7) Funzione RPC atomica track_visitor_dimensions(p_visitor_hash, ...)
--    Conta le dimensioni solo la prima volta che un visitatore le invia nella giornata.
create or replace function public.track_visitor_dimensions(
  p_visitor_hash text,
  p_country text default null,
  p_device text default null,
  p_os text default null,
  p_browser text default null,
  p_mode text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := left(btrim(coalesce(p_visitor_hash, '')), 64);
  v_country text := left(btrim(coalesce(p_country, '')), 32);
  v_device text := left(btrim(coalesce(p_device, '')), 32);
  v_os text := left(btrim(coalesce(p_os, '')), 32);
  v_browser text := left(btrim(coalesce(p_browser, '')), 32);
  v_mode text := left(btrim(coalesce(p_mode, '')), 32);
  v_is_new boolean;
begin
  if v_hash = '' then
    return;
  end if;

  if v_country = '' and v_device = '' and v_os = '' and v_browser = '' and v_mode = '' then
    return;
  end if;

  delete from public.daily_dimension_hashes where date < current_date;

  insert into public.daily_dimension_hashes (date, visitor_hash)
  values (current_date, v_hash)
  on conflict (date, visitor_hash) do nothing;

  v_is_new := found;
  if not v_is_new then
    return;
  end if;

  if v_country <> '' then
    insert into public.daily_analytics (date, type, target, count)
    values (current_date, 'country', v_country, 1)
    on conflict (date, type, target)
    do update set count = daily_analytics.count + 1;
  end if;

  if v_device <> '' then
    insert into public.daily_analytics (date, type, target, count)
    values (current_date, 'device', v_device, 1)
    on conflict (date, type, target)
    do update set count = daily_analytics.count + 1;
  end if;

  if v_os <> '' then
    insert into public.daily_analytics (date, type, target, count)
    values (current_date, 'os', v_os, 1)
    on conflict (date, type, target)
    do update set count = daily_analytics.count + 1;
  end if;

  if v_browser <> '' then
    insert into public.daily_analytics (date, type, target, count)
    values (current_date, 'browser', v_browser, 1)
    on conflict (date, type, target)
    do update set count = daily_analytics.count + 1;
  end if;

  if v_mode <> '' then
    insert into public.daily_analytics (date, type, target, count)
    values (current_date, 'mode', v_mode, 1)
    on conflict (date, type, target)
    do update set count = daily_analytics.count + 1;
  end if;
end;
$$;

alter table public.daily_dimension_hashes enable row level security;

grant execute on function public.track_visitor_dimensions(text, text, text, text, text, text)
  to anon, authenticated, service_role;
