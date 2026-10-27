import * as cheerio from 'cheerio';
import {
  TorneoItem,
  TorneoDettaglioResponse,
  TorneoGaraLink,
  TorneoIscrittoItem,
  TorneoMatchItem,
  TorneoGironeItem,
} from '../../src/types/fitet';

export const COMIT_NAMES: Record<number, string> = {
  1: "Valle d'Aosta",
  2: 'Piemonte',
  3: 'Liguria',
  4: 'Lombardia',
  5: 'Veneto',
  6: 'Trentino',
  7: 'Alto Adige',
  8: 'Friuli Venezia Giulia',
  9: 'Emilia Romagna',
  10: 'Toscana',
  11: 'Marche',
  12: 'Umbria',
  13: 'Lazio',
  14: 'Abruzzo',
  15: 'Molise',
  16: 'Campania',
  17: 'Basilicata',
  18: 'Puglia',
  19: 'Calabria',
  20: 'Sicilia',
  21: 'Sardegna',
  30: 'Nazionale',
};

function cleanText(raw: string): string {
  return (raw || '')
    .replace(/\u00a0/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lookupAthleteId(name: string, mapping?: Record<string, string>): string | null {
  if (!name || !mapping) return null;
  const upper = name.toUpperCase().replace(/\s+/g, ' ').trim();
  if (mapping[upper]) return mapping[upper];
  const noSpecial = upper.replace(/[^A-Z0-9 ]/g, '');
  if (mapping[noSpecial]) return mapping[noSpecial];
  return null;
}

/**
 * Parses `testa_tornei.php?TOR=...&COMIT=...&ID=...`
 * Extracts the official header title, with fallback if HTML structure changes.
 */
export function parseTestaTornei(html: string, fallbackTitle = 'TORNEI FITeT'): string {
  if (!html || !html.trim()) return fallbackTitle;
  const $ = cheerio.load(html);
  const stileText = cleanText($('p.stile, p, h1, h2, td').first().text());
  if (stileText && stileText.length > 2) {
    return stileText;
  }
  const bodyText = cleanText($('body').text());
  return bodyText.length > 2 ? bodyText : fallbackTitle;
}

export interface ParsedElencoTornei {
  regions: Array<{
    regId: number;
    name: string;
    tor: number;
    id: number;
    comit: number;
    href: string;
  }>;
  tornei: TorneoItem[];
}

/**
 * Parses `elenco_tornei.php`
 * Handles both:
 * 1) Regional selector bar (e.g. `elenco_tornei.php?TOR=0&COMIT=30&ID=36` -> links with `REG=...`)
 * 2) Actual tournament items (`visualizza_risultati.php?IDT=...` or `dati_sintetici.php?IDT=...`)
 * Includes resilient regex fallbacks if query param order or script names change.
 */
export function parseElencoTornei(
  html: string,
  defaultComit = 30,
  defaultTor = 0,
  defaultReg?: number,
  categoriaKey?: string,
  categoriaLabel?: string
): ParsedElencoTornei {
  const result: ParsedElencoTornei = {
    regions: [],
    tornei: [],
  };

  if (!html || !html.trim()) return result;
  const $ = cheerio.load(html);

  $('a[href]').each((_, el) => {
    const rawHref = ($(el).attr('href') || '').trim();
    if (!rawHref) return;

    const innerHtml = $(el).html() || '';
    const rawText = cleanText($(el).text());

    // Case 1: Sub-link to a region (e.g. elenco_tornei.php?REG=2&TOR=0&ID=36&COMIT=30)
    const regMatch = rawHref.match(/[?&]REG=(\d+)/i);
    if (/elenco_tornei\.php/i.test(rawHref) && regMatch) {
      const regId = parseInt(regMatch[1], 10);
      const torMatch = rawHref.match(/[?&]TOR=(\d+)/i);
      const idMatch = rawHref.match(/[?&]ID=(\d+)/i);
      const comitMatch = rawHref.match(/[?&]COMIT=(\d+)/i);

      if (regId > 0 && !result.regions.some((r) => r.regId === regId)) {
        result.regions.push({
          regId,
          name: COMIT_NAMES[regId] || rawText.replace(/-/g, ' ') || `Regione ${regId}`,
          tor: torMatch ? parseInt(torMatch[1], 10) : defaultTor,
          id: idMatch ? parseInt(idMatch[1], 10) : 0,
          comit: comitMatch ? parseInt(comitMatch[1], 10) : defaultComit,
          href: rawHref,
        });
      }
      return;
    }

    // Case 2: Tournament link (visualizza_risultati.php, dati_sintetici.php, or any link with IDT=...)
    const idtMatch = rawHref.match(/[?&]IDT=(\d+)/i);
    if (!idtMatch) return;

    const idt = parseInt(idtMatch[1], 10);
    const annoMatch = rawHref.match(/[?&]ANNO=(\d+)/i);
    const comMatch = rawHref.match(/[?&]COM(?:IT)?=(\d+)/i);
    const tipoMatch = rawHref.match(/[?&]TIPO=(\d+)/i);

    const anno = annoMatch ? parseInt(annoMatch[1], 10) : 41;
    const com = comMatch ? parseInt(comMatch[1], 10) : (defaultReg || defaultComit);
    const tipo = tipoMatch ? parseInt(tipoMatch[1], 10) : defaultTor;

    const isDisputato = /visualizza_risultati\.php/i.test(rawHref);
    const status: 'disputato' | 'in_programma' = isDisputato ? 'disputato' : 'in_programma';

    // Extract date and location from innerHTML (`04/09/2026<br>Sassari`) or text fallback
    let data = '';
    let luogo = '';

    const parts = innerHtml
      .split(/<br\s*\/?>/i)
      .map((p) => cleanText(cheerio.load(p).text()))
      .filter(Boolean);

    if (parts.length >= 2) {
      data = parts[0];
      luogo = parts.slice(1).join(' - ');
    } else {
      const dateRegex = rawText.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(.*)$/);
      if (dateRegex) {
        data = dateRegex[1];
        luogo = dateRegex[2].replace(/^[-–•\s]+/, '').trim() || 'Sede da definire';
      } else {
        luogo = rawText || `Torneo #${idt}`;
      }
    }

    const regIdResolved = defaultReg || (com >= 1 && com <= 21 ? com : undefined);
    const regioneResolved = regIdResolved ? COMIT_NAMES[regIdResolved] : COMIT_NAMES[com] || undefined;

    // Avoid exact duplicates within the same section
    if (!result.tornei.some((t) => t.idt === idt && t.com === com)) {
      result.tornei.push({
        idt,
        anno,
        com,
        tipo,
        data,
        luogo,
        regione: regioneResolved,
        regioneId: regIdResolved,
        status,
        href: rawHref.startsWith('http')
          ? rawHref
          : `https://portale.fitet.org/risultati/tornei/${rawHref.replace(/^\/+/, '')}`,
        categoriaKey,
        categoriaLabel,
      });
    }
  });

  return result;
}

/**
 * Dynamically extracts national tournament links from `https://portale.fitet.org/menu.php`
 * so if FITeT changes `ID=36` or `TOR=21` in future seasons, we automatically discover the new IDs!
 */
export function parseMenuManifestazioni(html: string): Array<{
  label: string;
  tor: number;
  comit: number;
  id: number;
}> {
  const discovered: Array<{ label: string; tor: number; comit: number; id: number }> = [];
  if (!html) return discovered;
  const $ = cheerio.load(html);

  $('a[href*="risultati_tornei.php"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const label = cleanText($(el).text());
    if (!label) return;

    const torMatch = href.match(/[?&]TOR=(\d+)/i);
    const comitMatch = href.match(/[?&]COMIT=(\d+)/i);
    const idMatch = href.match(/[?&]ID=(\d+)/i);

    const tor = torMatch ? parseInt(torMatch[1], 10) : 0;
    const comit = comitMatch ? parseInt(comitMatch[1], 10) : 30;
    const id = idMatch ? parseInt(idMatch[1], 10) : 0;

    if (!discovered.some((d) => d.tor === tor && d.comit === comit && d.id === id)) {
      discovered.push({ label, tor, comit, id });
    }
  });

  return discovered;
}

/**
 * Parses `elenco_gare.php` and/or `iscrizioni.php` for a single tournament (`IDT` + `COM`).
 * Uses dual-source fallback so whether a tournament is in_programma or disputato, all metadata is recovered.
 */
export function parseDettaglioTorneo(
  elencoGareHtml: string,
  iscrizioniHtml: string,
  idt: number,
  com: number,
  anno = 41
): TorneoDettaglioResponse {
  const gare: TorneoGaraLink[] = [];
  let titolo = '';
  let sottotitolo = '';
  let pdfSinteticoUrl: string | null = null;
  let tabelloniHomeUrl: string | null = null;
  let status: 'disputato' | 'in_programma' = 'in_programma';

  const extractFromHtml = (html: string, sourceMode: 'risultati' | 'iscrizioni') => {
    if (!html || !html.trim()) return;
    const $ = cheerio.load(html);

    // Bold header paragraphs at the top of elenco_gare.php / iscrizioni.php
    const headerParagraphs: string[] = [];
    $('body > p.dettagli, body > p').each((_, p) => {
      const txt = cleanText($(p).text());
      if (
        txt &&
        !/^risultati delle gare disputate$/i.test(txt) &&
        !/^gare in programma al torneo$/i.test(txt)
      ) {
        headerParagraphs.push(txt);
      }
    });

    if (!titolo && headerParagraphs.length >= 1) {
      titolo = headerParagraphs[0];
    }
    if (!sottotitolo && headerParagraphs.length >= 2) {
      sottotitolo = headerParagraphs[1];
    }

    $('a[href]').each((_, a) => {
      const href = ($(a).attr('href') || '').trim();
      const text = cleanText($(a).text());
      if (!href) return;

      // PDF Dati sintetici
      if (/\.pdf$/i.test(href) || /dati sintetici/i.test(text)) {
        if (!pdfSinteticoUrl) {
          pdfSinteticoUrl = href.startsWith('http')
            ? href
            : `https://portale.fitet.org/risultati/tornei/${href.replace(/^\/+/, '')}`;
        }
        return;
      }

      // Tabelloni finali HTML
      if (/_home\.html$/i.test(href) || /tabelloni finali/i.test(text)) {
        if (!tabelloniHomeUrl) {
          tabelloniHomeUrl = href.startsWith('http')
            ? href
            : `https://portale.fitet.org/risultati/tornei/${href.replace(/^\/+/, '')}`;
        }
        return;
      }

      // Gara link (visualizza.php, visualizza_doppio.php, iscrizioni_gara.php)
      const garaMatch = href.match(/[?&]GARA=([^&#\s]+)/i);
      if (garaMatch && text) {
        const garaId = garaMatch[1];
        const annoMatch = href.match(/[?&]ANNO=(\d+)/i);
        const isDoppio = /doppio/i.test(href) || /doppio/i.test(text);
        const linkMode: 'risultati' | 'iscrizioni' = /iscrizioni_gara\.php/i.test(href)
          ? 'iscrizioni'
          : sourceMode;

        if (linkMode === 'risultati') {
          status = 'disputato';
        }

        // Prefer 'risultati' over 'iscrizioni' if both exist
        const existingIdx = gare.findIndex((g) => g.garaId === garaId);
        const item: TorneoGaraLink = {
          garaId,
          nome: text,
          anno: annoMatch ? parseInt(annoMatch[1], 10) : anno,
          idt,
          com,
          isDoppio,
          mode: linkMode,
        };

        if (existingIdx === -1) {
          gare.push(item);
        } else if (gare[existingIdx].mode === 'iscrizioni' && linkMode === 'risultati') {
          gare[existingIdx] = item;
        }
      }
    });
  };

  // Parse elenco_gare first (played results), then iscrizioni (upcoming/registered) as fallback
  extractFromHtml(elencoGareHtml, 'risultati');
  extractFromHtml(iscrizioniHtml, 'iscrizioni');

  return {
    idt,
    com,
    anno,
    titolo: titolo || `Torneo FITeT #${idt}`,
    sottotitolo: sottotitolo || COMIT_NAMES[com] || '',
    status,
    pdfSinteticoUrl,
    tabelloniHomeUrl,
    gare,
  };
}

const STATUS_LABELS: Record<string, string> = {
  dettagli_diritto: 'Ammesso di diritto',
  dettagli_ammessi: 'Ammesso',
  dettagli_naz: 'Ammesso (Naz.)',
  dettagli_reg: 'Ammesso (Reg.)',
  dettagli_no_ammessi: 'Riserva / Non ammesso',
  dettagli_wd: 'Cancellato (WD)',
  dettagli_m: 'Maschile',
  dettagli_f: 'Femminile',
  dettagli: 'Iscritto',
};

/**
 * Parses `iscrizioni_gara.php?GARA=...&IDT=...&COM=...`
 */
export function parseIscrizioniGara(
  html: string,
  athleteMapping?: Record<string, string>
): {
  titoloGara: string;
  maxIscritti: string | null;
  iscritti: TorneoIscrittoItem[];
} {
  if (!html || !html.trim()) {
    return { titoloGara: '', maxIscritti: null, iscritti: [] };
  }

  const $ = cheerio.load(html);
  const rawHeader = cleanText($('p.dettagli b').first().text());
  const maxMatch = rawHeader.match(/\[max\.\s*(\d+)\]/i);
  const maxIscritti = maxMatch ? maxMatch[1] : null;
  const titoloGara = rawHeader
    .replace(/^Elenco atleti iscritti della gara\s*/i, '')
    .replace(/\[max\.\s*\d+\]/i, '')
    .trim();

  const iscritti: TorneoIscrittoItem[] = [];

  $('table tr').each((idx, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 5) return;

    const posText = cleanText($(tds[0]).text());
    const nameP = $(tds[1]).find('p').first();
    const nome = cleanText(nameP.length ? nameP.text() : $(tds[1]).text());
    if (!nome || /^nome atleta$/i.test(nome)) return;

    const statusClass = (nameP.attr('class') || 'dettagli').trim();
    const punti = cleanText($(tds[3]).text());
    const societa = cleanText($(tds[4]).text());
    const posizione = parseInt(posText, 10) || iscritti.length + 1;

    iscritti.push({
      posizione,
      nome,
      atletaId: lookupAthleteId(nome, athleteMapping),
      punti,
      societa,
      statusClass,
      statusLabel: STATUS_LABELS[statusClass] || 'Iscritto',
    });
  });

  return { titoloGara, maxIscritti, iscritti };
}

/**
 * Parses `gestione_gare_n.php` and `gestione_gare_doppio.php`
 * Extracts winner, winner photo/ID, qualification group ranges, and bracket rounds.
 */
export function parseGestioneGara(
  html: string,
  athleteMapping?: Record<string, string>
): {
  titoloGara: string;
  vincitore: string | null;
  vincitoreId: string | null;
  vincitoreFotoUrl: string | null;
  valoreRanking: string | null;
  gironiRanges: Array<{ cod1: number; cod2: number; label: string }>;
  turniTabellone: Array<{ tab: number; turno: number; label: string }>;
} {
  if (!html || !html.trim()) {
    return {
      titoloGara: '',
      vincitore: null,
      vincitoreId: null,
      vincitoreFotoUrl: null,
      valoreRanking: null,
      gironiRanges: [],
      turniTabellone: [],
    };
  }

  const $ = cheerio.load(html);
  let titoloGara = cleanText($('h5.card-title').first().text());
  if (!titoloGara) {
    titoloGara = cleanText($('font[color="#0000FF"]').first().text());
  }

  let vincitore: string | null = null;
  $('h5').each((_, h5) => {
    const txt = cleanText($(h5).text());
    const winMatch = txt.match(/1\^\s*classificato:\s*(.+)$/i);
    if (winMatch && winMatch[1].trim()) {
      vincitore = winMatch[1].trim();
    }
  });

  let vincitoreFotoUrl: string | null = null;
  let vincitoreId: string | null = null;
  const imgSrc = $('img[src*="images/atleti/"]').attr('src') || '';
  if (imgSrc) {
    const idMatch = imgSrc.match(/atleti\/(\d+)\.jpg/i);
    if (idMatch) {
      vincitoreId = idMatch[1];
      vincitoreFotoUrl = `https://portale.fitet.org/images/atleti/${vincitoreId}.jpg`;
    }
  }
  if (!vincitoreId && vincitore) {
    vincitoreId = lookupAthleteId(vincitore, athleteMapping);
  }

  let valoreRanking: string | null = null;
  const bodyText = cleanText($('body').text());
  const valMatch = bodyText.match(/valore della gara per ranking:\s*([^\)\s]+)/i);
  if (valMatch) {
    valoreRanking = valMatch[1].trim();
  }

  const gironiRanges: Array<{ cod1: number; cod2: number; label: string }> = [];
  $('a[href*="risultati.php"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const label = cleanText($(a).text());
    const c1 = href.match(/[?&]COD_1=(\d+)/i);
    const c2 = href.match(/[?&]COD_2=(\d+)/i);
    if (c1 && c2) {
      const cod1 = parseInt(c1[1], 10);
      const cod2 = parseInt(c2[1], 10);
      if (!gironiRanges.some((g) => g.cod1 === cod1 && g.cod2 === cod2)) {
        gironiRanges.push({ cod1, cod2, label: label || `${cod1} - ${cod2}` });
      }
    }
  });

  const turniTabellone: Array<{ tab: number; turno: number; label: string }> = [];
  const TURNO_NAMES: Record<number, string> = {
    9: 'Finale',
    8: 'Semifinali',
    7: 'Quarti di Finale',
    6: 'Ottavi di Finale',
    5: 'Sedicesimi',
    4: '32esimi',
    3: '64esimi',
    2: '128esimi',
  };

  $('area[href*="risultati_tabellone"], a[href*="risultati_tabellone"]').each((_, area) => {
    const href = $(area).attr('href') || '';
    const alt = cleanText($(area).attr('alt') || $(area).text() || '');
    const tabMatch = href.match(/[?&]TAB=(\d+)/i);
    const turnoMatch = href.match(/[?&]TURNO=(\d+)/i);
    if (turnoMatch) {
      const tab = tabMatch ? parseInt(tabMatch[1], 10) : 1;
      const turno = parseInt(turnoMatch[1], 10);
      const label = TURNO_NAMES[turno] || alt.replace(/\uFFFD/g, '°') || `Turno ${turno}`;
      if (!turniTabellone.some((t) => t.tab === tab && t.turno === turno)) {
        turniTabellone.push({ tab, turno, label });
      }
    }
  });

  // Sort rounds from Finale (9) down to early rounds
  turniTabellone.sort((a, b) => b.turno - a.turno);

  return {
    titoloGara,
    vincitore,
    vincitoreId,
    vincitoreFotoUrl,
    valoreRanking,
    gironiRanges,
    turniTabellone,
  };
}

/**
 * Helper to parse a 2-row match table from `risultati.php` or `risultati_tabellone.php`
 */
function parseMatchTable(
  $: cheerio.CheerioAPI,
  table: any,
  athleteMapping?: Record<string, string>
): TorneoMatchItem | null {
  const rows = $(table).find('tr');
  if (rows.length < 2) return null;

  const r1Tds = $(rows[0]).find('td');
  const r2Tds = $(rows[1]).find('td');
  if (r1Tds.length < 3 || r2Tds.length < 3) return null;

  const atleta1 = cleanText($(r1Tds[0]).find('p.dettagli').first().text());
  const societa1 = cleanText($(r1Tds[0]).find('p.soc').first().text());
  const atleta2 = cleanText($(r2Tds[0]).find('p.dettagli').first().text());
  const societa2 = cleanText($(r2Tds[0]).find('p.soc').first().text());

  if (!atleta1 && !atleta2) return null;

  const p1Points: number[] = [];
  $(rows[0])
    .find('p.punti')
    .each((_, p) => {
      p1Points.push(parseInt(cleanText($(p).text()), 10) || 0);
    });

  const p2Points: number[] = [];
  $(rows[1])
    .find('p.punti')
    .each((_, p) => {
      p2Points.push(parseInt(cleanText($(p).text()), 10) || 0);
    });

  const set1 = parseInt(cleanText($(rows[0]).find('p.set').first().text()), 10) || 0;
  const set2 = parseInt(cleanText($(rows[1]).find('p.set').first().text()), 10) || 0;

  const sets: Array<{ p1: number; p2: number }> = [];
  const maxLen = Math.min(p1Points.length, p2Points.length);
  for (let i = 0; i < maxLen; i++) {
    if (p1Points[i] > 0 || p2Points[i] > 0) {
      sets.push({ p1: p1Points[i], p2: p2Points[i] });
    }
  }

  let vincitore: 1 | 2 | null = null;
  if (set1 > set2) vincitore = 1;
  else if (set2 > set1) vincitore = 2;
  else {
    // Check rowspan=2 cell if winner is explicitly written (e.g. bye or walkover)
    const rowspanCell = $(rows[0]).find('td[rowspan="2"]');
    if (rowspanCell.length) {
      const winText = cleanText(rowspanCell.text()).toUpperCase();
      if (winText && atleta1 && winText === atleta1.toUpperCase()) vincitore = 1;
      else if (winText && atleta2 && winText === atleta2.toUpperCase()) vincitore = 2;
    }
  }

  return {
    atleta1,
    atleta1Id: lookupAthleteId(atleta1, athleteMapping),
    societa1,
    atleta2,
    atleta2Id: lookupAthleteId(atleta2, athleteMapping),
    societa2,
    set1,
    set2,
    sets,
    vincitore,
  };
}

/**
 * Parses `risultati.php?COD_1=...&COD_2=...&IDT=...&ANNO=...&GARA=...&COM=...`
 * Groups matches by Girone and computes the Girone Standings automatically.
 */
export function parseRisultatiGironi(
  html: string,
  athleteMapping?: Record<string, string>
): TorneoGironeItem[] {
  if (!html || !html.trim()) return [];
  const $ = cheerio.load(html);
  const gironiMap = new Map<string, TorneoMatchItem[]>();
  let currentGirone = '1';

  const container = $('div[align="left"]').first();
  const root = container.length ? container : $('body');

  root.children().each((_, el) => {
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'p') {
      const txt = cleanText($(el).text());
      const gMatch = txt.match(/Girone:\s*(\S+)/i);
      if (gMatch) {
        currentGirone = gMatch[1];
        if (!gironiMap.has(currentGirone)) {
          gironiMap.set(currentGirone, []);
        }
      }
    } else if (tag === 'table') {
      const match = parseMatchTable($, el, athleteMapping);
      if (match) {
        if (!gironiMap.has(currentGirone)) {
          gironiMap.set(currentGirone, []);
        }
        gironiMap.get(currentGirone)!.push(match);
      }
    }
  });

  const result: TorneoGironeItem[] = [];
  for (const [numero, partite] of gironiMap.entries()) {
    if (partite.length === 0) continue;

    // Compute standings for this girone
    const statsMap = new Map<
      string,
      {
        nome: string;
        atletaId?: string | null;
        societa: string;
        punti: number;
        giocate: number;
        vinte: number;
        perse: number;
        setVinti: number;
        setPersi: number;
      }
    >();

    const ensurePlayer = (nome: string, societa: string, atletaId?: string | null) => {
      if (!nome) return null;
      if (!statsMap.has(nome)) {
        statsMap.set(nome, {
          nome,
          atletaId,
          societa,
          punti: 0,
          giocate: 0,
          vinte: 0,
          perse: 0,
          setVinti: 0,
          setPersi: 0,
        });
      }
      return statsMap.get(nome)!;
    };

    for (const m of partite) {
      const p1 = ensurePlayer(m.atleta1, m.societa1, m.atleta1Id);
      const p2 = ensurePlayer(m.atleta2, m.societa2, m.atleta2Id);
      if (p1 && p2 && (m.set1 > 0 || m.set2 > 0 || m.vincitore !== null)) {
        p1.giocate += 1;
        p2.giocate += 1;
        p1.setVinti += m.set1;
        p1.setPersi += m.set2;
        p2.setVinti += m.set2;
        p2.setPersi += m.set1;

        if (m.vincitore === 1) {
          p1.vinte += 1;
          p1.punti += 2;
          p2.perse += 1;
          p2.punti += 1;
        } else if (m.vincitore === 2) {
          p2.vinte += 1;
          p2.punti += 2;
          p1.perse += 1;
          p1.punti += 1;
        }
      }
    }

    const classifica = Array.from(statsMap.values())
      .sort((a, b) => {
        if (b.punti !== a.punti) return b.punti - a.punti;
        const diffA = a.setVinti - a.setPersi;
        const diffB = b.setVinti - b.setPersi;
        if (diffB !== diffA) return diffB - diffA;
        return b.setVinti - a.setVinti;
      })
      .map((item, idx) => ({
        posizione: idx + 1,
        ...item,
      }));

    result.push({
      numero,
      partite,
      classifica,
    });
  }

  return result;
}

/**
 * Parses `risultati_tabellone.php` and `risultati_tabellone_doppio.php`
 */
export function parseRisultatiTabellone(
  html: string,
  athleteMapping?: Record<string, string>
): TorneoMatchItem[] {
  if (!html || !html.trim()) return [];
  const $ = cheerio.load(html);
  const matches: TorneoMatchItem[] = [];

  $('table[bgcolor="#EFEBCF"]').each((_, table) => {
    const m = parseMatchTable($, table, athleteMapping);
    if (m) matches.push(m);
  });

  return matches;
}
