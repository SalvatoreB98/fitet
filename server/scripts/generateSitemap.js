import fs from 'fs';
import path from 'path';

const campionatiPath = path.resolve('server', 'data', 'campionati.json');
const sitemapPath = path.resolve('public', 'sitemap.xml');

const raw = fs.readFileSync(campionatiPath, 'utf8');
const campionati = JSON.parse(raw);

const BASE_URL = (process.env.SITE_URL || 'https://portale-risultati-tt.it').replace(/\/$/, '');
const today = new Date().toISOString().split('T')[0];

let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

// Homepage & Main views
const mainRoutes = [
  { loc: '/', priority: '1.0', changefreq: 'daily' },
  { loc: '/?tab=classifica', priority: '0.9', changefreq: 'daily' },
  { loc: '/?tab=calendario', priority: '0.9', changefreq: 'daily' },
  { loc: '/?tab=statistiche', priority: '0.8', changefreq: 'daily' },
  { loc: '/?view=classifiche', priority: '0.9', changefreq: 'weekly' },
  { loc: '/?view=tornei', priority: '0.9', changefreq: 'daily' },
];

const regionalSlugs = [
  'abruzzo',
  'alto-adige',
  'basilicata',
  'calabria',
  'campania',
  'emilia-romagna',
  'friuli-venezia-giulia',
  'lazio',
  'liguria',
  'lombardia',
  'marche',
  'molise',
  'piemonte',
  'puglia',
  'sardegna',
  'sicilia',
  'toscana',
  'trentino',
  'umbria',
  'valle-d-aosta',
  'veneto',
];

for (const r of mainRoutes) {
  xml += '  <url>\n';
  xml += `    <loc>${BASE_URL}${r.loc === '/' ? '' : r.loc}</loc>\n`;
  xml += `    <lastmod>${today}</lastmod>\n`;
  xml += `    <changefreq>${r.changefreq}</changefreq>\n`;
  xml += `    <priority>${r.priority}</priority>\n`;
  xml += '  </url>\n';
}

// All 21 dedicated regional SEO pages (/regioni/<slug>)
for (const slug of regionalSlugs) {
  xml += '  <url>\n';
  xml += `    <loc>${BASE_URL}/regioni/${slug}</loc>\n`;
  xml += `    <lastmod>${today}</lastmod>\n`;
  xml += '    <changefreq>daily</changefreq>\n';
  xml += '    <priority>0.9</priority>\n';
  xml += '  </url>\n';
}

// All 374 championships
for (const c of campionati) {
  xml += '  <url>\n';
  xml += `    <loc>${BASE_URL}/?cam=${c.id}</loc>\n`;
  xml += `    <lastmod>${today}</lastmod>\n`;
  xml += '    <changefreq>daily</changefreq>\n';
  xml += '    <priority>0.7</priority>\n';
  xml += '  </url>\n';
}

xml += '</urlset>\n';

fs.writeFileSync(sitemapPath, xml, 'utf8');
console.log(`Generated public/sitemap.xml with ${mainRoutes.length + regionalSlugs.length + campionati.length} URLs.`);
