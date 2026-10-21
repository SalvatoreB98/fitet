import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

export interface ChampionshipItem {
  id: number;
  nome: string;
  categoria: string;
  regione: string;
  regioneId?: number;
  anno?: number;
  formula?: number;
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
  private cacheFilePath = path.resolve(process.cwd(), 'server', 'data', 'campionati.json');
  private memoryCache: ChampionshipItem[] | null = null;
  private lastFetched = 0;
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const raw = fs.readFileSync(this.cacheFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.memoryCache = parsed;
          const stat = fs.statSync(this.cacheFilePath);
          this.lastFetched = stat.mtimeMs;
        }
      }
    } catch (e) {
      console.error('Error loading campionati.json from disk:', e);
    }
  }

  private saveToDisk(data: ChampionshipItem[]): void {
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(data, null, 2), 'utf-8');
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

  private async scrapeFromFitet(): Promise<ChampionshipItem[]> {
    const all: ChampionshipItem[] = [];

    // 1. Fetch National Championships
    for (const nat of NAZIONALI) {
      try {
        const res = await fetch(`https://portale.fitet.org/risultati/campionati/elenco_campionati.php?ID_CAMP=${nat.cid}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const text = new TextDecoder('iso-8859-1').decode(await res.arrayBuffer());
        const $ = cheerio.load(text);
        $('a[href*="CAM="]').each((_, el) => {
          const href = $(el).attr('href') || '';
          const m = href.match(/CAM=(\d+)/i);
          if (m) {
            const id = parseInt(m[1], 10);
            const name = $(el).text().replace(/\s+/g, ' ').trim();
            if (id && name) {
              all.push({
                id,
                nome: `${nat.nome} - ${name}`,
                categoria: nat.nome,
                regione: 'Nazionale',
                anno: 41,
                formula: 19,
              });
            }
          }
        });
      } catch (e) {
        console.error(`Error scraping national ${nat.nome}:`, e);
      }
    }

    // 2. Fetch Regional Championships in batches of 5
    for (let i = 0; i < REGIONI.length; i += 5) {
      const batch = REGIONI.slice(i, i + 5);
      await Promise.all(batch.map(async (reg) => {
        try {
          const res = await fetch(`https://portale.fitet.org/risultati/regioni/menu_reg.php?REG=${reg.id}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          const text = new TextDecoder('iso-8859-1').decode(await res.arrayBuffer());
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
                all.push({
                  id,
                  nome: name,
                  categoria: cat,
                  regione: reg.nome,
                  regioneId: reg.id,
                  anno: 41,
                  formula: 19,
                });
              }
            }
          });
        } catch (e) {
          console.error(`Error scraping region ${reg.nome}:`, e);
        }
      }));
    }

    return all;
  }
}

export const championshipCatalog = new ChampionshipCatalog();
