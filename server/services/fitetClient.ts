/**
 * FITeT HTTP Client
 * Handles fetching with arrayBuffer response and iso-8859-1 decoding for accented Italian characters.
 */

const BASE_URL = 'https://portale.fitet.org';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
};

export class FitetClient {
  /**
   * Fetches raw ISO-8859-1 HTML content from a FITeT endpoint and decodes it safely
   */
  static async fetchHtml(url: string, isAjax = false, customReferer?: string): Promise<string> {
    const headers: Record<string, string> = {
      ...DEFAULT_HEADERS,
    };

    if (isAjax) {
      headers['X-Requested-With'] = 'XMLHttpRequest';
      headers['Referer'] = customReferer || 'https://portale.fitet.org/risultati/new_rank/testaclassifica_auto.php?ID_CLASS=247&ID=1&PASS=20';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`FITeT HTTP error: ${response.status} ${response.statusText} on ${url}`);
      }

      // Read array buffer and decode using ISO-8859-1
      const buffer = await response.arrayBuffer();
      const decoder = new TextDecoder('iso-8859-1');
      return decoder.decode(buffer);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Endpoint 1: Classifica Squadre
   */
  static async fetchClassifica(cam: number | string): Promise<string> {
    const url = `${BASE_URL}/risultati/campionati/classifica_squadre.php?CAM=${cam}`;
    return this.fetchHtml(url);
  }

  /**
   * Endpoint 2: Calendario & Incontri
   */
  static async fetchCalendario(cam: number | string, anno = 41): Promise<string> {
    const url = `${BASE_URL}/risultati/campionati/Calendario.asp?CAM=${cam}&ANNO=${anno}`;
    return this.fetchHtml(url);
  }

  /**
   * Endpoint 3: Statistiche Atleti Girone
   */
  static async fetchStatisticheAtleti(cam: number | string): Promise<string> {
    const url = `${BASE_URL}/risultati/campionati/statistiche_atleti.php?CAM=${cam}`;
    return this.fetchHtml(url);
  }

  /**
   * Endpoint 4: Scheda Singolo Atleta (Ranking & Storico Punti)
   */
  static async fetchSchedaAtleta(atletaId: string | number, idClass = 247): Promise<string> {
    const url = `${BASE_URL}/risultati/new_rank/dettaglioatleta_unica.php?ATLETA=${atletaId}&ID_CLASS=${idClass}&ZU=1&AVVERSARIO=0`;
    return this.fetchHtml(url, true);
  }

  /**
   * Autocomplete search for athletes
   */
  static async searchAtleta(query: string): Promise<Array<{ id: string; value: string; label: string }>> {
    const url = `${BASE_URL}/risultati/new_rank/ajax.php?term=${encodeURIComponent(query)}`;
    const text = await this.fetchHtml(url, true);
    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  }

  /**
   * Endpoint 5: Referto Incontro Gara
   */
  static async fetchRefertoIncontro(incontroId: string | number, cam: number | string, formula = 19): Promise<string> {
    const url = `${BASE_URL}/risultati/campionati/giornata.php?INCONTRO=${incontroId}&CAM=${cam}&FORMULA=${formula}`;
    return this.fetchHtml(url);
  }

  /**
   * Endpoint 6: Dettaglio Singola Partita Individuale
   */
  static async fetchDettaglioPartita(partitaId: string | number): Promise<string> {
    const url = `${BASE_URL}/risultati/campionati/dettaglio_partita.php?ID=${partitaId}`;
    return this.fetchHtml(url);
  }
}
