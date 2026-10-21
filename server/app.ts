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
import { parseRefertoIncontro, parseDettaglioPartita } from './parsers/refertoParser';
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
const TTL_REFERTO = 12 * 60 * 60 * 1000; // 12 hours

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
  let { id } = req.params;
  const forceRefresh = req.query.refresh === 'true';

  if (!id || id === 'null' || id === 'undefined') {
    return res.status(400).json({ error: 'ID atleta non valido' });
  }

  // Se l'ID non è puramente numerico (es. passato il nome atleta), risolvilo dinamicamente
  if (!/^\d+$/.test(id)) {
    const cleanName = decodeURIComponent(id).trim();
    const resolvedId = await athleteResolver.resolveAthleteId(cleanName);
    if (resolvedId) {
      id = resolvedId;
    } else {
      return res.status(404).json({ error: `Impossibile risolvere ID federale per "${cleanName}"` });
    }
  }

  const cacheKey = `atleta_${id}`;

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

// 7. Referto Incontro Gara
app.get('/api/referto/:incontroId', async (req, res) => {
  const { incontroId } = req.params;
  const cam = req.query.cam ? parseInt(req.query.cam as string, 10) : CAM_ID;
  const formula = req.query.formula ? parseInt(req.query.formula as string, 10) : 19;
  const forceRefresh = req.query.refresh === 'true';
  const cacheKey = `referto_${incontroId}_${cam}_${formula}`;

  if (!incontroId || incontroId === 'null' || incontroId === 'undefined') {
    return res.status(400).json({ error: 'ID incontro non valido' });
  }

  try {
    if (!forceRefresh) {
      const cached = cacheService.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const html = await FitetClient.fetchRefertoIncontro(incontroId, cam, formula);
    const referto = parseRefertoIncontro(html, incontroId, String(cam), String(formula));
    cacheService.set(cacheKey, referto, TTL_REFERTO);
    res.json(referto);
  } catch (error: any) {
    console.error(`Error fetching referto ${incontroId}:`, error);
    res.status(500).json({ error: 'Errore nel recupero del referto di gara', details: error.message });
  }
});

// 8. Dettaglio Singola Partita Individuale
app.get('/api/partita/:partitaId', async (req, res) => {
  const { partitaId } = req.params;
  const forceRefresh = req.query.refresh === 'true';
  const cacheKey = `partita_${partitaId}`;

  if (!partitaId || partitaId === 'null' || partitaId === 'undefined') {
    return res.status(400).json({ error: 'ID partita non valido' });
  }

  try {
    if (!forceRefresh) {
      const cached = cacheService.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const html = await FitetClient.fetchDettaglioPartita(partitaId);
    const dettaglio = parseDettaglioPartita(html, partitaId);

    // Risoluzione automatica ID atleta per giocatori privi di foto su FITeT
    if (!dettaglio.atletaCasa.atletaId && dettaglio.atletaCasa.nome) {
      const primaryName = dettaglio.atletaCasa.nome.split('-')[0].trim();
      const resolved = await athleteResolver.resolveAthleteId(primaryName);
      if (resolved) dettaglio.atletaCasa.atletaId = resolved;
    }
    if (!dettaglio.atletaOspite.atletaId && dettaglio.atletaOspite.nome) {
      const primaryName = dettaglio.atletaOspite.nome.split('-')[0].trim();
      const resolved = await athleteResolver.resolveAthleteId(primaryName);
      if (resolved) dettaglio.atletaOspite.atletaId = resolved;
    }

    cacheService.set(cacheKey, dettaglio, TTL_ATLETA);
    res.json(dettaglio);
  } catch (error: any) {
    console.error(`Error fetching dettaglio partita ${partitaId}:`, error);
    res.status(500).json({ error: 'Errore nel recupero del dettaglio partita', details: error.message });
  }
});

// 7. Force refresh all caches
app.post('/api/refresh', async (req, res) => {
  try {
    cacheService.clear();
    athleteResolver.reloadMapping();
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

// Serve static frontend files in production only when running as standalone node server (not on Vercel)
if (!process.env.VERCEL) {
  const distPath = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    const indexFile = path.join(distPath, 'index.html');
    res.sendFile(indexFile, (err) => {
      if (err) res.status(404).send('Not Found');
    });
  });
}

export default app;
