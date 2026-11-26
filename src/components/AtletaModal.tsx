import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DettaglioAtleta, PartitaCampionatoAtleta } from '../types/fitet';
import { fetchAtleta, fetchAtletaCampionatoPartite, fetchHeadToHead, type SocietaLookupContext } from '../services/api';
import { RatingChart } from './RatingChart';
import { HeadToHeadModal } from './HeadToHeadModal';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { MarqueeText } from './MarqueeText';
import { recordAndGetAthleteViews } from '../utils/athleteViews';
import { useFavoriteAthletes, saveFavoriteAthlete } from '../utils/favorites';
import { addRecentAthlete, isValidAthleteHistoryName } from '../utils/history';
import { TeamLogo } from './TeamLogo';
import { AthleteAvatar } from './AthleteAvatar';
import { MatchDetailModal, type MatchDetailItem } from './MatchDetailModal';
import { aggregateAthleteMatchStats } from '../utils/aggregateAthleteStats';
import { AthleteStoryModal } from './AthleteStoryModal';
import { AthleteNotFoundState } from './AthleteNotFoundState';
import { useModalTransition } from '../utils/useModalTransition';
import {
  isPhotoLoaded,
  isPhotoError,
  markPhotoLoaded,
  markPhotoError,
  preloadPhoto,
} from '../utils/photoCache';

if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
  ['/light-big-placeholder.png', '/dark-big-placeholder.png'].forEach((src) => {
    const preloaded = new Image();
    preloaded.src = src;
  });
}

interface AtletaModalProps {
  atletaId: string;
  athleteName?: string;
  returnLabel?: string;
  camId?: string | null;
  campionatoNome?: string | null;
  initialMode?: 'full' | 'preview';
  zIndex?: number;
  onClose: () => void;
  onSelectAthlete?: (id: string, name: string) => void;
  onPreviewAthlete?: (id: string, name: string) => void;
  onPromoteToFull?: (resolvedId: string, resolvedName: string) => void;
  onResolveAthlete?: (resolvedId: string, resolvedName: string) => void;
  onOpenSociety?: (societyName: string, context?: SocietaLookupContext) => void;
  onNavigateToGiornata?: (camId?: number, giornata?: number) => void;
  isTopModal?: boolean;
}

const normDate = (d?: string): string => {
  if (!d) return '';
  const parts = d.trim().split(/[\/\-\.]/);
  if (parts.length === 3) {
    let [day, month, year] = parts;
    day = String(parseInt(day, 10));
    month = String(parseInt(month, 10));
    if (year.length === 2) year = `20${year}`;
    return `${day}/${month}/${year}`;
  }
  return d.trim();
};

const isRealDate = (d?: string | null): boolean => {
  if (!d) return false;
  const str = d.trim();
  if (/^G\.?\s*\d+$/i.test(str)) return false;
  return /\d{1,2}[\/\-\.]\d{1,2}/.test(str) || /\d{4}/.test(str);
};

export const AtletaModal: React.FC<AtletaModalProps> = ({
  atletaId,
  athleteName,
  camId,
  campionatoNome,
  initialMode = 'full',
  zIndex,
  onClose,
  onSelectAthlete,
  onPreviewAthlete,
  onPromoteToFull,
  onResolveAthlete,
  onOpenSociety,
  onNavigateToGiornata,
  isTopModal = true,
}) => {
  useBodyScrollLock(true);
  const { isClosing, requestClose } = useModalTransition(onClose);
  const { isFavorite, toggleFavorite } = useFavoriteAthletes();

  const [isPreview, setIsPreview] = useState<boolean>(initialMode === 'preview');
  const [hasExpandedInPlace, setHasExpandedInPlace] = useState<boolean>(false);
  const isPreviewRef = useRef<boolean>(initialMode === 'preview');
  isPreviewRef.current = isPreview;
  const expandSourceRectRef = useRef<{ top: number; height: number } | null>(null);

  const [atleta, setAtleta] = useState<DettaglioAtleta | null>(null);
  const currentAtletaRef = useRef<DettaglioAtleta | null>(null);
  currentAtletaRef.current = atleta;

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [isPhotoZoomOpen, setIsPhotoZoomOpen] = useState<boolean>(false);
  const [viewsCount, setViewsCount] = useState<number>(0);
  const lastTrackedKeyRef = useRef<string | null>(null);
  const photoImgRef = useRef<HTMLImageElement>(null);

  const effectiveId = atleta?.id || (/^\d+$/.test(atletaId) ? atletaId : null);
  const athletePhoto =
    atleta?.anagrafica?.fotoUrl ||
    (effectiveId ? `https://portale.fitet.org/images/atleti/${effectiveId}.jpg` : null);

  const [imgLoaded, setImgLoaded] = useState<boolean>(() => isPhotoLoaded(athletePhoto));
  const [imgError, setImgError] = useState<boolean>(() => isPhotoError(athletePhoto));

  useEffect(() => {
    if (!athletePhoto) {
      setImgLoaded(false);
      setImgError(false);
      return;
    }
    if (isPhotoLoaded(athletePhoto)) {
      setImgLoaded(true);
      setImgError(false);
      return;
    }
    if (isPhotoError(athletePhoto)) {
      setImgLoaded(false);
      setImgError(true);
      return;
    }
    setImgLoaded(false);
    setImgError(false);
    preloadPhoto(athletePhoto).then((ok) => {
      if (ok) {
        setImgLoaded(true);
        setImgError(false);
      } else {
        setImgLoaded(false);
        setImgError(true);
      }
    });
  }, [athletePhoto]);

  useLayoutEffect(() => {
    const img = photoImgRef.current;
    if (img && img.complete && athletePhoto) {
      if (img.naturalWidth > 0) {
        markPhotoLoaded(athletePhoto);
        setImgLoaded(true);
      } else {
        markPhotoError(athletePhoto);
        setImgError(true);
      }
    }
  }, [athletePhoto]);

  // Share state
  const [isShareMenuOpen, setIsShareMenuOpen] = useState<boolean>(false);
  const [isStoryModalOpen, setIsStoryModalOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const shareMenuRef = useRef<HTMLDivElement>(null);

  // Format category badge: e.g. "6" or "6ª Categoria" -> "6^"
  const formatCategoryPill = (cat?: string) => {
    if (!cat) return null;
    const trimmed = cat.trim();
    const match = trimmed.match(/^(\d+)/);
    if (match) return `${match[1]}^`;
    return trimmed;
  };

  // Scroll reveal state for header (shows photo & name when hero is scrolled past)
  const [isScrolledPastHero, setIsScrolledPastHero] = useState<boolean>(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const profileBarRef = useRef<HTMLDivElement>(null);

  const handleCardScroll = useCallback(() => {
    if (cardRef.current) {
      setIsScrolledPastHero(cardRef.current.scrollTop > 20);
    }
  }, []);

  useEffect(() => {
    setIsScrolledPastHero(false);
    if (cardRef.current) {
      cardRef.current.scrollTop = 0;
    }
  }, [atletaId]);

  useLayoutEffect(() => {
    if (isPreview || !expandSourceRectRef.current || !cardRef.current) {
      return;
    }
    const card = cardRef.current;
    const sourceRect = expandSourceRectRef.current;
    expandSourceRectRef.current = null;
    const targetRect = card.getBoundingClientRect();
    const dy = sourceRect.top - targetRect.top;

    if (Math.abs(targetRect.height - sourceRect.height) <= 4 && Math.abs(dy) <= 2) {
      return;
    }

    card.style.height = `${sourceRect.height}px`;
    card.style.transform = `translate3d(0, ${dy}px, 0)`;
    card.style.overflow = 'hidden';
    card.getBoundingClientRect();

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      card.style.height = '';
      card.style.transform = '';
      card.style.transition = '';
      card.style.overflow = '';
    };

    const handleTransitionEnd = (e: TransitionEvent) => {
      if (e.target === card && (e.propertyName === 'height' || e.propertyName === 'transform')) {
        cleanup();
      }
    };

    card.addEventListener('transitionend', handleTransitionEnd);
    const rafId = window.requestAnimationFrame(() => {
      card.style.transition =
        'height 0.34s cubic-bezier(0.22, 1, 0.36, 1), transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)';
      card.style.height = `${targetRect.height}px`;
      card.style.transform = 'translate3d(0, 0, 0)';
    });
    const fallbackTimer = window.setTimeout(cleanup, 380);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(fallbackTimer);
      card.removeEventListener('transitionend', handleTransitionEnd);
      cleanup();
    };
  }, [isPreview]);

  const handleExpandToFull = () => {
    if (!isPreview) return;
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      expandSourceRectRef.current = { top: rect.top, height: rect.height };
    }
    setHasExpandedInPlace(true);
    setIsPreview(false);

    const resolvedId = atleta?.id || atletaId;
    const resolvedName = atleta?.anagrafica?.nome || athleteName || resolvedId;
    if (atleta && isValidAthleteHistoryName(atleta.anagrafica?.nome, atleta.id)) {
      const storico = atleta.storicoClassifica || [];
      const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;
      addRecentAthlete({
        id: atleta.id,
        name: atleta.anagrafica.nome,
        squadra: atleta.anagrafica.societa || undefined,
        ranking: ultimoSnapshot?.posizione ?? undefined,
        punti: atleta.anagrafica.punti ?? ultimoSnapshot?.punti ?? undefined,
        categoria: atleta.anagrafica.categoria ?? ultimoSnapshot?.categoria ?? undefined,
      });
    }
    onPromoteToFull?.(resolvedId, resolvedName);
  };

  const currentAtletaId = atleta?.id || atletaId;
  const currentAthleteName = atleta?.anagrafica?.nome || athleteName || 'Atleta';
  const isFav = isFavorite(currentAtletaId) || isFavorite(currentAthleteName);

  const handleToggleFavorite = () => {
    const storico = atleta?.storicoClassifica || [];
    const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;

    toggleFavorite({
      id: currentAtletaId,
      name: currentAthleteName,
      squadra: atleta?.anagrafica?.societa || squadraCampionato || undefined,
      ranking: ultimoSnapshot?.posizione ?? undefined,
      punti: atleta?.anagrafica?.punti ?? ultimoSnapshot?.punti ?? undefined,
      categoria: atleta?.anagrafica?.categoria ?? ultimoSnapshot?.categoria ?? undefined,
      dataNascita: atleta?.anagrafica?.dataNascita ?? undefined,
      fotoUrl: atleta?.anagrafica?.fotoUrl ?? undefined,
    });
  };

  useEffect(() => {
    if (!atleta || notFound || !isValidAthleteHistoryName(atleta.anagrafica?.nome, atleta.id)) {
      return;
    }
    const key = (atleta.id || atletaId || '').toLowerCase().trim();
    if (!key) return;

    if (lastTrackedKeyRef.current === key) return;
    lastTrackedKeyRef.current = key;

    const v = recordAndGetAthleteViews(key, (serverViews) => {
      setViewsCount(serverViews);
    });
    setViewsCount(v);
  }, [atleta, notFound, atletaId]);

  // Partite nel campionato attualmente aperto
  const [campionatoPartite, setCampionatoPartite] = useState<PartitaCampionatoAtleta[] | null>(null);
  const [squadraCampionato, setSquadraCampionato] = useState<string | null>(null);
  const [loadingPartite, setLoadingPartite] = useState<boolean>(false);

  // Tab per la selezione del tipo di partite: girone corrente vs tutte le partite ufficiali ranking FITeT
  const [matchTab, setMatchTab] = useState<'girone' | 'ranking'>('girone');
  const [rankingFilter, setRankingFilter] = useState<'tutti' | 'campionato' | 'tornei'>('tutti');
  const [viewMode, setViewMode] = useState<'slider' | 'list'>('slider');
  const [analyticsTab, setAnalyticsTab] = useState<'chart' | 'table'>('chart');
  const [h2hOpponent, setH2hOpponent] = useState<{ id?: string; name: string } | null>(null);
  const [h2hOpponentIds, setH2hOpponentIds] = useState<Record<string, string>>({});
  const [selectedMatchDetail, setSelectedMatchDetail] = useState<MatchDetailItem | null>(null);
  const [h2hScores, setH2hScores] = useState<Record<string, { punteggio: string; data?: string }>>({});
  const [loadingH2h, setLoadingH2h] = useState<Record<string, boolean>>({});

  // Slider navigation & desktop drag-to-scroll with smooth momentum + snap
  const sliderRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(true);
  const [isDraggingSlider, setIsDraggingSlider] = useState<boolean>(false);
  const [isSettlingSlider, setIsSettlingSlider] = useState<boolean>(false);
  const sliderSettleTimerRef = useRef<number | null>(null);
  const backdropMouseDownTargetRef = useRef<EventTarget | null>(null);
  const suppressBackdropClickUntilRef = useRef<number>(0);
  const sliderDragRef = useRef({
    isDown: false,
    startX: 0,
    scrollLeft: 0,
    moved: false,
    lastX: 0,
    lastTime: 0,
    velocity: 0,
  });

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      const state = sliderDragRef.current;
      const el = sliderRef.current;
      if (!state.isDown || !el) return;

      const now = performance.now();
      const dxTotal = e.pageX - state.startX;
      if (Math.abs(dxTotal) > 5) {
        state.moved = true;
      }

      const dt = now - state.lastTime;
      if (dt > 0) {
        const instantVel = (e.pageX - state.lastX) / dt;
        state.velocity = state.velocity * 0.65 + instantVel * 0.35;
      }
      state.lastX = e.pageX;
      state.lastTime = now;

      el.scrollLeft = state.scrollLeft - dxTotal;
    };

    const handleWindowMouseUp = () => {
      const state = sliderDragRef.current;
      const el = sliderRef.current;
      if (!state.isDown) return;
      state.isDown = false;
      setIsDraggingSlider(false);
      suppressBackdropClickUntilRef.current = Date.now() + 200;

      if (!el || !state.moved) return;

      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
      const projectedLeft = Math.max(0, Math.min(maxScroll, el.scrollLeft - state.velocity * 180));

      // Find nearest card offsetLeft for a fluid smooth snap
      const cards = Array.from(el.children) as HTMLElement[];
      let targetLeft = projectedLeft;
      let minDist = Infinity;
      for (const card of cards) {
        const cardLeft = Math.min(maxScroll, card.offsetLeft);
        const dist = Math.abs(cardLeft - projectedLeft);
        if (dist < minDist) {
          minDist = dist;
          targetLeft = cardLeft - 25;
        }
      }

      setIsSettlingSlider(true);
      el.scrollTo({ left: targetLeft, behavior: 'smooth' });
      if (sliderSettleTimerRef.current !== null) {
        window.clearTimeout(sliderSettleTimerRef.current);
      }
      sliderSettleTimerRef.current = window.setTimeout(() => {
        setIsSettlingSlider(false);
        sliderSettleTimerRef.current = null;
      }, 380);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      if (sliderSettleTimerRef.current !== null) {
        window.clearTimeout(sliderSettleTimerRef.current);
      }
    };
  }, []);

  const handleSliderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !sliderRef.current) return;
    if (sliderSettleTimerRef.current !== null) {
      window.clearTimeout(sliderSettleTimerRef.current);
      sliderSettleTimerRef.current = null;
    }
    setIsSettlingSlider(false);
    sliderDragRef.current = {
      isDown: true,
      startX: e.pageX,
      scrollLeft: sliderRef.current.scrollLeft,
      moved: false,
      lastX: e.pageX,
      lastTime: performance.now(),
      velocity: 0,
    };
    setIsDraggingSlider(true);
  };

  const handleSliderClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (sliderDragRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      sliderDragRef.current.moved = false;
    }
  };

  const handleSliderScroll = () => {
    if (!sliderRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = sliderRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  };

  const scrollSlider = (direction: 'prev' | 'next') => {
    if (!sliderRef.current) return;
    const cardWidth = sliderRef.current.firstElementChild?.clientWidth || 300;
    const scrollDelta = (cardWidth + 12) * (direction === 'next' ? 1 : -1);
    sliderRef.current.scrollBy({ left: scrollDelta, behavior: 'smooth' });
  };

  useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.scrollLeft = 0;
      setCanScrollLeft(false);
      setCanScrollRight(sliderRef.current.scrollWidth > sliderRef.current.clientWidth + 10);
    }
  }, [matchTab, rankingFilter, campionatoPartite, viewMode]);

  useEffect(() => {
    if (!isTopModal || isPreview) return;
    const originalTitle = document.title;
    const name = atleta?.anagrafica?.nome || athleteName;
    if (name && name !== 'Atleta') {
      document.title = `${name} | Scheda Atleta & Ranking FITeT`;
    }
    return () => {
      document.title = originalTitle;
    };
  }, [atleta?.anagrafica?.nome, athleteName, isTopModal, isPreview]);

  // Close share popover when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setIsShareMenuOpen(false);
      }
    };
    if (isShareMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isShareMenuOpen]);

  const sharePlayerId = atleta?.id || atletaId;
  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/player/${encodeURIComponent(sharePlayerId)}`
    : `/player/${encodeURIComponent(sharePlayerId)}`;

  const handleShareWhatsApp = () => {
    const name = atleta?.anagrafica?.nome || athleteName || 'Atleta';
    const club = atleta?.anagrafica?.societa || squadraCampionato || '';
    const cat = atleta?.anagrafica?.categoria ? `${atleta.anagrafica.categoria}ª Categoria` : '';
    const storico = atleta?.storicoClassifica || [];
    const ultimo = storico.length > 0 ? storico[storico.length - 1] : null;
    const pos = ultimo?.posizione ? `#${ultimo.posizione}` : (atleta?.anagrafica?.stato || '');
    const pts = atleta?.anagrafica?.punti || ultimo?.punti;

    let msg = `🏓 *${name}* - Scheda Atleta FITeT\n`;
    if (club) msg += `🏢 Società: ${club}\n`;
    if (cat) msg += `🎯 Categoria: ${cat}\n`;
    if (pos) msg += `🏆 Ranking: ${pos}\n`;
    if (pts) msg += `⭐ Punti: ${typeof pts === 'number' ? pts.toLocaleString('it-IT') : pts}\n`;
    msg += `\nVisualizza profilo completo, andamento e storico incontri:\n${shareUrl}`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
    setIsShareMenuOpen(false);
  };

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopied(true);
      setToastMessage('Link profilo copiato negli appunti!');
      setShowToast(true);
      setTimeout(() => setCopied(false), 2200);
      setTimeout(() => setShowToast(false), 2800);
      setIsShareMenuOpen(false);
    } catch (err) {
      console.error('Errore copia link:', err);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        const name = atleta?.anagrafica?.nome || athleteName || 'Atleta';
        await navigator.share({
          title: `${name} - Scheda FITeT`,
          text: `Scheda atleta e statistiche di ${name} sul portale FITeT:`,
          url: shareUrl,
        });
        setIsShareMenuOpen(false);
      } catch {
        // User cancelled share
      }
    } else {
      handleCopyLink();
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Se l'atleta corrente è già caricato e corrisponde all'ID o al nome richiesto (es. espansione da preview a full con "Mostra altri dati"),
    // NON resettare l'atleta e non ricaricare/distruggere l'interfaccia e la foto già a schermo.
    const existing = currentAtletaRef.current;
    const isSameAthlete = Boolean(
      existing &&
        (existing.id === atletaId ||
          (existing.anagrafica?.nome && athleteName && existing.anagrafica.nome.toLowerCase() === athleteName.toLowerCase()) ||
          (existing.id && atletaId && existing.id.toLowerCase() === atletaId.toLowerCase()))
    );

    if (isSameAthlete && existing) {
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    setLoading(true);
    setAtleta(null);
    setError(null);
    setNotFound(false);
    setCampionatoPartite(null);
    setSquadraCampionato(null);

    // Funzione helper per recuperare le partite di campionato prioritizzando i campionati effettivamente giocati dall'atleta
    const loadMatchesForAthlete = async (
      id: string,
      name: string,
      preferredCamId?: string,
      actualCamId?: string,
      playedCamIds?: string[],
      regione?: string
    ) => {
      setLoadingPartite(true);
      try {
        const knownCamIds = Array.from(
          new Set([
            ...(playedCamIds || []).filter(Boolean),
            ...(actualCamId ? [actualCamId] : []),
          ])
        );

        let combinedMatches: PartitaCampionatoAtleta[] = [];
        let resolvedSquadra: string | null = null;
        let autoDiscoveredCamp: { camId: number; nome: string; squadra?: string } | null = null;

        if (knownCamIds.length > 0) {
          // Ordina mettendo preferredCamId per primo se appartiene ai campionati giocati dall'atleta
          const orderedKnown = preferredCamId && knownCamIds.includes(preferredCamId)
            ? [preferredCamId, ...knownCamIds.filter((c) => c !== preferredCamId)]
            : knownCamIds;

          const results = await Promise.all(
            orderedKnown.map((cId) =>
              fetchAtletaCampionatoPartite(id, cId, undefined, name, false, regione).catch(() => null)
            )
          );

          for (const res of results) {
            if (res && res.matches && res.matches.length > 0) {
              combinedMatches.push(...res.matches);
              if (!resolvedSquadra && res.squadra) {
                resolvedSquadra = res.squadra;
              }
            }
          }
        }

        // Fallback su preferredCamId se non era tra i campionati noti nel ranking ma l'utente lo ha aperto da quel girone
        if (combinedMatches.length === 0 && preferredCamId && !knownCamIds.includes(preferredCamId)) {
          const fallbackRes = await fetchAtletaCampionatoPartite(id, preferredCamId, undefined, name, false, regione).catch(() => null);
          if (fallbackRes && fallbackRes.matches && fallbackRes.matches.length > 0) {
            combinedMatches = fallbackRes.matches;
            resolvedSquadra = fallbackRes.squadra || null;
          }
        }

        // Fallback 'auto' per atleti Fuori Quadro / Non classificati aperti da URL diretto (/player/:id) o ricerca
        if (combinedMatches.length === 0 && knownCamIds.length === 0 && !preferredCamId) {
          const autoRes = await fetchAtletaCampionatoPartite(id, 'auto', undefined, name, false, regione).catch(() => null);
          if (autoRes && autoRes.matches && autoRes.matches.length > 0) {
            combinedMatches = autoRes.matches;
            resolvedSquadra = autoRes.squadra || null;
            if (autoRes.camId && /^\d+$/.test(String(autoRes.camId))) {
              autoDiscoveredCamp = {
                camId: Number(autoRes.camId),
                nome: autoRes.campionatoNome || 'Campionato',
                squadra: autoRes.squadra,
              };
            }
          }
        }

        if (isMounted) {
          if (autoDiscoveredCamp) {
            setAtleta((prev) =>
              prev && !prev.campionatoAttuale
                ? {
                  ...prev,
                  campionatoAttuale: autoDiscoveredCamp!,
                  campionatiGiocati: [autoDiscoveredCamp!],
                }
                : prev
            );
          }
          if (combinedMatches.length > 0) {
            setCampionatoPartite(combinedMatches);
            setSquadraCampionato(resolvedSquadra);
            setMatchTab('girone');
          } else {
            setCampionatoPartite([]);
            setMatchTab('ranking');
          }
          setLoadingPartite(false);
        }
      } catch {
        if (isMounted) {
          setCampionatoPartite([]);
          setLoadingPartite(false);
          setMatchTab('ranking');
        }
      }
    };

    // Recupera anagrafica atleta e poi coordina il caricamento partite
    fetchAtleta(atletaId)
      .then((data) => {
        if (!isMounted) return;

        const isHollow = !data || !isValidAthleteHistoryName(data.anagrafica?.nome, data.id || atletaId);
        if (isHollow) {
          setAtleta(null);
          setNotFound(true);
          setError(null);
          setLoading(false);
          setLoadingPartite(false);
          return;
        }

        setAtleta(data);
        setNotFound(false);
        setLoading(false);

        const storico = data.storicoClassifica || [];
        const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;

        if (!isPreviewRef.current) {
          if (onResolveAthlete && data.id && (data.id !== atletaId || !athleteName)) {
            onResolveAthlete(data.id, data.anagrafica.nome);
          }

          // Sincronizza cronologia recente
          addRecentAthlete({
            id: data.id,
            name: data.anagrafica.nome,
            squadra: data.anagrafica.societa || undefined,
            ranking: ultimoSnapshot?.posizione ?? undefined,
            punti: data.anagrafica.punti ?? ultimoSnapshot?.punti ?? undefined,
            categoria: data.anagrafica.categoria ?? ultimoSnapshot?.categoria ?? undefined,
          });
        }

        // Sincronizza preferiti se presente
        if (isFavorite(data.id) || isFavorite(data.anagrafica.nome)) {
          saveFavoriteAthlete({
            id: data.id,
            name: data.anagrafica.nome,
            squadra: data.anagrafica.societa || undefined,
            ranking: ultimoSnapshot?.posizione ?? undefined,
            punti: data.anagrafica.punti ?? ultimoSnapshot?.punti ?? undefined,
            categoria: data.anagrafica.categoria ?? ultimoSnapshot?.categoria ?? undefined,
            dataNascita: data.anagrafica.dataNascita ?? undefined,
            fotoUrl: data.anagrafica.fotoUrl ?? undefined,
          });
        }

        const athleteActualCamId = data.campionatoAttuale ? String(data.campionatoAttuale.camId) : undefined;
        const playedCamIds = (data.campionatiGiocati || []).map((c) => String(c.camId));
        const targetId = data.id || atletaId;
        const targetName = data.anagrafica?.nome || athleteName || '';

        // Carica partite gestendo il mismatch tra camId esterno e campionato reale dell'atleta
        loadMatchesForAthlete(
          targetId,
          targetName,
          camId || undefined,
          athleteActualCamId,
          playedCamIds,
          data.anagrafica?.regione
        );
      })
      .catch((err) => {
        if (isMounted) {
          if (err?.notFound || err?.status === 404) {
            setAtleta(null);
            setNotFound(true);
            setError(null);
          } else {
            setError(err.message || 'Impossibile caricare i dati atleta');
          }
          setLoading(false);
          setLoadingPartite(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [atletaId, camId, athleteName]);

  // Sincronizzazione automatica del tab delle partite tra Girone Corrente e Tutte le Partite Ranking
  useEffect(() => {
    const hasGirone = Boolean(campionatoPartite && campionatoPartite.length > 0);

    if (hasGirone) {
      setMatchTab('girone');
    } else if (!loadingPartite) {
      setMatchTab('ranking');
    }
  }, [campionatoPartite, loadingPartite, atleta?.partiteRanking]);

  // Funzione di aggiornamento forzato (bypassa cache)
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    setNotFound(false);
    try {
      const targetId = atleta?.id || atletaId;
      const targetName = atleta?.anagrafica?.nome || athleteName;

      const freshData = await fetchAtleta(targetId, true);
      const isHollow = !freshData || !isValidAthleteHistoryName(freshData.anagrafica?.nome, freshData.id || targetId);
      if (isHollow) {
        setAtleta(null);
        setNotFound(true);
        setLoadingPartite(false);
        return;
      }

      setAtleta(freshData);

      if (onResolveAthlete && freshData.id && (freshData.id !== atletaId || !athleteName)) {
        onResolveAthlete(freshData.id, freshData.anagrafica.nome);
      }

      const actualCamId = freshData?.campionatoAttuale ? String(freshData.campionatoAttuale.camId) : undefined;
      const playedCamIds = (freshData?.campionatiGiocati || []).map((c) => String(c.camId));
      const knownCamIds = Array.from(
        new Set([...playedCamIds.filter(Boolean), ...(actualCamId ? [actualCamId] : [])])
      );

      let combinedMatches: PartitaCampionatoAtleta[] = [];
      let resolvedSquadra: string | null = null;

      if (knownCamIds.length > 0) {
        const orderedKnown = camId && knownCamIds.includes(camId)
          ? [camId, ...knownCamIds.filter((c) => c !== camId)]
          : knownCamIds;

        const results = await Promise.all(
          orderedKnown.map((cId) =>
            fetchAtletaCampionatoPartite(targetId, cId, undefined, targetName, true).catch(() => null)
          )
        );
        for (const res of results) {
          if (res && res.matches && res.matches.length > 0) {
            combinedMatches.push(...res.matches);
            if (!resolvedSquadra && res.squadra) {
              resolvedSquadra = res.squadra;
            }
          }
        }
      }

      if (combinedMatches.length === 0 && camId && !knownCamIds.includes(camId)) {
        const fallbackRes = await fetchAtletaCampionatoPartite(targetId, camId, undefined, targetName, true, freshData?.anagrafica?.regione).catch(() => null);
        if (fallbackRes && fallbackRes.matches && fallbackRes.matches.length > 0) {
          combinedMatches = fallbackRes.matches;
          resolvedSquadra = fallbackRes.squadra || null;
        }
      }

      if (combinedMatches.length === 0 && knownCamIds.length === 0 && !camId) {
        const autoRes = await fetchAtletaCampionatoPartite(targetId, 'auto', undefined, targetName, true, freshData?.anagrafica?.regione).catch(() => null);
        if (autoRes && autoRes.matches && autoRes.matches.length > 0) {
          combinedMatches = autoRes.matches;
          resolvedSquadra = autoRes.squadra || null;
        }
      }

      if (combinedMatches.length > 0) {
        setCampionatoPartite(combinedMatches);
        setSquadraCampionato(resolvedSquadra || freshData?.campionatoAttuale?.squadra || null);
        setMatchTab('girone');
      } else {
        setCampionatoPartite([]);
        setMatchTab('ranking');
      }
    } catch (err: any) {
      if (err?.notFound || err?.status === 404) {
        setAtleta(null);
        setNotFound(true);
      } else {
        console.warn('Errore refresh atleta:', err);
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Recupera in automatico i risultati set tramite la chiamata head_to_head per tutti gli incontri privi di punteggio set
  useEffect(() => {
    if (!currentAtletaId || isPreview) return;

    const allMatches = [
      ...(campionatoPartite || []),
      ...(atleta?.partiteRanking?.campionato || []),
      ...(atleta?.partiteRanking?.tornei || []),
    ];

    const missingOpponents = new Map<string, { id?: string; name: string }>();

    for (const m of allMatches) {
      if (!m.risultatoSet && m.avversario) {
        const oppName = m.avversario.toUpperCase().trim();
        const oppId = (m as any).avversarioId;
        const key = oppId || oppName;
        if (!h2hScores[key] && !loadingH2h[key] && !missingOpponents.has(key)) {
          missingOpponents.set(key, { id: oppId, name: m.avversario });
        }
      }
    }

    if (missingOpponents.size === 0) return;

    let isMounted = true;

    setLoadingH2h((prev) => {
      const next = { ...prev };
      missingOpponents.forEach((_, key) => {
        next[key] = true;
      });
      return next;
    });

    missingOpponents.forEach((opp, key) => {
      const oppParam = opp.id || opp.name;
      fetchHeadToHead(currentAtletaId, oppParam)
        .then((data) => {
          if (!isMounted) return;
          if (data?.atleta2?.id) {
            const resolvedId = data.atleta2.id;
            const oppNorm = opp.name.toUpperCase().trim();
            const respNorm = (data.atleta2.nome || '').toUpperCase().trim();
            setH2hOpponentIds((prev) => ({
              ...prev,
              [oppNorm]: resolvedId,
              ...(respNorm ? { [respNorm]: resolvedId } : {}),
            }));
          }
          setH2hScores((prev) => {
            const next = { ...prev };
            if (data && data.incontri && data.incontri.length > 0) {
              const nameKey = (data.atleta2.nome || opp.name).toUpperCase().trim();
              const idKey = data.atleta2.id || opp.id;

              data.incontri.forEach((enc) => {
                const dateKey = normDate(enc.data);
                const scoreObj = { punteggio: enc.punteggio, data: enc.data };
                if (idKey && dateKey) next[`${idKey}_${dateKey}`] = scoreObj;
                if (nameKey && dateKey) next[`${nameKey}_${dateKey}`] = scoreObj;
              });

              const firstEnc = { punteggio: data.incontri[0].punteggio, data: data.incontri[0].data };
              if (idKey && !next[idKey]) next[idKey] = firstEnc;
              if (nameKey && !next[nameKey]) next[nameKey] = firstEnc;
              next[key] = firstEnc;
            }
            return next;
          });
        })
        .catch(() => {
          // Ignorato per non bloccare la UI
        })
        .finally(() => {
          if (isMounted) {
            setLoadingH2h((prev) => ({ ...prev, [key]: false }));
          }
        });
    });

    return () => {
      isMounted = false;
    };
  }, [currentAtletaId, isPreview, campionatoPartite, atleta?.partiteRanking]);

  useEffect(() => {
    if (!isTopModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !h2hOpponent && !selectedMatchDetail) {
        e.stopPropagation();
        requestClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [requestClose, isTopModal, h2hOpponent, selectedMatchDetail, isPhotoZoomOpen]);

  // Anteprima / zoom della foto dell'atleta
  const zoomPhotoSrc = athletePhoto;
  const canOpenPhotoZoom = Boolean(zoomPhotoSrc) && !imgError && imgLoaded;
  const openPhotoZoom = () => setIsPhotoZoomOpen(true);
  const closePhotoZoom = () => setIsPhotoZoomOpen(false);

  if (typeof document === 'undefined') return null;

  const isCompactState = !isPreview && !loading && (notFound || Boolean(error));

  return createPortal(
    <div
      className={`modal-backdrop-simple modal-athlete-backdrop ${isPreview ? 'is-preview-backdrop' : ''} ${isClosing ? 'modal-closing' : ''}`}
      style={zIndex ? { zIndex } : undefined}
      onMouseDown={(e) => {
        backdropMouseDownTargetRef.current = e.target;
      }}
      onClick={(e) => {
        if (Date.now() < suppressBackdropClickUntilRef.current) return;
        if (e.target === e.currentTarget && backdropMouseDownTargetRef.current === e.currentTarget) {
          requestClose();
        }
      }}
    >
      <div
        ref={cardRef}
        className={`modal-card-simple atleta-modal-card ${isPreview ? 'is-preview-mode' : ''} ${isCompactState ? 'is-compact-state' : ''} ${hasExpandedInPlace ? 'is-expanded-in-place' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onScroll={handleCardScroll}
      >
        {/* Sticky Scroll-Reveal Header (0px height at landing, slides in on scroll) */}
        <div className="atleta-sticky-header-slot">
          <div
            ref={headerRef}
            className={`modal-header-simple atleta-modal-header ${isScrolledPastHero ? 'is-scrolled' : 'is-dissolved'}`}
          >
            <div className="modal-header-athlete-identity">
              {zoomPhotoSrc && !imgError && imgLoaded ? (
                <img
                  src={zoomPhotoSrc}
                  alt={atleta?.anagrafica?.nome || athleteName || 'Atleta'}
                  className="modal-header-athlete-thumb"
                  referrerPolicy="no-referrer"
                  onError={() => {
                    markPhotoError(zoomPhotoSrc);
                    setImgError(true);
                  }}
                  onClick={canOpenPhotoZoom ? openPhotoZoom : undefined}
                  title={canOpenPhotoZoom ? 'Ingrandisci foto' : undefined}
                  style={{ cursor: canOpenPhotoZoom ? 'pointer' : 'default' }}
                />
              ) : (
                <div className="modal-header-athlete-initials" aria-hidden="true" />
              )}
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <h3 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {atleta?.anagrafica?.nome || athleteName || 'Scheda Atleta'}
                </h3>
                <div className="modal-header-subtext">
                  {atleta?.anagrafica?.societa ? `${atleta.anagrafica.societa} • ` : ''}
                  Tessera / ID: {atleta?.id || (/^\d+$/.test(atletaId) ? atletaId : 'N.D.')}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <button
                type="button"
                className={`modal-favorite-toggle-btn ${isFav ? 'is-favorited' : ''}`}
                onClick={handleToggleFavorite}
                title={isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
                aria-label={isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
              >
                <i className={isFav ? 'bi bi-star-fill text-warning' : 'bi bi-star'}></i>
              </button>

              <button
                type="button"
                className={`modal-favorite-toggle-btn ${copied ? 'is-favorited' : ''}`}
                onClick={handleCopyLink}
                title={copied ? 'Link Copiato!' : 'Copia link profilo condivisibile'}
                aria-label="Copia link profilo"
              >
                <i className={`bi ${copied ? 'bi-check2 text-success' : 'bi-link-45deg'}`}></i>
              </button>

              {/* Share / WhatsApp Popover Toggle Button */}
              <div className="position-relative" ref={isScrolledPastHero ? shareMenuRef : undefined}>
                <button
                  type="button"
                  className={`modal-favorite-toggle-btn ${isShareMenuOpen ? 'is-favorited' : ''}`}
                  onClick={() => setIsShareMenuOpen((prev) => !prev)}
                  title="Condividi scheda atleta (WhatsApp, Copia Link)"
                  aria-label="Condividi scheda atleta"
                >
                  <i className="bi bi-share-fill" style={{ fontSize: '12px', color: '#25D366' }}></i>
                </button>

                {isScrolledPastHero && isShareMenuOpen && (
                  <div className="athlete-share-popover">
                    <div className="athlete-share-popover-header">
                      <span>Condividi Scheda</span>
                      <button
                        type="button"
                        className="btn-close-popover"
                        onClick={() => setIsShareMenuOpen(false)}
                        aria-label="Chiudi"
                      >
                        <i className="bi bi-x-lg"></i>
                      </button>
                    </div>
                    <div className="athlete-share-url-box">
                      <span className="athlete-share-url-text">{shareUrl}</span>
                    </div>
                    <div className="athlete-share-actions">
                      <button
                        type="button"
                        className="athlete-share-action-btn btn-instagram-story"
                        onClick={() => {
                          setIsShareMenuOpen(false);
                          setIsStoryModalOpen(true);
                        }}
                      >
                        <i className="bi bi-instagram me-2" style={{ fontSize: '15px', color: '#E1306C' }}></i>
                        <span>Crea Storia Instagram (9:16)</span>
                      </button>
                      <button
                        type="button"
                        className="athlete-share-action-btn btn-whatsapp"
                        onClick={handleShareWhatsApp}
                      >
                        <i className="bi bi-whatsapp me-2" style={{ fontSize: '16px' }}></i>
                        <span>Invia su WhatsApp</span>
                      </button>
                      <button
                        type="button"
                        className="athlete-share-action-btn btn-copy-link"
                        onClick={handleCopyLink}
                      >
                        <i className={`bi ${copied ? 'bi-check2 text-success' : 'bi-link-45deg'} me-2`} style={{ fontSize: '16px' }}></i>
                        <span>{copied ? 'Link Copiato!' : 'Copia Link Diretto'}</span>
                      </button>
                      {typeof navigator !== 'undefined' && 'share' in navigator && (
                        <button
                          type="button"
                          className="athlete-share-action-btn btn-native-share"
                          onClick={handleNativeShare}
                        >
                          <i className="bi bi-box-arrow-up me-2" style={{ fontSize: '14px' }}></i>
                          <span>Altre opzioni...</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="modal-close-btn"
                onClick={requestClose}
                title="Chiudi finestra (ESC)"
                aria-label="Chiudi finestra"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body-simple">
          {/* Top Action Bar (Mobile: Left/Right | Desktop: Grouped Top-Right with Divider) */}
          <div className="athlete-spotlight-top-bar">
            {atleta && !notFound && !error && (
              <>
                <div className="athlete-spotlight-top-actions">
                  {/* Star */}
                  <button
                    type="button"
                    className={`athlete-spotlight-action-btn btn-star ${isFav ? 'is-favorited' : ''}`}
                    onClick={handleToggleFavorite}
                    title={isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
                    aria-label={isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
                    disabled={loading && !atleta}
                  >
                    <i className={isFav ? 'bi bi-star-fill' : 'bi bi-star'}></i>
                  </button>

                  {/* Copy Link */}
                  <button
                    type="button"
                    className={`athlete-spotlight-action-btn btn-copy ${copied ? 'is-copied' : ''}`}
                    onClick={handleCopyLink}
                    title={copied ? 'Link Copiato!' : 'Copia link profilo condivisibile'}
                    aria-label="Copia link profilo"
                    disabled={loading && !atleta}
                  >
                    <i className={copied ? 'bi bi-check2' : 'bi bi-link-45deg'}></i>
                  </button>

                  {/* Share Popover */}
                  <div className="position-relative" ref={!isScrolledPastHero ? shareMenuRef : undefined}>
                    <button
                      type="button"
                      className={`athlete-spotlight-action-btn btn-share ${isShareMenuOpen ? 'is-open' : ''}`}
                      onClick={() => setIsShareMenuOpen((prev) => !prev)}
                      title="Condividi scheda atleta"
                      aria-label="Condividi scheda atleta"
                      disabled={loading && !atleta}
                    >
                      <i className="bi bi-share-fill"></i>
                    </button>

                    {!isScrolledPastHero && isShareMenuOpen && (
                      <div className="athlete-share-popover">
                        <div className="athlete-share-popover-header">
                          <span>Condividi Scheda</span>
                          <button
                            type="button"
                            className="btn-close-popover"
                            onClick={() => setIsShareMenuOpen(false)}
                            aria-label="Chiudi"
                          >
                            <i className="bi bi-x-lg"></i>
                          </button>
                        </div>
                        <div className="athlete-share-url-box">
                          <span className="athlete-share-url-text">{shareUrl}</span>
                        </div>
                        <div className="athlete-share-actions">
                          <button
                            type="button"
                            className="athlete-share-action-btn btn-instagram-story"
                            onClick={() => {
                              setIsShareMenuOpen(false);
                              setIsStoryModalOpen(true);
                            }}
                          >
                            <i className="bi bi-instagram me-2" style={{ fontSize: '15px', color: '#E1306C' }}></i>
                            <span>Crea Storia Instagram (9:16)</span>
                          </button>
                          <button
                            type="button"
                            className="athlete-share-action-btn btn-whatsapp"
                            onClick={handleShareWhatsApp}
                          >
                            <i className="bi bi-whatsapp me-2" style={{ fontSize: '16px' }}></i>
                            <span>Invia su WhatsApp</span>
                          </button>
                          <button
                            type="button"
                            className="athlete-share-action-btn btn-copy-link"
                            onClick={handleCopyLink}
                          >
                            <i className={`bi ${copied ? 'bi-check2 text-success' : 'bi-link-45deg'} me-2`} style={{ fontSize: '16px' }}></i>
                            <span>{copied ? 'Link Copiato!' : 'Copia Link Diretto'}</span>
                          </button>
                          {typeof navigator !== 'undefined' && 'share' in navigator && (
                            <button
                              type="button"
                              className="athlete-share-action-btn btn-native-share"
                              onClick={handleNativeShare}
                            >
                              <i className="bi bi-box-arrow-up me-2" style={{ fontSize: '14px' }}></i>
                              <span>Altre opzioni...</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <span className="athlete-spotlight-top-divider" aria-hidden="true" />
              </>
            )}

            {/* Close Button X */}
            <button
              type="button"
              className="athlete-spotlight-action-btn btn-close-modal"
              style={!atleta || notFound || error ? { marginLeft: 'auto' } : undefined}
              onClick={requestClose}
              title="Chiudi finestra (ESC)"
              aria-label="Chiudi finestra"
            >
              <i className="bi bi-x-lg"></i>
            </button>
          </div>

          {loading && (
            <div className="athlete-skeleton-wrap" aria-busy="true" aria-label="Caricamento scheda atleta">
              <div className={`athlete-spotlight-layout ${!isPreview ? 'athlete-spotlight-layout--full' : ''}`}>
                <div className="athlete-spotlight-photo-wrap athlete-skeleton-block" aria-hidden="true" />
                <div className="athlete-spotlight-main-col">
                  <div className="athlete-spotlight-info-block">
                    <div className="athlete-skeleton-line athlete-skeleton-line--title athlete-skeleton-block" />
                    <div className="athlete-skeleton-line athlete-skeleton-line--club athlete-skeleton-block" />
                    <div className="athlete-skeleton-line athlete-skeleton-line--sub athlete-skeleton-block" />
                    <div className="athlete-skeleton-pills">
                      <span className="athlete-skeleton-pill athlete-skeleton-block" />
                      <span className="athlete-skeleton-pill athlete-skeleton-block" />
                      <span className="athlete-skeleton-pill athlete-skeleton-pill--wide athlete-skeleton-block" />
                    </div>
                  </div>

                  <div className="overview-stats-card athlete-spotlight-stats-card athlete-skeleton-stats">
                    <div className="overview-stats-row">
                      {[0, 1, 2, 3].map((colIdx) => (
                        <React.Fragment key={colIdx}>
                          {colIdx > 0 && <div className="overview-stat-divider" aria-hidden="true" />}
                          <div className="overview-stat-col athlete-skeleton-stat-col">
                            <span className="athlete-skeleton-line athlete-skeleton-line--stat-label athlete-skeleton-block" />
                            <span className="athlete-skeleton-line athlete-skeleton-line--stat-val athlete-skeleton-block" />
                            <span className="athlete-skeleton-line athlete-skeleton-line--stat-sub athlete-skeleton-block" />
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {!isPreview && (
                <div className="athlete-skeleton-details">
                  <div className="athlete-skeleton-section-bar">
                    <span className="athlete-skeleton-line athlete-skeleton-line--section athlete-skeleton-block" />
                    <span className="athlete-skeleton-line athlete-skeleton-line--tabs athlete-skeleton-block" />
                  </div>
                  <div className="athlete-skeleton-matches-grid">
                    <div className="athlete-skeleton-match-card athlete-skeleton-block" />
                    <div className="athlete-skeleton-match-card athlete-skeleton-block" />
                    <div className="athlete-skeleton-match-card athlete-skeleton-block" />
                  </div>
                  <div className="athlete-skeleton-chart athlete-skeleton-block" />
                </div>
              )}

              <div className="athlete-skeleton-caption">
                <span className="athlete-skeleton-dot" aria-hidden="true" />
                <span>Caricamento dati dal portale FITeT in corso...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="modal-error-box">
              <strong>Errore:</strong> {error}
            </div>
          )}

          {notFound && !loading && (
            <AthleteNotFoundState
              atletaId={atletaId}
              onClose={requestClose}
              onRetry={handleRefresh}
              retrying={refreshing}
            />
          )}

          {atleta && !loading && (
            <div className={!hasExpandedInPlace ? 'athlete-data-reveal' : undefined}>
              {/* Responsive Spotlight Layout: Centered Vertical on Mobile, 2-Column Horizontal on Desktop */}
              <div className={`athlete-spotlight-layout ${!isPreview ? 'athlete-spotlight-layout--full' : ''}`}>
                {/* Left Column (Desktop) / Top Centered (Mobile): Photo */}
                <div
                  className={`athlete-spotlight-photo-wrap ${athletePhoto && !imgLoaded && !imgError ? 'is-photo-loading' : ''}`}
                  style={{ cursor: canOpenPhotoZoom ? 'pointer' : 'default' }}
                  onClick={canOpenPhotoZoom ? openPhotoZoom : undefined}
                  title={canOpenPhotoZoom ? 'Apri anteprima foto' : undefined}
                >
                  <span
                    className={`img-med-placeholder ${!athletePhoto || imgError ? 'is-visible' : ''}`}
                    aria-hidden="true"
                  />
                  {athletePhoto && !imgError && (
                    <img
                      ref={photoImgRef}
                      src={athletePhoto}
                      alt={atleta.anagrafica.nome}
                      referrerPolicy="no-referrer"
                      className={`athlete-spotlight-photo-img ${imgLoaded ? 'is-loaded' : ''}`}
                      onLoad={() => {
                        markPhotoLoaded(athletePhoto);
                        setImgLoaded(true);
                        setImgError(false);
                      }}
                      onError={() => {
                        markPhotoError(athletePhoto);
                        setImgError(true);
                        setImgLoaded(false);
                      }}
                    />
                  )}
                </div>

                {/* Right Column (Desktop) / Centered Column (Mobile): Info + Stats */}
                <div className="athlete-spotlight-main-col">
                  <div className="athlete-spotlight-info-block" ref={profileBarRef}>
                    {/* Athlete Name (Bold Uppercase) */}
                    <h2 className="athlete-spotlight-name">
                      {atleta.anagrafica.nome}
                    </h2>

                    {/* Society & Region */}
                    <div className="athlete-spotlight-club-wrap">
                      <div className="athlete-spotlight-club-row">
                        {atleta.anagrafica.societa && onOpenSociety ? (
                          <button
                            type="button"
                            className="athlete-spotlight-club-btn"
                            onClick={() =>
                              onOpenSociety(atleta.anagrafica.societa, {
                                atletaId: atleta.id || (/^\d+$/.test(atletaId) ? atletaId : null),
                                camId: atleta.campionatoAttuale?.camId || (camId && /^\d+$/.test(camId) ? Number(camId) : null),
                                regione: atleta.anagrafica.regione || null,
                                logoUrl: atleta.anagrafica.logoUrl || null,
                              })
                            }
                            title={`Apri scheda società ${atleta.anagrafica.societa}`}
                          >
                            <span>{atleta.anagrafica.societa}</span>
                            <TeamLogo
                              teamName={atleta.anagrafica.societa}
                              logoUrl={atleta.anagrafica.logoUrl}
                              className="athlete-spotlight-team-logo"
                            />
                          </button>
                        ) : (
                          <span className="athlete-spotlight-club-text">
                            {atleta.anagrafica.societa || 'N.D.'}
                            {atleta.anagrafica.societa && (
                              <TeamLogo
                                teamName={atleta.anagrafica.societa}
                                logoUrl={atleta.anagrafica.logoUrl}
                                className="athlete-spotlight-team-logo"
                              />
                            )}
                          </span>
                        )}
                      </div>
                      {atleta.anagrafica.regione && (
                        <div className="athlete-spotlight-region">
                          📍 {atleta.anagrafica.regione}
                        </div>
                      )}
                    </div>

                    {/* Badges & Meta Row */}
                    <div className="athlete-spotlight-meta-row">
                      {atleta.anagrafica.categoria && (
                        <span className="athlete-spotlight-pill is-category">
                          {formatCategoryPill(atleta.anagrafica.categoria)}
                        </span>
                      )}
                      {atleta.anagrafica.settore && (
                        <span className="athlete-spotlight-pill">
                          {atleta.anagrafica.settore}
                        </span>
                      )}
                      {(atleta.anagrafica.categoria || atleta.anagrafica.settore) && (atleta.anagrafica.dataNascita || viewsCount > 0) && (
                        <span className="athlete-spotlight-divider" aria-hidden="true" />
                      )}
                      {atleta.anagrafica.dataNascita && (
                        <span className="athlete-spotlight-meta-item">
                          <i className="bi bi-calendar3 me-1"></i>
                          <span className="athlete-spotlight-born-prefix">Nato/a il&nbsp;</span>
                          {atleta.anagrafica.dataNascita}
                        </span>
                      )}
                      {atleta.anagrafica.dataNascita && viewsCount > 0 && (
                        <span className="athlete-spotlight-bullet athlete-spotlight-meta-sep" aria-hidden="true">•</span>
                      )}
                      {viewsCount > 0 && (
                        <span className="athlete-spotlight-meta-item" title={`${viewsCount.toLocaleString('it-IT')} visualizzazioni del profilo`}>
                          <i className="bi bi-eye me-1"></i>
                          {viewsCount.toLocaleString('it-IT')} {viewsCount === 1 ? 'visita' : 'visite'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Overview Stats (Broadcast Sports Card Style) */}
                  {(() => {
                    const storico = atleta.storicoClassifica || [];
                    const ultimoSnapshot = storico.length > 0 ? storico[storico.length - 1] : null;

                    // Points calculation
                    let pts = atleta.anagrafica.punti;
                    if (pts < 10 && ultimoSnapshot && ultimoSnapshot.punti >= 100) {
                      pts = ultimoSnapshot.punti;
                    }
                    let initPts = atleta.riepilogo.puntiIniziali;
                    if (initPts < 10 && ultimoSnapshot && ultimoSnapshot.punti >= 100) {
                      initPts = Math.round(initPts * 1000);
                    }

                    // Position calculation
                    const pos = ultimoSnapshot?.posizione ?? null;
                    const stato = atleta.anagrafica.stato;
                    const record = atleta.anagrafica.recordClassifica;
                    const hasRecord = record && !record.includes('n. il') && record.trim().length > 0;
                    const dataAgg = ultimoSnapshot?.data
                      ? (ultimoSnapshot.data.includes('-')
                        ? ultimoSnapshot.data.split('-').reverse().join('/')
                        : ultimoSnapshot.data)
                      : null;

                    const posText = pos ? `#${pos.toLocaleString('it-IT')}` : (stato || 'Fuori Quadro');
                    const posSub = hasRecord ? `Record: ${record}` : (dataAgg ? `Al ${dataAgg}` : 'Nazionale');

                    // Aggregazione deduplicata tra partite ranking (#fragment-1/#fragment-3) e partite live del campionato
                    const aggregatedStats = aggregateAthleteMatchStats(
                      atleta,
                      campionatoPartite,
                      campionatoNome || atleta.campionatoAttuale?.nome
                    );
                    const partiteGiocate = aggregatedStats.partiteGiocate;
                    const partiteVinte = aggregatedStats.partiteVinte;
                    const partitePerse = aggregatedStats.partitePerse;
                    const percPositiva = aggregatedStats.percentualePositiva;
                    let puntiNetto = atleta.riepilogo.puntiTotali;

                    if (puntiNetto === 0 && atleta.partiteRanking?.dettaglioPunti) {
                      const diff = (atleta.partiteRanking.dettaglioPunti.campionato || 0) + (atleta.partiteRanking.dettaglioPunti.tornei || 0);
                      if (diff !== 0) puntiNetto = diff;
                    }

                    const formatPartiteSub = () => {
                      if (aggregatedStats.campionatoGiocate > 0 || aggregatedStats.torneiGiocate > 0) {
                        const parts: string[] = [];
                        if (aggregatedStats.torneiGiocate > 0) {
                          parts.push(`Tornei: ${aggregatedStats.torneiGiocate}`);
                        }
                        if (aggregatedStats.campionatoGiocate > 0) {
                          parts.push(`Camp: ${aggregatedStats.campionatoVinte}V-${aggregatedStats.campionatoPerse}P`);
                        }
                        return parts.join(' - ');
                      }
                      return `Perse: ${partitePerse}`;
                    };

                    const partiteTitleText = (aggregatedStats.campionatoGiocate > 0 && aggregatedStats.torneiGiocate > 0)
                      ? `Totale aggiornato: ${partiteVinte} vinte, ${partitePerse} perse su ${partiteGiocate} giocate (Campionato: ${aggregatedStats.campionatoVinte}V-${aggregatedStats.campionatoPerse}P, Tornei: ${aggregatedStats.torneiVinte}V-${aggregatedStats.torneiPerse}P)`
                      : `Partite vinte: ${partiteVinte}, giocate: ${partiteGiocate}, perse: ${partitePerse}`;

                    return (
                      <div className="overview-stats-card athlete-spotlight-stats-card">
                        <div className="overview-stats-row">
                          {/* 1. Posizione */}
                          <div className="overview-stat-col" title={`Posizione attuale: ${posText} (${posSub})`}>
                            <span className="overview-stat-label">POSIZIONE</span>
                            <MarqueeText className="overview-stat-value" text={posText} />
                            <MarqueeText className="overview-stat-sub" text={posSub} />
                          </div>

                          <div className="overview-stat-divider" aria-hidden="true" />

                          {/* 2. Punti Rank */}
                          <div className="overview-stat-col" title={`Punti attuali: ${pts} pt (Iniziali: ${initPts} pt)`}>
                            <span className="overview-stat-label">PUNTI RANK</span>
                            <MarqueeText className="overview-stat-value" text={pts.toLocaleString('it-IT')} />
                            <MarqueeText className="overview-stat-sub" text={`Iniziali: ${initPts.toLocaleString('it-IT')}`} />
                          </div>

                          <div className="overview-stat-divider" aria-hidden="true" />

                          {/* 3. Partite V/G */}
                          <div className="overview-stat-col" title={partiteTitleText}>
                            <span className="overview-stat-label">PARTITE V/G</span>
                            <MarqueeText className="overview-stat-value">
                              {partiteVinte} <span className="overview-stat-slash">/</span> {partiteGiocate}
                            </MarqueeText>
                            <MarqueeText className="overview-stat-sub" text={formatPartiteSub()} />
                          </div>

                          <div className="overview-stat-divider" aria-hidden="true" />

                          {/* 4. % Vittorie */}
                          <div className="overview-stat-col" title={`% Vittorie: ${percPositiva}%, Guadagno netto: ${puntiNetto} pt`}>
                            <span className="overview-stat-label">% VITTORIE</span>
                            <MarqueeText className="overview-stat-value text-accent-green" text={`${percPositiva}%`} />
                            <MarqueeText
                              className="overview-stat-sub text-accent-green"
                              text={puntiNetto > 0 ? `+${puntiNetto} pt netti` : `${puntiNetto} pt`}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Sezione Partite e Dettagli */}
              {!isPreview && (
                <div
                  id="athlete-partite-details-section"
                  className={hasExpandedInPlace ? 'athlete-expand-details-reveal' : undefined}
                >
                {/* Sezione Partite: Girone Attivo / Incontri Ufficiali Ranking FITeT */}
                {(() => {
                  const parseDateIT = (str: string): number => {
                    if (!str) return 0;
                    const parts = str.split('/');
                    if (parts.length === 3) {
                      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime();
                    }
                    const gMatch = str.match(/^G(\d+)$/i);
                    if (gMatch) {
                      return Date.now() + parseInt(gMatch[1], 10) * 1000;
                    }
                    return 0;
                  };

                  const aggregatedMatches = aggregateAthleteMatchStats(
                    atleta,
                    campionatoPartite,
                    campionatoNome || atleta.campionatoAttuale?.nome
                  );
                  const rankingCampionato = aggregatedMatches.mergedCampionatoMatches;
                  const rankingTornei = atleta.partiteRanking?.tornei || [];
                  const totalRankingCampionato = rankingCampionato.length;
                  const totalRankingTornei = rankingTornei.length;
                  const totalRankingMatches = totalRankingCampionato + totalRankingTornei;
                  const hasGironeMatches = Boolean(campionatoPartite && campionatoPartite.length > 0);

                  // Build unified ranking matches array (deduplicated campionato + tornei)
                  const unifiedRankingMatches: Array<{
                    tipo: 'campionato' | 'torneo';
                    data: string;
                    titolo: string;
                    sottotitolo?: string;
                    avversario: string;
                    avversarioId?: string;
                    risultatoSet?: string;
                    sets?: string[];
                    giornata?: number;
                    fase?: string;
                    risultato: string;
                    isVittoria: boolean;
                    punti?: number;
                    stato?: string;
                  }> = [];

                  if (rankingFilter === 'tutti' || rankingFilter === 'campionato') {
                    rankingCampionato.forEach((m) => {
                      unifiedRankingMatches.push({
                        tipo: 'campionato',
                        data: m.data,
                        titolo: m.campionato,
                        avversario: m.avversario,
                        avversarioId: m.avversarioId,
                        risultatoSet: m.risultatoSet,
                        sets: m.sets,
                        giornata: m.giornata,
                        risultato: m.risultato,
                        isVittoria: m.isVittoria,
                        punti: m.punti,
                        stato: m.stato,
                      });
                    });
                  }

                  if (rankingFilter === 'tutti' || rankingFilter === 'tornei') {
                    rankingTornei.forEach((m) => {
                      unifiedRankingMatches.push({
                        tipo: 'torneo',
                        data: m.data,
                        titolo: m.torneo,
                        sottotitolo: m.gara,
                        avversario: m.avversario,
                        avversarioId: m.avversarioId,
                        risultatoSet: m.risultatoSet,
                        fase: m.fase,
                        risultato: m.risultato,
                        isVittoria: m.isVittoria,
                        punti: m.punti,
                        stato: m.stato,
                      });
                    });
                  }

                  unifiedRankingMatches.sort((a, b) => parseDateIT(b.data) - parseDateIT(a.data));

                  const activeTabResolved: 'girone' | 'ranking' =
                    hasGironeMatches
                      ? (matchTab === 'ranking' && totalRankingMatches > 0 ? 'ranking' : 'girone')
                      : camId && loadingPartite
                        ? matchTab
                        : totalRankingMatches > 0
                          ? 'ranking'
                          : camId
                            ? 'girone'
                            : 'ranking';

                  // Nessuna partita disponibile (né girone né ranking): mostra blocco informativo con tasto di ricarica
                  if (!hasGironeMatches && totalRankingMatches === 0 && !loadingPartite) {
                    return (
                      <div className="modal-campionato-partite-section" style={{ marginTop: '20px', marginBottom: '20px' }}>
                        <div className="modal-empty-notice" style={{ padding: '20px', textAlign: 'center' }}>
                          <i className="bi bi-calendar-x me-2" style={{ fontSize: '18px' }}></i>
                          Nessuna partita di questa stagione registrata per questo atleta.
                          <div style={{ marginTop: '10px' }}>
                            <button
                              type="button"
                              className="btn-action"
                              onClick={handleRefresh}
                              disabled={refreshing}
                              style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '6px' }}
                            >
                              <i className={`bi bi-arrow-clockwise me-1 ${refreshing ? 'spin-icon' : ''}`}></i>
                              Aggiorna partite dalla FITeT
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="modal-campionato-partite-section" style={{ marginTop: '20px', marginBottom: '20px' }}>
                      {/* Header Row: Title & Switcher */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-dark)' }}>
                            {activeTabResolved === 'girone'
                              ? (campionatoNome || atleta.campionatoAttuale?.nome
                                ? `Partite Campionato`
                                : (squadraCampionato ? `Partite Campionato (${squadraCampionato})` : 'Partite Campionato'))
                              : 'Partite Ufficiali FITeT (Campionato & Tornei)'}
                          </span>
                        </div>

                        {/* Switcher visibile se ci sono sia partite del girone/campionato sia partite ranking */}
                        {hasGironeMatches && totalRankingMatches > 0 && (
                          <div className="pill-switcher-container">
                            <button
                              type="button"
                              onClick={() => setMatchTab('girone')}
                              className={`pill-switcher-btn ${activeTabResolved === 'girone' ? 'active' : ''}`}
                            >
                              <i className="bi bi-calendar-event me-1"></i>
                              Campionato
                            </button>
                            <button
                              type="button"
                              onClick={() => setMatchTab('ranking')}
                              className={`pill-switcher-btn ${activeTabResolved === 'ranking' ? 'active' : ''}`}
                            >
                              <i className="bi bi-trophy-fill me-1"></i>
                              Tutte {totalRankingMatches > 0 ? `(${totalRankingMatches})` : ''}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Ranking Sub-Filter Buttons (Tutti / Campionato / Tornei) */}
                      {activeTabResolved === 'ranking' && (totalRankingCampionato > 0 || totalRankingTornei > 0) && (
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => setRankingFilter('tutti')}
                            className={`badge-pill-filter ${rankingFilter === 'tutti' ? 'active' : ''}`}
                          >
                            Tutti ({totalRankingMatches})
                          </button>
                          {totalRankingCampionato > 0 && (
                            <button
                              type="button"
                              onClick={() => setRankingFilter('campionato')}
                              className={`badge-pill-filter ${rankingFilter === 'campionato' ? 'active' : ''}`}
                            >
                              <i className="bi bi-trophy me-1 text-primary"></i>
                              Campionato ({totalRankingCampionato})
                            </button>
                          )}
                          {totalRankingTornei > 0 && (
                            <button
                              type="button"
                              onClick={() => setRankingFilter('tornei')}
                              className={`badge-pill-filter ${rankingFilter === 'tornei' ? 'active' : ''}`}
                            >
                              <i className="bi bi-award me-1 text-warning"></i>
                              Tornei ({totalRankingTornei})
                            </button>
                          )}
                        </div>
                      )}

                      {/* Active Tab View 1: Girone Corrente Header/Notice */}
                      {activeTabResolved === 'girone' && (
                        <>
                          <div className="atleta-tab-notice-line">
                            <i className="bi bi-info-circle text-primary" style={{ fontSize: '12px', flexShrink: 0 }}></i>
                            <span>
                              Le partite disputate nel campionato in corso potrebbero non essere ancora convalidate nei punti ranking ufficiali.
                            </span>
                          </div>

                          {loadingPartite && (
                            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                              <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                              Caricamento partite del girone...
                            </div>
                          )}

                          {!loadingPartite && (!campionatoPartite || campionatoPartite.length === 0) && (
                            <div className="modal-empty-notice">
                              <i className="bi bi-shield-slash me-1"></i>
                              Nessuna partita disputata registrata in questo girone per questo atleta.
                              {totalRankingMatches > 0 && (
                                <div style={{ marginTop: '8px' }}>
                                  <button
                                    type="button"
                                    className="btn-action"
                                    onClick={() => setMatchTab('ranking')}
                                    style={{ padding: '4px 12px', fontSize: '11.5px', borderRadius: '6px' }}
                                  >
                                    Visualizza tutti gli incontri ufficiali FITeT ({totalRankingMatches})
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {/* Active Tab View 2: Official FITeT Ranking Matches empty state */}
                      {activeTabResolved === 'ranking' && unifiedRankingMatches.length === 0 && (
                        <div className="modal-empty-notice">
                          <i className="bi bi-clock-history me-1"></i>
                          Incontri al momento non disponibili
                        </div>
                      )}

                      {/* Render matches slider / list whenever there are matches in the active tab */}
                      {(() => {
                        interface MatchCardItem {
                          id: string;
                          tipo: 'girone' | 'campionato' | 'torneo';
                          data: string;
                          titolo: string;
                          sottotitolo?: string;
                          avversario: string;
                          avversarioId?: string;
                          giornata?: number;
                          fase?: string;
                          isVittoria: boolean;
                          risultatoSet?: string;
                          sets?: string[];
                          punti?: number;
                          rawRisultato?: string;
                        }

                        let matchesToDisplay: MatchCardItem[] = [];

                        if (activeTabResolved === 'girone' && campionatoPartite && campionatoPartite.length > 0) {
                          matchesToDisplay = campionatoPartite.map((m, idx) => {
                            const matchingRanking = aggregatedMatches.matchedRankingByGironeIndex[idx];

                            return {
                              id: `girone-${idx}`,
                              tipo: 'girone',
                              data: matchingRanking?.data || m.data || `G${m.giornata}`,
                              titolo: campionatoNome || atleta.campionatoAttuale?.nome || 'Campionato Girone',
                              sottotitolo: squadraCampionato || undefined,
                              avversario: m.avversario,
                              avversarioId: matchingRanking?.avversarioId,
                              giornata: m.giornata,
                              isVittoria: m.isVittoria,
                              risultatoSet: m.risultatoSet,
                              sets: m.sets,
                              punti: matchingRanking?.punti,
                            };
                          });
                        } else if (activeTabResolved === 'ranking' && unifiedRankingMatches.length > 0) {
                          matchesToDisplay = unifiedRankingMatches.map((m, idx) => {
                            const matchingGirone = campionatoPartite?.find(
                              (gp) => gp.avversario.toUpperCase().trim() === m.avversario.toUpperCase().trim()
                            );

                            return {
                              id: `ranking-${idx}`,
                              tipo: m.tipo,
                              data: m.data,
                              titolo: m.titolo,
                              sottotitolo: m.sottotitolo,
                              avversario: m.avversario,
                              avversarioId: m.avversarioId,
                              giornata: m.giornata,
                              fase: m.fase,
                              isVittoria: m.isVittoria,
                              risultatoSet: m.risultatoSet || matchingGirone?.risultatoSet,
                              sets: m.sets || matchingGirone?.sets,
                              punti: m.punti,
                              rawRisultato: m.risultato,
                            };
                          });
                        }

                        if (matchesToDisplay.length === 0) return null;

                        const activeWins = matchesToDisplay.filter((m) => m.isVittoria).length;
                        const activeLosses = matchesToDisplay.length - activeWins;

                        return (
                          <div style={{ marginTop: '8px', minHeight: '180px' }}>
                            {/* Slider Navigation Bar */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '8px',
                                flexWrap: 'wrap',
                                gap: '8px',
                              }}
                            >
                              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, color: 'var(--text-dark)' }}>
                                  {matchesToDisplay.length} {matchesToDisplay.length === 1 ? 'partita' : 'partite'}
                                </span>
                                <span>·</span>
                                <span style={{ color: '#16a34a', fontWeight: 600 }}>{activeWins} Vinte</span>
                                <span>·</span>
                                <span style={{ color: '#dc2626', fontWeight: 600 }}>{activeLosses} Perse</span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {/* Toggle Slider vs Elenco */}
                                <div className="pill-switcher-container">
                                  <button
                                    type="button"
                                    onClick={() => setViewMode('slider')}
                                    title="Vista Slider"
                                    className={`pill-switcher-btn ${viewMode === 'slider' ? 'active' : ''}`}
                                  >
                                    <i className="bi bi-collection-play me-1"></i>Slider
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setViewMode('list')}
                                    title="Vista Elenco"
                                    className={`pill-switcher-btn ${viewMode === 'list' ? 'active' : ''}`}
                                  >
                                    <i className="bi bi-list-ul me-1"></i>Elenco
                                  </button>
                                </div>

                                {/* Navigation Arrows for Slider */}
                                {viewMode === 'slider' && matchesToDisplay.length > 1 && (
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <button
                                      type="button"
                                      onClick={() => scrollSlider('prev')}
                                      disabled={!canScrollLeft}
                                      title="Partita precedente"
                                      className="slider-nav-btn"
                                    >
                                      <i className="bi bi-chevron-left" style={{ fontSize: '12px' }}></i>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => scrollSlider('next')}
                                      disabled={!canScrollRight}
                                      title="Partita successiva"
                                      className="slider-nav-btn"
                                    >
                                      <i className="bi bi-chevron-right" style={{ fontSize: '12px' }}></i>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Match Cards Display: Slider track or List */}
                            {viewMode === 'slider' ? (
                              <div
                                ref={sliderRef}
                                onScroll={handleSliderScroll}
                                onMouseDown={handleSliderMouseDown}
                                onClickCapture={handleSliderClickCapture}
                                className={`atleta-match-slider-container${isDraggingSlider ? ' is-dragging' : ''}${isSettlingSlider ? ' is-settling' : ''}`}
                              >
                                {[...matchesToDisplay].reverse().map((m, idx) => {
                                  const matchDateNorm = normDate(m.data);
                                  const oppNameKey = (m.avversario || '').toUpperCase().trim();
                                  const oppIdKey = m.avversarioId || h2hOpponentIds[oppNameKey] || '';
                                  const h2hMatch =
                                    (oppIdKey && matchDateNorm ? h2hScores[`${oppIdKey}_${matchDateNorm}`] : null) ||
                                    (oppNameKey && matchDateNorm ? h2hScores[`${oppNameKey}_${matchDateNorm}`] : null) ||
                                    (oppIdKey ? h2hScores[oppIdKey] : null) ||
                                    (oppNameKey ? h2hScores[oppNameKey] : null);

                                  const exactScore = m.risultatoSet || h2hMatch?.punteggio;
                                  const isFetchingScore = !exactScore && Boolean((oppIdKey && loadingH2h[oppIdKey]) || (oppNameKey && loadingH2h[oppNameKey]));
                                  const displayDate =
                                    m.data && isRealDate(m.data)
                                      ? m.data
                                      : h2hMatch?.data || m.data;
                                  const hasRealDate = isRealDate(displayDate);

                                  return (
                                    <div
                                      key={m.id || idx}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() =>
                                        setSelectedMatchDetail({
                                          ...m,
                                          avversarioId: oppIdKey || m.avversarioId,
                                          data: displayDate,
                                          risultatoSet: exactScore || m.risultatoSet,
                                        })
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          setSelectedMatchDetail({
                                            ...m,
                                            avversarioId: oppIdKey || m.avversarioId,
                                            data: displayDate,
                                            risultatoSet: exactScore || m.risultatoSet,
                                          });
                                        }
                                      }}
                                      className="atleta-match-card atleta-match-slider-card is-clickable"
                                      title={`Apri dettaglio incontro contro ${m.avversario}`}
                                    >
                                      {/* Top Row: Outcome badge, Giornata/Fase, Punti Guadagnati, and Date */}
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                          <span className={`match-badge-outcome ${m.isVittoria ? 'is-win' : 'is-loss'}`}>
                                            {m.isVittoria ? 'VINTA' : 'PERSA'}
                                          </span>

                                          {m.punti !== undefined && (
                                            <span
                                              style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                padding: '2px 7px',
                                                borderRadius: '6px',
                                                fontSize: '10.5px',
                                                fontWeight: 800,
                                                fontVariantNumeric: 'tabular-nums',
                                                background:
                                                  m.punti > 0
                                                    ? 'rgba(22, 163, 74, 0.14)'
                                                    : m.punti < 0
                                                      ? 'rgba(220, 38, 38, 0.14)'
                                                      : 'rgba(148, 163, 184, 0.15)',
                                                color:
                                                  m.punti > 0
                                                    ? '#16a34a'
                                                    : m.punti < 0
                                                      ? '#dc2626'
                                                      : 'var(--text-muted)',
                                              }}
                                              title="Punti guadagnati nella classifica ranking FITeT"
                                            >
                                              {m.punti > 0
                                                ? `+${m.punti.toLocaleString('it-IT', { maximumFractionDigits: 1 })} pt`
                                                : `${m.punti.toLocaleString('it-IT', { maximumFractionDigits: 1 })} pt`}
                                            </span>
                                          )}


                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          {m.giornata !== undefined ? (
                                            <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                                              G{m.giornata}
                                            </span>
                                          ) : m.fase ? (
                                            <span className="badge badge-neutral" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                                              {m.fase}
                                            </span>
                                          ) : !hasRealDate && displayDate ? (
                                            <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                                              {displayDate}
                                            </span>
                                          ) : null}

                                          {m.giornata !== undefined && m.fase && m.fase.replace(/^G\.?\s*/i, '') !== String(m.giornata) && (
                                            <span className="badge badge-neutral" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                                              {m.fase}
                                            </span>
                                          )}

                                          {hasRealDate && (
                                            <span
                                              style={{
                                                fontSize: '11.5px',
                                                color: 'var(--text-muted)',
                                                fontVariantNumeric: 'tabular-nums',
                                                flexShrink: 0,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                              }}
                                            >
                                              <i className="bi bi-calendar3" style={{ fontSize: '10px', opacity: 0.75 }}></i>
                                              <span>{displayDate}</span>
                                            </span>
                                          )}
                                        </div>

                                      </div>

                                      {/* Middle Row: Opponent Name & Event Details */}
                                      <div style={{ marginBottom: '8px' }}>
                                        <div className="atleta-opponent-wrap">
                                          <button
                                            type="button"
                                            className="atleta-opponent-link"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const targetKey = m.avversarioId || m.avversario;
                                              if (onPreviewAthlete) {
                                                onPreviewAthlete(targetKey, m.avversario);
                                              } else if (onSelectAthlete) {
                                                onSelectAthlete(targetKey, m.avversario);
                                              }
                                            }}
                                            title={`Visualizza scheda rapida di ${m.avversario}`}
                                          >
                                            <span className="atleta-opponent-text">
                                              <AthleteAvatar
                                                atletaId={oppIdKey || m.avversarioId}
                                                nome={m.avversario}
                                                size={18}
                                              />
                                              <span>{m.avversario}</span>
                                            </span>
                                            <i className="bi bi-box-arrow-up-right atleta-opponent-icon"></i>
                                          </button>

                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setH2hOpponent({ id: m.avversarioId, name: m.avversario });
                                            }}
                                            title={`Visualizza Testa a Testa contro ${m.avversario}`}
                                            className="btn-h2h-inline"
                                          >
                                            <i className="bi bi-arrow-left-right" style={{ fontSize: '9px' }}></i>
                                            Dati e pronostico IA
                                          </button>
                                        </div>
                                      </div>

                                      {/* Bottom Row: Set Details and Prominent Numeric Score */}
                                      <div className="match-card-footer">
                                        {/* Left: Set partials as clean text without pill frames */}
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                          {m.sets && m.sets.length > 0 ? (
                                            <span
                                              className="match-sets-text"
                                              title={m.sets.join(', ')}
                                            >
                                              {m.sets.join(', ')}
                                            </span>
                                          ) : m.fase ? (
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                              Fase: <strong style={{ color: 'var(--text-main)' }}>{m.fase}</strong>
                                            </span>
                                          ) : (
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                              {m.tipo === 'campionato' ? 'Incontro Campionato' : 'Gara Ufficiale'}
                                            </span>
                                          )}
                                        </div>

                                        {/* Right: The big numeric outcome */}
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexShrink: 0 }}>
                                          {exactScore ? (
                                            <div
                                              className="match-score-big"
                                              style={{ color: m.isVittoria ? '#16a34a' : '#dc2626' }}
                                            >
                                              {exactScore}
                                            </div>
                                          ) : isFetchingScore ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.8 }}>
                                              <span
                                                className="spinner-border spinner-border-sm"
                                                role="status"
                                                aria-hidden="true"
                                                style={{ width: '12px', height: '12px', borderWidth: '2px', color: m.isVittoria ? '#16a34a' : '#dc2626' }}
                                              />
                                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Set...</span>
                                            </div>
                                          ) : m.punti !== undefined ? (
                                            <div
                                              style={{
                                                fontSize: '13.5px',
                                                fontWeight: '800',
                                                color: m.punti > 0 ? '#16a34a' : m.punti < 0 ? '#dc2626' : 'var(--text-muted)',
                                                fontVariantNumeric: 'tabular-nums',
                                              }}
                                            >
                                              {m.punti > 0 ? `+${m.punti}` : m.punti} pt
                                            </div>
                                          ) : (
                                            <div
                                              style={{
                                                fontSize: '14px',
                                                fontWeight: '800',
                                                color: 'var(--text-muted)',
                                                fontVariantNumeric: 'tabular-nums',
                                              }}
                                            >
                                              -
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="atleta-match-list-container">
                                {[...matchesToDisplay].reverse().map((m, idx) => {
                                  const matchDateNorm = normDate(m.data);
                                  const oppNameKey = (m.avversario || '').toUpperCase().trim();
                                  const oppIdKey = m.avversarioId || h2hOpponentIds[oppNameKey] || '';
                                  const h2hMatch =
                                    (oppIdKey && matchDateNorm ? h2hScores[`${oppIdKey}_${matchDateNorm}`] : null) ||
                                    (oppNameKey && matchDateNorm ? h2hScores[`${oppNameKey}_${matchDateNorm}`] : null) ||
                                    (oppIdKey ? h2hScores[oppIdKey] : null) ||
                                    (oppNameKey ? h2hScores[oppNameKey] : null);

                                  const exactScore = m.risultatoSet || h2hMatch?.punteggio;
                                  const isFetchingScore = !exactScore && Boolean((oppIdKey && loadingH2h[oppIdKey]) || (oppNameKey && loadingH2h[oppNameKey]));
                                  const displayDate =
                                    m.data && isRealDate(m.data)
                                      ? m.data
                                      : h2hMatch?.data || m.data;
                                  const hasRealDate = isRealDate(displayDate);

                                  return (
                                    <div
                                      key={m.id || idx}
                                      className="atleta-match-list-item atleta-match-list-row"
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: '1 1 180px' }}>
                                        <span className={`match-badge-outcome ${m.isVittoria ? 'is-win' : 'is-loss'}`}>
                                          {m.isVittoria ? 'VINTA' : 'PERSA'}
                                        </span>

                                        {m.giornata !== undefined ? (
                                          <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                                            G{m.giornata}
                                          </span>
                                        ) : m.fase ? (
                                          <span className="badge badge-neutral" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                                            {m.fase}
                                          </span>
                                        ) : !hasRealDate && displayDate ? (
                                          <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                                            {displayDate}
                                          </span>
                                        ) : null}

                                        {m.giornata !== undefined && m.fase && m.fase.replace(/^G\.?\s*/i, '') !== String(m.giornata) && (
                                          <span className="badge badge-neutral" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                                            {m.fase}
                                          </span>
                                        )}

                                        {m.punti !== undefined && (
                                          <span
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              padding: '2px 6px',
                                              borderRadius: '6px',
                                              fontSize: '10px',
                                              fontWeight: 800,
                                              fontVariantNumeric: 'tabular-nums',
                                              background:
                                                m.punti > 0
                                                  ? 'rgba(22, 163, 74, 0.14)'
                                                  : m.punti < 0
                                                    ? 'rgba(220, 38, 38, 0.14)'
                                                    : 'rgba(148, 163, 184, 0.15)',
                                              color:
                                                m.punti > 0
                                                  ? '#16a34a'
                                                  : m.punti < 0
                                                    ? '#dc2626'
                                                    : 'var(--text-muted)',
                                            }}
                                          >
                                            {m.punti > 0
                                              ? `+${m.punti.toLocaleString('it-IT', { maximumFractionDigits: 1 })} pt`
                                              : `${m.punti.toLocaleString('it-IT', { maximumFractionDigits: 1 })} pt`}
                                          </span>
                                        )}

                                        <div style={{ minWidth: 0 }}>
                                          <div className="atleta-list-opponent-wrap">
                                            <button
                                              type="button"
                                              className="atleta-opponent-link"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const targetKey = m.avversarioId || m.avversario;
                                                if (onPreviewAthlete) {
                                                  onPreviewAthlete(targetKey, m.avversario);
                                                } else if (onSelectAthlete) {
                                                  onSelectAthlete(targetKey, m.avversario);
                                                }
                                              }}
                                              title={`Visualizza scheda rapida di ${m.avversario}`}
                                            >
                                              <span className="atleta-opponent-text">vs {m.avversario}</span>
                                              <i className="bi bi-box-arrow-up-right atleta-opponent-icon"></i>
                                            </button>

                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setH2hOpponent({ id: m.avversarioId, name: m.avversario });
                                              }}
                                              title={`Visualizza Testa a Testa contro ${m.avversario}`}
                                              className="btn-h2h-inline"
                                            >
                                              <i className="bi bi-arrow-left-right" style={{ fontSize: '8.5px' }}></i>
                                              Storico Scontri
                                            </button>
                                          </div>
                                          <div
                                            className="match-event-title-scroll"
                                            style={{ maxWidth: '260px', fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}
                                            title={`${m.titolo}${m.sottotitolo ? ` • ${m.sottotitolo}` : ''}`}
                                          >
                                            <i className={`bi ${m.tipo === 'torneo' ? 'bi-award' : 'bi-trophy'} me-1`}></i>
                                            {m.titolo}
                                            {m.sottotitolo && ` • ${m.sottotitolo}`}
                                          </div>
                                        </div>
                                      </div>

                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {m.sets && m.sets.length > 0 && (
                                          <span
                                            style={{
                                              fontSize: '11px',
                                              color: 'var(--text-muted)',
                                              fontVariantNumeric: 'tabular-nums',
                                              letterSpacing: '0.02em',
                                            }}
                                            title={m.sets.join(', ')}
                                          >
                                            {m.sets.join(', ')}
                                          </span>
                                        )}

                                        {hasRealDate && (
                                          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                            {displayDate}
                                          </span>
                                        )}

                                        {/* Numeric Result */}
                                        <div style={{ minWidth: '40px', textAlign: 'right' }}>
                                          {exactScore ? (
                                            <span style={{ fontSize: '14px', fontWeight: '800', color: m.isVittoria ? '#16a34a' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                                              {exactScore}
                                            </span>
                                          ) : isFetchingScore ? (
                                            <span
                                              className="spinner-border spinner-border-sm"
                                              role="status"
                                              aria-hidden="true"
                                              style={{ width: '11px', height: '11px', borderWidth: '2px', color: m.isVittoria ? '#16a34a' : '#dc2626' }}
                                            />
                                          ) : m.punti !== undefined ? (
                                            <span style={{ fontSize: '12.5px', fontWeight: '800', color: m.punti > 0 ? '#16a34a' : m.punti < 0 ? '#dc2626' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                              {m.punti > 0 ? `+${m.punti}` : m.punti} pt
                                            </span>
                                          ) : (
                                            <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-muted)' }}>
                                              -
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Subtle note about federale ranking data format */}
                            {activeTabResolved === 'ranking' && (
                              <div className="ranking-federale-note">
                                <i className="bi bi-info-circle text-primary" style={{ flexShrink: 0 }}></i>
                                <span>
                                  <strong>Nota:</strong> Alcuni match potrebbero non essere stati ancora conteggiati ai fini del ranking.
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                {/* Historical Analytics (Sub-Tabs: Grafico vs Tabella) */}
                <div style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    {atleta.storicoClassifica.length > 0 && (
                      <div className="pill-switcher-container">
                        <button
                          type="button"
                          onClick={() => setAnalyticsTab('chart')}
                          className={`pill-switcher-btn ${analyticsTab === 'chart' ? 'active' : ''}`}
                        >
                          <i className="bi bi-graph-up me-1"></i>Grafico
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnalyticsTab('table')}
                          className={`pill-switcher-btn ${analyticsTab === 'table' ? 'active' : ''}`}
                        >
                          <i className="bi bi-table me-1"></i>Tabella ({atleta.storicoClassifica.length})
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{ minHeight: '260px' }}>
                    {analyticsTab === 'chart' ? (
                      <RatingChart data={atleta.storicoClassifica} athleteName={atleta.anagrafica.nome} hideTitle={true} />
                    ) : (
                      atleta.storicoClassifica.length > 0 && (
                        <div className="atleta-rating-table-wrap">
                          <div className="modal-ranking-grid">
                            <div className="grid-header-row">
                              <div className="grid-th text-center">Data Rilevazione</div>
                              <div className="grid-th text-center">Categoria</div>
                              <div className="grid-th text-center">Punti Classifica</div>
                              <div className="grid-th text-center">Posizione</div>
                            </div>
                            {[...atleta.storicoClassifica].reverse().map((s, idx) => (
                              <div key={idx} className="grid-data-row">
                                <div className="grid-cell text-center" style={{ color: 'var(--text-muted)' }}>{s.data}</div>
                                <div className="grid-cell text-center">
                                  <span className="badge badge-neutral">{s.categoria ? `${s.categoria}ª` : '-'}</span>
                                </div>
                                <div className="grid-cell text-center" style={{ fontWeight: '700', color: 'var(--color-primary-600)' }}>{s.punti} pt</div>
                                <div className="grid-cell text-center" style={{ color: 'var(--text-muted)' }}>{s.posizione ? `#${s.posizione.toLocaleString('it-IT')}` : '-'}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Bar in modal preview with "Mostra altri dati" button */}
        {isPreview && !notFound && !error && (
          <div className="halfatleta-footer-bar">
            <button
              type="button"
              className="btn-action"
              onClick={requestClose}
              style={{ padding: '7px 14px', fontSize: '13px' }}
            >
              Chiudi
            </button>
            <button
              type="button"
              className="halfatleta-btn-full"
              onClick={handleExpandToFull}
              disabled={loading && !atleta}
              title={`Carica la scheda completa di ${currentAthleteName}`}
            >
              <span>Mostra altri dati</span>
              <i className="bi bi-arrows-angle-expand"></i>
            </button>
          </div>
        )}
      </div>

      {/* Athlete Photo Zoom / Preview Modal */}
      {isPhotoZoomOpen && canOpenPhotoZoom && zoomPhotoSrc ? (
        <div
          className="athlete-photo-zoom-backdrop"
          onClick={(e) => {
            e.stopPropagation();
            closePhotoZoom();
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`Anteprima foto atleta ${atleta?.anagrafica?.nome || athleteName || ''}`}
        >
          <div className="athlete-photo-zoom-card" onClick={(e) => e.stopPropagation()}>
            <img
              src={zoomPhotoSrc}
              alt={atleta?.anagrafica?.nome || athleteName || ''}
              referrerPolicy="no-referrer"
              className="athlete-photo-zoom-img"
            />
            <button
              type="button"
              className="modal-close-btn athlete-photo-zoom-close"
              onClick={closePhotoZoom}
              title="Chiudi anteprima (ESC)"
              aria-label="Chiudi anteprima foto"
            >
              <i className="bi bi-x-lg"></i>
            </button>
          </div>
        </div>
      ) : null}

      {/* Modal Dettaglio Incontro */}
      {selectedMatchDetail && (
        <MatchDetailModal
          match={selectedMatchDetail}
          athleteId={currentAtletaId}
          athleteName={currentAthleteName}
          athletePhotoUrl={atleta?.anagrafica?.fotoUrl}
          athleteClub={atleta?.anagrafica?.societa}
          athleteRank={
            atleta?.storicoClassifica?.length
              ? (atleta.storicoClassifica[atleta.storicoClassifica.length - 1]?.posizione ?? undefined)
              : undefined
          }
          athletePoints={atleta?.anagrafica?.punti ?? atleta?.riepilogo?.punteggioFinale}
          athleteCategory={atleta?.anagrafica?.categoria}
          camId={camId ? parseInt(String(camId), 10) : atleta?.campionatoAttuale?.camId}
          playedChampionships={atleta?.campionatiGiocati}
          zIndex={(zIndex || 1200) + 5}
          isTopModal={isTopModal}
          onClose={() => setSelectedMatchDetail(null)}
          onOpenHeadToHead={(opp) => setH2hOpponent(opp)}
          onOpenOpponentProfile={(idOrName, name) => {
            if (onPreviewAthlete) {
              onPreviewAthlete(idOrName, name);
            } else if (onSelectAthlete) {
              onSelectAthlete(idOrName, name);
            }
          }}
          onNavigateToGiornata={onNavigateToGiornata}
        />
      )}

      {/* Modal Testa a Testa con l'avversario selezionato */}
      {h2hOpponent && (
        <HeadToHeadModal
          isOpen={true}
          atleta1Id={currentAtletaId}
          atleta1Nome={currentAthleteName}
          atleta2Id={h2hOpponent.id}
          atleta2Nome={h2hOpponent.name}
          onClose={() => setH2hOpponent(null)}
          onSelectAthlete={onSelectAthlete}
        />
      )}

      {/* Modal Card Grafica Instagram Stories (9:16) */}
      {isStoryModalOpen && atleta && (
        <AthleteStoryModal
          isOpen={isStoryModalOpen}
          onClose={() => setIsStoryModalOpen(false)}
          atleta={atleta}
          campionatoPartite={campionatoPartite}
          campionatoNome={campionatoNome || atleta.campionatoAttuale?.nome}
          viewsCount={viewsCount}
        />
      )}

      {/* Toast Feedback for Copy Link */}
      {showToast && (
        <div className="atleta-share-toast" role="status" aria-live="polite">
          <i className="bi bi-check-circle-fill text-success" style={{ fontSize: '15px' }}></i>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>,
    document.body
  );
};
