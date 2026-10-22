import React, { useState } from 'react';
import { StoricoRankingSnapshot } from '../types/fitet';

interface RatingChartProps {
  data: StoricoRankingSnapshot[];
  athleteName: string;
  hideTitle?: boolean;
}

interface SingleChartProps {
  data: StoricoRankingSnapshot[];
  metric: 'posizione' | 'punti';
  height?: number;
}

const SingleChart: React.FC<SingleChartProps> = ({ data, metric, height = 220 }) => {
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    snapshot: StoricoRankingSnapshot;
  } | null>(null);

  const activeData = metric === 'posizione'
    ? data.filter((d) => d.posizione !== null && d.posizione > 0)
    : data;

  if (activeData.length === 0) {
    return (
      <div className="p-3 text-center text-muted border rounded" style={{ background: 'var(--bg-th)', fontSize: '13px' }}>
        <i className="bi bi-info-circle me-2"></i>Nessun dato di {metric === 'posizione' ? 'posizione' : 'punti'} disponibile.
      </div>
    );
  }

  const width = 720;
  const padding = { top: 20, right: 30, bottom: 40, left: 56 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  let yTicks: number[] = [];
  let coords: Array<{ x: number; y: number; data: StoricoRankingSnapshot }> = [];

  if (metric === 'posizione') {
    const positions = activeData.map((d) => d.posizione as number);
    const minPos = Math.min(...positions);
    const maxPos = Math.max(...positions);
    const posRange = maxPos - minPos || 1;

    const displayMin = Math.max(1, Math.floor(minPos - posRange * 0.08));
    const displayMax = Math.ceil(maxPos + posRange * 0.08);
    const displayRange = displayMax - displayMin || 1;

    coords = activeData.map((d, i) => {
      const x = padding.left + (i / (activeData.length - 1 || 1)) * chartW;
      const y = padding.top + (((d.posizione as number) - displayMin) / displayRange) * chartH;
      return { x, y, data: d };
    });

    yTicks = [
      displayMin,
      Math.round(displayMin + displayRange * 0.33),
      Math.round(displayMin + displayRange * 0.66),
      displayMax,
    ];
  } else {
    const points = activeData.map((d) => d.punti);
    const minPoints = Math.max(0, Math.min(...points) - 20);
    const maxPoints = Math.max(...points) + 30;
    const pointsRange = maxPoints - minPoints || 1;

    coords = activeData.map((d, i) => {
      const x = padding.left + (i / (activeData.length - 1 || 1)) * chartW;
      const y = padding.top + chartH - ((d.punti - minPoints) / pointsRange) * chartH;
      return { x, y, data: d };
    });

    yTicks = [
      minPoints,
      Math.round(minPoints + pointsRange * 0.33),
      Math.round(minPoints + pointsRange * 0.66),
      maxPoints,
    ];
  }

  const pathD = coords.reduce((acc, curr, i) => {
    if (i === 0) return `M ${curr.x} ${curr.y}`;
    const prev = coords[i - 1];
    const cpx1 = prev.x + (curr.x - prev.x) / 2;
    const cpy1 = prev.y;
    const cpx2 = prev.x + (curr.x - prev.x) / 2;
    const cpy2 = curr.y;
    return `${acc} C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${curr.x} ${curr.y}`;
  }, '');

  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${padding.top + chartH} L ${coords[0].x} ${padding.top + chartH} Z`;

  const primaryColor = metric === 'posizione' ? '#0284c7' : '#1b4d89';
  const gradientId = metric === 'posizione' ? 'chartGradientPosizione' : 'chartGradientPunti';

  return (
    <div className="position-relative overflow-visible p-2 mb-3 rating-chart-box">
      <div className="d-flex justify-content-between align-items-center mb-1 px-1">
        <span className="small fw-bold text-uppercase" style={{ color: primaryColor, fontSize: '11px', letterSpacing: '0.04em' }}>
          {metric === 'posizione' ? (
            <>
              <i className="bi bi-trophy me-1"></i>Grafico Posizione Classifica
            </>
          ) : (
            <>
              <i className="bi bi-graph-up-arrow me-1"></i>Grafico Punti Ranking
            </>
          )}
        </span>
        <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
          {activeData.length} Rilevazioni
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-100 h-auto"
        style={{ maxHeight: `${height + 10}px`, display: 'block' }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={primaryColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((tickVal, i) => {
          let y = padding.top;
          if (metric === 'posizione') {
            const displayMin = yTicks[0];
            const displayMax = yTicks[yTicks.length - 1];
            const displayRange = displayMax - displayMin || 1;
            y = padding.top + ((tickVal - displayMin) / displayRange) * chartH;
          } else {
            const minPoints = yTicks[0];
            const maxPoints = yTicks[yTicks.length - 1];
            const pointsRange = maxPoints - minPoints || 1;
            y = padding.top + chartH - ((tickVal - minPoints) / pointsRange) * chartH;
          }

          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray="4 4"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                fill="#64748b"
                fontSize="10"
                textAnchor="end"
                fontFamily="sans-serif"
                fontWeight="600"
              >
                {metric === 'posizione' ? `#${tickVal.toLocaleString('it-IT')}` : `${tickVal} pt`}
              </text>
            </g>
          );
        })}

        {/* X Axis dates */}
        {coords.map((c, i) => {
          const isFirst = i === 0;
          const isLast = i === coords.length - 1;
          const isMid = i === Math.floor(coords.length / 2);
          if (!isFirst && !isLast && !isMid) return null;

          return (
            <text
              key={i}
              x={c.x}
              y={padding.top + chartH + 18}
              fill="#64748b"
              fontSize="11"
              textAnchor="middle"
              fontFamily="sans-serif"
              fontWeight="500"
            >
              {c.data.data}
            </text>
          );
        })}

        {/* Area Fill */}
        <path d={areaD} fill={`url(#${gradientId})`} />

        {/* Curve Stroke */}
        <path
          d={pathD}
          fill="none"
          stroke={primaryColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Interactive Data Dots */}
        {coords.map((c, i) => (
          <g
            key={i}
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHoveredPoint({ x: c.x, y: c.y, snapshot: c.data })}
            onMouseLeave={() => setHoveredPoint(null)}
          >
            <circle cx={c.x} cy={c.y} r="12" fill="transparent" />
            <circle
              cx={c.x}
              cy={c.y}
              r="4"
              fill="#ffffff"
              stroke={primaryColor}
              strokeWidth="2.5"
            />
          </g>
        ))}

        {/* Active Highlight Marker */}
        {hoveredPoint && (
          <g pointerEvents="none">
            <line
              x1={hoveredPoint.x}
              y1={padding.top}
              x2={hoveredPoint.x}
              y2={padding.top + chartH}
              stroke={primaryColor}
              strokeDasharray="2 2"
              strokeOpacity="0.5"
            />
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r="6.5"
              fill={primaryColor}
              stroke="#ffffff"
              strokeWidth="2.5"
            />
          </g>
        )}
      </svg>

      {/* Floating Tooltip */}
      {hoveredPoint && (
        <div
          className="position-absolute bg-white text-dark p-2 rounded shadow-sm border border-primary-subtle small"
          style={{
            left: `${(hoveredPoint.x / width) * 90}%`,
            top: `${(hoveredPoint.y / height) * 100}%`,
            transform: 'translate(-50%, -125%)',
            pointerEvents: 'none',
            zIndex: 100,
            minWidth: '150px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <div className="fw-bold text-primary mb-1">
            <i className="bi bi-calendar3 me-1"></i>
            {hoveredPoint.snapshot.data}
          </div>
          {hoveredPoint.snapshot.posizione && (
            <div className="d-flex justify-content-between mb-1">
              <span className="text-secondary">Posizione:</span>
              <span className="fw-bold text-primary">#{hoveredPoint.snapshot.posizione.toLocaleString('it-IT')}</span>
            </div>
          )}
          <div className="d-flex justify-content-between">
            <span className="text-secondary">Punti:</span>
            <span className="fw-bold text-dark">{hoveredPoint.snapshot.punti} pt</span>
          </div>
          {hoveredPoint.snapshot.categoria && (
            <div className="d-flex justify-content-between mt-1">
              <span className="text-secondary">Categoria:</span>
              <span className="badge bg-secondary-subtle text-secondary-emphasis">
                {hoveredPoint.snapshot.categoria}^
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const RatingChart: React.FC<RatingChartProps> = ({ data, athleteName, hideTitle }) => {
  const hasPositions = data.some((d) => d.posizione !== null && d.posizione > 0);
  const [metric, setMetric] = useState<'posizione' | 'punti' | 'entrambi'>(hasPositions ? 'posizione' : 'punti');

  if (!data || data.length === 0) {
    return (
      <div className="p-4 text-center text-muted border rounded bg-light">
        <i className="bi bi-graph-up me-2"></i>Nessuno storico posizioni disponibile per questo atleta.
      </div>
    );
  }

  return (
    <div className="position-relative w-100">
      <div className={`d-flex ${hideTitle ? 'justify-content-end' : 'justify-content-between'} align-items-center mb-2 px-1 flex-wrap gap-2`}>
        {!hideTitle && (
          <div className="d-flex align-items-center gap-2">
            <span className="small text-secondary fw-bold text-uppercase tracking-wider">
              <i className="bi bi-activity me-1 text-primary"></i>Andamento Storico Federale
            </span>
          </div>
        )}

        {/* Metric Selector Buttons */}
        {hasPositions && (
          <div style={{ display: 'inline-flex', gap: '3px', background: 'var(--bg-th)', padding: '3px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <button
              type="button"
              className={`btn-chart-toggle ${metric === 'posizione' ? 'is-active' : ''}`}
              onClick={() => setMetric('posizione')}
              title="Visualizza solo grafico posizione in classifica"
            >
              <i className="bi bi-trophy me-1"></i>Posizione
            </button>
            <button
              type="button"
              className={`btn-chart-toggle ${metric === 'punti' ? 'is-active' : ''}`}
              onClick={() => setMetric('punti')}
              title="Visualizza solo grafico punti ranking"
            >
              <i className="bi bi-graph-up me-1"></i>Punti
            </button>
            <button
              type="button"
              className={`btn-chart-toggle ${metric === 'entrambi' ? 'is-active' : ''}`}
              onClick={() => setMetric('entrambi')}
              title="Visualizza entrambi i grafici (posizione e punti)"
            >
              <i className="bi bi-layers me-1"></i>Entrambi
            </button>
          </div>
        )}
      </div>

      {metric === 'entrambi' ? (
        <>
          <SingleChart data={data} metric="posizione" height={210} />
          <SingleChart data={data} metric="punti" height={210} />
        </>
      ) : (
        <SingleChart data={data} metric={metric} height={230} />
      )}
    </div>
  );
};
