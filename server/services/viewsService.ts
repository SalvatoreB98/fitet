import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Carica variabili d'ambiente in locale da .env
dotenv.config();

/**
 * ViewsService - Supabase Persistent View Tracking
 * 
 * Si collega alla tabella "views" di Supabase (PostgreSQL) per tracciare
 * e incrementare atomicamente le visualizzazioni degli atleti, persistendo
 * i dati su database cloud in modo affidabile tra i deploy di Vercel.
 */
class ViewsService {
  private supabase: SupabaseClient | null = null;
  private memoryCache: Map<string, number> = new Map();

  constructor() {
    this.initClient();
  }

  private initClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (url && key) {
      try {
        this.supabase = createClient(url, key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        });
        console.log('✅ [ViewsService] Supabase connesso con successo.');
      } catch (err) {
        console.error('❌ [ViewsService] Errore inizializzazione client Supabase:', err);
        this.supabase = null;
      }
    } else {
      console.warn('⚠️ [ViewsService] Credenziali SUPABASE_URL / KEY non trovate: fallback in memoria locale.');
    }
  }

  /**
   * Converte l'id atleta in numero valido (es. "593082" -> 593082)
   */
  private parsePlayerId(id: string): number | null {
    if (!id) return null;
    const clean = id.replace(/\D/g, '');
    if (!clean) return null;
    const parsed = parseInt(clean, 10);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Incrementa atomicamente il contatore delle visualizzazioni per un determinato atleta.
   */
  async incrementViews(id: string): Promise<number> {
    if (!id) return 0;
    const playerId = this.parsePlayerId(id);
    const cacheKey = String(playerId ?? id);

    // 1. Incremento su Supabase
    if (this.supabase && playerId !== null) {
      try {
        // Tentativo 1: Chiamata a funzione RPC atomica ad alta concorrenza
        const { data: rpcCount, error: rpcError } = await this.supabase.rpc('increment_athlete_views', {
          player_id: playerId,
        });

        if (!rpcError && typeof rpcCount === 'number') {
          this.memoryCache.set(cacheKey, rpcCount);
          return rpcCount;
        }

        // Tentativo 2 (fallback): Upsert diretto con onConflict
        const { data: existing } = await this.supabase
          .from('views')
          .select('count')
          .eq('playerId', playerId)
          .maybeSingle();

        const nextCount = ((existing?.count as number) || 0) + 1;

        const { error: upsertErr } = await this.supabase
          .from('views')
          .upsert(
            { playerId, count: nextCount },
            { onConflict: 'playerId' }
          );

        if (!upsertErr) {
          this.memoryCache.set(cacheKey, nextCount);
          return nextCount;
        } else {
          console.error(`[ViewsService] Errore upsert views per atleta ${playerId}:`, upsertErr);
        }
      } catch (err) {
        console.error(`[ViewsService] Errore imprevisto Supabase incrementViews per ${playerId}:`, err);
      }
    }

    // 2. Fallback memory-safe
    const current = this.memoryCache.get(cacheKey) || 0;
    const next = current + 1;
    this.memoryCache.set(cacheKey, next);
    return next;
  }

  /**
   * Recupera il contatore delle visualizzazioni per un determinato atleta.
   */
  async getViews(id: string): Promise<number> {
    if (!id) return 0;
    const playerId = this.parsePlayerId(id);
    const cacheKey = String(playerId ?? id);

    // 1. Lettura da Supabase
    if (this.supabase && playerId !== null) {
      try {
        const { data, error } = await this.supabase
          .from('views')
          .select('count')
          .eq('playerId', playerId)
          .maybeSingle();

        if (!error && data && typeof data.count === 'number') {
          this.memoryCache.set(cacheKey, data.count);
          return data.count;
        }
      } catch (err) {
        console.error(`[ViewsService] Errore lettura Supabase getViews per ${playerId}:`, err);
      }
    }

    // 2. Fallback memory-safe
    return this.memoryCache.get(cacheKey) || 0;
  }
}

export const viewsService = new ViewsService();
