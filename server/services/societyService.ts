import { FitetClient } from './fitetClient';
import { cacheService } from './cacheService';
import { teamResolver } from './teamResolver';
import { athleteResolver } from './athleteResolver';
import { getLatestIdClass } from './rankingClassService';
import { championshipCatalog } from './championshipCatalog';
import { parseDettaglioAtleta } from '../parsers/atletaParser';
import { parseDettaglioSquadra } from '../parsers/squadraParser';
import { parseStatisticheAtleti } from '../parsers/statisticheParser';
import {
  parseDatiSquadra,
  parseSocietaArchive,
  parseSocietaClassificaArchive,
  parseSocietaRosterArchive,
} from '../parsers/societyParser';
import type {
  DettaglioAtleta,
  SocietaAtletaStagione,
  SocietaAtletaStorico,
  SocietaCampionatoStagione,
  SocietaDetectResponse,
  SocietaDettaglio,
  SocietaInfo,
  SocietaSquadraStagione,
  SocietaStagione,
  SocietaStagioneIndexItem,
} from '../../src/types/fitet';

const PORTAL_BASE = 'https://portale.fitet.org';
const ARCHIVE_BASE = 'http://archivio.fitet.org';
const DEFAULT_ANNO = 41;

const TTL_ARCHIVE = 12 * 60 * 60 * 1000;
const TTL_SOCIETY = 12 * 60 * 60 * 1000;
const TTL_SEASON = 24 * 60 * 60 * 1000;
const TTL_TEAM = 7 * 24 * 60 * 60 * 1000;
const TTL_CLASSIFICA = 30 * 60 * 1000;

interface SocietyTeamMatch {
  squadra: SocietaSquadraStagione;
  info: SocietaInfo;
}

interface SocietySeasonResult {
  stagione: SocietaStagione;
  info?: SocietaInfo;
}

interface ArchiveSocietyData {
  stagioni: SocietaStagioneIndexItem[];
  atletiStorici: SocietaAtletaStorico[];
  titoliNazionali: import('../../src/types/fitet').SocietaTitolo[];
  titoliRegionali: import('../../src/types/fitet').SocietaTitolo[];
}

const normalizeName = (value?: string): string =>
  (value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();

const nameTokens = (value?: string): string[] =>
  (value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !['ASD', 'APD', 'POLISPORTIVA', 'TENNISTAVOLO'].includes(token));

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

function getSeasonLabel(anno: number): string {
  // La stagione FITeT va da settembre a giugno: 41 => 2026/27.
  const startYear = 1985 + anno;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

async function loadArchiveSociety(societyId: string, forceRefresh = false): Promise<ArchiveSocietyData> {
  const cacheKey = `societa_archive_${societyId}`;
  if (!forceRefresh) {
    const cached = cacheService.get<ArchiveSocietyData>(cacheKey);
    if (cached) return cached;
  }

  const html = await FitetClient.fetchHtml(
    `${ARCHIVE_BASE}/scheda_dettaglio_soc.php?TEAM=${encodeURIComponent(societyId)}`
  );
  const parsed = parseSocietaArchive(html);
  cacheService.set(cacheKey, parsed, TTL_ARCHIVE);
  return parsed;
}

async function getArchiveClassifica(
  campId: number,
  anno: number,
  forceRefresh = false
): Promise<SocietaSquadraStagione[]> {
  const cacheKey = `societa_classifica_${campId}_${anno}`;
  if (!forceRefresh) {
    const cached = cacheService.get<SocietaSquadraStagione[]>(cacheKey);
    if (cached) return cached;
  }

  const html = await FitetClient.fetchHtml(
    `${PORTAL_BASE}/risultati/archivio/ClassificaSquadre.asp?ANNATA=${anno}&CAMP=${campId}`
  );
  const parsed = parseSocietaClassificaArchive(html);
  if (parsed.length > 0) {
    cacheService.set(cacheKey, parsed, TTL_CLASSIFICA);
  }
  return parsed;
}

async function getTeamRegistry(
  teamId: string,
  cam: number,
  anno: number,
  forceRefresh = false
): Promise<{ teamName: string; info: SocietaInfo } | null> {
  const cacheKey = `societa_team_${teamId}_${cam}_${anno}`;
  if (!forceRefresh) {
    const cached = cacheService.get<{ teamName: string; info: SocietaInfo }>(cacheKey);
    if (cached) {
      if (cached.info?.societyId) {
        cacheService.set(`societa_info_${cached.info.societyId}`, cached.info, TTL_TEAM);
      }
      return cached;
    }
  }

  try {
    const html = await FitetClient.fetchHtml(
      `${PORTAL_BASE}/risultati/campionati/DatiSquadra.asp?SQUADRA=${teamId}&CAM=${cam}&ANNO=${anno}`
    );
    const parsed = parseDatiSquadra(html, teamId);
    if (!parsed.info.societyId) return null;

    const payload = { teamName: parsed.teamName, info: parsed.info };
    cacheService.set(cacheKey, payload, TTL_TEAM);
    cacheService.set(`societa_info_${parsed.info.societyId}`, parsed.info, TTL_TEAM);
    return payload;
  } catch (err) {
    console.warn(`[Societa] Impossibile leggere DatiSquadra per ${teamId}:`, err);
    return null;
  }
}

function isLikelySocietyTeam(
  teamName: string,
  societyId: string,
  knownNames: string[],
  societyName?: string
): boolean {
  const normalizedTeam = normalizeName(teamName);
  if (!normalizedTeam) return false;

  const names = [...knownNames];
  if (societyName) names.push(societyName);

  for (const candidate of names) {
    const normalizedCandidate = normalizeName(candidate);
    if (!normalizedCandidate) continue;
    if (
      normalizedTeam === normalizedCandidate ||
      normalizedTeam.includes(normalizedCandidate) ||
      normalizedCandidate.includes(normalizedTeam)
    ) {
      return true;
    }
  }

  const teamTokens = new Set(nameTokens(teamName));
  const candidateTokens = new Set(names.flatMap((name) => nameTokens(name)));
  for (const token of teamTokens) {
    if (candidateTokens.has(token)) return true;
  }

  // Il logo della squadra è già indicizzato con l'ID Albo della società.
  const logo = teamResolver.getLogo(teamName);
  if (logo && logo.includes(`/societa/${societyId}.`)) return true;

  return false;
}

async function findSocietyTeams(
  squadre: SocietaSquadraStagione[],
  societyId: string,
  campId: number,
  anno: number,
  knownNames: string[] = [],
  scanAllFallback = true
): Promise<{ matches: SocietyTeamMatch[]; info?: SocietaInfo }> {
  if (!squadre.length) return { matches: [] };

  const cachedInfo = cacheService.get<SocietaInfo>(`societa_info_${societyId}`);
  const societyName = cachedInfo?.nome;

  const prefiltered = squadre.filter((team) =>
    isLikelySocietyTeam(team.nome, societyId, knownNames, societyName)
  );
  const candidates = prefiltered.length > 0 ? prefiltered : squadre.slice(0, 16);
  const candidateIds = new Set(candidates.map((team) => team.squadraId));

  const registry = await mapLimit(candidates, 4, async (team) => ({
    team,
    registry: await getTeamRegistry(team.squadraId, campId, anno),
  }));

  const matches: SocietyTeamMatch[] = [];
  let info: SocietaInfo | undefined;

  for (const item of registry) {
    if (!item.registry) continue;
    if (String(item.registry.info.societyId) !== String(societyId)) continue;
    matches.push({ squadra: item.team, info: item.registry.info });
    info = info || item.registry.info;
  }

  if (matches.length === 0 && scanAllFallback) {
    const remaining = squadre
      .filter((team) => !candidateIds.has(team.squadraId))
      .slice(0, 16);

    const fallbackRegistry = await mapLimit(remaining, 4, async (team) => ({
      team,
      registry: await getTeamRegistry(team.squadraId, campId, anno),
    }));

    for (const item of fallbackRegistry) {
      if (!item.registry) continue;
      if (String(item.registry.info.societyId) !== String(societyId)) continue;
      matches.push({ squadra: item.team, info: item.registry.info });
      info = info || item.registry.info;
    }
  }

  return { matches, info };
}

async function loadTeamRoster(
  teamId: string,
  campId: number,
  anno: number,
  isCurrent: boolean,
  teamName: string
): Promise<SocietaAtletaStagione[]> {
  try {
    if (isCurrent) {
      const html = await FitetClient.fetchHtml(
        `${PORTAL_BASE}/risultati/campionati/percentuali.php?SQUADRA=${teamId}&CAM=${campId}`
      );
      const parsed = parseDettaglioSquadra(html, teamId, campId);
      if (parsed.atleti.length > 0) {
        return parsed.atleti.map((athlete) => ({
          atletaId: athlete.isDoppio ? null : athlete.atletaId || null,
          nome: athlete.nome,
          isDoppio: athlete.isDoppio,
          squadraId: teamId,
          squadraNome: teamName,
          rankPosizione: athlete.rankPosizione,
          rankPunti: athlete.rankPunti,
          partiteDisputate: athlete.partiteDisputate,
          partiteVinte: athlete.partiteVinte,
          partitePerse: athlete.partitePerse,
          setVinti: athlete.setVinti,
          setPersi: athlete.setPersi,
          puntiVinti: athlete.puntiVinti,
          puntiPersi: athlete.puntiPersi,
          percentualeVittorie: athlete.percentualeVittorie,
        }));
      }
    }
  } catch (err) {
    console.warn(`[Societa] Roster live non disponibile per ${teamId}/${campId}:`, err);
  }

  try {
    const html = await FitetClient.fetchHtml(
      `${PORTAL_BASE}/risultati/archivio/Percentuali.asp?SQUADRA=${teamId}&CAMP=${campId}&ANNATA=${anno}`
    );
    return parseSocietaRosterArchive(html, teamId, teamName);
  } catch (err) {
    console.warn(`[Societa] Roster archivio non disponibile per ${teamId}/${campId}/${anno}:`, err);
    return [];
  }
}

function uniqueAthletes(athletes: SocietaAtletaStagione[]): SocietaAtletaStagione[] {
  const seen = new Set<string>();
  const result: SocietaAtletaStagione[] = [];
  for (const athlete of athletes) {
    const key = athlete.atletaId
      ? `id:${athlete.atletaId}`
      : `name:${normalizeName(athlete.nome)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(athlete);
  }
  return result.sort((a, b) => b.partiteVinte - a.partiteVinte || b.percentualeVittorie - a.percentualeVittorie);
}

async function buildSocietySeason(
  societyId: string,
  season: SocietaStagioneIndexItem,
  isCurrent: boolean,
  knownNames: string[] = []
): Promise<SocietySeasonResult> {
  const campionati: SocietaCampionatoStagione[] = [];
  let info: SocietaInfo | undefined;
  let activeKnownNames = [...knownNames];
  const resolvedInfo = cacheService.get<SocietaInfo>(`societa_info_${societyId}`);
  if (resolvedInfo) info = resolvedInfo;

  for (const camp of season.campionati.slice(0, 4)) {
    try {
      const classifica = await getArchiveClassifica(camp.campId, season.anno);
      if (classifica.length === 0) continue;

      const { matches, info: foundInfo } = await findSocietyTeams(
        classifica,
        societyId,
        camp.campId,
        season.anno,
        activeKnownNames
      );
      if (foundInfo) info = info || foundInfo;

      if (matches.length === 0) continue;

      const squadre: SocietaSquadraStagione[] = [];
      for (const match of matches) {
        const roster = await loadTeamRoster(
          match.squadra.squadraId,
          camp.campId,
          season.anno,
          isCurrent,
          match.squadra.nome
        );
        squadre.push({ ...match.squadra, atleti: roster });
        activeKnownNames = Array.from(new Set([...activeKnownNames, match.squadra.nome]));
      }

      campionati.push({
        campId: camp.campId,
        nome: camp.nome,
        anno: season.anno,
        stagione: season.stagione,
        squadre,
      });
    } catch (err) {
      console.warn(`[Societa] Errore campionato ${camp.campId}/${season.anno}:`, err);
    }
  }

  const allAthletes = uniqueAthletes(campionati.flatMap((camp) => camp.squadre.flatMap((team) => team.atleti)));
  const puntiTotali = campionati.reduce(
    (sum, camp) => sum + camp.squadre.reduce((teamSum, team) => teamSum + (team.punti || 0), 0),
    0
  );
  const squadreCount = campionati.reduce((sum, camp) => sum + camp.squadre.length, 0);

  return {
    stagione: {
      anno: season.anno,
      stagione: season.stagione,
      isCorrente: isCurrent,
      campionati,
      puntiTotali,
      squadreCount,
      atleti: allAthletes,
      atletiCount: allAthletes.length,
    },
    info,
  };
}

function buildFallbackInfo(societyId: string): SocietaInfo {
  const knownTeams = teamResolver.getTeamNamesForSociety(societyId);
  const name = knownTeams[0]
    ? knownTeams[0].replace(/\s+"?[A-Z]"$/i, '').trim()
    : `Società #${societyId}`;

  return {
    societyId: String(societyId),
    nome: name,
    logoUrl:
      knownTeams[0] && teamResolver.getLogo(knownTeams[0])
        ? (teamResolver.getLogo(knownTeams[0]) as string)
        : `${PORTAL_BASE}/images/societa/${societyId}.jpg`,
    alboFederale: String(societyId),
  };
}

async function findSocietyInfoFromHistory(
  societyId: string,
  stagioni: SocietaStagioneIndexItem[]
): Promise<SocietaInfo | null> {
  const cached = cacheService.get<SocietaInfo>(`societa_info_${societyId}`);
  if (cached) return cached;

  for (const season of stagioni.slice(0, 5)) {
    if (!season.campionati.length) continue;
    for (const camp of season.campionati.slice(0, 2)) {
      try {
        const classifica = await getArchiveClassifica(camp.campId, season.anno);
        if (!classifica.length) continue;
        const { info } = await findSocietyTeams(
          classifica,
          societyId,
          camp.campId,
          season.anno,
          teamResolver.getTeamNamesForSociety(societyId)
        );
        if (info) return info;
      } catch {
        // Continua con la stagione successiva.
      }
    }
  }

  return null;
}

/**
 * Finds the team (within a championship) that the athlete belongs to.
 * Strategy, fastest first:
 *  1. team name already exposed by the athlete ranking data;
 *  2. championship athlete statistics (one request);
 *  3. roster scan of the championship teams (bounded, last resort).
 */
async function resolveAthleteTeamName(
  atletaId: string,
  atletaNome: string,
  camId: number,
  anno: number,
  classifica: SocietaSquadraStagione[],
  societyName: string,
  knownTeamName?: string
): Promise<string> {
  if (knownTeamName) return knownTeamName;

  const targetName = normalizeName(atletaNome);

  try {
    const statsHtml = await FitetClient.fetchStatisticheAtleti(camId);
    const stats = parseStatisticheAtleti(statsHtml);
    const match =
      stats.find((item) => item.atletaId && String(item.atletaId) === String(atletaId)) ||
      stats.find((item) => targetName && normalizeName(item.atleta) === targetName);
    if (match?.squadra) return match.squadra;
  } catch (err) {
    console.warn(`[Societa] Statistiche non disponibili per CAM ${camId}:`, err);
  }

  // Prefiltro per nome società, poi scan di tutte le squadre del campionato.
  const societyTokens = new Set(nameTokens(societyName));
  const ranked = [...classifica].sort((a, b) => {
    const aScore = nameTokens(a.nome).some((token) => societyTokens.has(token)) ? 0 : 1;
    const bScore = nameTokens(b.nome).some((token) => societyTokens.has(token)) ? 0 : 1;
    return aScore - bScore;
  });

  const results = await mapLimit(ranked.slice(0, 16), 4, async (team) => {
    try {
      const html = await FitetClient.fetchHtml(
        `${PORTAL_BASE}/risultati/campionati/percentuali.php?SQUADRA=${team.squadraId}&CAM=${camId}`
      );
      const parsed = parseDettaglioSquadra(html, team.squadraId, camId);
      const hit = parsed.atleti.find(
        (athlete) =>
          (athlete.atletaId && String(athlete.atletaId) === String(atletaId)) ||
          (targetName && normalizeName(athlete.nome) === targetName)
      );
      return hit ? team.nome : null;
    } catch {
      return null;
    }
  });

  return results.find((name) => Boolean(name)) || '';
}

function attachHistoricalAthleteIds(
  atletiStorici: SocietaAtletaStorico[],
  currentAthletes: SocietaAtletaStagione[]
): SocietaAtletaStorico[] {
  const mapping = athleteResolver.getMapping();
  const byName = new Map<string, string>();
  for (const [name, id] of Object.entries(mapping)) {
    byName.set(normalizeName(name), id);
  }
  for (const athlete of currentAthletes) {
    if (athlete.atletaId) {
      byName.set(normalizeName(athlete.nome), athlete.atletaId);
    }
  }

  return atletiStorici.map((athlete) => ({
    ...athlete,
    atletaId: athlete.atletaId || byName.get(normalizeName(athlete.nome)) || null,
  }));
}

export const societyService = {
  async getSociety(
    societyId: string,
    anno = DEFAULT_ANNO,
    forceRefresh = false
  ): Promise<SocietaDettaglio> {
    const cacheKey = `societa_dettaglio_${societyId}_${anno}`;
    if (!forceRefresh) {
      const cached = cacheService.get<SocietaDettaglio>(cacheKey);
      if (cached) return cached;
    }

    const archive = await loadArchiveSociety(societyId, forceRefresh);
    const knownNames = teamResolver.getTeamNamesForSociety(societyId);

    const currentSeason =
      archive.stagioni.find((season) => season.anno === anno) ||
      archive.stagioni.find((season) => season.campionati.length > 0) ||
      null;

    let stagioneCorrente: SocietaStagione | null = null;
    let info: SocietaInfo | null = null;

    if (currentSeason) {
      const result = await buildSocietySeason(societyId, currentSeason, true, knownNames);
      stagioneCorrente = result.stagione;
      info = result.info || null;
    }

    if (!info) {
      info = await findSocietyInfoFromHistory(societyId, archive.stagioni);
    }
    if (!info) {
      info = buildFallbackInfo(societyId);
    }

    const atletiStorici = attachHistoricalAthleteIds(
      archive.atletiStorici,
      stagioneCorrente?.atleti || []
    );

    const payload: SocietaDettaglio = {
      info,
      stagioneCorrente,
      stagioni: archive.stagioni,
      atletiStorici,
      titoliNazionali: archive.titoliNazionali,
      titoliRegionali: archive.titoliRegionali,
      lastUpdated: new Date().toISOString(),
    };

    cacheService.set(cacheKey, payload, TTL_SOCIETY);
    return payload;
  },

  async getSocietySeason(
    societyId: string,
    anno: number,
    forceRefresh = false
  ): Promise<SocietaStagione> {
    const cacheKey = `societa_stagione_${societyId}_${anno}`;
    if (!forceRefresh) {
      const cached = cacheService.get<SocietaStagione>(cacheKey);
      if (cached) return cached;
    }

    const archive = await loadArchiveSociety(societyId, forceRefresh);
    const season = archive.stagioni.find((item) => item.anno === anno);
    if (!season) {
      return {
        anno,
        stagione: getSeasonLabel(anno),
        isCorrente: anno === DEFAULT_ANNO,
        campionati: [],
        puntiTotali: 0,
        squadreCount: 0,
        atleti: [],
        atletiCount: 0,
      };
    }

    const knownNames = teamResolver.getTeamNamesForSociety(societyId);
    const result = await buildSocietySeason(societyId, season, anno === DEFAULT_ANNO, knownNames);
    cacheService.set(cacheKey, result.stagione, TTL_SEASON);
    return result.stagione;
  },

  async detectFromAthlete(
    atletaId: string,
    anno = DEFAULT_ANNO
  ): Promise<SocietaDetectResponse> {
    let athlete: DettaglioAtleta | null = cacheService.get<DettaglioAtleta>(`atleta_${atletaId}`);
    if (!athlete) {
      try {
        const idClass = await getLatestIdClass(false, false);
        const html = await FitetClient.fetchSchedaAtleta(atletaId, idClass);
        athlete = parseDettaglioAtleta(html, atletaId);
      } catch (err) {
        console.warn(`[Societa] Impossibile leggere la scheda atleta ${atletaId}:`, err);
        return { found: false, needsManual: true, reason: 'athlete_not_available' };
      }
    }

    const societyName = athlete.anagrafica?.societa || '';
    const playedCamps = [
      athlete.campionatoAttuale,
      ...(athlete.campionatiGiocati || []),
    ].filter(Boolean) as NonNullable<DettaglioAtleta['campionatoAttuale']>[];

    const uniqueCamps = new Map<number, NonNullable<DettaglioAtleta['campionatoAttuale']>>();
    for (const camp of playedCamps) {
      if (camp?.camId && !uniqueCamps.has(camp.camId)) {
        uniqueCamps.set(camp.camId, camp);
      }
    }

    for (const [camId, camp] of uniqueCamps) {
      try {
        const classifica = await getArchiveClassifica(camId, anno);
        if (!classifica.length) continue;

        const teamName = await resolveAthleteTeamName(
          atletaId,
          athlete.anagrafica?.nome || '',
          camId,
          anno,
          classifica,
          societyName,
          camp.squadra
        );
        if (!teamName) continue;

        const normalizedTeam = normalizeName(teamName);
        const normalizedSociety = normalizeName(societyName);

        const team =
          classifica.find((item) => normalizeName(item.nome) === normalizedTeam) ||
          classifica.find((item) => {
            const candidate = normalizeName(item.nome);
            return (
              (normalizedTeam && (candidate.includes(normalizedTeam) || normalizedTeam.includes(candidate))) ||
              (normalizedSociety && (candidate.includes(normalizedSociety) || normalizedSociety.includes(candidate)))
            );
          }) ||
          classifica.find((item) => {
            const candidateTokens = new Set(nameTokens(item.nome));
            return nameTokens(societyName).some((token) => candidateTokens.has(token));
          });

        if (!team) continue;

        const registry = await getTeamRegistry(team.squadraId, camId, anno);
        if (!registry || !registry.info.societyId) continue;

        return {
          found: true,
          societyId: registry.info.societyId,
          info: registry.info,
          camId,
          teamName: team.nome,
          teamId: team.squadraId,
          societyName,
        };
      } catch (err) {
        console.warn(`[Societa] Detection fallita per CAM ${camId}:`, err);
      }
    }

    return {
      found: false,
      needsManual: true,
      societyName,
      reason: 'team_not_found',
    };
  },

  async lookupByTeamId(
    teamId: string,
    cam: number,
    anno = DEFAULT_ANNO
  ): Promise<{ found: boolean; societyId?: string; info?: SocietaInfo }> {
    const registry = await getTeamRegistry(teamId, cam, anno);
    if (!registry || !registry.info.societyId) {
      return { found: false };
    }
    return {
      found: true,
      societyId: registry.info.societyId,
      info: registry.info,
    };
  },

  /**
   * Manual one-off selection: accepts an Albo Federale ID or a team name and
   * resolves it to a society. Used when automatic detection fails.
   */
  async lookupSociety(
    query: string,
    anno = DEFAULT_ANNO
  ): Promise<{
    found: boolean;
    societyId?: string;
    info?: SocietaInfo;
    camId?: number;
    teamName?: string;
    teamId?: string;
  }> {
    const trimmed = (query || '').trim();
    if (!trimmed) return { found: false };

    // 1) ID Albo Federale (la scheda archivio usa lo stesso ID della società).
    if (/^\d{2,6}$/.test(trimmed)) {
      try {
        const archive = await loadArchiveSociety(trimmed);
        if (archive.stagioni.length > 0) {
          const info =
            cacheService.get<SocietaInfo>(`societa_info_${trimmed}`) ||
            (await findSocietyInfoFromHistory(trimmed, archive.stagioni)) ||
            buildFallbackInfo(trimmed);
          return { found: true, societyId: String(trimmed), info };
        }
      } catch {
        // Non è una società: può essere un ID squadra, proviamo per nome.
      }
    }

    // 2) Indice locale team → società (istantaneo per le squadre già note).
    const normalizedQuery = normalizeName(trimmed);
    const indexedLogo = teamResolver.getLogo(trimmed);
    const indexedSociety = indexedLogo?.match(/\/societa\/(\d+)\./i)?.[1];
    if (indexedSociety) {
      const info =
        cacheService.get<SocietaInfo>(`societa_info_${indexedSociety}`) ||
        buildFallbackInfo(indexedSociety);
      return { found: true, societyId: indexedSociety, info };
    }

    // 3) Ricerca del nome squadra nelle classifiche della stagione corrente.
    let campionati: Awaited<ReturnType<typeof championshipCatalog.getAllCampionati>> = [];
    try {
      campionati = await championshipCatalog.getAllCampionati();
    } catch (err) {
      console.warn('[Societa] Catalogo campionati non disponibile per la ricerca manuale:', err);
      return { found: false };
    }

    const targets = campionati
      .filter((camp) => !camp.anno || camp.anno === anno)
      .slice(0, 32);

    const tryChampionship = async (camp: (typeof targets)[number]) => {
      try {
        const classifica = await getArchiveClassifica(camp.id, anno);
        if (!classifica.length) return null;

        const team =
          classifica.find((item) => normalizeName(item.nome) === normalizedQuery) ||
          classifica.find((item) => {
            const candidate = normalizeName(item.nome);
            return (
              (normalizedQuery && candidate.includes(normalizedQuery)) ||
              (candidate && normalizedQuery.includes(candidate))
            );
          }) ||
          null;
        if (!team) return null;

        const registry = await getTeamRegistry(team.squadraId, camp.id, anno);
        if (!registry?.info?.societyId) return null;

        return {
          found: true as const,
          societyId: String(registry.info.societyId),
          info: registry.info,
          camId: camp.id,
          teamName: team.nome,
          teamId: team.squadraId,
        };
      } catch (err) {
        console.warn(`[Societa] Ricerca manuale fallita nel campionato ${camp.id}:`, err);
        return null;
      }
    };

    const batchSize = 4;
    for (let i = 0; i < targets.length; i += batchSize) {
      const results = await Promise.all(targets.slice(i, i + batchSize).map(tryChampionship));
      const hit = results.find((result) => result !== null);
      if (hit) return hit;
    }

    return { found: false };
  },

  async resolveHistoricalAthlete(name: string, tessera?: string): Promise<string | null> {    const cacheKey = `societa_hist_atleta_${tessera || normalizeName(name)}`;
    const cached = cacheService.get<string>(cacheKey);
    if (cached) return cached;

    const target = normalizeName(name);
    const mapping = athleteResolver.getMapping();
    for (const [mappedName, id] of Object.entries(mapping)) {
      if (normalizeName(mappedName) === target) {
        cacheService.set(cacheKey, id, 30 * 24 * 60 * 60 * 1000);
        return id;
      }
    }

    try {
      const results = await FitetClient.searchAtleta(name);
      const matched =
        (tessera && results.find((item) => (item.label || '').includes(`[${tessera}]`))) ||
        results.find((item) => normalizeName(item.value) === target) ||
        null;

      if (matched?.id) {
        cacheService.set(cacheKey, matched.id, 30 * 24 * 60 * 60 * 1000);
        return matched.id;
      }
    } catch (err) {
      console.warn(`[Societa] Impossibile risolvere atleta storico ${name}:`, err);
    }

    return null;
  },
};
