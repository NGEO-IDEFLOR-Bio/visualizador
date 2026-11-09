/**
 * Visualizador Geoespacial IDEFLOR-Bio — v2
 * MapLibre GL + PMTiles, sem build step.
 */
import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  addProtocol,
  setWorkerUrl,
} from '../vendor/maplibre-gl.js';

setWorkerUrl(new URL('../vendor/maplibre-gl-worker.js', import.meta.url).href);

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */
const PREF_KEY = 'ideflor-visualizador-v3';
const MANIFEST_URL = 'data/layers.json';
const PMTILES_URL = 'data/territorio.pmtiles';
const FULL_DATA_ROOT = 'data/';
const HIGHLIGHT = '#38bdf8';
const UPLOAD_COLORS = ['#db2777', '#7c3aed', '#0284c7', '#ea580c', '#0f766e'];

/* Mapa base: OpenFreeMap (aberto, sem chave e sem cadastro). */
const BASEMAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const BASEMAP_ATTRIBUTION = '© OpenMapTiles © OpenStreetMap contributors · OpenFreeMap';

const ICONS = {
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"/><path d="M10.6 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A16.7 16.7 0 0 0 2 12s3.5 7 10 7a10.8 10.8 0 0 0 5.4-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  droplet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3.5 4 6 7.2 6 10.5A6 6 0 0 1 6 13.5C6 10.2 8.5 7 12 3Z"/></svg>',
  target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
};

const FIELD_LABELS = {
  Municipios_lista: 'Municípios sobrepostos',
  RegioesIntegracao_lista: 'Regiões de Integração sobrepostas',
  'MUNICÍPIO': 'Município',
  'Município': 'Município',
  'Município [-]': 'Município (duplicado)',
  'Nome [-]': 'Nome (duplicado)',
  MUNICIPIO_: 'Município',
  Municipio: 'Município',
  'Região de Integração': 'Região de Integração',
  'Reg. Integração': 'Região de Integração (duplicado)',
  NOME_: 'Nome',
  NOME: 'Nome',
  UNIDADE: 'Unidade de Conservação',
  ZONA: 'Zona',
  SIGLA: 'Sigla',
  AREA: 'Área',
  AREA_HA: 'Área (ha)',
  SITUACAO: 'Situação',
  ESTAGIO: 'Estágio',
  CATEGORIA: 'Categoria',
  DATA_DE_CR: 'Data de criação',
  NM_UF: 'Estado',
  SIGLA_UF: 'Sigla',
  NM_REGIAO: 'Região',
  AREA_KM2: 'Área (km²)',
  CD_MUN: 'Código IBGE',
  'Área Km2': 'Área (km²)',
  'Orgão Gestor': 'Órgão gestor',
  'Situação Legal': 'Situação legal',
  'Área Calculada (ha)': 'Área calculada (ha)',
  'Abreviação': 'Abreviação',
  'Sigla da categoria': 'Categoria',
  'Ano de criação': 'Ano de criação',
};

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */
const state = {
  map: null,
  manifest: null,
  layers: [],
  order: [],
  filter: null,
  outline: false,
  theme: 'light',
  basemap: 'neutral',
  basemapStyles: null,
  basemapLayerIds: { light: [], dark: [] },
  selected: [],
  prefs: {},
  uploadSeq: 0,
  fullCache: new Map(),
  sortable: null,
  ready: false,
  busy: false,
  saveTimer: null,
  toastTimer: null,
  scriptCache: new Set(),
  zoneExpr: null,
};

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const isMobile = () => window.matchMedia('(max-width: 900px)').matches;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const roundPct = (n) => `${Math.round(n * 100)}%`;
const getLayer = (slug) => state.layers.find((l) => l.slug === slug);
const fillId = (L) => `${L.slug}-fill`;
const hitId = (L) => `${L.slug}-hit`;
const lineId = (L) => `${L.slug}-line`;

function idsFor(L) {
  const ids = [];
  if (L.kind === 'fill') ids.push(fillId(L));
  else if (L.slug !== 'estado') ids.push(hitId(L));
  ids.push(lineId(L));
  return ids;
}

function formatValue(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  return String(v);
}

function fieldLabel(L, key) {
  return L.fieldLabels?.[key] || FIELD_LABELS[key] || key.replace(/_/g, ' ');
}

function toast(msg, type = 'info') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast${type === 'error' ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
}

function loadPrefs() {
  try { state.prefs = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; }
  catch { state.prefs = {}; }
}

function savePrefs() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    const layers = {};
    for (const L of state.layers) {
      if (!L.upload) layers[L.slug] = { visible: L.visible, opacity: L.opacity };
    }
    const prefs = {
      v: 1,
      theme: state.theme,
      basemap: state.basemap,
      outline: state.outline,
      layers,
      order: state.order.filter((slug) => !getLayer(slug)?.upload),
    };
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* modo privado */ }
  }, 250);
}

function loadScript(src) {
  if (state.scriptCache.has(src)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { state.scriptCache.add(src); resolve(); };
    s.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.appendChild(s);
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
let deferredInstallPrompt = null;

boot();

async function boot() {
  loadPrefs();
  state.theme = state.prefs.theme === 'dark' ? 'dark' : 'light';
  state.basemap = state.prefs.basemap === 'satellite' ? 'satellite' : 'neutral';
  state.outline = !!state.prefs.outline;
  document.documentElement.dataset.theme = state.theme;
  $('#outlineToggle').checked = state.outline;

  bindUI();
  setupPwa();

  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.manifest = await res.json();
  } catch (err) {
    return fail(`Não foi possível carregar a configuração das camadas (${err.message}).`);
  }

  hydrateLayers();

  await loadBasemapStyles();

  if (!window.pmtiles?.Protocol) {
    return fail('Biblioteca de tiles não carregada. Verifique vendor/pmtiles.js.');
  }
  const protocol = new window.pmtiles.Protocol();
  addProtocol('pmtiles', protocol.tile);

  renderLayerList();
  populateFilterLayers();
  renderLegend();

  createMap();
  performance.mark('v2-boot');
}

function hydrateLayers() {
  const prefs = state.prefs.layers || {};
  state.layers = state.manifest.layers.map((L) => {
    const p = prefs[L.slug] || {};
    return {
      ...L,
      visible: typeof p.visible === 'boolean' ? p.visible : !!L.default,
      opacity: typeof p.opacity === 'number' ? Math.max(0, Math.min(1, p.opacity)) : 1,
    };
  });

  const known = state.layers.map((L) => L.slug);
  const saved = (state.prefs.order || []).filter((s) => known.includes(s));
  state.order = [...saved, ...known.filter((s) => !saved.includes(s))];
}

/* ------------------------------------------------------------------ */
/* Mapa                                                                */
/* ------------------------------------------------------------------ */
function createMap() {
  const style = buildStyle();
  const padding = mapPadding();

  const map = new MapLibreMap({
    container: 'map',
    style,
    bounds: [[state.manifest.extent[0], state.manifest.extent[1]], [state.manifest.extent[2], state.manifest.extent[3]]],
    fitBoundsOptions: { padding, maxZoom: 7.2, animate: false },
    minZoom: 3,
    maxZoom: 18,
    maxPitch: 0,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    renderWorldCopies: false,
    attributionControl: { compact: true, customAttribution: 'IDEFLOR-Bio' },
    fadeDuration: 100,
    antialias: true,
  });

  state.map = map;
  window.__v2 = state; // apoio a diagnóstico

  // O estilo Dark do OpenFreeMap referencia o ícone "circle-11", ausente no
  // sprite público: registra um placeholder transparente para o ícone.
  map.on('styleimagemissing', (e) => {
    if (!e?.id || map.hasImage(e.id)) return;
    map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
  });
  map.addControl(new NavigationControl({ showCompass: false }), 'bottom-left');
  map.addControl(new ScaleControl({ maxWidth: 96, unit: 'metric' }), 'bottom-left');

  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();
  try { map.keyboard.disableRotation(); } catch { /* opcional */ }

  map.on('load', onMapLoad);
  map.on('click', onMapClick);
  map.on('error', (e) => {
    const msg = e?.error?.message || '';
    if (!state.ready) console.error('[v2] erro no mapa:', e?.error || e);
    if (!state.ready && (e?.sourceId === 'territorio' || /pmtiles|Worker/i.test(msg))) {
      fail('Não foi possível abrir os tiles do mapa. Verifique data/territorio.pmtiles.');
    }
  });

  // failsafe de carregamento
  setTimeout(() => {
    if (!state.ready) {
      hideLoader();
      toast('O mapa está demorando para carregar. Verifique a conexão e recarregue.', 'error');
    }
  }, 20000);
}

async function loadBasemapStyles() {
  const entries = Object.entries(BASEMAP_STYLES);
  try {
    const styles = await Promise.all(entries.map(async ([variant, url]) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      return [variant, await res.json()];
    }));
    state.basemapStyles = Object.fromEntries(styles);
  } catch (err) {
    // Reserva offline: mapa raster sem chave (Esri Light/Dark Gray Canvas).
    console.warn('[v2] OpenFreeMap indisponível; usando mapa base de reserva.', err);
    state.basemapStyles = null;
  }
}

function buildStyle() {
  const isDark = state.theme === 'dark';
  const neutral = state.basemap === 'neutral';

  const sources = {
    'base-sat': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution: 'Tiles © Esri',
    },
    territorio: {
      type: 'vector',
      url: `pmtiles://${PMTILES_URL}`,
      promoteId: '_fid',
    },
  };
  const baseLayers = [];

  if (state.basemapStyles) {
    for (const variant of ['light', 'dark']) {
      const base = state.basemapStyles[variant];
      Object.assign(sources, base.sources);
      state.basemapLayerIds[variant] = [];
      for (const layer of base.layers) {
        if (layer.type === 'background') continue;
        const id = `ofm-${variant}-${layer.id}`;
        state.basemapLayerIds[variant].push(id);
        baseLayers.push({
          ...layer,
          id,
          layout: {
            ...(layer.layout || {}),
            visibility: neutral && (variant === 'dark') === isDark ? 'visible' : 'none',
          },
        });
      }
    }
    sources.openmaptiles = { ...sources.openmaptiles, attribution: BASEMAP_ATTRIBUTION };
    if (sources.ne2_shaded) sources.ne2_shaded = { ...sources.ne2_shaded, attribution: 'Natural Earth' };
  } else {
    Object.assign(sources, {
      'base-light': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 16,
        attribution: 'Tiles © Esri',
      },
      'base-dark': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 16,
        attribution: 'Tiles © Esri',
      },
    });
    baseLayers.push(
      {
        id: 'base-light',
        type: 'raster',
        source: 'base-light',
        layout: { visibility: neutral && !isDark ? 'visible' : 'none' },
      },
      {
        id: 'base-dark',
        type: 'raster',
        source: 'base-dark',
        layout: { visibility: neutral && isDark ? 'visible' : 'none' },
      },
    );
  }

  const layers = [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': isDark ? '#081a31' : '#e9eef4' },
    },
    ...baseLayers,
    {
      id: 'base-sat',
      type: 'raster',
      source: 'base-sat',
      layout: { visibility: state.basemap === 'satellite' ? 'visible' : 'none' },
    },
    ...buildOverlayLayers(),
  ];

  const style = { version: 8, sources, layers };
  if (state.basemapStyles) {
    style.glyphs = state.basemapStyles.light.glyphs;
    style.sprite = state.basemapStyles.light.sprite;
  }
  return style;
}

function buildOverlayLayers() {
  const out = [];
  // do fundo para a frente
  for (const slug of [...state.order].reverse()) {
    const L = getLayer(slug);
    if (L) out.push(...layerSpecs(L));
  }
  return out;
}

function sourceProps(L) {
  return L.upload
    ? { source: L.source }
    : { source: 'territorio', 'source-layer': L.slug };
}

function layerSpecs(L) {
  const visibility = L.visible ? 'visible' : 'none';
  const specs = [];

  if (L.kind === 'fill') {
    specs.push({
      id: fillId(L),
      type: 'fill',
      ...sourceProps(L),
      layout: { visibility },
      paint: {
        'fill-color': fillColor(L),
        'fill-opacity': fillOpacity(L),
      },
    });
  } else if (L.slug !== 'estado') {
    // preenchimento invisível para permitir identificar clicando dentro do polígono
    specs.push({
      id: hitId(L),
      type: 'fill',
      ...sourceProps(L),
      layout: { visibility },
      paint: { 'fill-color': '#000000', 'fill-opacity': 0.001 },
    });
  }

  specs.push({
    id: lineId(L),
    type: 'line',
    ...sourceProps(L),
    layout: { visibility, 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': lineColor(L),
      'line-opacity': lineOpacity(L),
      'line-width': lineWidth(L),
      ...(L.dash ? { 'line-dasharray': L.dash } : {}),
    },
  });

  return specs;
}

function zoneColorExpr() {
  if (!state.zoneExpr) {
    const flat = [];
    for (const [key, v] of Object.entries(state.manifest.zonaCategories || {})) {
      flat.push(key, v.color);
    }
    state.zoneExpr = ['match', ['get', 'cor_zona'], ...flat, '#6366f1'];
  }
  return state.zoneExpr;
}

function fillColor(L) {
  return L.zoneColors ? zoneColorExpr() : L.color;
}

function lineColor(L) {
  const base = L.zoneColors
    ? zoneColorExpr()
    : state.theme === 'dark'
      ? (L.colorDark || L.color)
      : (L.outline || L.color);
  return [
    'case',
    ['boolean', ['feature-state', 'selected'], false], HIGHLIGHT,
    base,
  ];
}

function selectedCase(baseWidth) {
  return [
    'case',
    ['boolean', ['feature-state', 'selected'], false], baseWidth + 1.6,
    baseWidth,
  ];
}

function lineWidth(L) {
  if (L.kind === 'fill') return selectedCase(state.outline ? 2.1 : (L.zoneColors ? 0.5 : 1));
  return selectedCase(L.width || 1.5);
}

function fillOpacity(L) {
  if (state.outline) return 0;
  const dim = state.filter?.dimmed?.has(L.slug) ? 0.12 : 1;
  return (L.fillOpacity ?? 0.4) * L.opacity * dim;
}

function lineOpacity(L) {
  const dim = state.filter?.dimmed?.has(L.slug);
  if (dim) return 0.18;
  if (L.kind === 'fill') return state.outline ? 1 : 0.95;
  return 0.9 * L.opacity;
}

function refreshLayerStyles() {
  const map = state.map;
  if (!map) return;
  for (const L of state.layers) {
    if (map.getLayer(fillId(L))) {
      map.setPaintProperty(fillId(L), 'fill-color', fillColor(L));
      map.setPaintProperty(fillId(L), 'fill-opacity', fillOpacity(L));
    }
    if (map.getLayer(lineId(L))) {
      const focus = state.filter?.layerSlug === L.slug;
      map.setPaintProperty(
        lineId(L),
        'line-color',
        focus
          ? ['case', ['boolean', ['feature-state', 'selected'], false], HIGHLIGHT, '#2563eb']
          : lineColor(L)
      );
      map.setPaintProperty(lineId(L), 'line-opacity', focus ? 1 : lineOpacity(L));
      map.setPaintProperty(
        lineId(L),
        'line-width',
        focus
          ? ['case', ['boolean', ['feature-state', 'selected'], false], 4.4, 3]
          : lineWidth(L)
      );
      if (L.dash) map.setPaintProperty(lineId(L), 'line-dasharray', focus ? null : L.dash);
    }
  }
}

function refreshBasemapVisibility() {
  const map = state.map;
  if (!map) return;
  const neutral = state.basemap === 'neutral';
  const dark = state.theme === 'dark';
  const setVisibility = (id, visible) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  };
  for (const id of state.basemapLayerIds.light) setVisibility(id, neutral && !dark);
  for (const id of state.basemapLayerIds.dark) setVisibility(id, neutral && dark);
  setVisibility('base-light', neutral && !dark);
  setVisibility('base-dark', neutral && dark);
  setVisibility('base-sat', state.basemap === 'satellite');
  map.setPaintProperty('background', 'background-color', dark ? '#081a31' : '#e9eef4');
}

function mapPadding() {
  if (isMobile()) return { top: 70, bottom: 56, left: 22, right: 22 };
  return { top: 84, bottom: 54, left: 360, right: 42 };
}

function onMapLoad() {
  state.ready = true;
  hideLoader();
  renderLegend();
  console.info(`[v2] mapa interativo em ${Math.round(performance.now())} ms`);
}

function hideLoader() {
  const loader = $('#loader');
  if (!loader || loader.classList.contains('is-done')) return;
  loader.classList.add('is-done');
  setTimeout(() => loader.remove(), 320);
}

function fail(message) {
  console.error('[v2]', message);
  const msg = $('#loaderMsg');
  if (msg) {
    msg.textContent = message;
    msg.style.color = 'var(--danger)';
    msg.style.fontWeight = '600';
  }
}

/* ------------------------------------------------------------------ */
/* Camadas: lista, visibilidade, opacidade, ordem                      */
/* ------------------------------------------------------------------ */
function renderLayerList() {
  const list = $('#layerList');
  if (!list) return;
  const frag = document.createDocumentFragment();

  const groups = [...(state.manifest?.groups || [])];
  if (state.layers.some((L) => L.upload)) groups.unshift({ id: 'uploads', label: 'Meus arquivos' });

  for (const g of groups) {
    const items = state.order.map(getLayer).filter((L) => L && L.group === g.id);
    if (!items.length) continue;

    const head = document.createElement('li');
    head.className = 'group-head';
    head.textContent = g.label;
    frag.appendChild(head);

    for (const L of items) frag.appendChild(layerRow(L));
  }

  list.replaceChildren(frag);
}

function layerRow(L) {
  const li = document.createElement('li');
  li.className = `layer-item${L.visible ? '' : ' is-hidden'}`;
  li.dataset.slug = L.slug;

  const swatch = document.createElement('span');
  swatch.className = `swatch${L.kind === 'line' ? ' line-only' : ''}`;
  swatch.style.setProperty('--swatch', L.color);

  const name = document.createElement('span');
  name.className = 'layer-name';
  name.textContent = L.label;
  name.title = L.label;

  const count = document.createElement('span');
  count.className = 'layer-count';
  count.textContent = L.count ?? '';

  const actions = document.createElement('span');
  actions.className = 'layer-actions';
  actions.innerHTML = `
    <button class="mini-btn" data-act="opacity" aria-pressed="false" aria-label="Opacidade de ${esc(L.label)}" title="Opacidade">${ICONS.droplet}</button>
    <button class="mini-btn" data-act="toggle" aria-pressed="${L.visible}" aria-label="${L.visible ? 'Ocultar' : 'Exibir'} ${esc(L.label)}" title="${L.visible ? 'Ocultar camada' : 'Exibir camada'}">${L.visible ? ICONS.eye : ICONS.eyeOff}</button>
    ${L.upload ? `<button class="mini-btn layer-remove" data-act="remove" aria-label="Remover ${esc(L.label)}" title="Remover camada">${ICONS.trash}</button>` : ''}
  `;

  const opacityRow = document.createElement('div');
  opacityRow.className = 'opacity-row';
  opacityRow.innerHTML = `
    <input type="range" min="0" max="1" step="0.05" value="${L.opacity}" aria-label="Opacidade de ${esc(L.label)}" />
    <span>${roundPct(L.opacity)}</span>
  `;

  li.append(swatch, name, count, actions, opacityRow);
  return li;
}

function bindLayerList() {
  const list = $('#layerList');

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const li = btn.closest('.layer-item');
    const L = getLayer(li?.dataset.slug);
    if (!L) return;
    const act = btn.dataset.act;

    if (act === 'toggle') {
      toggleLayer(L);
    } else if (act === 'opacity') {
      const expanded = li.classList.toggle('expanded');
      btn.setAttribute('aria-pressed', String(expanded));
    } else if (act === 'remove' && L.upload) {
      removeUpload(L);
    }
  });

  list.addEventListener('input', (e) => {
    if (e.target.type !== 'range') return;
    const li = e.target.closest('.layer-item');
    const L = getLayer(li?.dataset.slug);
    if (!L) return;
    L.opacity = Number(e.target.value);
    li.querySelector('.opacity-row span').textContent = roundPct(L.opacity);
    if (state.map) {
      if (state.map.getLayer(fillId(L))) state.map.setPaintProperty(fillId(L), 'fill-opacity', fillOpacity(L));
      if (state.map.getLayer(lineId(L))) state.map.setPaintProperty(lineId(L), 'line-opacity', lineOpacity(L));
    }
    savePrefs();
  });
}

function toggleLayer(L) {
  L.visible = !L.visible;
  if (state.map) {
    for (const id of idsFor(L)) {
      if (state.map.getLayer(id)) state.map.setLayoutProperty(id, 'visibility', L.visible ? 'visible' : 'none');
    }
  }
  const li = $(`#layerList .layer-item[data-slug="${L.slug}"]`);
  if (li) {
    li.classList.toggle('is-hidden', !L.visible);
    const btn = li.querySelector('button[data-act="toggle"]');
    if (btn) {
      btn.setAttribute('aria-pressed', String(L.visible));
      btn.setAttribute('aria-label', `${L.visible ? 'Ocultar' : 'Exibir'} ${L.label}`);
      btn.title = L.visible ? 'Ocultar camada' : 'Exibir camada';
      btn.innerHTML = L.visible ? ICONS.eye : ICONS.eyeOff;
    }
  }
  if (!L.visible) clearSelectionForLayer(L);
  renderLegend();
  savePrefs();
}

function renderLegend() {
  const el = $('#legend');
  if (!el) return;
  const visible = state.order.map(getLayer).filter((L) => L && L.visible);

  if (!visible.length) {
    el.innerHTML = '<h3>Legenda</h3><div class="empty-state">Nenhuma camada visível</div>';
    return;
  }

  let html = '<h3>Camadas visíveis</h3>';
  for (const L of visible) {
    const line = L.kind === 'line';
    html += `<div class="legend-item"><i class="${line ? 'line' : ''}" style="${line ? `border-color:${L.color}` : `background:${L.color}`}"></i><span>${esc(L.label)}</span></div>`;
  }

  const zones = visible.find((L) => L.zoneColors);
  if (zones) {
    html += '<div class="legend-sub">Zoneamento</div>';
    for (const v of Object.values(state.manifest.zonaCategories || {})) {
      html += `<div class="legend-item"><i style="background:${v.color}"></i><span>${esc(v.label)}</span></div>`;
    }
  }

  el.innerHTML = html;
}

function setIdleCursor() {
  if (state.map) state.map.getCanvas().style.cursor = '';
}

/* ------------------------------------------------------------------ */
/* Modo ordenar                                                        */
/* ------------------------------------------------------------------ */
function enterOrderMode() {
  $('#layerList').hidden = true;
  $('#orderList').hidden = false;
  $('#orderFoot').hidden = false;
  $('#orderHint').textContent = 'Arraste para mudar a sobreposição';
  $('#orderBtn').textContent = 'Concluir';
  renderOrderList();

  state.sortable = new window.Sortable($('#orderList'), {
    animation: 130,
    handle: '.grip',
    ghostClass: 'sortable-ghost',
    dragClass: 'sortable-drag',
    onEnd: () => {
      state.order = $$('#orderList .order-item').map((li) => li.dataset.slug);
      applyOrderToMap();
      renderLegend();
      savePrefs();
    },
  });
}

function exitOrderMode() {
  if (state.sortable) { state.sortable.destroy(); state.sortable = null; }
  $('#layerList').hidden = false;
  $('#orderList').hidden = true;
  $('#orderFoot').hidden = true;
  $('#orderHint').textContent = 'Clique no olho para exibir';
  $('#orderBtn').textContent = 'Ordenar';
  renderLayerList();
}

function renderOrderList() {
  const list = $('#orderList');
  const frag = document.createDocumentFragment();
  for (const slug of state.order) {
    const L = getLayer(slug);
    if (!L) continue;
    const li = document.createElement('li');
    li.className = 'order-item';
    li.dataset.slug = L.slug;
    li.innerHTML = `
      <span class="grip" aria-hidden="true">${ICONS.grip}</span>
      <span class="swatch${L.kind === 'line' ? ' line-only' : ''}" style="--swatch:${L.color}"></span>
      <span class="layer-name">${esc(L.label)}</span>
      <span class="layer-count">${L.count ?? ''}</span>
    `;
    frag.appendChild(li);
  }
  list.replaceChildren(frag);
}

function applyOrderToMap() {
  if (!state.map) return;
  // o primeiro da lista é o que fica na frente
  for (const slug of [...state.order].reverse()) {
    const L = getLayer(slug);
    if (!L) continue;
    for (const id of idsFor(L)) {
      if (state.map.getLayer(id)) state.map.moveLayer(id);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Identificação                                                       */
/* ------------------------------------------------------------------ */
function interactiveLayers() {
  const map = new Map();
  for (const L of state.layers) {
    if (!L.visible || L.slug === 'estado') continue;
    map.set(L.kind === 'fill' ? fillId(L) : hitId(L), L.slug);
  }
  return map;
}

function onMapClick(e) {
  if (!state.ready) return;
  closeBasemapMenu();

  const layerMap = interactiveLayers();
  if (!layerMap.size) return;

  const features = state.map.queryRenderedFeatures(e.point, { layers: [...layerMap.keys()] });
  const seen = new Set();
  const results = [];

  for (const f of features) {
    const slug = layerMap.get(f.layer.id);
    const L = getLayer(slug);
    if (!L) continue;
    const fid = f.id ?? f.properties?._fid;
    const key = `${slug}:${fid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ L, feature: f, id: fid });
  }

  if (!results.length) {
    closeInspector();
    toast('Nenhuma feição neste ponto.');
    return;
  }

  const pos = new Map(state.order.map((s, i) => [s, i]));
  results.sort((a, b) => (pos.get(a.L.slug) ?? 99) - (pos.get(b.L.slug) ?? 99));

  highlightFeatures(results);
  showInspector(results, e.lngLat);
}

function highlightFeatures(results) {
  clearSelection();
  for (const r of results) {
    if (r.id === null || r.id === undefined) continue;
    const target = r.L.upload
      ? { source: r.L.source, id: r.id }
      : { source: 'territorio', sourceLayer: r.L.slug, id: r.id };
    try {
      state.map.setFeatureState(target, { selected: true });
      state.selected.push(target);
    } catch { /* fonte ainda não carregada */ }
  }
}

function clearSelection() {
  for (const t of state.selected) {
    try { state.map.removeFeatureState(t, 'selected'); } catch { /* noop */ }
  }
  state.selected = [];
}

function clearSelectionForLayer(L) {
  const keep = [];
  for (const t of state.selected) {
    const same = L.upload ? t.source === L.source : t.sourceLayer === L.slug;
    if (same) { try { state.map.removeFeatureState(t, 'selected'); } catch { /* noop */ } }
    else keep.push(t);
  }
  state.selected = keep;
}

function showInspector(results, lngLat) {
  const inspector = $('#inspector');
  $('#inspTitle').textContent = results.length === 1 ? 'Feição no ponto' : `${results.length} feições no ponto`;
  $('#inspSub').textContent = `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`;

  const body = $('#inspBody');
  body.replaceChildren();
  for (const r of results) body.appendChild(featureCard(r));
  inspector.hidden = false;
  body.scrollTop = 0;

  if (isMobile()) setPanelOpen(false);
  setIdleCursor();
}

function closeInspector() {
  const inspector = $('#inspector');
  if (!inspector || inspector.hidden) return;
  inspector.hidden = true;
  $('#inspBody').replaceChildren();
  clearSelection();
}

function featureCard(result) {
  const { L, feature } = result;
  const p = feature.properties || {};
  const card = document.createElement('article');
  card.className = 'feature-card';

  const head = document.createElement('div');
  head.className = 'feature-head';
  const sw = document.createElement('span');
  sw.className = `swatch${L.kind === 'line' ? ' line-only' : ''}`;
  sw.style.setProperty('--swatch', L.color);
  const titles = document.createElement('div');
  const h3 = document.createElement('h3');
  const firstPrimary = (L.primary || []).find((k) => p[k]);
  h3.textContent = p._label || (firstPrimary ? formatValue(p[firstPrimary]) : '') || L.label;
  const sub = document.createElement('p');
  sub.textContent = L.label;
  titles.append(h3, sub);
  head.append(sw, titles);
  card.appendChild(head);

  const primary = (L.primary || []).filter((k) => k in p);
  const shown = new Set([...primary, '_fid', '_label', 'cor_zona', ...(L.hidden || [])]);
  const extra = Object.keys(p).filter((k) => !shown.has(k) && !k.startsWith('_'));

  const props = document.createElement('div');
  props.className = 'props';
  const initial = (primary.length ? primary : extra.slice(0, 6)).slice(0, 9);
  for (const k of initial) props.appendChild(propRow(fieldLabel(L, k), p[k]));
  card.appendChild(props);

  if (extra.length > initial.length) {
    const more = document.createElement('button');
    more.className = 'more-btn';
    let open = false;
    const renderMore = () => {
      props.replaceChildren();
      const keys = open ? [...new Set([...initial, ...extra])] : initial;
      for (const k of keys) props.appendChild(propRow(fieldLabel(L, k), p[k]));
      more.textContent = open ? 'Mostrar menos' : `Ver todos os atributos (${extra.length})`;
    };
    more.addEventListener('click', () => {
      open = !open;
      renderMore();
    });
    renderMore();
    card.appendChild(more);
  }

  return card;
}

function propRow(label, value) {
  const row = document.createElement('div');
  row.className = 'prop';
  const dt = document.createElement('div');
  dt.textContent = label;
  const dd = document.createElement('div');
  dd.textContent = formatValue(value);
  row.append(dt, dd);
  return row;
}

/* ------------------------------------------------------------------ */
/* Filtro                                                              */
/* ------------------------------------------------------------------ */
function populateFilterLayers() {
  const sel = $('#filterLayer');
  if (!sel) return;
  const current = sel.value;
  sel.replaceChildren(new Option('— escolha a camada —', ''));

  const groups = [...(state.manifest.groups || [])];
  if (state.layers.some((L) => L.upload)) groups.unshift({ id: 'uploads', label: 'Meus arquivos' });

  for (const g of groups) {
    const items = state.order.map(getLayer).filter((L) =>
      L && L.slug !== 'estado' && L.group === g.id && L.fields && Object.keys(L.fields).length
    );
    if (!items.length) continue;
    const og = document.createElement('optgroup');
    og.label = g.label;
    for (const L of items) og.appendChild(new Option(L.label, L.slug));
    sel.appendChild(og);
  }

  if (current && getLayer(current)) sel.value = current;
}

function orderedFields(L) {
  const keys = Object.keys(L.fields || {});
  const primary = (L.primary || []).filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !primary.includes(k)).sort((a, b) =>
    fieldLabel(L, a).localeCompare(fieldLabel(L, b), 'pt-BR', { sensitivity: 'base' })
  );
  return [...primary, ...rest];
}

function onFilterLayerChange() {
  const L = getLayer($('#filterLayer').value);
  const fieldSel = $('#filterField');
  const valSel = $('#filterValue');
  const apply = $('#applyFilter');

  apply.disabled = true;
  valSel.disabled = true;
  valSel.replaceChildren(new Option('— escolha o valor —', ''));

  if (!L) {
    fieldSel.disabled = true;
    fieldSel.replaceChildren(new Option('— escolha o campo —', ''));
    return;
  }

  fieldSel.replaceChildren(new Option('— escolha o campo —', ''));
  for (const key of orderedFields(L)) {
    fieldSel.appendChild(new Option(fieldLabel(L, key), key));
  }
  fieldSel.disabled = false;
}

function onFilterFieldChange() {
  const L = getLayer($('#filterLayer').value);
  const key = $('#filterField').value;
  const valSel = $('#filterValue');
  const apply = $('#applyFilter');
  apply.disabled = true;

  if (!L || !key || !L.fields[key]) {
    valSel.disabled = true;
    valSel.replaceChildren(new Option('— escolha o valor —', ''));
    return;
  }

  const meta = L.fields[key];
  valSel.replaceChildren(new Option('— escolha o valor —', ''));
  for (const [v, n] of meta.values) {
    valSel.appendChild(new Option(`${formatValue(v)} (${n})`, v));
  }
  valSel.disabled = false;
}

function onFilterValueChange() {
  $('#applyFilter').disabled = !$('#filterValue').value;
}

function isTerritorialFilter(L, field) {
  return (L.slug === 'municipios' && field === 'MUNICÍPIO') ||
         (L.slug === 'regioes' && field === 'Região de Integração');
}

function listFieldFor(L) {
  return L.slug === 'municipios' ? 'Municipios_lista' : 'RegioesIntegracao_lista';
}

function countValue(L, field, value, ci = false) {
  const values = L.fields?.[field]?.values;
  if (!values) return 0;
  const norm = (s) => (ci ? String(s).toLocaleLowerCase('pt-BR') : String(s));
  const target = norm(value);
  const e = values.find(([v]) => norm(v) === target);
  return e ? e[1] : 0;
}

function applyFilter() {
  const L = getLayer($('#filterLayer').value);
  const field = $('#filterField').value;
  const value = $('#filterValue').value;
  if (!L || !field || !value) return;

  const meta = L.fields[field];
  const territorial = isTerritorialFilter(L, field);
  const listField = territorial ? listFieldFor(L) : null;

  let count = countValue(L, field, value);
  const included = new Set([L.slug]);
  const dimmed = new Set();
  const filters = new Map();
  filters.set(
    L.slug,
    meta.isList
      ? ['in', ['upcase', value], ['upcase', ['get', field]]]
      : ['==', ['get', field], meta.numeric ? Number(value) : value]
  );

  if (territorial) {
    for (const other of state.layers) {
      if (other.slug === L.slug) continue;
      if (other.fields?.[listField]) {
        filters.set(other.slug, ['in', ['upcase', value], ['upcase', ['get', listField]]]);
        included.add(other.slug);
        count += countValue(other, listField, value, true);
      } else {
        dimmed.add(other.slug);
      }
    }
  } else {
    for (const other of state.layers) {
      if (other.slug !== L.slug) dimmed.add(other.slug);
    }
  }

  if (count === 0) {
    toast('Nenhuma feição corresponde a este filtro.', 'error');
    return;
  }

  // garante que a camada filtrada esteja visível
  if (!L.visible) toggleLayer(L);

  for (const l of state.layers) setMapFilter(l, filters.get(l.slug) || null);

  state.filter = {
    layerSlug: L.slug,
    layerLabel: L.label,
    field,
    fieldLabel: fieldLabel(L, field),
    value,
    label: formatValue(value),
    count,
    territorial,
    listField,
    included,
    dimmed,
  };

  refreshLayerStyles();
  renderChips();
  renderFilterResult();
  clearSelection();
  $('#clearFilter').disabled = false;
  $('#applyFilter').disabled = false;

  focusFiltered(L, field, value);

  toast(
    `Filtro aplicado: ${L.label} · ${fieldLabel(L, field)} = ${formatValue(value)} — ` +
    `${count.toLocaleString('pt-BR')} ${count === 1 ? 'feição' : 'feições'}.`
  );
}

/**
 * Localiza o recorte do filtro usando o índice pré-calculado (bbox por valor).
 */
function focusFiltered(L, field, value) {
  if (!state.map) return;

  const meta = L.fields?.[field];
  const indexed = L.zoom?.[field]?.[value];
  let bbox = indexed?.bbox || null;

  // Camadas carregadas pelo usuário não têm índice; calcula na hora.
  if (!bbox && L.upload) {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ft of L.fc?.features || []) {
      if (!matchesFilter(ft.properties, field, value, !!meta?.isList, !!meta?.numeric)) continue;
      const fb = bboxOfFeature(ft);
      if (fb) unionBox(box, fb);
    }
    if (Number.isFinite(box[0])) bbox = box;
  }

  // Reserva: usa apenas os tiles já carregados (caso o índice não exista).
  if (!bbox) {
    const expr = meta?.isList
      ? ['in', ['upcase', value], ['upcase', ['get', field]]]
      : ['==', ['get', field], meta?.numeric ? Number(value) : value];
    let feats = [];
    try {
      feats = state.map.querySourceFeatures(
        L.upload ? L.source : 'territorio',
        L.upload ? { filter: expr } : { sourceLayer: L.slug, filter: expr }
      );
    } catch { /* fonte ainda carregando */ }

    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const f of feats) {
      const fb = bboxOfFeature(f);
      if (fb) unionBox(box, fb);
    }
    if (Number.isFinite(box[0])) bbox = box;
  }

  if (bbox) {
    state.map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
      padding: mapPadding(),
      maxZoom: 12,
      duration: 650,
    });
  }
}

function refocusFilter() {
  const f = state.filter;
  const L = f && getLayer(f.layerSlug);
  if (!L) return;
  focusFiltered(L, f.field, f.value);
  toast(`Recorte: ${f.label} — ${f.count.toLocaleString('pt-BR')} ${f.count === 1 ? 'feição' : 'feições'}.`);
}

function bboxOfFeature(ft) {
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
  if (ft?.geometry?.coordinates) walk(ft.geometry.coordinates);
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

function unionBox(target, box) {
  if (box[0] < target[0]) target[0] = box[0];
  if (box[1] < target[1]) target[1] = box[1];
  if (box[2] > target[2]) target[2] = box[2];
  if (box[3] > target[3]) target[3] = box[3];
  return target;
}

function setMapFilter(L, expr) {
  if (!state.map) return;
  for (const id of idsFor(L)) {
    if (state.map.getLayer(id)) state.map.setFilter(id, expr);
  }
}

function clearFilter() {
  const hadFilter = !!state.filter;
  state.filter = null;
  if (state.map) {
    for (const L of state.layers) setMapFilter(L, null);
  }
  refreshLayerStyles();
  renderChips();
  renderFilterResult();
  const valSel = $('#filterValue');
  if (valSel) {
    valSel.value = '';
    valSel.disabled = !$('#filterField').value;
  }
  const apply = $('#applyFilter');
  if (apply) apply.disabled = true;
  const clear = $('#clearFilter');
  if (clear) clear.disabled = true;
  if (hadFilter) toast('Filtro removido.');
}

function renderChips() {
  const box = $('#chips');
  const f = state.filter;
  if (!f) { box.hidden = true; box.replaceChildren(); return; }

  const chip = document.createElement('div');
  chip.className = 'chip';

  const text = document.createElement('span');
  text.innerHTML = `<b>${esc(f.layerLabel)}</b> · ${esc(f.fieldLabel)} = ${esc(f.label)}`;

  const count = document.createElement('span');
  count.className = 'chip-count';
  count.textContent = `${f.count} ${f.count === 1 ? 'feição' : 'feições'}`;

  const focus = document.createElement('button');
  focus.type = 'button';
  focus.setAttribute('aria-label', 'Ir para o recorte');
  focus.title = 'Ir para o recorte';
  focus.innerHTML = ICONS.target;
  focus.addEventListener('click', refocusFilter);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Limpar filtro');
  btn.title = 'Limpar filtro';
  btn.innerHTML = ICONS.x;
  btn.addEventListener('click', clearFilter);

  chip.append(text, count, focus, btn);
  box.replaceChildren(chip);
  box.hidden = false;
}

function renderFilterResult() {
  const box = $('#filterResult');
  const f = state.filter;
  if (!f) { box.hidden = true; return; }
  $('#filterCount').textContent = f.count.toLocaleString('pt-BR');
  box.hidden = false;
}

/* ------------------------------------------------------------------ */
/* Download                                                            */
/* ------------------------------------------------------------------ */
async function getFullFC(L) {
  if (L.upload) return L.fc;
  if (state.fullCache.has(L.slug)) return state.fullCache.get(L.slug);
  const url = `${FULL_DATA_ROOT}${L.downloadFile}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${L.downloadFile}`);
  const fc = await res.json();
  state.fullCache.set(L.slug, fc);
  return fc;
}

function matchesFilter(props, field, value, isList, numeric) {
  if (isList) {
    const target = String(value).toLocaleLowerCase('pt-BR');
    return String(props?.[field] ?? '')
      .split(',')
      .map((s) => s.trim().toLocaleLowerCase('pt-BR'))
      .includes(target);
  }
  if (numeric) return Number(props?.[field]) === Number(value);
  return String(props?.[field] ?? '').trim() === value;
}

function cleanProps(props) {
  const out = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (k === '_fid' || k === '_label' || k === 'cor_zona') continue;
    out[k] = v;
  }
  return out;
}

async function downloadFiltered() {
  const f = state.filter;
  if (!f || state.busy) return;

  const primary = getLayer(f.layerSlug);
  if (!primary) return;

  const primaryField = primary.fields?.[f.field];
  const targets = [{
    L: primary,
    field: f.field,
    isList: !!primaryField?.isList,
    value: f.value,
    numeric: !!primaryField?.numeric,
  }];
  if (f.territorial) {
    for (const L of state.layers) {
      if (L.slug === primary.slug || !L.fields?.[f.listField]) continue;
      targets.push({ L, field: f.listField, isList: true, value: f.value, numeric: false });
    }
  }

  const btn = $('#downloadBtn');
  const oldHtml = btn.innerHTML;
  state.busy = true;
  btn.disabled = true;
  btn.textContent = 'Preparando…';
  toast(`Preparando GeoJSON (${f.count.toLocaleString('pt-BR')} feições)…`);

  try {
    const features = [];
    for (const t of targets) {
      const fc = await getFullFC(t.L);
      for (const ft of fc.features || []) {
        if (!ft?.geometry) continue;
        if (!matchesFilter(ft.properties, t.field, t.value, t.isList, t.numeric)) continue;
        features.push({ type: 'Feature', geometry: ft.geometry, properties: cleanProps(ft.properties) });
      }
    }

    const out = { type: 'FeatureCollection', features };
    const blob = new Blob([JSON.stringify(out)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${f.layerSlug}_${String(f.value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'recorte'}.geojson`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast(`${features.length.toLocaleString('pt-BR')} feições exportadas.`);
  } catch (err) {
    console.error('[v2] download:', err);
    toast(`Falha ao gerar o GeoJSON: ${err.message}`, 'error');
  } finally {
    state.busy = false;
    btn.disabled = false;
    btn.innerHTML = oldHtml;
  }
}

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */
async function handleUpload(file) {
  if (!file) return;
  const name = file.name || 'arquivo';
  const ext = name.split('.').pop().toLowerCase();
  const btn = $('#uploadBtn');

  btn.disabled = true;
  toast(`Lendo ${name}…`);
  await new Promise((r) => setTimeout(r, 30));

  try {
    let fc = null;

    if (ext === 'geojson' || ext === 'json') {
      fc = JSON.parse(await file.text());
    } else if (ext === 'kml') {
      await loadScript('vendor/togeojson.umd.js');
      if (!window.toGeoJSON?.kml) throw new Error('Leitor KML indisponível.');
      const dom = new DOMParser().parseFromString(await file.text(), 'text/xml');
      fc = window.toGeoJSON.kml(dom);
    } else if (ext === 'zip' || ext === 'shp') {
      await loadScript('vendor/shp.min.js');
      if (typeof window.shp !== 'function') throw new Error('Leitor Shapefile indisponível.');
      fc = await window.shp(await file.arrayBuffer());
      if (Array.isArray(fc)) fc = fc[0];
    } else {
      throw new Error('Formato não suportado. Use GeoJSON, KML ou Shapefile (.zip).');
    }

    if (Array.isArray(fc)) fc = fc[0];
    if (!fc?.features?.length) throw new Error('O arquivo não contém feições válidas.');

    const features = [];
    let i = 1;
    for (const ft of fc.features) {
      if (!ft?.geometry?.coordinates) continue;
      features.push({
        type: 'Feature',
        geometry: ft.geometry,
        properties: { ...(ft.properties || {}), _fid: i++ },
      });
    }
    if (!features.length) throw new Error('O arquivo não contém geometrias válidas.');

    addUpload(name, { type: 'FeatureCollection', features });
    toast(`${features.length.toLocaleString('pt-BR')} feições carregadas de ${name}.`);
  } catch (err) {
    console.error('[v2] upload:', err);
    toast(err.message || 'Falha ao ler o arquivo.', 'error');
  } finally {
    btn.disabled = false;
  }
}

function addUpload(fileName, fc) {
  const slug = `upload-${Date.now().toString(36)}-${state.uploadSeq++}`;
  const color = UPLOAD_COLORS[state.uploadSeq % UPLOAD_COLORS.length];
  const label = fileName.replace(/\.[^.]+$/, '');

  const keys = Object.keys(fc.features[0]?.properties || {}).filter((k) => k !== '_fid');
  const L = {
    slug,
    label,
    group: 'uploads',
    color,
    colorDark: color,
    outline: color,
    kind: 'fill',
    fillOpacity: 0.35,
    opacity: 1,
    visible: true,
    upload: true,
    fc,
    source: `src-${slug}`,
    count: fc.features.length,
    fields: computeFields(fc.features),
    primary: keys.slice(0, 6),
    hidden: [],
    fieldLabels: {},
    downloadFile: null,
  };

  state.layers.push(L);
  state.order.unshift(slug);

  state.map.addSource(L.source, { type: 'geojson', data: fc, promoteId: '_fid' });
  for (const spec of layerSpecs(L)) state.map.addLayer(spec);
  applyOrderToMap();

  renderLayerList();
  renderLegend();
  populateFilterLayers();
  switchTab('layers');
  if (isMobile()) setPanelOpen(true);

  const b = bboxOf(fc);
  if (b) {
    state.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], {
      padding: mapPadding(),
      maxZoom: 14,
      duration: 600,
    });
  }
}

function removeUpload(L) {
  if (state.filter && (state.filter.layerSlug === L.slug || state.filter.included?.has(L.slug))) clearFilter();
  for (const id of idsFor(L)) {
    if (state.map.getLayer(id)) state.map.removeLayer(id);
  }
  if (state.map.getSource(L.source)) state.map.removeSource(L.source);
  state.order = state.order.filter((s) => s !== L.slug);
  state.layers = state.layers.filter((l) => l.slug !== L.slug);
  renderLayerList();
  renderLegend();
  populateFilterLayers();
  toast(`Camada "${L.label}" removida.`);
}

function computeFields(features) {
  if (features.length > 40000) return {};
  const keys = new Set();
  for (const f of features) for (const k of Object.keys(f.properties || {})) keys.add(k);

  const fields = {};
  for (const key of keys) {
    if (key.startsWith('_') || key === 'cor_zona' || /^Shape_/i.test(key)) continue;
    const isList = key.endsWith('_lista');
    const counter = new Map();
    let numeric = true;

    for (const f of features) {
      const v = f.properties?.[key];
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

    if (!counter.size || counter.size > 250) continue;
    const values = [...counter.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], 'pt-BR', { numeric: true, sensitivity: 'base' })
    );
    fields[key] = { isList, numeric, values };
  }
  return fields;
}

function bboxOf(fc) {
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
  for (const f of fc.features) if (f.geometry?.coordinates) walk(f.geometry.coordinates);
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

/* ------------------------------------------------------------------ */
/* Interface                                                           */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* PWA                                                                 */
/* ------------------------------------------------------------------ */
function setupPwa() {
  const installBtn = $('#installBtn');
  const iosHint = $('#iosInstallHint');
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOS && !standalone && iosHint) iosHint.hidden = false;
  if (standalone && installBtn) installBtn.hidden = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (installBtn && !standalone) installBtn.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (installBtn) installBtn.hidden = true;
    toast('Aplicativo instalado.');
  });

  if ('serviceWorker' in navigator) {
    const secure =
      location.protocol === 'https:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';
    if (secure) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => {
          console.warn('[pwa] service worker:', err);
        });
      }, { once: true });
    }
  }
}

function bindUI() {
  bindLayerList();

  $('#panelToggle').addEventListener('click', () => setPanelOpen(!$('#panel').classList.contains('open')));
  $('#panelClose').addEventListener('click', () => setPanelOpen(false));

  $('#tabLayers').addEventListener('click', () => switchTab('layers'));
  $('#tabFilter').addEventListener('click', () => switchTab('filter'));

  $('#themeBtn').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = state.theme;
    refreshBasemapVisibility();
    refreshLayerStyles();
    renderLegend();
    savePrefs();
  });

  $('#basemapBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleBasemapMenu();
  });
  $$('#basemapMenu .menu-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.basemap = btn.dataset.basemap === 'satellite' ? 'satellite' : 'neutral';
      refreshBasemapVisibility();
      updateBasemapMenu();
      closeBasemapMenu();
      savePrefs();
    });
  });
  updateBasemapMenu();

  $('#uploadBtn').addEventListener('click', () => $('#fileInput').click());
  $('#installBtn').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    try { await deferredInstallPrompt.userChoice; } catch { /* cancelado */ }
    deferredInstallPrompt = null;
    $('#installBtn').hidden = true;
  });
  $('#fileInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await handleUpload(file);
  });

  $('#aboutBtn').addEventListener('click', () => { $('#aboutModal').hidden = false; });
  $('#aboutClose').addEventListener('click', () => { $('#aboutModal').hidden = true; });
  $('#aboutOk').addEventListener('click', () => { $('#aboutModal').hidden = true; });
  $('#aboutModal').addEventListener('click', (e) => {
    if (e.target === $('#aboutModal')) $('#aboutModal').hidden = true;
  });

  $('#legendBtn').addEventListener('click', () => {
    const legend = $('#legend');
    const open = legend.hidden;
    legend.hidden = !open;
    $('#legendBtn').setAttribute('aria-expanded', String(open));
  });

  $('#outlineToggle').addEventListener('change', (e) => {
    state.outline = e.target.checked;
    refreshLayerStyles();
    renderLegend();
    savePrefs();
  });

  $('#resetBtn').addEventListener('click', resetAll);

  $('#orderBtn').addEventListener('click', () => {
    if ($('#orderList').hidden) enterOrderMode();
    else exitOrderMode();
  });
  $('#orderDone').addEventListener('click', exitOrderMode);

  $('#insClose').addEventListener('click', closeInspector);

  $('#filterLayer').addEventListener('change', onFilterLayerChange);
  $('#filterField').addEventListener('change', onFilterFieldChange);
  $('#filterValue').addEventListener('change', onFilterValueChange);
  $('#applyFilter').addEventListener('click', applyFilter);
  $('#clearFilter').addEventListener('click', clearFilter);
  $('#downloadBtn').addEventListener('click', downloadFiltered);

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-wrap')) closeBasemapMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#aboutModal').hidden) { $('#aboutModal').hidden = true; return; }
    if (!$('#inspector').hidden) { closeInspector(); return; }
    closeBasemapMenu();
    if (isMobile()) setPanelOpen(false);
  });

  window.addEventListener('resize', () => {
    if (!isMobile() && $('#panel').classList.contains('open')) {
      $('#panelToggle').setAttribute('aria-expanded', 'false');
    }
  });
}

function setPanelOpen(open) {
  $('#panel').classList.toggle('open', open);
  $('#panelToggle').setAttribute('aria-expanded', String(open));
  if (open) closeBasemapMenu();
}

function switchTab(tab) {
  const layers = tab === 'layers';
  $('#paneLayers').hidden = !layers;
  $('#paneFilter').hidden = layers;
  $('#tabLayers').classList.toggle('active', layers);
  $('#tabFilter').classList.toggle('active', !layers);
  $('#tabLayers').setAttribute('aria-selected', String(layers));
  $('#tabFilter').setAttribute('aria-selected', String(!layers));
}

function toggleBasemapMenu() {
  const menu = $('#basemapMenu');
  const open = menu.hidden;
  menu.hidden = !open;
  $('#basemapBtn').setAttribute('aria-expanded', String(open));
  if (open) updateBasemapMenu();
}

function closeBasemapMenu() {
  const menu = $('#basemapMenu');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  $('#basemapBtn').setAttribute('aria-expanded', 'false');
}

function updateBasemapMenu() {
  $$('#basemapMenu .menu-item').forEach((btn) => {
    const active = btn.dataset.basemap === state.basemap;
    btn.setAttribute('aria-checked', String(active));
  });
}

function resetAll() {
  const prefs = state.prefs.layers || {};
  void prefs;
  for (const L of state.layers) {
    if (L.upload) continue;
    L.visible = !!L.default;
    L.opacity = 1;
    for (const id of idsFor(L)) {
      if (state.map?.getLayer(id)) state.map.setLayoutProperty(id, 'visibility', L.visible ? 'visible' : 'none');
    }
  }
  state.outline = false;
  $('#outlineToggle').checked = false;
  state.basemap = 'neutral';
  refreshBasemapVisibility();
  updateBasemapMenu();

  const known = state.manifest.layers.map((L) => L.slug);
  const uploads = state.order.filter((s) => getLayer(s)?.upload);
  state.order = [...uploads, ...known];

  clearFilter();
  refreshLayerStyles();
  applyOrderToMap();
  renderLayerList();
  renderLegend();
  savePrefs();

  if (state.map) {
    state.map.fitBounds(
      [[state.manifest.extent[0], state.manifest.extent[1]], [state.manifest.extent[2], state.manifest.extent[3]]],
      { padding: mapPadding(), duration: 700 }
    );
  }
  toast('Visualização restaurada.');
}
