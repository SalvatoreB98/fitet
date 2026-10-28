import * as cheerio from 'cheerio';

export interface RankingAthleteItem {
  rank: number;
  hasOfficialRank?: boolean;
  atletaId: string;
  nome: string;
  dataNascita: string;
  settore: string;
  punti: number;
  posNazOrVariazione: string;
  provinciaOrRegione: string;
  categoria: string;
}

export interface RankingPageResult {
  title: string;
  sesso: 'M' | 'F';
  isRegionale: boolean;
  comitId?: number;
  totalAthletes: number;
  totalPages: number;
  currentPage: number;
  athletes: RankingAthleteItem[];
  category?: string;
}

export function parseRankingHtml(
  html: string,
  sesso: 'M' | 'F' = 'M',
  currentPage = 1,
  comitId?: number,
  category?: string
): RankingPageResult {
  const $ = cheerio.load(html);

  // Extract header title e.g. "Classifica Generale maschile al 30/08/2026       (Atleti: 149)"
  const titleText = $('td.style2 p.titoli, p.titoli').first().text().replace(/\s+/g, ' ').trim();
  const titleClean = titleText.replace(/\(Atleti:.*?\)/i, '').trim();

  // Extract total athletes
  let totalAthletes = 0;
  const atletiMatch = titleText.match(/Atleti:\s*(\d+)/i);
  if (atletiMatch) {
    totalAthletes = parseInt(atletiMatch[1], 10);
  }

  // Extract total pages from pagination script if present
  let totalPages = 1;
  const scriptContent = $('script').text();
  const pagesMatch = scriptContent.match(/totalPages:\s*(\d+)/);
  if (pagesMatch) {
    totalPages = parseInt(pagesMatch[1], 10);
  } else if (totalAthletes > 0) {
    totalPages = Math.ceil(totalAthletes / 100);
  }

  const isRegionale = !!comitId && comitId > 0;
  const athletes: RankingAthleteItem[] = [];

  $('table tr').each((_, tr) => {
    const $tr = $(tr);
    // Ignore header rows
    if ($tr.find('td.style2, td.style1, th').length > 0) return;

    // Check if it has the athlete link with getScheda
    const athleteLink = $tr.find('a[onclick*="getScheda"]');
    if (athleteLink.length === 0) return;

    const athleteName = athleteLink.text().replace(/\s+/g, ' ').trim();
    const onclickAttr = athleteLink.attr('onclick') || '';
    const idMatch = onclickAttr.match(/getScheda\s*\(\s*(\d+)/);
    const atletaId = idMatch ? idMatch[1] : '';

    // Collect all table cells
    const cells: string[] = [];
    $tr.find('td').each((_, td) => {
      cells.push($(td).text().replace(/\s+/g, ' ').trim());
    });

    if (cells.length >= 7) {
      const rawRank = cells[0].replace(/\D/g, '');
      const parsedRank = rawRank ? parseInt(rawRank, 10) : undefined;
      const fallbackRank = (currentPage - 1) * 100 + athletes.length + 1;
      const rankNum = parsedRank !== undefined ? parsedRank : fallbackRank;
      const hasOfficialRank = parsedRank !== undefined;

      const dataNascita = cells[2] || '';
      const settore = cells[3] || '';
      const punti = parseFloat(cells[4].replace(',', '.')) || 0;
      const posNazOrVariazione = cells[5] || '';
      const provinciaOrRegione = cells[6] || '';
      const categoria = cells[7] || '';

      athletes.push({
        rank: rankNum,
        hasOfficialRank,
        atletaId,
        nome: athleteName,
        dataNascita,
        settore,
        punti,
        posNazOrVariazione,
        provinciaOrRegione,
        categoria,
      });
    }
  });

  if (totalAthletes === 0) {
    totalAthletes = athletes.length;
  }

  return {
    title: titleClean || 'Classifica Ufficiale FITeT',
    sesso,
    isRegionale,
    comitId,
    totalAthletes,
    totalPages: Math.max(totalPages, 1),
    currentPage,
    athletes,
    category,
  };
}
