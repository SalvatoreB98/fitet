-- ============================================================
--  Match Videos - Sincronizzazione YouTube e Campionati FITeT
--  Esegui questo script nell'SQL Editor di Supabase.
-- ============================================================

-- 1) Tabella partite di campionato (se referenziata come foreign key)
create table if not exists public.championship_matches (
  id bigint generated always as identity primary key,
  cam_id int,
  giornata int,
  squadra_casa text,
  squadra_ospite text,
  data text,
  risultato text,
  referto_url text,
  youtube_video_id text,
  created_at timestamptz default now()
);

-- 2) Tabella match_videos
create table if not exists public.match_videos (
  id uuid default gen_random_uuid() primary key,
  video_id text unique not null,
  channel_name text not null,
  channel_id text,
  channel_url text,
  title text not null,
  published_at timestamptz not null,
  league text,
  match_day int,
  match_id bigint references public.championship_matches(id) on delete set null,
  team_home text,
  team_away text,
  cam_id int,
  video_url text,
  created_at timestamptz default now()
);

-- 3) Indici per performance e lookup immediato
create index if not exists idx_match_videos_match_id on public.match_videos(match_id);
create index if not exists idx_match_videos_video_id on public.match_videos(video_id);
create index if not exists idx_match_videos_cam_day on public.match_videos(cam_id, match_day);
create index if not exists idx_match_videos_league_day on public.match_videos(league, match_day);
create index if not exists idx_match_videos_published_at on public.match_videos(published_at desc);

-- 4) Row Level Security (RLS)
alter table public.match_videos enable row level security;
alter table public.championship_matches enable row level security;

-- Policy di lettura pubblica per i video (necessaria per il frontend)
drop policy if exists "Public read match_videos" on public.match_videos;
create policy "Public read match_videos"
  on public.match_videos
  for select
  using (true);

drop policy if exists "Public read championship_matches" on public.championship_matches;
create policy "Public read championship_matches"
  on public.championship_matches
  for select
  using (true);

-- Scrittura riservata al backend (Service Role bypassa RLS automaticamente)

-- 5) Schedulazione automatica con pg_cron (Supabase Database Extension)
-- NOTA: Richiede di abilitare le estensioni "pg_cron" e "pg_net" nella Dashboard di Supabase:
-- Database -> Extensions -> cerca pg_cron e pg_net -> Abilita.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Esempio di schedulazione cron: ogni 6 ore (ore 00:00, 06:00, 12:00, 18:00 UTC)
-- Sostituisci <PROJECT_REF> con l'ID del tuo progetto Supabase e <SERVICE_ROLE_KEY> con la chiave segreta
/*
select cron.schedule(
  'sync-youtube-videos-job',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-youtube-videos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
*/

