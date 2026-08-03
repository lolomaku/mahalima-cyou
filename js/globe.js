import { categoryColor, escapeHtml, rgbaFromHex } from './config.js';

const COUNTRIES_GEOJSON_URL = './data/countries-simplified.json';
const US_STATES_TOPOJSON_URL = './data/us-states-simplified.json';
const POLYGON_CACHE_KEY = 'globePolygonsCacheV1';

const IS_MOBILE = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 768;

const OCEAN_COLOR = '#35A7FF';
const LAND_COLOR = '#FFE5D9';
const LAND_HOVER_COLOR = '#FFE94A';
const LAND_SCHEDULE_COLOR = '#38B000';
const OUTLINE_COLOR = '#0f172a';

const LAND_ALTITUDE = IS_MOBILE ? 0.005 : 0.008;
const LAND_HOVER_ALTITUDE = IS_MOBILE ? 0.007 : 0.02;
const LAND_SCHEDULE_ALTITUDE = IS_MOBILE ? 0.006 : 0.014;
const POINT_ALTITUDE = 0.026;
const PULSE_ALTITUDE = 0.028;

const SCHEDULE_LABEL_ALTITUDE = 0.03;

const CLUSTER_THRESHOLD_DEG = 0.6;
const CLUSTER_POINT_RADIUS_BASE = 0.36;
const CLUSTER_POINT_RADIUS_STEP = 0.12;
const CLUSTER_POINT_RADIUS_MAX = 0.75;
const PIN_COLOR = '#FF5964';

const ARC_COLOR_RGB = '255,89,100';
const ARC_OPACITY = 0.9;
const ARC_OPACITY_PAST = 0.3;
const ARC_ALTITUDE_SCALE = 0.5;
const STATUS_REFRESH_SAFETY_BUFFER_MS = 1000;
const STATUS_REFRESH_MAX_WAIT_MS = 24 * 60 * 60 * 1000;

const ARC_DASH_LENGTH = 0.4;
const ARC_DASH_GAP = 4;
const ARC_DASH_ANIMATE_MS = 2500;

const BROKEN_DASH_LENGTH = 0.12;
const BROKEN_DASH_GAP = 0.12;
const BROKEN_DASH_ANIMATE_MS = 6000;

function arcDashLengthFor(status) {
  return status === 'future' ? ARC_DASH_LENGTH : BROKEN_DASH_LENGTH;
}
function arcDashGapFor(status) {
  return status === 'future' ? ARC_DASH_GAP : BROKEN_DASH_GAP;
}
function arcDashAnimateTimeFor(status) {
  return status === 'future' ? ARC_DASH_ANIMATE_MS : BROKEN_DASH_ANIMATE_MS;
}

const USER_ROTATE_PAUSE_MS = 3000;

const AUTO_ROTATE_SPEED = 0.35;
const MOBILE_AUTO_ROTATE_SPEED = 0.15;
const MAX_PIXEL_RATIO = IS_MOBILE ? 1.5 : 2;
const POINT_RESOLUTION = 12;

const RING_MAX_RADIUS_DEG = 3;
const RING_PROPAGATION_SPEED_DEG_PER_SEC = 1.2;
const RING_REPEAT_PERIOD_BASE_MS = 1400;
const RING_REPEAT_PERIOD_JITTER_MS = 900;

const MAX_ANIMATED_PINS = IS_MOBILE ? 1 : 5;
const PIN_ANIMATION_ROTATE_INTERVAL_MS = 4000;

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let world = null;
let hoveredPolygon = null;

let masterSightings = [];
let hiddenCategories = [];
let dateFilter = { month: 'all', year: 'all' };
let regionClickHandler = null;

let rotationLockCount = 0;
let userRotateResumeTimeout = null;

let flightTrajectories = [];
let statusRefreshHandle = null;

let resizeHandler = null;
let controlsStartHandler = null;
let controlsEndHandler = null;

let currentDisplaySightings = [];
let currentScheduleLabels = [];
let currentClusterBadges = [];
let pinAnimationRotateHandle = null;

let scheduleHighlightPolygon = null;

export function buildGlobe(sightings, { onRegionClick, onGlobeClick }) {
  const el = document.getElementById('globeViz');
  masterSightings = sightings;
  regionClickHandler = onRegionClick;

  world = Globe()(el)
    .globeImageUrl(null)
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true)
    .atmosphereColor(OCEAN_COLOR)
    .atmosphereAltitude(0.18)
    .width(window.innerWidth)
    .height(window.innerHeight)

    .polygonsData([])
    .polygonCapColor(d => polygonCapColorFor(d))
    .polygonSideColor(() => 'rgba(15,23,42,0.55)')
    .polygonStrokeColor(() => OUTLINE_COLOR)
    .polygonAltitude(d => polygonAltitudeFor(d))
    .polygonsTransitionDuration(150)
    .polygonLabel(d => `
      <div class="cartoon-tooltip">
        <strong>${escapeHtml(d.properties?.displayName || 'Unknown')}</strong>
      </div>
    `)
    .onPolygonHover(d => {
      hoveredPolygon = d;
      world
        .polygonCapColor(p => polygonCapColorFor(p))
        .polygonAltitude(p => polygonAltitudeFor(p));
      el.style.cursor = d ? 'pointer' : 'grab';
    })
    .onPolygonClick(handlePolygonClick)

    .pointsData([])
    .pointLat('displayLat')
    .pointLng('displayLng')
    .pointColor(() => PIN_COLOR)
    .pointAltitude(POINT_ALTITUDE)
    .pointRadius(d => (d._kind === 'cluster' ? clusterPointRadius(d._sightings.length) : 0.36))
    .pointResolution(POINT_RESOLUTION)
    .pointLabel(d => d._kind === 'cluster'
      ? `
        <div class="cartoon-tooltip">
          <strong>${d._sightings.length} sightings nearby</strong><br/>Tap to see them all
        </div>
      `
      : `
        <div class="cartoon-tooltip">
          <strong>${escapeHtml(d.title)}</strong><br/>${escapeHtml(d.category)}
        </div>
      `)
    .onPointClick(handlePointClick)

    .arcsData([])
    .arcColor(d => statusArcColor(d._status))
    .arcAltitudeAutoScale(ARC_ALTITUDE_SCALE)
    .arcStroke(d => (d._status === 'current' ? 1 : 0.45))
    .arcDashLength(d => arcDashLengthFor(d._status))
    .arcDashGap(d => arcDashGapFor(d._status))
    .arcDashInitialGap(d => arcDashJitterFraction(d) * (arcDashLengthFor(d._status) + arcDashGapFor(d._status)))
    .arcDashAnimateTime(d => arcDashAnimateTimeFor(d._status))
    .arcLabel(d => `
      <div class="cartoon-tooltip">
        <strong>${escapeHtml(d.startPlace)} → ${escapeHtml(d.endPlace)}</strong><br/>
        ${formatArcDate(d.departureTime)} → ${formatArcDate(d.arrivalTime)}
      </div>
    `)

    .htmlElementsData([])
    .htmlLat('lat')
    .htmlLng('lng')
    .htmlAltitude(SCHEDULE_LABEL_ALTITUDE)
    .htmlElement(d => {
      const el = document.createElement('div');
      if (d.kind === 'cluster') {
        el.className = 'pin-cluster-badge';
        el.textContent = String(d.count);
      } else {
        el.className = 'trajectory-label';
        el.textContent = `${formatArcDate(d.date)} · ${d.place}`;
      }
      return el;
    })

    .ringsData([])
    .ringLat('displayLat')
    .ringLng('displayLng')
    .ringAltitude(PULSE_ALTITUDE)
    .ringColor(d => ringColorFor(d))
    .ringMaxRadius(RING_MAX_RADIUS_DEG)
    .ringPropagationSpeed(RING_PROPAGATION_SPEED_DEG_PER_SEC)
    .ringRepeatPeriod(d => RING_REPEAT_PERIOD_BASE_MS + ringJitterFraction(d) * RING_REPEAT_PERIOD_JITTER_MS)

    .onGlobeClick(onGlobeClick);

  const mat = world.globeMaterial();
  mat.color.set(OCEAN_COLOR);
  mat.shininess = 0;

  world.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));

  world.controls().autoRotate = true;
  world.controls().autoRotateSpeed = IS_MOBILE ? MOBILE_AUTO_ROTATE_SPEED : AUTO_ROTATE_SPEED;
  world.controls().enableDamping = true;

  controlsStartHandler = () => {
    clearTimeout(userRotateResumeTimeout);
    world.controls().autoRotate = false;
  };
  controlsEndHandler = () => {
    clearTimeout(userRotateResumeTimeout);
    userRotateResumeTimeout = setTimeout(() => {
      if (rotationLockCount === 0) world.controls().autoRotate = true;
    }, USER_ROTATE_PAUSE_MS);
  };
  world.controls().addEventListener('start', controlsStartHandler);
  world.controls().addEventListener('end', controlsEndHandler);

  resizeHandler = () => {
    world.width(window.innerWidth).height(window.innerHeight);
  };
  window.addEventListener('resize', resizeHandler);

  loadPolygonData()
    .then(features => {
      world.polygonsData(features);
      refreshTrajectoryDisplay();
    })
    .catch(err => console.error('Failed to load country/state polygons:', err));

  initDateFilter(sightings);
  redrawDots();

  clearInterval(pinAnimationRotateHandle);
  pinAnimationRotateHandle = setInterval(rotateAnimatedPins, PIN_ANIMATION_ROTATE_INTERVAL_MS);

  return world;
}

function ringColorFor(d) {
  const hex = categoryColor(d.category);
  return t => rgbaFromHex(hex, 1 - t);
}

function ringJitterFraction(d) {
  return stableHashFraction(d.social_url || d.title || '');
}

function arcDashJitterFraction(t) {
  return stableHashFraction(`${t.startPlace}|${t.endPlace}|${t.departureTime}`);
}

function stableHashFraction(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}

function polygonCapColorFor(p) {
  if (p === hoveredPolygon) return LAND_HOVER_COLOR;
  if (p === scheduleHighlightPolygon) return LAND_SCHEDULE_COLOR;
  return LAND_COLOR;
}

function polygonAltitudeFor(p) {
  if (p === hoveredPolygon) return LAND_HOVER_ALTITUDE;
  if (p === scheduleHighlightPolygon) return LAND_SCHEDULE_ALTITUDE;
  return LAND_ALTITUDE;
}

function initDateFilter(sightings) {
  const monthSel = document.getElementById('filter-month');
  const yearSel = document.getElementById('filter-year');
  if (!monthSel || !yearSel) return;

  monthSel.innerHTML = '<option value="all">All Months</option>' +
    MONTH_NAMES.map((name, i) => `<option value="${i + 1}">${name}</option>`).join('');

  const years = [...new Set(sightings.map(s => (s.date || '').slice(0, 4)).filter(Boolean))].sort();
  yearSel.innerHTML = '<option value="all">All Years</option>' +
    years.map(y => `<option value="${y}">${y}</option>`).join('');

  monthSel.addEventListener('change', () => {
    dateFilter.month = monthSel.value;
    redrawDots();
  });
  yearSel.addEventListener('change', () => {
    dateFilter.year = yearSel.value;
    redrawDots();
  });
}

function passesDateFilter(sighting) {
  if (dateFilter.month === 'all' && dateFilter.year === 'all') return true;
  if (!sighting.date) return false;
  const [year, month] = sighting.date.split('-');
  if (dateFilter.year !== 'all' && year !== dateFilter.year) return false;
  if (dateFilter.month !== 'all' && String(Number(month)) !== dateFilter.month) return false;
  return true;
}

function getVisibleSightings() {
  return masterSightings
    .filter(s => !hiddenCategories.includes(s.category))
    .filter(passesDateFilter);
}

function redrawDots() {
  if (!world) return;
  const visible = getVisibleSightings();
  const { display, clusterBadges } = groupAndDisplaySightings(visible);
  currentDisplaySightings = display;
  currentClusterBadges = clusterBadges;
  world
    .pointsData(display)
    .ringsData(pickRandomAnimatedPins(display.filter(d => d._kind !== 'cluster')))
    .arcsData(flightTrajectories);
  syncHtmlLayer();
}

function syncHtmlLayer() {
  if (!world) return;
  world.htmlElementsData([...currentScheduleLabels, ...currentClusterBadges]);
}

function pickRandomAnimatedPins(sightings) {
  if (sightings.length <= MAX_ANIMATED_PINS) return sightings;

  const pool = sightings.slice();
  const picked = [];
  for (let i = 0; i < MAX_ANIMATED_PINS; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

function rotateAnimatedPins() {
  if (!world || document.hidden || !currentDisplaySightings.length) return;
  world.ringsData(pickRandomAnimatedPins(currentDisplaySightings.filter(d => d._kind !== 'cluster')));
}

function groupAndDisplaySightings(sightings) {
  const groups = groupByCoarseProximity(sightings);
  const display = [];
  const clusterBadges = [];

  for (const group of groups) {
    if (group.length === 1) {
      const s = group[0];
      display.push({ ...s, _kind: 'pulse', realLat: s.lat, realLng: s.lng, displayLat: s.lat, displayLng: s.lng });
      continue;
    }

    const centroidLat = average(group, s => s.lat);
    const centroidLng = average(group, s => s.lng);
    display.push({
      _kind: 'cluster',
      _sightings: group,
      category: majorityCategory(group),
      title: `${group.length} sightings nearby`,
      displayLat: centroidLat,
      displayLng: centroidLng,
      realLat: centroidLat,
      realLng: centroidLng,
    });
    clusterBadges.push({ kind: 'cluster', lat: centroidLat, lng: centroidLng, count: group.length });
  }

  return { display, clusterBadges };
}

function groupByCoarseProximity(sightings) {
  const groups = new Map();
  const solo = [];
  for (const s of sightings) {
    if (s.lat == null || s.lng == null) { solo.push([s]); continue; }
    const key = clusterGroupKey(s.lat, s.lng);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return [...groups.values(), ...solo];
}

function clusterGroupKey(lat, lng) {
  const cell = 1 / CLUSTER_THRESHOLD_DEG;
  return `${Math.round(lat * cell)}:${Math.round(lng * cell)}`;
}

function average(items, fn) {
  return items.reduce((sum, item) => sum + fn(item), 0) / items.length;
}

function majorityCategory(group) {
  const counts = new Map();
  for (const s of group) counts.set(s.category, (counts.get(s.category) || 0) + 1);
  let best = group[0].category;
  let bestCount = 0;
  for (const [category, count] of counts) {
    if (count > bestCount) { best = category; bestCount = count; }
  }
  return best;
}

function clusterPointRadius(count) {
  return Math.min(CLUSTER_POINT_RADIUS_MAX, CLUSTER_POINT_RADIUS_BASE + Math.sqrt(count) * CLUSTER_POINT_RADIUS_STEP);
}

function handlePointClick(point) {
  if (!point || point._kind !== 'cluster') return;
  regionClickHandler?.(`${point._sightings.length} sightings nearby`, point._sightings, {
    lat: point.displayLat,
    lng: point.displayLng,
  });
}

function handlePolygonClick(polygon) {
  if (!polygon) return;
  const regionName = polygon.properties?.displayName || 'Unknown region';
  const matches = getVisibleSightings().filter(s =>
    pointInFeature([s.lng, s.lat], polygon.geometry)
  );
  const centroid = regionCentroid(polygon.geometry);
  regionClickHandler?.(regionName, matches, centroid);
}

function regionCentroid(geometry) {
  if (!geometry) return null;

  const candidatePolygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : null;

  if (!candidatePolygons || !candidatePolygons.length) return null;

  let largest = candidatePolygons[0];
  let largestArea = polygonNetArea(largest);
  for (let i = 1; i < candidatePolygons.length; i++) {
    const area = polygonNetArea(candidatePolygons[i]);
    if (area > largestArea) {
      largestArea = area;
      largest = candidatePolygons[i];
    }
  }

  const pole = poleOfInaccessibility(largest);
  if (pole) return pole;

  const ring = largest[0];
  if (!ring || !ring.length) return null;
  const sum = ring.reduce((acc, [lng, lat]) => {
    acc.lat += lat;
    acc.lng += lng;
    return acc;
  }, { lat: 0, lng: 0 });
  return { lat: sum.lat / ring.length, lng: sum.lng / ring.length };
}

function polygonNetArea(rings) {
  let area = Math.abs(ringArea(rings[0]));
  for (let i = 1; i < rings.length; i++) {
    area -= Math.abs(ringArea(rings[i]));
  }
  return area;
}

function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return sum / 2;
}

function poleOfInaccessibility(rings) {
  const outer = rings[0];
  if (!outer || !outer.length) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of outer) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const GRID = 12;
  const ITERATIONS = 5;

  let cx = (minX + maxX) / 2;
  let cy = (minY + maxY) / 2;
  let halfW = (maxX - minX) / 2;
  let halfH = (maxY - minY) / 2;
  let best = { x: cx, y: cy, d: -Infinity };

  for (let iter = 0; iter < ITERATIONS; iter++) {
    let found = { x: cx, y: cy, d: -Infinity };
    for (let i = 0; i <= GRID; i++) {
      const x = cx - halfW + (2 * halfW * i) / GRID;
      for (let j = 0; j <= GRID; j++) {
        const y = cy - halfH + (2 * halfH * j) / GRID;
        const d = signedDistanceToRings([x, y], rings);
        if (d > found.d) found = { x, y, d };
      }
    }
    if (found.d > best.d) best = found;
    cx = found.x;
    cy = found.y;
    halfW /= GRID / 2;
    halfH /= GRID / 2;
  }

  return best.d > 0 ? { lat: best.y, lng: best.x } : null;
}

function signedDistanceToRings(point, rings) {
  const inside = pointInPolygonCoords(point, rings);
  let minDist = Infinity;
  for (const ring of rings) {
    for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
      const d = distToSegment(point, ring[j], ring[i]);
      if (d < minDist) minDist = d;
    }
  }
  return inside ? minDist : -minDist;
}

function distToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const nx = ax + t * dx;
  const ny = ay + t * dy;
  return Math.hypot(px - nx, py - ny);
}

const COASTAL_TOLERANCE_KM = 2;

function pointInFeature(point, geometry, toleranceKm = COASTAL_TOLERANCE_KM) {
  if (!geometry) return false;

  const exactMatch = geometry.type === 'Polygon'
    ? pointInPolygonCoords(point, geometry.coordinates)
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates.some(poly => pointInPolygonCoords(point, poly))
      : false;

  if (exactMatch || toleranceKm <= 0) return exactMatch;

  return distanceToGeometryKm(point, geometry) <= toleranceKm;
}

function pointInPolygonCoords(point, rings) {
  let inside = false;
  for (const ring of rings) {
    if (rayCast(point, ring)) inside = !inside;
  }
  return inside;
}

function rayCast([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distanceToGeometryKm(point, geometry) {
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : [];

  const [px, py] = point;
  const kmPerDegLng = 111.320 * Math.cos((py * Math.PI) / 180);
  const kmPerDegLat = 110.574;

  let minDistKm = Infinity;
  for (const rings of polygons) {
    for (const ring of rings) {
      for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
        const a = [(ring[j][0] - px) * kmPerDegLng, (ring[j][1] - py) * kmPerDegLat];
        const b = [(ring[i][0] - px) * kmPerDegLng, (ring[i][1] - py) * kmPerDegLat];
        const d = distToSegment([0, 0], a, b);
        if (d < minDistKm) minDistKm = d;
      }
    }
  }
  return minDistKm;
}

function decodeTopologyArcs(topology) {
  const transform = topology.transform;
  return topology.arcs.map(arc => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return transform
        ? [x * transform.scale[0] + transform.translate[0], y * transform.scale[1] + transform.translate[1]]
        : [x, y];
    });
  });
}

function arcPoints(index, decodedArcs) {
  const i = index < 0 ? ~index : index;
  const pts = decodedArcs[i];
  return index < 0 ? pts.slice().reverse() : pts;
}

function ringFromArcIndices(indices, decodedArcs) {
  let pts = [];
  indices.forEach((idx, i) => {
    const a = arcPoints(idx, decodedArcs);
    pts = pts.concat(i === 0 ? a : a.slice(1));
  });
  return pts;
}

function geometryToGeoJSON(geom, decodedArcs) {
  switch (geom.type) {
    case 'GeometryCollection':
      return { type: 'GeometryCollection', geometries: geom.geometries.map(g => geometryToGeoJSON(g, decodedArcs)) };
    case 'Point':
      return { type: 'Point', coordinates: geom.coordinates };
    case 'MultiPoint':
      return { type: 'MultiPoint', coordinates: geom.coordinates };
    case 'LineString':
      return { type: 'LineString', coordinates: ringFromArcIndices(geom.arcs, decodedArcs) };
    case 'MultiLineString':
      return { type: 'MultiLineString', coordinates: geom.arcs.map(indices => ringFromArcIndices(indices, decodedArcs)) };
    case 'Polygon':
      return { type: 'Polygon', coordinates: geom.arcs.map(indices => ringFromArcIndices(indices, decodedArcs)) };
    case 'MultiPolygon':
      return { type: 'MultiPolygon', coordinates: geom.arcs.map(poly => poly.map(indices => ringFromArcIndices(indices, decodedArcs))) };
    default:
      return null;
  }
}

function topojsonToFeatureCollection(topology, object) {
  const decodedArcs = decodeTopologyArcs(topology);
  const geometries = object.type === 'GeometryCollection' ? object.geometries : [object];
  return {
    type: 'FeatureCollection',
    features: geometries.map(g => ({
      type: 'Feature',
      properties: g.properties || {},
      geometry: geometryToGeoJSON(g, decodedArcs),
    })),
  };
}

const POLYGON_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function readPolygonCache(cacheKey) {
  try {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;
    const { savedAt, features } = JSON.parse(cached);
    if (!savedAt || Date.now() - savedAt > POLYGON_CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    return features;
  } catch {
    return null;
  }
}

function writePolygonCache(cacheKey, features) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), features }));
  } catch {}
}

async function loadPolygonData() {
  const includeStates = !IS_MOBILE;
  const cacheKey = `${POLYGON_CACHE_KEY}:${includeStates ? 'full' : 'mobile'}`;

  const cached = readPolygonCache(cacheKey);
  if (cached) return cached;

  const [countriesGeo, statesTopo] = await Promise.all([
    fetch(COUNTRIES_GEOJSON_URL).then(res => res.json()),
    includeStates ? fetch(US_STATES_TOPOJSON_URL).then(res => res.json()) : Promise.resolve(null),
  ]);

  const countryFeatures = countriesGeo.features
    .filter(f => !includeStates || !isUnitedStates(f))
    .map(f => {
      f.properties.displayName = f.properties?.NAME || f.properties?.name || 'Unknown';
      return f;
    });

  const features = statesTopo
    ? [
        ...countryFeatures,
        ...topojsonToFeatureCollection(statesTopo, statesTopo.objects.states).features.map(f => {
          const stateName = f.properties?.name || 'Unknown';
          f.properties.displayName = `${stateName}, United States`;
          return f;
        }),
      ]
    : countryFeatures;

  writePolygonCache(cacheKey, features);
  return features;
}

function isUnitedStates(feature) {
  const p = feature.properties || {};
  return (
    p.ISO_A3 === 'USA' ||
    p.ADM0_A3 === 'USA' ||
    p.NAME === 'United States of America' ||
    p.name === 'United States of America'
  );
}

export function focusCamera(lat, lng, altitude = 1.5, duration = 1000) {
  if (!world || lat == null || lng == null) return;
  world.pointOfView({ lat, lng, altitude }, duration);
}

export function pauseGlobeRotation() {
  rotationLockCount++;
  if (world) world.controls().autoRotate = false;
}

export function resumeGlobeRotation() {
  rotationLockCount = Math.max(0, rotationLockCount - 1);
  if (world && rotationLockCount === 0) world.controls().autoRotate = true;
}

function formatArcDate(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

function statusArcColor(status) {
  const opacity = status === 'past' ? ARC_OPACITY_PAST : ARC_OPACITY;
  const color = `rgba(${ARC_COLOR_RGB},${opacity})`;
  return [color, color];
}

function annotateTrajectoryStatuses(trajectories) {
  const now = Date.now();
  let highlightAssigned = false;
  return trajectories.map(t => {
    const arrived = new Date(t.arrivalTime).getTime() < now;
    if (arrived) return { ...t, _status: 'past' };
    if (!highlightAssigned) {
      highlightAssigned = true;
      return { ...t, _status: 'current' };
    }
    return { ...t, _status: 'future' };
  });
}

function findScheduleHighlightPolygon(annotated) {
  if (!world) return null;
  const current = annotated.find(t => t._status === 'current');
  const target = current || annotated[annotated.length - 1];
  if (!target) return null;

  const lat = current ? target.startLat : target.endLat;
  const lng = current ? target.startLng : target.endLng;

  const polygons = world.polygonsData();
  return polygons.find(p => pointInFeature([lng, lat], p.geometry)) || null;
}

function buildScheduleLabels(trajectories) {
  const seen = new Set();
  const labels = [];

  trajectories.forEach(t => {
    [
      { lat: t.startLat, lng: t.startLng, date: t.departureTime, place: t.startPlace },
      { lat: t.endLat, lng: t.endLng, date: t.arrivalTime, place: t.endPlace },
    ].forEach(point => {
      const key = `${point.lat.toFixed(3)},${point.lng.toFixed(3)},${point.date}`;
      if (seen.has(key)) return;
      seen.add(key);
      labels.push({ ...point, kind: 'schedule' });
    });
  });

  return labels;
}

function refreshTrajectoryDisplay() {
  if (!world) return;
  const annotated = annotateTrajectoryStatuses(flightTrajectories);
  scheduleHighlightPolygon = findScheduleHighlightPolygon(annotated);
  currentScheduleLabels = buildScheduleLabels(annotated);
  world
    .arcsData(annotated)
    .polygonCapColor(p => polygonCapColorFor(p))
    .polygonAltitude(p => polygonAltitudeFor(p));
  syncHtmlLayer();
}

function scheduleNextStatusRefresh() {
  clearTimeout(statusRefreshHandle);
  statusRefreshHandle = null;
  if (!flightTrajectories.length) return;

  const now = Date.now();
  const upcomingArrivals = flightTrajectories
    .map(t => new Date(t.arrivalTime).getTime())
    .filter(ms => Number.isFinite(ms) && ms > now);

  if (!upcomingArrivals.length) return;

  const nextBoundaryMs = Math.min(...upcomingArrivals) - now + STATUS_REFRESH_SAFETY_BUFFER_MS;
  const isRealBoundary = nextBoundaryMs <= STATUS_REFRESH_MAX_WAIT_MS;
  const delay = Math.min(nextBoundaryMs, STATUS_REFRESH_MAX_WAIT_MS);

  statusRefreshHandle = setTimeout(() => {
    if (isRealBoundary) refreshTrajectoryDisplay();
    scheduleNextStatusRefresh();
  }, delay);
}

export function setTrajectories(trajectories) {
  flightTrajectories = trajectories || [];
  refreshTrajectoryDisplay();
  scheduleNextStatusRefresh();
}

export function getWorld() {
  return world;
}

export function destroyGlobe() {
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  resizeHandler = null;

  if (world) {
    if (controlsStartHandler) world.controls().removeEventListener('start', controlsStartHandler);
    if (controlsEndHandler) world.controls().removeEventListener('end', controlsEndHandler);
  }
  controlsStartHandler = null;
  controlsEndHandler = null;

  clearTimeout(userRotateResumeTimeout);
  userRotateResumeTimeout = null;

  clearTimeout(statusRefreshHandle);
  statusRefreshHandle = null;

  clearInterval(pinAnimationRotateHandle);
  pinAnimationRotateHandle = null;
  currentDisplaySightings = [];
  currentScheduleLabels = [];
  currentClusterBadges = [];

  if (world) {
    const renderer = world.renderer();
    renderer?.dispose();
    renderer?.domElement?.remove();
    world._destructor?.();
  }

  world = null;
  hoveredPolygon = null;
  scheduleHighlightPolygon = null;
  masterSightings = [];
  hiddenCategories = [];
  flightTrajectories = [];
  regionClickHandler = null;
  rotationLockCount = 0;
}

export function refreshGlobeData(sightings) {
  masterSightings = sightings;
  redrawDots();
}

export function filterGlobeData(sightings, hidden) {
  masterSightings = sightings;
  hiddenCategories = hidden;
  redrawDots();
}