import * as cheerio from 'cheerio';
import { DettaglioAtleta, StoricoRankingSnapshot } from '../../src/types/fitet';

export function parseDettaglioAtleta(html: string, atletaId: string): DettaglioAtleta {
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
  const regione = getFieldValue('Regione') || 'Calabria';

  const catRaw = getFieldValue('Categoria');
  // Example catRaw: "6^ (*)    punti 166,00"
  let categoria = catRaw;
  let punti = 0;
  const puntiMatch = catRaw.match(/punti\s*([\d\.,]+)/i);
  if (puntiMatch) {
    punti = parseFloat(puntiMatch[1].replace(',', '.')) || 0;
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
          puntiIniziali = parseFloat(initMatch[1].replace(',', '.')) || 0;
          puntiInizialiData = initMatch[2] || '';
        }

        puntiTotali = parseFloat($(dataCells[1]).text().trim().replace(',', '.')) || 0;
        punteggioFinale = parseFloat($(dataCells[2]).text().trim().replace(',', '.')) || punti;
        partiteGiocate = parseInt($(dataCells[3]).text().trim(), 10) || 0;
        partiteVinte = parseInt($(dataCells[4]).text().trim(), 10) || 0;
        partitePerse = parseInt($(dataCells[5]).text().trim(), 10) || 0;
        percentualePositiva = parseFloat($(dataCells[6]).text().trim().replace('%', '')) || 0;
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

    const ptText = $(cells[2]).text().trim().replace(',', '.');
    const pt = parseFloat(ptText) || 0;

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
      punti: punteggioFinale || punti,
      stato,
      recordClassifica,
    },
    riepilogo: {
      puntiIniziali,
      puntiInizialiData,
      puntiTotali,
      punteggioFinale: punteggioFinale || punti,
      partiteGiocate,
      partiteVinte,
      partitePerse,
      percentualePositiva,
    },
    storicoClassifica,
  };
}
