import fs from 'fs';
import path from 'path';

const campionatiPath = path.resolve('server', 'data', 'campionati.json');
const sitemapPath = path.resolve('public', 'sitemap.xml');

const raw = fs.readFileSync(campionatiPath, 'utf8');
const campionati = JSON.parse(raw);

const BASE_URL = (process.env.SITE_URL || 'https://fitet.vercel.app').replace(/\/$/, '');
const today = new Date().toISOString().split('T')[0];

let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

// Homepage & Main views
const mainRoutes = [
  { loc: '/', priority: '1.0', changefreq: 'daily' },
  { loc: '/?tab=classifica', priority: '0.9', changefreq: 'daily' },
  { loc: '/?tab=calendario', priority: '0.9', changefreq: 'daily' },
  { loc: '/?tab=statistiche', priority: '0.8', changefreq: 'daily' },
  { loc: '/?tab=ranking', priority: '0.8', changefreq: 'weekly' },
  { loc: '/?tab=cercaAtleta', priority: '0.8', changefreq: 'weekly' },
];

for (const r of mainRoutes) {
  xml += '  <url>\n';
  xml += `    <loc>${BASE_URL}${r.loc === '/' ? '' : r.loc}</loc>\n`;
  xml += `    <lastmod>${today}</lastmod>\n`;
  xml += `    <changefreq>${r.changefreq}</changefreq>\n`;
  xml += `    <priority>${r.priority}</priority>\n`;
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
console.log(`Generated public/sitemap.xml with ${mainRoutes.length + campionati.length} URLs.`);
