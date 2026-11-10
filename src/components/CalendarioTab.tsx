import React, { useState, useMemo, useEffect, useRef } from 'react';
import { GiornataCalendario, PartitaCalendario, MatchVideoInfo } from '../types/fitet';
import { MarqueeText } from './MarqueeText';
import { RefertoModal } from './RefertoModal';
import { MatchVideoModal } from './MatchVideoModal';
import { TeamLogo } from './TeamLogo';
import { ChampionshipBellButton } from './ChampionshipBellButton';

interface CalendarioTabProps {
  calendario: GiornataCalendario[];
  selectedTeamFilter: string | null;
  statisticheAtleti?: Array<{ atleta: string; atletaId: string | null }>;
  isSubmodalOpen?: boolean;
  onClearTeamFilter: () => void;
  onSelectTeamFilter: (team: string) => void;
  onOpenAtletaModal?: (id: string, name: string) => void;
  onOpenSquadraModal?: (teamName: string) => void;
  currentCamId?: number;
  championshipName?: string;
  /** Indica se la scheda Calendario è quella attualmente visibile. */
  isActive?: boolean;
}

interface BloccoFaseGiornata {
  key: string;
  numero: number;
  fase: 'andata' | 'ritorno';
  partite: PartitaCalendario[];
  targetDate: Date | null;
}

/**
 * Converte la stringa data FITeT (es. "DD/MM/YYYY" o standard ISO) in oggetto Date.
 */
const parseMatchDate = (dateStr?: string | null, oraStr?: string | null): Date | null => {
  if (!dateStr) return null;
  let day = 0, month = -1, year = 0;
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      year = parseInt(parts[2], 10);
    }
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
      day = parseInt(parts[2], 10);
    }
  } else {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  if (!day || isNaN(month) || !year) return null;

  let hours = 0;
  let minutes = 0;
  if (oraStr) {
    const cleanOra = oraStr.replace('.', ':').trim();
    const timeParts = cleanOra.split(':');
    if (timeParts.length >= 2) {
      hours = parseInt(timeParts[0], 10) || 0;
      minutes = parseInt(timeParts[1], 10) || 0;
    }
  }

  return new Date(year, month, day, hours, minutes);
};

const isMatchToday = (dateStr?: string | null): boolean => {
  if (!dateStr) return false;
  const d = parseMatchDate(dateStr);
  if (!d) return false;
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
};

const shouldShowReferto = (match: PartitaCalendario): boolean => {
  if (!match.refertoUrl) return false;
  if (match.disputato) return true;
  const matchDate = parseMatchDate(match.data);
  if (!matchDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  matchDate.setHours(0, 0, 0, 0);

  return today.getTime() >= matchDate.getTime();
};

export const CalendarioTab: React.FC<CalendarioTabProps> = ({
  calendario,
  selectedTeamFilter,
  statisticheAtleti,
  isSubmodalOpen,
  onClearTeamFilter,
  onSelectTeamFilter,
  onOpenAtletaModal,
  onOpenSquadraModal,
  currentCamId,
  championshipName,
  isActive = true,
}) => {
  const [selectedGiornata, setSelectedGiornata] = useState<number | 'all'>('all');
  const [faseFilter, setFaseFilter] = useState<'all' | 'andata' | 'ritorno'>('all');
  const [isScrolledToCurrent, setIsScrolledToCurrent] = useState(false);
  const [selectedReferto, setSelectedReferto] = useState<{
    incontroId: string;
    camId?: string;
    formulaId?: string;
    casa?: string;
    ospite?: string;
  } | null>(null);

  const [selectedVideoData, setSelectedVideoData] = useState<{
    videos: MatchVideoInfo[];
    initialVideoId?: string;
    squadraCasa?: string;
    squadraOspite?: string;
    giornata?: number;
  } | null>(null);

  const [matchVideos, setMatchVideos] = useState<MatchVideoInfo[]>([]);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/videos')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data && Array.isArray(data.videos)) {
          const sanitized: MatchVideoInfo[] = data.videos
            .map((v: any) => ({
              videoId: String(v?.videoId || v?.video_id || '').trim(),
              channelName: v?.channelName || v?.channel_name || 'YouTube',
              channelUrl: v?.channelUrl || v?.channel_url || '',
              title: v?.title || '',
              publishedAt: v?.publishedAt || v?.published_at || '',
              league: v?.league || null,
              matchDay: v?.matchDay ?? v?.match_day ?? null,
              teamHome: v?.teamHome || v?.team_home || null,
              teamAway: v?.teamAway || v?.team_away || null,
              previewUrl: v?.previewUrl || v?.preview_url || null,     
            }))
            .filter((v: MatchVideoInfo) => Boolean(v.videoId) && v.videoId !== 'undefined' && v.videoId !== 'null');
          setMatchVideos(sanitized);
        }
      })
      .catch(() => { });
    return () => {
      isMounted = false;
    };
  }, [currentCamId]);

  const getVideosForMatch = (m: PartitaCalendario): MatchVideoInfo[] => {
    let rawList: any[] = [];
    if (m.videos && m.videos.length > 0) {
      rawList = m.videos;
    } else if (m.video) {
      rawList = [m.video];
    } else if (m.youtubeVideoId && m.youtubeVideoId !== 'undefined' && m.youtubeVideoId !== 'null') {
      rawList = [
        {
          videoId: m.youtubeVideoId,
          channelName: 'YouTube',
          title: `${m.squadraCasa} vs ${m.squadraOspite}`,
        },
      ];
    } else if (matchVideos && matchVideos.length > 0) {
      const norm = (str?: string | null) =>
        (str || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\b(a\.?s\.?d\.?|asd|t\.?t\.?|tt|tennistavolo|polisportiva|pol\.?|u\.?s\.?|us|dilettantistica|1999)\b/gi, ' ')
          .replace(/[^a-z0-9]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const casa = norm(m.squadraCasa);
      const ospite = norm(m.squadraOspite);

      rawList = matchVideos.filter((v: any) => {
        const vDay = v.matchDay ?? v.match_day;
        if (vDay !== undefined && vDay !== null && vDay !== m.giornata) {
          return false;
        }
        const vHome = norm(v.teamHome || v.team_home);
        const vAway = norm(v.teamAway || v.team_away);
        if (vHome && vAway) {
          const matchesDirect =
            (casa.includes(vHome) || vHome.includes(casa)) &&
            (ospite.includes(vAway) || vAway.includes(ospite));
          const matchesInverted =
            (casa.includes(vAway) || vAway.includes(casa)) &&
            (ospite.includes(vHome) || vHome.includes(ospite));
          if (matchesDirect || matchesInverted) return true;
        }
        const titleNorm = norm(v.title);
        const casaTokens = casa.split(' ').filter((t) => t.length >= 4);
        const ospiteTokens = ospite.split(' ').filter((t) => t.length >= 4);
        return (
          casaTokens.some((t) => titleNorm.includes(t)) &&
          ospiteTokens.some((t) => titleNorm.includes(t))
        );
      });
    }

    return rawList
      .map((v: any) => ({
        videoId: String(v?.videoId || v?.video_id || '').trim(),
        channelName: v?.channelName || v?.channel_name || 'YouTube',
        channelUrl: v?.channelUrl || v?.channel_url || '',
        title: v?.title || `${m.squadraCasa} vs ${m.squadraOspite}`,
        publishedAt: v?.publishedAt || v?.published_at || '',
        league: v?.league || null,
        matchDay: v?.matchDay ?? v?.match_day ?? null,
        teamHome: v?.teamHome || v?.team_home || null,
        teamAway: v?.teamAway || v?.team_away || null,
      }))
      .filter((v) => Boolean(v.videoId) && v.videoId !== 'undefined' && v.videoId !== 'null');
  };

  const handleOpenVideo = (m: PartitaCalendario, vids: MatchVideoInfo[]) => {
    if (!vids || vids.length === 0) return;
    setSelectedVideoData({
      videos: vids,
      initialVideoId: vids[0].videoId,
      squadraCasa: m.squadraCasa,
      squadraOspite: m.squadraOspite,
      giornata: m.giornata,
    });
  };

  // Stato per nascondere le giornate precedenti all'ultima giocata (di default true all'atterraggio su mobile)
  const [hidePastGiornate, setHidePastGiornate] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768;
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setHidePastGiornate(true);
    }
  }, [currentCamId]);

  // Stato expansion panel per i blocchi giornata
  const [collapsedGiornate, setCollapsedGiornate] = useState<Set<string>>(new Set());

  const toggleGiornata = (key: string) => {
    setCollapsedGiornate((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Mappa dei ref per ogni blocco giornata
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const hasScrolledRef = useRef(false);

  const handleOpenReferto = (m: PartitaCalendario) => {
    let incontroId = m.incontroId;
    let camId = String(currentCamId);
    let formulaId = m.formula ? String(m.formula) : '19';

    if (m.refertoUrl) {
      const incMatch = m.refertoUrl.match(/INCONTRO=(\d+)/i);
      const camMatch = m.refertoUrl.match(/CAM=(\d+)/i);
      const formMatch = m.refertoUrl.match(/FORMULA=(\d+)/i);

      if (incMatch) incontroId = incMatch[1];
      if (camMatch) camId = camMatch[1];
      if (formMatch) formulaId = formMatch[1];
    }

    if (incontroId) {
      setSelectedReferto({
        incontroId,
        camId,
        formulaId,
        casa: m.squadraCasa,
        ospite: m.squadraOspite,
      });
    }
  };

  const allTeams = useMemo(() => {
    return Array.from(
      new Set(
        calendario.flatMap((g) => [
          ...g.partiteAndata.map((m) => m.squadraCasa),
          ...g.partiteAndata.map((m) => m.squadraOspite),
        ])
      )
    ).sort();
  }, [calendario]);

  // 1. Separa andata e ritorno in blocchi distinti e calcola la data di riferimento
  const blocchiFasi = useMemo<BloccoFaseGiornata[]>(() => {
    const list: BloccoFaseGiornata[] = [];

    calendario.forEach((g) => {
      // Blocco Andata
      if (g.partiteAndata && g.partiteAndata.length > 0) {
        const dates = g.partiteAndata.map((p) => parseMatchDate(p.data, p.ora)).filter(Boolean) as Date[];
        const targetDate = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
        list.push({
          key: `${g.numero}-andata`,
          numero: g.numero,
          fase: 'andata',
          partite: g.partiteAndata,
          targetDate,
        });
      }

      // Blocco Ritorno
      if (g.partiteRitorno && g.partiteRitorno.length > 0) {
        const dates = g.partiteRitorno.map((p) => parseMatchDate(p.data, p.ora)).filter(Boolean) as Date[];
        const targetDate = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
        list.push({
          key: `${g.numero}-ritorno`,
          numero: g.numero,
          fase: 'ritorno',
          partite: g.partiteRitorno,
          targetDate,
        });
      }
    });

    // Ordina tutti i blocchi cronologicamente per data/ora e numero giornata
    return list.sort((a, b) => {
      if (!a.targetDate && !b.targetDate) return a.numero - b.numero;
      if (!a.targetDate) return 1;
      if (!b.targetDate) return -1;
      const diff = a.targetDate.getTime() - b.targetDate.getTime();
      if (diff !== 0) return diff;
      return a.numero - b.numero;
    });
  }, [calendario]);

  // 2. Filtra i blocchi in base alla fase e alla giornata selezionata
  const displayedBlocchi = useMemo(() => {
    return blocchiFasi.filter((blocco) => {
      if (selectedGiornata !== 'all' && blocco.numero !== selectedGiornata) return false;
      if (faseFilter !== 'all' && blocco.fase !== faseFilter) return false;
      return true;
    });
  }, [blocchiFasi, selectedGiornata, faseFilter]);

  // 3. Trova le giornate attuali o prossime (gestisce il caso di 2 giornate nello stesso giorno / concentramento)
  const activeGiornataKeys = useMemo<Set<string>>(() => {
    if (displayedBlocchi.length === 0) return new Set();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    // A. Controlla se oggi è giorno di gare
    const todayBlocchi = displayedBlocchi.filter((b) => {
      if (!b.targetDate) return false;
      const bDay = new Date(b.targetDate);
      bDay.setHours(0, 0, 0, 0);
      return bDay.getTime() === todayTime;
    });

    if (todayBlocchi.length > 0) {
      // Se oggi è giorno di gare: evidenzia quelle non ancora disputate
      const activeToday = todayBlocchi.filter(
        (b) => !(b.partite.length > 0 && b.partite.every((m) => m.disputato))
      );
      if (activeToday.length > 0) {
        return new Set(activeToday.map((b) => b.key));
      }
      return new Set([todayBlocchi[todayBlocchi.length - 1].key]);
    }

    // B. Se oggi non è giorno di gare, trova il primo blocco non ancora interamente disputato
    const firstUndisputedIndex = displayedBlocchi.findIndex(
      (b) => b.partite.length > 0 && !b.partite.every((m) => m.disputato)
    );

    if (firstUndisputedIndex === -1) {
      // Tutte le giornate sono disputate: evidenzia l'ultima giornata
      const last = displayedBlocchi[displayedBlocchi.length - 1];
      return new Set([last.key]);
    }

    const targetBlocco = displayedBlocchi[firstUndisputedIndex];
    const keys = new Set<string>([targetBlocco.key]);

    // Se ci sono altre giornate nello stesso giorno del targetBlocco (es. 2 giornate al giorno / concentramento),
    // evidenziale insieme se non sono ancora disputate
    if (targetBlocco.targetDate) {
      const targetDayTime = new Date(
        targetBlocco.targetDate.getFullYear(),
        targetBlocco.targetDate.getMonth(),
        targetBlocco.targetDate.getDate()
      ).getTime();

      displayedBlocchi.forEach((b, idx) => {
        if (idx !== firstUndisputedIndex && b.targetDate) {
          const bDayTime = new Date(
            b.targetDate.getFullYear(),
            b.targetDate.getMonth(),
            b.targetDate.getDate()
          ).getTime();

          if (bDayTime === targetDayTime) {
            const isDisputato = b.partite.length > 0 && b.partite.every((m) => m.disputato);
            if (!isDisputato) {
              keys.add(b.key);
            }
          }
        }
      });
    }

    return keys;
  }, [displayedBlocchi]);

  // Chiave primaria per scroll e pulsante "vai ad attuale" (primo blocco attivo)
  const primaryActiveKey = useMemo(() => {
    for (const b of displayedBlocchi) {
      if (activeGiornataKeys.has(b.key)) return b.key;
    }
    return displayedBlocchi[0]?.key || null;
  }, [displayedBlocchi, activeGiornataKeys]);

  // Trova l'indice dell'ultima giornata giocata (con almeno una partita disputata)
  const lastPlayedIndex = useMemo(() => {
    for (let i = displayedBlocchi.length - 1; i >= 0; i--) {
      const b = displayedBlocchi[i];
      if (b.partite.length > 0 && b.partite.some((m) => m.disputato)) {
        return i;
      }
    }
    return -1;
  }, [displayedBlocchi]);

  const lastPlayedDayTime = useMemo(() => {
    if (lastPlayedIndex === -1) return null;
    const b = displayedBlocchi[lastPlayedIndex];
    if (!b.targetDate) return null;
    return new Date(
      b.targetDate.getFullYear(),
      b.targetDate.getMonth(),
      b.targetDate.getDate()
    ).getTime();
  }, [displayedBlocchi, lastPlayedIndex]);

  // Calcolo giornate passate (strettamente precedenti all'ultima giornata giocata)
  const pastKeys = useMemo<Set<string>>(() => {
    if (lastPlayedIndex <= 0) return new Set();

    const keys = new Set<string>();
    displayedBlocchi.forEach((b, idx) => {
      if (idx < lastPlayedIndex) {
        // Se appartiene allo stesso giorno dell'ultima giocata (es. concentramento con 2 giornate nello stesso giorno),
        // fa parte dell'ultima tornata giocata quindi NON la nascondiamo!
        if (lastPlayedDayTime && b.targetDate) {
          const bDayTime = new Date(
            b.targetDate.getFullYear(),
            b.targetDate.getMonth(),
            b.targetDate.getDate()
          ).getTime();
          if (bDayTime === lastPlayedDayTime) {
            return;
          }
        }
        keys.add(b.key);
      }
    });

    return keys;
  }, [displayedBlocchi, lastPlayedIndex, lastPlayedDayTime]);

  const pastCount = pastKeys.size;

  // Lista visibile in base al filtro "nascondi precedenti"
  const visibleBlocchi = useMemo(() => {
    if (!hidePastGiornate || pastKeys.size === 0 || selectedGiornata !== 'all') {
      return displayedBlocchi;
    }
    return displayedBlocchi.filter((b) => !pastKeys.has(b.key));
  }, [displayedBlocchi, hidePastGiornate, pastKeys, selectedGiornata]);

  // 4. Scroll automatico alla giornata attuale/prossima al mount
  useEffect(() => {
    if (!hasScrolledRef.current && primaryActiveKey && sectionRefs.current[primaryActiveKey]) {
      const timer = setTimeout(() => {
        const element = sectionRefs.current[primaryActiveKey];
        if (element) {
          const navHeight = 90; // altezza navbar in px
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - navHeight;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });

          hasScrolledRef.current = true;
        }
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [primaryActiveKey]);

  const goToCurrent = () => {
    if (primaryActiveKey && sectionRefs.current[primaryActiveKey]) {
      const element = sectionRefs.current[primaryActiveKey];
      if (element) {
        const offset = 120; // altezza navbar in px
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    }
    setIsScrolledToCurrent(true);
  };
  const allBlocchiKeys = useMemo(() => displayedBlocchi.map((b) => b.key), [displayedBlocchi]);

  const toggleAllGiornate = () => {
    if (collapsedGiornate.size > 0) {
      setCollapsedGiornate(new Set());
    } else {
      setCollapsedGiornate(new Set(allBlocchiKeys));
    }
  };

  useEffect(() => {
    if (selectedTeamFilter || selectedGiornata !== 'all') {
      setCollapsedGiornate(new Set());
    }
  }, [selectedTeamFilter, selectedGiornata]);

  let totalDisplayedMatches = 0;

  return (
    <div>
      {/* Controls Bar */}
      <div className="controls">
        <div className="controls-left calendario">
          <div className="filter-btn-group">
            <button
              className={`filter-btn ${faseFilter === 'all' ? 'active' : ''}`}
              onClick={() => setFaseFilter('all')}
            >
              Tutte le fasi
            </button>
            <button
              className={`filter-btn ${faseFilter === 'andata' ? 'active' : ''}`}
              onClick={() => setFaseFilter('andata')}
            >
              Andata
            </button>
            <button
              className={`filter-btn ${faseFilter === 'ritorno' ? 'active' : ''}`}
              onClick={() => setFaseFilter('ritorno')}
            >
              Ritorno
            </button>
          </div>

          <div className="calendario-selects-row">
            <select
              value={selectedGiornata}
              onChange={(e) =>
                setSelectedGiornata(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))
              }
            >
              <option value="all">Tutte le giornate</option>
              {calendario.map((g) => (
                <option key={g.numero} value={g.numero}>
                  {g.numero}^ Giornata
                </option>
              ))}
            </select>

            <div className="select-clearable-wrapper">
              <select
                value={selectedTeamFilter || ''}
                onChange={(e) => onSelectTeamFilter(e.target.value)}
                className={selectedTeamFilter ? 'has-clear' : ''}
              >
                <option value="">Tutte le squadre</option>
                {allTeams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {selectedTeamFilter && (
                <button
                  type="button"
                  className="select-clear-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearTeamFilter();
                  }}
                  title={`Rimuovi filtro: ${selectedTeamFilter}`}
                  aria-label={`Rimuovi filtro: ${selectedTeamFilter}`}
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              )}
            </div>
          </div>

          <div className="filter-btn-group">
            {primaryActiveKey && (
              <button
                type="button"
                className="filter-btn filter-btn--go-current"
                onClick={goToCurrent}
                title="Scorri alla giornata attuale o prossima"
              >
                <i className="bi bi-geo-alt-fill text-primary"></i>
                <span>Attuale</span>
              </button>
            )}

            {pastCount > 0 && selectedGiornata === 'all' && (
              <button
                type="button"
                className={`filter-btn filter-btn--hide-past ${hidePastGiornate ? 'active' : ''}`}
                onClick={() => setHidePastGiornate((prev) => !prev)}
                title={
                  hidePastGiornate
                    ? 'Mostra tutte le giornate precedenti'
                    : "Nascondi le giornate precedenti all'ultima giocata"
                }
              >
                <span>{hidePastGiornate ? 'Mostra passate' : 'Nascondi passate'}</span>
                <span className="badge-filter-count">{pastCount}</span>
              </button>
            )}

            <button
              type="button"
              className="filter-btn filter-btn--expand-toggle"
              onClick={toggleAllGiornate}
              title={collapsedGiornate.size === 0 ? 'Comprimi tutte le giornate' : 'Espandi tutte le giornate'}
            >
              <i className={`bi bi-${collapsedGiornate.size === 0 ? 'arrows-collapse' : 'arrows-expand'}`}></i>
              <span className="d-none d-sm-inline">{collapsedGiornate.size === 0 ? 'Comprimi tutti' : 'Espandi tutti'}</span>
              <span className="d-inline d-sm-none">{collapsedGiornate.size === 0 ? 'Comprimi' : 'Espandi'}</span>
            </button>
          </div>
        </div>

        {isActive && (
          <ChampionshipBellButton camId={currentCamId} championshipName={championshipName} />
        )}
      </div>
      {/* <div className='p-1 m-1 mt-3 text-left scrolldown'>
        {!isScrolledToCurrent && <button onClick={() => goToCurrent()} className='btn btn-primary rounded-pill'>↓</button>}
      </div> */}
      {/* Calendario Match Cards Container */}
      <div className="calendario-cards-container">
        {hidePastGiornate && pastCount > 0 && selectedGiornata === 'all' && (
          <div className="calendario-past-notice">
            <span>
              <i className="bi bi-clock-history me-1"></i>
              {pastCount} {pastCount === 1 ? "giornata precedente all'ultima giocata nascosta" : "giornate precedenti all'ultima giocata nascoste"}
            </span>
            <button
              type="button"
              className="btn-show-past-toggle"
              onClick={() => setHidePastGiornate(false)}
            >
              <span>Mostra tutte</span>
              <i className="bi bi-arrow-counterclockwise ms-1"></i>
            </button>
          </div>
        )}

        {visibleBlocchi.map((blocco) => {
          const filteredMatches = blocco.partite.filter((m) => {
            if (!selectedTeamFilter) return true;
            const filterNorm = selectedTeamFilter.toUpperCase();
            return (
              m.squadraCasa.toUpperCase().includes(filterNorm) ||
              m.squadraOspite.toUpperCase().includes(filterNorm)
            );
          });

          if (filteredMatches.length === 0) return null;
          totalDisplayedMatches += filteredMatches.length;

          const isClosest = activeGiornataKeys.has(blocco.key);
          const isExpanded = !collapsedGiornate.has(blocco.key);
          const isBloccoToday = Boolean(blocco.targetDate && isMatchToday(blocco.targetDate.toISOString()));

          const bloccoVideosMap = new Map<string, { video: MatchVideoInfo; match: PartitaCalendario }>();
          filteredMatches.forEach((m) => {
            getVideosForMatch(m).forEach((v) => {
              if (!bloccoVideosMap.has(v.videoId)) {
                bloccoVideosMap.set(v.videoId, { video: v, match: m });
              }
            });
          });
          const bloccoVideosEntries = Array.from(bloccoVideosMap.values());
          const firstBloccoVideo = bloccoVideosEntries[0];

          return (
            <section
              key={blocco.key}
              ref={(el) => (sectionRefs.current[blocco.key] = el)}
              className={`giornata-section ${isClosest ? 'giornata-prossima' : ''}`}
            >
              {/* Header Giornata con expansion panel trigger minimal */}
              <div
                className="giornata-header-banner"
                onClick={() => toggleGiornata(blocco.key)}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleGiornata(blocco.key);
                  }
                }}
              >
                <div className="giornata-title-group">
                  {firstBloccoVideo && (
                    <button
                      type="button"
                      className="giornata-video-preview"
                      title={firstBloccoVideo.video.title || 'Video giornata'}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedVideoData({
                          videos: bloccoVideosEntries.map((item) => item.video),
                          initialVideoId: firstBloccoVideo.video.videoId,
                          squadraCasa: bloccoVideosEntries.length === 1 ? firstBloccoVideo.match.squadraCasa : undefined,
                          squadraOspite: bloccoVideosEntries.length === 1 ? firstBloccoVideo.match.squadraOspite : undefined,
                          giornata: blocco.numero,
                        });
                      }}
                    >
                      <img
                        src={`https://i.ytimg.com/vi/${firstBloccoVideo.video.videoId}/mqdefault.jpg`}
                        alt=""
                        className="giornata-video-preview-img"
                        loading="lazy"
                      />
                      <span className="giornata-video-preview-play">
                        <i className="bi bi-play-fill"></i>
                      </span>
                    </button>
                  )}
                  <span className={`giornata-badge-pill ${isClosest ? 'actual-giornata-badge-pill' : ''}`}>
                    {blocco.numero}ª GIORNATA
                  </span>
                  {isClosest && (
                    <span className="actual-giornata-indicator">
                      {isBloccoToday ? (
                        <span className="badge-in-corso-live">
                          <span className="live-dot"></span> In corso
                        </span>
                      ) : (
                        <span className="badge-prossima-pill">
                          Prossima
                        </span>
                      )}
                    </span>
                  )}
                  {blocco.targetDate && (
                    <span className="giornata-date-badge">
                      <i className="bi bi-calendar3"></i>
                      <span>
                        {blocco.targetDate.toLocaleDateString('it-IT', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}
                      </span>
                    </span>
                  )}
                </div>
                <span className="miei-torneo-expand-hint">
                  <span>{isExpanded ? 'Nascondi incontri' : `Mostra incontri (${filteredMatches.length})`}</span>
                  <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`}></i>
                </span>
              </div>

              {/* Grid Partite dentro expansion panel */}
              {isExpanded && (
                <div className="match-cards-grid match-cards-grid--animated">
                  {filteredMatches.map((m) => {
                    const isCasaWinner = m.vincitore === 'casa';
                    const isOspiteWinner = m.vincitore === 'ospite';
                    const isDraw = m.vincitore === 'pareggio';
                    const hasReferto = Boolean(m.refertoUrl && shouldShowReferto(m));
                    const matchVideosList = getVideosForMatch(m);
                    const hasVideo = matchVideosList.length > 0;

                    return (
                      <article
                        key={m.id}
                        className={`match-card ${hasReferto ? 'has-referto' : ''}`}
                        onClick={() => {
                          if (hasReferto) handleOpenReferto(m);
                        }}
                      >
                        <div className="match-card-top">
                          <div className="match-card-meta">
                            <span className="match-meta-datetime">
                              {m.data} {m.ora ? `ore ${m.ora}` : ''}
                            </span>
                            <span className="match-meta-dot">•</span>
                            <span className="match-meta-phase">
                              {blocco.fase === 'andata' ? 'Andata' : 'Ritorno'}
                            </span>
                          </div>

                          <div className="match-card-status flex items-center gap-1.5">
                            {hasVideo && (
                              <button
                                type="button"
                                className="match-video-badge me-2"
                                title="Guarda il video dell'incontro su YouTube"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleOpenVideo(m, matchVideosList);
                                }}
                              >
                                <i className="bi bi-play-fill"></i>
                              </button>
                            )}
                            {m.disputato ? (
                              <span className="match-status-label status-disputato">Finale</span>
                            ) : isMatchToday(m.data) ? (
                              <span className="match-status-label status-in-corso">In corso</span>
                            ) : (
                              <span className="match-status-label status-programmato">In programma</span>
                            )}
                          </div>
                        </div>

                        <div className="match-card-teams">
                          {/* Casa */}
                          <div
                            className={`match-card-team-row ${isCasaWinner ? 'is-winner' : m.disputato && !isDraw ? 'is-loser' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenSquadraModal) onOpenSquadraModal(m.squadraCasa);
                              else onSelectTeamFilter(m.squadraCasa);
                            }}
                            title={onOpenSquadraModal ? `Scheda ${m.squadraCasa}` : `Filtra ${m.squadraCasa}`}
                          >
                            <div className="match-card-team-left">
                              <TeamLogo teamName={m.squadraCasa} className="team-society-logo" />
                              <div className="match-card-name-wrapper">
                                <MarqueeText
                                  text={m.squadraCasa}
                                  className={`team-name-text ${isCasaWinner ? 'name-winner' : m.disputato && !isDraw ? 'name-loser' : 'name-neutral'}`}
                                />
                              </div>
                            </div>
                            <div
                              className={`match-card-score-digit ${isCasaWinner
                                ? 'score-winner'
                                : m.disputato && !isDraw
                                  ? 'score-loser'
                                  : 'score-pending'
                                }`}
                            >
                              {m.disputato ? (m.puntiCasa !== null ? m.puntiCasa : '-') : '-'}
                            </div>
                          </div>

                          {/* Ospite */}
                          <div
                            className={`match-card-team-row ${isOspiteWinner ? 'is-winner' : m.disputato && !isDraw ? 'is-loser' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenSquadraModal) onOpenSquadraModal(m.squadraOspite);
                              else onSelectTeamFilter(m.squadraOspite);
                            }}
                            title={onOpenSquadraModal ? `Scheda ${m.squadraOspite}` : `Filtra ${m.squadraOspite}`}
                          >
                            <div className="match-card-team-left">
                              <TeamLogo teamName={m.squadraOspite} className="team-society-logo" />
                              <div className="match-card-name-wrapper">
                                <MarqueeText
                                  text={m.squadraOspite}
                                  className={`team-name-text ${isOspiteWinner ? 'name-winner' : m.disputato && !isDraw ? 'name-loser' : 'name-neutral'}`}
                                />
                              </div>
                            </div>
                            <div
                              className={`match-card-score-digit ${isOspiteWinner
                                ? 'score-winner'
                                : m.disputato && !isDraw
                                  ? 'score-loser'
                                  : 'score-pending'
                                }`}
                            >
                              {m.disputato ? (m.puntiOspite !== null ? m.puntiOspite : '-') : '-'}
                            </div>
                          </div>
                        </div>

                        {(hasReferto || isDraw || hasVideo) && (
                          <div className="match-card-bottom">
                            <div className="match-card-bottom-left flex items-center gap-2">
                              {isDraw && <span className="match-card-draw-label">Pareggio</span>}
                              {hasVideo && (
                                <button
                                  type="button"
                                  className="btn-video-link"
                                  title={matchVideosList[0].title || 'Guarda video'}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleOpenVideo(m, matchVideosList);
                                  }}
                                >
                                  <span className="btn-video-thumb-wrap">
                                    <img
                                      src={`https://i.ytimg.com/vi/${matchVideosList[0].videoId}/mqdefault.jpg`}
                                      alt=""
                                      className="btn-video-thumb-img"
                                      loading="lazy"
                                    />
                                    <span className="btn-video-thumb-play">
                                      <i className="bi bi-play-fill"></i>
                                    </span>
                                  </span>
                                  <span>Video</span>
                                </button>
                              )}
                            </div>
                            {hasReferto && (
                              <button
                                type="button"
                                className="btn-referto-link"
                                title="Visualizza referto di gara e risultati completi"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenReferto(m);
                                }}
                              >
                                <span>Referto</span>
                                <i className="bi bi-chevron-right ms-1"></i>
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        {totalDisplayedMatches === 0 && (
          <div className="no-matches-found">
            <div className="empty-state-icon mb-2">
              <i className="bi bi-calendar-x" style={{ fontSize: '36px', color: 'var(--text-muted)' }}></i>
            </div>
            <p style={{ margin: '4px 0', fontWeight: 600 }}>Nessun incontro trovato con i filtri selezionati.</p>
            {selectedTeamFilter && (
              <button className="btn-action" onClick={onClearTeamFilter} style={{ marginTop: '8px' }}>
                Rimuovi filtro ({selectedTeamFilter}) <i className="bi bi-x-lg ms-1"></i>
              </button>
            )}
          </div>
        )}
      </div>

      {selectedReferto && (
        <RefertoModal
          incontroId={selectedReferto.incontroId}
          camId={selectedReferto.camId}
          formulaId={selectedReferto.formulaId}
          squadraCasaNome={selectedReferto.casa}
          squadraOspiteNome={selectedReferto.ospite}
          statisticheAtleti={statisticheAtleti}
          isSubmodalOpen={isSubmodalOpen}
          onClose={() => setSelectedReferto(null)}
          onOpenAtletaModal={onOpenAtletaModal}
        />
      )}

      {selectedVideoData && (
        <MatchVideoModal
          isOpen={Boolean(selectedVideoData)}
          onClose={() => setSelectedVideoData(null)}
          videos={selectedVideoData.videos}
          initialVideoId={selectedVideoData.initialVideoId}
          squadraCasa={selectedVideoData.squadraCasa}
          squadraOspite={selectedVideoData.squadraOspite}
          giornata={selectedVideoData.giornata}
        />
      )}
    </div>
  );
};