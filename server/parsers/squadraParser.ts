import * as cheerio from 'cheerio';
import { DettaglioSquadra, AtletaSquadraDettaglio } from '../../src/types/fitet';

export function parseDettaglioSquadra(
  html: string,
  squadraId: string,
  camId: number,
  logoUrl?: string
): DettaglioSquadra {
  const $ = cheerio.load(html);

  // Extract team name from table header
  const titleText = $('table tr:first-child').text().replace(/\s+/g, ' ').trim();
  const teamNameMatch = titleText.match(/Atleti della squadra:\s*(.+)$/i);
  const nome = teamNameMatch ? teamNameMatch[1].trim() : 'Squadra ' + squadraId;

  const atleti: AtletaSquadraDettaglio[] = [];

  $('table tr').each((_, row) => {
    const $row = $(row);
    const cells = $row.find('td');
    if (cells.length < 10) return;

    // Header row check
    const rowText = $row.text();
    if (rowText.includes('Atleta') && rowText.includes('PaV')) return;

    const athleteLink = $row.find('a[href*="dettaglio_percentuali.php"], a[href*="IDA="]');
    if (athleteLink.length === 0) return;

    const athleteName = athleteLink.text().replace(/\s+/g, ' ').trim();
    if (!athleteName) return;

    const href = athleteLink.attr('href') || '';
    const idaMatch = href.match(/IDA=(\d+)/i);
    const atletaId = idaMatch ? idaMatch[1] : '';

    const hasScheda = $row.find('a[onclick*="getScheda"]').length > 0;
    const isDoppio = !hasScheda && athleteName.includes(' - ');

    // Rank cell: e.g. "rank. 7643 (1226)" or "rank. (166)" or ""
    const rankText = $(cells[2]).text().replace(/\s+/g, ' ').trim();
    let rankPosizione: number | null = null;
    let rankPunti: number | null = null;

    const rankPosMatch = rankText.match(/rank\.\s*(\d+)/i);
    if (rankPosMatch) {
      rankPosizione = parseInt(rankPosMatch[1], 10);
    }

    const rankPuntiMatch = rankText.match(/\((\d+)\)/);
    if (rankPuntiMatch) {
      rankPunti = parseInt(rankPuntiMatch[1], 10);
    }

    const getInt = (cellIdx: number): number => {
      const val = $(cells[cellIdx]).text().trim().replace(/[^\d-]/g, '');
      return parseInt(val, 10) || 0;
    };

    const partiteDisputate = getInt(3);
    const partiteVinte = getInt(4);
    const partitePerse = getInt(5);
    const setVinti = getInt(6);
    const setPersi = getInt(7);
    const puntiVinti = getInt(8);
    const puntiPersi = getInt(9);
    const percentualeVittorie = getInt(10);

    atleti.push({
      atletaId,
      nome: athleteName,
      isDoppio,
      rankText,
      rankPosizione,
      rankPunti,
      partiteDisputate,
      partiteVinte,
      partitePerse,
      setVinti,
      setPersi,
      puntiVinti,
      puntiPersi,
      percentualeVittorie,
      fotoUrl: !isDoppio && atletaId ? `https://portale.fitet.org/images/atleti/${atletaId}.jpg` : null,
    });
  });

  return {
    squadraId,
    camId,
    nome,
    logoUrl,
    atleti,
  };
}
