/**
 * Genera i dati statici della mappa dell'Italia usati da TorneiTab.
 *
 * Sorgenti:
 *  - confini regionali: openpolis/geojson-italy
 *  - confini provinciali: openpolis/geojson-italy
 *  - coordinate dei comuni: RP92/comuni-italiani
 *
 * I file vengono scaricati in una cache locale (node_modules/.cache/italy-map)
 * e il risultato viene scritto in src/data/italyGeo.ts.
 *
 * Uso: node scripts/generate-italy-map.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'italy-map');
const OUTPUT_FILE = path.join(ROOT, 'src', 'data', 'italyGeo.ts');

const SOURCES = {
  regions: {
    url: 'https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_regions.geojson',
    file: 'limits_IT_regions.geojson',
  },
  provinces: {
    url: 'https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_provinces.geojson',
    file: 'limits_IT_provinces.geojson',
  },
  comuni: {
    url: 'https://raw.githubusercontent.com/RP92/comuni-italiani/main/data/comuni.json',
    file: 'comuni.json',
  },
};

const VIEWBOX_WIDTH = 640;
const VIEWBOX_HEIGHT = 820;
const PADDING = 14;
const SIMPLIFY_TOLERANCE = 0.35;

const BBOX = [6.626621418032804, 35.49345147127003, 18.520381593345082, 47.09155336139742];

const REGION_CANONICAL_NAMES = {
  "Valle d'Aosta/Vallée d'Aoste": "Valle d'Aosta",
  'Trentino-Alto Adige/Südtirol': 'Trentino-Alto Adige',
  'Friuli-Venezia Giulia': 'Friuli Venezia Giulia',
  'Emilia-Romagna': 'Emilia Romagna',
};

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function mercatorY(lat) {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

const MERCATOR_MIN_Y = mercatorY(BBOX[1]);
const MERCATOR_MAX_Y = mercatorY(BBOX[3]);
const LONGITUDE_SPAN_RAD = ((BBOX[2] - BBOX[0]) * Math.PI) / 180;
const SCALE = Math.min(
  (VIEWBOX_WIDTH - PADDING * 2) / LONGITUDE_SPAN_RAD,
  (VIEWBOX_HEIGHT - PADDING * 2) / (MERCATOR_MAX_Y - MERCATOR_MIN_Y)
);
const OFFSET_X = (VIEWBOX_WIDTH - LONGITUDE_SPAN_RAD * SCALE) / 2;
const OFFSET_Y = (VIEWBOX_HEIGHT - (MERCATOR_MAX_Y - MERCATOR_MIN_Y) * SCALE) / 2;

function project([lon, lat]) {
  return [
    Math.round(((((lon - BBOX[0]) * Math.PI) / 180) * SCALE + OFFSET_X) * 10) / 10,
    Math.round(((MERCATOR_MAX_Y - mercatorY(lat)) * SCALE + OFFSET_Y) * 10) / 10,
  ];
}

function pointSegmentDistanceSq(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyRdp(points, toleranceSq) {
  if (points.length <= 2) return points;

  const markers = new Uint8Array(points.length);
  markers[0] = 1;
  markers[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxDistance = toleranceSq;
    let index = -1;

    for (let i = first + 1; i < last; i += 1) {
      const distance = pointSegmentDistanceSq(points[i], points[first], points[last]);
      if (distance > maxDistance) {
        index = i;
        maxDistance = distance;
      }
    }

    if (index !== -1) {
      markers[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const result = [];
  for (let i = 0; i < points.length; i += 1) {
    if (markers[i]) result.push(points[i]);
  }
  return result;
}

function simplifyRing(ring, tolerance) {
  const points = ring.map(project);
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) points.pop();
  }
  if (points.length < 3) return points;

  // Per un anello chiuso, RDP con estremi coincidenti può degenerare:
  // lo dividiamo nel punto più lontano dal primo vertice.
  let farthestIndex = 1;
  let farthestDistance = -1;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i][0] - points[0][0];
    const dy = points[i][1] - points[0][1];
    const distance = dx * dx + dy * dy;
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = i;
    }
  }

  const toleranceSq = tolerance * tolerance;
  const firstHalf = simplifyRdp(points.slice(0, farthestIndex + 1), toleranceSq);
  const secondHalf = simplifyRdp(
    points.slice(farthestIndex).concat([points[0]]),
    toleranceSq
  );

  return firstHalf.concat(secondHalf.slice(1, -1));
}

function ringToPath(ring) {
  const points = simplifyRing(ring, SIMPLIFY_TOLERANCE);
  if (points.length < 3) return '';
  return (
    points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0]} ${point[1]}`)
      .join('') + 'Z'
  );
}

function geometryToPath(geometry) {
  if (!geometry) return '';
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map(ringToPath).filter(Boolean).join('');
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates
      .flatMap((polygon) => polygon.map(ringToPath))
      .filter(Boolean)
      .join('');
  }
  return '';
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const current = ring[i];
    const next = ring[(i + 1) % ring.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function ringCentroid(ring) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const current = ring[i];
    const next = ring[(i + 1) % ring.length];
    const cross = current[0] * next[1] - next[0] * current[1];
    area += cross;
    cx += (current[0] + next[0]) * cross;
    cy += (current[1] + next[1]) * cross;
  }
  area /= 2;
  if (!area) {
    const sum = ring.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
    return [sum[0] / ring.length, sum[1] / ring.length];
  }
  return [cx / (6 * area), cy / (6 * area)];
}

function geometryCentroid(geometry) {
  if (!geometry) return null;
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];

  let bestRing = null;
  let bestArea = 0;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      const area = Math.abs(ringArea(ring));
      if (area > bestArea) {
        bestArea = area;
        bestRing = ring;
      }
    }
  }

  return bestRing ? ringCentroid(bestRing) : null;
}

function roundCoordinate(value) {
  return Math.round(value * 10000) / 10000;
}

async function ensureSource(source) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const target = path.join(CACHE_DIR, source.file);
  if (!fs.existsSync(target)) {
    console.log(`Scarico ${source.file}...`);
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`Download fallito (${response.status}): ${source.url}`);
    }
    fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  }
  return target;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function collectCachedPlaces() {
  const cacheDir = path.join(ROOT, 'node_modules', '.cache', 'fitet_cache');
  const places = new Map();
  if (!fs.existsSync(cacheDir)) return places;

  for (const file of fs.readdirSync(cacheDir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const payload = readJson(path.join(cacheDir, file));
      const tornei = payload?.data?.tornei;
      if (!Array.isArray(tornei)) continue;
      for (const torneo of tornei) {
        const luogo = String(torneo?.luogo || '').trim();
        if (!luogo) continue;
        const cleaned = luogo.replace(/^\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*/, '').trim();
        const match = cleaned.match(/^(.*?)\s*\(([A-Z]{2})\)\s*$/);
        const city = (match ? match[1] : cleaned).trim();
        const sigla = match ? match[2] : null;
        const key = `${normalize(city)}|${sigla || ''}`;
        places.set(key, { city, sigla, luogo });
      }
    } catch {
      // Ignora file di cache non validi.
    }
  }

  return places;
}

function buildCityCoordinates(comuni, cachedPlaces) {
  const byName = new Map();
  const byNameAndSigla = new Map();

  for (const comune of comuni) {
    const coords = comune?.coordinate;
    if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) continue;
    const name = normalize(comune.nome);
    const sigla = comune.sigla || '';
    const value = [roundCoordinate(coords.lng), roundCoordinate(coords.lat)];

    if (!byName.has(name) || (comune.popolazione || 0) > (byName.get(name).population || 0)) {
      byName.set(name, { value, population: comune.popolazione || 0 });
    }
    if (!byNameAndSigla.has(`${name}|${sigla}`)) {
      byNameAndSigla.set(`${name}|${sigla}`, value);
    }
  }

  const result = new Map();
  const add = (city, sigla, value) => {
    if (!value) return;
    const name = normalize(city);
    if (sigla) result.set(`${name}|${sigla}`, value);
    result.set(name, value);
  };

  // Tutti i capoluoghi di provincia: coprono la maggior parte dei tornei.
  for (const comune of comuni) {
    if (!comune?.capoluogo) continue;
    const coords = comune?.coordinate;
    if (!coords) continue;
    add(comune.nome, comune.sigla, [
      roundCoordinate(coords.lng),
      roundCoordinate(coords.lat),
    ]);
  }

  // Luoghi presenti nella cache FITeT: coordinate esatte quando il comune
  // esiste nel dataset, altrimenti si userà il centro della provincia.
  const aliases = {
    'reggio calabria': 'reggio di calabria',
    sermide: 'sermide e felonica',
    's giovanni lupatoto': 'san giovanni lupatoto',
  };

  for (const place of cachedPlaces.values()) {
    const name = normalize(place.city);
    const alias = aliases[name] || name;
    const exact =
      (place.sigla && byNameAndSigla.get(`${alias}|${place.sigla}`)) ||
      byName.get(alias)?.value ||
      null;
    if (exact) add(place.city, place.sigla, exact);
  }

  return result;
}

function buildProvinceCoordinates(provinces) {
  const result = new Map();
  for (const feature of provinces.features) {
    const sigla = feature?.properties?.prov_acr;
    const centroid = geometryCentroid(feature.geometry);
    if (!sigla || !centroid) continue;
    result.set(sigla, [roundCoordinate(centroid[0]), roundCoordinate(centroid[1])]);
  }
  return result;
}

function buildRegionData(regions) {
  const shapes = [];
  const coords = new Map();

  for (const feature of regions.features) {
    const rawName = feature?.properties?.reg_name;
    if (!rawName) continue;
    const canonicalName = REGION_CANONICAL_NAMES[rawName] || rawName;
    const geometry = feature.geometry;
    const path = geometryToPath(geometry);
    const centroid = geometryCentroid(geometry);

    shapes.push({ name: rawName, canonicalName, path });
    if (centroid) {
      coords.set(canonicalName, [roundCoordinate(centroid[0]), roundCoordinate(centroid[1])]);
    }
  }

  return { shapes, coords };
}

function serializeCoordsMap(map, indent = '  ') {
  const entries = [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'it'));
  return entries
    .map(([key, value]) => `${indent}${JSON.stringify(key)}: [${value[0]}, ${value[1]}],`)
    .join('\n');
}

function serializeShapes(shapes) {
  return shapes
    .map(
      (shape) =>
        `  {\n    name: ${JSON.stringify(shape.name)},\n    canonicalName: ${JSON.stringify(
          shape.canonicalName
        )},\n    path: ${JSON.stringify(shape.path)},\n  },`
    )
    .join('\n');
}

async function main() {
  const regionsFile = await ensureSource(SOURCES.regions);
  const provincesFile = await ensureSource(SOURCES.provinces);
  const comuniFile = await ensureSource(SOURCES.comuni);

  const regions = readJson(regionsFile);
  const provinces = readJson(provincesFile);
  const comuni = readJson(comuniFile);
  const cachedPlaces = collectCachedPlaces();

  const { shapes, coords: regionCoords } = buildRegionData(regions);
  const provinceCoords = buildProvinceCoordinates(provinces);
  const cityCoords = buildCityCoordinates(comuni, cachedPlaces);

  const output = `/**
 * Dati statici per la mappa interattiva dei tornei.
 *
 * File generato automaticamente da scripts/generate-italy-map.mjs.
 * Non modificare a mano: rieseguire lo script per aggiornare i confini
 * o le coordinate delle città.
 */

export const ITALY_MAP_VIEWBOX = '0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}';

export interface ItalyRegionShape {
  name: string;
  canonicalName: string;
  path: string;
}

export const ITALY_REGION_SHAPES: ItalyRegionShape[] = [
${serializeShapes(shapes)}
];

export const ITALY_REGION_COORDS: Record<string, [number, number]> = {
${serializeCoordsMap(regionCoords)}
};

export const ITALY_PROVINCE_COORDS: Record<string, [number, number]> = {
${serializeCoordsMap(provinceCoords)}
};

export const ITALY_CITY_COORDS: Record<string, [number, number]> = {
${serializeCoordsMap(cityCoords)}
};

const LON_MIN = ${BBOX[0]};
const LON_MAX = ${BBOX[2]};
const MERCATOR_MIN_Y = ${MERCATOR_MIN_Y};
const MERCATOR_MAX_Y = ${MERCATOR_MAX_Y};
const MAP_SCALE = ${SCALE};
const MAP_OFFSET_X = ${OFFSET_X};
const MAP_OFFSET_Y = ${OFFSET_Y};

/**
 * Proietta longitudine/latitudine nello stesso sistema di coordinate
 * usato dai path SVG dei confini regionali.
 */
export function projectItalyPoint(lon: number, lat: number): { x: number; y: number } {
  const mercator = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return {
    x: (((lon - LON_MIN) * Math.PI) / 180) * MAP_SCALE + MAP_OFFSET_X,
    y: (MERCATOR_MAX_Y - mercator) * MAP_SCALE + MAP_OFFSET_Y,
  };
}
`;

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, output, 'utf8');

  const size = fs.statSync(OUTPUT_FILE).size;
  console.log(`Scritto ${path.relative(ROOT, OUTPUT_FILE)} (${(size / 1024).toFixed(1)} KB)`);
  console.log(`Regioni: ${shapes.length}, province: ${provinceCoords.size}, città: ${cityCoords.size}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
