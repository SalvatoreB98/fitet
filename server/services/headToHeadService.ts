import { FitetClient } from './fitetClient';
import { cacheService } from './cacheService';
import { athleteResolver } from './athleteResolver';
import { parseHeadToHead } from '../parsers/headToHeadParser';
import { HeadToHeadData, PartiteRankingAtleta } from '../../src/types/fitet';

const TTL_HEAD_TO_HEAD = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_ID_CLASS = 247;

export class HeadToHeadService {
  /**
   * Recupera il confronto diretto (Testa a Testa) tra due atleti
   * Supporta sia ID federali che nomi atleti (risolti automaticamente)
   */
  async getHeadToHead(
    atleta1: string,
    atleta2: string,
    idClass = DEFAULT_ID_CLASS
  ): Promise<HeadToHeadData> {
    let id1 = atleta1.trim();
    let id2 = atleta2.trim();
    let name1 = '';
    let name2 = '';

    // Risoluzione ID 1 se non numerico
    if (!/^\d+$/.test(id1)) {
      name1 = id1;
      const resolved = await athleteResolver.resolveAthleteId(id1);
      if (resolved) id1 = resolved;
    }

    // Risoluzione ID 2 se non numerico
    if (!/^\d+$/.test(id2)) {
      name2 = id2;
      const resolved = await athleteResolver.resolveAthleteId(id2);
      if (resolved) id2 = resolved;
    }

    const cacheKey = `h2h_${id1}_${id2}_${idClass}`;
    const cached = cacheService.get<HeadToHeadData>(cacheKey);
    if (cached) return cached;

    // Se uno dei due ID non è numerico e non è risolvibile, restituisci oggetto vuoto
    if (!/^\d+$/.test(id1) || !/^\d+$/.test(id2)) {
      return {
        atleta1: { id: id1, nome: name1 || id1, vittorie: 0 },
        atleta2: { id: id2, nome: name2 || id2, vittorie: 0 },
        totaleIncontri: 0,
        incontri: [],
      };
    }

    try {
      const url = `https://portale.fitet.org/risultati/new_rank/head_head.php?ATLETA=${id1}&AVVERSARIO=${id2}&ZU=1&ID_CLASS=${idClass}`;
      const html = await FitetClient.fetchHtml(url, false);
      const data = parseHeadToHead(html, id1, id2, name1, name2);

      cacheService.set(cacheKey, data, TTL_HEAD_TO_HEAD);
      return data;
    } catch (err) {
      console.warn(`[HeadToHeadService] Errore fetch testa a testa ${id1} vs ${id2}:`, err);
      return {
        atleta1: { id: id1, nome: name1 || id1, vittorie: 0 },
        atleta2: { id: id2, nome: name2 || id2, vittorie: 0 },
        totaleIncontri: 0,
        incontri: [],
      };
    }
  }

  /**
   * Arricchisce gli incontri ranking (soprattutto gare di torneo)
   * incrociando i risultati dei set dal Testa a Testa
   */
  async enrichRankingMatches(
    atletaId: string,
    partite: PartiteRankingAtleta,
    idClass = DEFAULT_ID_CLASS
  ): Promise<PartiteRankingAtleta> {
    if (!partite) return partite;

    // Raccoglie tutti gli avversari unici che necessitano del punteggio set
    const neededOpponents = new Map<string, { id?: string; name: string }>();

    if (Array.isArray(partite.tornei)) {
      for (const t of partite.tornei) {
        if (!t.risultatoSet && t.avversario) {
          const key = t.avversario.toUpperCase().trim();
          if (!neededOpponents.has(key)) {
            neededOpponents.set(key, { id: t.avversarioId, name: t.avversario });
          } else if (t.avversarioId && !neededOpponents.get(key)!.id) {
            neededOpponents.get(key)!.id = t.avversarioId;
          }
        }
      }
    }

    if (Array.isArray(partite.campionato)) {
      for (const c of partite.campionato) {
        if (!c.risultatoSet && c.avversario) {
          const key = c.avversario.toUpperCase().trim();
          if (!neededOpponents.has(key)) {
            neededOpponents.set(key, { id: c.avversarioId, name: c.avversario });
          } else if (c.avversarioId && !neededOpponents.get(key)!.id) {
            neededOpponents.get(key)!.id = c.avversarioId;
          }
        }
      }
    }

    if (neededOpponents.size === 0) return partite;

    // Processa gli avversari unici
    const opponentsList = Array.from(neededOpponents.entries()).slice(0, 15);
    const batchSize = 5;
    const h2hMap = new Map<string, HeadToHeadData>();

    const normDate = (d?: string) => {
      if (!d) return '';
      const parts = d.trim().split(/[\/\-\.]/);
      if (parts.length === 3) {
        let [day, month, year] = parts;
        day = String(parseInt(day, 10));
        month = String(parseInt(month, 10));
        if (year.length === 2) year = `20${year}`;
        return `${day}/${month}/${year}`;
      }
      return d.trim();
    };

    for (let i = 0; i < opponentsList.length; i += batchSize) {
      const chunk = opponentsList.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async ([key, opp]) => {
          try {
            const target = opp.id || opp.name;
            const h2h = await this.getHeadToHead(atletaId, target, idClass);
            if (h2h && h2h.incontri.length > 0) {
              h2hMap.set(key, h2h);
              if (opp.id) h2hMap.set(opp.id, h2h);
              if (h2h.atleta2.id) h2hMap.set(h2h.atleta2.id, h2h);
              if (h2h.atleta2.nome) h2hMap.set(h2h.atleta2.nome.toUpperCase().trim(), h2h);
            }
          } catch (err) {
            // Ignorato silenziosamente per non bloccare
          }
        })
      );
    }

    // Abbiniamo i punteggi per ogni partita di torneo
    if (Array.isArray(partite.tornei)) {
      for (const t of partite.tornei) {
        if (t.risultatoSet) continue;
        const oppName = t.avversario.toUpperCase().trim();
        const h2h = (t.avversarioId && h2hMap.get(t.avversarioId)) || h2hMap.get(oppName);
        if (!h2h) continue;

        if (h2h.atleta2.id) t.avversarioId = h2h.atleta2.id;

        const targetDate = normDate(t.data);
        const enc =
          h2h.incontri.find((e) => normDate(e.data) === targetDate) ||
          (h2h.incontri.length === 1 ? h2h.incontri[0] : undefined);

        if (enc) {
          t.risultatoSet = enc.punteggio;
        }
      }
    }

    // Abbiniamo per partite di campionato
    if (Array.isArray(partite.campionato)) {
      for (const c of partite.campionato) {
        if (c.risultatoSet) continue;
        const oppName = c.avversario.toUpperCase().trim();
        const h2h = (c.avversarioId && h2hMap.get(c.avversarioId)) || h2hMap.get(oppName);
        if (!h2h) continue;

        if (h2h.atleta2.id) c.avversarioId = h2h.atleta2.id;

        const targetDate = normDate(c.data);
        const enc =
          h2h.incontri.find((e) => normDate(e.data) === targetDate) ||
          (h2h.incontri.length === 1 ? h2h.incontri[0] : undefined);

        if (enc) {
          c.risultatoSet = enc.punteggio;
        }
      }
    }

    return partite;
  }
}

export const headToHeadService = new HeadToHeadService();
