import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

export class TeamResolver {
  private staticFilePath = path.resolve(process.cwd(), 'server', 'data', 'team_logos.json');
  private runtimeFilePath = path.resolve(process.cwd(), 'node_modules', '.cache', 'fitet_cache', 'team_logos.json');
  private logos: Record<string, string> = {
    'ASD TENNISTAVOLO NUOVA LUZZI': 'https://portale.fitet.org/images/societa/3260.jpg',
    'TENNISTAVOLO CASTROVILLARI': 'https://portale.fitet.org/images/societa/3164.jpg',
    'TT PETROLO COSENZA': 'https://portale.fitet.org/images/societa/2904.jpg',
    'PIROSSIGENO COSENZA': 'https://portale.fitet.org/images/societa/2904.jpg',
  };

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.staticFilePath)) {
        const raw = fs.readFileSync(this.staticFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object') {
          this.logos = { ...this.logos, ...parsed };
        }
      }
      if (fs.existsSync(this.runtimeFilePath)) {
        const raw = fs.readFileSync(this.runtimeFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object') {
          this.logos = { ...this.logos, ...parsed };
        }
      }
    } catch (e) {
      console.error('Error loading team_logos.json:', e);
    }
  }

  private saveToDisk() {
    try {
      const dir = path.dirname(this.runtimeFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.runtimeFilePath, JSON.stringify(this.logos, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error saving team_logos.json:', e);
    }
  }

  public getLogo(teamName: string): string | undefined {
    const norm = teamName.toUpperCase().trim();
    if (this.logos[norm]) return this.logos[norm];

    // Try fuzzy match
    for (const [k, url] of Object.entries(this.logos)) {
      if (norm.includes(k) || k.includes(norm)) return url;
    }
    return undefined;
  }

  /**
   * Resolves logos for a list of teams from a championship by scraping DatiSquadra.asp
   */
  public async resolveLogosForTeams(
    teams: Array<{ nome: string; squadraId: string }>,
    cam: number,
    anno = 41
  ): Promise<Record<string, string>> {
    const toFetch = teams.filter((t) => !this.getLogo(t.nome) && t.squadraId);
    if (toFetch.length === 0) return { ...this.logos };

    await Promise.all(
      toFetch.map(async (t) => {
        try {
          const url = `https://portale.fitet.org/risultati/campionati/DatiSquadra.asp?SQUADRA=${t.squadraId}&CAM=${cam}&ANNO=${anno}`;
          const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const text = new TextDecoder('iso-8859-1').decode(await res.arrayBuffer());
          const $ = cheerio.load(text);

          const img = $('img[src*="/societa/"]').first().attr('src');
          if (img) {
            const clean = img.replace(/^(\.\.\/)+/, '');
            const fullUrl = clean.startsWith('http') ? clean : `https://portale.fitet.org/${clean}`;
            this.logos[t.nome.toUpperCase().trim()] = fullUrl;
          } else {
            // Check Albo Federale society ID
            const tableText = $('table').text().replace(/\s+/g, ' ');
            const alboMatch = tableText.match(/Albo Federale Prima Affiliazione\s*([^\d]*)\s*(\d{2,6})/i);
            if (alboMatch && alboMatch[2]) {
              const fullUrl = `https://portale.fitet.org/images/societa/${alboMatch[2]}.jpg`;
              this.logos[t.nome.toUpperCase().trim()] = fullUrl;
            }
          }
        } catch (err) {
          console.warn(`Failed to resolve logo for team ${t.nome}:`, err);
        }
      })
    );

    this.saveToDisk();
    return { ...this.logos };
  }
}

export const teamResolver = new TeamResolver();
