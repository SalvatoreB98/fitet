import { championshipCatalog } from '../services/championshipCatalog';

async function main() {
  console.log('Fetching all championships from FITeT...');
  const res = await championshipCatalog.getAllCampionati(true);
  console.log(`Successfully indexed ${res.length} championships!`);
  const regionsCount = new Set(res.map(c => c.regione)).size;
  console.log(`Indexed across ${regionsCount} regions and national divisions.`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
