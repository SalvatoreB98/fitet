import React, { useState } from 'react';
import { StoricoRankingSnapshot } from '../types/fitet';

interface RatingChartProps {
  data: StoricoRankingSnapshot[];
  athleteName: string;
}

export const RatingChart: React.FC<RatingChartProps> = ({ data, athleteName }) => {
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    snapshot: StoricoRankingSnapshot;
  } | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="p-4 text-center text-muted border rounded bg-light">
        <i className="bi bi-graph-up me-2"></i>Nessuno storico posizioni disponibile per questo atleta.
      </div>
    );
  }

  // Dimensions
  const width = 720;
  const height = 230;
  const padding = { top: 20, right: 30, bottom: 40, left: 50 };

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Extents
  const points = data.map((d) => d.punti);
  const minPoints = Math.max(0, Math.min(...points) - 20);
  const maxPoints = Math.max(...points) + 30;
  const pointsRange = maxPoints - minPoints || 1;

  // Calculate coordinates
  const coords = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1 || 1)) * chartW;
    const y = padding.top + chartH - ((d.punti - minPoints) / pointsRange) * chartH;
    return { x, y, data: d };
  });

  // Construct SVG paths
  const pathD = coords.reduce((acc, curr, i) => {
    if (i === 0) return `M ${curr.x} ${curr.y}`;
    const prev = coords[i - 1];
    const cpx1 = prev.x + (curr.x - prev.x) / 2;
    const cpy1 = prev.y;
    const cpx2 = prev.x + (curr.x - prev.x) / 2;
    const cpy2 = curr.y;
    return `${acc} C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${curr.x} ${curr.y}`;
  }, '');

  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${padding.top + chartH} L ${coords[0].x} ${padding.top + chartH
    } Z`;

  // Grid ticks
  const yTicks = [
    minPoints,
    Math.round(minPoints + pointsRange * 0.33),
    Math.round(minPoints + pointsRange * 0.66),
    maxPoints,
  ];

  return (
    <div className="position-relative w-100">
      <div className="d-flex justify-content-between align-items-center mb-2 px-1">
        <span className="small text-secondary fw-bold text-uppercase tracking-wider">
          <i className="bi bi-graph-up-arrow me-1 text-primary"></i>Andamento Punti nel Tempo (Storico Federale)
        </span>
        <span className="badge bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle">
          {data.length} Rilevazioni
        </span>
      </div>

      <div className="position-relative overflow-visible rounded border border-secondary-subtle bg-body p-2 shadow-sm">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-100 h-auto"
          style={{ maxHeight: '240px', display: 'block' }}
        >
          <defs>
            <linearGradient id="chartGradientOfficial" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1b4d89" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#1b4d89" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {yTicks.map((tickVal, i) => {
            const y = padding.top + chartH - ((tickVal - minPoints) / pointsRange) * chartH;
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
                  fontSize="11"
                  textAnchor="end"
                  fontFamily="sans-serif"
                  fontWeight="500"
                >
                  {tickVal}
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
          <path d={areaD} fill="url(#chartGradientOfficial)" />

          {/* Curve Stroke */}
          <path
            d={pathD}
            fill="none"
            stroke="#1b4d89"
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
                stroke="#1b4d89"
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
                stroke="#1b4d89"
                strokeDasharray="2 2"
                strokeOpacity="0.5"
              />
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.y}
                r="6.5"
                fill="#1b4d89"
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
              minWidth: '140px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            <div className="fw-bold text-primary mb-1">
              <i className="bi bi-calendar3 me-1"></i>
              {hoveredPoint.snapshot.data}
            </div>
            <div className="d-flex justify-content-between">
              <span className="text-secondary">Punti:</span>
              <span className="fw-bold text-dark">{hoveredPoint.snapshot.punti} pt</span>
            </div>
            {hoveredPoint.snapshot.categoria && (
              <div className="d-flex justify-content-between">
                <span className="text-secondary">Categoria:</span>
                <span className="badge bg-secondary-subtle text-secondary-emphasis">
                  {hoveredPoint.snapshot.categoria}^
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
