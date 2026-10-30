/**
 * Cattura screenshot mobile reali (viewport 390x844) via CDP.
 * Uso: node scratch/mobile-shot.mjs <url> <outfile> [action]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = process.argv[2] || 'http://localhost:5173/?view=tornei&paywall=true';
const outfile = process.argv[3] || path.join(os.tmpdir(), 'mobile-shot.png');
const action = process.argv[4] || '';
const theme = process.argv[5] || '';
const width = Number(process.argv[6] || 390);
const height = Number(process.argv[7] || 844);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-profile-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-port=9222',
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDebugger() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/version');
      if (res.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('Chrome debugger non disponibile');
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        const handlers = this.events.get(msg.method) || [];
        handlers.forEach((fn) => fn(msg.params));
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method) {
    return new Promise((resolve) => {
      const handlers = this.events.get(method) || [];
      const fn = (params) => {
        const idx = handlers.indexOf(fn);
        if (idx >= 0) handlers.splice(idx, 1);
        resolve(params);
      };
      handlers.push(fn);
      this.events.set(method, handlers);
    });
  }
}

async function main() {
  await waitForDebugger();
  const targetRes = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' });
  const target = await targetRes.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const cdp = new Cdp(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  if (theme === 'light' || theme === 'dark') {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `localStorage.setItem('fitet_theme', '${theme}')`,
    });
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: width <= 600,
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await loaded;
  await sleep(9000);

  const evaluate = async (expression) => {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    return result.result?.value;
  };

  const metrics = await evaluate(`(() => {
    const root = document.documentElement;
    const offenders = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right > root.clientWidth + 1 && r.width > 0) {
        offenders.push({
          tag: el.tagName,
          cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '',
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
        });
      }
    }
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      markerCount: document.querySelectorAll('.tornei-map-marker').length,
      regionCount: document.querySelectorAll('.tornei-map-region').length,
      listCount: document.querySelectorAll('.torneo-region-card').length,
      offenders: offenders.slice(0, 15),
    };
  })()`);
  console.log(JSON.stringify(metrics, null, 2));

  if (action === 'filter-terni') {
    const clicked = await evaluate(`(() => {
      const markers = [...document.querySelectorAll('.tornei-map-marker')];
      const marker = markers.find((m) => (m.getAttribute('aria-label') || '').includes('Terni'));
      if (!marker) return { ok: false };
      const circle = marker.querySelector('.tornei-map-marker-dot');
      const r = circle.getBoundingClientRect();
      marker.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        detail: 1,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
      }));
      return { ok: true, label: marker.getAttribute('aria-label') };
    })()`);
    console.log('click:', JSON.stringify(clicked));
    await sleep(1200);
    const after = await evaluate(`(() => ({
      banner: document.querySelector('.tornei-map-filter-banner')?.innerText || null,
      listCount: document.querySelector('.tornei-list-count')?.innerText || null,
      rows: document.querySelectorAll('.torneo-row').length,
      regionCards: document.querySelectorAll('.torneo-region-card').length,
      scrollWidth: document.documentElement.scrollWidth,
    }))()`);
    console.log('after:', JSON.stringify(after, null, 2));
  }

  const viewportShot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  const viewportFile = outfile.replace(/\.png$/, '.viewport.png');
  fs.writeFileSync(viewportFile, Buffer.from(viewportShot.data, 'base64'));
  console.log(`Viewport: ${viewportFile} (${width}x${height})`);

  if (action === 'filter-terni') {
    const scrolled = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('.tornei-map-show-list')].find((b) => b.textContent.includes('Vedi elenco'));
      if (!btn) return { ok: false };
      btn.click();
      return { ok: true };
    })()`);
    await sleep(900);
    const bannerCheck = await evaluate(`(() => {
      const banner = document.querySelector('.tornei-map-filter-banner');
      const header = document.querySelector('.portal-header');
      return {
        scrolled: ${JSON.stringify(scrolled)},
        bannerTop: banner ? Math.round(banner.getBoundingClientRect().top) : null,
        bannerText: banner?.innerText || null,
        headerBottom: header ? Math.round(header.getBoundingClientRect().bottom) : null,
        listHeadingTop: Math.round(document.querySelector('.tornei-list-heading')?.getBoundingClientRect().top ?? -1),
      };
    })()`);
    console.log('banner check:', JSON.stringify(bannerCheck, null, 2));
    const listShot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    const listFile = outfile.replace(/\.png$/, '.filtered.png');
    fs.writeFileSync(listFile, Buffer.from(listShot.data, 'base64'));
    console.log(`Filtered list: ${listFile} (390x844)`);
  }

  if (action === 'region-click') {
    const result = await evaluate(`(() => {
      const regions = [...document.querySelectorAll('.tornei-map-region')];
      const region = regions.find((p) => (p.getAttribute('aria-label') || '').includes('Molise'));
      if (!region) return { ok: false, reason: 'region not found' };
      const r = region.getBoundingClientRect();
      region.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        detail: 1,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
      }));
      return { ok: true, label: region.getAttribute('aria-label'), rect: { w: Math.round(r.width), h: Math.round(r.height) } };
    })()`);
    await sleep(800);
    const after = await evaluate(`(() => ({
      banner: document.querySelector('.tornei-map-filter-banner')?.innerText || null,
      rows: document.querySelectorAll('.torneo-row').length,
      empty: document.querySelector('.tornei-map-empty-list')?.innerText || null,
    }))()`);
    console.log('region-click:', JSON.stringify(result), JSON.stringify(after));
  }

  if (action === 'near-miss') {
    const result = await evaluate(`(() => {
      const markers = [...document.querySelectorAll('.tornei-map-marker')];
      const marker = markers.find((m) => (m.getAttribute('aria-label') || '').includes('Terni'));
      if (!marker) return { ok: false, reason: 'marker not found' };
      const circle = marker.querySelector('.tornei-map-marker-dot');
      const r = circle.getBoundingClientRect();
      const svg = document.querySelector('.tornei-map-svg');
      const x = r.left + r.width / 2 + 11;
      const y = r.top + r.height / 2 + 6;
      svg.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
      return { ok: true, tapX: Math.round(x), tapY: Math.round(y) };
    })()`);
    await sleep(800);
    const after = await evaluate(`(() => ({
      banner: document.querySelector('.tornei-map-filter-banner')?.innerText || null,
      rows: document.querySelectorAll('.torneo-row').length,
    }))()`);
    console.log('near-miss:', JSON.stringify(result), JSON.stringify(after));
  }

  const layout = await cdp.send('Page.getLayoutMetrics');
  const contentHeight = Math.min(Math.ceil(layout.cssContentSize.height), 6000);
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height: contentHeight, scale: 1 },
  });
  fs.writeFileSync(outfile, Buffer.from(shot.data, 'base64'));
  console.log(`Screenshot: ${outfile} (${width}x${contentHeight})`);

  ws.close();
  chrome.kill();
  await sleep(500);
  fs.rmSync(profile, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  chrome.kill();
  process.exit(1);
});
