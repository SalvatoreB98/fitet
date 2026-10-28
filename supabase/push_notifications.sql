-- ============================================================
--  Web Push Notifications - Schema Supabase
--  Esegui questo script nell'SQL Editor di Supabase.
-- ============================================================

-- 1) Subscription dei dispositivi (una riga per endpoint push)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

comment on table public.push_subscriptions is 'Subscription Web Push dei dispositivi PWA';
comment on column public.push_subscriptions.endpoint is 'Endpoint univoco della subscription push';
comment on column public.push_subscriptions.p256dh is 'Chiave pubblica del client (base64url)';
comment on column public.push_subscriptions.auth is 'Auth secret del client (base64url)';

create index if not exists push_subscriptions_active_idx
  on public.push_subscriptions (is_active);

-- 2) Stato persistente del trigger (ultimo ID_CLASS notificato)
create table if not exists public.push_state (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

comment on table public.push_state is 'Stato persistente per i trigger push (es. ultimo ID_CLASS notificato)';

-- 3) Aggiornamento automatico di updated_at
create or replace function public.set_push_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_push_subscriptions_updated_at on public.push_subscriptions;
create trigger trg_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row
execute function public.set_push_subscriptions_updated_at();

-- 4) RLS: accesso consentito solo al backend con service role
alter table public.push_subscriptions enable row level security;
alter table public.push_state enable row level security;

-- Nessuna policy pubblica: SUPABASE_SERVICE_ROLE_KEY bypassa RLS.
-- Il frontend non deve mai leggere/scrivere direttamente queste tabelle.

-- 5) (Opzionale) Baseline manuale per evitare una notifica al primo deploy.
--    Il backend inizializza automaticamente il valore al primo controllo.
--    Decommenta e imposta l'ID_CLASS attuale se vuoi forzare il baseline.
--
-- insert into public.push_state (key, value)
-- values ('latest_ranking_id_class', '248')
-- on conflict (key) do update
--   set value = excluded.value,
--       updated_at = now();
