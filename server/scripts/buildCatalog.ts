import { championshipCatalog } from '../services/championshipCatalog';

async function main() {
  console.log('Fetching all championships from FITeT...');
  const res = await championshipCatalog.getAllCampionati(true);
  console.log(`Successfully indexed ${res.length} championships!`);
  const cal = res.filter(c => c.regione === 'Calabria');
  console.log(`Calabria has ${cal.length} championships:`, cal.map(c => c.nome).join(', '));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
