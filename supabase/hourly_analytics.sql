-- ============================================================
--  Analytics orarie GDPR-Compliant - Supabase (PostgreSQL)
--  Schema giorno/ora per capire quando gli utenti visitano
--  e quando aprono più pagine. Nessun dato personale salvato.
--
--  Esegui questo script DOPO supabase/daily_analytics.sql.
--  È idempotente: può essere rieseguito senza perdere dati.
-- ============================================================

-- 1) Tabella oraria aggregata (fuso Europe/Rome)
create table if not exists public.hourly_analytics (
  date date not null,
  hour smallint not null,
  pages int not null default 0,
  visitors int not null default 0,
  clicks int not null default 0,
  constraint hourly_analytics_pkey primary key (date, hour),
  constraint hourly_analytics_hour_check check (hour >= 0 and hour <= 23)
);

comment on table public.hourly_analytics is 'Metriche orarie anonime GDPR-compliant (pagine viste, visitatori unici, click) aggregate per giorno e ora locali Europe/Rome';
comment on column public.hourly_analytics.date is 'Data locale Europe/Rome della metrica';
comment on column public.hourly_analytics.hour is 'Ora locale Europe/Rome (0-23)';
comment on column public.hourly_analytics.pages is 'Pagine viste in questa ora';
comment on column public.hourly_analytics.visitors is 'Visitatori unici giornalieri il cui primo accesso è avvenuto in questa ora';
comment on column public.hourly_analytics.clicks is 'Click/azioni utente in questa ora';

create index if not exists idx_hourly_analytics_date
  on public.hourly_analytics (date desc);

alter table public.hourly_analytics enable row level security;

-- 2) Funzione RPC atomica di incremento orario.
--    Interna (SECURITY DEFINER): viene richiamata dalle altre RPC,
--    non è esposta direttamente al client.
create or replace function public.track_hourly_metric(p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local timestamp := timezone('Europe/Rome', now());
  v_date date := v_local::date;
  v_hour smallint := extract(hour from v_local)::smallint;
  v_pages int := case when p_kind = 'page' then 1 else 0 end;
  v_visitors int := case when p_kind = 'visitor' then 1 else 0 end;
  v_clicks int := case when p_kind = 'click' then 1 else 0 end;
begin
  if p_kind not in ('page', 'visitor', 'click') then
    return;
  end if;

  insert into public.hourly_analytics as h (date, hour, pages, visitors, clicks)
  values (v_date, v_hour, v_pages, v_visitors, v_clicks)
  on conflict (date, hour)
  do update set
    pages = h.pages + excluded.pages,
    visitors = h.visitors + excluded.visitors,
    clicks = h.clicks + excluded.clicks;
end;
$$;

-- 3) increment_metric: oltre al contatore giornaliero aggiorna la fascia oraria
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

  if v_type in ('page', 'click') then
    perform public.track_hourly_metric(v_type);
  end if;
end;
$$;

-- 4) track_daily_visitor: il visitatore unico viene conteggiato anche nell'ora
--    del primo accesso della giornata
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

    perform public.track_hourly_metric('visitor');
  end if;
end;
$$;

grant execute on function public.increment_metric(text, text) to anon, authenticated, service_role;
grant execute on function public.track_daily_visitor(text) to anon, authenticated, service_role;
