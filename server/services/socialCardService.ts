import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';
import type { DettaglioAtleta, PartitaCampionatoAtleta } from '../../src/types/fitet';
import { aggregateAthleteMatchStats, type AthleteFormBadge } from '../../src/utils/aggregateAthleteStats';

/**
 * Risolve il percorso del font TTF (Inter) incluso nel bundle del server.
 * Indispensabile in ambienti serverless (AWS Lambda / Vercel) dove non sono installati font di sistema.
 */
function getBundledFontPath(): string | null {
  const currentDir = typeof __dirname !== 'undefined'
    ? __dirname
    : typeof import.meta?.url === 'string'
      ? path.dirname(fileURLToPath(import.meta.url))
      : process.cwd();

  const candidates = [
    path.resolve(process.cwd(), 'server', 'assets', 'fonts', 'Inter-Variable.ttf'),
    path.resolve(currentDir, 'assets', 'fonts', 'Inter-Variable.ttf'),
    path.resolve(currentDir, '..', 'assets', 'fonts', 'Inter-Variable.ttf'),
    path.resolve(currentDir, '..', 'server', 'assets', 'fonts', 'Inter-Variable.ttf'),
    path.resolve(process.cwd(), 'api', 'server', 'assets', 'fonts', 'Inter-Variable.ttf'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getResvgOptions(width: number) {
  const fontPath = getBundledFontPath();
  const fontFiles = fontPath ? [fontPath] : [];

  return {
    fitTo: { mode: 'width' as const, value: width },
    font: {
      loadSystemFonts: false,
      fontFiles,
      defaultFontFamily: 'Inter',
      sansSerifFamily: 'Inter',
    },
  };
}

/**
 * Utility per fare il fetch di un'immagine e convertirla in Data URL base64.
 * Utile per incorporare avatar/foto all'interno dell'SVG per la rasterizzazione Resvg.
 */
async function fetchImageAsBase64(url?: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Sanitizza le stringhe per l'inclusione sicura in XML/SVG.
 */
function escapeXml(unsafe?: string | number | null): string {
  if (unsafe === undefined || unsafe === null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Estrae le metriche salienti dell'atleta per la generazione card.
 */
function extractAthleteMetrics(athlete: DettaglioAtleta) {
  const name = athlete.anagrafica?.nome?.trim() || `Atleta #${athlete.id}`;
  const club = athlete.anagrafica?.societa?.trim() || 'Tesserato FITeT';
  const category = athlete.anagrafica?.categoria?.trim() || '';
  const sector = athlete.anagrafica?.settore?.trim() || '';
  const points = athlete.anagrafica?.punti || athlete.riepilogo?.punteggioFinale || 0;
  const initialPoints = athlete.riepilogo?.puntiIniziali || points;
  const pointsDiff = Math.round((points - initialPoints) * 10) / 10;

  // Partite giocate e vinte con fallback sui match del ranking / tornei / campionati
  let partiteVinte = athlete.riepilogo?.partiteVinte ?? 0;
  let partiteGiocate = athlete.riepilogo?.partiteGiocate ?? 0;

  if (partiteGiocate === 0 && athlete.partiteRanking) {
    const allMatches = [
      ...(athlete.partiteRanking.campionato || []),
      ...(athlete.partiteRanking.tornei || []),
    ];
    if (allMatches.length > 0) {
      partiteGiocate = allMatches.length;
      partiteVinte = allMatches.filter((m) => m.isVittoria).length;
    }
  }

  const winRate =
    athlete.riepilogo?.percentualePositiva !== undefined && partiteGiocate > 0
      ? `${athlete.riepilogo.percentualePositiva}%`
      : partiteGiocate > 0
        ? `${Math.round((partiteVinte / partiteGiocate) * 100)}%`
        : '0%';

  // Ranking attuale dallo storico classifica
  const storico = athlete.storicoClassifica || [];
  const validPositions = storico
    .map((s) => s.posizione)
    .filter((p): p is number => typeof p === 'number' && p > 0);

  let currentRank = 'N.D.';
  if (validPositions.length > 0) {
    // Cerchiamo l'ultimo snapshot valido partendo dalla fine
    const lastWithPos = [...storico].reverse().find((s) => typeof s.posizione === 'number' && s.posizione > 0);
    if (lastWithPos?.posizione) {
      currentRank = `#${lastWithPos.posizione.toLocaleString('it-IT')}`;
    }
  }

  // Fallback dallo stato anagrafico (es. "Posizione in Classifica: N. 8284")
  if (currentRank === 'N.D.' && athlete.anagrafica?.stato) {
    const statoMatch = athlete.anagrafica.stato.match(/(?:n\.?|posizione\s*:?\s*)(\d+)/i);
    if (statoMatch) currentRank = `#${parseInt(statoMatch[1], 10).toLocaleString('it-IT')}`;
  }

  // Best ranking
  let bestRank = 'N.D.';
  if (athlete.anagrafica?.recordClassifica) {
    const match = athlete.anagrafica.recordClassifica.match(/(\d+)/);
    if (match) bestRank = `#${parseInt(match[1], 10).toLocaleString('it-IT')}`;
  }
  if (bestRank === 'N.D.' && validPositions.length > 0) {
    bestRank = `#${Math.min(...validPositions).toLocaleString('it-IT')}`;
  }
  if (bestRank === 'N.D.' && currentRank !== 'N.D.') {
    bestRank = currentRank;
  }

  // Ultimo torneo disputato
  const tornei = athlete.partiteRanking?.tornei || [];
  let lastTournamentSummary: {
    nome: string;
    data: string;
    partiteVinte: number;
    partiteTotali: number;
    puntiGuadagnati: number;
  } | null = null;

  if (tornei.length > 0) {
    const lastTorneoName = tornei[tornei.length - 1].torneo;
    const matchesInLast = tornei.filter((t) => t.torneo === lastTorneoName);
    const date = matchesInLast[0]?.data || '';
    const vinte = matchesInLast.filter((t) => t.isVittoria).length;
    const totali = matchesInLast.length;
    const pts = matchesInLast.reduce((acc, t) => acc + (t.punti || 0), 0);
    lastTournamentSummary = {
      nome: lastTorneoName,
      data: date,
      partiteVinte: vinte,
      partiteTotali: totali,
      puntiGuadagnati: Math.round(pts * 10) / 10,
    };
  }

  // Iniziali per avatar fallback
  const nameParts = name.split(/\s+/).filter(Boolean);
  const initials = nameParts.length >= 2
    ? `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase()
    : (name[0] || 'A').toUpperCase();

  return {
    name,
    club,
    category,
    sector,
    points,
    initialPoints,
    pointsDiff,
    partiteVinte,
    partiteGiocate,
    winRate,
    currentRank,
    bestRank,
    lastTournamentSummary,
    initials,
    fotoUrl: athlete.anagrafica?.fotoUrl || `https://portale.fitet.org/images/atleti/${athlete.id}.jpg`,
  };
}

/**
 * 1. Genera la Social Card Open Graph (1200 x 630 px)
 * Perfetta per anteprime WhatsApp, Facebook, Twitter, LinkedIn.
 */
export async function generateAthleteOgCard(athlete: DettaglioAtleta): Promise<Buffer> {
  const m = extractAthleteMetrics(athlete);
  const photoBase64 = await fetchImageAsBase64(m.fotoUrl);

  const diffLabel = m.pointsDiff > 0 ? `+${m.pointsDiff} pt` : m.pointsDiff < 0 ? `${m.pointsDiff} pt` : '= 0 pt';
  const diffColor = m.pointsDiff > 0 ? '#10b981' : m.pointsDiff < 0 ? '#ef4444' : '#94a3b8';

  const categoryBadge = [m.category, m.sector].filter(Boolean).join(' • ');

  const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#060d1a" />
      <stop offset="50%" stop-color="#0b172d" />
      <stop offset="100%" stop-color="#081324" />
    </linearGradient>

    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b" stop-opacity="0.75" />
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.85" />
    </linearGradient>

    <linearGradient id="primaryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>

    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>

    <clipPath id="avatarClip">
      <circle cx="180" cy="275" r="95" />
    </clipPath>

    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.5" />
    </filter>
  </defs>

  <!-- Background Canvas -->
  <rect width="1200" height="630" fill="url(#bgGrad)" />

  <!-- Dynamic Sport Glow Orbs -->
  <circle cx="150" cy="100" r="280" fill="#2563eb" opacity="0.12" filter="blur(60px)" />
  <circle cx="1050" cy="500" r="320" fill="#10b981" opacity="0.10" filter="blur(80px)" />

  <!-- Top Brand Navigation Bar -->
  <g transform="translate(60, 48)">
    <rect width="36" height="36" rx="8" fill="url(#primaryGrad)" />
    <circle cx="18" cy="18" r="8" fill="#ffffff" opacity="0.9" />
    <text x="48" y="25" fill="#ffffff" font-size="16" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="800" letter-spacing="1">PORTALE RISULTATI FITeT</text>
    <rect x="910" y="2" width="170" height="32" rx="16" fill="#1e293b" stroke="#334155" stroke-width="1" />
    <text x="995" y="23" fill="#38bdf8" font-size="12" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="700" text-anchor="middle" letter-spacing="0.5">RANKING UFFICIALE</text>
  </g>

  <!-- Left Column: Athlete Profile Card -->
  <!-- Avatar Ring & Photo -->
  <circle cx="180" cy="275" r="101" fill="none" stroke="url(#primaryGrad)" stroke-width="5" filter="url(#shadow)" />
  <circle cx="180" cy="275" r="95" fill="#1e293b" />
  ${
    photoBase64
      ? `<image href="${photoBase64}" x="85" y="180" width="190" height="190" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice" />`
      : `<text x="180" y="295" fill="#38bdf8" font-size="64" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="800" text-anchor="middle">${escapeXml(m.initials)}</text>`
  }

  <!-- Athlete Details -->
  <g transform="translate(310, 220)">
    <!-- Category Pill -->
    ${
      categoryBadge
        ? `<rect x="0" y="0" width="${Math.min(320, categoryBadge.length * 10 + 24)}" height="26" rx="6" fill="#1e293b" stroke="#38bdf8" stroke-width="1" stroke-opacity="0.4" />
           <text x="12" y="17" fill="#38bdf8" font-size="11.5" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="700" letter-spacing="0.5">${escapeXml(categoryBadge.toUpperCase())}</text>`
        : ''
    }

    <!-- Athlete Name -->
    <text x="0" y="58" fill="#ffffff" font-size="38" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="900" letter-spacing="-0.5">${escapeXml(m.name.toUpperCase())}</text>

    <!-- Club -->
    <text x="0" y="92" fill="#94a3b8" font-size="19" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="600">${escapeXml(m.club)}</text>

    <!-- Verified Badge -->
    <g transform="translate(0, 114)">
      <circle cx="8" cy="8" r="8" fill="#10b981" />
      <path d="M5 8 L7 10 L11 6" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <text x="24" y="12" fill="#cbd5e1" font-size="13" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="600">Profilo Atleta FITeT Ufficiale</text>
    </g>
  </g>

  <!-- Right Section: 4 High-Impact Metric Cards -->
  <g transform="translate(680, 150)">
    <!-- Card 1: Ranking Attuale -->
    <g transform="translate(0, 0)">
      <rect width="210" height="150" rx="16" fill="url(#cardGrad)" stroke="#334155" stroke-width="1" filter="url(#shadow)" />
      <text x="20" y="36" fill="#94a3b8" font-size="12" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="700" letter-spacing="0.8">RANKING ATTUALE</text>
      <text x="20" y="88" fill="#38bdf8" font-size="38" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="900">${escapeXml(m.currentRank)}</text>
      <text x="20" y="122" fill="#64748b" font-size="12" font-family="Inter, system-ui, -apple-system, sans-serif">Classifica Italia</text>
    </g>

    <!-- Card 2: Punti Classifica -->
    <g transform="translate(240, 0)">
      <rect width="220" height="150" rx="16" fill="url(#cardGrad)" stroke="#334155" stroke-width="1" filter="url(#shadow)" />
      <text x="20" y="36" fill="#94a3b8" font-size="12" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="700" letter-spacing="0.8">PUNTI RANKING</text>
      <text x="20" y="88" fill="#ffffff" font-size="36" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="900">${escapeXml(m.points.toLocaleString('it-IT'))} <tspan font-size="18" fill="#64748b">pt</tspan></text>
      <text x="20" y="122" fill="${diffColor}" font-size="13" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="700">${escapeXml(diffLabel)} da inizio anno</text>
    </g>

    <!-- Card 3: Partite V / G -->
    <g transform="translate(0, 180)">
      <rect width="210" height="150" rx="16" fill="url(#cardGrad)" stroke="#334155" stroke-width="1" filter="url(#shadow)" />
      <text x="20" y="36" fill="#94a3b8" font-size="12" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="700" letter-spacing="0.8">PARTITE V / G</text>
      <text x="20" y="88" fill="#ffffff" font-size="34" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="900">${escapeXml(m.partiteVinte)} <tspan font-size="20" fill="#64748b">/</tspan> ${escapeXml(m.partiteGiocate)}</text>
      <text x="20" y="122" fill="#10b981" font-size="13" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="700">${escapeXml(m.winRate)} Vittorie</text>
    </g>

    <!-- Card 4: Best Rank -->
    <g transform="translate(240, 180)">
      <rect width="220" height="150" rx="16" fill="url(#cardGrad)" stroke="#334155" stroke-width="1" filter="url(#shadow)" />
      <text x="20" y="36" fill="#94a3b8" font-size="12" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="700" letter-spacing="0.8">BEST RANKING</text>
      <text x="20" y="88" fill="#f59e0b" font-size="36" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="900">${escapeXml(m.bestRank)}</text>
      <text x="20" y="122" fill="#64748b" font-size="12" font-family="Inter, system-ui, -apple-system, sans-serif">Record Personale</text>
    </g>
  </g>

  <!-- Bottom Brand Footer -->
  <g transform="translate(60, 560)">
    <line x1="0" y1="0" x2="1080" y2="0" stroke="#1e293b" stroke-width="1.5" />
    <text x="0" y="32" fill="#64748b" font-size="14" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="600">portale-risultati-tt.it • Statistiche Ufficiali Campionati e Tornei FITeT</text>
    <text x="1080" y="32" fill="#38bdf8" font-size="14" font-family="Inter, system-ui, -apple-system, sans-serif" font-weight="700" text-anchor="end">Condividi la tua passione per il Tennistavolo</text>
  </g>
</svg>
`;

  const resvg = new Resvg(svg, getResvgOptions(1200));
  return resvg.render().asPng();
}

export type StoryTheme = 'panoramica' | 'torneo' | 'best_rank' | 'punti';

export interface StoryRenderOptions {
  campionatoPartite?: PartitaCampionatoAtleta[] | null;
  campionatoNome?: string | null;
  viewsCount?: number;
}

let cachedDarkPlaceholderBase64: string | null | undefined = undefined;

function getDarkPlaceholderBase64(): string | null {
  if (cachedDarkPlaceholderBase64 !== undefined) return cachedDarkPlaceholderBase64;
  const currentDir = typeof __dirname !== 'undefined'
    ? __dirname
    : typeof import.meta?.url === 'string'
      ? path.dirname(fileURLToPath(import.meta.url))
      : process.cwd();

  const candidates = [
    path.resolve(process.cwd(), 'public', 'dark-big-placeholder.png'),
    path.resolve(process.cwd(), 'dist', 'dark-big-placeholder.png'),
    path.resolve(currentDir, '..', '..', 'public', 'dark-big-placeholder.png'),
    path.resolve(currentDir, '..', 'public', 'dark-big-placeholder.png'),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        cachedDarkPlaceholderBase64 = `data:image/png;base64,${buf.toString('base64')}`;
        return cachedDarkPlaceholderBase64;
      }
    } catch {
      // ignore
    }
  }
  cachedDarkPlaceholderBase64 = null;
  return null;
}

function formatCategoryPill(cat?: string): string | null {
  if (!cat) return null;
  const trimmed = cat.trim();
  const match = trimmed.match(/^(\d+)/);
  if (match) return `${match[1]}^`;
  return trimmed;
}

function truncateText(text: string, maxLen: number): string {
  const clean = text.trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(1, maxLen - 1)).trim()}…`;
}

function buildRatingSparklineSvg(
  storico: DettaglioAtleta['storicoClassifica'],
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  accentColor = '#38bdf8'
): string {
  const valid = (storico || []).filter((s) => typeof s.punti === 'number' && s.punti > 0);
  if (valid.length < 2) {
    return `
      <g transform="translate(${x}, ${y})">
        <rect width="${width}" height="${height}" rx="22" fill="#111a2e" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />
        <text x="28" y="42" fill="#94a3b8" font-size="14" font-family="Inter, system-ui, sans-serif" font-weight="700" letter-spacing="1.2">${escapeXml(title)}</text>
        <text x="${width / 2}" y="${height / 2 + 16}" fill="#64748b" font-size="18" font-family="Inter, system-ui, sans-serif" font-weight="600" text-anchor="middle">Storico rilevazioni in aggiornamento</text>
      </g>
    `;
  }

  const pts = valid.map((s) => s.punti);
  const minPt = Math.min(...pts);
  const maxPt = Math.max(...pts);
  const span = Math.max(1, maxPt - minPt);

  const padL = 32;
  const padR = 32;
  const padT = 76;
  const padB = 46;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const coords = valid.map((s, idx) => {
    const px = padL + (idx / (valid.length - 1)) * plotW;
    const norm = (s.punti - minPt) / span;
    const py = padT + plotH - norm * plotH;
    return { x: Math.round(px * 10) / 10, y: Math.round(py * 10) / 10, punti: s.punti, data: s.data };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${padT + plotH} L ${coords[0].x} ${padT + plotH} Z`;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const delta = Math.round((last.punti - first.punti) * 10) / 10;
  const deltaStr = delta > 0 ? `+${delta} pt` : `${delta} pt`;
  const deltaColor = delta >= 0 ? '#10b981' : '#ef4444';

  const formatShortDate = (d?: string) => {
    if (!d) return '';
    if (d.includes('-')) return d.split('-').reverse().join('/');
    return d;
  };

  return `
    <g transform="translate(${x}, ${y})">
      <rect width="${width}" height="${height}" rx="22" fill="#111a2e" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />
      <text x="28" y="42" fill="#94a3b8" font-size="14" font-family="Inter, system-ui, sans-serif" font-weight="700" letter-spacing="1.2">${escapeXml(title)}</text>
      <text x="${width - 28}" y="42" fill="${deltaColor}" font-size="15" font-family="Inter, system-ui, sans-serif" font-weight="700" text-anchor="end">${escapeXml(deltaStr)} (${valid.length} rilevazioni)</text>

      <!-- Subtle horizontal gridlines -->
      <line x1="${padL}" y1="${padT}" x2="${width - padR}" y2="${padT}" stroke="rgba(255,255,255,0.06)" stroke-width="1" stroke-dasharray="4 6" />
      <line x1="${padL}" y1="${padT + plotH / 2}" x2="${width - padR}" y2="${padT + plotH / 2}" stroke="rgba(255,255,255,0.06)" stroke-width="1" stroke-dasharray="4 6" />
      <line x1="${padL}" y1="${padT + plotH}" x2="${width - padR}" y2="${padT + plotH}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />

      <path d="${areaPath}" fill="url(#storyChartArea)" />
      <path d="${linePath}" fill="none" stroke="${accentColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />

      <circle cx="${first.x}" cy="${first.y}" r="5.5" fill="#0b1426" stroke="${accentColor}" stroke-width="3" />
      <circle cx="${last.x}" cy="${last.y}" r="7" fill="${accentColor}" stroke="#ffffff" stroke-width="2.5" />

      <text x="${padL}" y="${height - 16}" fill="#64748b" font-size="14" font-family="Inter, system-ui, sans-serif" font-weight="600">${escapeXml(formatShortDate(first.data))} • ${escapeXml(first.punti.toLocaleString('it-IT'))} pt</text>
      <text x="${width - padR}" y="${height - 16}" fill="#e2e8f0" font-size="14" font-family="Inter, system-ui, sans-serif" font-weight="700" text-anchor="end">${escapeXml(formatShortDate(last.data))} • ${escapeXml(last.punti.toLocaleString('it-IT'))} pt</text>
    </g>
  `;
}

function buildMatchesListSvg(
  rows: Array<{ isWin: boolean; opponent: string; meta: string; rightText: string; rightColor?: string }>,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string
): string {
  const maxRows = height >= 290 ? 4 : 3;
  const visible = rows.slice(0, maxRows);
  const rowStartY = 64;
  const rowGap = 58;

  const content = visible.length === 0
    ? `<text x="${width / 2}" y="${height / 2 + 16}" fill="#64748b" font-size="18" font-family="Inter, system-ui, sans-serif" font-weight="600" text-anchor="middle">Nessun incontro recente registrato</text>`
    : visible
        .map((row, idx) => {
          const ry = rowStartY + idx * rowGap;
          const badgeFill = row.isWin ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)';
          const badgeStroke = row.isWin ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)';
          const badgeColor = row.isWin ? '#10b981' : '#f87171';
          const badgeText = row.isWin ? 'V' : 'P';
          const rightColor = row.rightColor || (row.isWin ? '#10b981' : '#f87171');
          const divider = idx < visible.length - 1
            ? `<line x1="28" y1="${ry + 48}" x2="${width - 28}" y2="${ry + 48}" stroke="rgba(255,255,255,0.06)" stroke-width="1" />`
            : '';

          return `
            <g transform="translate(0, ${ry})">
              <rect x="28" y="4" width="34" height="34" rx="10" fill="${badgeFill}" stroke="${badgeStroke}" stroke-width="1.2" />
              <text x="45" y="27" fill="${badgeColor}" font-size="16" font-family="Inter, system-ui, sans-serif" font-weight="800" text-anchor="middle">${badgeText}</text>
              <text x="78" y="20" fill="#f8fafc" font-size="18" font-family="Inter, system-ui, sans-serif" font-weight="700">${escapeXml(truncateText(row.opponent, 34))}</text>
              <text x="78" y="40" fill="#94a3b8" font-size="13.5" font-family="Inter, system-ui, sans-serif" font-weight="500">${escapeXml(truncateText(row.meta, 46))}</text>
              <text x="${width - 28}" y="28" fill="${rightColor}" font-size="17" font-family="Inter, system-ui, sans-serif" font-weight="800" text-anchor="end">${escapeXml(row.rightText)}</text>
            </g>
            ${divider}
          `;
        })
        .join('');

  return `
    <g transform="translate(${x}, ${y})">
      <rect width="${width}" height="${height}" rx="22" fill="#111a2e" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />
      <text x="28" y="40" fill="#94a3b8" font-size="14" font-family="Inter, system-ui, sans-serif" font-weight="700" letter-spacing="1.2">${escapeXml(title)}</text>
      ${content}
    </g>
  `;
}

/**
 * 2. Genera la Card Grafica per Instagram Stories (1080 x 1920 px, Aspect Ratio 9:16)
 * Progettata per rispecchiare fedelmente il design e la struttura di AtletaModal (semplificata senza pulsanti).
 */
export async function generateAthleteStoryCard(
  athlete: DettaglioAtleta,
  theme: StoryTheme = 'panoramica',
  options?: StoryRenderOptions
): Promise<Buffer> {
  const m = extractAthleteMetrics(athlete);
  const [fetchedPhoto, logoBase64] = await Promise.all([
    fetchImageAsBase64(m.fotoUrl),
    fetchImageAsBase64(athlete.anagrafica?.logoUrl || null),
  ]);
  const photoBase64 = fetchedPhoto || getDarkPlaceholderBase64();

  // Calcolo statistiche identico ad AtletaModal
  const storico = athlete.storicoClassifica || [];
  const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;

  let pts = athlete.anagrafica?.punti ?? 0;
  if (pts < 10 && ultimoSnapshot && ultimoSnapshot.punti >= 100) {
    pts = ultimoSnapshot.punti;
  }
  let initPts = athlete.riepilogo?.puntiIniziali ?? 0;
  if (initPts < 10 && ultimoSnapshot && ultimoSnapshot.punti >= 100) {
    initPts = Math.round(initPts * 1000);
  }

  const pos = ultimoSnapshot?.posizione ?? null;
  const stato = athlete.anagrafica?.stato;
  const record = athlete.anagrafica?.recordClassifica;
  const hasRecord = Boolean(record && !record.includes('n. il') && record.trim().length > 0);
  const dataAgg = ultimoSnapshot?.data
    ? (ultimoSnapshot.data.includes('-')
        ? ultimoSnapshot.data.split('-').reverse().join('/')
        : ultimoSnapshot.data)
    : null;

  const posText = pos ? `#${pos.toLocaleString('it-IT')}` : (stato || 'Fuori Quadro');
  const posSub = hasRecord ? `Record: ${record}` : (dataAgg ? `Al ${dataAgg}` : 'Nazionale');

  const aggregatedStats = aggregateAthleteMatchStats(
    athlete,
    options?.campionatoPartite ?? null,
    options?.campionatoNome || athlete.campionatoAttuale?.nome
  );
  const partiteGiocate = aggregatedStats.partiteGiocate;
  const partiteVinte = aggregatedStats.partiteVinte;
  const partitePerse = aggregatedStats.partitePerse;
  const percPositiva = aggregatedStats.percentualePositiva;

  let puntiNetto = athlete.riepilogo?.puntiTotali ?? 0;
  if (puntiNetto === 0 && athlete.partiteRanking?.dettaglioPunti) {
    const diff =
      (athlete.partiteRanking.dettaglioPunti.campionato || 0) +
      (athlete.partiteRanking.dettaglioPunti.tornei || 0);
    if (diff !== 0) puntiNetto = diff;
  }
  puntiNetto = Math.round(puntiNetto * 10) / 10;

  let partiteSub = `Perse: ${partitePerse}`;
  if (aggregatedStats.campionatoGiocate > 0 || aggregatedStats.torneiGiocate > 0) {
    const parts: string[] = [];
    if (aggregatedStats.torneiGiocate > 0) parts.push(`Tornei: ${aggregatedStats.torneiGiocate}`);
    if (aggregatedStats.campionatoGiocate > 0) {
      parts.push(`Camp: ${aggregatedStats.campionatoVinte}V-${aggregatedStats.campionatoPerse}P`);
    }
    partiteSub = parts.join(' - ');
  }

  const netLabel = puntiNetto > 0 ? `+${puntiNetto} pt netti` : `${puntiNetto} pt`;
  const netColor = puntiNetto >= 0 ? '#10b981' : '#f87171';

  // Dimensione font nome adattiva
  const displayName = m.name.toUpperCase();
  const nameFontSize = displayName.length > 24 ? 32 : displayName.length > 18 ? 38 : 44;

  // Club + logo centrati
  const clubText = truncateText(athlete.anagrafica?.societa?.trim() || 'Tesserato FITeT', 38);
  const regione = athlete.anagrafica?.regione?.trim() || '';
  const estimatedClubWidth = Math.min(760, clubText.length * 13.2);
  const clubGroupWidth = logoBase64 ? estimatedClubWidth + 44 : estimatedClubWidth;
  const clubTextX = logoBase64 ? 540 - 22 : 540;
  const logoX = 540 + clubGroupWidth / 2 - 34;

  // Metadata row (pill categoria, pill settore, divisore, data nascita, visite)
  const catPill = formatCategoryPill(athlete.anagrafica?.categoria);
  const sectorPill = athlete.anagrafica?.settore?.trim() || null;
  const birthDate = athlete.anagrafica?.dataNascita?.trim() || null;
  const views = options?.viewsCount && options.viewsCount > 0 ? options.viewsCount : 0;

  interface MetaPiece {
    kind: 'pill' | 'divider' | 'text';
    text?: string;
    width: number;
  }
  const metaPieces: MetaPiece[] = [];
  if (catPill) metaPieces.push({ kind: 'pill', text: catPill, width: Math.max(58, catPill.length * 12 + 34) });
  if (sectorPill) metaPieces.push({ kind: 'pill', text: sectorPill, width: Math.max(88, sectorPill.length * 10.5 + 34) });
  if (metaPieces.length > 0 && (birthDate || views > 0)) {
    metaPieces.push({ kind: 'divider', width: 18 });
  }
  if (birthDate) {
    const txt = `Nato/a il ${birthDate}`;
    metaPieces.push({ kind: 'text', text: txt, width: txt.length * 9.8 + 10 });
  }
  if (birthDate && views > 0) {
    metaPieces.push({ kind: 'text', text: '•', width: 16 });
  }
  if (views > 0) {
    const txt = `${views.toLocaleString('it-IT')} ${views === 1 ? 'visita' : 'visite'}`;
    metaPieces.push({ kind: 'text', text: txt, width: txt.length * 9.6 + 10 });
  }

  const metaGap = 10;
  const totalMetaWidth =
    metaPieces.reduce((acc, p) => acc + p.width, 0) + Math.max(0, metaPieces.length - 1) * metaGap;
  let cursorX = 540 - totalMetaWidth / 2;
  const metaRowSvg = metaPieces
    .map((piece) => {
      const xPos = Math.round(cursorX);
      cursorX += piece.width + metaGap;
      if (piece.kind === 'pill') {
        return `
          <rect x="${xPos}" y="0" width="${Math.round(piece.width)}" height="36" rx="18" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)" stroke-width="1.2" />
          <text x="${Math.round(xPos + piece.width / 2)}" y="24" fill="#e2e8f0" font-size="16.5" font-family="Inter, system-ui, sans-serif" font-weight="600" text-anchor="middle">${escapeXml(piece.text)}</text>
        `;
      }
      if (piece.kind === 'divider') {
        return `<line x1="${Math.round(xPos + piece.width / 2)}" y1="8" x2="${Math.round(xPos + piece.width / 2)}" y2="28" stroke="rgba(255,255,255,0.22)" stroke-width="1.5" />`;
      }
      return `<text x="${Math.round(xPos + piece.width / 2)}" y="24" fill="#94a3b8" font-size="17" font-family="Inter, system-ui, sans-serif" font-weight="500" text-anchor="middle">${escapeXml(piece.text)}</text>`;
    })
    .join('');

  // Costruzione sezione inferiore in base al tema selezionato (sempre stile AtletaModal #111a2e)
  const buildRecentBadgesRows = (badges: AthleteFormBadge[]) =>
    badges.map((b) => ({
      isWin: b.isVittoria,
      opponent: b.avversario,
      meta: [b.data, b.evento].filter(Boolean).join(' • ') || 'Incontro ufficiale',
      rightText: b.risultatoSet || (b.isVittoria ? 'Vinta' : 'Persa'),
    }));

  let lowerSectionSvg = '';
  if (theme === 'torneo' && m.lastTournamentSummary) {
    const t = m.lastTournamentSummary;
    const tPts = `${t.puntiGuadagnati > 0 ? '+' : ''}${t.puntiGuadagnati} pt`;
    const tPtsColor = t.puntiGuadagnati >= 0 ? '#10b981' : '#f87171';
    const torneiAll = athlete.partiteRanking?.tornei || [];
    const lastTorneoMatches = torneiAll
      .filter((tm) => tm.torneo === t.nome)
      .slice(-4)
      .reverse()
      .map((tm) => ({
        isWin: tm.isVittoria,
        opponent: tm.avversario,
        meta: [tm.data, tm.gara].filter(Boolean).join(' • ') || t.nome,
        rightText: tm.punti !== undefined ? `${tm.punti > 0 ? '+' : ''}${tm.punti} pt` : (tm.isVittoria ? 'Vinta' : 'Persa'),
      }));

    lowerSectionSvg = `
      <g transform="translate(96, 1046)">
        <rect width="888" height="206" rx="22" fill="#111a2e" stroke="rgba(56,189,248,0.28)" stroke-width="1.5" />
        <text x="28" y="40" fill="#38bdf8" font-size="14" font-family="Inter, system-ui, sans-serif" font-weight="700" letter-spacing="1.2">ULTIMO TORNEO${t.data ? ` • ${escapeXml(t.data)}` : ''}</text>
        <text x="28" y="76" fill="#ffffff" font-size="23" font-family="Inter, system-ui, sans-serif" font-weight="800">${escapeXml(truncateText(t.nome, 48))}</text>
        <line x1="28" y1="96" x2="860" y2="96" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
        <text x="222" y="148" fill="#f8fafc" font-size="40" font-family="Inter, system-ui, sans-serif" font-weight="800" text-anchor="middle">${t.partiteVinte} <tspan fill="#64748b" font-size="26">/</tspan> ${t.partiteTotali}</text>
        <text x="222" y="180" fill="#94a3b8" font-size="15" font-family="Inter, system-ui, sans-serif" font-weight="600" text-anchor="middle">Partite Vinte nel Torneo</text>
        <line x1="444" y1="114" x2="444" y2="186" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" />
        <text x="666" y="148" fill="${tPtsColor}" font-size="40" font-family="Inter, system-ui, sans-serif" font-weight="800" text-anchor="middle">${escapeXml(tPts)}</text>
        <text x="666" y="180" fill="#94a3b8" font-size="15" font-family="Inter, system-ui, sans-serif" font-weight="600" text-anchor="middle">Bilancio Punti Torneo</text>
      </g>
      ${buildMatchesListSvg(lastTorneoMatches, 96, 1274, 888, 310, 'INCONTRI DEL TORNEO')}
    `;
  } else if (theme === 'best_rank') {
    lowerSectionSvg = `
      <g transform="translate(96, 1046)">
        <rect width="888" height="206" rx="22" fill="#111a2e" stroke="rgba(245,158,11,0.32)" stroke-width="1.5" />
        <text x="28" y="42" fill="#fbbf24" font-size="14" font-family="Inter, system-ui, sans-serif" font-weight="700" letter-spacing="1.2">BEST RANKING IN CARRIERA</text>
        <line x1="28" y1="62" x2="860" y2="62" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
        <text x="222" y="136" fill="#fbbf24" font-size="48" font-family="Inter, system-ui, sans-serif" font-weight="800" text-anchor="middle">${escapeXml(m.bestRank)}</text>
        <text x="222" y="174" fill="#94a3b8" font-size="15.5" font-family="Inter, system-ui, sans-serif" font-weight="600" text-anchor="middle">Record Personale Nazionale</text>
        <line x1="444" y1="84" x2="444" y2="180" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" />
        <text x="666" y="136" fill="#f8fafc" font-size="46" font-family="Inter, system-ui, sans-serif" font-weight="800" text-anchor="middle">${escapeXml(posText)}</text>
        <text x="666" y="174" fill="#94a3b8" font-size="15.5" font-family="Inter, system-ui, sans-serif" font-weight="600" text-anchor="middle">Posizione Attuale</text>
      </g>
      ${buildRatingSparklineSvg(storico, 96, 1274, 888, 310, 'ANDAMENTO STORICO CLASSIFICA', '#fbbf24')}
    `;
  } else if (theme === 'punti') {
    const seasonDiff = Math.round((pts - initPts) * 10) / 10;
    const seasonDiffLabel = seasonDiff > 0 ? `+${seasonDiff} pt` : `${seasonDiff} pt`;
    const seasonDiffColor = seasonDiff >= 0 ? '#10b981' : '#f87171';
    lowerSectionSvg = `
      <g transform="translate(96, 1046)">
        <rect width="888" height="206" rx="22" fill="#111a2e" stroke="rgba(16,185,129,0.32)" stroke-width="1.5" />
        <text x="28" y="42" fill="#10b981" font-size="14" font-family="Inter, system-ui, sans-serif" font-weight="700" letter-spacing="1.2">VARIAZIONE PUNTI STAGIONE</text>
        <line x1="28" y1="62" x2="860" y2="62" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
        <text x="222" y="136" fill="${seasonDiffColor}" font-size="48" font-family="Inter, system-ui, sans-serif" font-weight="800" text-anchor="middle">${escapeXml(seasonDiffLabel)}</text>
        <text x="222" y="174" fill="#94a3b8" font-size="15.5" font-family="Inter, system-ui, sans-serif" font-weight="600" text-anchor="middle">Variazione da Inizio Anno</text>
        <line x1="444" y1="84" x2="444" y2="180" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" />
        <text x="666" y="136" fill="#f8fafc" font-size="44" font-family="Inter, system-ui, sans-serif" font-weight="800" text-anchor="middle">${escapeXml(initPts.toLocaleString('it-IT'))} → ${escapeXml(pts.toLocaleString('it-IT'))}</text>
        <text x="666" y="174" fill="#94a3b8" font-size="15.5" font-family="Inter, system-ui, sans-serif" font-weight="600" text-anchor="middle">Punti Iniziali → Attuali</text>
      </g>
      ${buildRatingSparklineSvg(storico, 96, 1274, 888, 310, 'PROGRESSIONE PUNTI RANKING', '#10b981')}
    `;
  } else {
    // Default 'panoramica': Andamento Ranking + Ultime Partite (struttura fedele ad AtletaModal)
    const recentRows = buildRecentBadgesRows(aggregatedStats.badges);
    lowerSectionSvg = `
      ${buildRatingSparklineSvg(storico, 96, 1046, 888, 250, 'ANDAMENTO PUNTI RANKING', '#38bdf8')}
      ${buildMatchesListSvg(recentRows, 96, 1318, 888, 266, 'ULTIME PARTITE DISPUTATE')}
    `;
  }

  const posFontSize = posText.length > 9 ? 25 : posText.length > 6 ? 31 : 36;

  const svg = `
<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="storyBackdrop" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#050b16" />
      <stop offset="50%" stop-color="#081224" />
      <stop offset="100%" stop-color="#050b16" />
    </linearGradient>

    <radialGradient id="topAmbient" cx="50%" cy="18%" r="55%">
      <stop offset="0%" stop-color="#1d4ed8" stop-opacity="0.22" />
      <stop offset="100%" stop-color="#081224" stop-opacity="0" />
    </radialGradient>

    <linearGradient id="storyChartArea" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.24" />
      <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.01" />
    </linearGradient>

    <linearGradient id="statDividerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0" />
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0.14" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>

    <clipPath id="storyPhotoClip">
      <rect x="408" y="256" width="264" height="304" rx="28" />
    </clipPath>

    <clipPath id="storyLogoClip">
      <circle cx="${Math.round(logoX + 16)}" cy="669" r="16" />
    </clipPath>

    <filter id="modalShadow" x="-8%" y="-6%" width="116%" height="114%">
      <feDropShadow dx="0" dy="22" stdDeviation="28" flood-color="#000000" flood-opacity="0.55" />
    </filter>

    <filter id="photoShadow" x="-15%" y="-12%" width="130%" height="130%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000000" flood-opacity="0.48" />
    </filter>
  </defs>

  <!-- Dark Backdrop matching .modal-athlete-backdrop -->
  <rect width="1080" height="1920" fill="url(#storyBackdrop)" />
  <rect width="1080" height="1920" fill="url(#topAmbient)" />

  <!-- Top Brand Pill (Instagram Safe Area) -->
  <g transform="translate(0, 114)">
    <rect x="355" y="0" width="370" height="44" rx="22" fill="#0b1426" stroke="#1a2d52" stroke-width="1.5" />
    <circle cx="382" cy="22" r="6.5" fill="#10b981" />
    <text x="548" y="28" fill="#e2e8f0" font-size="14.5" font-family="Inter, system-ui, sans-serif" font-weight="800" text-anchor="middle" letter-spacing="1.2">PORTALE RISULTATI FITeT</text>
  </g>

  <!-- Main Card matching .modal-card-simple.atleta-modal-card (dark theme) -->
  <rect x="56" y="200" width="968" height="1426" rx="34" fill="#0b1426" stroke="#1a2d52" stroke-width="2" filter="url(#modalShadow)" />

  <!-- 1. Rounded Portrait Photo matching .athlete-spotlight-photo-wrap -->
  <rect x="408" y="256" width="264" height="304" rx="28" fill="#0f172a" stroke="rgba(255,255,255,0.14)" stroke-width="2" filter="url(#photoShadow)" />
  ${
    photoBase64
      ? `<image href="${photoBase64}" x="408" y="256" width="264" height="304" clip-path="url(#storyPhotoClip)" preserveAspectRatio="xMidYMid slice" />
         <rect x="408" y="256" width="264" height="304" rx="28" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2" />`
      : `<text x="540" y="432" fill="#94a3b8" font-size="78" font-family="Inter, system-ui, sans-serif" font-weight="800" text-anchor="middle" letter-spacing="2">${escapeXml(m.initials)}</text>`
  }

  <!-- 2. Athlete Name matching .athlete-spotlight-name -->
  <text x="540" y="624" fill="#ffffff" font-size="${nameFontSize}" font-family="Inter, system-ui, sans-serif" font-weight="800" text-anchor="middle" letter-spacing="0.8">${escapeXml(truncateText(displayName, 32))}</text>

  <!-- 3. Society + Logo + Region matching .athlete-spotlight-club-wrap -->
  <text x="${Math.round(clubTextX)}" y="676" fill="#e2e8f0" font-size="23" font-family="Inter, system-ui, sans-serif" font-weight="600" text-anchor="middle" text-decoration="underline">${escapeXml(clubText)}</text>
  ${
    logoBase64
      ? `<circle cx="${Math.round(logoX + 16)}" cy="669" r="17" fill="#ffffff" />
         <image href="${logoBase64}" x="${Math.round(logoX)}" y="653" width="32" height="32" clip-path="url(#storyLogoClip)" preserveAspectRatio="xMidYMid meet" />`
      : ''
  }
  ${
    regione
      ? `<text x="540" y="714" fill="#94a3b8" font-size="20" font-family="Inter, system-ui, sans-serif" font-weight="500" text-anchor="middle">(${escapeXml(regione)})</text>`
      : ''
  }

  <!-- 4. Metadata Pills Row matching .athlete-spotlight-meta-row -->
  <g transform="translate(0, ${regione ? 744 : 716})">
    ${metaRowSvg}
  </g>

  <!-- 5. 4-Column Stats Card matching .overview-stats-card.athlete-spotlight-stats-card -->
  <g transform="translate(96, 816)">
    <rect width="888" height="196" rx="22" fill="#111a2e" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />

    <!-- Col 1: POSIZIONE -->
    <text x="111" y="50" fill="#94a3b8" font-size="14" font-family="Inter, system-ui, sans-serif" font-weight="600" text-anchor="middle" letter-spacing="1.2">POSIZIONE</text>
    <text x="111" y="114" fill="#f8fafc" font-size="${posFontSize}" font-family="Inter, system-ui, sans-serif" font-weight="800" text-anchor="middle">${escapeXml(truncateText(posText, 13))}</text>
    <text x="111" y="156" fill="#94a3b8" font-size="14" font-family="Inter, system-ui, sans-serif" font-weight="500" text-anchor="middle" opacity="0.88">${escapeXml(truncateText(posSub, 22))}</text>

    <rect x="221.5" y="38" width="1.5" height="120" fill="url(#statDividerGrad)" />

    <!-- Col 2: PUNTI RANK -->
    <text x="333" y="50" fill="#94a3b8" font-size="14" font-family="Inter, system-ui, sans-serif" font-weight="600" text-anchor="middle" letter-spacing="1.2">PUNTI RANK</text>
    <text x="333" y="114" fill="#f8fafc" font-size="36" font-family="Inter, system-ui, sans-serif" font-weight="800" text-anchor="middle">${escapeXml(pts.toLocaleString('it-IT'))}</text>
    <text x="333" y="156" fill="#94a3b8" font-size="14" font-family="Inter, system-ui, sans-serif" font-weight="500" text-anchor="middle" opacity="0.88">Iniziali: ${escapeXml(initPts.toLocaleString('it-IT'))}</text>

    <rect x="443.5" y="38" width="1.5" height="120" fill="url(#statDividerGrad)" />

    <!-- Col 3: PARTITE V/G -->
    <text x="555" y="50" fill="#94a3b8" font-size="14" font-family="Inter, system-ui, sans-serif" font-weight="600" text-anchor="middle" letter-spacing="1.2">PARTITE V/G</text>
    <text x="555" y="114" fill="#f8fafc" font-size="36" font-family="Inter, system-ui, sans-serif" font-weight="800" text-anchor="middle">${partiteVinte} <tspan fill="#64748b" font-size="25" font-weight="500">/</tspan> ${partiteGiocate}</text>
    <text x="555" y="156" fill="#94a3b8" font-size="13.5" font-family="Inter, system-ui, sans-serif" font-weight="500" text-anchor="middle" opacity="0.88">${escapeXml(truncateText(partiteSub, 24))}</text>

    <rect x="665.5" y="38" width="1.5" height="120" fill="url(#statDividerGrad)" />

    <!-- Col 4: % VITTORIE -->
    <text x="777" y="50" fill="#94a3b8" font-size="14" font-family="Inter, system-ui, sans-serif" font-weight="600" text-anchor="middle" letter-spacing="1.2">% VITTORIE</text>
    <text x="777" y="114" fill="#10b981" font-size="36" font-family="Inter, system-ui, sans-serif" font-weight="800" text-anchor="middle">${percPositiva}%</text>
    <text x="777" y="156" fill="${netColor}" font-size="14" font-family="Inter, system-ui, sans-serif" font-weight="600" text-anchor="middle">${escapeXml(netLabel)}</text>
  </g>

  <!-- 6. Simplified Lower Section (Chart + Matches / Focus Theme) -->
  ${lowerSectionSvg}

  <!-- Bottom Safe Area URL Pill -->
  <g transform="translate(0, 1682)">
    <rect x="230" y="0" width="620" height="58" rx="29" fill="#0b1426" stroke="#1a2d52" stroke-width="1.5" />
    <text x="540" y="36" fill="#93c5fd" font-size="18" font-family="Inter, system-ui, sans-serif" font-weight="700" text-anchor="middle" letter-spacing="0.4">portale-risultati-tt.it/player/${escapeXml(athlete.id)}</text>
    <text x="540" y="96" fill="#64748b" font-size="14.5" font-family="Inter, system-ui, sans-serif" font-weight="600" text-anchor="middle">Scheda Atleta FITeT • Aggiornata in tempo reale</text>
  </g>
</svg>
`;

  const resvg = new Resvg(svg, getResvgOptions(1080));
  return resvg.render().asPng();
}

