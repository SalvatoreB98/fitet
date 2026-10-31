import React, { useMemo, useRef } from 'react';
import { TorneoItem } from '../types/fitet';
import { ITALY_MAP_VIEWBOX, ITALY_REGION_SHAPES } from '../data/italyGeo';
import {
  getRegionBbox,
  getRegionFilterKey,
  getTorneoPlace,
  regionMatches,
  TorneoPlace,
} from '../utils/torneoMap';
import './TorneiItalyMap.css';
import { isMobile } from '../utils/utils';

export interface TorneiRegionGroup {
  region: string;
  items: Array<{ torneo: TorneoItem; sectionTitle: string }>;
}

export interface TorneiMapSelection {
  region: string | null;
  placeKey: string | null;
  label: string | null;
}

export const EMPTY_MAP_SELECTION: TorneiMapSelection = {
  region: null,
  placeKey: null,
  label: null,
};

interface MapPlace extends TorneoPlace {
  items: Array<{ torneo: TorneoItem; sectionTitle: string }>;
  disputed: number;
  upcoming: number;
}

export interface TorneiItalyMapProps {
  groups: TorneiRegionGroup[];
  selection: TorneiMapSelection;
  onSelectionChange: (selection: TorneiMapSelection) => void;
  onShowList: () => void;
  focusRegion?: string | null;
  mapTitle?: string;
}

function buildPlaces(groups: TorneiRegionGroup[]): MapPlace[] {
  const map = new Map<string, MapPlace>();

  for (const group of groups) {
    for (const item of group.items) {
      const place = getTorneoPlace(item.torneo, group.region);
      let entry = map.get(place.key);

      if (!entry) {
        entry = {
          ...place,
          items: [],
          disputed: 0,
          upcoming: 0,
        };
        map.set(place.key, entry);
      }

      entry.items.push(item);
      if (item.torneo.status === 'disputato') entry.disputed += 1;
      else entry.upcoming += 1;
    }
  }

  return [...map.values()].sort((a, b) => a.y - b.y || a.label.localeCompare(b.label, 'it'));
}

export const TorneiItalyMap: React.FC<TorneiItalyMapProps> = ({
  groups,
  selection,
  onSelectionChange,
  onShowList,
  focusRegion,
  mapTitle,
}) => {
  const places = useMemo(() => buildPlaces(groups), [groups]);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const regionBbox = useMemo(
    () => (focusRegion ? getRegionBbox(focusRegion) : null),
    [focusRegion]
  );
  const effectiveViewBox = regionBbox || ITALY_MAP_VIEWBOX;
  const isSingleRegion = Boolean(regionBbox);

  const totalTornei = useMemo(
    () => places.reduce((total, place) => total + place.items.length, 0),
    [places]
  );

  const selectedPlace = useMemo(
    () => places.find((place) => place.key === selection.placeKey) || null,
    [places, selection.placeKey]
  );

  const selectedRegionKey = getRegionFilterKey(selection.region);
  const regionCount = useMemo(() => {
    if (!selection.region) return totalTornei;
    return places
      .filter((place) => regionMatches(place.region, selection.region))
      .reduce((total, place) => total + place.items.length, 0);
  }, [places, selection.region, totalTornei]);

  const hasTorneiByRegion = useMemo(() => {
    const keys = new Set<string>();
    for (const place of places) {
      keys.add(getRegionFilterKey(place.region));
    }
    return keys;
  }, [places]);

  const clearSelection = () => onSelectionChange(EMPTY_MAP_SELECTION);

  const handleRegionClick = (region: string) => {
    const isSameRegion = regionMatches(selection.region, region);
    if (isSameRegion && !selection.placeKey) {
      clearSelection();
      return;
    }
    onSelectionChange({ region, placeKey: null, label: region });
    if (isMobile()) {
      setTimeout(() => {
        window.scrollTo({ top: 700, behavior: 'smooth' });
      }, 300);
    }
  };

  const handlePlaceClick = (place: MapPlace) => {
    if (selection.placeKey === place.key) {
      clearSelection();
      return;
    }
    onSelectionChange({
      region: place.region,
      placeKey: place.key,
      label: place.label,
    });
  };

  /**
   * Su mobile i pallini sono piccoli: se il tap non cade esattamente su un
   * marker, selezioniamo comunque il più vicino entro una soglia generosa.
   * Su desktop la soglia è più stretta per non rubare i click alle regioni.
   */
  const handleSvgClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return;

    const target = event.target as Element | null;
    const isRegionClick = Boolean(target?.closest?.('.tornei-map-region'));

    // Le regioni gestiscono il click sul proprio path; per i marker usiamo
    // il rilevamento del punto più vicino, così anche i pallini piccoli
    // restano facili da toccare su mobile.
    if (isRegionClick) {
      return;
    }

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());

    const threshold = typeof window !== 'undefined' && window.innerWidth <= 980 ? 32 : 24;
    let nearest: MapPlace | null = null;
    let nearestDistanceSq = threshold * threshold;
    for (const place of places) {
      const dx = place.x - local.x;
      const dy = place.y - local.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= nearestDistanceSq) {
        nearest = place;
        nearestDistanceSq = distanceSq;
      }
    }

    if (nearest) handlePlaceClick(nearest);
  };

  return (
    <div className="tornei-map-card">
      <div className="tornei-map-header">
        <div>
          <div className="tornei-map-kicker">
            <i className="bi bi-map-fill"></i>
            Mappa interattiva
          </div>
          <h3 className="tornei-map-title">
            {mapTitle || (focusRegion ? `Tornei in ${focusRegion}` : 'Tornei in Italia')}
          </h3>
        </div>
        {selection.region && (
          <button type="button" className="tornei-map-reset" onClick={clearSelection}>
            <i className="bi bi-x-lg"></i>
            <span>Azzera</span>
          </button>
        )}
      </div>

      <div className="tornei-map-stats">
        <span>
          <strong>{places.length}</strong> località
        </span>
        <span className="tornei-map-stats-sep">•</span>
        <span>
          <strong>{totalTornei}</strong> tornei
        </span>
      </div>

      <div className="tornei-map-canvas">
        <svg
          ref={svgRef}
          className={`tornei-map-svg ${isSingleRegion ? 'is-single-region' : ''}`}
          viewBox={effectiveViewBox}
          role="img"
          aria-label={`Mappa con i tornei FITeT ${focusRegion ? `in ${focusRegion}` : "dell'Italia"}. Seleziona una località per filtrare l'elenco.`}
          onClick={handleSvgClick}
        >
          <g className="tornei-map-regions">
            {ITALY_REGION_SHAPES.map((shape) => {
              const hasTornei = hasTorneiByRegion.has(getRegionFilterKey(shape.canonicalName));
              const isSelected = Boolean(
                selectedRegionKey && selectedRegionKey === getRegionFilterKey(shape.canonicalName)
              );

              return (
                <path
                  key={shape.canonicalName}
                  d={shape.path}
                  fillRule="evenodd"
                  className={`tornei-map-region ${hasTornei ? 'has-tornei' : ''} ${isSelected ? 'is-selected' : ''
                    }`}
                  onClick={() => handleRegionClick(shape.canonicalName)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleRegionClick(shape.canonicalName);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Filtra i tornei in ${shape.canonicalName}`}
                >
                  <title>
                    {shape.canonicalName}
                    {hasTornei ? ' — tornei presenti' : ''}
                  </title>
                </path>
              );
            })}
          </g>

          <g className="tornei-map-markers">
            {places.map((place) => {
              const isSelected = selection.placeKey === place.key;
              const status =
                place.disputed > 0 && place.upcoming > 0
                  ? 'mixed'
                  : place.disputed > 0
                    ? 'disputed'
                    : 'upcoming';
              const radius = isSingleRegion
                ? (place.items.length > 1 ? 5.5 : 4.2)
                : (place.items.length > 1 ? 10.5 : 8.5);

              return (
                <g
                  key={place.key}
                  className={`tornei-map-marker is-${status} ${isSelected ? 'is-selected' : ''}`}
                  onClick={(event) => {
                    // I click reali passano dal rilevamento del marker più
                    // vicino sull'SVG; qui gestiamo solo l'attivazione da
                    // tastiera/screen reader (detail === 0).
                    if (event.detail === 0) {
                      event.stopPropagation();
                      handlePlaceClick(place);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handlePlaceClick(place);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Filtra i tornei a ${place.label} (${place.items.length})`}
                >
                  <circle
                    className="tornei-map-marker-hit"
                    cx={place.x}
                    cy={place.y}
                    r={isSingleRegion ? 12 : 22}
                  />
                  {isSelected && (
                    <circle
                      className="tornei-map-marker-pulse"
                      cx={place.x}
                      cy={place.y}
                      r={radius + (isSingleRegion ? 3.5 : 7)}
                    />
                  )}
                  <circle
                    className="tornei-map-marker-dot"
                    cx={place.x}
                    cy={place.y}
                    r={isSelected ? radius + (isSingleRegion ? 1 : 2) : radius}
                  />
                  {place.items.length > 1 && (
                    <text
                      className="tornei-map-marker-count"
                      x={place.x}
                      y={place.y}
                      dy="0.35em"
                      textAnchor="middle"
                    >
                      {place.items.length}
                    </text>
                  )}
                  <title>
                    {place.label} — {place.items.length}{' '}
                    {place.items.length === 1 ? 'torneo' : 'tornei'}
                  </title>
                </g>
              );
            })}
          </g>
        </svg>

        {places.length === 0 && (
          <div className="tornei-map-empty">
            <i className="bi bi-geo-alt"></i>
            <span>Nessun torneo da mostrare con i filtri attuali.</span>
          </div>
        )}
      </div>

      <div className="tornei-map-legend">
        <span>
          <i className="tornei-map-legend-dot is-disputed"></i> Risultati
        </span>
        <span>
          <i className="tornei-map-legend-dot is-upcoming"></i> In programma
        </span>
        <span>
          <i className="tornei-map-legend-dot is-mixed"></i> Entrambi
        </span>
      </div>
    </div>
  );
};
