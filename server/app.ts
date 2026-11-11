import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { FitetClient, withFitetCacheBypass } from './services/fitetClient';
import { cacheService } from './services/cacheService';
import { viewsService } from './services/viewsService';
import { analyticsService, normalizeAnalyticsPagePath } from './services/analyticsService';
import { renderAnalyticsAdminHtml } from './routes/analyticsAdminHtml';
import { athleteResolver } from './services/athleteResolver';
import { teamResolver } from './services/teamResolver';
import { championshipCatalog, normalizeChampionshipGender } from './services/championshipCatalog';
import { parseClassifica } from './parsers/classificaParser';
import { parseCalendario } from './parsers/calendarioParser';
import { parseStatisticheAtleti } from './parsers/statisticheParser';
import { parseDettaglioAtleta, extractRankingIframeUrl, parsePartiteRanking } from './parsers/atletaParser';
import { headToHeadService } from './services/headToHeadService';
import { handlePredictH2H } from '../api/predict-h2h';
import { generateAthleteOgCard, generateAthleteStoryCard } from './services/socialCardService';
import {
    pushService,
    notifyRankingChangeIfNeeded,
} from './services/pushService';
import { youtubeSyncService } from './services/youtubeSyncService';
import {
    checkNewTorneiAndNotify,
    startDailyTorneiScheduler,
} from './services/torneiNotificationService';
import {
    notifyObservedChampionshipIfNeeded,
    invalidateSubscribedChampionshipsCache,
    ensureChampionshipBaseline,
    checkChampionshipsAndNotify,
    checkMatchdayAndNotify,
    startChampionshipScheduler,
} from './services/campionatoNotificationService';
import type { PushSubscriptionPayload, PushSubscriptionContext } from './services/pushService';
import { parseDettaglioSquadra } from './parsers/squadraParser';
import { parseRefertoIncontro, parseDettaglioPartita } from './parsers/refertoParser';
import { parseRankingHtml } from './parsers/rankingParser';
import { parseSceltaAtleta } from './parsers/sceltaAtletaParser';
import {
    parseTestaTornei,
    parseElencoTornei,
    parseMenuManifestazioni,
    parseDettaglioTorneo,
    parseIscrizioniGara,
    parseGestioneGara,
    parseRisultatiGironi,
    parseRisultatiTabellone,
    COMIT_NAMES,
} from './parsers/torneiParser';
import { RANKING_CATEGORIES, getRankingCategoryByKey } from '../src/constants/rankingCategories';
import { TORNEI_CATEGORIES, getTorneoCategoryByKey } from '../src/constants/torneiCategories';
import { torneoMatchesRegion } from '../src/utils/torneoMap';
import * as cheerio from 'cheerio';
import {
    DashboardData,
    SquadraClassifica,
    GiornataCalendario,
    StatisticaAtleta,
    PartitaCampionatoAtleta,
    AtletaCampionatoPartiteResponse,
    PartiteRankingAtleta,
    DettaglioAtleta,
    ChampionshipItem,
    AthleteSearchResult,
    TorneoSectionResult,
    TorneiResponse,
    TorneoDettaglioResponse,
    TorneoGaraDettaglioResponse,
    TorneoMatchItem,
} from '../src/types/fitet';

export const app = express();

app.use(cors());
app.use(express.json());

// Blocco preventivo bot e crawler aggressivi che consumano CPU scansionando API
const AGGRESSIVE_BOT_REGEX = /AhrefsBot|SemrushBot|DotBot|PetalBot|Bytespider|MJ12bot|MegaIndex|BLEXBot|ZoominfoBot/i;
app.use((req, res, next) => {
    const userAgent = (req.headers['user-agent'] as string) || '';
    if (AGGRESSIVE_BOT_REGEX.test(userAgent) && (req.path.startsWith('/api') || req.path.startsWith('/player/'))) {
        return res.status(403).send('Forbidden');
    }
    return next();
});

/**
 * Cache HTTP per le risposte pubbliche:
 * - Cache CDN per rispondere dagli edge server Vercel riducendo il carico CPU serverless.
 * - Esclusi cron jobs, route push di mutazione e richieste di refresh manuale (`?refresh=true` / `?force=true`).
 * - Il bypass della cache è ignorato per bot/crawler per evitare che azzerino la cache.
 */
const BOT_USER_AGENT_REGEX = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|embedly|quora|pinterest|slackbot|vkshare|w3c_validator|AhrefsBot|SemrushBot|DotBot|PetalBot|Bytespider|MJ12bot|MegaIndex|BLEXBot|ZoominfoBot/i;

function isForceRefreshRequest(req: express.Request): boolean {
    const userAgent = (req.headers['user-agent'] as string) || '';
    if (BOT_USER_AGENT_REGEX.test(userAgent)) {
        return false;
    }
    if (req.query.refresh === 'true' || req.query.force === 'true') {
        return true;
    }
    return req.method === 'POST' && req.path === '/api/refresh';
}

// Le richieste di refresh manuale ignorano anche la cache upstream FITeT.
app.use((req, _res, next) => {
    if (isForceRefreshRequest(req)) {
        return withFitetCacheBypass(next);
    }
    return next();
});

const CDN_HEADER_DEFAULT = 'public, s-maxage=900, stale-while-revalidate=86400';
const BROWSER_HEADER_DEFAULT = 'public, max-age=120, stale-while-revalidate=3600';

app.use((req, res, next) => {
    if (req.method !== 'GET') return next();

    // Segnala a motori di ricerca e bot di non indicizzare gli endpoint API e la dashboard admin
    if (req.path.startsWith('/api/') || req.path.startsWith('/admin')) {
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }

    // Cron jobs, sincronizzazioni video, analytics admin e richieste con force refresh: non devono MAI essere cachati
    if (
        req.path.startsWith('/api/push/') ||
        req.path.startsWith('/api/videos/sync') ||
        req.path === '/api/analytics' ||
        req.path.startsWith('/admin') ||
        isForceRefreshRequest(req)
    ) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
        res.setHeader('CDN-Cache-Control', 'no-store');
        return next();
    }

    // Cache CDN e browser bilanciata per le risposte GET pubbliche
    res.setHeader('Vercel-CDN-Cache-Control', CDN_HEADER_DEFAULT);
    res.setHeader('CDN-Cache-Control', CDN_HEADER_DEFAULT);
    res.setHeader('Cache-Control', BROWSER_HEADER_DEFAULT);

    // Non lasciare che errori 4xx/5xx vengano memorizzati dalla CDN.
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
        if (res.statusCode >= 400) {
            res.removeHeader('Vercel-CDN-Cache-Control');
            res.removeHeader('CDN-Cache-Control');
            res.setHeader('Cache-Control', 'no-store');
        }
        return originalJson(body);
    }) as typeof res.json;

    return next();
});

const ANALYTICS_STATIC_ASSET_REGEX = /\.(js|mjs|css|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|eot|otf|map|json|xml|txt|webmanifest|pdf|mp4|webm|mp3)$/i;

const trackRequestDailyVisitor = (req: express.Request): Promise<void> => {
    const userAgent = (req.headers['user-agent'] as string) || '';
    const purpose = String(req.headers['purpose'] || req.headers['sec-purpose'] || '').toLowerCase();
    if (BOT_USER_AGENT_REGEX.test(userAgent) || purpose.includes('prefetch')) {
        return Promise.resolve();
    }

    const forwarded = typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : '';
    const ip = forwarded || req.socket?.remoteAddress || '';
    const visitorHash = analyticsService.computeDailyVisitorHash(ip, userAgent);
    return analyticsService.trackDailyVisitor(visitorHash);
};

// Middleware analytics GDPR-compliant: nessun cookie, nessun IP salvato, ignora asset, /api e /admin
app.use((req, _res, next) => {
    if (req.method !== 'GET') return next();
    const reqPath = req.path || '/';
    if (
        reqPath.startsWith('/api') ||
        reqPath.startsWith('/admin') ||
        reqPath.startsWith('/assets') ||
        ANALYTICS_STATIC_ASSET_REGEX.test(reqPath)
    ) {
        return next();
    }

    const userAgent = (req.headers['user-agent'] as string) || '';
    const purpose = String(req.headers['purpose'] || req.headers['sec-purpose'] || '').toLowerCase();
    if (BOT_USER_AGENT_REGEX.test(userAgent) || purpose.includes('prefetch')) {
        return next();
    }

    void analyticsService.incrementMetric('page', normalizeAnalyticsPagePath(reqPath));
    void trackRequestDailyVisitor(req);
    return next();
});

// Championship defaults
const DEFAULT_CAM_ID = 794;
const DEFAULT_ANNO_ID = 41;

// Cache TTLs in-memory (ms) - Incrementati per minimizzare il parsing Cheerio e richieste HTTP FITeT
const TTL_CLASSIFICA = 4 * 60 * 60 * 1000; // 4 ore
const TTL_CALENDARIO = 4 * 60 * 60 * 1000; // 4 ore
const TTL_STATISTICHE = 6 * 60 * 60 * 1000; // 6 ore
const TTL_ATLETA = 7 * 24 * 60 * 60 * 1000; // 7 giorni
const TTL_REFERTO = 7 * 24 * 60 * 60 * 1000; // 7 giorni
const TTL_RICERCA_ATLETA = 24 * 60 * 60 * 1000; // 24 ore

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
 * Risolve i campionati giocati dall'atleta a partire dalle partite di ranking.
 *
 * Il nome del campionato nel ranking non distingue maschile/femminile
 * (es. "A/1 Gir.U" vale sia per la Serie A1 maschile che femminile): la colonna
 * "sesso" della tabella ranking è l'unica informazione affidabile per scegliere
 * il campionato corretto.
 */
function resolveAthleteChampionshipsFromRanking(
    campRanking: Array<{ campionato?: string; sesso?: string }>,
    regione?: string
): {
    playedCamps: Array<{ camId: number; nome: string; categoria?: string; regione?: string; squadra?: string }>;
    athleteSesso?: 'M' | 'F';
} {
    const uniqueCampNames: string[] = [];
    for (const m of campRanking) {
        const trimmed = m.campionato?.trim();
        if (trimmed && !uniqueCampNames.includes(trimmed)) {
            uniqueCampNames.push(trimmed);
        }
    }

    const campSessoByName = new Map<string, 'M' | 'F'>();
    const sessoCounts: Record<'M' | 'F', number> = { M: 0, F: 0 };
    for (const m of campRanking) {
        const name = m.campionato?.trim();
        if (!name) continue;
        const campSesso = normalizeChampionshipGender(m.sesso);
        if (!campSesso) continue;
        if (!campSessoByName.has(name)) campSessoByName.set(name, campSesso);
        sessoCounts[campSesso] += 1;
    }

    const athleteSesso: 'M' | 'F' | undefined =
        sessoCounts.M > sessoCounts.F ? 'M' : sessoCounts.F > sessoCounts.M ? 'F' : undefined;

    const playedCamps: Array<{ camId: number; nome: string; categoria?: string; regione?: string; squadra?: string }> = [];
    for (const cName of uniqueCampNames) {
        const resolved = championshipCatalog.resolveChampionship(
            cName,
            regione,
            campSessoByName.get(cName) || athleteSesso
        );
        if (resolved && !playedCamps.some(pc => pc.camId === resolved.id)) {
            playedCamps.push({
                camId: resolved.id,
                nome: resolved.nome,
                categoria: resolved.categoria,
                regione: resolved.regione,
            });
        }
    }

    return { playedCamps, athleteSesso };
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
 * Arricchisce gli incontri di calendario con eventuali video YouTube associati
 */
async function enrichCalendarioWithVideos(
    calendario: GiornataCalendario[],
    camId: number,
    championshipName?: string,
    forceRefresh = false
): Promise<GiornataCalendario[]> {
    try {
        if (!Array.isArray(calendario) || calendario.length === 0) return calendario;

        const videos = await youtubeSyncService.getAllVideos(forceRefresh);
        if (!videos || videos.length === 0) return calendario;

        const enrichPartita = (partita: GiornataCalendario['partiteAndata'][number]) => {
            const matched = youtubeSyncService.matchVideosForMatch(videos, {
                giornata: partita.giornata,
                squadraCasa: partita.squadraCasa,
                squadraOspite: partita.squadraOspite,
                camId,
                championshipName,
            });

            if (matched.length > 0) {
                const primary = matched[0];
                return {
                    ...partita,
                    youtubeVideoId: primary.video_id,
                    video: {
                        videoId: primary.video_id,
                        channelName: primary.channel_name,
                        channelUrl: primary.channel_url,
                        title: primary.title,
                        publishedAt: primary.published_at,
                        league: primary.league,
                        matchDay: primary.match_day,
                        teamHome: primary.team_home,
                        teamAway: primary.team_away,
                    },
                    videos: matched.map((v) => ({
                        videoId: v.video_id,
                        channelName: v.channel_name,
                        channelUrl: v.channel_url,
                        title: v.title,
                        publishedAt: v.published_at,
                        league: v.league,
                        matchDay: v.match_day,
                        teamHome: v.team_home,
                        teamAway: v.team_away,
                    })),
                };
            }

            return partita;
        };

        return calendario.map((giornata) => ({
            ...giornata,
            partiteAndata: Array.isArray(giornata.partiteAndata)
                ? giornata.partiteAndata.map(enrichPartita)
                : [],
            partiteRitorno: Array.isArray(giornata.partiteRitorno)
                ? giornata.partiteRitorno.map(enrichPartita)
                : [],
        }));
    } catch (err) {
        console.warn('[EnrichCalendario] Errore associazione video YouTube:', err);
        return calendario;
    }
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
    const forceRefresh = isForceRefreshRequest(req);
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
    const forceRefresh = isForceRefreshRequest(req);

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
        const enrichedCalendario = await enrichCalendarioWithVideos(calendario, cam, champMeta?.nome, forceRefresh);

        const payload: DashboardData = {
            classifica,
            calendario: enrichedCalendario,
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
    const forceRefresh = isForceRefreshRequest(req);
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
    const forceRefresh = isForceRefreshRequest(req);
    try {
        const data = await getCalendario(cam, anno, forceRefresh);
        const champMeta = await championshipCatalog.getChampionship(cam);
        const enriched = await enrichCalendarioWithVideos(data, cam, champMeta?.nome, forceRefresh);
        res.json(enriched);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Statistiche Atleti standalone
app.get('/api/statistiche', async (req, res) => {
    const cam = req.query.cam ? parseInt(req.query.cam as string, 10) : DEFAULT_CAM_ID;
    const forceRefresh = isForceRefreshRequest(req);
    try {
        const classifica = await getClassifica(cam, DEFAULT_ANNO_ID, forceRefresh);
        const squadraIds = classifica.map((s) => s.squadraId).filter(Boolean);
        const data = await getStatistiche(cam, forceRefresh, squadraIds);
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export const DEFAULT_ID_CLASS = 248;

/**
 * Rileva dinamicamente l'ID_CLASS della classifica più recente da portale.fitet.org/menu.php.
 * Quando esce il mese nuovo (es. 249, 250...), viene rilevato automaticamente senza modifiche al codice.
 * Se non disponibile o in caso di errore, fa fallback sicuro su DEFAULT_ID_CLASS.
 */
export async function getLatestIdClass(
    forceRefresh = false,
    notifyOnChange = true
): Promise<number> {
    const cacheKey = 'latest_ranking_id_class';
    if (!forceRefresh) {
        const cached = cacheService.get<number>(cacheKey);
        if (cached && typeof cached === 'number' && cached >= DEFAULT_ID_CLASS) {
            return cached;
        }
    }
    try {
        const html = await FitetClient.fetchHtml('https://portale.fitet.org/menu.php');
        const match = html.match(/testaclassifica_auto\.php\?ID_CLASS=(\d+)/i);
        if (match && match[1]) {
            const detected = parseInt(match[1], 10);
            if (detected >= DEFAULT_ID_CLASS) {
                cacheService.set(cacheKey, detected, 4 * 60 * 60 * 1000); // 4 ore di cache

                // Trigger automatico: se l'ID_CLASS è cambiato rispetto all'ultima
                // notifica salvata su Supabase, invia la push a tutti i dispositivi.
                // Fire-and-forget: non blocca la risposta API.
                if (notifyOnChange) {
                    notifyRankingChangeIfNeeded(detected).catch((pushErr) => {
                        console.warn('[PushService] Errore notifica cambio ID_CLASS:', pushErr);
                    });
                }

                return detected;
            }
        }
    } catch (err) {
        console.warn('[Ranking] Impossibile rilevare automaticamente ID_CLASS da menu.php, uso fallback:', err);
    }
    return DEFAULT_ID_CLASS;
}

// 4b. Classifiche Nazionali e Regionali FITeT
app.get('/api/ranking', async (req, res) => {
    const sesso = (req.query.sesso === 'F' ? 'F' : 'M') as 'M' | 'F';
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const comit = req.query.comit ? String(req.query.comit).trim() : '';
    const forceRefresh = isForceRefreshRequest(req);

    // Rileva automaticamente l'ID classifica attuale (es. 248, 249...), consentendo override via query param
    const idClass = req.query.idClass ? parseInt(req.query.idClass as string, 10) : await getLatestIdClass(forceRefresh);

    // Category / Filter parameters
    const categoryKey = (req.query.category as string) || '';
    const catDef = categoryKey ? getRankingCategoryByKey(categoryKey) : undefined;

    const tipo = req.query.tipo !== undefined ? String(req.query.tipo) : (catDef ? String(catDef.tipo) : '1');
    const sett = req.query.sett !== undefined ? String(req.query.sett) : (catDef ? catDef.sett : '0');
    const s = req.query.s !== undefined ? String(req.query.s) : (catDef ? String(catDef.s) : '0');
    const fq = req.query.fq !== undefined ? String(req.query.fq) : (catDef ? String(catDef.fq) : '0');
    const g = req.query.g !== undefined ? String(req.query.g) : (catDef ? String(catDef.g) : '0');
    const v = req.query.v !== undefined ? String(req.query.v) : (catDef ? String(catDef.v) : '0');
    const p = req.query.p !== undefined ? String(req.query.p) : (catDef?.p !== undefined ? String(catDef.p) : undefined);

    const isRegionale = !!comit && comit !== '0' && comit !== 'all';
    const comitId = isRegionale ? parseInt(comit, 10) : undefined;

    const cacheKey = `ranking_${idClass}_${sesso}_${isRegionale ? `comit_${comitId}` : 'naz'}_t${tipo}_s${sett}_S${s}_FQ${fq}_G${g}_V${v}${p ? `_P${p}` : ''}_p${page}`;

    try {
        if (!forceRefresh) {
            const cached = cacheService.get<any>(cacheKey);
            if (cached) return res.json(cached);
        }

        const pParam = (p !== undefined && p !== null && p !== '') ? `&P=${p}` : '';
        let url = '';
        if (isRegionale) {
            url = `https://portale.fitet.org/risultati/new_rank/ranking_unica_comit.php?COMIT=${comitId}&SESSO=${sesso}&ID_CLASS=${idClass}&ZU=1&TIPO=${tipo}&SETT=${sett}&page=${page}&S=${s}&FQ=${fq}&G=${g}&V=${v}${pParam}`;
        } else {
            url = `https://portale.fitet.org/risultati/new_rank/ranking_unica.php?SESSO=${sesso}&ID_CLASS=${idClass}&ZU=1&TIPO=${tipo}&SETT=${sett}&page=${page}&S=${s}&FQ=${fq}&G=${g}&V=${v}${pParam}`;
        }

        const html = await FitetClient.fetchHtml(url, true);
        const result = parseRankingHtml(html, sesso, page, comitId, catDef?.key || categoryKey || 'generale');

        cacheService.set(cacheKey, result, 60 * 60 * 1000); // 1 hour TTL
        res.json(result);
    } catch (error: any) {
        console.error('Error fetching ranking:', error);
        res.status(500).json({ error: 'Errore nel recupero della classifica', details: error.message });
    }
});

// 4c. Tornei & Manifestazioni FITeT (con fallback dinamico degli ID e aggregazione)
async function getDynamicMenuManifestazioni(forceRefresh = false): Promise<Array<{ label: string; tor: number; comit: number; id: number }>> {
    const cacheKey = 'tornei_menu_manifestazioni';
    if (!forceRefresh) {
        const cached = cacheService.get<Array<{ label: string; tor: number; comit: number; id: number }>>(cacheKey);
        if (cached) return cached;
    }
    try {
        const html = await FitetClient.fetchHtml('https://portale.fitet.org/menu.php');
        const parsed = parseMenuManifestazioni(html);
        if (parsed.length > 0) {
            cacheService.set(cacheKey, parsed, 6 * 60 * 60 * 1000); // 6 hours
        }
        return parsed;
    } catch {
        return [];
    }
}

async function fetchSingleTorneoSection(
    key: string,
    shortLabel: string,
    fallbackTitle: string,
    tor: number,
    comit: number,
    id: number,
    regFilter?: number,
    forceRefresh = false
): Promise<TorneoSectionResult> {
    const cacheKey = `tornei_sec_${key}_t${tor}_c${comit}_id${id}_r${regFilter || 0}`;
    if (!forceRefresh) {
        const cached = cacheService.get<TorneoSectionResult>(cacheKey);
        if (cached) return cached;
    }

    const baseUrl = 'https://portale.fitet.org/risultati/tornei';
    const testaUrl = `${baseUrl}/testa_tornei.php?TOR=${tor}&COMIT=${comit}&ID=${id}`;
    const elencoUrl =
        regFilter && tor === 0
            ? `${baseUrl}/elenco_tornei.php?REG=${regFilter}&TOR=${tor}&ID=${id}&COMIT=${comit}`
            : `${baseUrl}/elenco_tornei.php?TOR=${tor}&COMIT=${comit}&ID=${id}`;

    const [testaHtml, elencoHtml] = await Promise.all([
        FitetClient.fetchHtml(testaUrl).catch(() => ''),
        FitetClient.fetchHtml(elencoUrl).catch(() => ''),
    ]);

    const title = parseTestaTornei(testaHtml, fallbackTitle);
    const parsed = parseElencoTornei(elencoHtml, comit, tor, regFilter, key, shortLabel);

    // Se l'endpoint restituisce i link alle regioni (es. TOR=0&COMIT=30&ID=36 -> Tornei Open)
    if (parsed.regions.length > 0 && parsed.tornei.length === 0) {
        const targetRegions = regFilter
            ? parsed.regions.filter((r) => r.regId === regFilter)
            : parsed.regions;

        const regResults = await Promise.all(
            targetRegions.map(async (r) => {
                const regUrl = `${baseUrl}/elenco_tornei.php?REG=${r.regId}&TOR=${r.tor}&ID=${r.id}&COMIT=${r.comit}`;
                const regHtml = await FitetClient.fetchHtml(regUrl).catch(() => '');
                const subParsed = parseElencoTornei(regHtml, r.comit, r.tor, r.regId, key, shortLabel);

                // Fallback: se REG=...&TOR=0&ID=36 fosse vuoto, prova TOR=100&COMIT=<regId>&ID=0
                if (subParsed.tornei.length === 0) {
                    const fallbackHtml = await FitetClient.fetchHtml(
                        `${baseUrl}/elenco_tornei.php?TOR=100&COMIT=${r.regId}&ID=0`
                    ).catch(() => '');
                    return parseElencoTornei(fallbackHtml, r.regId, 100, r.regId, key, shortLabel).tornei;
                }
                return subParsed.tornei;
            })
        );

        const mergedTornei = regResults.flat();
        const sectionResult: TorneoSectionResult = {
            key,
            title,
            shortLabel,
            tor,
            comit,
            id,
            reg: regFilter,
            regioneNome: regFilter ? COMIT_NAMES[regFilter] : undefined,
            tornei: mergedTornei,
            availableRegions: parsed.regions.map((r) => ({
                regId: r.regId,
                name: r.name,
                tor: r.tor,
                id: r.id,
                comit: r.comit,
            })),
        };
        cacheService.set(cacheKey, sectionResult, 2 * 60 * 60 * 1000);
        return sectionResult;
    }

    // Fallback se TOR=0&ID=36 (Tornei Open) avesse cambiato ID su portale.fitet.org
    if (tor === 0 && parsed.tornei.length === 0 && parsed.regions.length === 0) {
        const dynamicMenu = await getDynamicMenuManifestazioni(forceRefresh);
        const dynamicOpen = dynamicMenu.find((m) => m.tor === 0 && m.id > 0 && /open/i.test(m.label));
        if (dynamicOpen && dynamicOpen.id !== id) {
            return fetchSingleTorneoSection(
                key,
                shortLabel,
                fallbackTitle,
                dynamicOpen.tor,
                dynamicOpen.comit,
                dynamicOpen.id,
                regFilter,
                forceRefresh
            );
        }
        // Ulteriore fallback diretto su TOR=100 per la regione o le principali regioni
        if (regFilter && regFilter >= 1 && regFilter <= 21) {
            const fbHtml = await FitetClient.fetchHtml(
                `${baseUrl}/elenco_tornei.php?TOR=100&COMIT=${regFilter}&ID=0`
            ).catch(() => '');
            const fbParsed = parseElencoTornei(fbHtml, regFilter, 100, regFilter, key, shortLabel);
            parsed.tornei = fbParsed.tornei;
        }
    }

    const sectionResult: TorneoSectionResult = {
        key,
        title,
        shortLabel,
        tor,
        comit,
        id,
        reg: regFilter,
        regioneNome: regFilter ? COMIT_NAMES[regFilter] : comit <= 21 ? COMIT_NAMES[comit] : undefined,
        tornei: parsed.tornei,
    };

    cacheService.set(cacheKey, sectionResult, 2 * 60 * 60 * 1000);
    return sectionResult;
}

app.get('/api/tornei', async (req, res) => {
    const categoryKey = ((req.query.category as string) || 'all').trim();
    const comitParam = req.query.comit ? parseInt(req.query.comit as string, 10) : 0;
    const regParam = req.query.reg ? parseInt(req.query.reg as string, 10) : 0;
    const customTor = req.query.tor !== undefined ? parseInt(req.query.tor as string, 10) : undefined;
    const customId = req.query.id !== undefined ? parseInt(req.query.id as string, 10) : undefined;
    const forceRefresh = isForceRefreshRequest(req);

    try {
        // Caso 1: Vista "Tutti i Tornei Attivi" (o "Tutti Regionali" quando è selezionata una regione)
        if (categoryKey === 'all' || categoryKey === 'reg_all') {
            const isRegionSelected = comitParam >= 1 && comitParam <= 21;

            if (isRegionSelected || categoryKey === 'reg_all') {
                const targetRegion = isRegionSelected ? comitParam : (regParam >= 1 && regParam <= 21 ? regParam : 4);
                const targetRegionName = COMIT_NAMES[targetRegion] || '';
                const regCategories = TORNEI_CATEGORIES.filter((c) => c.group === 'regionali');

                const regSections = await Promise.all(
                    regCategories.map((c) =>
                        fetchSingleTorneoSection(
                            c.key,
                            c.shortLabel,
                            c.label,
                            c.tor,
                            targetRegion,
                            c.id,
                            targetRegion,
                            forceRefresh
                        )
                    )
                );

                // Fetch categorie nazionali e includi i tornei che si svolgono nelle località di questa regione
                const nationalCats = TORNEI_CATEGORIES.filter((c) => c.group !== 'regionali');
                const natSections = await Promise.all(
                    nationalCats.map((c) =>
                        fetchSingleTorneoSection(
                            c.key,
                            c.shortLabel,
                            c.label,
                            c.tor,
                            c.comit,
                            c.id,
                            undefined,
                            forceRefresh
                        )
                    )
                );

                const filteredNatSections = natSections
                    .map((sec) => {
                        const matchingTornei = sec.tornei.filter((t) =>
                            torneoMatchesRegion(t, targetRegionName)
                        );
                        return { ...sec, tornei: matchingTornei };
                    })
                    .filter((sec) => sec.tornei.length > 0);

                const populatedReg = regSections.filter((s) => s.tornei.length > 0);
                const combinedSections = [...populatedReg, ...filteredNatSections];

                const payload: TorneiResponse = {
                    title: `MANIFESTAZIONI E TORNEI IN ${targetRegionName.toUpperCase()} - STAGIONE 2026/27`,
                    categoryKey,
                    comitId: targetRegion,
                    regId: targetRegion,
                    sections: combinedSections.length > 0 ? combinedSections : regSections.slice(0, 1),
                    totalTornei: combinedSections.reduce((acc, s) => acc + s.tornei.length, 0),
                    lastUpdated: new Date().toISOString(),
                };
                return res.json(payload);
            }

            // Vista globale: interroga tutte le categorie Nazionali + Open e mostra quelle con contenuto
            const nationalAndOpenCats = TORNEI_CATEGORIES.filter((c) => c.group !== 'regionali');
            const sections = await Promise.all(
                nationalAndOpenCats.map((c) =>
                    fetchSingleTorneoSection(
                        c.key,
                        c.shortLabel,
                        c.label,
                        c.tor,
                        c.comit,
                        c.id,
                        regParam > 0 ? regParam : undefined,
                        forceRefresh
                    )
                )
            );

            const populated = sections.filter((s) => s.tornei.length > 0);
            const payload: TorneiResponse = {
                title: 'MANIFESTAZIONI E TORNEI UFFICIALI FITeT - STAGIONE 2026/27',
                categoryKey: 'all',
                comitId: 30,
                regId: regParam > 0 ? regParam : undefined,
                sections: populated,
                totalTornei: populated.reduce((acc, s) => acc + s.tornei.length, 0),
                lastUpdated: new Date().toISOString(),
            };
            return res.json(payload);
        }

        // Caso 2: Categoria specifica o parametri TOR/COMIT/ID espliciti
        const catDef = getTorneoCategoryByKey(categoryKey);
        const tor = customTor !== undefined ? customTor : (catDef ? catDef.tor : 21);
        const id = customId !== undefined ? customId : (catDef ? catDef.id : 0);
        const isRegCat = catDef?.group === 'regionali' || tor >= 100;
        const comit = isRegCat
            ? (comitParam >= 1 && comitParam <= 21 ? comitParam : (regParam >= 1 && regParam <= 21 ? regParam : 4))
            : (comitParam > 0 && customTor !== undefined ? comitParam : (catDef?.comit || 30));

        const activeRegFilter =
            tor === 0
                ? (regParam >= 1 && regParam <= 21 ? regParam : (comitParam >= 1 && comitParam <= 21 ? comitParam : undefined))
                : isRegCat
                    ? comit
                    : undefined;

        const section = await fetchSingleTorneoSection(
            catDef?.key || categoryKey,
            catDef?.shortLabel || 'Tornei',
            catDef?.label || 'TORNEI FITeT',
            tor,
            comit,
            id,
            activeRegFilter,
            forceRefresh
        );

        if (!isRegCat && comitParam >= 1 && comitParam <= 21) {
            const targetRegionName = COMIT_NAMES[comitParam] || '';
            section.tornei = section.tornei.filter((t) =>
                torneoMatchesRegion(t, targetRegionName)
            );
        }

        const payload: TorneiResponse = {
            title: section.title,
            categoryKey: catDef?.key || categoryKey,
            comitId: comit,
            regId: activeRegFilter,
            sections: [section],
            totalTornei: section.tornei.length,
            lastUpdated: new Date().toISOString(),
        };

        return res.json(payload);
    } catch (error: any) {
        console.error('Error fetching tornei:', error);
        res.status(500).json({ error: 'Errore nel recupero dei tornei FITeT', details: error.message });
    }
});

// 4d. Dettaglio Singolo Torneo (Gare disputate o in programma + PDF sintetici + Tabelloni)
app.get('/api/tornei/dettaglio', async (req, res) => {
    const idt = parseInt(req.query.idt as string, 10);
    const com = parseInt(req.query.com as string, 10) || 30;
    const anno = parseInt(req.query.anno as string, 10) || 41;
    const forceRefresh = isForceRefreshRequest(req);

    if (!idt || isNaN(idt)) {
        return res.status(400).json({ error: 'Parametro IDT mancante o non valido' });
    }

    const cacheKey = `torneo_dettaglio_${idt}_${com}_${anno}`;
    if (!forceRefresh) {
        const cached = cacheService.get<TorneoDettaglioResponse>(cacheKey);
        if (cached) return res.json(cached);
    }

    try {
        const baseUrl = 'https://portale.fitet.org/risultati/tornei';
        const [elencoGareHtml, iscrizioniHtml] = await Promise.all([
            FitetClient.fetchHtml(`${baseUrl}/elenco_gare.php?IDT=${idt}&COM=${com}`).catch(() => ''),
            FitetClient.fetchHtml(`${baseUrl}/iscrizioni.php?IDT=${idt}&COM=${com}`).catch(() => ''),
        ]);

        const parsed = parseDettaglioTorneo(elencoGareHtml, iscrizioniHtml, idt, com, anno);
        cacheService.set(cacheKey, parsed, 2 * 60 * 60 * 1000);
        res.json(parsed);
    } catch (error: any) {
        console.error(`Error fetching torneo dettaglio IDT=${idt}:`, error);
        res.status(500).json({ error: 'Errore nel recupero dei dettagli del torneo', details: error.message });
    }
});

// Helper: risolve i punti della classifica attuale in vigore per un singolo iscritto a un torneo
async function resolveSingleIscrittoCurrentPoints(item: {
    nome: string;
    atletaId?: string | null;
}): Promise<{ atletaId: string | null; puntiClassificaAttuale: number | null }> {
    const rawName = (item.nome || '').trim();
    if (!rawName) return { atletaId: null, puntiClassificaAttuale: null };

    const primaryName = rawName.includes('/') ? rawName.split('/')[0].trim() : rawName;
    let atletaId = item.atletaId || null;

    if (!atletaId || !/^\d+$/.test(atletaId)) {
        atletaId = await athleteResolver.resolveAthleteId(primaryName);
    }

    if (!atletaId) {
        return { atletaId: null, puntiClassificaAttuale: null };
    }

    const ptsCacheKey = `atleta_pts_${atletaId}`;
    const cachedPts = cacheService.get<number>(ptsCacheKey);
    if (typeof cachedPts === 'number' && cachedPts > 0) {
        return { atletaId, puntiClassificaAttuale: cachedPts };
    }

    const cachedAtleta = cacheService.get<any>(`atleta_${atletaId}`);
    if (cachedAtleta) {
        const storico = cachedAtleta.storicoClassifica || [];
        const lastSnap = storico.length > 0 ? storico[storico.length - 1] : null;
        const pts = lastSnap?.punti
            ? Math.round(lastSnap.punti)
            : cachedAtleta.anagrafica?.punti
                ? Math.round(cachedAtleta.anagrafica.punti)
                : null;
        if (pts && pts > 0) {
            cacheService.set(ptsCacheKey, pts, TTL_ATLETA);
            return { atletaId, puntiClassificaAttuale: pts };
        }
    }

    try {
        const html = await FitetClient.fetchSchedaAtleta(atletaId);
        const parsed = parseDettaglioAtleta(html, atletaId);
        const storico = parsed.storicoClassifica || [];
        const lastSnap = storico.length > 0 ? storico[storico.length - 1] : null;
        const pts = lastSnap?.punti
            ? Math.round(lastSnap.punti)
            : parsed.anagrafica?.punti
                ? Math.round(parsed.anagrafica.punti)
                : null;

        if (pts && pts > 0) {
            cacheService.set(ptsCacheKey, pts, TTL_ATLETA);
            return { atletaId, puntiClassificaAttuale: pts };
        }
    } catch (err) {
        console.warn(`[TorneiIscritti] Impossibile recuperare punti attuali per ${primaryName} (${atletaId}):`, err);
    }

    return { atletaId, puntiClassificaAttuale: null };
}

// Arricchisce l'elenco iscritti con i punti dell'ultima classifica in vigore (con budget temporale per non bloccare gare grandi)
async function enrichIscrittiWithCurrentRankingPoints(
    iscritti: Array<{ nome: string; atletaId?: string | null; puntiClassificaAttuale?: number | null }>,
    timeBudgetMs = 2800,
    concurrency = 12
): Promise<void> {
    if (!iscritti || iscritti.length === 0) return;

    // 1. Popola subito da cache in-memory a costo 0ms
    const pendingIndices: number[] = [];
    for (let i = 0; i < iscritti.length; i++) {
        const item = iscritti[i];
        if (item.puntiClassificaAttuale && item.puntiClassificaAttuale > 0) continue;

        if (item.atletaId) {
            const cachedPts = cacheService.get<number>(`atleta_pts_${item.atletaId}`);
            if (typeof cachedPts === 'number' && cachedPts > 0) {
                item.puntiClassificaAttuale = cachedPts;
                continue;
            }
        }
        pendingIndices.push(i);
    }

    if (pendingIndices.length === 0) return;

    let cursor = 0;
    const workerPool = Promise.all(
        Array.from({ length: Math.min(concurrency, pendingIndices.length) }, async () => {
            while (cursor < pendingIndices.length) {
                const idx = pendingIndices[cursor++];
                const target = iscritti[idx];
                const resolved = await resolveSingleIscrittoCurrentPoints(target);
                if (resolved.atletaId) target.atletaId = resolved.atletaId;
                if (resolved.puntiClassificaAttuale !== null) {
                    target.puntiClassificaAttuale = resolved.puntiClassificaAttuale;
                }
            }
        })
    );

    if (timeBudgetMs > 0) {
        await Promise.race([
            workerPool,
            new Promise<void>((resolve) => setTimeout(resolve, timeBudgetMs)),
        ]);
    } else {
        await workerPool;
    }
}

// Endpoint batch per completare i punti classifica attuale degli iscritti a un torneo
app.post('/api/tornei/iscritti-punti', async (req, res) => {
    const items: Array<{ nome: string; atletaId?: string | null }> = Array.isArray(req.body?.iscritti)
        ? req.body.iscritti.slice(0, 60)
        : [];

    if (items.length === 0) {
        return res.json({ results: {} });
    }

    try {
        const results: Record<string, { atletaId: string | null; puntiClassificaAttuale: number | null }> = {};
        let cursor = 0;
        const concurrency = 12;

        await Promise.all(
            Array.from({ length: Math.min(concurrency, items.length) }, async () => {
                while (cursor < items.length) {
                    const item = items[cursor++];
                    if (!item?.nome) continue;
                    const resolved = await resolveSingleIscrittoCurrentPoints(item);
                    results[item.nome] = resolved;
                }
            })
        );

        return res.json({ results });
    } catch (error: any) {
        console.error('Error in /api/tornei/iscritti-punti:', error);
        return res.status(500).json({ error: error.message });
    }
});

// 4e. Dettaglio Singola Gara di un Torneo (Iscritti, Gironi di qualificazione, Tabellone Eliminazione Diretta)
app.get('/api/tornei/gara', async (req, res) => {
    const idt = parseInt(req.query.idt as string, 10);
    const com = parseInt(req.query.com as string, 10) || 30;
    const garaId = ((req.query.gara as string) || '').trim();
    const anno = parseInt(req.query.anno as string, 10) || 41;
    const isDoppio = req.query.isDoppio === 'true';
    const mode = (req.query.mode as string) === 'iscrizioni' ? 'iscrizioni' : 'risultati';
    const reqCod1 = req.query.cod1 ? parseInt(req.query.cod1 as string, 10) : undefined;
    const reqCod2 = req.query.cod2 ? parseInt(req.query.cod2 as string, 10) : undefined;
    const reqTab = req.query.tab ? parseInt(req.query.tab as string, 10) : undefined;
    const reqTurno = req.query.turno ? parseInt(req.query.turno as string, 10) : undefined;
    const forceRefresh = isForceRefreshRequest(req);

    if (!idt || !garaId) {
        return res.status(400).json({ error: 'Parametri idt e gara obbligatori' });
    }

    const cacheKey = `torneo_gara_${idt}_${com}_${garaId}_${mode}_c${reqCod1 || 0}_${reqCod2 || 0}_t${reqTab || 0}_${reqTurno || 0}`;
    if (!forceRefresh) {
        const cached = cacheService.get<TorneoGaraDettaglioResponse>(cacheKey);
        if (cached) return res.json(cached);
    }

    try {
        const baseUrl = 'https://portale.fitet.org/risultati/tornei';
        const mapping = athleteResolver.getMapping();

        // Modalità Iscrizioni
        if (mode === 'iscrizioni') {
            const iscrHtml = await FitetClient.fetchHtml(
                `${baseUrl}/iscrizioni_gara.php?GARA=${encodeURIComponent(garaId)}&IDT=${idt}&COM=${com}`
            ).catch(() => '');
            const parsedIscr = parseIscrizioniGara(iscrHtml, mapping);
            await enrichIscrittiWithCurrentRankingPoints(parsedIscr.iscritti, 2800);

            const payload: TorneoGaraDettaglioResponse = {
                idt,
                com,
                garaId,
                anno,
                titoloGara: parsedIscr.titoloGara || `Gara ${garaId}`,
                mode: 'iscrizioni',
                isDoppio,
                maxIscritti: parsedIscr.maxIscritti,
                iscritti: parsedIscr.iscritti,
                gironiRanges: [],
                gironi: [],
                turniTabellone: [],
                partiteTabellone: [],
            };
            cacheService.set(cacheKey, payload, 15 * 60 * 1000);
            return res.json(payload);
        }

        // Modalità Risultati (gestione_gare_n.php o gestione_gare_doppio.php)
        const gestioneUrl = isDoppio
            ? `${baseUrl}/gestione_gare_doppio.php?ANNO=${anno}&GARA=${encodeURIComponent(garaId)}&IDT=${idt}&COM=${com}`
            : `${baseUrl}/gestione_gare_n.php?ANNO=${anno}&GARA=${encodeURIComponent(garaId)}&IDT=${idt}&COM=${com}&TAB=0`;

        const gestioneHtml = await FitetClient.fetchHtml(gestioneUrl).catch(() => '');
        const meta = parseGestioneGara(gestioneHtml, mapping);

        // Se non ci sono ancora risultati giocati, fallback automatico alle iscrizioni!
        if (meta.gironiRanges.length === 0 && meta.turniTabellone.length === 0) {
            const iscrHtml = await FitetClient.fetchHtml(
                `${baseUrl}/iscrizioni_gara.php?GARA=${encodeURIComponent(garaId)}&IDT=${idt}&COM=${com}`
            ).catch(() => '');
            const parsedIscr = parseIscrizioniGara(iscrHtml, mapping);
            if (parsedIscr.iscritti.length > 0) {
                await enrichIscrittiWithCurrentRankingPoints(parsedIscr.iscritti, 2800);
                const fallbackPayload: TorneoGaraDettaglioResponse = {
                    idt,
                    com,
                    garaId,
                    anno,
                    titoloGara: parsedIscr.titoloGara || meta.titoloGara || `Gara ${garaId}`,
                    mode: 'iscrizioni',
                    isDoppio,
                    maxIscritti: parsedIscr.maxIscritti,
                    iscritti: parsedIscr.iscritti,
                    gironiRanges: [],
                    gironi: [],
                    turniTabellone: [],
                    partiteTabellone: [],
                };
                cacheService.set(cacheKey, fallbackPayload, 15 * 60 * 1000);
                return res.json(fallbackPayload);
            }
        }

        // Determina quale blocco di gironi e quale turno di tabellone caricare
        const activeGironiRange =
            reqCod1 !== undefined && reqCod2 !== undefined
                ? { cod1: reqCod1, cod2: reqCod2 }
                : meta.gironiRanges.length > 0
                    ? { cod1: meta.gironiRanges[0].cod1, cod2: meta.gironiRanges[0].cod2 }
                    : null;

        let activeTurno =
            reqTurno !== undefined
                ? meta.turniTabellone.find((t) => t.turno === reqTurno && (!reqTab || t.tab === reqTab)) || {
                    tab: reqTab || 1,
                    turno: reqTurno,
                    label: `Turno ${reqTurno}`,
                }
                : meta.turniTabellone.length > 0
                    ? meta.turniTabellone[0]
                    : null;

        const [gironiHtml, tabelloneHtml] = await Promise.all([
            activeGironiRange
                ? FitetClient.fetchHtml(
                    `${baseUrl}/risultati.php?COD_1=${activeGironiRange.cod1}&COD_2=${activeGironiRange.cod2}&IDT=${idt}&ANNO=${anno}&GARA=${encodeURIComponent(garaId)}&COM=${com}`
                ).catch(() => '')
                : Promise.resolve(''),
            activeTurno
                ? FitetClient.fetchHtml(
                    isDoppio
                        ? `${baseUrl}/risultati_tabellone_doppio.php?ANNO=${anno}&TURNO=${activeTurno.turno}&IDT=${idt}&GARA=${encodeURIComponent(garaId)}&COM=${com}`
                        : `${baseUrl}/risultati_tabellone.php?TAB=${activeTurno.tab}&TURNO=${activeTurno.turno}&ANNO=${anno}&IDT=${idt}&GARA=${encodeURIComponent(garaId)}&COM=${com}`
                ).catch(() => '')
                : Promise.resolve(''),
        ]);

        const gironi = parseRisultatiGironi(gironiHtml, mapping);
        let partiteTabellone = parseRisultatiTabellone(tabelloneHtml, mapping);

        // Nota: l'immagine mappa statica di FITeT elenca sempre i turni da 9 (Finale) a 3 (64esimi),
        // ma per tabelloni più piccoli alcuni turni non hanno incontri o non sono ancora stati giocati.
        // Se non era richiesto un turno specifico (o se il turno default 9 è vuoto), cerchiamo il turno più avanzato con partite!
        if (partiteTabellone.length === 0 && reqTurno === undefined && meta.turniTabellone.length > 1) {
            const candidateTurni = meta.turniTabellone.slice(1);
            const fallbackTurniResults = await Promise.all(
                candidateTurni.map(async (t) => {
                    const html = await FitetClient.fetchHtml(
                        isDoppio
                            ? `${baseUrl}/risultati_tabellone_doppio.php?ANNO=${anno}&TURNO=${t.turno}&IDT=${idt}&GARA=${encodeURIComponent(garaId)}&COM=${com}`
                            : `${baseUrl}/risultati_tabellone.php?TAB=${t.tab}&TURNO=${t.turno}&ANNO=${anno}&IDT=${idt}&GARA=${encodeURIComponent(garaId)}&COM=${com}`
                    ).catch(() => '');
                    return { turnoObj: t, matches: parseRisultatiTabellone(html, mapping) };
                })
            );
            const firstPopulated = fallbackTurniResults.find((r) => r.matches.length > 0);
            if (firstPopulated) {
                activeTurno = firstPopulated.turnoObj;
                partiteTabellone = firstPopulated.matches;
            }
        }

        // Carica tutti i turni del tabellone per costruire il bracket grafico completo
        let allTurniTabellone: Array<{ tab: number; turno: number; label: string; matches: TorneoMatchItem[] }> = [];
        if (meta.turniTabellone.length > 0) {
            const allTurniRaw = await Promise.all(
                meta.turniTabellone.map(async (t) => {
                    if (activeTurno && activeTurno.turno === t.turno && (!activeTurno.tab || activeTurno.tab === t.tab) && partiteTabellone.length > 0) {
                        return { tab: t.tab, turno: t.turno, label: t.label, matches: partiteTabellone };
                    }
                    const html = await FitetClient.fetchHtml(
                        isDoppio
                            ? `${baseUrl}/risultati_tabellone_doppio.php?ANNO=${anno}&TURNO=${t.turno}&IDT=${idt}&GARA=${encodeURIComponent(garaId)}&COM=${com}`
                            : `${baseUrl}/risultati_tabellone.php?TAB=${t.tab}&TURNO=${t.turno}&ANNO=${anno}&IDT=${idt}&GARA=${encodeURIComponent(garaId)}&COM=${com}`
                    ).catch(() => '');
                    return { tab: t.tab, turno: t.turno, label: t.label, matches: parseRisultatiTabellone(html, mapping) };
                })
            );
            allTurniTabellone = allTurniRaw.filter((tr) => tr.matches.length > 0);
        }

        // Se non è ancora stato giocato alcun incontro (tabellone e gironi vuoti),
        // mostra l'elenco iscritti invece di una pagina senza contenuti.
        // Non applichiamo il fallback quando l'utente sta navigando un turno/girone specifico.
        const hasPlayedGironi = gironi.some(
            (g) => g.partite.length > 0 || g.classifica.length > 0
        );
        const hasPlayedBracket = allTurniTabellone.length > 0 || partiteTabellone.length > 0;

        if (
            !hasPlayedGironi &&
            !hasPlayedBracket &&
            reqCod1 === undefined &&
            reqCod2 === undefined &&
            reqTab === undefined &&
            reqTurno === undefined
        ) {
            const iscrHtml = await FitetClient.fetchHtml(
                `${baseUrl}/iscrizioni_gara.php?GARA=${encodeURIComponent(garaId)}&IDT=${idt}&COM=${com}`
            ).catch(() => '');
            const parsedIscr = parseIscrizioniGara(iscrHtml, mapping);
            if (parsedIscr.iscritti.length > 0) {
                await enrichIscrittiWithCurrentRankingPoints(parsedIscr.iscritti, 2800);
                const fallbackPayload: TorneoGaraDettaglioResponse = {
                    idt,
                    com,
                    garaId,
                    anno,
                    titoloGara: parsedIscr.titoloGara || meta.titoloGara || `Gara ${garaId}`,
                    mode: 'iscrizioni',
                    isDoppio,
                    maxIscritti: parsedIscr.maxIscritti,
                    iscritti: parsedIscr.iscritti,
                    gironiRanges: [],
                    gironi: [],
                    turniTabellone: [],
                    partiteTabellone: [],
                };
                cacheService.set(cacheKey, fallbackPayload, 15 * 60 * 1000);
                return res.json(fallbackPayload);
            }
        }

        const payload: TorneoGaraDettaglioResponse = {
            idt,
            com,
            garaId,
            anno,
            titoloGara: meta.titoloGara || `Gara ${garaId}`,
            mode: 'risultati',
            isDoppio,
            vincitore: meta.vincitore,
            vincitoreId: meta.vincitoreId,
            vincitoreFotoUrl: meta.vincitoreFotoUrl,
            valoreRanking: meta.valoreRanking,
            iscritti: [],
            gironiRanges: meta.gironiRanges,
            activeGironiRange,
            gironi,
            turniTabellone: meta.turniTabellone,
            activeTurno,
            partiteTabellone,
            allTurniTabellone,
        };

        cacheService.set(cacheKey, payload, 30 * 60 * 1000);
        return res.json(payload);
    } catch (error: any) {
        console.error(`Error fetching gara ${garaId} for IDT=${idt}:`, error);
        res.status(500).json({ error: 'Errore nel recupero dei risultati della gara', details: error.message });
    }
});

// 5. Scheda Singolo Atleta
app.get('/api/atleta/:id', async (req, res) => {
    let { id } = req.params;
    const forceRefresh = isForceRefreshRequest(req);

    if (!id || id === 'null' || id === 'undefined') {
        return res.status(400).json({ error: 'ID atleta non valido' });
    }

    // Se l'ID non è puramente numerico (es. passato il nome atleta), risolvilo dinamicamente
    if (!/^\d+$/.test(id)) {
        let cleanName = id;
        try {
            cleanName = decodeURIComponent(id);
        } catch { }
        cleanName = cleanName.trim();
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
            const isHollow = !cached || !cached.anagrafica || cached.anagrafica.nome?.startsWith('Atleta ') || (cached.anagrafica.punti === 0 && (!cached.storicoClassifica || cached.storicoClassifica.length === 0));
            if (cached && !isHollow && cached.partiteRanking) {
                // Le cache precedenti possono contenere un campionato assegnato senza
                // distinguere maschile/femminile: ricalcolalo al volo e aggiorna la cache.
                const corrected = resolveAthleteChampionshipsFromRanking(
                    cached.partiteRanking?.campionato || [],
                    cached.anagrafica?.regione
                );
                const currentIds = (cached.campionatiGiocati || []).map((c: any) => c.camId).join(',');
                const correctedIds = corrected.playedCamps.map((c) => c.camId).join(',');
                if (corrected.playedCamps.length > 0 && currentIds !== correctedIds) {
                    cached.campionatoAttuale = corrected.playedCamps[0];
                    cached.campionatiGiocati = corrected.playedCamps;
                    cacheService.set(cacheKey, cached, TTL_ATLETA);
                }
                return res.json(cached);
            }
        }

        let resolvedIdClass = await getLatestIdClass();
        const html = await FitetClient.fetchSchedaAtleta(id, resolvedIdClass);

        // Extract & parse official ranking matches from #fragment-3 iframe
        let partiteRanking: PartiteRankingAtleta | undefined = undefined;
        let iframeUrl = extractRankingIframeUrl(html);

        if (iframeUrl) {
            try {
                const iframeHtml = await FitetClient.fetchHtml(iframeUrl, false);
                partiteRanking = parsePartiteRanking(iframeHtml, id);
                const idClassMatch = iframeUrl.match(/\/html\/(\d+)\//i);
                if (idClassMatch) resolvedIdClass = parseInt(idClassMatch[1], 10);
            } catch (iframeErr) {
                console.warn(`Could not fetch ranking matches iframe for athlete ${id}:`, iframeErr);
            }
        }

        const atleta = parseDettaglioAtleta(html, id, partiteRanking);

        // Risoluzione campionati effettivamente giocati dall'atleta
        const campRanking = partiteRanking?.campionato || [];
        const { playedCamps, athleteSesso } = resolveAthleteChampionshipsFromRanking(
            campRanking,
            atleta.anagrafica?.regione
        );
        if (playedCamps.length === 0) {
            const fallback = await championshipCatalog.findAthleteChampionship(
                id,
                atleta.anagrafica?.nome,
                atleta.anagrafica?.regione,
                athleteSesso
            );
            if (fallback && !playedCamps.some(pc => pc.camId === fallback.id)) {
                playedCamps.push({
                    camId: fallback.id,
                    nome: fallback.nome,
                    categoria: fallback.categoria,
                    regione: fallback.regione,
                    squadra: fallback.squadra,
                });
            }
        }

        if (playedCamps.length > 0) {
            atleta.campionatoAttuale = playedCamps[0];
            atleta.campionatiGiocati = playedCamps;
        }

        const isHollow = !atleta || !atleta.anagrafica || atleta.anagrafica.nome?.startsWith('Atleta ') || (atleta.anagrafica.punti === 0 && (!atleta.storicoClassifica || atleta.storicoClassifica.length === 0));
        if (!isHollow) {
            cacheService.set(cacheKey, atleta, TTL_ATLETA);
        }

        res.json(atleta);
    } catch (error: any) {
        console.error(`Error fetching athlete ${id}:`, error);
        res.status(500).json({ error: 'Errore nel recupero della scheda atleta', details: error.message });
    }
});

// 5b. Head-to-Head (Testa a Testa tra due atleti)
app.get('/api/head-to-head', async (req, res) => {
    const atleta1 = req.query.atleta1 as string;
    const atleta2 = req.query.atleta2 as string;
    const idClass = req.query.idClass ? parseInt(req.query.idClass as string, 10) : await getLatestIdClass();

    if (!atleta1 || !atleta2) {
        return res.status(400).json({ error: 'Parametri atleta1 e atleta2 obbligatori' });
    }

    try {
        const data = await headToHeadService.getHeadToHead(atleta1, atleta2, idClass);
        res.json(data);
    } catch (error: any) {
        console.error(`Error in head-to-head ${atleta1} vs ${atleta2}:`, error);
        res.status(500).json({ error: 'Errore nel recupero del testa a testa', details: error.message });
    }
});

// 5c. Head-to-Head AI Prediction
app.post('/api/predict-h2h', handlePredictH2H);

// 5c. Athlete Real Views tracking
app.post("/api/atleta/:id/view", async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "ID atleta mancante" });

    // Estrae l'IP reale (utile sia in locale che dietro reverse proxy/Vercel)
    const clientIp =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
        req.socket.remoteAddress ||
        "127.0.0.1";

    console.log(`[VIEW HIT] ID Atleta: ${id} | Client IP: ${clientIp}`);

    const count = await viewsService.incrementViews(id, clientIp);
    res.json({ id, views: count });
});

app.get('/api/atleta/:id/views', async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'ID atleta mancante' });
    const count = await viewsService.getViews(id);
    res.json({ id, views: count });
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

// 6b. Ricerca atleti dal form ufficiale scelta_atleta.php (usata dal Testa a Testa)
app.get('/api/search-atleta-scelta', async (req, res) => {
    const query = ((req.query.q as string) || '').trim();
    const excludeId = ((req.query.excludeId as string) || '0').trim() || '0';
    const idClass = req.query.idClass ? parseInt(req.query.idClass as string, 10) || await getLatestIdClass() : await getLatestIdClass();

    if (query.length < 2) {
        return res.json([]);
    }

    const cacheKey = `scelta_atleta_${query.toUpperCase()}_${excludeId}_${idClass}`;
    const cached = cacheService.get<AthleteSearchResult[]>(cacheKey);
    if (cached) return res.json(cached);

    try {
        const html = await FitetClient.fetchSceltaAtleta(query, excludeId, idClass);
        const parsed = parseSceltaAtleta(html);
        const enriched: AthleteSearchResult[] = parsed.map((atleta) => ({
            id: atleta.id,
            value: atleta.nome,
            label: atleta.nome,
            dataNascita: atleta.dataNascita,
            tessera: null,
            fotoUrl: `https://portale.fitet.org/images/atleti/${atleta.id}.jpg`,
        }));

        cacheService.set(cacheKey, enriched, TTL_RICERCA_ATLETA);
        res.json(enriched);
    } catch (error: any) {
        console.warn(`[search-atleta-scelta] Fallback autocomplete per "${query}":`, error?.message || error);

        // Se il form ufficiale non risponde, usa l'autocomplete FITeT già esistente.
        try {
            const fallback = await FitetClient.searchAtleta(query);
            const enriched: AthleteSearchResult[] = fallback
                .filter((atleta) => atleta.id !== excludeId)
                .map((atleta) => {
                    const dateMatch = atleta.label ? atleta.label.match(/\((\d{2}\/\d{2}\/\d{4})\)/) : null;
                    const tesseraMatch = atleta.label ? atleta.label.match(/\[(\d+)\]/) : null;
                    return {
                        id: atleta.id,
                        value: atleta.value,
                        label: atleta.label,
                        dataNascita: dateMatch ? dateMatch[1] : null,
                        tessera: tesseraMatch ? tesseraMatch[1] : null,
                        fotoUrl: `https://portale.fitet.org/images/atleti/${atleta.id}.jpg`,
                    };
                });
            res.json(enriched);
        } catch (fallbackError: any) {
            res.status(500).json({
                error: 'Errore nella ricerca atleti',
                details: fallbackError?.message,
            });
        }
    }
});

// 7. Referto Incontro Gara
app.get('/api/referto/:incontroId', async (req, res) => {
    const { incontroId } = req.params;
    const cam = req.query.cam ? parseInt(req.query.cam as string, 10) : 0;
    const formula = req.query.formula ? parseInt(req.query.formula as string, 10) : 19;
    const forceRefresh = isForceRefreshRequest(req);
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
    const forceRefresh = isForceRefreshRequest(req);
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
    const forceRefresh = isForceRefreshRequest(req);

    if (!squadraId || squadraId === 'null' || squadraId === 'undefined') {
        return res.status(400).json({ error: 'ID squadra non valido' });
    }

    try {
        let targetSquadraId = squadraId;

        // Se l'ID non è numerico, cerchiamo nella classifica per nome squadra
        if (!/^\d+$/.test(targetSquadraId)) {
            const decodedName = decodeURIComponent(targetSquadraId).trim().toUpperCase();
            let rawClassifica = cacheService.get(`classifica_${cam}`);
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
        const html = await FitetClient.fetchHtml(url);

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
    let atletaId = req.query.atletaId as string;
    let cam = req.query.cam as string;
    let squadraId = req.query.squadraId as string | undefined;
    let atletaNome = req.query.atletaNome as string | undefined;

    if (!atletaId) {
        return res.json({ matches: [], squadra: null });
    }

    // Se cam non è specificato o è 'auto', cerchiamo automaticamente il campionato dell'atleta
    if (!cam || cam === 'auto' || cam === 'null' || cam === 'undefined') {
        // Se il dettaglio atleta è già in cache, ricava il sesso dalle partite di campionato
        // per evitare di assegnare la variante maschile a una giocatrice (e viceversa).
        const cachedAtleta = cacheService.get<any>(`atleta_${atletaId}`);
        let autoSesso: 'M' | 'F' | undefined;
        const cachedCampMatches: any[] = cachedAtleta?.partiteRanking?.campionato || [];
        for (const m of cachedCampMatches) {
            const campSesso = normalizeChampionshipGender(m?.sesso);
            if (campSesso) {
                autoSesso = campSesso;
                break;
            }
        }

        const autoCamp = await championshipCatalog.findAthleteChampionship(atletaId, atletaNome, undefined, autoSesso);
        if (autoCamp) {
            cam = String(autoCamp.id);
        } else {
            return res.json({ matches: [], squadra: null });
        }
    }

    // Se l'atletaId non è puramente numerico (es. passato il nome), prova a risolverlo
    if (!/^\d+$/.test(atletaId)) {
        let cleanName = atletaId;
        try { cleanName = decodeURIComponent(atletaId); } catch { }
        cleanName = cleanName.trim();
        if (!atletaNome) atletaNome = cleanName;
        const resolved = await athleteResolver.resolveAthleteId(cleanName);
        if (resolved) {
            atletaId = resolved;
        }
    }

    // Se manca il nome atleta ma l'ID è noto, ricava il nome dal mapping
    if (!atletaNome && /^\d+$/.test(atletaId)) {
        const mapping = athleteResolver.getMapping();
        for (const [name, id] of Object.entries(mapping)) {
            if (String(id) === String(atletaId)) {
                atletaNome = name;
                break;
            }
        }
    }

    const force = isForceRefreshRequest(req);
    const cacheKey = `atleta_camp_partite_${cam}_${atletaId}_${squadraId || 'auto'}_v3`;
    const cached = cacheService.get<AtletaCampionatoPartiteResponse>(cacheKey);
    // Non restituire dalla cache se cached contiene un errore o 0 partite (fallimento precedente)
    if (cached && !force && !cached.error && cached.matches && cached.matches.length > 0) {
        return res.json(cached);
    }

    try {
        let squadraNome: string | undefined;
        const mapping = athleteResolver.getMapping();

        // 1. Se squadraId non è fornito, cerchiamo squadra e squadraId dal campionato
        if (!squadraId) {
            try {
                const statHtml = await FitetClient.fetchStatisticheAtleti(cam);
                const stats = parseStatisticheAtleti(statHtml, mapping);
                const normName = (s?: string) => (s || '').toUpperCase().replace(/[^A-Z]/g, '');
                const targetNorm = normName(atletaNome);

                const found = stats.find(
                    (s) =>
                        (s.atletaId && String(s.atletaId) === String(atletaId)) ||
                        (targetNorm && normName(s.atleta) === targetNorm) ||
                        (targetNorm && (normName(s.atleta).includes(targetNorm) || targetNorm.includes(normName(s.atleta))))
                );

                if (found) {
                    squadraNome = found.squadra;
                    const classHtml = await FitetClient.fetchClassifica(cam);
                    const $c = cheerio.load(classHtml);
                    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const foundNorm = norm(found.squadra);

                    $c('a[href*="SQUADRA="]').each((_, el) => {
                        const text = $c(el).text().trim();
                        const textNorm = norm(text);
                        // Filtro protettivo: solo testi validi con almeno 3 caratteri per evitare di agganciare link vuoti
                        if (textNorm.length >= 3 && (textNorm === foundNorm || textNorm.includes(foundNorm) || foundNorm.includes(textNorm))) {
                            const href = $c(el).attr('href') || '';
                            const m = href.match(/SQUADRA=(\d+)/i);
                            if (m && !squadraId) {
                                squadraId = m[1];
                                squadraNome = text;
                            }
                        }
                    });
                }
            } catch (statErr) {
                console.warn('[PartiteCampionato] Statistiche look-up error:', statErr);
            }

            // 2. Se ancora non trovato (es. inizio campionato prima delle statistiche aggregate), cerca nelle squadre del girone
            if (!squadraId) {
                try {
                    const classHtml = await FitetClient.fetchClassifica(cam);
                    const $c = cheerio.load(classHtml);
                    const candidateTeams: { id: string; name: string }[] = [];
                    $c('a[href*="SQUADRA="]').each((_, el) => {
                        const href = $c(el).attr('href') || '';
                        const m = href.match(/SQUADRA=(\d+)/i);
                        const text = $c(el).text().trim();
                        if (m && !candidateTeams.some(t => t.id === m[1])) {
                            candidateTeams.push({ id: m[1], name: text });
                        }
                    });

                    // Cerca l'atleta nelle percentuali delle squadre
                    for (const team of candidateTeams) {
                        try {
                            const testUrl = `https://portale.fitet.org/risultati/campionati/percentuali.php?SQUADRA=${team.id}&CAM=${cam}`;
                            const testHtml = await FitetClient.fetchHtml(testUrl);
                            const normName = (s?: string) => (s || '').toUpperCase().replace(/[^A-Z]/g, '');
                            const targetNorm = normName(atletaNome);
                            if (testHtml.includes(`IDA=${atletaId}`) || (targetNorm && normName(testHtml).includes(targetNorm))) {
                                squadraId = team.id;
                                squadraNome = team.name || squadraNome;
                                break;
                            }
                        } catch { }
                    }
                } catch { }
            }
        }

        if (!squadraId) {
            const responsePayload: AtletaCampionatoPartiteResponse = {
                camId: cam,
                matches: [],
                error: 'Atleta non presente tra le squadre o le statistiche del campionato selezionato',
            };
            // Cache molto breve (15 secondi) per gli errori in modo che un retry non sia bloccato a lungo
            cacheService.set(cacheKey, responsePayload, 15 * 1000);
            return res.json(responsePayload);
        }

        const url = `https://portale.fitet.org/risultati/campionati/dettaglio_percentuali.php?IDA=${atletaId}&CAM=${cam}&SQUADRA=${squadraId}`;
        const html = await FitetClient.fetchHtml(url);
        const $p = cheerio.load(html);
        const matches: PartitaCampionatoAtleta[] = [];

        // Estrai il nome della squadra e il nome atleta dal titolo della tabella
        const headerText = $p('table tr').first().text();
        if (!squadraNome) {
            const sqMatch = headerText.match(/Squadra:\s*([^\n\t\-]+)/i);
            if (sqMatch) {
                squadraNome = sqMatch[1].trim();
            }
        }

        let targetAthleteName = atletaNome;
        const atMatch = headerText.match(/Atleta:\s*([^\n\t\-]+)/i);
        if (atMatch) {
            targetAthleteName = atMatch[1].trim();
        }

        const normTarget = (targetAthleteName || '').toUpperCase().replace(/[^A-Z]/g, '');

        $p('table tr').each((i, tr) => {
            if (i < 2) return; // Salta intestazione squadra e testata colonne
            const cells = $p(tr).find('td').map((_, td) => $p(td).text().trim()).get();
            if (cells.length < 15) return;

            const giornata = parseInt(cells[0], 10) || 0;
            const atleta1 = cells[1].trim();
            const atleta2 = cells[2].trim();

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

            // Determina con precisione se l'atleta analizzato è Atleta 1 o Atleta 2
            const norm1 = atleta1.toUpperCase().replace(/[^A-Z]/g, '');
            const norm2 = atleta2.toUpperCase().replace(/[^A-Z]/g, '');

            let isPlayer1 = true;
            if (normTarget) {
                if (norm1 === normTarget || norm1.includes(normTarget) || normTarget.includes(norm1)) {
                    isPlayer1 = true;
                } else if (norm2 === normTarget || norm2.includes(normTarget) || normTarget.includes(norm2)) {
                    isPlayer1 = false;
                }
            }

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

        // Cache partite valide per 30 minuti
        cacheService.set(cacheKey, responsePayload, 30 * 60 * 1000);
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
        const [rawClassifica, calendario, statisticheAtleti, champMeta] = await Promise.all([
            getClassifica(cam, anno, true),
            getCalendario(cam, anno, true),
            getStatistiche(cam, true),
            championshipCatalog.getChampionship(cam).catch(() => undefined),
        ]);
        const classifica = computeTeamForm(rawClassifica, calendario);
        const enrichedCalendario = await enrichCalendarioWithVideos(calendario, cam, champMeta?.nome, true);

        notifyObservedChampionshipIfNeeded({
            camId: cam,
            annoId: anno,
            championshipName: champMeta?.nome || `Campionato ${cam}`,
            classifica,
            calendario: enrichedCalendario,
            statisticheAtleti,
        }).catch((err) => {
            console.warn(`[CampionatoNotifier] Errore controllo passivo refresh cam=${cam}:`, err);
        });

        res.json({ success: true, timestamp: new Date().toISOString(), classifica, calendario: enrichedCalendario, statisticheAtleti });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ======================== WEB PUSH NOTIFICATIONS ========================

function isPushCronAuthorized(req: express.Request): boolean {
    const secret = process.env.CRON_SECRET || process.env.PUSH_CRON_SECRET;
    if (!secret) return true;

    const authHeader = req.headers.authorization || '';
    const querySecret = typeof req.query.secret === 'string' ? req.query.secret : '';
    return authHeader === `Bearer ${secret}` || querySecret === secret;
}

// Restituisce la chiave pubblica VAPID necessaria al frontend per pushManager.subscribe().
app.get('/api/push/public-key', (_req, res) => {
    const publicKey = pushService.getPublicKey();
    if (!publicKey) {
        return res.status(503).json({ error: 'Notifiche push non configurate sul server.' });
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ publicKey });
});

// Salva la subscription del dispositivo e invia subito la notifica di benvenuto (salvo sync silenzioso).
app.post('/api/push/subscribe', async (req, res) => {
    const body = req.body?.subscription || req.body || {};
    const silent = Boolean(req.body?.silent);
    const subscription: PushSubscriptionPayload = {
        endpoint: body.endpoint,
        expirationTime: body.expirationTime ?? null,
        keys: {
            p256dh: body?.keys?.p256dh,
            auth: body?.keys?.auth,
        },
    };

    if (!pushService.isSupabaseConfigured()) {
        return res.status(503).json({
            error: 'Database push non configurato (SUPABASE_SERVICE_ROLE_KEY mancante).',
        });
    }
    if (!pushService.isVapidConfigured()) {
        return res.status(503).json({
            error: 'Notifiche push non configurate (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY mancanti).',
        });
    }

    try {
        const saved = await pushService.saveSubscription(
            subscription,
            req.headers['user-agent'] || null
        );

        // Salva il contesto atleta / campionato associato alla subscription (se presente)
        const rawCtx = req.body?.context || {};
        const playerId =
            typeof rawCtx.playerId === 'string' && rawCtx.playerId.trim()
                ? rawCtx.playerId.trim()
                : typeof req.body?.playerId === 'string' && req.body.playerId.trim()
                    ? req.body.playerId.trim()
                    : undefined;
        const playerName =
            typeof rawCtx.playerName === 'string' && rawCtx.playerName.trim()
                ? rawCtx.playerName.trim()
                : typeof req.body?.playerName === 'string' && req.body.playerName.trim()
                    ? req.body.playerName.trim()
                    : undefined;
        const rawPrimaryCam = rawCtx.primaryCamId ?? req.body?.primaryCamId ?? req.body?.camId;
        const primaryCamId =
            typeof rawPrimaryCam === 'number' && Number.isFinite(rawPrimaryCam) && rawPrimaryCam > 0
                ? rawPrimaryCam
                : typeof rawPrimaryCam === 'string' && /^\d+$/.test(rawPrimaryCam)
                    ? parseInt(rawPrimaryCam, 10)
                    : undefined;

        const rawCamIds = Array.isArray(rawCtx.camIds)
            ? rawCtx.camIds
            : Array.isArray(req.body?.camIds)
                ? req.body.camIds
                : [];
        const parsedCamIds: number[] = rawCamIds
            .map((v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? parseInt(v, 10) : 0))
            .filter((n: number) => Number.isFinite(n) && n > 0);

        if (primaryCamId && !parsedCamIds.includes(primaryCamId)) {
            parsedCamIds.unshift(primaryCamId);
        }

        // Se abbiamo playerId ma nessun campionato ancora risolto, controlla la cache atleta
        if (playerId && parsedCamIds.length === 0) {
            const cachedAthlete = cacheService.get<DettaglioAtleta>(`atleta_${playerId}`);
            if (cachedAthlete?.campionatiGiocati?.length) {
                for (const c of cachedAthlete.campionatiGiocati) {
                    if (c.camId && !parsedCamIds.includes(c.camId)) {
                        parsedCamIds.push(c.camId);
                    }
                }
            } else if (cachedAthlete?.campionatoAttuale?.camId) {
                parsedCamIds.push(cachedAthlete.campionatoAttuale.camId);
            }
        }

        if (playerId !== undefined || playerName !== undefined || parsedCamIds.length > 0 || primaryCamId !== undefined) {
            const contextToSave: PushSubscriptionContext = {
                playerId,
                playerName,
                primaryCamId: primaryCamId ?? parsedCamIds[0] ?? undefined,
                camIds: parsedCamIds,
            };
            await pushService.saveSubscriptionContext(subscription.endpoint, contextToSave);
            invalidateSubscribedChampionshipsCache();

            // Assicura in background che esista il baseline per ciascun campionato seguito
            for (const cId of parsedCamIds) {
                ensureChampionshipBaseline(cId).catch(() => undefined);
            }
        }

        if (silent) {
            return res.status(200).json({
                success: true,
                welcomeSent: false,
                subscriptionId: saved.id ?? null,
            });
        }

        const welcome = await pushService.sendToSubscription(saved, {
            title: 'Notifiche attivate!',
            body: "Da questo momento in poi riceverai notifiche su nuovi match del tuo campionato, classifiche e nuovi tornei FITeT!",
            icon: '/icon.png',
            badge: '/icon.png',
            tag: `fitet-welcome-${Date.now()}`,
            renotify: true,
        });

        if (!welcome.sent && welcome.removed) {
            return res.status(410).json({ error: 'Subscription non più valida.' });
        }

        return res.status(201).json({
            success: true,
            welcomeSent: welcome.sent,
            subscriptionId: saved.id ?? null,
            warning: welcome.sent ? undefined : welcome.error,
        });
    } catch (error: any) {
        console.error('[PushService] Errore salvataggio subscription:', error);
        return res.status(400).json({
            error: error.message || 'Errore durante il salvataggio della subscription.',
        });
    }
});

// Rimuove la subscription (disattivazione notifiche dal dispositivo).
app.delete('/api/push/subscribe', async (req, res) => {
    const endpoint = req.body?.endpoint || req.query.endpoint;

    if (!endpoint || typeof endpoint !== 'string') {
        return res.status(400).json({ error: 'Endpoint subscription mancante.' });
    }

    try {
        await pushService.removeSubscription(endpoint);
        return res.json({ success: true });
    } catch (error: any) {
        console.error('[PushService] Errore rimozione subscription:', error);
        return res.status(500).json({ error: 'Errore durante la rimozione della subscription.' });
    }
});

// Attiva o disattiva la ricezione delle notifiche push per un singolo campionato
app.post('/api/push/championship-subscription', async (req, res) => {
    const { endpoint, camId, enabled } = req.body || {};

    if (!endpoint || typeof endpoint !== 'string' || typeof camId !== 'number' || typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Parametri endpoint, camId ed enabled obbligatori.' });
    }

    try {
        const result = await pushService.toggleChampionshipSubscription(endpoint, camId, enabled);
        invalidateSubscribedChampionshipsCache();

        if (enabled) {
            ensureChampionshipBaseline(camId).catch((err) => {
                console.warn(`[PushService] Errore inizializzazione baseline cam=${camId}:`, err);
            });
        }

        return res.json({ success: true, ...result });
    } catch (error: any) {
        console.error('[PushService] Errore toggle campionato:', error);
        return res.status(500).json({
            error: error.message || "Errore durante l'aggiornamento delle notifiche per il campionato.",
        });
    }
});

// Restituisce l'elenco dei campionati sottoscritti per un dato endpoint
app.get('/api/push/championship-subscription', async (req, res) => {
    const endpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint : '';
    if (!endpoint) {
        return res.status(400).json({ error: 'Endpoint mancante.' });
    }

    try {
        const result = await pushService.getSubscriptionChampionships(endpoint);
        return res.json({ success: true, ...result });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

// Endpoint per cron esterno / Vercel Cron: forza il controllo dell'ID_CLASS
// e dei campionati seguiti dagli iscritti, inviando le notifiche se sono cambiati.
app.get('/api/push/check-ranking', async (req, res) => {
    if (!isPushCronAuthorized(req)) {
        return res.status(401).json({ error: 'Non autorizzato.' });
    }

    try {
        const idClass = await getLatestIdClass(true, false);
        const [result, championshipsResult, matchdayResult] = await Promise.all([
            notifyRankingChangeIfNeeded(idClass),
            checkChampionshipsAndNotify().catch((err) => {
                console.warn('[PushService] Errore controllo campionati durante check-ranking:', err);
                return null;
            }),
            checkMatchdayAndNotify().catch((err) => {
                console.warn('[PushService] Errore controllo matchday durante check-ranking:', err);
                return null;
            }),
        ]);
        return res.json({
            success: true,
            ...result,
            championships: championshipsResult,
            matchday: matchdayResult,
        });
    } catch (error: any) {
        console.error('[PushService] Errore controllo cambio ranking:', error);
        return res.status(500).json({
            error: 'Errore durante il controllo del cambio classifica.',
            details: error.message,
        });
    }
});

// Endpoint per cron esterno / Vercel Cron: controlla se nei campionati seguiti dagli utenti
// ci sono nuovi incontri disputati, variazioni di classifica o nuove statistiche.
app.get('/api/push/check-campionati', async (req, res) => {
    if (!isPushCronAuthorized(req)) {
        return res.status(401).json({ error: 'Non autorizzato.' });
    }

    const dryRun = req.query.dryRun === 'true';
    const init = req.query.init === 'true';
    const rawCam = typeof req.query.cam === 'string' ? req.query.cam : '';
    const camIds = rawCam
        ? rawCam
            .split(',')
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => Number.isFinite(n) && n > 0)
        : undefined;

    try {
        const result = await checkChampionshipsAndNotify({ camIds, dryRun, init });
        return res.json({ success: true, ...result });
    } catch (error: any) {
        console.error('[PushService] Errore controllo campionati:', error);
        return res.status(500).json({
            error: 'Errore durante il controllo dei campionati.',
            details: error.message,
        });
    }
});

// Endpoint per cron esterno / Vercel Cron: controlla se oggi è giorno di campionato
// per i campionati seguiti dagli utenti e invia la notifica push "Oggi è giorno di campionato!"
app.get('/api/push/check-matchday', async (req, res) => {
    if (!isPushCronAuthorized(req)) {
        return res.status(401).json({ error: 'Non autorizzato.' });
    }

    const dryRun = req.query.dryRun === 'true';
    const force = req.query.force === 'true';
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const rawCam = typeof req.query.cam === 'string' ? req.query.cam : '';
    const camIds = rawCam
        ? rawCam
            .split(',')
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => Number.isFinite(n) && n > 0)
        : undefined;

    try {
        const result = await checkMatchdayAndNotify({ camIds, date, dryRun, force });
        return res.json({ success: true, ...result });
    } catch (error: any) {
        console.error('[PushService] Errore controllo matchday:', error);
        return res.status(500).json({
            error: 'Errore durante il controllo del matchday.',
            details: error.message,
        });
    }
});

// Endpoint per cron esterno / Vercel Cron: controlla se sono stati pubblicati nuovi tornei
// nazionali o regionali e invia la notifica push a tutti i dispositivi registrati.
app.get('/api/push/check-tornei', async (req, res) => {
    if (!isPushCronAuthorized(req)) {
        return res.status(401).json({ error: 'Non autorizzato.' });
    }

    const dryRun = req.query.dryRun === 'true';
    const init = req.query.init === 'true';
    const concurrency = req.query.concurrency ? parseInt(req.query.concurrency as string, 10) : undefined;

    try {
        const result = await checkNewTorneiAndNotify({ dryRun, init, concurrency });
        return res.json({ success: true, ...result });
    } catch (error: any) {
        console.error('[PushService] Errore controllo nuovi tornei:', error);
        return res.status(500).json({
            error: 'Errore durante il controllo dei nuovi tornei.',
            details: error.message,
        });
    }
});

// ---------------------------------------------------------------------------
// YouTube Match Videos Sync & Lookup API
// ---------------------------------------------------------------------------

// Sincronizza i video dei canali YouTube (@GiacomoCerea, @Fitetofficial, @FilippoCantellaTT)
app.all(['/api/videos/sync', '/api/sync-youtube'], async (req, res) => {
    try {
        const result = await youtubeSyncService.syncAllChannels();
        return res.json({
            success: true,
            totalFetched: result.total,
            upserted: result.upserted,
            videosCount: result.videos.length,
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error('Error in YouTube sync endpoint:', error);
        return res.status(500).json({ error: error.message || 'Errore durante la sincronizzazione video YouTube' });
    }
});

// Restituisce l'elenco dei video archiviati, con filtri opzionali per cam, league o giornata
app.get('/api/videos', async (req, res) => {
    const forceRefresh = isForceRefreshRequest(req);
    const league = typeof req.query.league === 'string' ? req.query.league.toUpperCase() : undefined;
    const day = req.query.day ? parseInt(req.query.day as string, 10) : undefined;

    try {
        let videos = await youtubeSyncService.getAllVideos(forceRefresh);

        if (league) {
            videos = videos.filter((v) => v.league && v.league.toUpperCase().startsWith(league));
        }
        if (day !== undefined && !isNaN(day)) {
            videos = videos.filter((v) => v.match_day === day);
        }

        const formatted = videos.map((v) => ({
            videoId: v.video_id,
            channelName: v.channel_name,
            channelId: v.channel_id,
            channelUrl: v.channel_url,
            title: v.title,
            publishedAt: v.published_at,
            league: v.league,
            matchDay: v.match_day,
            teamHome: v.team_home,
            teamAway: v.team_away,
            videoUrl: v.video_url,
            video_id: v.video_id,
            channel_name: v.channel_name,
            channel_id: v.channel_id,
            channel_url: v.channel_url,
            published_at: v.published_at,
            match_day: v.match_day,
            team_home: v.team_home,
            team_away: v.team_away,
            video_url: v.video_url,
        }));

        return res.json({
            success: true,
            count: formatted.length,
            videos: formatted,
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

// ---------------------------------------------------------------------------
// Dynamic Open Graph & Instagram Story Image Generation
// ---------------------------------------------------------------------------
async function getOrFetchAthlete(id: string) {
    const cacheKey = `atleta_${id}`;
    const cached = cacheService.get<any>(cacheKey);
    const isHollow = !cached || !cached.anagrafica || cached.anagrafica.nome?.startsWith('Atleta ') || (cached.anagrafica.punti === 0 && (!cached.storicoClassifica || cached.storicoClassifica.length === 0));
    if (cached && !isHollow) return cached;

    try {
        let resolvedIdClass = await getLatestIdClass();
        const html = await FitetClient.fetchSchedaAtleta(id, resolvedIdClass);
        let partiteRanking: any = undefined;
        let iframeUrl = extractRankingIframeUrl(html);

        if (iframeUrl) {
            try {
                const iframeHtml = await FitetClient.fetchHtml(iframeUrl, false);
                partiteRanking = parsePartiteRanking(iframeHtml, id);
            } catch { }
        }

        const atleta = parseDettaglioAtleta(html, id, partiteRanking);
        if (atleta && atleta.anagrafica && atleta.anagrafica.nome) {
            cacheService.set(cacheKey, atleta, TTL_ATLETA);
            return atleta;
        }
        return atleta;
    } catch {
        return cached || null;
    }
}

function escapeHtmlMeta(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// In-memory cache per i buffer PNG dei social card (evita di ricalcolare Resvg a ogni hit)
const ogCardCache = new Map<string, { buffer: Buffer; expiresAt: number }>();

// 1. Dynamic Open Graph Social Card (1200 x 630 PNG)
app.get(['/api/og/player/:id.png', '/api/og/player/:id', '/api/og-player'], async (req, res) => {
    let id = req.params.id || (req.query.id as string);
    if (!id) return res.status(400).send('Missing player ID');

    id = id.replace(/\.png$/i, '');

    if (!/^\d+$/.test(id)) {
        const resolved = await athleteResolver.resolveAthleteId(decodeURIComponent(id).trim());
        if (resolved) id = resolved;
    }

    const cachedEntry = ogCardCache.get(id);
    if (cachedEntry && Date.now() < cachedEntry.expiresAt) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
        return res.send(cachedEntry.buffer);
    }

    const athlete = await getOrFetchAthlete(id);
    if (!athlete) {
        return res.status(404).send('Athlete not found');
    }

    try {
        const pngBuffer = await generateAthleteOgCard(athlete);
        ogCardCache.set(id, { buffer: pngBuffer, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
        return res.send(pngBuffer);
    } catch (err: any) {
        console.error('Error generating OG image for athlete', id, err);
        return res.status(500).send('Error generating card image');
    }
});

// 2. Dynamic Instagram Story Card (1080 x 1920 PNG - 9:16)
app.post('/api/story/render', async (req, res) => {
    const { athlete, theme } = req.body || {};
    if (!athlete) return res.status(400).send('Missing athlete data');

    try {
        const pngBuffer = await generateAthleteStoryCard(athlete, theme || 'panoramica');
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
        return res.send(pngBuffer);
    } catch (err: any) {
        console.error('Error rendering Story image from payload:', err);
        return res.status(500).send('Error generating story image');
    }
});

app.get(['/api/story/player/:id.png', '/api/story/player/:id', '/api/story-player'], async (req, res) => {
    let id = req.params.id || (req.query.id as string);
    const theme = (req.query.theme as any) || 'panoramica';
    if (!id) return res.status(400).send('Missing player ID');

    id = id.replace(/\.png$/i, '');

    if (!/^\d+$/.test(id)) {
        const resolved = await athleteResolver.resolveAthleteId(decodeURIComponent(id).trim());
        if (resolved) id = resolved;
    }

    const athlete = await getOrFetchAthlete(id);
    if (!athlete) {
        return res.status(404).send('Athlete not found');
    }

    try {
        const pngBuffer = await generateAthleteStoryCard(athlete, theme);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
        return res.send(pngBuffer);
    } catch (err: any) {
        console.error('Error generating Story image for athlete', id, err);
        return res.status(500).send('Error generating story image');
    }
});

let cachedBaseHtml: string | null = null;
async function getCachedBaseHtml(): Promise<string> {
    if (cachedBaseHtml) return cachedBaseHtml;
    const distPath = path.resolve(process.cwd(), 'dist');
    const indexFile = path.join(distPath, 'index.html');
    if (fs.existsSync(indexFile)) {
        try {
            cachedBaseHtml = await fs.promises.readFile(indexFile, 'utf8');
            return cachedBaseHtml;
        } catch { }
    }
    return '<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>Portale Risultati FITeT</title></head><body><div id="root"></div></body></html>';
}

// Dynamic OG tags for /player/:id and /atleta/:id for WhatsApp, Facebook and social preview crawlers
app.get(['/player/:id', '/atleta/:id'], async (req, res, next) => {
    let { id } = req.params;
    if (!id) return next();

    id = id.replace(/\.png$/i, '');

    if (!/^\d+$/.test(id)) {
        const resolved = await athleteResolver.resolveAthleteId(decodeURIComponent(id).trim());
        if (resolved) id = resolved;
    }

    const baseHtml = await getCachedBaseHtml();

    try {
        let athleteName = `Atleta #${id}`;
        let description = 'Visualizza la scheda atleta, ranking e storico incontri sul Portale Risultati FITeT.';

        const athlete = await getOrFetchAthlete(id);
        if (athlete?.anagrafica?.nome) {
            athleteName = athlete.anagrafica.nome;
            const societa = athlete.anagrafica.societa ? ` (${athlete.anagrafica.societa})` : '';
            const rankText = athlete.anagrafica.punti ? ` - ${athlete.anagrafica.punti.toLocaleString('it-IT')} pt` : '';
            description = `${athleteName}${societa}${rankText} • Scheda ranking, risultati e statistiche sul Portale Risultati FITeT.`;
        }

        const title = `${athleteName} | Scheda Ranking Portale Risultati FITeT`;
        const host = req.get('host') || 'portale-risultati-tt.it';
        const protocol = req.protocol === 'http' && host.includes('localhost') ? 'http' : 'https';
        const currentUrl = `${protocol}://${host}/player/${encodeURIComponent(id)}`;
        const ogImageUrl = `${protocol}://${host}/api/og/player/${encodeURIComponent(id)}.png`;

        const ogMeta = `
  <title>${escapeHtmlMeta(title)}</title>
  <meta name="description" content="${escapeHtmlMeta(description)}" />
  <meta property="og:title" content="${escapeHtmlMeta(title)}" />
  <meta property="og:description" content="${escapeHtmlMeta(description)}" />
  <meta property="og:image" content="${ogImageUrl}" />
  <meta property="og:image:secure_url" content="${ogImageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:url" content="${currentUrl}" />
  <meta property="og:type" content="profile" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtmlMeta(title)}" />
  <meta name="twitter:description" content="${escapeHtmlMeta(description)}" />
  <meta name="twitter:image" content="${ogImageUrl}" />
`;
        let html = baseHtml
            .replace(/<title>.*?<\/title>/gi, '')
            .replace(/<meta\s+property=["']og:[^"']*["'][^>]*>/gi, '')
            .replace(/<meta\s+name=["']twitter:[^"']*["'][^>]*>/gi, '')
            .replace(/<meta\s+name=["']description["'][^>]*>/gi, '');

        html = html.replace(/<head>/i, `<head>${ogMeta}`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('CDN-Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
        res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=604800');
        return res.send(html);
    } catch {
        return next();
    }
});

// ==========================================
// GDPR-Compliant Analytics (Zero Cookie / Zero IP)
// ==========================================
const safeTimingEqual = (a: string, b: string): boolean => {
    const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
    const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
    return crypto.timingSafeEqual(hashA, hashB);
};

interface AuthFailureState {
    failures: number;
    firstFailureAt: number;
    blockedUntil: number;
}

const ANALYTICS_AUTH_WINDOW_MS = 15 * 60 * 1000;
const ANALYTICS_AUTH_MAX_FAILURES = 5;
const ANALYTICS_AUTH_MAX_ENTRIES = 1000;
// Segreto effimero in sola RAM: nessun IP viene mai salvato in chiaro o persistito su DB/disco
const EPHEMERAL_AUTH_HMAC_KEY = crypto.randomBytes(32);
const analyticsAuthFailures = new Map<string, AuthFailureState>();

const getEphemeralAuthClientKey = (req: express.Request): string => {
    const forwarded = typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : '';
    const remote = forwarded || req.socket?.remoteAddress || 'unknown';
    return crypto.createHmac('sha256', EPHEMERAL_AUTH_HMAC_KEY).update(remote).digest('hex');
};

const pruneAuthFailureMap = (now: number): void => {
    for (const [key, state] of analyticsAuthFailures.entries()) {
        if (now - state.firstFailureAt > ANALYTICS_AUTH_WINDOW_MS && now >= state.blockedUntil) {
            analyticsAuthFailures.delete(key);
        }
    }
    while (analyticsAuthFailures.size >= ANALYTICS_AUTH_MAX_ENTRIES) {
        const oldestKey = analyticsAuthFailures.keys().next().value;
        if (!oldestKey) break;
        analyticsAuthFailures.delete(oldestKey);
    }
};

const recordAuthFailure = async (clientKey: string, now: number): Promise<void> => {
    pruneAuthFailureMap(now);
    const existing = analyticsAuthFailures.get(clientKey);
    const state: AuthFailureState =
        existing && now - existing.firstFailureAt <= ANALYTICS_AUTH_WINDOW_MS
            ? existing
            : { failures: 0, firstFailureAt: now, blockedUntil: 0 };

    state.failures += 1;
    if (state.failures >= ANALYTICS_AUTH_MAX_FAILURES) {
        state.blockedUntil = now + ANALYTICS_AUTH_WINDOW_MS;
    }
    analyticsAuthFailures.set(clientKey, state);

    // Ritardo progressivo (max 1.5s) per rallentare tentativi automatici
    const delayMs = Math.min(1500, state.failures * 250);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const requireAnalyticsBasicAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const expectedPass = process.env.ANALYTICS_ADMIN_PASS || process.env.ADMIN_PASSWORD || '';
    const expectedUser = process.env.ANALYTICS_ADMIN_USER || process.env.ADMIN_USER || 'admin';

    if (!expectedPass) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(503).json({
            error: 'Analytics admin non configurato. Imposta ANALYTICS_ADMIN_PASS nelle variabili d\'ambiente.',
        });
    }

    const now = Date.now();
    const clientKey = getEphemeralAuthClientKey(req);
    const failureState = analyticsAuthFailures.get(clientKey);
    if (failureState && now < failureState.blockedUntil) {
        const retryAfterSec = Math.max(1, Math.ceil((failureState.blockedUntil - now) / 1000));
        res.setHeader('Retry-After', String(retryAfterSec));
        res.setHeader('Cache-Control', 'no-store');
        return res.status(429).send('Troppi tentativi falliti. Riprova tra qualche minuto.');
    }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="FITeT Analytics Admin", charset="UTF-8"');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(401).send('Autenticazione richiesta');
    }

    let decoded = '';
    try {
        decoded = Buffer.from(authHeader.slice(6).trim(), 'base64').toString('utf8');
    } catch {
        await recordAuthFailure(clientKey, now);
        res.setHeader('WWW-Authenticate', 'Basic realm="FITeT Analytics Admin", charset="UTF-8"');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(401).send('Credenziali non valide');
    }

    const sepIdx = decoded.indexOf(':');
    const providedUser = sepIdx >= 0 ? decoded.slice(0, sepIdx) : '';
    const providedPass = sepIdx >= 0 ? decoded.slice(sepIdx + 1) : '';

    if (!safeTimingEqual(providedUser, expectedUser) || !safeTimingEqual(providedPass, expectedPass)) {
        await recordAuthFailure(clientKey, now);
        res.setHeader('WWW-Authenticate', 'Basic realm="FITeT Analytics Admin", charset="UTF-8"');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(401).send('Credenziali non valide');
    }

    analyticsAuthFailures.delete(clientKey);
    return next();
};

app.post('/api/visit', async (req, res) => {
    await trackRequestDailyVisitor(req);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
});

app.post('/api/click', express.text({ type: 'text/plain' }), async (req, res) => {
    let payload: Record<string, unknown> = {};
    if (typeof req.body === 'string') {
        try {
            const parsed = JSON.parse(req.body);
            if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>;
        } catch {
            return res.status(400).json({ error: 'Payload JSON non valido' });
        }
    } else if (req.body && typeof req.body === 'object') {
        payload = req.body as Record<string, unknown>;
    }

    const target = typeof payload.target === 'string' ? payload.target.trim() : '';
    const from = typeof payload.from === 'string' ? payload.from.trim() : null;
    const metricType = payload.type === 'page' ? 'page' : 'click';

    if (!target) {
        return res.status(400).json({ error: 'Campo "target" obbligatorio' });
    }

    await Promise.all([
        analyticsService.recordClick(target, from, metricType),
        trackRequestDailyVisitor(req),
    ]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });
});

app.get('/api/analytics', requireAnalyticsBasicAuth, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    try {
        const requestedDays = Number(req.query.days);
        const days = requestedDays === 7 ? 7 : 30;
        const summary = await analyticsService.getAnalytics(days);
        return res.json(summary);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Errore caricamento analytics';
        return res.status(500).json({ error: message });
    }
});

app.get('/admin/analytics', requireAnalyticsBasicAuth, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.type('html').send(renderAnalyticsAdminHtml());
});

// Serve static frontend files in production only when running as standalone node server (not on Vercel)
if (!process.env.VERCEL) {
    startDailyTorneiScheduler();
    startChampionshipScheduler();
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));

    // Dynamic OG & SEO tags for /regioni/:slug and /regione/:slug
    app.get(['/regioni/:slug', '/regione/:slug'], async (req, res, next) => {
        const { slug } = req.params;
        const preRenderedFile = path.join(distPath, 'regioni', slug.toLowerCase(), 'index.html');
        if (fs.existsSync(preRenderedFile)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.sendFile(preRenderedFile);
        }
        return next();
    });

    // Dynamic OG tags for /campionato/:id and /cam/:id
    app.get(['/campionato/:id', '/cam/:id'], async (req, res, next) => {
        const { id } = req.params;
        const indexFile = path.join(distPath, 'index.html');
        if (!fs.existsSync(indexFile)) return next();

        try {
            let html = await fs.promises.readFile(indexFile, 'utf8');
            const champ = await championshipCatalog.getChampionship(parseInt(id, 10));
            const champName = champ ? champ.nome : `Campionato #${id}`;
            const region = champ?.regione || 'Nazionale';
            const title = `${champName} (${region}) | Portale Risultati FITeT`;
            const description = `Consulta classifica, calendario andata/ritorno e risultati di ${champName} sul Portale Risultati FITeT.`;
            const currentUrl = `${req.protocol}://${req.get('host')}/campionato/${id}`;

            const ogMeta = `
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="/fitetun.png" />
  <meta property="og:url" content="${currentUrl}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="/fitetun.png" />
`;
            html = html.replace(/<title>.*?<\/title>/i, ogMeta);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(html);
        } catch {
            return next();
        }
    });

    app.get('/sitemap.xml', (req, res) => {
        const sitemapFile = path.resolve(process.cwd(), 'public', 'sitemap.xml');
        if (fs.existsSync(sitemapFile)) {
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            return res.sendFile(sitemapFile);
        }
        res.status(404).send('Not Found');
    });

    app.get('/robots.txt', (req, res) => {
        const robotsFile = path.resolve(process.cwd(), 'public', 'robots.txt');
        if (fs.existsSync(robotsFile)) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.sendFile(robotsFile);
        }
        res.status(404).send('Not Found');
    });

    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        const indexFile = path.join(distPath, 'index.html');
        res.sendFile(indexFile, (err) => {
            if (err) res.status(404).send('Not Found');
        });
    });
}

export default app;
