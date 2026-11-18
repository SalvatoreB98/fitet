-- ============================================================
--  Analytics – Dimensioni visitatori (paese, dispositivo, OS, browser, PWA)
--  Migrazione incrementale: eseguire UNA VOLTA nell'SQL Editor di Supabase
--  dopo aver già applicato supabase/daily_analytics.sql.
--
--  Nessun dato personale: il visitatore è identificato solo dall'hash HMAC
--  giornaliero già usato per i visitatori unici, che ruota ogni giorno UTC.
-- ============================================================

-- 1) Tabella effimera per deduplicare le dimensioni per visitatore/giorno
--    (separata da daily_visitor_hashes per non alterare il conteggio dei visitatori)
create table if not exists public.daily_dimension_hashes (
  date date not null default current_date,
  visitor_hash text not null,
  constraint daily_dimension_hashes_pkey primary key (date, visitor_hash)
);

comment on table public.daily_dimension_hashes is 'Hash giornalieri anonimi usati per contare una sola volta al giorno paese, dispositivo, OS, browser e modalità (PWA/browser) per visitatore';

-- 2) Funzione RPC atomica track_visitor_dimensions(...)
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

  -- Mantieni solo la giornata corrente
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

-- 3) RLS: la tabella resta accessibile solo al backend (service role / SECURITY DEFINER)
alter table public.daily_dimension_hashes enable row level security;

grant execute on function public.track_visitor_dimensions(text, text, text, text, text, text)
  to anon, authenticated, service_role;
