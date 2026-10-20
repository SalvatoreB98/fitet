import fs from 'fs';
import path from 'path';
import { FitetClient } from './fitetClient';

export class AthleteResolver {
  private mappingFile: string;
  private mapping: Record<string, string> = {};

  constructor() {
    this.mappingFile = path.resolve(process.cwd(), 'server', 'data', 'athlete_mapping.json');
    this.loadMapping();
  }

  private loadMapping() {
    try {
      if (fs.existsSync(this.mappingFile)) {
        const content = fs.readFileSync(this.mappingFile, 'utf8');
        this.mapping = JSON.parse(content);
      }
    } catch (e) {
      console.warn('Could not read athlete_mapping.json:', e);
      this.mapping = {
        'BUTERA SALVATORE': '829250',
      };
    }
  }

  private saveMapping() {
    try {
      fs.writeFileSync(this.mappingFile, JSON.stringify(this.mapping, null, 2), 'utf8');
    } catch (e) {
      console.warn('Could not save athlete_mapping.json:', e);
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
}

export const athleteResolver = new AthleteResolver();
