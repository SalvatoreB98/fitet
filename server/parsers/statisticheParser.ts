import * as cheerio from 'cheerio';
import { StatisticaAtleta } from '../../src/types/fitet';

export function parseStatisticheAtleti(
  html: string,
  athleteMapping: Record<string, string> = {}
): StatisticaAtleta[] {
  const $ = cheerio.load(html);
  const atleti: StatisticaAtleta[] = [];

  $('table tr').each((_, row) => {
    const $row = $(row);
    const cells = $row.find('td');
    if (cells.length < 12) return;

    // Check if this is a data row (has player name, not header)
    const nomeText = $(cells[1]).text().trim().replace(/\s+/g, ' ');
    if (!nomeText || nomeText === 'Atleta' || nomeText.includes('S t a t i s t i c h e')) return;

    // Flag & country
    const flagImg = $(cells[0]).find('img').attr('src') || '';
    const flagMatch = flagImg.match(/bandiere\/([A-Za-z0-9_]+)\.png/i);
    const nazionalita = flagMatch ? flagMatch[1].toUpperCase() : 'IT';
    const bandieraUrl = flagImg.startsWith('http')
      ? flagImg
      : `https://portale.fitet.org/images/bandiere/${nazionalita}.png`;

    const squadra = $(cells[2]).text().trim().replace(/\s+/g, ' ');

    const getCellInt = (idx: number): number => {
      const text = $(cells[idx]).text().trim().replace(/\D+/g, '');
      return parseInt(text, 10) || 0;
    };

    const incontriDisputati = getCellInt(3);
    const partiteDisputate = getCellInt(4);
    const partiteVinte = getCellInt(5);
    const partitePerse = getCellInt(6);
    const setVinti = getCellInt(7);
    const setPersi = getCellInt(8);
    const puntiVinti = getCellInt(9);
    const puntiPersi = getCellInt(10);

    const percText = $(cells[11]).text().trim().replace('%', '');
    const percentualeVittorie = parseFloat(percText) || 0;

    // Find mapped athlete ID
    const athleteId = athleteMapping[nomeText] || athleteMapping[nomeText.toUpperCase()] || null;

    atleti.push({
      posizione: atleti.length + 1,
      nazionalita,
      bandieraUrl,
      atleta: nomeText,
      atletaId: athleteId,
      squadra,
      incontriDisputati,
      partiteDisputate,
      partiteVinte,
      partitePerse,
      setVinti,
      setPersi,
      puntiVinti,
      puntiPersi,
      percentualeVittorie,
    });
  });

  return atleti;
}
