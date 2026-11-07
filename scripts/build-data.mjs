/**
 * Pipeline de dados do Visualizador.
 *
 * 1. Lê os GeoJSON originais de /data
 * 2. Arredonda coordenadas para 5 casas (~1 m), remove geometrias nulas
 * 3. Injeta _fid (id estável p/ feature-state) e _label (nome de exibição)
 * 4. Calcula estatísticas de filtro (valores únicos + contagens)
 * 5. Gera data/layers.json e os GeoJSON normalizados em um diretório temporário
 * 6. Gera o script do tippecanoe para produzir o arquivo .mbtiles
 *
 * Uso: node scripts/build-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { LAYERS, GROUPS, ZONA_CATEGORIES, zonaCategory } from './layers.config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data');
const TMP_DIR = process.env.TILES_TMP || path.join(os.tmpdir(), 'visualizador-tiles');
const PRECISION = 5;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.rmSync(TMP_DIR, { recursive: true, force: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

const round = (n) => Math.round(n * 10 ** PRECISION) / 10 ** PRECISION;

function roundCoords(coords) {
  if (typeof coords[0] === 'number') {
    coords[0] = round(coords[0]);
    coords[1] = round(coords[1]);
    if (coords.length > 2) coords[2] = round(coords[2]);
    return coords;
  }
  for (const item of coords) roundCoords(item);
  return coords;
}

function bboxOfGeometry(geometry) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      if (c[0] < w) w = c[0];
      if (c[0] > e) e = c[0];
      if (c[1] < s) s = c[1];
      if (c[1] > n) n = c[1];
      return;
    }
    for (const x of c) walk(x);
  };
  if (geometry?.coordinates) walk(geometry.coordinates);
  return [w, s, e, n];
}

function unionBBox(target, box) {
  if (box[0] < target[0]) target[0] = box[0];
  if (box[1] < target[1]) target[1] = box[1];
  if (box[2] > target[2]) target[2] = box[2];
  if (box[3] > target[3]) target[3] = box[3];
  return target;
}

const layersMeta = [];
let extent = [Infinity, Infinity, -Infinity, -Infinity];
const ARGS = [];

for (const cfg of LAYERS) {
  const src = path.join(ROOT, 'data', cfg.file);
  const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
  const features = [];
  const fboxes = [];
  let skipped = 0;

  raw.features.forEach((f, i) => {
    if (!f?.geometry?.coordinates) { skipped++; return; }
    roundCoords(f.geometry.coordinates);

    const properties = { ...(f.properties || {}) };
    properties._fid = i + 1;

    if (cfg.slug === 'estado') properties._label = 'Pará';
    else if (cfg.slug === 'zoneamentos') {
      properties.cor_zona = zonaCategory(properties.ZONA);
      properties._label = [properties.UNIDADE, properties.ZONA].filter(Boolean).join(' · ');
    } else {
      const label = properties[cfg.nameField];
      properties._label = label === null || label === undefined ? '' : String(label).trim();
    }

    features.push({ type: 'Feature', properties, geometry: f.geometry });
    fboxes.push(bboxOfGeometry(f.geometry));
  });

  const fc = { type: 'FeatureCollection', features };
  const geoFile = path.join(TMP_DIR, `${cfg.slug}.geojson`);
  fs.writeFileSync(geoFile, JSON.stringify(fc));

  const fb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const box of fboxes) unionBBox(fb, box);
  if (cfg.slug === 'estado') extent = fb;

  // ---------- estatísticas de filtro ----------
  const hidden = new Set([...(cfg.hidden || []), '_fid', '_label', 'cor_zona']);
  const keys = new Set();
  for (const f of features) for (const k of Object.keys(f.properties)) keys.add(k);

  const fields = {};
  for (const key of keys) {
    if (hidden.has(key)) continue;
    if (/^Shape_/i.test(key)) continue;

    const isList = key.endsWith('_lista');
    const counter = new Map();
    let numeric = true;

    for (const f of features) {
      const v = f.properties[key];
      if (v === null || v === undefined || v === '') continue;
      if (typeof v !== 'number') numeric = false;
      if (isList) {
        for (const part of String(v).split(',')) {
          const token = part.trim();
          if (token) counter.set(token, (counter.get(token) || 0) + 1);
        }
      } else {
        const token = String(v).trim();
        if (token) counter.set(token, (counter.get(token) || 0) + 1);
      }
    }

    if (!counter.size) continue;
    if (!isList && counter.size > 250) continue; // campo de alta cardinalidade (ex.: área)

    const values = [...counter.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], 'pt-BR', { numeric: true, sensitivity: 'base' })
    );
    fields[key] = { isList, numeric, values };
  }

  // ---------- índices de localização (bbox + feições por valor) ----------
  const zoom = {};
  for (const key of Object.keys(fields)) {
    const meta = fields[key];
    const byValue = new Map();

    features.forEach((f, idx) => {
      const v = f.properties[key];
      if (v === null || v === undefined || v === '') return;
      const tokens = meta.isList
        ? String(v).split(',').map((s) => s.trim()).filter(Boolean)
        : [String(v).trim()];

      for (const token of tokens) {
        if (!token) continue;
        let entry = byValue.get(token);
        if (!entry) {
          entry = { bbox: [Infinity, Infinity, -Infinity, -Infinity] };
          byValue.set(token, entry);
        }
        unionBBox(entry.bbox, fboxes[idx]);
      }
    });

    const out = {};
    for (const [token, entry] of byValue) {
      out[token] = { bbox: entry.bbox.map(round) };
    }
    zoom[key] = out;
  }

  const meta = {
    slug: cfg.slug,
    label: cfg.label,
    group: cfg.group,
    color: cfg.color,
    colorDark: cfg.colorDark || null,
    outline: cfg.outline || null,
    kind: cfg.kind,
    dash: cfg.dash || null,
    width: cfg.width || null,
    fillOpacity: cfg.fillOpacity ?? 0.4,
    default: !!cfg.default,
    zoneColors: !!cfg.zoneColors,
    downloadFile: cfg.file,
    labelField: cfg.nameField,
    primary: cfg.primary || [],
    hidden: cfg.hidden || [],
    fieldLabels: cfg.fieldLabels || {},
    count: features.length,
    fields,
    zoom,
  };
  layersMeta.push(meta);

  ARGS.push(`-L ${cfg.slug}:${cfg.slug}.geojson`);
  console.log(`  ${cfg.slug.padEnd(22)} ${String(features.length).padStart(4)} feições${skipped ? ` (${skipped} sem geometria ignoradas)` : ''}`);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  source: 'data/*.geojson',
  pmtiles: 'data/territorio.pmtiles',
  extent: extent.map(round),
  groups: GROUPS,
  zonaCategories: ZONA_CATEGORIES,
  layers: layersMeta,
};

fs.writeFileSync(path.join(OUT_DIR, 'layers.json'), JSON.stringify(manifest));
console.log(`\nlayers.json: ${(fs.statSync(path.join(OUT_DIR, 'layers.json')).size / 1024).toFixed(1)} KB`);

// ---------- script do tippecanoe ----------
const maxZoom = process.env.TILE_MAXZOOM || '12';
const minZoom = process.env.TILE_MINZOOM || '4';
const mbtiles = path.join(TMP_DIR, 'territorio.mbtiles');
const sh = `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
rm -f territorio.mbtiles
tippecanoe \\
  --force \\
  --output=territorio.mbtiles \\
  --name="Território IDEFLOR-Bio" \\
  --description="Limites, áreas protegidas e territórios do Pará" \\
  --minimum-zoom=${minZoom} \\
  --maximum-zoom=${maxZoom} \\
  --simplification=3 \\
  --buffer=64 \\
  --drop-densest-as-needed \\
  --extend-zooms-if-still-dropping \\
  ${ARGS.join(' \\\n  ')}
ls -lh territorio.mbtiles
`;
fs.writeFileSync(path.join(TMP_DIR, 'build.sh'), sh);

const wslTmp = TMP_DIR.replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`).replace(/\\/g, '/');
console.log(`\nGeoJSON normalizados em: ${TMP_DIR}`);
console.log(`Para gerar os tiles:\n  wsl -d Ubuntu -u root --exec bash "${wslTmp}/build.sh"`);
console.log(`  pmtiles convert "${mbtiles}" "${path.join(OUT_DIR, 'territorio.pmtiles')}"`);
