import * as cheerio from 'cheerio';
import {
  DettaglioAtleta,
  StoricoRankingSnapshot,
  PartiteRankingAtleta,
  PartitaRankingCampionato,
  PartitaRankingTorneo,
  DettaglioPuntiRanking,
} from '../../src/types/fitet';

/**
 * Parsa un numero formattato all'italiana (es. "2.510,40", "3.050", "166,00", "-15,20")
 * Gestisce correttamente il punto come separatore delle migliaia e la virgola come separatore decimale.
 */
export function parseItalianNumber(val: string | null | undefined): number {
  if (!val) return 0;
  const clean = val.trim();
  if (!clean) return 0;

  // Se contiene sia punto che virgola (es. "2.510,40" o "10.250,50")
  if (clean.includes('.') && clean.includes(',')) {
    const parsed = parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
    return parsed;
  }

  // Se contiene solo la virgola (es. "166,00" o "248,36")
  if (clean.includes(',')) {
    const parsed = parseFloat(clean.replace(',', '.')) || 0;
    return parsed;
  }

  // Se contiene solo il punto (es. "3.050" o "2.510")
  if (/^\s*[+-]?\d{1,3}(?:\.\d{3})+\s*$/.test(clean)) {
    const parsed = parseFloat(clean.replace(/\./g, '')) || 0;
    return parsed;
  }

  return parseFloat(clean) || 0;
}

/**
 * Estrae l'URL della pagina iframe da #fragment-3 (Dettaglio Punti)
 */
export function extractRankingIframeUrl(html: string): string | null {
  console.log('[extractRankingIframeUrl] Inizio estrazione iframe URL');
  const $ = cheerio.load(html);
  const rawSrc = $('#fragment-3 iframe').attr('src');
  if (!rawSrc) {
    console.warn('[extractRankingIframeUrl] Nessun iframe trovato in #fragment-3');
    return null;
  }

  const cleanSrc = rawSrc.replace(/\s+/g, '');
  if (!cleanSrc) {
    console.warn('[extractRankingIframeUrl] src iframe vuoto o non valido');
    return null;
  }

  try {
    const resolvedUrl = new URL(cleanSrc, 'https://portale.fitet.org/risultati/new_rank/dettaglioatleta_unica.php').href;
    console.log('[extractRankingIframeUrl] URL iframe estratto con successo:', resolvedUrl);
    return resolvedUrl;
  } catch (err) {
    console.error('[extractRankingIframeUrl] Errore risoluzione URL iframe:', cleanSrc, err);
    return null;
  }
}

function formatDateItalian(val: string): string {
  const clean = val.trim();
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return clean;
}

/**
 * Verifica se una data appartiene alla stagione sportiva corrente (2026/2027: da 01/07/2026 a 30/06/2027)
 */
export function isCurrentSeasonDate(dateStr: string): boolean {
  if (!dateStr) return true;
  const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/) || dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const year = parseInt(m[3] && m[3].length === 4 ? m[3] : m[1], 10);
    const month = parseInt(m[3] && m[3].length === 4 ? m[2] : m[2], 10);

    if (year < 2026) return false;
    if (year === 2026 && month < 7) return false;
    if (year > 2027) return false;
    if (year === 2027 && month > 6) return false;
    return true;
  }
  return true;
}

/**
 * Parsa la pagina HTML caricata dall'iframe di ranking
 */
export function parsePartiteRanking(html: string, atletaId: string): PartiteRankingAtleta {
  console.log(`[parsePartiteRanking] Inizio parsing partite ranking per atletaId: ${atletaId}`);
  const $ = cheerio.load(html);
  let $p = $(`#player_${atletaId}`);
  if (!$p.length) {
    console.warn(`[parsePartiteRanking] Selettore #player_${atletaId} non trovato, fallback su prima classe .player`);
    $p = $('.player').first();
  }

  const result: PartiteRankingAtleta = {
    campionato: [],
    tornei: [],
  };

  if (!$p.length) {
    console.error(`[parsePartiteRanking] Nessun elemento atleta trovato nell'HTML per atletaId: ${atletaId}`);
    return result;
  }

  const subtleText = $p.find('.subtle').text().trim();
  result.rawSubtle = subtleText;

  if (subtleText) {
    console.debug('[parsePartiteRanking] Testo .subtle trovato:', subtleText);
    const parseSubVal = (regex: RegExp) => {
      const m = subtleText.match(regex);
      return m ? parseItalianNumber(m[1]) : undefined;
    };
    result.dettaglioPunti = {
      puntiIniziali: parseSubVal(/iniziali\s*<b>?([\d\.,]+)/i),
      campionato: parseSubVal(/campionato\s*<b>?([\d\.,]+)/i),
      tornei: parseSubVal(/tornei\s*<b>?([\d\.,]+)/i),
      vittorieTornei: parseSubVal(/vittorie\s*tornei\s*<b>?([\d\.,]+)/i),
      protezione: parseSubVal(/protezione\s*<b>?([\d\.,]+)/i),
      finali: parseSubVal(/finali\s*<b>?([\d\.,]+)/i),
    };
    console.log('[parsePartiteRanking] Dettaglio punti parsato:', result.dettaglioPunti);
  }

  $p.find('h3').each((_, h3) => {
    const text = $(h3).text().replace(/\s+/g, ' ').toLowerCase();
    const table = $(h3).nextAll('table').first();
    if (!table.length) return;

    const headerText = table.find('th, tr:first-child td').text().toLowerCase();
    if (!headerText.includes('avversario')) return;

    if (text.includes('campionato') && !text.includes('punti') && !text.includes('posizionamento')) {
      console.log('[parsePartiteRanking] Parsing tabella campionato');
      table.find('tbody tr').each((_, tr) => {
        const cells = $(tr).find('td');
        if (cells.length < 4) return;
        const rowText = $(tr).text().trim();
        if (rowText.toLowerCase().includes('totale')) return;

        const rawData = $(cells[0]).text().trim();
        if (!rawData || (!rawData.includes('/') && !rawData.includes('-'))) return;
        const data = formatDateItalian(rawData);
        if (!isCurrentSeasonDate(data)) {
          console.debug(`[parsePartiteRanking] Partita campionato scartata fuori stagione: ${data}`);
          return;
        }

        let campionato = '';
        let punti = 0;
        let ris = '';
        let sesso: string | undefined = undefined;
        let stato: string | undefined = undefined;
        let avversario = '';
        let avversarioId: string | undefined = undefined;

        if (cells.length === 5) {
          campionato = $(cells[1]).text().trim();
          stato = $(cells[2]).text().trim();
          const $avvCell = $(cells[3]);
          avversario = $avvCell.text().trim();
          const $link = $avvCell.find('a');
          const href = $link.attr('href') || $link.attr('onclick') || '';
          const idMatch = href.match(/AVVERSARIO=(\d+)/i) || href.match(/ATLETA=(\d+)/i) || href.match(/atleti\/(\d+)/i) || href.match(/(\d{4,})/);
          avversarioId = idMatch ? idMatch[1] : undefined;
          ris = $(cells[4]).text().trim();
        } else {
          campionato = $(cells[1]).text().trim();
          punti = parseItalianNumber($(cells[2]).text().trim());
          ris = $(cells[3]).text().trim();
          sesso = cells.length >= 5 ? $(cells[4]).text().trim() : undefined;
          stato = cells.length >= 6 ? $(cells[5]).text().trim() : undefined;
          const $avvCell = cells.length >= 7 ? $(cells[6]) : $(cells[cells.length - 1]);
          avversario = $avvCell.text().trim();
          const $link = $avvCell.find('a');
          const href = $link.attr('href') || $link.attr('onclick') || '';
          const idMatch = href.match(/AVVERSARIO=(\d+)/i) || href.match(/ATLETA=(\d+)/i) || href.match(/atleti\/(\d+)/i) || href.match(/(\d{4,})/);
          avversarioId = idMatch ? idMatch[1] : undefined;
        }

        const isVittoria = ris.toUpperCase() === 'V' || ris.toLowerCase() === 'win';

        result.campionato.push({
          data,
          campionato,
          punti,
          risultato: ris,
          isVittoria,
          avversario,
          avversarioId,
          sesso,
          stato,
        });
      });
      console.log(`[parsePartiteRanking] Partite campionato estratte: ${result.campionato.length}`);
    } else if (text.includes('torne') && !text.includes('punti') && !text.includes('posizionamento') && !text.includes('vinti nei gironi')) {
      console.log('[parsePartiteRanking] Parsing tabella tornei');
      table.find('tbody tr').each((_, tr) => {
        const cells = $(tr).find('td');
        if (cells.length < 5) return;
        const rowText = $(tr).text().trim();
        if (rowText.toLowerCase().includes('totale')) return;

        const rawData = $(cells[0]).text().trim();
        if (!rawData || (!rawData.includes('/') && !rawData.includes('-'))) return;
        const data = formatDateItalian(rawData);
        if (!isCurrentSeasonDate(data)) {
          console.debug(`[parsePartiteRanking] Partita torneo scartata fuori stagione: ${data}`);
          return;
        }

        const torneo = $(cells[1]).text().trim();
        const gara = $(cells[2]).text().trim();
        const stato = $(cells[3]).text().trim();
        const $avvCell = $(cells[4]);
        const avversario = $avvCell.text().trim();
        const $link = $avvCell.find('a');
        const href = $link.attr('href') || $link.attr('onclick') || '';
        const idMatch = href.match(/AVVERSARIO=(\d+)/i) || href.match(/ATLETA=(\d+)/i) || href.match(/atleti\/(\d+)/i) || href.match(/(\d{4,})/);
        const avversarioId = idMatch ? idMatch[1] : undefined;
        const fase = cells.length >= 6 ? $(cells[5]).text().trim() : undefined;
        const ris = cells.length >= 7 ? $(cells[6]).text().trim() : $(cells[cells.length - 1]).text().trim();

        if (ris.toUpperCase() !== 'V' && ris.toUpperCase() !== 'S' && ris.toLowerCase() !== 'win' && ris.toLowerCase() !== 'loss') return;
        const isVittoria = ris.toUpperCase() === 'V' || ris.toLowerCase() === 'win';
        const isDiscarded = $(tr).hasClass('discarded') || ris.toUpperCase() === 'S';

        result.tornei.push({
          data,
          torneo,
          gara,
          stato,
          avversario,
          avversarioId,
          fase,
          risultato: ris,
          isVittoria,
          isDiscarded,
        });
      });
      console.log(`[parsePartiteRanking] Partite tornei estratte: ${result.tornei.length}`);
    }
  });

  return result;
}

export function parseDettaglioAtleta(
  html: string,
  atletaId: string,
  partiteRanking?: PartiteRankingAtleta
): DettaglioAtleta {
  console.log(`[parseDettaglioAtleta] Inizio parsing scheda atleta ${atletaId}`);
  const $ = cheerio.load(html);

  // 1. Anagrafica
  const $titolo = $('p.titolo').first();
  const nomeRaw = $titolo.text().replace(/\s+/g, ' ').trim();
  console.debug(`[parseDettaglioAtleta] Nome rilevato: "${nomeRaw}"`);

  // Flag & nationality
  const flagImg = $titolo.find('img.immagine').first();
  const flagSrc = flagImg.attr('src') || '';
  const flagMatch = flagSrc.match(/bandiere\/([A-Za-z0-9_]+)\.png/i);
  const nazionalita = flagImg.attr('title') || (flagMatch ? flagMatch[1] : 'IT');
  const bandieraUrl = flagSrc.startsWith('http')
    ? flagSrc
    : `https://portale.fitet.org/images/bandiere/${flagMatch ? flagMatch[1] : 'IT'}.png`;

  // Photo
  const photoImg = $('img[src*="/atleti/"]').first();
  const photoSrc = photoImg.attr('src') || '';
  const photoMatch = photoSrc.match(/atleti\/(\d+)\.jpg/i);
  const fotoId = photoMatch ? photoMatch[1] : (atletaId || '');
  const fotoUrl = fotoId && /^\d+$/.test(fotoId) ? `https://portale.fitet.org/images/atleti/${fotoId}.jpg` : '';

  const getFieldValue = (label: string): string => {
    let result = '';
    $('td').each((_, td) => {
      const $td = $(td);
      const text = $td.text().trim();
      if (text.toLowerCase().includes(label.toLowerCase())) {
        const nextTd = $td.next('td');
        if (nextTd.length > 0) {
          result = nextTd.text().replace(/\s+/g, ' ').trim();
          return false;
        }
      }
    });
    return result;
  };

  const dataNascitaRaw = getFieldValue('Dati di Nascita');
  const dataNascitaMatch = dataNascitaRaw.match(/(\d{2}\/\d{2}\/\d{4})/);
  const dataNascita = dataNascitaMatch ? dataNascitaMatch[1] : dataNascitaRaw;
  const luogoNascita = dataNascitaRaw.replace(/.*?a\s*/i, '').trim();

  const settore = getFieldValue('Settore Agonistico') || 'Seniores';
  const societa = getFieldValue("Societa' appartenenza") || getFieldValue('Societa') || '';
  const regione = getFieldValue('Regione') || '';

  const catRaw = getFieldValue('Categoria');
  let categoria = catRaw;
  let punti = 0;
  const puntiMatch = catRaw.match(/punti\s*([\d\.,]+)/i);
  if (puntiMatch) {
    punti = parseItalianNumber(puntiMatch[1]);
    categoria = catRaw.replace(/punti\s*[\d\.,]+/i, '').trim();
  }

  let stato = $('.style5').text().trim();
  if (!stato) {
    const classNum = $('p.classifica').text().trim();
    stato = classNum ? `N. ${classNum}` : 'Attivo';
  }

  const recordClassifica = getFieldValue('Record classifica');

  // 2. Riepilogo Dati (#fragment-1)
  const $riepilogoTable = $('#fragment-1 table').first();
  let puntiIniziali = 0;
  let puntiInizialiData = '';
  let puntiTotali = 0;
  let punteggioFinale = punti;
  let partiteGiocate = 0;
  let partiteVinte = 0;
  let partitePerse = 0;
  let percentualePositiva = 0;

  if ($riepilogoTable.length > 0) {
    const rows = $riepilogoTable.find('tr');
    if (rows.length >= 2) {
      const headerCells = $(rows[0]).find('td, th');
      const dataCells = $(rows[1]).find('td');

      const headers = headerCells.map((_, c) => $(c).text().replace(/\s+/g, ' ').trim().toUpperCase()).get();
      console.debug('[parseDettaglioAtleta] Intestazioni tabella riepilogo:', headers);

      const findCol = (re: RegExp, fallback: number) => {
        const i = headers.findIndex((h) => re.test(h));
        return i >= 0 ? i : fallback;
      };
      const hasProtezione = headers.some((h) => /PROTEZIONE/.test(h));
      const offset = hasProtezione ? 1 : 0;
      const colIniziali = findCol(/INIZIALI/, 0);
      const colTotali = findCol(/PUNTI TOTALI/, 1);
      const colFinale = findCol(/PUNTEGGIO FINALE/, 2 + offset);
      const colGiocate = findCol(/GIOCATE/, 3 + offset);
      const colVinte = findCol(/VINTE/, 4 + offset);
      const colPerse = findCol(/PERSE/, 5 + offset);
      const colPerc = findCol(/%/, 6 + offset);

      if (dataCells.length >= 7) {
        const initText = $(dataCells[colIniziali]).text().trim();
        const initMatch = initText.match(/([\d\.,]+)\s*\[?\s*(\d{2}\/\d{2}\/\d{4})?/);
        if (initMatch) {
          puntiIniziali = parseItalianNumber(initMatch[1]);
          puntiInizialiData = initMatch[2] || '';
        }

        puntiTotali = parseItalianNumber($(dataCells[colTotali]).text().trim());
        punteggioFinale = parseItalianNumber($(dataCells[colFinale]).text().trim()) || punti;
        partiteGiocate = parseInt($(dataCells[colGiocate]).text().trim(), 10) || 0;
        partiteVinte = parseInt($(dataCells[colVinte]).text().trim(), 10) || 0;
        partitePerse = parseInt($(dataCells[colPerse]).text().trim(), 10) || 0;
        percentualePositiva = parseItalianNumber($(dataCells[colPerc]).text().trim().replace('%', ''));

        console.log('[parseDettaglioAtleta] Riepilogo estratto:', {
          puntiIniziali,
          puntiTotali,
          punteggioFinale,
          giocate: partiteGiocate,
          vinte: partiteVinte,
          perse: partitePerse,
        });
      } else {
        console.warn(`[parseDettaglioAtleta] Celle insufficienti nel riepilogo (${dataCells.length})`);
      }
    }
  } else {
    console.warn('[parseDettaglioAtleta] Tabella #fragment-1 non trovata');
  }

  // 3. Storico Classifica (#fragment-4)
  const storicoClassifica: StoricoRankingSnapshot[] = [];
  $('#fragment-4 table tr').each((idx, tr) => {
    if (idx === 0) return;
    const cells = $(tr).find('td');
    if (cells.length < 4) return;

    const data = $(cells[0]).text().trim();
    if (!data.match(/\d{4}-\d{2}-\d{2}/) && !data.match(/\d{2}\/\d{2}\/\d{4}/)) return;

    const posText = $(cells[1]).text().trim();
    const posizione = posText ? parseInt(posText, 10) || null : null;

    const pt = parseItalianNumber($(cells[2]).text().trim());
    const cat = $(cells[3]).text().trim() || categoria;

    storicoClassifica.push({
      data,
      punti: pt,
      posizione,
      categoria: cat,
    });
  });

  storicoClassifica.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  console.log(`[parseDettaglioAtleta] Rilevazioni storico classifica trovate: ${storicoClassifica.length}`);

  const ultimoSnapshot = storicoClassifica.length > 0 ? storicoClassifica[storicoClassifica.length - 1] : null;
  const puntiEffettivi = punteggioFinale || punti || (ultimoSnapshot ? ultimoSnapshot.punti : 0);

  console.log(`[parseDettaglioAtleta] Completato parsing per ${nomeRaw || atletaId}. Punti finali: ${puntiEffettivi}`);

  return {
    id: atletaId,
    anagrafica: {
      nome: nomeRaw || `Atleta ${atletaId}`,
      nazionalita,
      bandieraUrl,
      fotoId,
      fotoUrl,
      dataNascita,
      luogoNascita,
      settore,
      societa,
      regione,
      categoria,
      punti: puntiEffettivi,
      stato,
      recordClassifica,
    },
    riepilogo: {
      puntiIniziali,
      puntiInizialiData,
      puntiTotali,
      punteggioFinale: puntiEffettivi,
      partiteGiocate,
      partiteVinte,
      partitePerse,
      percentualePositiva,
    },
    storicoClassifica,
    partiteRanking,
  };
}