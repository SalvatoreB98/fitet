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

  // Se contiene sia punto che virgola (es. "2.510,40" o "10.250,50"):
  // il punto separa le migliaia, la virgola i decimali
  if (clean.includes('.') && clean.includes(',')) {
    return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
  }

  // Se contiene solo la virgola (es. "166,00" o "248,36"):
  // la virgola separa i decimali
  if (clean.includes(',')) {
    return parseFloat(clean.replace(',', '.')) || 0;
  }

  // Se contiene solo il punto (es. "3.050" o "2.510"):
  // Se dopo il punto ci sono 3 cifre, è un separatore di migliaia (3050 pt)
  if (/^\s*[+-]?\d{1,3}(?:\.\d{3})+\s*$/.test(clean)) {
    return parseFloat(clean.replace(/\./g, '')) || 0;
  }

  // Altrimenti parsalo normalmente come float
  return parseFloat(clean) || 0;
}

/**
 * Estrae l'URL della pagina iframe da #fragment-3 (Dettaglio Punti)
 */
export function extractRankingIframeUrl(html: string): string | null {
  const $ = cheerio.load(html);
  const rawSrc = $('#fragment-3 iframe').attr('src');
  if (!rawSrc) return null;

  const cleanSrc = rawSrc.replace(/\s+/g, '');
  if (!cleanSrc) return null;

  try {
    return new URL(cleanSrc, 'https://portale.fitet.org/risultati/new_rank/dettaglioatleta_unica.php').href;
  } catch {
    return null;
  }
}

/**
 * Parsa la pagina HTML caricata dall'iframe di ranking (contenente gli incontri di campionato e torneo)
 */
export function parsePartiteRanking(html: string, atletaId: string): PartiteRankingAtleta {
  const $ = cheerio.load(html);
  let $p = $(`#player_${atletaId}`);
  if (!$p.length) $p = $('.player').first();

  const result: PartiteRankingAtleta = {
    campionato: [],
    tornei: [],
  };

  if (!$p.length) return result;

  const subtleText = $p.find('.subtle').text().trim();
  result.rawSubtle = subtleText;

  if (subtleText) {
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
  }

  $p.find('h3').each((_, h3) => {
    const text = $(h3).text().replace(/\s+/g, ' ').toLowerCase();
    const table = $(h3).nextAll('table').first();
    if (!table.length) return;

    if (text.includes('campionato')) {
      table.find('tbody tr').each((_, tr) => {
        const cells = $(tr).find('td');
        if (cells.length < 4) return;
        const rowText = $(tr).text().trim();
        if (rowText.toLowerCase().includes('totale')) return;

        const data = $(cells[0]).text().trim();
        if (!data || !data.includes('/')) return;

        const campionato = $(cells[1]).text().trim();
        const punti = parseItalianNumber($(cells[2]).text().trim());
        const ris = $(cells[3]).text().trim();
        const sesso = cells.length >= 5 ? $(cells[4]).text().trim() : undefined;
        const stato = cells.length >= 6 ? $(cells[5]).text().trim() : undefined;
        const avversario = cells.length >= 7 ? $(cells[6]).text().trim() : $(cells[cells.length - 1]).text().trim();
        const isVittoria = ris.toUpperCase() === 'V';

        result.campionato.push({
          data,
          campionato,
          punti,
          risultato: ris,
          isVittoria,
          avversario,
          sesso,
          stato,
        });
      });
    } else if (text.includes('torneo')) {
      table.find('tbody tr').each((_, tr) => {
        const cells = $(tr).find('td');
        if (cells.length < 6) return;
        const rowText = $(tr).text().trim();
        if (rowText.toLowerCase().includes('totale')) return;

        const data = $(cells[0]).text().trim();
        if (!data || !data.includes('/')) return;

        const torneo = $(cells[1]).text().trim();
        const gara = $(cells[2]).text().trim();
        const stato = $(cells[3]).text().trim();
        const avversario = $(cells[4]).text().trim();
        const fase = cells.length >= 6 ? $(cells[5]).text().trim() : undefined;
        const ris = cells.length >= 7 ? $(cells[6]).text().trim() : $(cells[cells.length - 1]).text().trim();
        const isVittoria = ris.toUpperCase() === 'V';
        const isDiscarded = $(tr).hasClass('discarded') || ris.toUpperCase() === 'S';

        result.tornei.push({
          data,
          torneo,
          gara,
          stato,
          avversario,
          fase,
          risultato: ris,
          isVittoria,
          isDiscarded,
        });
      });
    }
  });

  return result;
}

export function parseDettaglioAtleta(
  html: string,
  atletaId: string,
  partiteRanking?: PartiteRankingAtleta
): DettaglioAtleta {
  const $ = cheerio.load(html);

  // 1. Anagrafica
  const $titolo = $('p.titolo').first();
  const nomeRaw = $titolo.text().replace(/\s+/g, ' ').trim();

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
  const fotoId = photoMatch ? photoMatch[1] : atletaId;
  const fotoUrl = `https://portale.fitet.org/images/atleti/${fotoId}.jpg`;

  // Helper to extract value by field label
  const getFieldValue = (label: string): string => {
    let result = '';
    $('td').each((_, td) => {
      const $td = $(td);
      const text = $td.text().trim();
      if (text.toLowerCase().includes(label.toLowerCase())) {
        const nextTd = $td.next('td');
        if (nextTd.length > 0) {
          result = nextTd.text().replace(/\s+/g, ' ').trim();
          return false; // break
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
  // Example catRaw: "6^ (*)    punti 166,00" o "6^    punti 2.510,40"
  let categoria = catRaw;
  let punti = 0;
  const puntiMatch = catRaw.match(/punti\s*([\d\.,]+)/i);
  if (puntiMatch) {
    punti = parseItalianNumber(puntiMatch[1]);
    categoria = catRaw.replace(/punti\s*[\d\.,]+/i, '').trim();
  }

  // State (e.g. "Fuori Quadro" or rank position)
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
      const dataRow = $(rows[1]);
      const dataCells = dataRow.find('td');

      if (dataCells.length >= 7) {
        const initText = $(dataCells[0]).text().trim();
        const initMatch = initText.match(/([\d\.,]+)\s*\[?\s*(\d{2}\/\d{2}\/\d{4})?/);
        if (initMatch) {
          puntiIniziali = parseItalianNumber(initMatch[1]);
          puntiInizialiData = initMatch[2] || '';
        }

        puntiTotali = parseItalianNumber($(dataCells[1]).text().trim());
        punteggioFinale = parseItalianNumber($(dataCells[2]).text().trim()) || punti;
        partiteGiocate = parseInt($(dataCells[3]).text().trim(), 10) || 0;
        partiteVinte = parseInt($(dataCells[4]).text().trim(), 10) || 0;
        partitePerse = parseInt($(dataCells[5]).text().trim(), 10) || 0;
        percentualePositiva = parseItalianNumber($(dataCells[6]).text().trim().replace('%', ''));
      }
    }
  }

  // 3. Storico Classifica (#fragment-4)
  const storicoClassifica: StoricoRankingSnapshot[] = [];
  $('#fragment-4 table tr').each((idx, tr) => {
    if (idx === 0) return; // header row
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

  // Sort storico chronologically ascending (oldest first) for charting
  storicoClassifica.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

  // Coerenza punti anagrafica: prediligi punteggio finale, poi punti categoria, poi ultimo rilevamento storico
  const ultimoSnapshot = storicoClassifica.length > 0 ? storicoClassifica[storicoClassifica.length - 1] : null;
  const puntiEffettivi = punteggioFinale || punti || (ultimoSnapshot ? ultimoSnapshot.punti : 0);

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
