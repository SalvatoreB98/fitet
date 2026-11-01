import fs from 'fs';
import path from 'path';

const REGIONS = [
  'Abruzzo',
  'Alto Adige',
  'Basilicata',
  'Calabria',
  'Campania',
  'Emilia Romagna',
  'Friuli Venezia Giulia',
  'Lazio',
  'Liguria',
  'Lombardia',
  'Marche',
  'Molise',
  'Piemonte',
  'Puglia',
  'Sardegna',
  'Sicilia',
  'Toscana',
  'Trentino',
  'Umbria',
  "Valle d'Aosta",
  'Veneto',
];

function regionToSlug(region) {
  return region
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const distDir = path.resolve('dist');
const baseIndexPath = path.join(distDir, 'index.html');
const campionatiPath = path.resolve('server', 'data', 'campionati.json');

if (!fs.existsSync(baseIndexPath)) {
  console.warn('[generateRegionalPages] dist/index.html non trovato, salto generazione pagine regionali.');
  process.exit(0);
}

const baseHtml = fs.readFileSync(baseIndexPath, 'utf8');
const campionati = fs.existsSync(campionatiPath)
  ? JSON.parse(fs.readFileSync(campionatiPath, 'utf8'))
  : [];

const BASE_URL = (process.env.SITE_URL || 'https://portale-risultati-tt.it').replace(/\/$/, '');

for (const region of REGIONS) {
  const slug = regionToSlug(region);
  const regCampionati = campionati.filter(
    (c) => (c.regione || '').toLowerCase() === region.toLowerCase()
  );

  const uniqueCats = Array.from(
    new Set(
      regCampionati
        .map((c) => c.categoria)
        .filter(Boolean)
    )
  ).slice(0, 4);

  const catSummary = uniqueCats.length > 0 ? uniqueCats.join(', ') : 'D1, C2, D2';
  const title = `Portale Risultati FITeT ${region} – Classifiche e Gironi ${catSummary}`;
  const description = `Consulta risultati, gironi e classifiche FITeT ${region} (${catSummary}), calendari andata/ritorno, tornei e schede atleta in tempo reale da smartphone.`;
  const canonicalUrl = `${BASE_URL}/regioni/${slug}`;

  let html = baseHtml
    .replace(/<title>.*?<\/title>/i, `<title>${title}</title>`)
    .replace(
      /<meta\s+name="description"[\s\S]*?\/>/i,
      `<meta name="description" content="${description}" />`
    )
    .replace(
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/i,
      `<link rel="canonical" href="${canonicalUrl}" />`
    )
    .replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/i,
      `<meta property="og:url" content="${canonicalUrl}" />`
    )
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/i,
      `<meta property="og:title" content="${title}" />`
    )
    .replace(
      /<meta\s+property="og:description"[\s\S]*?\/>/i,
      `<meta property="og:description" content="${description}" />`
    )
    .replace(
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/>/i,
      `<meta name="twitter:title" content="${title}" />`
    )
    .replace(
      /<meta\s+name="twitter:description"[\s\S]*?\/>/i,
      `<meta name="twitter:description" content="${description}" />`
    );

  // Aggiungi H1 e lista gironi della regione nel blocco <noscript> per indicizzazione semantica
  const champLinksHtml = regCampionati
    .map(
      (c) =>
        `<li><a href="/?cam=${c.id}&amp;view=campionato&amp;tab=classifica"><strong>${c.nome}</strong> (${c.categoria || region})</a></li>`
    )
    .join('\n          ');

  const regionalNoscript = `<noscript>
    <div style="max-width: 800px; margin: 40px auto; padding: 24px; font-family: sans-serif; line-height: 1.6; color: #1e293b;">
      <h1>Portale Risultati FITeT ${region} – Classifiche e Gironi ${catSummary}</h1>
      <p>${description}</p>
      <h2>Campionati e Gironi FITeT ${region} (${regCampionati.length}):</h2>
      <ul>
          ${champLinksHtml}
      </ul>
      <p><a href="/">Torna al Portale Risultati FITeT Nazionale</a></p>
    </div>
  </noscript>`;

  html = html.replace(/<noscript>[\s\S]*?<\/noscript>/i, regionalNoscript);

  const outDir = path.join(distDir, 'regioni', slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
}

console.log(`Generated ${REGIONS.length} static regional SEO pages in dist/regioni/<slug>/index.html.`);
