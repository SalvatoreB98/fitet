import React, { useEffect, useId, useMemo, useState } from 'react';
import { DettaglioAtleta, HeadToHeadData, PartitaCampionatoAtleta } from '../types/fitet';
import { fetchAtleta, fetchAtletaCampionatoPartite } from '../services/api';
import './HeadToHeadComparisonPanel.css';

type Tone = 'a' | 'b' | null;
type FormSource = 'ranking' | 'campionato' | null;

interface HeadToHeadComparisonPanelProps {
  atleta1Id: string;
  atleta1Nome: string;
  atleta2Id: string;
  atleta2Nome: string;
  h2h?: HeadToHeadData | null;
}

interface AthleteFormMatch {
  outcome: 'V' | 'S';
  date?: string;
  opponent?: string;
  event?: string;
  score?: string;
}

interface AthleteSnapshot {
  detail: DettaglioAtleta;
  form: AthleteFormMatch[];
  formSource: FormSource;
  championshipMatches: PartitaCampionatoAtleta[];
}

interface AthleteMetrics {
  name: string;
  rank: number | null;
  rankLabel: string | null;
  rankSub: string | null;
  points: number | null;
  pointsLabel: string | null;
  pointsSub: string | null;
  bestRank: number | null;
  bestRankLabel: string | null;
  bestPoints: number | null;
  bestPointsLabel: string | null;
  category: string | null;
  society: string | null;
  societySub: string | null;
  championship: string | null;
  championshipSub: string | null;
  sector: string | null;
  region: string | null;
  ageLabel: string | null;
  ageSub: string | null;
  form: AthleteFormMatch[];
  formSource: FormSource;
  formWins: number;
  formLosses: number;
  formRate: number | null;
  formSummary: string | null;
  seasonRecord: string | null;
  seasonSub: string | null;
  seasonRate: number | null;
  championshipRecord: string | null;
  championshipRecordSub: string | null;
  championshipRate: number | null;
  pointsEarned: number | null;
  pointsEarnedLabel: string | null;
  pointsEarnedSub: string | null;
  lastMatch: AthleteFormMatch | null;
  lastMatchValue: string | null;
  lastMatchSub: string | null;
}

interface ComparisonRow {
  key: string;
  label: string;
  a: React.ReactNode;
  b: React.ReactNode;
  aSub?: React.ReactNode;
  bSub?: React.ReactNode;
  tone?: Tone;
}

interface ComparisonGroup {
  key: string;
  label: string;
  icon: string;
  rows: ComparisonRow[];
}

interface FavoriteVerdict {
  key: 'points' | 'form';
  label: string;
  side: 'a' | 'b' | 'even' | null;
  name: string;
  fullName?: string;
  margin: string | null;
}

interface FavoriteResult {
  probA: number;
  probB: number;
  leader: 'a' | 'b';
  isEven: boolean;
  label: string;
  name: string;
  leaderProb: number;
  verdicts: FavoriteVerdict[];
  note: string;
}

const parseDateValue = (value?: string): number => {
  const trimmed = value?.trim();
  if (!trimmed) return 0;

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const timestamp = Date.parse(trimmed);
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  const parts = trimmed.split(/[\/\-\.]/);
  if (parts.length !== 3) return 0;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;

  if (!day || !month || !year) return 0;
  return new Date(year, month - 1, day).getTime();
};

const formatDate = (value?: string): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const [year, month, day] = trimmed.slice(0, 10).split('-');
    if (year && month && day) return `${day}/${month}/${year}`;
  }

  return trimmed;
};

const formatNumber = (value: number, maximumFractionDigits = 2): string =>
  new Intl.NumberFormat('it-IT', { maximumFractionDigits }).format(value);

const formatCompactNumber = (value: number): string =>
  new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(value);

const formatSigned = (value: number, maximumFractionDigits = 0): string => {
  const formatted = formatNumber(Math.abs(value), maximumFractionDigits);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
};

const formatCategory = (value?: string): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const numeric = trimmed.match(/^(\d+)(?:\s*\^.*)?$/);
  if (numeric) return `${numeric[1]}ª Cat.`;
  return trimmed;
};

const shortenName = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return name.trim();
  return `${parts[0]} ${parts
    .slice(1)
    .map((part) => `${part.charAt(0).toUpperCase()}.`)
    .join(' ')}`;
};

const calculateAge = (birthDate?: string): number | null => {
  const timestamp = parseDateValue(birthDate);
  if (!timestamp) return null;

  const birth = new Date(timestamp);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age >= 0 && age < 130 ? age : null;
};

const text = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const extractRankingForm = (detail: DettaglioAtleta): AthleteFormMatch[] => {
  const matches: AthleteFormMatch[] = [];

  (detail.partiteRanking?.campionato || []).forEach((match) => {
    matches.push({
      outcome: match.isVittoria ? 'V' : 'S',
      date: match.data,
      opponent: match.avversario,
      event: match.campionato,
      score: match.risultatoSet,
    });
  });

  (detail.partiteRanking?.tornei || []).forEach((match) => {
    matches.push({
      outcome: match.isVittoria ? 'V' : 'S',
      date: match.data,
      opponent: match.avversario,
      event: [match.torneo, match.gara].filter(Boolean).join(' · '),
      score: match.risultatoSet,
    });
  });

  return matches
    .filter((match) => Boolean(match.date))
    .sort((a, b) => parseDateValue(a.date) - parseDateValue(b.date))
    .slice(-5);
};

const extractChampionshipForm = (matches: PartitaCampionatoAtleta[]): AthleteFormMatch[] =>
  [...matches]
    .sort((a, b) => a.giornata - b.giornata)
    .slice(-5)
    .map((match) => ({
      outcome: match.isVittoria ? 'V' : 'S',
      opponent: match.avversario,
      event: `Giornata ${match.giornata}`,
      score: match.risultatoSet,
    }));

const loadAthleteSnapshot = async (
  athleteId: string,
  fallbackName: string
): Promise<AthleteSnapshot> => {
  const detail = await fetchAtleta(athleteId);
  let form = extractRankingForm(detail);
  let formSource: FormSource = form.length > 0 ? 'ranking' : null;
  let championshipMatches: PartitaCampionatoAtleta[] = [];

  if (form.length === 0 && detail.campionatoAttuale?.camId) {
    try {
      const championship = await fetchAtletaCampionatoPartite(
        athleteId,
        detail.campionatoAttuale.camId,
        undefined,
        detail.anagrafica?.nome || fallbackName
      );
      championshipMatches = championship.matches || [];
      const championshipForm = extractChampionshipForm(championshipMatches);
      if (championshipForm.length > 0) {
        form = championshipForm;
        formSource = 'campionato';
      }
    } catch {
      // The panel can still compare ranking and season data without match-level form.
    }
  }

  return { detail, form, formSource, championshipMatches };
};

const buildMetrics = (snapshot: AthleteSnapshot, fallbackName: string): AthleteMetrics => {
  const { detail, form, formSource } = snapshot;
  const anagrafica = detail.anagrafica;
  const riepilogo = detail.riepilogo;

  const storico = [...(detail.storicoClassifica || [])].sort(
    (a, b) => parseDateValue(a.data) - parseDateValue(b.data)
  );
  const latest = storico.length > 0 ? storico[storico.length - 1] : null;
  const previous = storico.length > 1 ? storico[storico.length - 2] : null;

  const rank = latest?.posizione ?? null;
  const status = text(anagrafica?.stato);
  const rankLabel =
    rank != null
      ? `#${formatCompactNumber(rank)}`
      : latest || status?.toLowerCase().includes('fuori')
        ? 'Fuori quadro'
        : null;

  const rankDelta =
    rank != null && previous?.posizione != null ? previous.posizione - rank : null;
  const rankSubParts: string[] = [];
  if (rankDelta != null) {
    rankSubParts.push(rankDelta === 0 ? 'stabile' : `${formatSigned(rankDelta)} pos.`);
  }
  if (latest?.data) rankSubParts.push(`al ${formatDate(latest.data)}`);
  const rankSub = rankSubParts.length > 0 ? rankSubParts.join(' · ') : null;

  let points = anagrafica?.punti;
  if ((points === undefined || points === null || points < 10) && latest && latest.punti >= 100) {
    points = latest.punti;
  }
  if ((points === undefined || points === null) && latest) {
    points = latest.punti;
  }
  const pointsValue =
    points !== undefined && points !== null && Number.isFinite(points) ? points : null;

  const pointsDelta =
    latest?.punti != null && previous?.punti != null
      ? latest.punti - previous.punti
      : null;
  const pointsSubParts: string[] = [];
  if (pointsDelta != null) {
    pointsSubParts.push(pointsDelta === 0 ? 'stabile' : `${formatSigned(pointsDelta)} pt`);
  }
  if (latest?.data) pointsSubParts.push(`al ${formatDate(latest.data)}`);
  const pointsSub = pointsSubParts.length > 0 ? pointsSubParts.join(' · ') : null;

  const rankedSnapshots = storico
    .map((item) => item.posizione)
    .filter((value): value is number => typeof value === 'number' && value > 0);
  const bestRank = rankedSnapshots.length > 0 ? Math.min(...rankedSnapshots) : null;

  const snapshotPoints = storico
    .map((item) => item.punti)
    .filter((value) => Number.isFinite(value));
  const bestPoints = snapshotPoints.length > 0 ? Math.max(...snapshotPoints) : null;

  const category = formatCategory(anagrafica?.categoria || latest?.categoria);
  const championshipTeam = text(detail.campionatoAttuale?.squadra);
  const society = text(anagrafica?.societa) || championshipTeam;
  const societySub =
    championshipTeam && society && championshipTeam !== society
      ? `Squadra: ${championshipTeam}`
      : null;
  const championship = text(detail.campionatoAttuale?.nome);
  const championshipSub =
    [detail.campionatoAttuale?.categoria, detail.campionatoAttuale?.regione]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(' · ') || null;

  const age = calculateAge(anagrafica?.dataNascita);
  const ageLabel = age != null ? `${age} anni` : null;
  const ageSub = formatDate(anagrafica?.dataNascita);

  const formWins = form.filter((match) => match.outcome === 'V').length;
  const formLosses = form.length - formWins;
  const formRate = form.length > 0 ? Math.round((formWins / form.length) * 100) : null;
  const formSourceLabel =
    formSource === 'ranking' ? 'ranking' : formSource === 'campionato' ? 'campionato' : null;
  const formSummary =
    form.length > 0
      ? `${formWins}V · ${formLosses}S${formSourceLabel ? ` · ${formSourceLabel}` : ''}`
      : null;

  const seasonPlayed = riepilogo?.partiteGiocate ?? 0;
  const seasonWon = riepilogo?.partiteVinte ?? 0;
  const seasonLost = riepilogo?.partitePerse ?? 0;
  const seasonRate = seasonPlayed > 0 ? Math.round((seasonWon / seasonPlayed) * 100) : null;
  const seasonRecord = seasonPlayed > 0 ? `${seasonWon}V · ${seasonLost}S` : null;
  const seasonSub =
    seasonPlayed > 0
      ? `${seasonRate}% su ${seasonPlayed} ${seasonPlayed === 1 ? 'partita' : 'partite'}`
      : null;

  const championshipPlayed = snapshot.championshipMatches.length;
  const championshipWon = snapshot.championshipMatches.filter((match) => match.isVittoria).length;
  const championshipLost = championshipPlayed - championshipWon;
  const championshipRate =
    championshipPlayed > 0 ? Math.round((championshipWon / championshipPlayed) * 100) : null;
  const championshipRecord =
    championshipPlayed > 0 ? `${championshipWon}V · ${championshipLost}S` : null;
  const championshipRecordSub =
    championshipPlayed > 0
      ? `${championshipRate}% su ${championshipPlayed} ${
          championshipPlayed === 1 ? 'partita' : 'partite'
        }`
      : null;

  const pointsEarned =
    riepilogo?.puntiTotali !== undefined && riepilogo?.puntiTotali !== null
      ? riepilogo.puntiTotali
      : null;
  const finalPoints = riepilogo?.punteggioFinale ?? pointsValue;
  const pointsEarnedLabel =
    pointsEarned != null
      ? pointsEarned > 0
        ? `+${formatCompactNumber(pointsEarned)}`
        : formatCompactNumber(pointsEarned)
      : null;
  const pointsEarnedSub = finalPoints != null ? `finale ${formatNumber(finalPoints)}` : null;

  const lastMatch = form.length > 0 ? form[form.length - 1] : null;
  const lastMatchValue = lastMatch
    ? formatDate(lastMatch.date) || text(lastMatch.event) || 'Ultimo match'
    : null;
  const lastMatchSub = lastMatch
    ? `${lastMatch.outcome === 'V' ? 'Vittoria' : 'Sconfitta'}${
        lastMatch.opponent ? ` vs ${shortenName(lastMatch.opponent)}` : ''
      }`
    : null;

  return {
    name: text(anagrafica?.nome) || fallbackName,
    rank,
    rankLabel,
    rankSub,
    points: pointsValue,
    pointsLabel: pointsValue != null ? formatNumber(pointsValue) : null,
    pointsSub,
    bestRank,
    bestRankLabel: bestRank != null ? `#${formatCompactNumber(bestRank)}` : null,
    bestPoints,
    bestPointsLabel: bestPoints != null ? formatNumber(bestPoints) : null,
    category,
    society,
    societySub,
    championship,
    championshipSub,
    sector: text(anagrafica?.settore),
    region: text(anagrafica?.regione),
    ageLabel,
    ageSub,
    form,
    formSource,
    formWins,
    formLosses,
    formRate,
    formSummary,
    seasonRecord,
    seasonSub,
    seasonRate,
    championshipRecord,
    championshipRecordSub,
    championshipRate,
    pointsEarned,
    pointsEarnedLabel,
    pointsEarnedSub,
    lastMatch,
    lastMatchValue,
    lastMatchSub,
  };
};

const toneHigher = (valueA?: number | null, valueB?: number | null): Tone => {
  if (valueA == null || valueB == null || valueA === valueB) return null;
  return valueA > valueB ? 'a' : 'b';
};

const toneRank = (rankA?: number | null, rankB?: number | null): Tone => {
  if (rankA != null && rankB == null) return 'a';
  if (rankB != null && rankA == null) return 'b';
  if (rankA != null && rankB != null && rankA !== rankB) {
    return rankA < rankB ? 'a' : 'b';
  }
  return null;
};

const compactRows = (rows: Array<ComparisonRow | null>): ComparisonRow[] =>
  rows.filter((row): row is ComparisonRow => Boolean(row && (row.a != null || row.b != null)));

const FormBadges: React.FC<{ form: AthleteFormMatch[]; side: 'a' | 'b' }> = ({ form, side }) => (
  <span
    className={`h2h-cmp-form is-${side}`}
    aria-label={`Forma recente: ${form
      .map((match) => (match.outcome === 'V' ? 'vittoria' : 'sconfitta'))
      .join(', ')}`}
  >
    {form.map((match, index) => (
      <span
        key={`${match.date || 'nd'}-${match.opponent || ''}-${index}`}
        className={`h2h-cmp-form-badge ${
          match.outcome === 'V' ? 'is-win' : 'is-loss'
        }${index === form.length - 1 ? ' is-latest' : ''}`}
        title={`${match.outcome === 'V' ? 'Vittoria' : 'Sconfitta'}${
          match.opponent ? ` vs ${match.opponent}` : ''
        }${match.date ? ` · ${match.date}` : ''}`}
      >
        {match.outcome}
      </span>
    ))}
  </span>
);

const ComparisonRowView: React.FC<{ row: ComparisonRow }> = ({ row }) => {
  const renderValue = (content: React.ReactNode) => {
    if (content == null) {
      return <span className="h2h-cmp-value is-empty">—</span>;
    }
    if (typeof content === 'string' || typeof content === 'number') {
      return <span className="h2h-cmp-value">{content}</span>;
    }
    return content;
  };

  return (
    <div className="h2h-cmp-row">
      <div className={`h2h-cmp-cell is-a${row.tone === 'a' ? ' is-best' : ''}`}>
        {renderValue(row.a)}
        {row.aSub != null && row.aSub !== '' && <span className="h2h-cmp-sub">{row.aSub}</span>}
      </div>
      <div className="h2h-cmp-label">{row.label}</div>
      <div className={`h2h-cmp-cell is-b${row.tone === 'b' ? ' is-best' : ''}`}>
        {renderValue(row.b)}
        {row.bSub != null && row.bSub !== '' && <span className="h2h-cmp-sub">{row.bSub}</span>}
      </div>
    </div>
  );
};

const buildComparisonGroups = (
  athleteA: AthleteMetrics | null,
  athleteB: AthleteMetrics | null,
  h2h?: HeadToHeadData | null
): ComparisonGroup[] => {
  const rankingRows = compactRows([
    {
      key: 'rank',
      label: 'Posizione',
      a: athleteA?.rankLabel ?? null,
      b: athleteB?.rankLabel ?? null,
      aSub: athleteA?.rankSub,
      bSub: athleteB?.rankSub,
      tone: toneRank(athleteA?.rank, athleteB?.rank),
    },
    {
      key: 'points',
      label: 'Punti ranking',
      a: athleteA?.pointsLabel ?? null,
      b: athleteB?.pointsLabel ?? null,
      aSub: athleteA?.pointsSub,
      bSub: athleteB?.pointsSub,
      tone: toneHigher(athleteA?.points, athleteB?.points),
    },
    {
      key: 'best-rank',
      label: 'Miglior rank',
      a: athleteA?.bestRankLabel ?? null,
      b: athleteB?.bestRankLabel ?? null,
      tone: toneRank(athleteA?.bestRank, athleteB?.bestRank),
    },
    {
      key: 'best-points',
      label: 'Picco punti',
      a: athleteA?.bestPointsLabel ?? null,
      b: athleteB?.bestPointsLabel ?? null,
      tone: toneHigher(athleteA?.bestPoints, athleteB?.bestPoints),
    },
    {
      key: 'category',
      label: 'Categoria',
      a: athleteA?.category ?? null,
      b: athleteB?.category ?? null,
    },
  ]);

  const formRows = compactRows([
    {
      key: 'form',
      label: 'Ultime 5',
      a:
        athleteA && athleteA.form.length > 0 ? (
          <FormBadges form={athleteA.form} side="a" />
        ) : null,
      b:
        athleteB && athleteB.form.length > 0 ? (
          <FormBadges form={athleteB.form} side="b" />
        ) : null,
      aSub: athleteA?.formSummary,
      bSub: athleteB?.formSummary,
      tone: toneHigher(athleteA?.formRate, athleteB?.formRate),
    },
    {
      key: 'form-rate',
      label: 'Rendimento forma',
      a: athleteA?.formRate != null ? `${athleteA.formRate}%` : null,
      b: athleteB?.formRate != null ? `${athleteB.formRate}%` : null,
      aSub:
        athleteA && athleteA.form.length > 0
          ? `${athleteA.formWins}V · ${athleteA.formLosses}S`
          : null,
      bSub:
        athleteB && athleteB.form.length > 0
          ? `${athleteB.formWins}V · ${athleteB.formLosses}S`
          : null,
      tone: toneHigher(athleteA?.formRate, athleteB?.formRate),
    },
    {
      key: 'season',
      label: 'Bilancio ranking',
      a: athleteA?.seasonRecord ?? null,
      b: athleteB?.seasonRecord ?? null,
      aSub: athleteA?.seasonSub,
      bSub: athleteB?.seasonSub,
      tone: toneHigher(athleteA?.seasonRate, athleteB?.seasonRate),
    },
    {
      key: 'championship-record',
      label: 'Bilancio campionato',
      a: athleteA?.championshipRecord ?? null,
      b: athleteB?.championshipRecord ?? null,
      aSub: athleteA?.championshipRecordSub,
      bSub: athleteB?.championshipRecordSub,
      tone: toneHigher(athleteA?.championshipRate, athleteB?.championshipRate),
    },
    {
      key: 'season-points',
      label: 'Punti guadagnati',
      a: athleteA?.pointsEarnedLabel ?? null,
      b: athleteB?.pointsEarnedLabel ?? null,
      aSub: athleteA?.pointsEarnedSub,
      bSub: athleteB?.pointsEarnedSub,
      tone: toneHigher(athleteA?.pointsEarned, athleteB?.pointsEarned),
    },
    {
      key: 'last-match',
      label: 'Ultima partita',
      a: athleteA?.lastMatchValue ?? null,
      b: athleteB?.lastMatchValue ?? null,
      aSub: athleteA?.lastMatchSub,
      bSub: athleteB?.lastMatchSub,
    },
  ]);

  const profileRows = compactRows([
    {
      key: 'society',
      label: 'Società',
      a: athleteA?.society ?? null,
      b: athleteB?.society ?? null,
      aSub: athleteA?.societySub,
      bSub: athleteB?.societySub,
    },
    {
      key: 'championship',
      label: 'Campionato',
      a: athleteA?.championship ?? null,
      b: athleteB?.championship ?? null,
      aSub: athleteA?.championshipSub,
      bSub: athleteB?.championshipSub,
    },
    {
      key: 'sector',
      label: 'Settore',
      a: athleteA?.sector ?? null,
      b: athleteB?.sector ?? null,
    },
    {
      key: 'region',
      label: 'Regione',
      a: athleteA?.region ?? null,
      b: athleteB?.region ?? null,
    },
    {
      key: 'age',
      label: 'Età',
      a: athleteA?.ageLabel ?? null,
      b: athleteB?.ageLabel ?? null,
      aSub: athleteA?.ageSub,
      bSub: athleteB?.ageSub,
    },
  ]);

  const encounters = h2h?.incontri || [];
  const winsA =
    h2h?.atleta1.vittorie ??
    encounters.filter((encounter) => encounter.isVittoriaAtleta1).length;
  const winsB =
    h2h?.atleta2.vittorie ??
    encounters.filter((encounter) => !encounter.isVittoriaAtleta1).length;
  const total = h2h?.totaleIncontri ?? winsA + winsB;
  const lastEncounter =
    encounters.length > 0
      ? encounters.reduce(
          (latest, encounter) =>
            parseDateValue(encounter.data) >= parseDateValue(latest.data) ? encounter : latest,
          encounters[0]
        )
      : null;
  const lastEncounterSub = lastEncounter
    ? `${formatDate(lastEncounter.data) || 'Data n.d.'} · ${lastEncounter.punteggio}`
    : null;

  const h2hRows = compactRows([
    total > 0
      ? {
          key: 'h2h-balance',
          label: 'Bilancio H2H',
          a: String(winsA),
          b: String(winsB),
          aSub: `su ${total} ${total === 1 ? 'incontro' : 'incontri'}`,
          bSub: `su ${total} ${total === 1 ? 'incontro' : 'incontri'}`,
          tone: toneHigher(winsA, winsB),
        }
      : null,
    lastEncounter
      ? {
          key: 'h2h-last',
          label: 'Ultimo incontro',
          a: lastEncounter.isVittoriaAtleta1 ? 'Vittoria' : 'Sconfitta',
          b: lastEncounter.isVittoriaAtleta1 ? 'Sconfitta' : 'Vittoria',
          aSub: lastEncounterSub,
          bSub: lastEncounterSub,
          tone: lastEncounter.isVittoriaAtleta1 ? ('a' as Tone) : ('b' as Tone),
        }
      : null,
  ]);

  return [
    { key: 'ranking', label: 'Ranking', icon: 'bi-graph-up-arrow', rows: rankingRows },
    { key: 'form', label: 'Forma e stagione', icon: 'bi-activity', rows: formRows },
    { key: 'profile', label: 'Profilo', icon: 'bi-person-badge', rows: profileRows },
    { key: 'h2h', label: 'Testa a testa', icon: 'bi-arrow-left-right', rows: h2hRows },
  ].filter((group) => group.rows.length > 0);
};

const buildPointsVerdict = (
  athleteA: AthleteMetrics,
  athleteB: AthleteMetrics
): FavoriteVerdict => {
  if (athleteA.points == null || athleteB.points == null) {
    return {
      key: 'points',
      label: 'Punti ranking',
      side: null,
      name: 'Dati non disponibili',
      margin: null,
    };
  }

  if (athleteA.points === athleteB.points) {
    return {
      key: 'points',
      label: 'Punti ranking',
      side: 'even',
      name: 'Parità',
      margin: `${formatNumber(athleteA.points)} pt`,
    };
  }

  const side = athleteA.points > athleteB.points ? 'a' : 'b';
  const leader = side === 'a' ? athleteA : athleteB;
  const margin = Math.abs(athleteA.points - athleteB.points);

  return {
    key: 'points',
    label: 'Punti ranking',
    side,
    name: shortenName(leader.name),
    fullName: leader.name,
    margin: `+${formatCompactNumber(margin)} pt`,
  };
};

const buildFormVerdict = (
  athleteA: AthleteMetrics,
  athleteB: AthleteMetrics
): FavoriteVerdict => {
  if (athleteA.form.length === 0 || athleteB.form.length === 0) {
    return {
      key: 'form',
      label: 'Stato di forma',
      side: null,
      name: 'Dati non disponibili',
      margin: null,
    };
  }

  if (athleteA.formRate === athleteB.formRate) {
    return {
      key: 'form',
      label: 'Stato di forma',
      side: 'even',
      name: 'Parità',
      margin: `${athleteA.formRate ?? 0}% · ${athleteA.formWins}V-${athleteA.formLosses}S`,
    };
  }

  const side = (athleteA.formRate ?? 0) > (athleteB.formRate ?? 0) ? 'a' : 'b';
  const leader = side === 'a' ? athleteA : athleteB;
  const chaser = side === 'a' ? athleteB : athleteA;

  return {
    key: 'form',
    label: 'Stato di forma',
    side,
    name: shortenName(leader.name),
    fullName: leader.name,
    margin: `${leader.formRate}% vs ${chaser.formRate}%`,
  };
};

const buildFavorite = (
  athleteA: AthleteMetrics | null,
  athleteB: AthleteMetrics | null,
  h2h?: HeadToHeadData | null
): FavoriteResult | null => {
  if (!athleteA || !athleteB) return null;

  const metrics: Array<{
    key: string;
    label: string;
    weight: number;
    a: number;
    b: number;
  }> = [];

  if (athleteA.points != null && athleteB.points != null) {
    const pointsA = Math.log1p(Math.max(0, athleteA.points));
    const pointsB = Math.log1p(Math.max(0, athleteB.points));
    const total = pointsA + pointsB;
    if (total > 0) {
      metrics.push({
        key: 'points',
        label: 'punti ranking',
        weight: 0.4,
        a: pointsA / total,
        b: pointsB / total,
      });
    }
  }

  if (athleteA.form.length > 0 && athleteB.form.length > 0) {
    const formA = (athleteA.formWins + 1) / (athleteA.form.length + 2);
    const formB = (athleteB.formWins + 1) / (athleteB.form.length + 2);
    const total = formA + formB;
    if (total > 0) {
      metrics.push({
        key: 'form',
        label: 'forma recente',
        weight: 0.35,
        a: formA / total,
        b: formB / total,
      });
    }
  }

  if (athleteA.rank != null || athleteB.rank != null) {
    const rankA = athleteA.rank != null ? 1 / Math.log2(athleteA.rank + 2) : 0;
    const rankB = athleteB.rank != null ? 1 / Math.log2(athleteB.rank + 2) : 0;
    const total = rankA + rankB;
    if (total > 0) {
      metrics.push({
        key: 'rank',
        label: 'posizione ranking',
        weight: 0.15,
        a: rankA / total,
        b: rankB / total,
      });
    }
  }

  const directWinsA = h2h?.atleta1.vittorie ?? 0;
  const directWinsB = h2h?.atleta2.vittorie ?? 0;
  const directTotal = directWinsA + directWinsB;
  if (directTotal > 0) {
    const h2hA = (directWinsA + 1) / (directTotal + 2);
    const h2hB = (directWinsB + 1) / (directTotal + 2);
    metrics.push({
      key: 'h2h',
      label: 'precedenti diretti',
      weight: 0.1,
      a: h2hA,
      b: h2hB,
    });
  }

  if (metrics.length < 2) return null;

  const totalWeight = metrics.reduce((sum, metric) => sum + metric.weight, 0);
  const weightedDifference =
    metrics.reduce((sum, metric) => sum + metric.weight * (metric.a - metric.b), 0) / totalWeight;
  const exactA = Math.min(0.95, Math.max(0.05, 0.5 + weightedDifference / 2));
  const probA = Math.round(exactA * 100);
  const probB = 100 - probA;
  const leader: 'a' | 'b' = probA >= probB ? 'a' : 'b';
  const leaderProb = Math.max(probA, probB);
  const isEven = leaderProb < 53;
  const label = isEven ? 'Equilibrio' : leaderProb < 60 ? 'Leggero vantaggio' : 'Favorito';
  const leaderName = leader === 'a' ? athleteA.name : athleteB.name;

  const indicatorLabels = metrics.map((metric) => metric.label);
  const note =
    metrics.length === 4
      ? 'Indice calcolato su punti ranking, forma recente, posizione e precedenti diretti.'
      : `Indice basato su ${indicatorLabels.join(', ')}. Gli indicatori non disponibili per entrambi sono esclusi.`;

  return {
    probA,
    probB,
    leader,
    isEven,
    label,
    name: isEven ? 'Nessun favorito netto' : leaderName,
    leaderProb,
    verdicts: [buildPointsVerdict(athleteA, athleteB), buildFormVerdict(athleteA, athleteB)],
    note,
  };
};

const FavoriteCard: React.FC<{
  favorite: FavoriteResult;
  athleteAName: string;
  athleteBName: string;
}> = ({ favorite, athleteAName, athleteBName }) => {
  const favoriteClass = `h2h-cmp-favorite is-lead-${favorite.leader}${
    favorite.isEven ? ' is-even' : ''
  }`;

  return (
    <div className={favoriteClass}>
      <div className="h2h-cmp-favorite-kicker">
        <span>Pronostico</span>
      </div>

      <div className="h2h-cmp-favorite-main">
        <span className="h2h-cmp-favorite-icon" aria-hidden="true">
          <i className={favorite.isEven ? 'bi bi-activity' : 'bi bi-trophy-fill'}></i>
        </span>
        <span className="h2h-cmp-favorite-copy">
          <span className="h2h-cmp-favorite-label">{favorite.label}</span>
          <span className="h2h-cmp-favorite-name" title={favorite.name}>
            {favorite.name}
          </span>
        </span>
        <span
          className="h2h-cmp-favorite-pct"
          title={`${favorite.probA}% ${athleteAName} · ${favorite.probB}% ${athleteBName}`}
        >
          {favorite.leaderProb}
          <small>%</small>
        </span>
      </div>

      <div
        className="h2h-cmp-favorite-bar"
        role="img"
        aria-label={`${athleteAName} ${favorite.probA}%, ${athleteBName} ${favorite.probB}%`}
      >
        <span className="h2h-cmp-favorite-bar-a" style={{ width: `${favorite.probA}%` }}></span>
        <span className="h2h-cmp-favorite-bar-b" style={{ width: `${favorite.probB}%` }}></span>
      </div>

      <div className="h2h-cmp-favorite-legend">
        <span title={athleteAName}>
          <i className="h2h-cmp-legend-dot is-a" aria-hidden="true"></i>
          <span className="h2h-cmp-favorite-legend-name">{shortenName(athleteAName)}</span>
          <b>{favorite.probA}%</b>
        </span>
        <span title={athleteBName}>
          <b>{favorite.probB}%</b>
          <span className="h2h-cmp-favorite-legend-name">{shortenName(athleteBName)}</span>
          <i className="h2h-cmp-legend-dot is-b" aria-hidden="true"></i>
        </span>
      </div>

      <div className="h2h-cmp-verdicts">
        {favorite.verdicts.map((verdict) => (
          <div key={verdict.key} className="h2h-cmp-verdict">
            <span className="h2h-cmp-verdict-label">{verdict.label}</span>
            <strong
              className={`h2h-cmp-verdict-name is-${verdict.side || 'none'}`}
              title={verdict.fullName || verdict.name}
            >
              {verdict.name}
            </strong>
            {verdict.margin && <span className="h2h-cmp-verdict-margin">{verdict.margin}</span>}
          </div>
        ))}
      </div>

      <p className="h2h-cmp-favorite-note">{favorite.note}</p>
    </div>
  );
};

export const HeadToHeadComparisonPanel: React.FC<HeadToHeadComparisonPanelProps> = ({
  atleta1Id,
  atleta1Nome,
  atleta2Id,
  atleta2Nome,
  h2h,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [profiles, setProfiles] = useState<{
    a: AthleteSnapshot | null;
    b: AthleteSnapshot | null;
  }>({ a: null, b: null });
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partialName, setPartialName] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState<number>(0);
  const panelId = useId();

  const pairKey = `${atleta1Id}::${atleta2Id}`;

  useEffect(() => {
    setProfiles({ a: null, b: null });
    setLoadedKey(null);
    setError(null);
    setPartialName(null);
  }, [pairKey]);

  useEffect(() => {
    if (!isOpen || !atleta1Id || !atleta2Id || loadedKey === pairKey) return;

    let active = true;

    const load = async () => {
      const [resultA, resultB] = await Promise.allSettled([
        loadAthleteSnapshot(atleta1Id, atleta1Nome),
        loadAthleteSnapshot(atleta2Id, atleta2Nome),
      ]);

      if (!active) return;

      const profileA = resultA.status === 'fulfilled' ? resultA.value : null;
      const profileB = resultB.status === 'fulfilled' ? resultB.value : null;

      if (!profileA && !profileB) {
        setError('Impossibile recuperare i dati di confronto.');
        return;
      }

      setProfiles({ a: profileA, b: profileB });
      setLoadedKey(pairKey);
      setPartialName(!profileA ? atleta1Nome : !profileB ? atleta2Nome : null);
      setError(null);
    };

    void load();

    return () => {
      active = false;
    };
  }, [isOpen, atleta1Id, atleta1Nome, atleta2Id, atleta2Nome, pairKey, loadedKey, retryNonce]);

  const metricsA = useMemo(
    () => (profiles.a ? buildMetrics(profiles.a, atleta1Nome) : null),
    [profiles.a, atleta1Nome]
  );
  const metricsB = useMemo(
    () => (profiles.b ? buildMetrics(profiles.b, atleta2Nome) : null),
    [profiles.b, atleta2Nome]
  );
  const groups = useMemo(
    () => buildComparisonGroups(metricsA, metricsB, h2h),
    [metricsA, metricsB, h2h]
  );
  const favorite = useMemo(
    () => buildFavorite(metricsA, metricsB, h2h),
    [metricsA, metricsB, h2h]
  );

  const isReady = loadedKey === pairKey;
  const showLoading = isOpen && !isReady && !error;

  const toggleSubtitle = showLoading
    ? 'Recupero ranking, forma e statistiche...'
    : error
      ? 'Dati di confronto non disponibili'
      : favorite
        ? favorite.isEven
          ? `Equilibrio · ${favorite.probA}% - ${favorite.probB}%`
          : `${favorite.label}: ${shortenName(favorite.name)} · ${favorite.leaderProb}%`
        : 'Ranking, forma, punti e pronostico';

  const handleRetry = () => {
    setError(null);
    setPartialName(null);
    setLoadedKey(null);
    setProfiles({ a: null, b: null });
    setRetryNonce((value) => value + 1);
  };

  return (
    <div className={`h2h-cmp-panel${isOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        className="h2h-cmp-toggle"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        title={isOpen ? 'Chiudi il confronto completo' : 'Apri il confronto completo'}
      >
        <span className="h2h-cmp-toggle-icon" aria-hidden="true">
          <i className="bi bi-bar-chart-line-fill"></i>
        </span>
        <span className="h2h-cmp-toggle-copy">
          <span className="h2h-cmp-toggle-title">Confronto completo</span>
          <span className="h2h-cmp-toggle-sub">{toggleSubtitle}</span>
        </span>
        <span className="h2h-cmp-toggle-chevron" aria-hidden="true">
          <i className="bi bi-chevron-down"></i>
        </span>
      </button>

      {isOpen && (
        <div
          id={panelId}
          className="h2h-cmp-body"
          role="region"
          aria-label={`Confronto completo tra ${atleta1Nome} e ${atleta2Nome}`}
        >
          {showLoading && (
            <div className="h2h-cmp-state">
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
              <p>Recupero ranking, forma e statistiche...</p>
            </div>
          )}

          {!showLoading && error && (
            <div className="h2h-cmp-state is-error">
              <span className="h2h-cmp-state-icon" aria-hidden="true">
                <i className="bi bi-exclamation-triangle"></i>
              </span>
              <p>{error}</p>
              <button type="button" className="h2h-cmp-retry" onClick={handleRetry}>
                <i className="bi bi-arrow-clockwise" aria-hidden="true"></i>
                Riprova
              </button>
            </div>
          )}

          {!showLoading && !error && isReady && (
            <>
              {partialName && (
                <div className="h2h-cmp-note is-warning">
                  <i className="bi bi-exclamation-circle" aria-hidden="true"></i>
                  <span>Dati non disponibili per {partialName}. Il confronto mostra solo le informazioni recuperate.</span>
                </div>
              )}

              {favorite && (
                <FavoriteCard
                  favorite={favorite}
                  athleteAName={atleta1Nome}
                  athleteBName={atleta2Nome}
                />
              )}

              <div className="h2h-cmp-table-head">
                <span className="h2h-cmp-table-name is-a" title={atleta1Nome}>
                  {atleta1Nome}
                </span>
                <span className="h2h-cmp-table-vs">vs</span>
                <span className="h2h-cmp-table-name is-b" title={atleta2Nome}>
                  {atleta2Nome}
                </span>
              </div>

              {groups.map((group) => (
                <section className="h2h-cmp-group" key={group.key}>
                  <div className="h2h-cmp-group-title">
                    <i className={`bi ${group.icon}`} aria-hidden="true"></i>
                    <span>{group.label}</span>
                  </div>
                  {group.rows.map((row) => (
                    <ComparisonRowView key={row.key} row={row} />
                  ))}
                </section>
              ))}

              {groups.length === 0 && (
                <div className="h2h-cmp-note">
                  <i className="bi bi-info-circle" aria-hidden="true"></i>
                  <span>Nessun dato di confronto disponibile per questi atleti.</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
