import * as cheerio from 'cheerio';
import { formatSocietyName } from './textUtils';
import type {
  SocietaAtletaStagione,
  SocietaAtletaStorico,
  SocietaInfo,
  SocietaSquadraStagione,
  SocietaStagioneIndexItem,
  SocietaTitolo,
} from '../../src/types/fitet';

export interface ParsedDatiSquadra {
  teamName: string;
  info: SocietaInfo;
  formation: string[];
}

const PORTAL_BASE = 'https://portale.fitet.org';

const cleanText = (value?: string): string =>
  (value || '').replace(/\s+/g, ' ').trim();

const parseItalianNumber = (value?: string): number => {
  const cleaned = cleanText(value).replace(/[^\d,.-]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const parseIntSafe = (value?: string): number => {
  const num = parseInt(cleanText(value).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(num) ? num : 0;
};

const normalizeLogoUrl = (src?: string): string => {
  if (!src) return '';
  const clean = src.replace(/^(\.\.\/)+/, '').replace(/^\/+/, '');
  if (/^https?:\/\//i.test(clean)) return clean;
  return `${PORTAL_BASE}/${clean}`;
};

/**
 * Parses the official FITeT "DatiSquadra.asp" page.
 * It contains the society registry data (Albo Federale) and the team lineup.
 */
export function parseDatiSquadra(
  html: string,
  fallbackSquadraId = '',
  fallbackSocietyId = ''
): ParsedDatiSquadra {
  const $ = cheerio.load(html);

  const logoImg = $('img[src*="images/societa/"]').first();
  const logoUrl = normalizeLogoUrl(logoImg.attr('src'));

  const headerText = cleanText($('table').first().text());
  const teamNameMatch = headerText.match(
    /Scheda della squadra\s+(.+?)\s+Dati anagrafici della Societa/i
  );
  const teamName =
    cleanText(teamNameMatch?.[1]) ||
    cleanText($('table').first().find('p.stile').eq(1).text()) ||
    `Squadra ${fallbackSquadraId}`;

  let societyField = $('fieldset[name="societa"]').first();
  if (societyField.length === 0) {
    societyField = $('fieldset')
      .filter((_, el) => cleanText($(el).find('legend').text()).includes('Dati anagrafici'))
      .first();
  }

  const societyTables = societyField.find('table');
  const registryCells = societyTables.eq(0).find('tr').eq(1).find('td, th');
  const addressCells = societyTables.eq(1).find('tr').eq(1).find('td, th');
  const contactCells = societyTables.eq(2).find('tr').eq(1).find('td, th');

  const societyName = formatSocietyName(cleanText(registryCells.eq(0).text()));
  const alboFederale =
    cleanText(registryCells.eq(1).text()).match(/\d{2,6}/)?.[0] ||
    fallbackSocietyId ||
    logoUrl.match(/\/societa\/(\d+)\./i)?.[1] ||
    '';

  const primaAffiliazione = cleanText(registryCells.eq(2).text());

  const info: SocietaInfo = {
    societyId: alboFederale,
    nome: societyName || `Società #${alboFederale || fallbackSquadraId}`,
    logoUrl:
      logoUrl ||
      (alboFederale
        ? `${PORTAL_BASE}/images/societa/${alboFederale}.jpg`
        : `/generica.webp`),
    alboFederale,
    primaAffiliazione: primaAffiliazione || undefined,
    indirizzo: cleanText(addressCells.eq(0).text()) || undefined,
    cap: cleanText(addressCells.eq(1).text()) || undefined,
    citta: cleanText(addressCells.eq(2).text()) || undefined,
    provincia: cleanText(addressCells.eq(3).text()) || undefined,
    regione: cleanText(addressCells.eq(4).text()) || undefined,
    email: cleanText(contactCells.eq(2).text()) || undefined,
    sito: cleanText(contactCells.eq(3).text()) || undefined,
  };

  const formation: string[] = [];
  const formationField = $('fieldset[name="squadra"]').last();
  const formationTable = (formationField.length > 0 ? formationField : $('body'))
    .find('table')
    .last();
  formationTable.find('td').each((_, cell) => {
    const value = cleanText($(cell).text());
    if (value && /\([A-Z]{2,3}\)\s*$/.test(value)) {
      formation.push(value);
    }
  });

  return { teamName, info, formation };
}

/**
 * Parses the archive society page (scheda_dettaglio_soc.php?TEAM=...).
 * The page contains all seasons/championships, national/regional titles and
 * the all-time roster (Storico presenze).
 */
export function parseSocietaArchive(html: string): {
  stagioni: SocietaStagioneIndexItem[];
  atletiStorici: SocietaAtletaStorico[];
  titoliNazionali: SocietaTitolo[];
  titoliRegionali: SocietaTitolo[];
} {
  const stagioni: SocietaStagioneIndexItem[] = [];
  const championshipRegex =
    /<th\s+rowspan=["']?2["']?[^>]*>\s*<b>\s*(\d{4}\/\d{2})\s*<\/b>\s*<\/th>|Campionati\.asp\?CAMP=(\d+)&(?:amp;)?ANNATA=(\d+)[^>]*>([^<]+)<\/a>/gi;

  let seasonMatch: RegExpExecArray | null;
  let currentSeason: SocietaStagioneIndexItem | null = null;
  while ((seasonMatch = championshipRegex.exec(html)) !== null) {
    if (seasonMatch[1]) {
      currentSeason = {
        anno: 0,
        stagione: decodeHtmlEntities(seasonMatch[1]),
        campionati: [],
      };
      stagioni.push(currentSeason);
    } else if (currentSeason && seasonMatch[2] && seasonMatch[3]) {
      currentSeason.anno = parseInt(seasonMatch[3], 10) || currentSeason.anno;
      const nome = decodeHtmlEntities(cleanText(seasonMatch[4]));
      const campId = parseInt(seasonMatch[2], 10);
      if (campId && nome) {
        currentSeason.campionati.push({ campId, nome });
      }
    }
  }

  // Storico presenze: tessera, atleta, numero presenze.
  const atletiStorici: SocietaAtletaStorico[] = [];
  const presenzeStart = html.search(/id=["']presenze["']/i);
  const presenzeHtml = presenzeStart >= 0 ? html.slice(presenzeStart) : html;
  const presenzeRegex =
    /<tr[^>]*>\s*<td[^>]*>\s*<p[^>]*>\s*(\d{3,})\s*<\/p>\s*<\/td>\s*<td[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<\/td>\s*<td[^>]*>\s*<p[^>]*>\s*(\d+)\s*<\/p>\s*<\/td>\s*<\/tr>/gi;
  let presenzeMatch: RegExpExecArray | null;
  while ((presenzeMatch = presenzeRegex.exec(presenzeHtml)) !== null) {
    const nome = decodeHtmlEntities(cleanText(presenzeMatch[2]));
    if (!nome) continue;
    atletiStorici.push({
      tessera: presenzeMatch[1],
      nome,
      presenze: parseInt(presenzeMatch[3], 10) || 0,
      atletaId: null,
    });
  }

  return {
    stagioni,
    atletiStorici,
    titoliNazionali: parseTitles(html, 'nazionali', 'regionali'),
    titoliRegionali: parseTitles(html, 'regionali', 'presenze'),
  };
}

function parseTitles(html: string, fromId: string, toId: string): SocietaTitolo[] {
  const start = html.search(new RegExp(`id=["']${fromId}["']`, 'i'));
  if (start < 0) return [];
  const end = html.search(new RegExp(`id=["']${toId}["']`, 'i'));
  const section = html.slice(start, end > start ? end : undefined);
  const $ = cheerio.load(`<div>${section}</div>`);
  const titles: SocietaTitolo[] = [];

  $('tr').each((_, row) => {
    const cells = $(row)
      .find('td')
      .map((__, cell) => cleanText($(cell).text()))
      .get()
      .filter(Boolean);

    if (cells.length < 4) return;
    if (/stagione/i.test(cells[0]) || /torneo/i.test(cells[0])) return;

    titles.push({
      stagione: cells[0],
      torneo: cells[1],
      gara: cells[2],
      dettaglio: cells[3],
    });
  });

  return titles;
}

/**
 * Parses the archive championship table (ClassificaSquadre.asp?CAMP=...&ANNATA=...).
 * Returns every team with position, points and the full score breakdown.
 */
export function parseSocietaClassificaArchive(html: string): SocietaSquadraStagione[] {
  const $ = cheerio.load(html);
  const squadre: SocietaSquadraStagione[] = [];

  $('a[href*="Percentuali.asp?SQUADRA="]').each((_, link) => {
    const href = $(link).attr('href') || '';
    const squadraId = href.match(/SQUADRA=(\d+)/i)?.[1] || '';
    const nome = cleanText($(link).text());
    if (!squadraId || !nome) return;

    const row = $(link).closest('tr');
    const cells = row.find('td');
    if (cells.length < 14) return;

    squadre.push({
      squadraId,
      nome,
      posizione: squadre.length + 1,
      punti: parseIntSafe($(cells[2]).text()),
      incontriDisputati: parseIntSafe($(cells[3]).text()),
      incontriVinti: parseIntSafe($(cells[4]).text()),
      incontriPareggiati: parseIntSafe($(cells[5]).text()),
      incontriPersi: parseIntSafe($(cells[6]).text()),
      partiteVinte: parseIntSafe($(cells[7]).text()),
      partitePerse: parseIntSafe($(cells[8]).text()),
      setVinti: parseIntSafe($(cells[9]).text()),
      setPersi: parseIntSafe($(cells[10]).text()),
      puntiVinti: parseIntSafe($(cells[11]).text()),
      puntiPersi: parseIntSafe($(cells[12]).text()),
      penalizzazioni: parseIntSafe($(cells[13]).text()),
      atleti: [],
    });
  });

  return squadre;
}

/**
 * Parses the archive roster page (Percentuali.asp?SQUADRA=...&CAMP=...&ANNATA=...).
 * The archive page has no live ranking points, but includes V/S, sets, points and %.
 */
export function parseSocietaRosterArchive(
  html: string,
  squadraId: string,
  squadraNome: string
): SocietaAtletaStagione[] {
  const $ = cheerio.load(html);
  const atleti: SocietaAtletaStagione[] = [];

  $('a[href*="DettaglioPercentuali.asp?IDA="]').each((_, link) => {
    const href = $(link).attr('href') || '';
    const atletaId = href.match(/IDA=(\d+)/i)?.[1] || null;
    const nome = cleanText($(link).text());
    if (!nome) return;

    const row = $(link).closest('tr');
    const cells = row.find('td');
    if (cells.length < 9) return;

    const isDoppio = nome.includes(' - ');
    const partiteDisputate = parseIntSafe($(cells[1]).text());
    const partiteVinte = parseIntSafe($(cells[2]).text());
    const partitePerse = parseIntSafe($(cells[3]).text());

    atleti.push({
      atletaId: isDoppio ? null : atletaId,
      nome,
      isDoppio,
      squadraId,
      squadraNome,
      rankPosizione: null,
      rankPunti: null,
      partiteDisputate,
      partiteVinte,
      partitePerse,
      setVinti: parseIntSafe($(cells[4]).text()),
      setPersi: parseIntSafe($(cells[5]).text()),
      puntiVinti: parseIntSafe($(cells[6]).text()),
      puntiPersi: parseIntSafe($(cells[7]).text()),
      percentualeVittorie: parseItalianNumber($(cells[8]).text()),
    });
  });

  return atleti;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&ograve;/gi, 'ò')
    .replace(/&agrave;/gi, 'à')
    .replace(/&egrave;/gi, 'è')
    .replace(/&igrave;/gi, 'ì')
    .replace(/&ugrave;/gi, 'ù')
    .replace(/&Ograve;/gi, 'Ò')
    .replace(/&Agrave;/gi, 'À')
    .replace(/&Egrave;/gi, 'È')
    .replace(/&Igrave;/gi, 'Ì')
    .replace(/&Ugrave;/gi, 'Ù');
}
