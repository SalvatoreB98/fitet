import { FitetClient } from '../server/services/fitetClient';
import * as cheerio from 'cheerio';
import { extractRankingIframeUrl } from '../server/parsers/atletaParser';

async function main() {
  const html = await FitetClient.fetchSchedaAtleta('611964');
  const $ = cheerio.load(html);
  const src = extractRankingIframeUrl(html);
  console.log('Iframe URL:', src);
  if (src) {
    const iframeHtml = await FitetClient.fetchHtml(src, false);
    const $i = cheerio.load(iframeHtml);
    const $p = $i('#player_611964');
    console.log('Player 611964 HTML:');
    console.log($p.html()?.slice(0, 500));
  }
}
main().catch(console.error);
