import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { FitetClient } from './fitetClient';
import defaultMapping from '../data/athlete_mapping.json';

export class AthleteResolver {
  private mappingFile: string;
  private mapping: Record<string, string>;

  constructor() {
    this.mapping = { ...defaultMapping };
    this.mappingFile = path.resolve(process.cwd(), 'server', 'data', 'athlete_mapping.json');
    this.loadMapping();
  }

  private loadMapping() {
    try {
      if (fs.existsSync(this.mappingFile)) {
        const content = fs.readFileSync(this.mappingFile, 'utf8');
        this.mapping = { ...defaultMapping, ...JSON.parse(content) };
      }
    } catch {
      this.mapping = { ...defaultMapping };
    }
  }

  private saveMapping() {
    try {
      fs.writeFileSync(this.mappingFile, JSON.stringify(this.mapping, null, 2), 'utf8');
    } catch {
      // Ignored in read-only serverless environment
    }
  }

  public reloadMapping() {
    this.loadMapping();
  }

  getMapping(): Record<string, string> {
    this.loadMapping();
    return { ...this.mapping };
  }

  /**
   * Resolves athlete name to ID, falling back to dynamic search on FITeT autocomplete
   */
  async resolveAthleteId(name: string): Promise<string | null> {
    const cleanName = name.trim().toUpperCase();
    if (this.mapping[cleanName]) {
      return this.mapping[cleanName];
    }

    // Dynamic resolution via FITeT autocomplete
    try {
      // First try with surname
      const surname = cleanName.split(' ')[0];
      const results = await FitetClient.searchAtleta(surname);
      
      const norm = (s: string) => s.replace(/[^a-zA-Z]/g, '').toUpperCase();
      const target = norm(cleanName);

      const exact = results.find(
        (r) => norm(r.value) === target || norm(r.value).includes(target) || target.includes(norm(r.value))
      );

      if (exact) {
        this.mapping[cleanName] = exact.id;
        this.saveMapping();
        return exact.id;
      }
    } catch (err) {
      console.warn(`Dynamic athlete resolution failed for ${cleanName}:`, err);
    }

    return null;
  }

  /**
   * Resolves all athlete IDs for a given championship by crawling percentuali.php of its teams
   */
  async resolveAthletesForChampionship(cam: number, squadraIds: string[]): Promise<Record<string, string>> {
    if (!squadraIds || squadraIds.length === 0) return this.getMapping();

    let newFound = 0;
    await Promise.all(
      squadraIds.map(async (sqId) => {
        try {
          const res = await fetch(`https://portale.fitet.org/risultati/campionati/percentuali.php?SQUADRA=${sqId}&CAM=${cam}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          const text = new TextDecoder('iso-8859-1').decode(await res.arrayBuffer());
          const $p = cheerio.load(text);
          $p('a[href*="IDA="]').each((_, a) => {
            const href = $p(a).attr('href') || '';
            const m = href.match(/IDA=(\d+)/i);
            const name = $p(a).text().replace(/\s+/g, ' ').trim().toUpperCase();
            if (m && name) {
              if (!this.mapping[name]) {
                this.mapping[name] = m[1];
                newFound++;
              }
            }
          });
        } catch (err) {
          console.warn(`Error resolving athletes from team ${sqId} in CAM ${cam}:`, err);
        }
      })
    );

    if (newFound > 0) {
      this.saveMapping();
      console.log(`[AthleteResolver] Auto-indexed ${newFound} new athletes for CAM ${cam}. Total indexed: ${Object.keys(this.mapping).length}`);
    }

    return this.getMapping();
  }
}

export const athleteResolver = new AthleteResolver();
