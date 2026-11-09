import { Resvg } from '@resvg/resvg-js';
import type { DettaglioAtleta } from '../../src/types/fitet';

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
  const partiteVinte = athlete.riepilogo?.partiteVinte ?? 0;
  const partiteGiocate = athlete.riepilogo?.partiteGiocate ?? 0;
  const winRate =
    athlete.riepilogo?.percentualePositiva !== undefined
      ? `${athlete.riepilogo.percentualePositiva}%`
      : partiteGiocate > 0
        ? `${Math.round((partiteVinte / partiteGiocate) * 100)}%`
        : '0%';

  // Ranking attuale dallo storico classifica
  const storico = athlete.storicoClassifica || [];
  const latestSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;
  const currentRank = latestSnapshot?.posizione ? `#${latestSnapshot.posizione.toLocaleString('it-IT')}` : 'N.D.';

  // Best ranking
  let bestRank = 'N.D.';
  if (athlete.anagrafica?.recordClassifica) {
    const match = athlete.anagrafica.recordClassifica.match(/(\d+)/);
    if (match) bestRank = `#${parseInt(match[1], 10).toLocaleString('it-IT')}`;
  }
  if (bestRank === 'N.D.' && storico.length > 0) {
    const validPositions = storico.map((s) => s.posizione).filter((p): p is number => typeof p === 'number' && p > 0);
    if (validPositions.length > 0) {
      bestRank = `#${Math.min(...validPositions).toLocaleString('it-IT')}`;
    }
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
    <text x="48" y="25" fill="#ffffff" font-size="16" font-family="system-ui, -apple-system, sans-serif" font-weight="800" letter-spacing="1">PORTALE RISULTATI FITeT</text>
    <rect x="910" y="2" width="170" height="32" rx="16" fill="#1e293b" stroke="#334155" stroke-width="1" />
    <text x="995" y="23" fill="#38bdf8" font-size="12" font-family="system-ui, -apple-system, sans-serif" font-weight="700" text-anchor="middle" letter-spacing="0.5">RANKING UFFICIALE</text>
  </g>

  <!-- Left Column: Athlete Profile Card -->
  <!-- Avatar Ring & Photo -->
  <circle cx="180" cy="275" r="101" fill="none" stroke="url(#primaryGrad)" stroke-width="5" filter="url(#shadow)" />
  <circle cx="180" cy="275" r="95" fill="#1e293b" />
  ${
    photoBase64
      ? `<image href="${photoBase64}" x="85" y="180" width="190" height="190" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice" />`
      : `<text x="180" y="295" fill="#38bdf8" font-size="64" font-family="system-ui, -apple-system, sans-serif" font-weight="800" text-anchor="middle">${escapeXml(m.initials)}</text>`
  }

  <!-- Athlete Details -->
  <g transform="translate(310, 220)">
    <!-- Category Pill -->
    ${
      categoryBadge
        ? `<rect x="0" y="0" width="${Math.min(320, categoryBadge.length * 10 + 24)}" height="26" rx="6" fill="#1e293b" stroke="#38bdf8" stroke-width="1" stroke-opacity="0.4" />
           <text x="12" y="17" fill="#38bdf8" font-size="11.5" font-family="system-ui, -apple-system, sans-serif" font-weight="700" letter-spacing="0.5">${escapeXml(categoryBadge.toUpperCase())}</text>`
        : ''
    }

    <!-- Athlete Name -->
    <text x="0" y="58" fill="#ffffff" font-size="38" font-family="system-ui, -apple-system, sans-serif" font-weight="900" letter-spacing="-0.5">${escapeXml(m.name.toUpperCase())}</text>

    <!-- Club -->
    <text x="0" y="92" fill="#94a3b8" font-size="19" font-family="system-ui, -apple-system, sans-serif" font-weight="600">${escapeXml(m.club)}</text>

    <!-- Verified Badge -->
    <g transform="translate(0, 114)">
      <circle cx="8" cy="8" r="8" fill="#10b981" />
      <path d="M5 8 L7 10 L11 6" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <text x="24" y="12" fill="#cbd5e1" font-size="13" font-family="system-ui, -apple-system, sans-serif" font-weight="600">Profilo Atleta FITeT Ufficiale</text>
    </g>
  </g>

  <!-- Right Section: 4 High-Impact Metric Cards -->
  <g transform="translate(680, 150)">
    <!-- Card 1: Ranking Attuale -->
    <g transform="translate(0, 0)">
      <rect width="210" height="150" rx="16" fill="url(#cardGrad)" stroke="#334155" stroke-width="1" filter="url(#shadow)" />
      <text x="20" y="36" fill="#94a3b8" font-size="12" font-family="system-ui, -apple-system, sans-serif" font-weight="700" letter-spacing="0.8">RANKING ATTUALE</text>
      <text x="20" y="88" fill="#38bdf8" font-size="38" font-family="system-ui, -apple-system, sans-serif" font-weight="900">${escapeXml(m.currentRank)}</text>
      <text x="20" y="122" fill="#64748b" font-size="12" font-family="system-ui, -apple-system, sans-serif">Classifica Italia</text>
    </g>

    <!-- Card 2: Punti Classifica -->
    <g transform="translate(240, 0)">
      <rect width="220" height="150" rx="16" fill="url(#cardGrad)" stroke="#334155" stroke-width="1" filter="url(#shadow)" />
      <text x="20" y="36" fill="#94a3b8" font-size="12" font-family="system-ui, -apple-system, sans-serif" font-weight="700" letter-spacing="0.8">PUNTI RANKING</text>
      <text x="20" y="88" fill="#ffffff" font-size="36" font-family="system-ui, -apple-system, sans-serif" font-weight="900">${escapeXml(m.points.toLocaleString('it-IT'))} <tspan font-size="18" fill="#64748b">pt</tspan></text>
      <text x="20" y="122" fill="${diffColor}" font-size="13" font-family="system-ui, -apple-system, sans-serif" font-weight="700">${escapeXml(diffLabel)} da inizio anno</text>
    </g>

    <!-- Card 3: Partite V / G -->
    <g transform="translate(0, 180)">
      <rect width="210" height="150" rx="16" fill="url(#cardGrad)" stroke="#334155" stroke-width="1" filter="url(#shadow)" />
      <text x="20" y="36" fill="#94a3b8" font-size="12" font-family="system-ui, -apple-system, sans-serif" font-weight="700" letter-spacing="0.8">PARTITE V / G</text>
      <text x="20" y="88" fill="#ffffff" font-size="34" font-family="system-ui, -apple-system, sans-serif" font-weight="900">${escapeXml(m.partiteVinte)} <tspan font-size="20" fill="#64748b">/</tspan> ${escapeXml(m.partiteGiocate)}</text>
      <text x="20" y="122" fill="#10b981" font-size="13" font-family="system-ui, -apple-system, sans-serif" font-weight="700">${escapeXml(m.winRate)} Vittorie</text>
    </g>

    <!-- Card 4: Best Rank -->
    <g transform="translate(240, 180)">
      <rect width="220" height="150" rx="16" fill="url(#cardGrad)" stroke="#334155" stroke-width="1" filter="url(#shadow)" />
      <text x="20" y="36" fill="#94a3b8" font-size="12" font-family="system-ui, -apple-system, sans-serif" font-weight="700" letter-spacing="0.8">BEST RANKING</text>
      <text x="20" y="88" fill="#f59e0b" font-size="36" font-family="system-ui, -apple-system, sans-serif" font-weight="900">${escapeXml(m.bestRank)}</text>
      <text x="20" y="122" fill="#64748b" font-size="12" font-family="system-ui, -apple-system, sans-serif">Record Personale</text>
    </g>
  </g>

  <!-- Bottom Brand Footer -->
  <g transform="translate(60, 560)">
    <line x1="0" y1="0" x2="1080" y2="0" stroke="#1e293b" stroke-width="1.5" />
    <text x="0" y="32" fill="#64748b" font-size="14" font-family="system-ui, -apple-system, sans-serif" font-weight="600">portale-risultati-tt.it • Statistiche Ufficiali Campionati e Tornei FITeT</text>
    <text x="1080" y="32" fill="#38bdf8" font-size="14" font-family="system-ui, -apple-system, sans-serif" font-weight="700" text-anchor="end">Condividi la tua passione per il Tennistavolo</text>
  </g>
</svg>
`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
  });
  return resvg.render().asPng();
}

export type StoryTheme = 'panoramica' | 'torneo' | 'best_rank' | 'punti';

/**
 * 2. Genera la Card Grafica per Instagram Stories (1080 x 1920 px, Aspect Ratio 9:16)
 * Pronta per download e condivisione su Instagram Stories, WhatsApp Status, TikTok.
 */
export async function generateAthleteStoryCard(
  athlete: DettaglioAtleta,
  theme: StoryTheme = 'panoramica'
): Promise<Buffer> {
  const m = extractAthleteMetrics(athlete);
  const photoBase64 = await fetchImageAsBase64(m.fotoUrl);

  const diffLabel = m.pointsDiff > 0 ? `+${m.pointsDiff} pt` : m.pointsDiff < 0 ? `${m.pointsDiff} pt` : '= 0 pt';
  const diffColor = m.pointsDiff > 0 ? '#10b981' : m.pointsDiff < 0 ? '#ef4444' : '#94a3b8';
  const categoryBadge = [m.category, m.sector].filter(Boolean).join(' • ');

  // Sezione Highlight variabile in base al tema selezionato
  let highlightTitle = 'PANORAMICA STAGIONE';
  let highlightVal1 = `${m.winRate}`;
  let highlightSub1 = 'Vittorie Totali';
  let highlightVal2 = `${diffLabel}`;
  let highlightSub2 = 'Punti Stagionali';

  if (theme === 'torneo' && m.lastTournamentSummary) {
    highlightTitle = `ULTIMO TORNEO: ${m.lastTournamentSummary.nome.slice(0, 32)}`;
    highlightVal1 = `${m.lastTournamentSummary.partiteVinte}/${m.lastTournamentSummary.partiteTotali}`;
    highlightSub1 = 'Vinte nel Torneo';
    highlightVal2 = `${m.lastTournamentSummary.puntiGuadagnati > 0 ? '+' : ''}${m.lastTournamentSummary.puntiGuadagnati} pt`;
    highlightSub2 = 'Guadagno Punti';
  } else if (theme === 'best_rank') {
    highlightTitle = 'RECORD PERSONALE DI CLASSIFICA';
    highlightVal1 = `${m.bestRank}`;
    highlightSub1 = 'Miglior Posizione';
    highlightVal2 = `${m.currentRank}`;
    highlightSub2 = 'Ranking Attuale';
  } else if (theme === 'punti') {
    highlightTitle = 'VARIAZIONE PUNTI RANKING';
    highlightVal1 = `${diffLabel}`;
    highlightSub1 = 'Incremento Punti';
    highlightVal2 = `${m.points.toLocaleString('it-IT')} pt`;
    highlightSub2 = 'Punti Attuali';
  }

  const svg = `
<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgStory" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#040914" />
      <stop offset="30%" stop-color="#091427" />
      <stop offset="70%" stop-color="#0c1d38" />
      <stop offset="100%" stop-color="#050a17" />
    </linearGradient>

    <linearGradient id="storyGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="50%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>

    <linearGradient id="highlightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b" stop-opacity="0.95" />
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.95" />
    </linearGradient>

    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#162238" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#0d1829" stop-opacity="0.8" />
    </linearGradient>

    <clipPath id="storyAvatarClip">
      <circle cx="540" cy="470" r="135" />
    </clipPath>

    <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#0284c7" flood-opacity="0.35" />
    </filter>
  </defs>

  <!-- Canvas Background -->
  <rect width="1080" height="1920" fill="url(#bgStory)" />

  <!-- Ambient Glow Effects -->
  <circle cx="540" cy="460" r="380" fill="#2563eb" opacity="0.18" filter="blur(90px)" />
  <circle cx="200" cy="1150" r="320" fill="#10b981" opacity="0.12" filter="blur(80px)" />
  <circle cx="900" cy="1450" r="300" fill="#0284c7" opacity="0.14" filter="blur(90px)" />

  <!-- Top Header Safe Area (y: 190 to 260) -->
  <g transform="translate(0, 190)">
    <rect x="360" y="0" width="360" height="42" rx="21" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.5" />
    <circle cx="384" cy="21" r="7" fill="#10b981" />
    <text x="545" y="27" fill="#ffffff" font-size="14.5" font-family="system-ui, -apple-system, sans-serif" font-weight="800" text-anchor="middle" letter-spacing="1.2">PORTALE RISULTATI FITeT</text>
  </g>

  <!-- Hero Profile Section -->
  <!-- Glowing Rings & Avatar -->
  <circle cx="540" cy="470" r="148" fill="none" stroke="url(#storyGlow)" stroke-width="6" filter="url(#glowFilter)" />
  <circle cx="540" cy="470" r="135" fill="#1e293b" />
  ${
    photoBase64
      ? `<image href="${photoBase64}" x="405" y="335" width="270" height="270" clip-path="url(#storyAvatarClip)" preserveAspectRatio="xMidYMid slice" />`
      : `<text x="540" y="505" fill="#38bdf8" font-size="88" font-family="system-ui, -apple-system, sans-serif" font-weight="900" text-anchor="middle">${escapeXml(m.initials)}</text>`
  }

  <!-- Athlete Name & Club -->
  <text x="540" y="685" fill="#ffffff" font-size="46" font-family="system-ui, -apple-system, sans-serif" font-weight="900" text-anchor="middle" letter-spacing="-0.5">${escapeXml(m.name.toUpperCase())}</text>
  <text x="540" y="730" fill="#94a3b8" font-size="22" font-family="system-ui, -apple-system, sans-serif" font-weight="600" text-anchor="middle">${escapeXml(m.club)}</text>

  <!-- Category & Sector Pill -->
  ${
    categoryBadge
      ? `<rect x="${540 - Math.min(380, categoryBadge.length * 9 + 30) / 2}" y="760" width="${Math.min(380, categoryBadge.length * 9 + 30)}" height="34" rx="17" fill="#1e293b" stroke="#334155" stroke-width="1.2" />
         <text x="540" y="783" fill="#38bdf8" font-size="13" font-family="system-ui, -apple-system, sans-serif" font-weight="700" text-anchor="middle" letter-spacing="0.8">${escapeXml(categoryBadge.toUpperCase())}</text>`
      : ''
  }

  <!-- Feature Highlight Banner (y: 840 to 1100) -->
  <g transform="translate(90, 840)">
    <rect width="900" height="260" rx="24" fill="url(#highlightGrad)" stroke="url(#storyGlow)" stroke-width="2" filter="url(#glowFilter)" />

    <!-- Banner Header -->
    <text x="450" y="48" fill="#38bdf8" font-size="15" font-family="system-ui, -apple-system, sans-serif" font-weight="800" text-anchor="middle" letter-spacing="1">${escapeXml(highlightTitle.toUpperCase())}</text>
    <line x1="40" y1="72" x2="860" y2="72" stroke="#334155" stroke-width="1" />

    <!-- Two Key Highlight Metrics Inside Banner -->
    <g transform="translate(0, 100)">
      <!-- Left Column -->
      <text x="225" y="55" fill="#ffffff" font-size="46" font-family="system-ui, -apple-system, sans-serif" font-weight="900" text-anchor="middle">${escapeXml(highlightVal1)}</text>
      <text x="225" y="98" fill="#94a3b8" font-size="16" font-family="system-ui, -apple-system, sans-serif" font-weight="700" text-anchor="middle">${escapeXml(highlightSub1)}</text>

      <line x1="450" y1="20" x2="450" y2="120" stroke="#334155" stroke-width="1.5" />

      <!-- Right Column -->
      <text x="675" y="55" fill="#10b981" font-size="46" font-family="system-ui, -apple-system, sans-serif" font-weight="900" text-anchor="middle">${escapeXml(highlightVal2)}</text>
      <text x="675" y="98" fill="#94a3b8" font-size="16" font-family="system-ui, -apple-system, sans-serif" font-weight="700" text-anchor="middle">${escapeXml(highlightSub2)}</text>
    </g>
  </g>

  <!-- 4 Primary Stat Cards (y: 1140 to 1540) -->
  <g transform="translate(90, 1140)">
    <!-- Card 1: Ranking Italia -->
    <g transform="translate(0, 0)">
      <rect width="430" height="180" rx="20" fill="url(#cardGrad)" stroke="#1e293b" stroke-width="1.5" />
      <text x="32" y="44" fill="#94a3b8" font-size="14" font-family="system-ui, -apple-system, sans-serif" font-weight="700" letter-spacing="0.8">RANKING NAZIONALE</text>
      <text x="32" y="108" fill="#38bdf8" font-size="46" font-family="system-ui, -apple-system, sans-serif" font-weight="900">${escapeXml(m.currentRank)}</text>
      <text x="32" y="148" fill="#64748b" font-size="15" font-family="system-ui, -apple-system, sans-serif">Classifica Ufficiale</text>
    </g>

    <!-- Card 2: Punti Totali -->
    <g transform="translate(470, 0)">
      <rect width="430" height="180" rx="20" fill="url(#cardGrad)" stroke="#1e293b" stroke-width="1.5" />
      <text x="32" y="44" fill="#94a3b8" font-size="14" font-family="system-ui, -apple-system, sans-serif" font-weight="700" letter-spacing="0.8">PUNTI ATTUALI</text>
      <text x="32" y="108" fill="#ffffff" font-size="44" font-family="system-ui, -apple-system, sans-serif" font-weight="900">${escapeXml(m.points.toLocaleString('it-IT'))} <tspan font-size="22" fill="#64748b">pt</tspan></text>
      <text x="32" y="148" fill="${diffColor}" font-size="15" font-family="system-ui, -apple-system, sans-serif" font-weight="700">${escapeXml(diffLabel)} da inizio anno</text>
    </g>

    <!-- Card 3: Partite Vinte / Giocate -->
    <g transform="translate(0, 210)">
      <rect width="430" height="180" rx="20" fill="url(#cardGrad)" stroke="#1e293b" stroke-width="1.5" />
      <text x="32" y="44" fill="#94a3b8" font-size="14" font-family="system-ui, -apple-system, sans-serif" font-weight="700" letter-spacing="0.8">PARTITE V / G</text>
      <text x="32" y="108" fill="#ffffff" font-size="44" font-family="system-ui, -apple-system, sans-serif" font-weight="900">${escapeXml(m.partiteVinte)} <tspan font-size="26" fill="#64748b">/</tspan> ${escapeXml(m.partiteGiocate)}</text>
      <text x="32" y="148" fill="#10b981" font-size="15" font-family="system-ui, -apple-system, sans-serif" font-weight="700">${escapeXml(m.winRate)} Vittorie</text>
    </g>

    <!-- Card 4: Best Rank -->
    <g transform="translate(470, 210)">
      <rect width="430" height="180" rx="20" fill="url(#cardGrad)" stroke="#1e293b" stroke-width="1.5" />
      <text x="32" y="44" fill="#94a3b8" font-size="14" font-family="system-ui, -apple-system, sans-serif" font-weight="700" letter-spacing="0.8">BEST RANKING</text>
      <text x="32" y="108" fill="#f59e0b" font-size="44" font-family="system-ui, -apple-system, sans-serif" font-weight="900">${escapeXml(m.bestRank)}</text>
      <text x="32" y="148" fill="#64748b" font-size="15" font-family="system-ui, -apple-system, sans-serif">Record Personale</text>
    </g>
  </g>

  <!-- Bottom Instagram Safe Area & Call to Action (y: 1620 to 1820) -->
  <g transform="translate(0, 1640)">
    <!-- Pill link -->
    <rect x="240" y="0" width="600" height="60" rx="30" fill="url(#storyGlow)" />
    <rect x="242" y="2" width="596" height="56" rx="28" fill="#081324" />
    <text x="540" y="37" fill="#38bdf8" font-size="17" font-family="system-ui, -apple-system, sans-serif" font-weight="800" text-anchor="middle" letter-spacing="0.5">portale-risultati-tt.it/player/${escapeXml(athlete.id)}</text>

    <!-- Sub Footer -->
    <text x="540" y="95" fill="#64748b" font-size="14" font-family="system-ui, -apple-system, sans-serif" font-weight="600" text-anchor="middle">Generato dal Portale Risultati FITeT • Condividi nelle tue Storie!</text>
  </g>
</svg>
`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1080 },
  });
  return resvg.render().asPng();
}

