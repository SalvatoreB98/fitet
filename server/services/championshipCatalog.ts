import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { cacheService } from './cacheService';
import { FitetClient } from './fitetClient';
import { parseStatisticheAtleti } from '../parsers/statisticheParser';
import { athleteResolver } from './athleteResolver';
import { getRuntimeCacheDir } from './runtimeCacheDir';
import { StatisticaAtleta } from '../../src/types/fitet';

export interface ChampionshipItem {
  id: number;
  nome: string;
  categoria: string;
  regione: string;
  regioneId?: number;
  anno?: number;
  formula?: number;
  sesso?: 'M' | 'F';
}

/**
 * Normalizza il sesso proveniente da fonti eterogenee (ranking FITeT, catalogo
 * campionati, testo libero) in 'M' | 'F'. Restituisce undefined se non è
 * possibile determinarlo con certezza.
 */
export function normalizeChampionshipGender(value?: string | null): 'M' | 'F' | undefined {
  if (!value) return undefined;
  const v = String(value).trim().toUpperCase();
  if (!v) return undefined;
  if (v === 'F' || v.startsWith('FEMM') || v === 'DONNE' || v === 'W') return 'F';
  if (v === 'M' || v.startsWith('MASCH') || v === 'UOMINI') return 'M';
  return undefined;
}

const REGIONI = [
  { id: 19, nome: 'Calabria' },
  { id: 14, nome: 'Abruzzo' },
  { id: 7, nome: 'Alto Adige' },
  { id: 17, nome: 'Basilicata' },
  { id: 16, nome: 'Campania' },
  { id: 9, nome: 'Emilia Romagna' },
  { id: 8, nome: 'Friuli Venezia Giulia' },
  { id: 13, nome: 'Lazio' },
  { id: 3, nome: 'Liguria' },
  { id: 4, nome: 'Lombardia' },
  { id: 11, nome: 'Marche' },
  { id: 15, nome: 'Molise' },
  { id: 2, nome: 'Piemonte' },
  { id: 18, nome: 'Puglia' },
  { id: 21, nome: 'Sardegna' },
  { id: 20, nome: 'Sicilia' },
  { id: 10, nome: 'Toscana' },
  { id: 6, nome: 'Trentino' },
  { id: 12, nome: 'Umbria' },
  { id: 1, nome: "Valle d'Aosta" },
  { id: 5, nome: 'Veneto' },
];

const NAZIONALI = [
  { cid: 2, nome: 'Serie A' },
  { cid: 3, nome: 'Serie B' },
  { cid: 4, nome: 'Serie C1' },
  { cid: 6, nome: 'Master Naz.' },
  { cid: 7, nome: 'Paralimpici Naz.' },
];

class ChampionshipCatalog {
  private staticCacheFilePath = path.resolve(process.cwd(), 'server', 'data', 'campionati.json');
  private runtimeCacheFilePath = path.join(getRuntimeCacheDir(), 'campionati.json');
  private memoryCache: ChampionshipItem[] | null = null;
  private lastFetched = 0;
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      const targetPath = fs.existsSync(this.runtimeCacheFilePath)
        ? this.runtimeCacheFilePath
        : this.staticCacheFilePath;

      if (fs.existsSync(targetPath)) {
        const raw = fs.readFileSync(targetPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.memoryCache = parsed;
          const stat = fs.statSync(targetPath);
          this.lastFetched = stat.mtimeMs;
        }
      }
    } catch (e) {
      console.error('Error loading campionati.json from disk:', e);
    }
  }

  private saveToDisk(data: ChampionshipItem[]): void {
    try {
      const dir = path.dirname(this.runtimeCacheFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.runtimeCacheFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error saving campionati.json to disk:', e);
    }
  }

  public async getAllCampionati(forceRefresh = false): Promise<ChampionshipItem[]> {
    if (!forceRefresh && this.memoryCache && (Date.now() - this.lastFetched < this.TTL)) {
      return this.memoryCache;
    }

    try {
      const items = await this.scrapeFromFitet();
      if (items.length > 0) {
        this.memoryCache = items;
        this.lastFetched = Date.now();
        this.saveToDisk(items);
        return items;
      }
    } catch (e) {
      console.error('Failed to scrape championships from FITeT:', e);
    }

    return this.memoryCache || [];
  }

  public async getChampionship(id: number): Promise<ChampionshipItem | undefined> {
    const list = await this.getAllCampionati();
    return list.find(c => c.id === id);
  }

  /**
   * Risolve istantaneamente in memoria (0ms) l'ID numerico del campionato
   * a partire dalla stringa testuale estratta dalla scheda ranking dell'atleta e dalla regione.
   *
   * Il nome del campionato può essere identico tra la variante maschile e quella
   * femminile (es. "A/1 Gir.U"): in quel caso il parametro `sesso` è indispensabile
   * per non assegnare all'atleta il campionato sbagliato.
   */
  public resolveChampionship(
    campName?: string,
    regione?: string,
    sesso?: 'M' | 'F' | string | null
  ): ChampionshipItem | undefined {
    if (!campName) return undefined;
    if (!this.memoryCache || this.memoryCache.length === 0) {
      this.loadFromDisk();
    }
    const items = this.memoryCache || [];
    if (items.length === 0) return undefined;

    const clean = (s: string) =>
      (s || '')
        .toLowerCase()
        .replace(/girone/g, 'gir')
        .replace(/serie/g, '')
        .replace(/maschile/g, '')
        .replace(/femminile/g, '')
        .replace(/[^a-z0-9]/g, '');

    const normReg = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const cClean = clean(campName);
    if (!cClean) return undefined;
    const targetRegNorm = normReg(regione);
    const targetSesso = normalizeChampionshipGender(sesso);

    const findBest = (enforceGender: boolean): { item?: ChampionshipItem; score: number } => {
      let bestItem: ChampionshipItem | undefined;
      let highestScore = -1;

      for (const item of items) {
        const itemClean = clean(item.nome);
        if (!itemClean) continue;

        const itemSesso = normalizeChampionshipGender(item.sesso);
        if (enforceGender && targetSesso && itemSesso && itemSesso !== targetSesso) {
          continue;
        }

        const itemRegNorm = normReg(item.regione);
        const isSameReg = Boolean(targetRegNorm && itemRegNorm === targetRegNorm);
        const isNazionale = itemRegNorm === 'nazionale';

        let score = 0;

        if (itemClean === cClean) {
          score = isSameReg ? 100 : (isNazionale ? 90 : 60);
        } else if (itemClean.includes(cClean) || cClean.includes(itemClean)) {
          score = isSameReg ? 80 : (isNazionale ? 70 : 50);
        }

        // A parità di nome preferisci sempre la variante dello stesso sesso.
        if (score > 0 && targetSesso && itemSesso === targetSesso) {
          score += 2;
        }

        if (score > highestScore) {
          highestScore = score;
          bestItem = item;
        }
      }

      return { item: bestItem, score: highestScore };
    };

    const genderAware = findBest(true);
    if (genderAware.item && genderAware.score >= 50) return genderAware.item;

    // Fallback: nessun candidato del sesso richiesto, usa la ricerca storica.
    const fallback = findBest(false);
    return fallback.item && fallback.score >= 50 ? fallback.item : undefined;
  }

  /**
   * Cerca attivamente il campionato attuale della stagione corrente per un atleta
   * controllando le statistiche dei campionati regionali (e se necessario nazionali).
   * Risultato memorizzato in cache per risposta istantanea.
   */
  public async findAthleteChampionship(
    atletaId: string,
    atletaNome?: string,
    regione?: string,
    sesso?: 'M' | 'F' | string | null
  ): Promise<(ChampionshipItem & { squadra?: string }) | undefined> {
    if (!atletaId && !atletaNome) return undefined;

    const targetSesso = normalizeChampionshipGender(sesso);
    const cacheKey = `athlete_champ_${atletaId || atletaNome}_${targetSesso || 'any'}`;
    const cached = cacheService.get<ChampionshipItem & { squadra?: string }>(cacheKey);
    if (cached) return cached;

    const allCamps = await this.getAllCampionati();
    if (!allCamps || allCamps.length === 0) return undefined;

    const cleanNorm = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetRegNorm = cleanNorm(regione);
    const targetNomeNorm = cleanNorm(atletaNome);
    const targetIdStr = String(atletaId || '').trim();

    // 1. Prioritizza campionati della regione dell'atleta, poi campionati nazionali.
    // Quando il sesso è noto, i campionati del sesso opposto vengono esclusi: molti
    // campionati maschili e femminili condividono lo stesso nome (es. "A/1 Gir.U").
    const regionalCamps = targetRegNorm 
      ? allCamps.filter(c => cleanNorm(c.regione) === targetRegNorm)
      : [];
    const nationalCamps = allCamps.filter(c => cleanNorm(c.regione) === 'nazionale');

    const matchesGender = (camp: ChampionshipItem): boolean => {
      if (!targetSesso) return true;
      const campSesso = normalizeChampionshipGender(camp.sesso);
      return !campSesso || campSesso === targetSesso;
    };

    const allRegionalAndNational = [...regionalCamps, ...nationalCamps];
    const genderMatches = allRegionalAndNational.filter(matchesGender);
    const otherGender = allRegionalAndNational.filter(c => !matchesGender(c));

    // I campionati compatibili col sesso hanno priorità assoluta.
    const searchPool = [...genderMatches, ...otherGender];

    // 2. Controllo istantaneo (0ms): verifichiamo prima se qualche campionato ha già le statistiche in cache
    for (const camp of searchPool) {
      const statsCached = cacheService.get<StatisticaAtleta[]>(`statistiche_${camp.id}`);
      if (statsCached && Array.isArray(statsCached)) {
        const found = statsCached.find(s => 
          (targetIdStr && String(s.atletaId || '').trim() === targetIdStr) ||
          (targetNomeNorm && cleanNorm(s.atleta) === targetNomeNorm)
        );
        if (found) {
          const res = { ...camp, squadra: found.squadra };
          cacheService.set(cacheKey, res, 24 * 60 * 60 * 1000); // 24h
          return res;
        }
      }
    }

    // 3. Se non ancora in cache, facciamo il fetch delle statistiche dei campionati regionali a piccoli batch.
    // Con sesso noto evitiamo di interrogare i campionati del sesso opposto (fetch inutili e rischio di match errato).
    const fetchPool = targetSesso ? genderMatches : searchPool;
    const mapping = athleteResolver.getMapping();
    const batchSize = 2;
    for (let i = 0; i < fetchPool.length; i += batchSize) {
      if (i > 0) {
        await FitetClient.sleepWithJitter(1500, 3000);
      }
      const batch = fetchPool.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (camp) => {
          try {
            const statKey = `statistiche_${camp.id}`;
            let stats = cacheService.get<StatisticaAtleta[]>(statKey);
            if (!stats) {
              const html = await FitetClient.fetchStatisticheAtleti(String(camp.id));
              stats = parseStatisticheAtleti(html, mapping);
              if (stats && stats.length > 0) {
                cacheService.set(statKey, stats, 60 * 60 * 1000); // 1h
              }
            }
            if (stats && Array.isArray(stats)) {
              const found = stats.find(s => 
                (targetIdStr && String(s.atletaId || '').trim() === targetIdStr) ||
                (targetNomeNorm && cleanNorm(s.atleta) === targetNomeNorm)
              );
              if (found) {
                return { camp, squadra: found.squadra };
              }
            }
          } catch {
            // Ignora singoli errori di fetch
          }
          return null;
        })
      );

      const foundMatch = batchResults.find(Boolean);
      if (foundMatch) {
        const res = { ...foundMatch.camp, squadra: foundMatch.squadra };
        cacheService.set(cacheKey, res, 24 * 60 * 60 * 1000);
        return res;
      }
    }

    return undefined;
  }

  private async scrapeFromFitet(): Promise<ChampionshipItem[]> {
    const all: ChampionshipItem[] = [];

    // 1. Fetch National Championships sequentially with jitter
    for (let i = 0; i < NAZIONALI.length; i++) {
      const nat = NAZIONALI[i];
      if (i > 0) {
        await FitetClient.sleepWithJitter(1500, 3000);
      }
      try {
        const text = await FitetClient.fetchHtml(
          `https://portale.fitet.org/risultati/campionati/elenco_campionati.php?ID_CAMP=${nat.cid}`
        );
        const $ = cheerio.load(text);
        $('tr').each((_, tr) => {
          const rowText = $(tr).find('td').first().text().trim().toLowerCase();
          const isFem = rowText.includes('femminil');
          $(tr).find('a[href*="CAM="]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const m = href.match(/CAM=(\d+)/i);
            if (m) {
              const id = parseInt(m[1], 10);
              const name = $(el).text().replace(/\s+/g, ' ').trim();
              if (id && name) {
                all.push({
                  id,
                  nome: `${nat.nome}${isFem ? ' Femminile' : ''} - ${name}`,
                  categoria: nat.nome,
                  regione: 'Nazionale',
                  anno: 41,
                  formula: 19,
                  sesso: isFem ? 'F' : 'M',
                });
              }
            }
          });
        });
      } catch (e) {
        console.error(`Error scraping national ${nat.nome}:`, e);
      }
    }

    // 2. Fetch Regional Championships sequentially with jitter
    for (let i = 0; i < REGIONI.length; i++) {
      const reg = REGIONI[i];
      await FitetClient.sleepWithJitter(1500, 3000);
      try {
        const text = await FitetClient.fetchHtml(
          `https://portale.fitet.org/risultati/regioni/menu_reg.php?REG=${reg.id}`
        );
        const $ = cheerio.load(text);
          $('a[href*="CAM="]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const m = href.match(/CAM=(\d+)/i);
            if (m) {
              const id = parseInt(m[1], 10);
              const name = $(el).text().replace(/\s+/g, ' ').trim();
              if (id && name) {
                let cat = 'Regionale';
                const firstPart = name.split(' ')[0];
                if (firstPart.includes('/') || firstPart.length <= 4) {
                  cat = firstPart;
                }
                const isFem = /femm|femminil/i.test(name) || /femm|femminil/i.test(cat);
                all.push({
                  id,
                  nome: name,
                  categoria: cat,
                  regione: reg.nome,
                  regioneId: reg.id,
                  anno: 41,
                  formula: 19,
                  sesso: isFem ? 'F' : 'M',
                });
              }
            }
          });
        } catch (e) {
          console.error(`Error scraping region ${reg.nome}:`, e);
        }
    }

    return all;
  }
}

export const championshipCatalog = new ChampionshipCatalog();
