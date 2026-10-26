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
  async incrementViews(id: string | number, ip: string | null = null) {
    if (!id) return 0;
    const playerId = this.parsePlayerId(String(id));
    const cacheKey = String(playerId ?? id);

    if (this.supabase && playerId !== null) {
      try {
        const { data: rpcCount, error: rpcError } = await this.supabase.rpc("increment_athlete_views", {
          p_player_id: Number(playerId),
          p_client_ip: ip,
          p_cooldown_minutes: 60,
        });

        console.log(`[ViewsService] RPC result:`, { rpcCount, rpcError });

        // Non usare `typeof rpcCount === "number"` perché i BIGINT possono arrivare come stringhe
        if (!rpcError && rpcCount !== null && rpcCount !== undefined) {
          const count = Number(rpcCount);
          this.memoryCache.set(cacheKey, count);
          return count;
        }

        if (rpcError) {
          console.error(`[ViewsService] Errore RPC increment_athlete_views:`, rpcError);
        }

        // Se la RPC fallisce, restituisci solo il valore attuale senza incrementare
        const { data: existing } = await this.supabase
          .from("views")
          .select("count")
          .eq("playerId", playerId)
          .maybeSingle();

        const currentFromDb = Number(existing?.count || 0);
        this.memoryCache.set(cacheKey, currentFromDb);
        return currentFromDb;

      } catch (err) {
        console.error(`[ViewsService] Eccezione Supabase:`, err);
      }
    }

    return this.memoryCache.get(cacheKey) || 0;
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
