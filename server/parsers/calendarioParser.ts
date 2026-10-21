import * as cheerio from 'cheerio';
import { GiornataCalendario, PartitaCalendario } from '../../src/types/fitet';

export function parseCalendario(html: string): GiornataCalendario[] {
  const $ = cheerio.load(html);
  const giornate: GiornataCalendario[] = [];

  $('table').each((_, table) => {
    const $table = $(table);
    const tableText = $table.text();
    const giornataMatch = tableText.match(/(\d+)\^\s*Giornata/i);
    if (!giornataMatch) return;

    const numGiornata = parseInt(giornataMatch[1], 10);
    const titolo = `${numGiornata}^ Giornata`;

    const partiteAndata: PartitaCalendario[] = [];
    const partiteRitorno: PartitaCalendario[] = [];

    $table.find('tr').each((rowIdx, row) => {
      const $row = $(row);
      const cells = $row.find('td');
      if (cells.length !== 8) return;

      const dataAndata = $(cells[0]).text().trim();
      // Skip empty or spacer rows (check if dataAndata has date format DD/MM/YYYY)
      if (!dataAndata.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) return;

      const oraAndata = $(cells[1]).text().trim();
      const $risAndataCell = $(cells[2]);
      const risAndataText = $risAndataCell.text().trim();
      const casaAndata = $(cells[3]).text().trim().replace(/\s+/g, ' ');
      const ospiteAndata = $(cells[4]).text().trim().replace(/\s+/g, ' ');

      const $risRitornoCell = $(cells[5]);
      const risRitornoText = $risRitornoCell.text().trim();
      const oraRitorno = $(cells[6]).text().trim();
      const dataRitorno = $(cells[7]).text().trim();

      // Extract match info helper
      const parseMatch = (
        tipo: 'andata' | 'ritorno',
        data: string,
        ora: string,
        casa: string,
        ospite: string,
        $cell: cheerio.Cheerio<any>,
        rawRis: string,
        matchIdx: number
      ): PartitaCalendario => {
        const link = $cell.find('a[href]').attr('href') || null;
        let incontroId: string | null = null;
        let formula: number | undefined = undefined;
        if (link) {
          const m = link.match(/INCONTRO=(\d+)/i);
          if (m) incontroId = m[1];
          const f = link.match(/FORMULA=(\d+)/i);
          if (f) formula = parseInt(f[1], 10);
        }

        const scoreMatch = rawRis.match(/(\d+)\s*[-:]\s*(\d+)/);
        const disputato = Boolean(scoreMatch);
        const puntiCasa = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
        const puntiOspite = scoreMatch ? parseInt(scoreMatch[2], 10) : null;

        let vincitore: 'casa' | 'ospite' | 'pareggio' | null = null;
        if (disputato && puntiCasa !== null && puntiOspite !== null) {
          if (puntiCasa > puntiOspite) vincitore = 'casa';
          else if (puntiOspite > puntiCasa) vincitore = 'ospite';
          else vincitore = 'pareggio';
        }

        const fullRefertoUrl = link
          ? link.startsWith('http')
            ? link
            : `https://portale.fitet.org/risultati/campionati/${link}`
          : null;

        return {
          id: `g${numGiornata}_${tipo}_${matchIdx}_${incontroId || 'nomatch'}`,
          giornata: numGiornata,
          tipo,
          data,
          ora,
          squadraCasa: casa,
          squadraOspite: ospite,
          risultato: disputato ? `${puntiCasa} - ${puntiOspite}` : '-',
          puntiCasa,
          puntiOspite,
          disputato,
          refertoUrl: fullRefertoUrl,
          incontroId,
          vincitore,
          formula,
        };
      };

      // Andata match
      partiteAndata.push(
        parseMatch('andata', dataAndata, oraAndata, casaAndata, ospiteAndata, $risAndataCell, risAndataText, rowIdx)
      );

      // Ritorno match (reversed home/away)
      partiteRitorno.push(
        parseMatch('ritorno', dataRitorno, oraRitorno, ospiteAndata, casaAndata, $risRitornoCell, risRitornoText, rowIdx)
      );
    });

    if (partiteAndata.length > 0 || partiteRitorno.length > 0) {
      giornate.push({
        numero: numGiornata,
        titolo,
        partiteAndata,
        partiteRitorno,
      });
    }
  });

  return giornate.sort((a, b) => a.numero - b.numero);
}
