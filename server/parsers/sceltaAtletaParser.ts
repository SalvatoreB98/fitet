import * as cheerio from 'cheerio';

export interface SceltaAtletaItem {
  id: string;
  nome: string;
  dataNascita: string | null;
}

/**
 * Parsa la pagina restituita da scelta_atleta.php.
 * La FITeT espone un link head_head.php per ogni atleta selezionabile.
 */
export function parseSceltaAtleta(html: string): SceltaAtletaItem[] {
  if (!html) return [];

  const $ = cheerio.load(html);
  const results: SceltaAtletaItem[] = [];
  const seen = new Set<string>();

  $('a[href*="head_head.php"]').each((_, element) => {
    const href = $(element).attr('href') || '';
    const idMatch = href.match(/[?&]AVVERSARIO=(\d+)/i);
    if (!idMatch) return;

    const id = idMatch[1];
    if (!id || seen.has(id)) return;

    const nome = $(element).text().replace(/\s+/g, ' ').trim();
    if (!nome) return;

    const dateText = $(element).closest('tr').find('td').last().text().trim();
    const dateMatch = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    seen.add(id);
    results.push({
      id,
      nome,
      dataNascita: dateMatch ? `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}` : null,
    });
  });

  return results;
}
