fetch('http://localhost:3001/api/atleta/655182')
  .then(r => r.json())
  .then(d => {
    console.log('Keys:', Object.keys(d));
    console.log('Tornei match 0:', d.partiteRanking.tornei[0]);
  })
  .catch(e => console.error(e));
