import * as cheerio from 'cheerio';
import { SquadraClassifica } from '../../src/types/fitet';

export function parseClassifica(html: string): SquadraClassifica[] {
  const $ = cheerio.load(html);
  const squadre: SquadraClassifica[] = [];

  $('table tr').each((_, row) => {
    const $row = $(row);
    // Find team link to verify this is a team row
    const teamLink = $row.find('a[href*="percentuali.php"]');
    if (teamLink.length === 0) return;

    const href = teamLink.attr('href') || '';
    const squadraIdMatch = href.match(/SQUADRA=(\d+)/i);
    const squadraId = squadraIdMatch ? squadraIdMatch[1] : '';
    const nome = teamLink.text().replace(/\s+/g, ' ').trim();

    const cells = $row.find('td');
    if (cells.length < 14) return;

    // Helper to safely extract integer from cell
    const getCellInt = (idx: number): number => {
      const text = $(cells[idx]).text().trim().replace(/\D+/g, '');
      return parseInt(text, 10) || 0;
    };

    const punti = getCellInt(2);
    const incontriDisputati = getCellInt(3);
    const incontriVinti = getCellInt(4);
    const incontriPareggiati = getCellInt(5);
    const incontriPersi = getCellInt(6);
    const partiteVinte = getCellInt(7);
    const partitePerse = getCellInt(8);
    const setVinti = getCellInt(9);
    const setPersi = getCellInt(10);
    const puntiVinti = getCellInt(11);
    const puntiPersi = getCellInt(12);
    const penalizzazioni = getCellInt(13);

    squadre.push({
      posizione: 0, // Calculated after sorting
      squadraId,
      nome,
      punti,
      incontriDisputati,
      incontriVinti,
      incontriPareggiati,
      incontriPersi,
      partiteVinte,
      partitePerse,
      diffPartite: partiteVinte - partitePerse,
      setVinti,
      setPersi,
      diffSet: setVinti - setPersi,
      puntiVinti,
      puntiPersi,
      diffPunti: puntiVinti - puntiPersi,
      penalizzazioni,
      isPromozione: false,
      isPlayoff: false,
      isRetrocessione: false,
      forma: [],
    });
  });

  // Assign position and flags
  squadre.forEach((sq, idx) => {
    sq.posizione = idx + 1;
    if (idx === 0) {
      sq.isPromozione = true; // 1st place promotion
    } else if (idx === 1) {
      sq.isPlayoff = true; // 2nd place playoff
    } else if (idx >= squadre.length - 2 && squadre.length > 4) {
      sq.isRetrocessione = true; // Bottom 2
    }
  });

  return squadre;
}
