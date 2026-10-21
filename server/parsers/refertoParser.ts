import * as cheerio from 'cheerio';
import { RefertoIncontro, PartitaRefertoIndividuale, DettaglioPartitaIndividuale, SetScore } from '../../src/types/fitet';

function resolveFitetUrl(src?: string): string | undefined {
  if (!src) return undefined;
  if (src.startsWith('http')) return src;
  const clean = src.replace(/^(\.\.\/)+/, '');
  return `https://portale.fitet.org/${clean}`;
}

/**
 * Parser per la pagina referto incontro FITeT:
 * giornata.php?INCONTRO=...&CAM=...&FORMULA=...
 */
export function parseRefertoIncontro(
  html: string,
  incontroId: string,
  camId?: string,
  formulaId?: string
): RefertoIncontro {
  const $ = cheerio.load(html);

  // 1. Squadre
  const $incontri = $('p.incontro');
  let casaNome = '';
  let ospiteNome = '';

  if ($incontri.length >= 2) {
    casaNome = $($incontri[0]).text().replace(/\s+/g, ' ').trim();
    ospiteNome = $($incontri[1]).text().replace(/\s+/g, ' ').trim();
  }

  // Fallback squadre da intestazione tabella partite
  if (!casaNome || !ospiteNome) {
    const $schede = $('p.titolo_scheda');
    if ($schede.length >= 2) {
      if (!casaNome) casaNome = $($schede[0]).text().replace(/\s+/g, ' ').trim();
      if (!ospiteNome) ospiteNome = $($schede[1]).text().replace(/\s+/g, ' ').trim();
    }
  }

  // 2. Loghi Società
  const $immagini = $('img[src*="/societa/"], img.immagine');
  const logoCasa = resolveFitetUrl($($immagini[0]).attr('src'));
  const logoOspite = resolveFitetUrl($($immagini[1]).attr('src'));

  // 3. Risultato complessivo, Set e Punti
  let puntiCasa = 0;
  let puntiOspite = 0;
  let setTotaliCasa = 0;
  let setTotaliOspite = 0;
  let puntiTotaliCasa = 0;
  let puntiTotaliOspite = 0;

  // Cerchiamo la tabella grigia centrale con il punteggio (bgcolor="#DCDCDC")
  const $scoreTable = $('table[bgcolor="#DCDCDC"], table[bgcolor="#dcdcdc"]').first();
  if ($scoreTable.length > 0) {
    $scoreTable.find('tr').each((_, tr) => {
      const $tr = $(tr);
      const text = $tr.text().toUpperCase();
      const cells = $tr.find('td');

      if (cells.length >= 3) {
        if (text.includes(':') && (text.includes('0') || text.includes('1') || text.includes('2') || text.includes('3') || text.includes('4') || text.includes('5') || text.includes('6') || text.includes('7'))) {
          // Punteggio finale incontro
          const c = parseInt($(cells[0]).text().trim(), 10);
          const o = parseInt($(cells[2]).text().trim(), 10);
          if (!isNaN(c)) puntiCasa = c;
          if (!isNaN(o)) puntiOspite = o;
        } else if (text.includes('SET')) {
          const c = parseInt($(cells[0]).text().trim(), 10);
          const o = parseInt($(cells[2]).text().trim(), 10);
          if (!isNaN(c)) setTotaliCasa = c;
          if (!isNaN(o)) setTotaliOspite = o;
        } else if (text.includes('PUNTI')) {
          const c = parseInt($(cells[0]).text().trim(), 10);
          const o = parseInt($(cells[2]).text().trim(), 10);
          if (!isNaN(c)) puntiTotaliCasa = c;
          if (!isNaN(o)) puntiTotaliOspite = o;
        }
      }
    });
  }

  // 4. Meta: Giornata, Arbitro, Campo Gara
  let giornata = '';
  let arbitro: string | undefined;
  let campoGara: string | undefined;

  const bodyText = $('body').text().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
  const gMatch = bodyText.match(/(\d+\^\s*Giornata(?:\s*del\s*[\d\/]+)?)/i);
  if (gMatch) giornata = gMatch[1].trim();

  const arbMatch = bodyText.match(/Arbitro:\s*([A-Za-z\s'\.]+?)(?=\s*(?:Campo|Palestra|Societ|Contrada|$))/i);
  if (arbMatch) {
    arbitro = arbMatch[1].trim();
  } else {
    const fallbackArb = bodyText.match(/Arbitro:\s*([^\s]+(?:\s+[^\s]+){1,3})/i);
    if (fallbackArb) arbitro = fallbackArb[1].trim();
  }

  const $campoGara = $('p.campo_gara');
  if ($campoGara.length > 0) {
    campoGara = $campoGara
      .html()
      ?.replace(/<br\s*[\/]?>/gi, ' - ')
      ?.replace(/<[^>]+>/g, '')
      ?.replace(/Campo gara principale:\s*/i, '')
      ?.replace(/\u00a0/g, ' ')
      ?.replace(/\s+/g, ' ')
      ?.trim()
      ?.replace(/^[\s\-]+/, '');
  }

  // 5. Partite individuali (Singoli / Doppi)
  const partite: PartitaRefertoIndividuale[] = [];

  // Cerchiamo tutte le righe contenenti il link a dettaglio_partita.php
  $('tr').each((rowIdx, tr) => {
    const $tr = $(tr);
    const link = $tr.find('a[href*="dettaglio_partita.php"]');
    if (link.length === 0) return;

    const cells = $tr.find('td');
    if (cells.length < 14) return;

    const href = link.attr('href') || '';
    const idMatch = href.match(/ID=(\d+)/i);
    const partitaId = idMatch ? idMatch[1] : `match_${rowIdx}`;
    const num = parseInt(link.text().trim(), 10) || partite.length + 1;

    // Atleta Casa
    const $cellCasa = $(cells[1]);
    const atletaCasa = $cellCasa.text().replace(/\s+/g, ' ').trim();
    const isCasaWinner = $cellCasa.find('b').length > 0;

    // Atleta Ospite
    const $cellOspite = $(cells[2]);
    const atletaOspite = $cellOspite.text().replace(/\s+/g, ' ').trim();
    const isOspiteWinner = $cellOspite.find('b').length > 0;

    // Set parziali (5 set previsti, 2 colonne per set)
    const sets: SetScore[] = [];
    for (let s = 0; s < 5; s++) {
      const idxCasa = 3 + s * 2;
      const idxOspite = 4 + s * 2;
      if (idxOspite < cells.length) {
        const pCasa = parseInt($(cells[idxCasa]).text().trim(), 10);
        const pOspite = parseInt($(cells[idxOspite]).text().trim(), 10);
        if (!isNaN(pCasa) && !isNaN(pOspite) && (pCasa > 0 || pOspite > 0)) {
          sets.push({
            setNumero: s + 1,
            puntiCasa: pCasa,
            puntiOspite: pOspite,
          });
        }
      }
    }

    // SV e SP
    const sv = parseInt($(cells[13]).text().trim(), 10) || 0;
    const sp = parseInt($(cells[14]).text().trim(), 10) || 0;

    partite.push({
      id: partitaId,
      numero: num,
      atletaCasa,
      atletaOspite,
      isCasaWinner,
      isOspiteWinner,
      sets,
      setVintiCasa: sv,
      setVintiOspite: sp,
    });
  });

  return {
    incontroId,
    camId,
    formulaId,
    giornata: giornata || 'Referto di Gara',
    arbitro,
    campoGara,
    squadraCasa: {
      nome: casaNome || 'Squadra Casa',
      logoUrl: logoCasa,
      punti: puntiCasa,
      setTotali: setTotaliCasa,
      puntiTotali: puntiTotaliCasa,
    },
    squadraOspite: {
      nome: ospiteNome || 'Squadra Ospite',
      logoUrl: logoOspite,
      punti: puntiOspite,
      setTotali: setTotaliOspite,
      puntiTotali: puntiTotaliOspite,
    },
    partite,
  };
}

/**
 * Parser per la pagina di dettaglio singolo incontro individuale:
 * dettaglio_partita.php?ID=...
 */
export function parseDettaglioPartita(html: string, partitaId: string): DettaglioPartitaIndividuale {
  const $ = cheerio.load(html);

  // Trova le righe della tabella principale del dettaglio (larghezza 716px o contenente p.titolo)
  const rows = $('table[width="716"] > tr, table[width="716"] > tbody > tr');
  let headerRow = rows.eq(0);
  let detailRow = rows.eq(1);

  if (rows.length === 0) {
    headerRow = $('tr').filter((_, tr) => $(tr).find('> td').length === 3 && $(tr).find('p.titolo').length > 0).first();
    detailRow = headerRow.next('tr');
  }

  const headerTds = headerRow.find('> td');
  let atletaCasaNome = '';
  let atletaOspiteNome = '';
  let risultatoSet = '';

  if (headerTds.length >= 3) {
    // Nomi atleti Casa (possono essere 2 nel doppio)
    const casaTitoli: string[] = [];
    headerTds.eq(0).find('p.titolo').each((_, p) => {
      const t = $(p).text().replace(/\s+/g, ' ').trim();
      if (t) casaTitoli.push(t);
    });
    atletaCasaNome = casaTitoli.join(' - ');

    // Risultato set (colonna centrale)
    risultatoSet = headerTds.eq(1).find('p.titolo').first().text().replace(/\s+/g, ' ').trim();

    // Nomi atleti Ospite (possono essere 2 nel doppio)
    const ospiteTitoli: string[] = [];
    headerTds.eq(2).find('p.titolo').each((_, p) => {
      const t = $(p).text().replace(/\s+/g, ' ').trim();
      if (t) ospiteTitoli.push(t);
    });
    atletaOspiteNome = ospiteTitoli.join(' - ');
  } else {
    // Fallback di sicurezza
    const $titoli = $('p.titolo');
    if ($titoli.length >= 3) {
      atletaCasaNome = $($titoli[0]).text().replace(/\s+/g, ' ').trim();
      risultatoSet = $($titoli[1]).text().replace(/\s+/g, ' ').trim();
      atletaOspiteNome = $($titoli[2]).text().replace(/\s+/g, ' ').trim();
    }
  }

  // Bandiere
  const flagCasa = resolveFitetUrl(headerTds.eq(0).find('img[src*="/bandiere/"]').attr('src'));
  const flagOspite = resolveFitetUrl(headerTds.eq(2).find('img[src*="/bandiere/"]').attr('src'));

  // Foto Atleti & IDs dalle rispettive celle della riga di dettaglio
  const detailTds = detailRow.find('> td');
  let fotoCasa: string | undefined;
  let fotoOspite: string | undefined;
  let atletaCasaId: string | undefined;
  let atletaOspiteId: string | undefined;

  if (detailTds.length >= 3) {
    // Cella 0: Atleta/i Casa
    detailTds.eq(0).find('img').each((_, img) => {
      const src = $(img).attr('src') || '';
      const m = src.match(/atleti\/(\d+)\.jpg/i);
      if (m && !atletaCasaId) {
        atletaCasaId = m[1];
        fotoCasa = resolveFitetUrl(src);
      } else if (src.includes('atleti/') && !src.includes('-vuoto') && !fotoCasa) {
        fotoCasa = resolveFitetUrl(src);
      }
    });

    // Cella 2: Atleta/i Ospite
    detailTds.eq(2).find('img').each((_, img) => {
      const src = $(img).attr('src') || '';
      const m = src.match(/atleti\/(\d+)\.jpg/i);
      if (m && !atletaOspiteId) {
        atletaOspiteId = m[1];
        fotoOspite = resolveFitetUrl(src);
      } else if (src.includes('atleti/') && !src.includes('-vuoto') && !fotoOspite) {
        fotoOspite = resolveFitetUrl(src);
      }
    });
  }

  // Tabella parziali set
  const sets: Array<{ setNumero: number; puntiCasa: number; puntiOspite: number }> = [];
  let puntiTotali = '';

  $('table table tr').each((_, tr) => {
    const $tr = $(tr);
    const tds = $tr.find('td');
    if (tds.length === 3) {
      const label = $(tds[1]).text().trim();
      const pCasa = parseInt($(tds[0]).text().trim(), 10);
      const pOspite = parseInt($(tds[2]).text().trim(), 10);

      if (label.includes('set')) {
        const setNum = parseInt(label.replace(/\D/g, ''), 10) || sets.length + 1;
        if (!isNaN(pCasa) && !isNaN(pOspite) && (pCasa > 0 || pOspite > 0)) {
          sets.push({
            setNumero: setNum,
            puntiCasa: pCasa,
            puntiOspite: pOspite,
          });
        }
      }
    } else if (tds.length === 1) {
      const totText = $(tds[0]).text().replace(/\s+/g, ' ').trim();
      if (totText.includes(':')) {
        puntiTotali = totText;
      }
    }
  });

  return {
    id: partitaId,
    atletaCasa: {
      nome: atletaCasaNome,
      bandieraUrl: flagCasa,
      fotoUrl: fotoCasa,
      atletaId: atletaCasaId,
    },
    atletaOspite: {
      nome: atletaOspiteNome,
      bandieraUrl: flagOspite,
      fotoUrl: fotoOspite,
      atletaId: atletaOspiteId,
    },
    risultatoSet,
    puntiTotali,
    sets,
  };
}
