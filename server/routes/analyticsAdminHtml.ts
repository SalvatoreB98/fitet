/**
 * Restituisce l'HTML completo della dashboard /admin/analytics
 * con Chart.js + visualizzazione interattiva del flusso di click utenti.
 */
export function renderAnalyticsAdminHtml(): string {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Analytics GDPR | Portale Risultati FITeT</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
  <style>
    :root {
      --bg: #0b1120;
      --surface: #111827;
      --surface-2: #1a2335;
      --border: #263248;
      --text: #f1f5f9;
      --muted: #94a3b8;
      --primary: #3b82f6;
      --accent: #10b981;
      --amber: #f59e0b;
      --purple: #a855f7;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: radial-gradient(circle at top right, #172554 0%, var(--bg) 45%);
      color: var(--text);
      min-height: 100vh;
      padding: 24px 16px 48px;
    }
    .container {
      max-width: 1280px;
      margin: 0 auto;
    }
    .topbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 24px;
    }
    .title-wrap h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .gdpr-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.14);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.35);
    }
    .subtitle {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 0.875rem;
    }
    .controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .range-btn {
      background: var(--surface);
      color: var(--muted);
      border: 1px solid var(--border);
      padding: 8px 14px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .range-btn:hover {
      border-color: var(--primary);
      color: var(--text);
    }
    .range-btn.active {
      background: var(--primary);
      border-color: var(--primary);
      color: #fff;
      box-shadow: 0 4px 16px rgba(59, 130, 246, 0.35);
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 14px;
      margin-bottom: 22px;
    }
    .kpi-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px 18px;
    }
    .kpi-label {
      color: var(--muted);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }
    .kpi-value {
      font-size: 1.85rem;
      font-weight: 700;
      margin: 6px 0 4px;
      line-height: 1.1;
    }
    .kpi-sub {
      color: var(--muted);
      font-size: 0.8rem;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
      margin-bottom: 20px;
    }
    @media (max-width: 960px) {
      .grid-2 { grid-template-columns: 1fr; }
    }
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 18px 20px;
      margin-bottom: 20px;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 14px;
    }
    .panel-title {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }
    .panel-desc {
      color: var(--muted);
      font-size: 0.8rem;
    }
    .chart-box {
      position: relative;
      height: 300px;
      width: 100%;
    }
    .chart-box-tall {
      position: relative;
      height: 340px;
      width: 100%;
    }
    .flow-layout {
      display: grid;
      grid-template-columns: 1.35fr 1fr;
      gap: 18px;
      align-items: start;
    }
    @media (max-width: 1024px) {
      .flow-layout { grid-template-columns: 1fr; }
    }
    .sankey-wrap {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
      overflow-x: auto;
    }
    .sankey-svg {
      width: 100%;
      min-width: 560px;
      display: block;
    }
    .flow-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 430px;
      overflow-y: auto;
      padding-right: 4px;
    }
    .flow-item {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
    }
    .flow-item-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 6px;
    }
    .flow-route {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      word-break: break-word;
    }
    .node-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.78rem;
      background: rgba(59, 130, 246, 0.16);
      color: #93c5fd;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .node-pill.dest {
      background: rgba(16, 185, 129, 0.16);
      color: #6ee7b7;
      border-color: rgba(16, 185, 129, 0.3);
    }
    .flow-bar-bg {
      height: 6px;
      background: rgba(148, 163, 184, 0.15);
      border-radius: 999px;
      overflow: hidden;
    }
    .flow-bar-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--primary), var(--accent));
    }
    .journey-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 10px;
    }
    .journey-card {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .journey-steps {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 0.8rem;
    }
    .journey-step {
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(168, 85, 247, 0.16);
      border: 1px solid rgba(168, 85, 247, 0.35);
      color: #e9d5ff;
      font-weight: 500;
    }
    .empty-state {
      text-align: center;
      padding: 36px 16px;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .warn-banner {
      background: rgba(245, 158, 11, 0.14);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: #fcd34d;
      padding: 12px 16px;
      border-radius: 12px;
      margin-bottom: 18px;
      font-size: 0.875rem;
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="topbar">
      <div class="title-wrap">
        <h1>
          Analytics Portale FITeT
          <span class="gdpr-badge">GDPR-Compliant • Zero Cookie / Zero IP</span>
        </h1>
        <p class="subtitle" id="periodLabel">Caricamento statistiche...</p>
      </div>
      <div class="controls">
        <button class="range-btn" data-days="7" id="btn7">Ultimi 7 giorni</button>
        <button class="range-btn active" data-days="30" id="btn30">Ultimi 30 giorni</button>
        <button class="range-btn" id="btnRefresh">Aggiorna</button>
      </div>
    </div>

    <div class="warn-banner" id="configWarn"></div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Visitatori Unici</div>
        <div class="kpi-value" id="kpiVisitors">-</div>
        <div class="kpi-sub" id="kpiVisitorsAvg">-</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Visualizzazioni Pagina</div>
        <div class="kpi-value" id="kpiPages">-</div>
        <div class="kpi-sub" id="kpiPagesAvg">-</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Click &amp; Interazioni</div>
        <div class="kpi-value" id="kpiClicks">-</div>
        <div class="kpi-sub" id="kpiClicksAvg">-</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Transizioni Flusso</div>
        <div class="kpi-value" id="kpiFlows">-</div>
        <div class="kpi-sub">Passaggi diretti Da → A</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Giorno di Picco</div>
        <div class="kpi-value" id="kpiPeak">-</div>
        <div class="kpi-sub" id="kpiPeakDate">-</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h2 class="panel-title">Andamento Giornaliero (Visitatori, Pagine &amp; Click)</h2>
        <span class="panel-desc">Aggregazione giornaliera anonima su Supabase</span>
      </div>
      <div class="chart-box">
        <canvas id="trendChart"></canvas>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Pagine Più Visitate</h2>
          <span class="panel-desc">type = 'page'</span>
        </div>
        <div class="chart-box-tall">
          <canvas id="pagesChart"></canvas>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Pulsanti &amp; Azioni Più Cliccate</h2>
          <span class="panel-desc">type = 'click'</span>
        </div>
        <div class="chart-box-tall">
          <canvas id="clicksChart"></canvas>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">Flusso di Click degli Utenti (Da → A)</h2>
          <span class="panel-desc">Mappa delle transizioni reali tra viste, tab e pulsanti senza tracciamento individuale</span>
        </div>
      </div>
      <div class="flow-layout">
        <div class="sankey-wrap" id="flowGraphContainer">
          <div class="empty-state">Nessuna transizione di flusso registrata nel periodo.</div>
        </div>
        <div class="flow-list" id="flowListContainer"></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">Percorsi Sequenziali Principali</h2>
          <span class="panel-desc">Catene di navigazione più frequenti ricostruite dalle transizioni aggregate</span>
        </div>
      </div>
      <div class="journey-grid" id="journeysContainer">
        <div class="empty-state">Nessun percorso disponibile.</div>
      </div>
    </div>
  </div>

  <script>
    let currentDays = 30;
    let trendChart = null;
    let pagesChart = null;
    let clicksChart = null;

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function formatShortDate(iso) {
      const parts = String(iso || '').split('-');
      return parts.length === 3 ? parts[2] + '/' + parts[1] : iso;
    }

    function renderTrendChart(series) {
      const ctx = document.getElementById('trendChart');
      if (trendChart) trendChart.destroy();

      trendChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: series.map((d) => formatShortDate(d.date)),
          datasets: [
            {
              label: 'Visitatori Unici',
              data: series.map((d) => d.visitors || 0),
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245, 158, 11, 0.14)',
              fill: true,
              tension: 0.32,
              borderWidth: 2.5,
              pointRadius: 3,
            },
            {
              label: 'Pagine Viste',
              data: series.map((d) => d.pages),
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.16)',
              fill: true,
              tension: 0.32,
              borderWidth: 2.5,
              pointRadius: 3,
            },
            {
              label: 'Click Utenti',
              data: series.map((d) => d.clicks),
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.14)',
              fill: true,
              tension: 0.32,
              borderWidth: 2.5,
              pointRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: '#cbd5e1' } },
          },
          scales: {
            x: {
              ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true },
              grid: { color: 'rgba(148, 163, 184, 0.1)' },
            },
            y: {
              beginAtZero: true,
              ticks: { color: '#94a3b8', precision: 0 },
              grid: { color: 'rgba(148, 163, 184, 0.1)' },
            },
          },
        },
      });
    }

    function renderHorizontalBar(canvasId, prevChart, items, label, color) {
      const ctx = document.getElementById(canvasId);
      if (prevChart) prevChart.destroy();

      const top = (items || []).slice(0, 10);
      return new Chart(ctx, {
        type: 'bar',
        data: {
          labels: top.map((i) => i.target.length > 34 ? i.target.slice(0, 33) + '…' : i.target),
          datasets: [
            {
              label,
              data: top.map((i) => i.count),
              backgroundColor: color,
              borderRadius: 6,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { color: '#94a3b8', precision: 0 },
              grid: { color: 'rgba(148, 163, 184, 0.1)' },
            },
            y: {
              ticks: { color: '#e2e8f0', font: { size: 11 } },
              grid: { display: false },
            },
          },
        },
      });
    }

    function renderClickFlowSvg(edges) {
      const container = document.getElementById('flowGraphContainer');
      if (!edges || edges.length === 0) {
        container.innerHTML = '<div class="empty-state">Nessuna transizione di flusso registrata nel periodo.</div>';
        return;
      }

      const topEdges = edges.slice(0, 14);
      const leftTotals = new Map();
      const rightTotals = new Map();
      for (const e of topEdges) {
        leftTotals.set(e.from, (leftTotals.get(e.from) || 0) + e.count);
        rightTotals.set(e.to, (rightTotals.get(e.to) || 0) + e.count);
      }

      const leftNodes = Array.from(leftTotals.entries()).sort((a, b) => b[1] - a[1]);
      const rightNodes = Array.from(rightTotals.entries()).sort((a, b) => b[1] - a[1]);

      const maxRows = Math.max(leftNodes.length, rightNodes.length, 1);
      const rowHeight = 44;
      const paddingY = 24;
      const svgHeight = Math.max(240, maxRows * rowHeight + paddingY * 2);
      const svgWidth = 640;
      const leftX = 12;
      const boxW = 190;
      const rightX = svgWidth - boxW - 12;
      const maxEdgeCount = Math.max(...topEdges.map((e) => e.count), 1);

      const leftYMap = new Map();
      leftNodes.forEach(([name], idx) => {
        const step = (svgHeight - paddingY * 2) / Math.max(leftNodes.length, 1);
        leftYMap.set(name, paddingY + step * idx + step / 2);
      });

      const rightYMap = new Map();
      rightNodes.forEach(([name], idx) => {
        const step = (svgHeight - paddingY * 2) / Math.max(rightNodes.length, 1);
        rightYMap.set(name, paddingY + step * idx + step / 2);
      });

      let pathsSvg = '';
      for (const e of topEdges) {
        const y1 = leftYMap.get(e.from);
        const y2 = rightYMap.get(e.to);
        const x1 = leftX + boxW;
        const x2 = rightX;
        const cx1 = x1 + (x2 - x1) * 0.45;
        const cx2 = x2 - (x2 - x1) * 0.45;
        const strokeW = Math.max(2, Math.round((e.count / maxEdgeCount) * 14));
        const opacity = (0.28 + (e.count / maxEdgeCount) * 0.62).toFixed(2);
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        pathsSvg += '<path d="M ' + x1 + ' ' + y1 + ' C ' + cx1 + ' ' + y1 + ', ' + cx2 + ' ' + y2 + ', ' + x2 + ' ' + y2 + '" fill="none" stroke="url(#flowGrad)" stroke-width="' + strokeW + '" stroke-opacity="' + opacity + '" stroke-linecap="round"><title>' + escapeHtml(e.from + ' → ' + e.to + ': ' + e.count + ' (' + e.shareFromSource + '%)') + '</title></path>';
        pathsSvg += '<rect x="' + (midX - 18) + '" y="' + (midY - 9) + '" width="36" height="18" rx="9" fill="#0f172a" stroke="#334155" stroke-width="1" />';
        pathsSvg += '<text x="' + midX + '" y="' + (midY + 4) + '" text-anchor="middle" fill="#e2e8f0" font-size="10" font-weight="700">' + e.count + '</text>';
      }

      let nodesSvg = '';
      leftNodes.forEach(([name, count]) => {
        const y = leftYMap.get(name);
        const label = name.length > 22 ? name.slice(0, 21) + '…' : name;
        nodesSvg += '<rect x="' + leftX + '" y="' + (y - 14) + '" width="' + boxW + '" height="28" rx="8" fill="#1e293b" stroke="#3b82f6" stroke-opacity="0.6" />';
        nodesSvg += '<text x="' + (leftX + 10) + '" y="' + (y + 4) + '" fill="#dbeafe" font-size="11" font-weight="600">' + escapeHtml(label) + '</text>';
        nodesSvg += '<text x="' + (leftX + boxW - 8) + '" y="' + (y + 4) + '" text-anchor="end" fill="#93c5fd" font-size="10" font-weight="700">' + count + '</text>';
      });

      rightNodes.forEach(([name, count]) => {
        const y = rightYMap.get(name);
        const label = name.length > 22 ? name.slice(0, 21) + '…' : name;
        nodesSvg += '<rect x="' + rightX + '" y="' + (y - 14) + '" width="' + boxW + '" height="28" rx="8" fill="#1e293b" stroke="#10b981" stroke-opacity="0.6" />';
        nodesSvg += '<text x="' + (rightX + 10) + '" y="' + (y + 4) + '" fill="#d1fae5" font-size="11" font-weight="600">' + escapeHtml(label) + '</text>';
        nodesSvg += '<text x="' + (rightX + boxW - 8) + '" y="' + (y + 4) + '" text-anchor="end" fill="#6ee7b7" font-size="10" font-weight="700">' + count + '</text>';
      });

      container.innerHTML =
        '<svg class="sankey-svg" viewBox="0 0 ' + svgWidth + ' ' + svgHeight + '">' +
          '<defs>' +
            '<linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">' +
              '<stop offset="0%" stop-color="#3b82f6" />' +
              '<stop offset="100%" stop-color="#10b981" />' +
            '</linearGradient>' +
          '</defs>' +
          pathsSvg +
          nodesSvg +
        '</svg>';
    }

    function renderFlowList(edges) {
      const container = document.getElementById('flowListContainer');
      if (!edges || edges.length === 0) {
        container.innerHTML = '<div class="empty-state">Nessun flusso da mostrare.</div>';
        return;
      }

      const maxCount = Math.max(...edges.map((e) => e.count), 1);
      container.innerHTML = edges.slice(0, 15).map((e) => {
        const pct = Math.max(4, Math.round((e.count / maxCount) * 100));
        return (
          '<div class="flow-item">' +
            '<div class="flow-item-top">' +
              '<div class="flow-route">' +
                '<span class="node-pill">' + escapeHtml(e.from) + '</span>' +
                '<span>→</span>' +
                '<span class="node-pill dest">' + escapeHtml(e.to) + '</span>' +
              '</div>' +
              '<span>' + e.count + ' (' + e.shareFromSource + '%)</span>' +
            '</div>' +
            '<div class="flow-bar-bg"><div class="flow-bar-fill" style="width:' + pct + '%"></div></div>' +
          '</div>'
        );
      }).join('');
    }

    function renderJourneys(paths) {
      const container = document.getElementById('journeysContainer');
      if (!paths || paths.length === 0) {
        container.innerHTML = '<div class="empty-state">I percorsi multi-step appariranno man mano che gli utenti cliccano nell\\'app.</div>';
        return;
      }

      container.innerHTML = paths.map((p) => {
        const stepsHtml = p.steps.map((s) => '<span class="journey-step">' + escapeHtml(s) + '</span>').join('<span>→</span>');
        return (
          '<div class="journey-card">' +
            '<div class="journey-steps">' + stepsHtml + '</div>' +
            '<div class="kpi-sub">Frequenza minima lungo la catena: <strong>' + p.estimatedCount + '</strong> passaggi</div>' +
          '</div>'
        );
      }).join('');
    }

    async function loadAnalytics(days) {
      currentDays = days;
      document.getElementById('btn7').classList.toggle('active', days === 7);
      document.getElementById('btn30').classList.toggle('active', days === 30);

      try {
        const res = await fetch('/api/analytics?days=' + days, { cache: 'no-store' });
        if (!res.ok) {
          let detail = 'HTTP ' + res.status;
          try {
            const errJson = await res.json();
            if (errJson && errJson.error) detail += ' - ' + errJson.error;
          } catch (_) {}
          throw new Error(detail);
        }
        const data = await res.json();

        const warnEl = document.getElementById('configWarn');
        if (!data.configured) {
          warnEl.style.display = 'block';
          warnEl.textContent = 'Modalità fallback in memoria: configura SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY e applica supabase/daily_analytics.sql per la persistenza su Postgres.';
        } else {
          warnEl.style.display = 'none';
        }

        document.getElementById('periodLabel').textContent =
          'Finestra: ' + data.startDate + ' → ' + data.endDate + ' (' + data.rangeDays + ' giorni)';

        document.getElementById('kpiVisitors').textContent = (data.totals.visitors || 0).toLocaleString('it-IT');
        document.getElementById('kpiVisitorsAvg').textContent = (data.totals.avgVisitorsPerDay || 0) + ' / giorno in media';
        document.getElementById('kpiPages').textContent = data.totals.pages.toLocaleString('it-IT');
        document.getElementById('kpiPagesAvg').textContent = data.totals.avgPagesPerDay + ' / giorno in media';
        document.getElementById('kpiClicks').textContent = data.totals.clicks.toLocaleString('it-IT');
        document.getElementById('kpiClicksAvg').textContent = data.totals.avgClicksPerDay + ' / giorno in media';
        document.getElementById('kpiFlows').textContent = data.totals.flows.toLocaleString('it-IT');

        if (data.totals.peakDay) {
          document.getElementById('kpiPeak').textContent = data.totals.peakDay.total.toLocaleString('it-IT');
          document.getElementById('kpiPeakDate').textContent = 'Data: ' + data.totals.peakDay.date;
        } else {
          document.getElementById('kpiPeak').textContent = '0';
          document.getElementById('kpiPeakDate').textContent = 'Nessuna attività nel periodo';
        }

        renderTrendChart(data.dailySeries || []);
        pagesChart = renderHorizontalBar('pagesChart', pagesChart, data.topPages, 'Visualizzazioni', 'rgba(59, 130, 246, 0.8)');
        clicksChart = renderHorizontalBar('clicksChart', clicksChart, data.topClicks, 'Click', 'rgba(16, 185, 129, 0.8)');
        renderClickFlowSvg(data.clickFlows || []);
        renderFlowList(data.clickFlows || []);
        renderJourneys(data.topPaths || []);
      } catch (err) {
        document.getElementById('periodLabel').textContent = 'Errore nel caricamento dei dati: ' + err.message;
      }
    }

    document.getElementById('btn7').addEventListener('click', () => loadAnalytics(7));
    document.getElementById('btn30').addEventListener('click', () => loadAnalytics(30));
    document.getElementById('btnRefresh').addEventListener('click', () => loadAnalytics(currentDays));

    loadAnalytics(30);
  </script>
</body>
</html>`;
}

