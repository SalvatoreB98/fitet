import * as cheerio from 'cheerio';
import { HeadToHeadData, HeadToHeadIncontro } from '../../src/types/fitet';

/**
 * Parsa la pagina HTML generata da head_head.php (Testa a Testa tra due atleti)
 */
export function parseHeadToHead(
  html: string,
  atleta1Id: string,
  atleta2Id: string,
  fallbackAtleta1Nome?: string,
  fallbackAtleta2Nome?: string
): HeadToHeadData {
  const $ = cheerio.load(html);
  const rows = $('table tr');

  // Fallback defaults
  let atleta1Nome = fallbackAtleta1Nome || `Atleta ${atleta1Id}`;
  let atleta2Nome = fallbackAtleta2Nome || `Atleta ${atleta2Id}`;

  // Intestazione con i nomi degli atleti (prima riga)
  const nomi = $('p.nomi');
  if (nomi.length >= 2) {
    const n1 = $(nomi[0]).text().trim();
    const n2 = $(nomi[1]).text().trim();
    if (n1 && !n1.toLowerCase().includes('incontrati')) atleta1Nome = n1;
    if (n2 && !n2.toLowerCase().includes('incontrati')) atleta2Nome = n2;
  }

  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const target1 = norm(atleta1Nome);
  const target2 = norm(atleta2Nome);

  let v1 = 0;
  let v2 = 0;
  const incontri: HeadToHeadIncontro[] = [];

  // Scansiona le righe dati (dalla riga 2 in poi, saltando intestazioni)
  rows.slice(2).each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 5) return;

    const anno = $(tds[0]).text().trim();
    const data = $(tds[1]).text().trim();
    const gara = $(tds[2]).text().trim();
    const vincente = $(tds[3]).text().trim();

    if (!data || !data.includes('/')) return;

    // Colonne punteggio: td[4] = set vincente, td[5] = "-", td[6] = set perdente
    const sWin = parseInt($(tds[4]).text().trim(), 10) || 3;
    const sLose = parseInt($(tds[6]).text().trim(), 10) || 0;

    const vincenteNorm = norm(vincente);
    // Verifica se ha vinto atleta1 o atleta2
    const isV1 =
      vincenteNorm.includes(target1) ||
      target1.includes(vincenteNorm) ||
      (!vincenteNorm.includes(target2) && !target2.includes(vincenteNorm) && vincenteNorm.length > 0);

    if (isV1) {
      v1++;
    } else {
      v2++;
    }

    const setAtleta1 = isV1 ? sWin : sLose;
    const setAtleta2 = isV1 ? sLose : sWin;

    incontri.push({
      anno,
      data,
      gara,
      vincente,
      punteggio: `${setAtleta1} - ${setAtleta2}`,
      setAtleta1,
      setAtleta2,
      isVittoriaAtleta1: isV1,
    });
  });

  return {
    atleta1: {
      id: atleta1Id,
      nome: atleta1Nome,
      vittorie: v1,
      fotoUrl: `https://portale.fitet.org/images/atleti/${atleta1Id}.jpg`,
    },
    atleta2: {
      id: atleta2Id,
      nome: atleta2Nome,
      vittorie: v2,
      fotoUrl: `https://portale.fitet.org/images/atleti/${atleta2Id}.jpg`,
    },
    totaleIncontri: incontri.length,
    incontri,
  };
}
