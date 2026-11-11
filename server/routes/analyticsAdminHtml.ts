/**
 * Restituisce l'HTML completo della dashboard /admin/analytics
 * con stile minimale ispirato a Vercel Web Analytics.
 */
export function renderAnalyticsAdminHtml(): string {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Analytics | Portale Risultati FITeT</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
  <style>
    :root {
      --bg: #000000;
      --surface: #0a0a0a;
      --surface-hover: #141414;
      --border: #242424;
      --border-strong: #333333;
      --text: #ededed;
      --muted: #888888;
      --blue: #0070f3;
      --blue-soft: rgba(0, 112, 243, 0.18);
      --green-bg: rgba(16, 185, 129, 0.15);
      --green-text: #34d399;
      --bar-fill: rgba(255, 255, 255, 0.065);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding: 24px 16px 48px;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 1180px;
      margin: 0 auto;
    }
    .topbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 18px;
    }
    .title-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .title-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .title-row h1 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .gdpr-badge {
      display: inline-flex;
      align-items: center;
      font-size: 0.72rem;
      font-weight: 500;
      padding: 3px 9px;
      border-radius: 999px;
      background: var(--green-bg);
      color: var(--green-text);
      border: 1px solid rgba(52, 211, 153, 0.25);
    }
    .subtitle {
      margin: 0;
      color: var(--muted);
      font-size: 0.8rem;
    }
    .controls {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .range-btn {
      background: var(--surface);
      color: var(--muted);
      border: 1px solid var(--border);
      padding: 7px 12px;
      border-radius: 8px;
      font-weight: 500;
      font-size: 0.8rem;
      cursor: pointer;
      transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
    }
    .range-btn:hover {
      border-color: var(--border-strong);
      color: var(--text);
      background: var(--surface-hover);
    }
    .range-btn.active {
      background: #171717;
      border-color: #444444;
      color: #ffffff;
    }
    .warn-banner {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: #fcd34d;
      padding: 10px 14px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 0.82rem;
      display: none;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
    }
    .main-card {
      margin-bottom: 16px;
    }
    .metric-tabs {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      border-bottom: 1px solid var(--border);
    }
    @media (max-width: 640px) {
      .metric-tabs {
        grid-template-columns: 1fr;
      }
    }
    .metric-tab {
      appearance: none;
      background: transparent;
      border: 0;
      border-right: 1px solid var(--border);
      padding: 16px 20px;
      text-align: left;
      cursor: pointer;
      color: var(--text);
      position: relative;
      transition: background 0.15s ease;
    }
    .metric-tab:last-child {
      border-right: 0;
    }
    @media (max-width: 640px) {
      .metric-tab {
        border-right: 0;
        border-bottom: 1px solid var(--border);
      }
      .metric-tab:last-child {
        border-bottom: 0;
      }
    }
    .metric-tab:hover {
      background: rgba(255, 255, 255, 0.025);
    }
    .metric-tab.active {
      background: rgba(255, 255, 255, 0.03);
    }
    .metric-tab.active::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: -1px;
      height: 2px;
      background: #ededed;
    }
    .metric-label {
      font-size: 0.8rem;
      color: var(--muted);
      font-weight: 500;
      margin-bottom: 8px;
    }
    .metric-tab.active .metric-label {
      color: var(--text);
    }
    .metric-value-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .metric-value {
      font-size: 1.85rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .metric-pill {
      font-size: 0.72rem;
      font-weight: 600;
      padding: 3px 7px;
      border-radius: 5px;
      background: var(--green-bg);
      color: var(--green-text);
      font-variant-numeric: tabular-nums;
    }
    .chart-wrap {
      padding: 20px 18px 14px;
      height: 320px;
      position: relative;
    }
    .tables-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    @media (max-width: 820px) {
      .tables-grid {
        grid-template-columns: 1fr;
      }
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      gap: 10px;
    }
    .panel-tabs {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .panel-tab {
      appearance: none;
      background: transparent;
      border: 0;
      padding: 4px 0;
      font-size: 0.86rem;
      font-weight: 500;
      color: var(--muted);
      cursor: pointer;
      position: relative;
    }
    .panel-tab:hover {
      color: var(--text);
    }
    .panel-tab.active {
      color: var(--text);
      font-weight: 600;
    }
    .panel-tab.active::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: -13px;
      height: 2px;
      background: var(--text);
    }
    .panel-col-label {
      font-size: 0.7rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 600;
    }
    .list-rows {
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 360px;
      overflow-y: auto;
    }
    .list-row {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 12px;
      border-radius: 6px;
      overflow: hidden;
      min-height: 34px;
      background: rgba(255, 255, 255, 0.015);
    }
    .list-row:hover {
      background: rgba(255, 255, 255, 0.035);
    }
    .list-row-fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      background: var(--bar-fill);
      border-radius: 6px;
      pointer-events: none;
    }
    .list-row-label {
      position: relative;
      z-index: 1;
      font-size: 0.84rem;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .list-row-count {
      position: relative;
      z-index: 1;
      font-size: 0.84rem;
      font-weight: 600;
      color: var(--text);
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .empty-state {
      text-align: center;
      padding: 36px 16px;
      color: var(--muted);
      font-size: 0.84rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="topbar">
      <div class="title-wrap">
        <div class="title-row">
          <h1>Analytics Portale FITeT</h1>
          <span class="gdpr-badge">GDPR • Zero Cookie / Zero IP</span>
        </div>
        <p class="subtitle" id="periodLabel">Caricamento statistiche...</p>
      </div>
      <div class="controls">
        <button class="range-btn active" data-days="30" id="btn30">Dal 4 Nov</button>
        <button class="range-btn" data-days="7" id="btn7">Ultimi 7 giorni</button>
        <button class="range-btn" id="btnRefresh">Aggiorna</button>
      </div>
    </div>

    <div class="warn-banner" id="configWarn"></div>

    <div class="card main-card">
      <div class="metric-tabs">
        <button class="metric-tab active" data-metric="visitors" id="tabVisitors">
          <div class="metric-label">Visitatori</div>
          <div class="metric-value-row">
            <span class="metric-value" id="kpiVisitors">-</span>
            <span class="metric-pill" id="kpiVisitorsAvg">-</span>
          </div>
        </button>
        <button class="metric-tab" data-metric="pages" id="tabPages">
          <div class="metric-label">Pagine Viste</div>
          <div class="metric-value-row">
            <span class="metric-value" id="kpiPages">-</span>
            <span class="metric-pill" id="kpiPagesAvg">-</span>
          </div>
        </button>
        <button class="metric-tab" data-metric="clicks" id="tabClicks">
          <div class="metric-label">Click</div>
          <div class="metric-value-row">
            <span class="metric-value" id="kpiClicks">-</span>
            <span class="metric-pill" id="kpiClicksAvg">-</span>
          </div>
        </button>
      </div>
      <div class="chart-wrap">
        <canvas id="trendChart"></canvas>
      </div>
    </div>

    <div class="tables-grid">
      <div class="card">
        <div class="panel-header">
          <div class="panel-tabs">
            <button class="panel-tab active" type="button">Pagine</button>
          </div>
          <span class="panel-col-label">Visite</span>
        </div>
        <div class="list-rows" id="pagesList">
          <div class="empty-state">Caricamento...</div>
        </div>
      </div>

      <div class="card">
        <div class="panel-header">
          <div class="panel-tabs">
            <button class="panel-tab active" type="button" data-right-tab="clicks" id="tabRightClicks">Click</button>
            <button class="panel-tab" type="button" data-right-tab="flows" id="tabRightFlows">Flussi</button>
          </div>
          <span class="panel-col-label" id="rightColLabel">Click</span>
        </div>
        <div class="list-rows" id="rightList">
          <div class="empty-state">Caricamento...</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let currentDays = 30;
    let activeMetric = 'visitors';
    let activeRightTab = 'clicks';
    let lastData = null;
    let trendChart = null;

    const IT_MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function formatShortDate(iso) {
      const parts = String(iso || '').split('-');
      if (parts.length !== 3) return iso;
      const day = parseInt(parts[2], 10);
      const monthIdx = parseInt(parts[1], 10) - 1;
      const monthLabel = IT_MONTHS[monthIdx] || parts[1];
      return day + ' ' + monthLabel;
    }

    function renderTrendChart() {
      if (!lastData) return;
      const series = lastData.dailySeries || [];
      const canvas = document.getElementById('trendChart');
      const ctx2d = canvas.getContext('2d');
      if (trendChart) trendChart.destroy();

      const metricConfig = {
        visitors: { label: 'Visitatori Unici', color: '#0070f3', fillTop: 'rgba(0, 112, 243, 0.24)' },
        pages: { label: 'Pagine Viste', color: '#38bdf8', fillTop: 'rgba(56, 189, 248, 0.22)' },
        clicks: { label: 'Click Utenti', color: '#10b981', fillTop: 'rgba(16, 185, 129, 0.22)' },
      }[activeMetric];

      const gradient = ctx2d.createLinearGradient(0, 0, 0, 290);
      gradient.addColorStop(0, metricConfig.fillTop);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      const values = series.map((d) => Number(d[activeMetric]) || 0);
      const lastIdx = series.length - 1;

      trendChart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: series.map((d) => formatShortDate(d.date)),
          datasets: [
            {
              label: metricConfig.label,
              data: values,
              borderColor: metricConfig.color,
              backgroundColor: gradient,
              fill: true,
              tension: 0.25,
              borderWidth: 2,
              pointRadius: values.map((_, idx) => (idx === lastIdx ? 3.5 : 0)),
              pointHoverRadius: 5,
              pointBackgroundColor: metricConfig.color,
              segment: {
                borderDash: (segCtx) => (segCtx.p1DataIndex === lastIdx ? [5, 5] : undefined),
              },
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#111111',
              borderColor: '#333333',
              borderWidth: 1,
              titleColor: '#ededed',
              bodyColor: '#ededed',
              padding: 10,
              displayColors: false,
              callbacks: {
                title: (items) => {
                  const idx = items[0] ? items[0].dataIndex : -1;
                  const iso = idx >= 0 && series[idx] ? series[idx].date : '';
                  const label = formatShortDate(iso);
                  return idx === lastIdx ? label + ' (in corso)' : label;
                },
              },
            },
          },
          scales: {
            x: {
              border: { display: false },
              grid: { display: false },
              ticks: {
                color: '#737373',
                maxRotation: 0,
                autoSkip: true,
                font: { size: 11 },
              },
            },
            y: {
              beginAtZero: true,
              border: { display: false },
              grid: { color: 'rgba(255, 255, 255, 0.07)' },
              ticks: {
                color: '#737373',
                precision: 0,
                maxTicksLimit: 5,
                font: { size: 11 },
              },
            },
          },
        },
      });
    }

    function renderBarList(containerId, items, emptyMessage) {
      const container = document.getElementById(containerId);
      if (!items || items.length === 0) {
        container.innerHTML = '<div class="empty-state">' + escapeHtml(emptyMessage) + '</div>';
        return;
      }

      const top = items.slice(0, 12);
      const maxCount = Math.max(...top.map((i) => i.count), 1);

      container.innerHTML = top.map((item) => {
        const pct = Math.max(3, Math.round((item.count / maxCount) * 100));
        return (
          '<div class="list-row" title="' + escapeHtml(item.label) + '">' +
            '<div class="list-row-fill" style="width:' + pct + '%"></div>' +
            '<span class="list-row-label">' + escapeHtml(item.label) + '</span>' +
            '<span class="list-row-count">' + Number(item.count).toLocaleString('it-IT') + '</span>' +
          '</div>'
        );
      }).join('');
    }

    function renderRightPanel() {
      if (!lastData) return;
      document.getElementById('tabRightClicks').classList.toggle('active', activeRightTab === 'clicks');
      document.getElementById('tabRightFlows').classList.toggle('active', activeRightTab === 'flows');
      document.getElementById('rightColLabel').textContent = activeRightTab === 'clicks' ? 'Click' : 'Passaggi';

      if (activeRightTab === 'clicks') {
        const clickItems = (lastData.topClicks || []).map((c) => ({ label: c.target, count: c.count }));
        renderBarList('rightList', clickItems, 'Nessun click registrato nel periodo.');
      } else {
        const flowItems = (lastData.clickFlows || []).map((f) => ({
          label: f.from + ' → ' + f.to,
          count: f.count,
        }));
        renderBarList('rightList', flowItems, 'Nessun flusso registrato nel periodo.');
      }
    }

    function renderAll() {
      if (!lastData) return;
      const data = lastData;

      document.getElementById('periodLabel').textContent =
        formatShortDate(data.startDate) + ' → ' + formatShortDate(data.endDate) + ' (in corso) • ' + data.rangeDays + ' giorni';

      document.getElementById('kpiVisitors').textContent = (data.totals.visitors || 0).toLocaleString('it-IT');
      document.getElementById('kpiVisitorsAvg').textContent = (data.totals.avgVisitorsPerDay || 0) + '/g';
      document.getElementById('kpiPages').textContent = (data.totals.pages || 0).toLocaleString('it-IT');
      document.getElementById('kpiPagesAvg').textContent = (data.totals.avgPagesPerDay || 0) + '/g';
      document.getElementById('kpiClicks').textContent = (data.totals.clicks || 0).toLocaleString('it-IT');
      document.getElementById('kpiClicksAvg').textContent = (data.totals.avgClicksPerDay || 0) + '/g';

      renderTrendChart();

      const pageItems = (data.topPages || []).map((p) => ({ label: p.target, count: p.count }));
      renderBarList('pagesList', pageItems, 'Nessuna pagina registrata nel periodo.');
      renderRightPanel();
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
        lastData = await res.json();

        const warnEl = document.getElementById('configWarn');
        if (!lastData.configured) {
          warnEl.style.display = 'block';
          warnEl.textContent = 'Modalità fallback in memoria: configura SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY e applica supabase/daily_analytics.sql per la persistenza su Postgres.';
        } else {
          warnEl.style.display = 'none';
        }

        renderAll();
      } catch (err) {
        document.getElementById('periodLabel').textContent = 'Errore nel caricamento dei dati: ' + err.message;
      }
    }

    document.querySelectorAll('.metric-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeMetric = btn.dataset.metric || 'visitors';
        document.querySelectorAll('.metric-tab').forEach((el) => {
          el.classList.toggle('active', el === btn);
        });
        renderTrendChart();
      });
    });

    document.getElementById('tabRightClicks').addEventListener('click', () => {
      activeRightTab = 'clicks';
      renderRightPanel();
    });
    document.getElementById('tabRightFlows').addEventListener('click', () => {
      activeRightTab = 'flows';
      renderRightPanel();
    });

    document.getElementById('btn7').addEventListener('click', () => loadAnalytics(7));
    document.getElementById('btn30').addEventListener('click', () => loadAnalytics(30));
    document.getElementById('btnRefresh').addEventListener('click', () => loadAnalytics(currentDays));

    loadAnalytics(30);
  </script>
</body>
</html>`;
}
