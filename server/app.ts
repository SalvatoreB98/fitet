import express from 'express';
import cors from 'cors';
import path from 'path';
import { FitetClient } from './services/fitetClient';
import { cacheService } from './services/cacheService';
import { athleteResolver } from './services/athleteResolver';
import { teamResolver } from './services/teamResolver';
import { championshipCatalog } from './services/championshipCatalog';
import { parseClassifica } from './parsers/classificaParser';
import { parseCalendario } from './parsers/calendarioParser';
import { parseStatisticheAtleti } from './parsers/statisticheParser';
import { parseDettaglioAtleta, extractRankingIframeUrl, parsePartiteRanking } from './parsers/atletaParser';
import { parseDettaglioSquadra } from './parsers/squadraParser';
import { parseRefertoIncontro, parseDettaglioPartita } from './parsers/refertoParser';
import * as cheerio from 'cheerio';
import {
  DashboardData,
  SquadraClassifica,
  GiornataCalendario,
  StatisticaAtleta,
  PartitaCampionatoAtleta,
  AtletaCampionatoPartiteResponse,
} from '../src/types/fitet';

export const app = express();

app.use(cors());
app.use(express.json());

// Championship defaults
const DEFAULT_CAM_ID = 794;
const DEFAULT_ANNO_ID = 41;

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
 * Fetch and parse Classifica with auto team logos
 */
async function getClassifica(camId = DEFAULT_CAM_ID, annoId = DEFAULT_ANNO_ID, forceRefresh = false): Promise<SquadraClassifica[]> {
  const cacheKey = `classifica_${camId}`;
  if (!forceRefresh) {
    const cached = cacheService.get<SquadraClassifica[]>(cacheKey);
    if (cached) return cached;
  }

  const html = await FitetClient.fetchClassifica(camId);
  const data = parseClassifica(html);

  // Auto-resolve society logos from FITeT for any newly encountered teams
  try {
    const teamsToResolve = data.map((t) => ({ nome: t.nome, squadraId: t.squadraId }));
    await teamResolver.resolveLogosForTeams(teamsToResolve, camId, annoId);
  } catch (err) {
    console.warn(`[TeamResolver] Warning resolving team logos for CAM ${camId}:`, err);
  }

  const withLogos = data.map((t) => ({
    ...t,
    logoUrl: teamResolver.getLogo(t.nome),
  }));

  cacheService.set(cacheKey, withLogos, TTL_CLASSIFICA);
  return withLogos;
}

/**
 * Fetch and parse Calendario
 */
async function getCalendario(camId = DEFAULT_CAM_ID, annoId = DEFAULT_ANNO_ID, forceRefresh = false): Promise<GiornataCalendario[]> {
  const cacheKey = `calendario_${camId}_${annoId}`;
  if (!forceRefresh) {
    const cached = cacheService.get<GiornataCalendario[]>(cacheKey);
    if (cached) return cached;
  }

  const html = await FitetClient.fetchCalendario(camId, annoId);
  const data = parseCalendario(html);
  cacheService.set(cacheKey, data, TTL_CALENDARIO);
  return data;
}

/**
 * Fetch and parse Statistiche Atleti with auto athlete ID resolution
 */
async function getStatistiche(camId = DEFAULT_CAM_ID, forceRefresh = false, squadraIds: string[] = []): Promise<StatisticaAtleta[]> {
  const cacheKey = `statistiche_${camId}`;
  if (!forceRefresh) {
    const cached = cacheService.get<StatisticaAtleta[]>(cacheKey);
    if (cached) return cached;
  }

  // Auto-resolve athlete IDs for this championship from teams' percentuali.php
  try {
    if (squadraIds.length > 0) {
      await athleteResolver.resolveAthletesForChampionship(camId, squadraIds);
    }
  } catch (err) {
    console.warn(`[AthleteResolver] Warning resolving athletes for CAM ${camId}:`, err);
  }

  const html = await FitetClient.fetchStatisticheAtleti(camId);
  const mapping = athleteResolver.getMapping();
  const data = parseStatisticheAtleti(html, mapping);
  cacheService.set(cacheKey, data, TTL_STATISTICHE);
  return data;
}

// ======================== API ROUTES ========================

// 0. All Championships Catalog
app.get('/api/campionati', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  try {
    const campionati = await championshipCatalog.getAllCampionati(forceRefresh);
    res.json(campionati);
  } catch (error: any) {
    console.error('Error fetching championship catalog:', error);
    res.status(500).json({ error: error.message });
  }
});

// 1. Full Dashboard Endpoint
app.get('/api/dashboard', async (req, res) => {
  const cam = req.query.cam ? parseInt(req.query.cam as string, 10) : DEFAULT_CAM_ID;
  const anno = req.query.anno ? parseInt(req.query.anno as string, 10) : DEFAULT_ANNO_ID;
  const forceRefresh = req.query.refresh === 'true';

  try {
    // 1. Fetch Classifica & Calendario in parallel
    const [rawClassifica, calendario, champMeta] = await Promise.all([
      getClassifica(cam, anno, forceRefresh),
      getCalendario(cam, anno, forceRefresh),
      championshipCatalog.getChampionship(cam),
    ]);

    // 2. Fetch Statistiche passing squadraIds so athlete IDs are indexed
    const squadraIds = rawClassifica.map((s) => s.squadraId).filter(Boolean);
    const statisticheAtleti = await getStatistiche(cam, forceRefresh, squadraIds);

    const classifica = computeTeamForm(rawClassifica, calendario);

    const payload: DashboardData = {
      classifica,
      calendario,
      statisticheAtleti,
      lastUpdated: new Date().toISOString(),
      championship: {
        id: cam,
        anno,
        nome: champMeta?.nome || `Campionato ${cam}`,
        girone: champMeta?.nome || '',
        regione: champMeta?.regione || 'Nazionale',
      },
    };

    res.json(payload);
  } catch (error: any) {
    console.error(`Error fetching dashboard data for CAM=${cam}:`, error);
    res.status(500).json({ error: 'Errore durante il recupero dei dati FITeT', details: error.message });
  }
});

// 2. Classifica standalone
app.get('/api/classifica', async (req, res) => {
  const cam = req.query.cam ? parseInt(req.query.cam as string, 10) : DEFAULT_CAM_ID;
  const anno = req.query.anno ? parseInt(req.query.anno as string, 10) : DEFAULT_ANNO_ID;
  const forceRefresh = req.query.refresh === 'true';
  try {
    const data = await getClassifica(cam, anno, forceRefresh);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Calendario standalone
app.get('/api/calendario', async (req, res) => {
  const cam = req.query.cam ? parseInt(req.query.cam as string, 10) : DEFAULT_CAM_ID;
  const anno = req.query.anno ? parseInt(req.query.anno as string, 10) : DEFAULT_ANNO_ID;
  const forceRefresh = req.query.refresh === 'true';
  try {
    const data = await getCalendario(cam, anno, forceRefresh);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Statistiche Atleti standalone
app.get('/api/statistiche', async (req, res) => {
  const cam = req.query.cam ? parseInt(req.query.cam as string, 10) : DEFAULT_CAM_ID;
  const forceRefresh = req.query.refresh === 'true';
  try {
    const classifica = await getClassifica(cam, DEFAULT_ANNO_ID, false);
    const squadraIds = classifica.map((s) => s.squadraId).filter(Boolean);
    const data = await getStatistiche(cam, forceRefresh, squadraIds);
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
      const cached = cacheService.get<any>(cacheKey);
      if (cached && cached.partiteRanking) return res.json(cached);
    }

    const html = await FitetClient.fetchSchedaAtleta(id);

    // Extract & parse official ranking matches from #fragment-3 iframe
    let partiteRanking = undefined;
    const iframeUrl = extractRankingIframeUrl(html);
    if (iframeUrl) {
      try {
        const iframeHtml = await FitetClient.fetchHtml(iframeUrl, false);
        partiteRanking = parsePartiteRanking(iframeHtml, id);
      } catch (iframeErr) {
        console.warn(`Could not fetch ranking matches iframe for athlete ${id}:`, iframeErr);
      }
    }

    const atleta = parseDettaglioAtleta(html, id, partiteRanking);
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
    const enriched = results.map((r) => {
      const dateMatch = r.label ? r.label.match(/\((\d{2}\/\d{2}\/\d{4})\)/) : null;
      const tesseraMatch = r.label ? r.label.match(/\[(\d+)\]/) : null;
      return {
        id: r.id,
        value: r.value,
        label: r.label,
        dataNascita: dateMatch ? dateMatch[1] : null,
        tessera: tesseraMatch ? tesseraMatch[1] : null,
        fotoUrl: `https://portale.fitet.org/images/atleti/${r.id}.jpg`,
      };
    });
    res.json(enriched);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Referto Incontro Gara
app.get('/api/referto/:incontroId', async (req, res) => {
  const { incontroId } = req.params;
  const cam = req.query.cam ? parseInt(req.query.cam as string, 10) : 0;
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

// 8. Dettaglio Squadra & Percentuali Atleti
app.get('/api/squadra/:squadraId', async (req, res) => {
  const { squadraId } = req.params;
  const cam = req.query.cam ? parseInt(req.query.cam as string, 10) : DEFAULT_CAM_ID;
  const anno = req.query.anno ? parseInt(req.query.anno as string, 10) : DEFAULT_ANNO_ID;
  const forceRefresh = req.query.refresh === 'true';

  if (!squadraId || squadraId === 'null' || squadraId === 'undefined') {
    return res.status(400).json({ error: 'ID squadra non valido' });
  }

  try {
    let targetSquadraId = squadraId;

    // Se l'ID non è numerico, cerchiamo nella classifica per nome squadra
    if (!/^\d+$/.test(targetSquadraId)) {
      const decodedName = decodeURIComponent(targetSquadraId).trim().toUpperCase();
      let rawClassifica = cacheService.get(`classifica_${cam}_${anno}`);
      if (!rawClassifica) {
        rawClassifica = await getClassifica(cam, anno);
      }
      if (Array.isArray(rawClassifica)) {
        const found = rawClassifica.find((sq: any) =>
          sq.nome.toUpperCase().trim() === decodedName ||
          sq.nome.toUpperCase().includes(decodedName) ||
          decodedName.includes(sq.nome.toUpperCase())
        );
        if (found && found.squadraId) {
          targetSquadraId = found.squadraId;
        }
      }
    }

    const cacheKey = `squadra_${targetSquadraId}_${cam}_${anno}`;

    if (!forceRefresh) {
      const cached = cacheService.get(cacheKey);
      if (cached) return res.json(cached);
    }

    const url = `https://portale.fitet.org/risultati/campionati/percentuali.php?SQUADRA=${targetSquadraId}&CAM=${cam}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const buffer = await response.arrayBuffer();
    const html = new TextDecoder('iso-8859-1').decode(buffer);

    // Parse team and players
    const parsed = parseDettaglioSquadra(html, targetSquadraId, cam);

    // Resolve logo
    let logoUrl = teamResolver.getLogo(parsed.nome);
    if (!logoUrl && targetSquadraId) {
      const resolved = await teamResolver.resolveLogosForTeams([{ nome: parsed.nome, squadraId: targetSquadraId }], cam, anno);
      logoUrl = resolved[parsed.nome.toUpperCase().trim()] || teamResolver.getLogo(parsed.nome);
    }
    parsed.logoUrl = logoUrl;

    cacheService.set(cacheKey, parsed, 60 * 60 * 1000); // 1 hour
    res.json(parsed);
  } catch (error: any) {
    console.error(`Error fetching team ${squadraId} in CAM ${cam}:`, error);
    res.status(500).json({ error: 'Errore nel recupero della scheda squadra', details: error.message });
  }
});

// 6. Partite disputate dall'atleta nel campionato
app.get('/api/atleta-campionato-partite', async (req, res) => {
  const atletaId = req.query.atletaId as string;
  const cam = req.query.cam as string;
  let squadraId = req.query.squadraId as string | undefined;
  const atletaNome = req.query.atletaNome as string | undefined;

  if (!atletaId || !cam) {
    return res.status(400).json({ error: 'Parametri atletaId e cam obbligatori' });
  }

  const cacheKey = `atleta_camp_partite_${cam}_${atletaId}_${squadraId || 'auto'}`;
  const cached = cacheService.get<AtletaCampionatoPartiteResponse>(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  try {
    let squadraNome: string | undefined;

    // Se squadraId non è fornito, cerchiamo squadra e squadraId dal campionato
    if (!squadraId) {
      const statHtml = await FitetClient.fetchStatisticheAtleti(cam);
      const stats = parseStatisticheAtleti(statHtml);
      const found = stats.find(
        (s) =>
          (s.atletaId && String(s.atletaId) === String(atletaId)) ||
          (atletaNome && s.atleta.toUpperCase().trim() === atletaNome.toUpperCase().trim())
      );

      if (found) {
        squadraNome = found.squadra;
        const classHtml = await FitetClient.fetchClassifica(cam);
        const $c = cheerio.load(classHtml);
        $c('a[href*="SQUADRA="]').each((_, el) => {
          const text = $c(el).text().trim();
          if (text.toUpperCase() === found.squadra.toUpperCase()) {
            const href = $c(el).attr('href') || '';
            const m = href.match(/SQUADRA=(\d+)/i);
            if (m) squadraId = m[1];
          }
        });
      }
    }

    if (!squadraId) {
      const responsePayload: AtletaCampionatoPartiteResponse = {
        camId: cam,
        matches: [],
        error: 'Atleta non presente tra le squadre o le statistiche del campionato selezionato',
      };
      cacheService.set(cacheKey, responsePayload, 10 * 60 * 1000);
      return res.json(responsePayload);
    }

    const url = `https://portale.fitet.org/risultati/campionati/dettaglio_percentuali.php?IDA=${atletaId}&CAM=${cam}&SQUADRA=${squadraId}`;
    const html = await FitetClient.fetchHtml(url);
    const $p = cheerio.load(html);
    const matches: PartitaCampionatoAtleta[] = [];

    // Estrai il nome della squadra dal titolo se non noto
    if (!squadraNome) {
      const headerText = $p('table tr').first().text();
      const sqMatch = headerText.match(/Squadra:\s*([^\n\t\-]+)/i);
      if (sqMatch) {
        squadraNome = sqMatch[1].trim();
      }
    }

    $p('table tr').each((i, tr) => {
      if (i < 2) return; // Salta intestazione squadra e testata colonne
      const cells = $p(tr).find('td').map((_, td) => $p(td).text().trim()).get();
      if (cells.length < 15) return;

      const giornata = parseInt(cells[0], 10) || 0;
      const atleta1 = cells[1];
      const atleta2 = cells[2];

      const setsRaw: string[] = [];
      for (let s = 0; s < 5; s++) {
        const a = parseInt(cells[3 + s * 2], 10);
        const b = parseInt(cells[4 + s * 2], 10);
        if ((a > 0 || b > 0) && !isNaN(a) && !isNaN(b)) {
          setsRaw.push(`${a}-${b}`);
        }
      }

      const set1 = parseInt(cells[13], 10) || 0;
      const set2 = parseInt(cells[14], 10) || 0;

      // Determina se l'atleta analizzato è Atleta 1 o Atleta 2
      const isPlayer1 = atletaNome
        ? atleta1.toUpperCase().includes(atletaNome.toUpperCase()) || atletaNome.toUpperCase().includes(atleta1.toUpperCase())
        : !atleta2.toUpperCase().includes(atletaNome?.toUpperCase() || '');

      const avversario = isPlayer1 ? atleta2 : atleta1;
      const setVinti = isPlayer1 ? set1 : set2;
      const setPersi = isPlayer1 ? set2 : set1;
      const isVittoria = setVinti > setPersi;

      const setsFormatted = setsRaw.map((s) => {
        const [a, b] = s.split('-').map(Number);
        return isPlayer1 ? `${a}-${b}` : `${b}-${a}`;
      });

      matches.push({
        giornata,
        avversario,
        squadra: squadraNome || '',
        setVinti,
        setPersi,
        risultatoSet: `${setVinti}-${setPersi}`,
        sets: setsFormatted,
        isVittoria,
      });
    });

    const responsePayload: AtletaCampionatoPartiteResponse = {
      camId: cam,
      squadra: squadraNome,
      matches,
    };

    cacheService.set(cacheKey, responsePayload, 30 * 60 * 1000); // 30 min
    res.json(responsePayload);
  } catch (err: any) {
    console.error('Errore nel recupero partite campionato per atleta:', err);
    res.status(500).json({ error: 'Errore durante la lettura delle partite dal portale FITeT', details: err.message });
  }
});


// 7. Force refresh all caches
app.post('/api/refresh', async (req, res) => {
  const cam = req.query.cam || req.body?.cam ? parseInt((req.query.cam || req.body?.cam) as string, 10) : DEFAULT_CAM_ID;
  const anno = req.query.anno || req.body?.anno ? parseInt((req.query.anno || req.body?.anno) as string, 10) : DEFAULT_ANNO_ID;

  try {
    cacheService.clear();
    athleteResolver.reloadMapping();
    const [rawClassifica, calendario, statisticheAtleti] = await Promise.all([
      getClassifica(cam, anno, true),
      getCalendario(cam, anno, true),
      getStatistiche(cam, true),
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
