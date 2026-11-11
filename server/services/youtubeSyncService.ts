import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { cacheService } from './cacheService';

dotenv.config();

export interface YouTubeChannelConfig {
  name: string;
  handle: string;
  channelId: string;
  channelUrl: string;
}

export const YOUTUBE_CHANNELS: YouTubeChannelConfig[] = [
  {
    name: 'Giacomo Cerea',
    handle: '@GiacomoCerea',
    channelId: 'UCcA-SldiAGIwc2ymdU0XZ0A',
    channelUrl: 'https://www.youtube.com/@GiacomoCerea',
  },
  {
    name: 'FITeT Official',
    handle: '@Fitetofficial',
    channelId: 'UCEMruyCuhXSrAqkA-LkLUSg',
    channelUrl: 'https://www.youtube.com/@Fitetofficial',
  },
  {
    name: 'Filippo Cantella TT',
    handle: '@FilippoCantellaTT',
    channelId: 'UC1rRzhu89B1x25cgAWdLOxw',
    channelUrl: 'https://www.youtube.com/@FilippoCantellaTT',
  },
];

export interface YouTubeMatchVideo {
  id?: string;
  video_id: string;
  channel_name: string;
  channel_id: string;
  channel_url: string;
  title: string;
  published_at: string;
  league: string | null;
  match_day: number | null;
  match_id?: number | string | null;
  team_home: string | null;
  team_away: string | null;
  cam_id?: number | null;
  video_url: string;
}

export interface ParsedTitleResult {
  league: string | null;
  matchDay: number | null;
  teamHome: string | null;
  teamAway: string | null;
}

/**
 * Normalizza il nome di una squadra per agevolare il matching fuzzy/substring
 */
export function normalizeTeamName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // rimuove accenti
    .replace(/\b(a\.?s\.?d\.?|asd|t\.?t\.?|tt|tennistavolo|polisportiva|pol\.?|u\.?s\.?|us|dilettantistica|1999)\b/gi, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Esegue il parsing euristico di titolo video per estrarre:
 * - Serie (A1, A2, B1, B2, C1, C2, D1, D2, con eventuale M/F)
 * - Giornata (es. "recupero 1ª giornata", "3ª giornata", "4 giornata")
 * - Squadre coinvolte ("Squadra Casa" vs "Squadra Ospite")
 */
export function parseMatchTitle(title: string): ParsedTitleResult {
  const clean = title.replace(/\s+/g, ' ').trim();

  // 1. Serie / Categoria
  let league: string | null = null;
  const leagueMatch = clean.match(/\b(?:Serie\s+)?([ABCD][1-2])(?:\s*([FM]|Femminile|Maschile))?\b/i);
  if (leagueMatch) {
    league = leagueMatch[1].toUpperCase();
    if (leagueMatch[2]) {
      const g = leagueMatch[2].toUpperCase().startsWith('F') ? 'F' : 'M';
      league += ` ${g}`;
    }
  }

  // 2. Giornata di campionato
  let matchDay: number | null = null;
  const dayMatch = clean.match(/(?:recupero\s+)?(\d+)\s*[ªa°\^e]?\s*giornata/i) || clean.match(/giornata\s*(\d+)/i);
  if (dayMatch) {
    matchDay = parseInt(dayMatch[1], 10);
  }

  // 3. Squadre (Home e Away)
  let teamHome: string | null = null;
  let teamAway: string | null = null;

  // Pattern a: Parentesi (es. FITeT: "Arlia-Istrate (Castel Goffredo-Muravera)")
  const parenMatch = clean.match(/\(([^()]+?)\s*(?:-|–|vs\.?)\s*([^()]+?)\)/i);
  if (parenMatch) {
    teamHome = parenMatch[1].trim();
    teamAway = parenMatch[2].trim();
  } else {
    // Pattern b: dopo virgola o pipe (es. "Serie B1 - 3ª Giornata | Villa Romanò - TT Vigevano 1999")
    const delimiterMatch = clean.match(/(?:[,|]\s*)([A-Za-z0-9À-ÿ\s.'’]+?)\s*(?:-|–|vs\.?)\s*([A-Za-z0-9À-ÿ\s.'’]+?)(?:\s+\d+\s*[-–:]\s*\d+.*)?$/i);
    if (delimiterMatch) {
      teamHome = delimiterMatch[1].trim();
      teamAway = delimiterMatch[2].trim().replace(/\s+\d+\s*[-–:]\s*\d+.*$/, '').trim();
    } else {
      // Pattern c: generale "Squadra 1 vs Squadra 2"
      const vsMatch = clean.match(/([A-Za-z0-9À-ÿ\s.'’]+?)\s+(?:vs\.?)\s+([A-Za-z0-9À-ÿ\s.'’]+?)(?:\s*[|,]|$)/i);
      if (vsMatch) {
        teamHome = vsMatch[1].trim();
        teamAway = vsMatch[2].trim();
      }
    }
  }

  return { league, matchDay, teamHome, teamAway };
}

class YouTubeSyncService {
  private supabase: SupabaseClient | null = null;
  private readonly CACHE_KEY = 'youtube_match_videos_all';
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 ora in cache RAM/disco

  constructor() {
    this.initSupabase();
  }

  private initSupabase() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      console.warn('⚠️ [YouTubeSyncService] Supabase URL o KEY non configurate: operatività solo in locale/cache.');
      return;
    }

    try {
      this.supabase = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      console.log('✅ [YouTubeSyncService] Supabase connesso.');
    } catch (err) {
      console.error('❌ [YouTubeSyncService] Errore inizializzazione Supabase:', err);
    }
  }

  /**
   * Effettua il fetch e parsing del feed RSS Atom di un canale YouTube
   */
  public async fetchChannelFeed(channel: YouTubeChannelConfig): Promise<YouTubeMatchVideo[]> {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channelId}`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PingPongPortal/1.0; +https://portale-risultati-tt.it)',
        },
      });

      if (!res.ok) {
        console.warn(`[YouTubeSyncService] Risposta HTTP ${res.status} per canale ${channel.name}`);
        return [];
      }

      const xml = await res.text();
      const entries: YouTubeMatchVideo[] = [];

      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let match;
      while ((match = entryRegex.exec(xml)) !== null) {
        const entryXml = match[1];
        const videoIdMatch = entryXml.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
        const titleMatch = entryXml.match(/<title>(.*?)<\/title>/);
        const publishedMatch = entryXml.match(/<published>(.*?)<\/published>/);

        if (videoIdMatch && titleMatch) {
          const rawTitle = titleMatch[1]
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');

          const parsed = parseMatchTitle(rawTitle);
          const videoId = videoIdMatch[1];

          entries.push({
            video_id: videoId,
            channel_name: channel.name,
            channel_id: channel.channelId,
            channel_url: channel.channelUrl,
            title: rawTitle,
            published_at: publishedMatch ? publishedMatch[1] : new Date().toISOString(),
            league: parsed.league,
            match_day: parsed.matchDay,
            team_home: parsed.teamHome,
            team_away: parsed.teamAway,
            video_url: `https://www.youtube.com/watch?v=${videoId}`,
          });
        }
      }

      return entries;
    } catch (err) {
      console.error(`[YouTubeSyncService] Errore durante il recupero del feed per ${channel.name}:`, err);
      return [];
    }
  }

  /**
   * Sincronizza tutti i canali configurati in parallelo e aggiorna Supabase
   */
  public async syncAllChannels(): Promise<{ total: number; upserted: number; videos: YouTubeMatchVideo[] }> {
    console.log('🔄 [YouTubeSyncService] Avvio sincronizzazione feed YouTube...');

    const fetchPromises = YOUTUBE_CHANNELS.map((ch) => this.fetchChannelFeed(ch));
    const channelResults = await Promise.all(fetchPromises);
    const allVideos = channelResults.flat();

    console.log(`📹 [YouTubeSyncService] Recuperati ${allVideos.length} video totali dai feed.`);

    // Salva in cache applicativa
    cacheService.set(this.CACHE_KEY, allVideos, this.CACHE_TTL_MS);

    let upsertedCount = 0;
    if (this.supabase && allVideos.length > 0) {
      try {
        const rows = allVideos.map((v) => ({
          video_id: v.video_id,
          channel_name: v.channel_name,
          channel_id: v.channel_id,
          channel_url: v.channel_url,
          title: v.title,
          published_at: v.published_at,
          league: v.league,
          match_day: v.match_day,
          team_home: v.team_home,
          team_away: v.team_away,
          video_url: v.video_url,
        }));

        const { data, error } = await this.supabase
          .from('match_videos')
          .upsert(rows, { onConflict: 'video_id' })
          .select();

        if (error) {
          console.error('❌ [YouTubeSyncService] Errore upsert su Supabase:', error);
        } else {
          upsertedCount = data ? data.length : rows.length;
          console.log(`✅ [YouTubeSyncService] Upsert completato su Supabase: ${upsertedCount} record aggiornati.`);
        }
      } catch (err) {
        console.error('❌ [YouTubeSyncService] Eccezione durante upsert Supabase:', err);
      }
    }

    return {
      total: allVideos.length,
      upserted: upsertedCount,
      videos: allVideos,
    };
  }

  /**
   * Restituisce tutti i video memorizzati (da Supabase con fallback su cache)
   */
  public async getAllVideos(forceRefresh = false): Promise<YouTubeMatchVideo[]> {
    if (!forceRefresh) {
      const cached = cacheService.get<YouTubeMatchVideo[]>(this.CACHE_KEY);
      if (cached && cached.length > 0) {
        return cached;
      }
    }

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('match_videos')
          .select('*')
          .order('published_at', { ascending: false });

        if (!error && data && data.length > 0) {
          cacheService.set(this.CACHE_KEY, data, this.CACHE_TTL_MS);
          return data;
        }
      } catch (err) {
        console.warn('[YouTubeSyncService] Lettura da Supabase non riuscita, eseguo fallback su sync diretta:', err);
      }
    }

    // Fallback: se Supabase è vuoto o non risponde, esegue un sync al volo
    const syncRes = await this.syncAllChannels();
    return syncRes.videos;
  }

  /**
   * Cerca e associa uno o più video a una partita di calendario
   */
  public matchVideosForMatch(
    videos: YouTubeMatchVideo[],
    params: {
      giornata: number;
      squadraCasa: string;
      squadraOspite: string;
      camId?: number;
      championshipName?: string;
    }
  ): YouTubeMatchVideo[] {
    const { giornata, squadraCasa, squadraOspite, championshipName } = params;

    const normCasa = normalizeTeamName(squadraCasa);
    const normOspite = normalizeTeamName(squadraOspite);

    // Estrai eventuale categoria da championshipName (es. "SERIE B1 MASCHILE" o "Serie B/1" -> "B1")
    let champLeague: string | null = null;
    if (championshipName) {
      const lm = championshipName.match(/\b([ABCD])\s*\/?\s*([1-3])\b/i);
      if (lm) champLeague = `${lm[1].toUpperCase()}${lm[2]}`;
    }

    return videos.filter((v) => {
      // 1. Se entrambi hanno la giornata, deve corrispondere
      if (v.match_day !== null && v.match_day !== undefined && v.match_day !== giornata) {
        return false;
      }

      // 2. Se entrambi hanno la serie (es. B1 vs B1), deve essere compatibile
      if (champLeague && v.league) {
        const vLeagueBase = v.league.split(' ')[0].toUpperCase();
        if (vLeagueBase !== champLeague) {
          return false;
        }
      }

      // 3. Verifica corrispondenza squadre
      if (v.team_home && v.team_away) {
        const vHome = normalizeTeamName(v.team_home);
        const vAway = normalizeTeamName(v.team_away);

        const directMatch =
          (normCasa.includes(vHome) || vHome.includes(normCasa) || (vHome.length >= 4 && normCasa.includes(vHome.slice(0, 5)))) &&
          (normOspite.includes(vAway) || vAway.includes(normOspite) || (vAway.length >= 4 && normOspite.includes(vAway.slice(0, 5))));

        const invertedMatch =
          (normCasa.includes(vAway) || vAway.includes(normCasa) || (vAway.length >= 4 && normCasa.includes(vAway.slice(0, 5)))) &&
          (normOspite.includes(vHome) || vHome.includes(normOspite) || (vHome.length >= 4 && normOspite.includes(vHome.slice(0, 5))));

        if (directMatch || invertedMatch) {
          return true;
        }
      }

      // 4. Fallback su titolo completo se contiene entrambe le squadre e la giornata coincide
      const normTitle = normalizeTeamName(v.title);
      const casaTokens = normCasa.split(' ').filter((t) => t.length >= 4);
      const ospiteTokens = normOspite.split(' ').filter((t) => t.length >= 4);

      const hasCasaToken = casaTokens.some((token) => normTitle.includes(token));
      const hasOspiteToken = ospiteTokens.some((token) => normTitle.includes(token));

      if (hasCasaToken && hasOspiteToken && v.match_day === giornata) {
        return true;
      }

      return false;
    });
  }
}

export const youtubeSyncService = new YouTubeSyncService();

