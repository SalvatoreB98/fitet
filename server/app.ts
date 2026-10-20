import express from 'express';
import cors from 'cors';
import path from 'path';
import { FitetClient } from './services/fitetClient';
import { cacheService } from './services/cacheService';
import { athleteResolver } from './services/athleteResolver';
import { parseClassifica } from './parsers/classificaParser';
import { parseCalendario } from './parsers/calendarioParser';
import { parseStatisticheAtleti } from './parsers/statisticheParser';
import { parseDettaglioAtleta } from './parsers/atletaParser';
import { DashboardData, SquadraClassifica, GiornataCalendario, StatisticaAtleta } from '../src/types/fitet';

export const app = express();

app.use(cors());
app.use(express.json());

// Championship constants
const CAM_ID = 1902;
const ANNO_ID = 41;

// Cache TTLs (ms)
const TTL_CLASSIFICA = 30 * 60 * 1000; // 30 min
const TTL_CALENDARIO = 30 * 60 * 1000; // 30 min
const TTL_STATISTICHE = 60 * 60 * 1000; // 60 min
const TTL_ATLETA = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Calculates recent form ('V', 'P', 'N') for each team based on played calendar matches
 */
function computeTeamForm(classifica: SquadraClassifica[], calendario: GiornataCalendario[]): SquadraClassifica[] {
  const playedMatches: Array<{
    casa: string;
    ospite: string;
    puntiCasa: number;
    puntiOspite: number;
    giornata: number;
  }> = [];

  for (const g of calendario) {
    for (const m of [...g.partiteAndata, ...g.partiteRitorno]) {
      if (m.disputato && m.puntiCasa !== null && m.puntiOspite !== null) {
        playedMatches.push({
          casa: m.squadraCasa,
          ospite: m.squadraOspite,
          puntiCasa: m.puntiCasa,
          puntiOspite: m.puntiOspite,
          giornata: m.giornata,
        });
      }
    }
  }

  // Sort by giornata ascending
  playedMatches.sort((a, b) => a.giornata - b.giornata);

  return classifica.map((team) => {
    const teamNorm = team.nome.toUpperCase().replace(/\s+/g, ' ');
    const teamForm: Array<'V' | 'P' | 'N'> = [];

    for (const m of playedMatches) {
      const casaNorm = m.casa.toUpperCase().replace(/\s+/g, ' ');
      const ospiteNorm = m.ospite.toUpperCase().replace(/\s+/g, ' ');

      if (casaNorm === teamNorm || teamNorm.includes(casaNorm) || casaNorm.includes(teamNorm)) {
        if (m.puntiCasa > m.puntiOspite) teamForm.push('V');
        else if (m.puntiCasa < m.puntiOspite) teamForm.push('P');
        else teamForm.push('N');
      } else if (ospiteNorm === teamNorm || teamNorm.includes(ospiteNorm) || ospiteNorm.includes(teamNorm)) {
        if (m.puntiOspite > m.puntiCasa) teamForm.push('V');
        else if (m.puntiOspite < m.puntiCasa) teamForm.push('P');
        else teamForm.push('N');
      }
    }

    return {
      ...team,
      forma: teamForm.slice(-5), // Last 5 matches
    };
  });
}

/**
 * Fetch and parse Classifica
 */
async function getClassifica(forceRefresh = false): Promise<SquadraClassifica[]> {
  const cacheKey = `classifica_${CAM_ID}`;
  if (!forceRefresh) {
    const cached = cacheService.get<SquadraClassifica[]>(cacheKey);
    if (cached) return cached;
  }

  const html = await FitetClient.fetchClassifica(CAM_ID);
  const data = parseClassifica(html);
  cacheService.set(cacheKey, data, TTL_CLASSIFICA);
  return data;
}

/**
 * Fetch and parse Calendario
 */
async function getCalendario(forceRefresh = false): Promise<GiornataCalendario[]> {
  const cacheKey = `calendario_${CAM_ID}_${ANNO_ID}`;
  if (!forceRefresh) {
    const cached = cacheService.get<GiornataCalendario[]>(cacheKey);
    if (cached) return cached;
  }

  const html = await FitetClient.fetchCalendario(CAM_ID, ANNO_ID);
  const data = parseCalendario(html);
  cacheService.set(cacheKey, data, TTL_CALENDARIO);
  return data;
}

/**
 * Fetch and parse Statistiche Atleti
 */
async function getStatistiche(forceRefresh = false): Promise<StatisticaAtleta[]> {
  const cacheKey = `statistiche_${CAM_ID}`;
  if (!forceRefresh) {
    const cached = cacheService.get<StatisticaAtleta[]>(cacheKey);
    if (cached) return cached;
  }

  const html = await FitetClient.fetchStatisticheAtleti(CAM_ID);
  const mapping = athleteResolver.getMapping();
  const data = parseStatisticheAtleti(html, mapping);
  cacheService.set(cacheKey, data, TTL_STATISTICHE);
  return data;
}

// ======================== API ROUTES ========================

// 1. Full Dashboard Endpoint
app.get('/api/dashboard', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  try {
    const [rawClassifica, calendario, statisticheAtleti] = await Promise.all([
      getClassifica(forceRefresh),
      getCalendario(forceRefresh),
      getStatistiche(forceRefresh),
    ]);

    const classifica = computeTeamForm(rawClassifica, calendario);

    const payload: DashboardData = {
      classifica,
      calendario,
      statisticheAtleti,
      lastUpdated: new Date().toISOString(),
      championship: {
        id: CAM_ID,
        anno: ANNO_ID,
        nome: 'Serie D/1',
        girone: 'Girone Nord',
        regione: 'Calabria',
      },
    };

    res.json(payload);
  } catch (error: any) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei dati FITeT', details: error.message });
  }
});

// 2. Classifica standalone
app.get('/api/classifica', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  try {
    const data = await getClassifica(forceRefresh);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Calendario standalone
app.get('/api/calendario', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  try {
    const data = await getCalendario(forceRefresh);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Statistiche Atleti standalone
app.get('/api/statistiche', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  try {
    const data = await getStatistiche(forceRefresh);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Scheda Singolo Atleta
app.get('/api/atleta/:id', async (req, res) => {
  const { id } = req.params;
  const forceRefresh = req.query.refresh === 'true';
  const cacheKey = `atleta_${id}`;

  if (!id || id === 'null' || id === 'undefined') {
    return res.status(400).json({ error: 'ID atleta non valido' });
  }

  try {
    if (!forceRefresh) {
      const cached = cacheService.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const html = await FitetClient.fetchSchedaAtleta(id);
    const atleta = parseDettaglioAtleta(html, id);
    cacheService.set(cacheKey, atleta, TTL_ATLETA);
    res.json(atleta);
  } catch (error: any) {
    console.error(`Error fetching athlete ${id}:`, error);
    res.status(500).json({ error: 'Errore nel recupero della scheda atleta', details: error.message });
  }
});

// 6. Search / Autocomplete Atleta
app.get('/api/search-atleta', async (req, res) => {
  const query = (req.query.q as string) || '';
  if (!query || query.length < 2) {
    return res.json([]);
  }

  try {
    const results = await FitetClient.searchAtleta(query);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Force refresh all caches
app.post('/api/refresh', async (req, res) => {
  try {
    cacheService.clear();
    const [rawClassifica, calendario, statisticheAtleti] = await Promise.all([
      getClassifica(true),
      getCalendario(true),
      getStatistiche(true),
    ]);
    const classifica = computeTeamForm(rawClassifica, calendario);
    res.json({ success: true, timestamp: new Date().toISOString(), classifica, calendario, statisticheAtleti });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Serve static frontend files in production if dist exists (when running as standalone node server)
const distPath = path.resolve(process.cwd(), 'dist');
app.use(express.static(distPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexFile = path.join(distPath, 'index.html');
  res.sendFile(indexFile, (err) => {
    if (err) res.status(404).send('Not Found');
  });
});

export default app;
