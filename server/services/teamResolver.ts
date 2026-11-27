import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { FitetClient } from './fitetClient';
import { getRuntimeCacheDir } from './runtimeCacheDir';

const SOCIETY_STOPWORDS = new Set([
  'ASD',
  'APD',
  'USD',
  'ACSD',
  'SSD',
  'GSD',
  'GS',
  'US',
  'AS',
  'CSI',
  'PGS',
  'CUS',
  'CRAL',
  'CIRCOLO',
  'POLISPORTIVA',
  'POL',
  'DILETTANTISTICA',
  'SPORTIVA',
  'ASSOCIAZIONE',
  'TENNISTAVOLO',
  'TENNIS',
  'TAVOLO',
  'TT',
  'PING',
  'PONG',
  'CLUB',
  'SRL',
  'SPA',
  'ONLUS',
]);

/**
 * Strips legal prefixes (A.S.D., T.T., Tennistavolo, Polisportiva, etc.) and
 * trailing team letters ("A", "B", etc.) so official society names and team
 * names normalize to the same core string.
 */
export function normalizeCoreTeamName(raw?: string | null): string {
  if (!raw) return '';
  const cleaned = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/["'“”‘’]/g, ' ')
    // Collapse dotted acronyms like A.S.D. -> ASD, T.T. -> TT, P.G.S. -> PGS
    .replace(/\b([A-Z])\.(?=[A-Z]\.|\s|$)/g, '$1')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const rawTokens = cleaned.split(/\s+/).filter(Boolean);
  // Strip trailing single-letter team designators (e.g. "A", "B", "C", "D")
  while (rawTokens.length > 1 && /^[A-F]$/.test(rawTokens[rawTokens.length - 1])) {
    rawTokens.pop();
  }

  const coreTokens = rawTokens.filter((tok) => !SOCIETY_STOPWORDS.has(tok) && tok.length > 1);
  if (coreTokens.length > 0) {
    return coreTokens.join(' ');
  }
  return rawTokens.join(' ');
}

export function extractCoreTokens(raw?: string | null): string[] {
  const core = normalizeCoreTeamName(raw);
  if (!core) return [];
  return core.split(/\s+/).filter((tok) => tok.length >= 3);
}

export class TeamResolver {
  private staticFilePath = path.resolve(process.cwd(), 'server', 'data', 'team_logos.json');
  private runtimeFilePath = path.join(getRuntimeCacheDir(), 'team_logos.json');
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

  public registerSocietyLogo(name: string, societyId: string, logoUrl?: string): void {
    const cleanName = (name || '').toUpperCase().trim();
    const cleanId = String(societyId || '').trim();
    if (!cleanName || !cleanId) return;
    const url = logoUrl || `https://portale.fitet.org/images/societa/${cleanId}.jpg`;
    if (this.logos[cleanName] !== url) {
      this.logos[cleanName] = url;
      this.saveToDisk();
    }
  }

  public getLogo(teamName: string): string | undefined {
    const norm = (teamName || '').toUpperCase().trim();
    if (!norm) return undefined;
    if (this.logos[norm]) return this.logos[norm];

    // 1. Direct raw substring match
    for (const [k, url] of Object.entries(this.logos)) {
      if (norm.includes(k) || k.includes(norm)) return url;
    }

    // 2. Normalized core name match (strips A.S.D., T.T., Tennistavolo, trailing "A"/"B", etc.)
    const coreQuery = normalizeCoreTeamName(norm);
    if (!coreQuery || coreQuery.length < 3) return undefined;

    let bestSubstringUrl: string | undefined;
    let bestSubstringDiff = Infinity;

    const hasWholePhrase = (haystack: string, needle: string): boolean => {
      if (haystack === needle) return true;
      const paddedH = ` ${haystack} `;
      const paddedN = ` ${needle} `;
      return paddedH.includes(paddedN);
    };

    for (const [k, url] of Object.entries(this.logos)) {
      const coreKey = normalizeCoreTeamName(k);
      if (!coreKey || coreKey.length < 3) continue;
      if (coreKey === coreQuery) {
        return url;
      }
      if (coreKey.length >= 4 && coreQuery.length >= 4) {
        if (hasWholePhrase(coreKey, coreQuery) || hasWholePhrase(coreQuery, coreKey)) {
          const diff = Math.abs(coreKey.length - coreQuery.length);
          if (diff < bestSubstringDiff) {
            bestSubstringDiff = diff;
            bestSubstringUrl = url;
          }
        }
      }
    }

    if (bestSubstringUrl) return bestSubstringUrl;

    // 3. Token overlap match on distinctive tokens (>= 4 chars, exact token match only)
    const queryTokens = extractCoreTokens(norm).filter((t) => t.length >= 4);
    if (queryTokens.length === 0) return undefined;

    let bestTokenUrl: string | undefined;
    let bestTokenScore = 0;

    for (const [k, url] of Object.entries(this.logos)) {
      const keyTokens = extractCoreTokens(k).filter((t) => t.length >= 4);
      if (keyTokens.length === 0) continue;

      const matchedCount = queryTokens.filter((qt) => keyTokens.includes(qt)).length;
      if (matchedCount === 0) continue;

      const allQueryMatched = matchedCount === queryTokens.length;
      const allKeyMatched = matchedCount === keyTokens.length;
      const maxTokens = Math.max(queryTokens.length, keyTokens.length);
      const coverageOk = matchedCount >= 2 || (allQueryMatched && allKeyMatched) || matchedCount / maxTokens >= 0.5;
      const score =
        matchedCount * 10 +
        (allQueryMatched ? 5 : 0) +
        (allKeyMatched ? 5 : 0) -
        Math.abs(keyTokens.length - queryTokens.length);

      if (coverageOk && score > bestTokenScore) {
        bestTokenScore = score;
        bestTokenUrl = url;
      }
    }

    return bestTokenUrl;
  }

  public findSocietyId(query: string): string | undefined {
    const logo = this.getLogo(query);
    return logo?.match(/\/societa\/(\d+)\./i)?.[1];
  }

  /**
   * Returns every known team name whose logo resolves to the given society
   * (Albo Federale) ID. The team_logos index is keyed by society image, so it
   * doubles as a lightweight team → society association table.
   */
  public getTeamNamesForSociety(societyId: string): string[] {
    const id = String(societyId || '').trim();
    if (!id) return [];

    const matches: string[] = [];
    for (const [teamName, url] of Object.entries(this.logos)) {
      const match = url.match(/\/societa\/(\d+)\.(?:jpg|jpeg|png|gif|webp)(?:\?.*)?$/i);
      if (match && match[1] === id) {
        matches.push(teamName);
      }
    }
    return matches;
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
          const text = await FitetClient.fetchHtml(url);
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
