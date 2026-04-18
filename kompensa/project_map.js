// ==========================
// Initiera kartan
// ==========================
let map = L.map('map').setView([62.0, 15.0], 5);
L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

// ==========================
// Bakgrundskartor
// ==========================
const MAPBOX_TOKEN = 'pk.eyJ1IjoiZ2lzam9oYW4iLCJhIjoiY21ub2UxaHB3MXg2eTJycXRxYXg2OTg3NSJ9.OdyF-gw55kaOot9eHxVjNA';

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19
});

const mapboxStreets = L.tileLayer(
  `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`,
  {
    attribution: '© Mapbox © OpenStreetMap',
    tileSize: 512,
    zoomOffset: -1,
    maxZoom: 20,
    updateWhenZooming: false,
    updateWhenIdle: true,
    keepBuffer: 4
  }
);

const mapboxSatellite = L.tileLayer(
  `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/512/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`,
  {
    attribution: '© Mapbox © OpenStreetMap',
    tileSize: 512,
    zoomOffset: -1,
    maxZoom: 20,
    updateWhenZooming: false,
    updateWhenIdle: true,
    keepBuffer: 4
  }
);

mapboxStreets.on('tileerror', function (e) {
  console.error('Mapbox Streets tile error:', e.tile?.src || e);
});

mapboxSatellite.on('tileerror', function (e) {
  console.error('Mapbox Satellite tile error:', e.tile?.src || e);
});

osm.addTo(map);

const baseMaps = {
  'OpenStreetMap': osm,
  'Mapbox Streets': mapboxStreets,
  'Mapbox Satellite': mapboxSatellite
};

L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

map.on('baselayerchange', function (e) {
  updateTurbineIconsForBaselayer(e.name);
});

let turbinesLayer, residencesLayer;
let currentRows = [];
let residencesMinZoom = null;
let activeScenario = 'base';
let currentMode = 'scenario';
let scenarioResults = { low: null, base: null, high: null };
let manualResult = null;
let resultsOverlayEl = null;

const scenarioMeta = {
  low: { label: 'Låg', key: 'low' },
  base: { label: 'Bas', key: 'base' },
  high: { label: 'Hög', key: 'high' }
};

// ==========================
// proj4 – definiera SWEREF vi stödjer
// ==========================
if (typeof proj4 !== 'undefined') {
  if (!proj4.defs['EPSG:3006']) {
    proj4.defs(
      'EPSG:3006',
      '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
    );
  }
}

// ==========================
// Turbinikoner
// ==========================
const turbineIconDefault = L.icon({
  iconUrl: 'icons/turbine.png',
  iconSize: [50, 50],
  iconAnchor: [25, 25]
});

const turbineIconWhite = L.icon({
  iconUrl: 'icons/white_turbine.png',
  iconSize: [50, 50],
  iconAnchor: [25, 25]
});

let turbineIcon = turbineIconDefault;

// ==========================
// Husikoner
// ==========================
const houseIcon = L.icon({
  iconUrl: 'icons/house.png',
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

const houseAffectedIcon = L.icon({
  iconUrl: 'icons/house_affected.png',
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

const houseCompensatedIcon = L.icon({
  iconUrl: 'icons/compensated_house.png',
  iconSize: [35, 35],
  iconAnchor: [17, 17]
});

// ==========================
// Funktion för att byta ikon beroende på bakgrundskarta
// ==========================
function updateTurbineIconsForBaselayer(layerName) {
  const useWhiteIcon = layerName === 'Mapbox Satellite';
  turbineIcon = useWhiteIcon ? turbineIconWhite : turbineIconDefault;

  if (!turbinesLayer) return;

  turbinesLayer.eachLayer(layer => {
    if (layer instanceof L.Marker) {
      layer.setIcon(turbineIcon);
    }
  });
}

// ==========================
// Funktion för att få husikoner att försvinna efter en viss utzoomning
// ==========================
function updateResidenceVisibility() {
  if (!residencesLayer || residencesMinZoom === null) return;

  if (map.getZoom() < residencesMinZoom) {
    if (map.hasLayer(residencesLayer)) {
      map.removeLayer(residencesLayer);
    }
  } else {
    if (!map.hasLayer(residencesLayer)) {
      map.addLayer(residencesLayer);
    }
  }
}

// ==========================
// Hjälpfunktioner
// ==========================
function formatSEK(value) {
  return Math.round(value || 0).toLocaleString('sv-SE');
}

function getPromilleForDistance(distMeters, H) {
  if (!H || isNaN(H) || H <= 0) return 0;
  if (distMeters <= 5 * H) return 2.5;
  if (distMeters <= 6 * H) return 2.0;
  if (distMeters <= 7 * H) return 1.5;
  if (distMeters <= 8 * H) return 1.0;
  if (distMeters <= 9 * H) return 0.5;
  return 0;
}

function getResidenceId(props) {
  if (!props) return null;
  const id = props['objektiden'] ?? props['objektidentitet'];
  if (id === undefined || id === null) return null;
  return id.toString().trim();
}

function getTurbineId(props) {
  if (!props) return null;
  const id = props['WTG_Number'] ?? props['TEXT'] ?? props['VERKID'];
  if (id === undefined || id === null) return null;
  return id.toString().trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getProjectAndLayoutFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    project: params.get('project'),
    layout: params.get('layout')
  };
}

// ==========================
// API-konfiguration
// ==========================
const API_BASE = window.KOMPENSA_API_BASE;
const SCENARIO_CONFIG = window.KOMPENSA_CONFIG?.SCENARIOS_2035 || {};

// ==========================
// Intern scenariokonfiguration
// ==========================
let currentElomrade = 'SE3';

const DEFAULT_SCENARIO_PRODUCTION_GWH = 26.3;
const DEFAULT_MANUAL_PRICE_EUR = 44;
const DEFAULT_EXCHANGE_RATE = 11.0;
const DEFAULT_MANUAL_PRODUCTION_GWH = 26.3;

function setElomradeDisplay(elomrade) {
  const safeElomrade =
    typeof elomrade === 'string' && elomrade.trim()
      ? elomrade.trim().toUpperCase()
      : 'SE3';
  currentElomrade = SCENARIO_CONFIG[safeElomrade] ? safeElomrade : 'SE3';

  const el = document.getElementById('elomradeDisplay');
  if (el) {
    el.textContent = currentElomrade;
  }
}

function getScenarioDefinitionsForCurrentElomrade() {
  return SCENARIO_CONFIG[currentElomrade] || SCENARIO_CONFIG.SE3;
}

function getScenarioDefinition(key) {
  const defs = getScenarioDefinitionsForCurrentElomrade();

  return {
    key,
    label: scenarioMeta[key]?.label || key,
    priceSekPerMWh: defs[key]
  };
}

function getDefaultManualPriceEurForElomrade(elomrade = currentElomrade) {
  const defs = SCENARIO_CONFIG[elomrade] || SCENARIO_CONFIG.SE3;
  const baseSekPerMWh = defs.base;
  return Number((baseSekPerMWh / DEFAULT_EXCHANGE_RATE).toFixed(1));
}

function syncManualDefaultsToElomrade() {
  const prisBasEl = document.getElementById('prisBas');
  if (!prisBasEl) return;

  if (!prisBasEl.dataset.userModified) {
    prisBasEl.value = getDefaultManualPriceEurForElomrade(currentElomrade);
  }
}

function getManualInputs() {
  const prisBas = parseFloat(document.getElementById('prisBas')?.value ?? DEFAULT_MANUAL_PRICE_EUR);
  const vaxelkurs = parseFloat(document.getElementById('vaxelkurs')?.value ?? DEFAULT_EXCHANGE_RATE);
  const produktionBas = parseFloat(document.getElementById('produktionBas')?.value ?? DEFAULT_MANUAL_PRODUCTION_GWH);
  const totalhojd = parseFloat(document.getElementById('totalhojd')?.value ?? 0);

  return {
    prisBas,
    vaxelkurs,
    produktionBas,
    totalhojd
  };
}

function getScenarioConfig() {
  const defs = getScenarioDefinitionsForCurrentElomrade();

  return {
    low: {
      key: 'low',
      label: 'Låg',
      prisSek: defs.low,
      produktion: DEFAULT_SCENARIO_PRODUCTION_GWH,
      mode: 'scenario'
    },
    base: {
      key: 'base',
      label: 'Bas',
      prisSek: defs.base,
      produktion: DEFAULT_SCENARIO_PRODUCTION_GWH,
      mode: 'scenario'
    },
    high: {
      key: 'high',
      label: 'Hög',
      prisSek: defs.high,
      produktion: DEFAULT_SCENARIO_PRODUCTION_GWH,
      mode: 'scenario'
    }
  };
}

function getManualConfig() {
  const inputs = getManualInputs();
  return {
    key: 'manual',
    label: 'Manuell',
    prisSek: inputs.prisBas * inputs.vaxelkurs,
    produktion: inputs.produktionBas,
    mode: 'manual'
  };
}

function getCurrentResultLabel() {
  return currentMode === 'scenario'
    ? `scenario ${scenarioMeta[activeScenario]?.label || 'Bas'}`
    : 'manuellt läge';
}

// ==========================
// Hoverbeteende för verk
// ==========================
function addTurbineHoverBehavior(feature, layer) {
  layer.on('mouseover', function () {
    const H = parseFloat(document.getElementById('totalhojd').value);
    if (isNaN(H) || H <= 0) return;

    const center = layer.getLatLng();
    const turbineName = getTurbineId(feature.properties) || 'Verk';
    const turbineId = getTurbineId(feature.properties) || '';
    const multipliers = [5, 6, 7, 8, 9];
    const opacities = [0.35, 0.25, 0.18, 0.12, 0.06];

    const hoverLegend = document.getElementById('hoverLegend');
    if (hoverLegend) {
      hoverLegend.style.display = 'block';
    }

    if (layer._rings) {
      layer._rings.forEach(obj => map.removeLayer(obj));
    }
    layer._rings = [];

    multipliers.forEach((m, idx) => {
      const circle = L.circle(center, {
        radius: m * H,
        color: '#007bff',
        weight: 1,
        fillColor: '#007bff',
        fillOpacity: opacities[idx],
        dashArray: idx === 0 ? null : '4'
      }).addTo(map);

      layer._rings.push(circle);
    });

    const label = L.tooltip({
      permanent: true,
      direction: 'top',
      offset: [0, -10],
      className: 'turbine-label'
    })
      .setLatLng(center)
      .setContent(String(turbineName))
      .addTo(map);

    layer._rings.push(label);

    if (residencesLayer) {
      const residences = residencesLayer.getLayers();
      const displayedResult = getDisplayedResult();

      if (!layer._originalIcons) {
        layer._originalIcons = new Map();
      } else {
        layer._originalIcons.clear();
      }

      residences.forEach(resLayer => {
        if (!resLayer.getLatLng) return;

        const d = map.distance(center, resLayer.getLatLng());
        const promille = getPromilleForDistance(d, H);

        if (promille > 0) {
          if (!layer._originalIcons.has(resLayer)) {
            layer._originalIcons.set(resLayer, resLayer.getIcon());
          }

          const objektId = getResidenceId(resLayer.feature?.properties);
          let getsCompensationFromThisTurbine = false;

          if (displayedResult && displayedResult.rows && objektId && turbineId) {
            getsCompensationFromThisTurbine = displayedResult.rows.some(row =>
              row.objektiden === objektId &&
              row.verk === turbineId
            );
          }

          if (getsCompensationFromThisTurbine) {
            resLayer.setIcon(houseCompensatedIcon);
          } else {
            resLayer.setIcon(houseAffectedIcon);
          }
        }
      });
    }
  });

  layer.on('mouseout', function () {
    if (layer._rings) {
      layer._rings.forEach(obj => map.removeLayer(obj));
      layer._rings = [];
    }

    if (layer._originalIcons) {
      layer._originalIcons.forEach((icon, resLayer) => {
        resLayer.setIcon(icon);
      });
      layer._originalIcons.clear();
    }

    const hoverLegend = document.getElementById('hoverLegend');
    if (hoverLegend) {
      hoverLegend.style.display = 'none';
    }
  });

  layer.on('click', function () {
    const wtg = getTurbineId(feature.properties);
    if (!wtg) return;

    const rows = Array.from(document.querySelectorAll('#resultTable tbody tr'));
    if (!rows.length) return;

    rows.forEach(tr => tr.classList.remove('highlight-row'));

    const matching = rows.filter(tr => tr.children[1].textContent.trim() === wtg);
    if (matching.length === 0) return;

    matching.forEach((tr, idx) => {
      tr.classList.add('highlight-row');
      if (idx === 0) {
        tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    setTimeout(() => {
      matching.forEach(tr => tr.classList.remove('highlight-row'));
    }, 10000);
  });
}

// ==========================
// CRS-detektering & reprojektion
// ==========================
function getFirstCoordinate(geojson) {
  if (!geojson) return null;

  function fromGeom(geom) {
    if (!geom) return null;
    const t = geom.type;
    const c = geom.coordinates;
    if (!c) return null;

    if (t === 'Point') return c;
    if (t === 'MultiPoint' || t === 'LineString') return c[0];
    if (t === 'MultiLineString' || t === 'Polygon') return c[0] && c[0][0];
    if (t === 'MultiPolygon') return c[0] && c[0][0] && c[0][0][0];

    if (t === 'GeometryCollection' && Array.isArray(geom.geometries)) {
      for (const g of geom.geometries) {
        const res = fromGeom(g);
        if (res) return res;
      }
    }

    return null;
  }

  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features) && geojson.features.length > 0) {
    return fromGeom(geojson.features[0].geometry);
  } else if (geojson.type === 'Feature') {
    return fromGeom(geojson.geometry);
  } else if (!geojson.type && typeof geojson === 'object') {
    for (const v of Object.values(geojson)) {
      const res = getFirstCoordinate(v);
      if (res) return res;
    }
  }

  return null;
}

function detectCrsFromGeoJSON(geojson) {
  if (!geojson || !geojson.crs) return null;
  const props = geojson.crs.properties || {};
  const name = (props.name || '').toString().toUpperCase();

  if (name.includes('3006') || (name.includes('SWEREF') && name.includes('TM'))) {
    return 'EPSG:3006';
  }

  return null;
}

function reprojectGeoJSON(geojson, fromCrs, toCrs = 'EPSG:4326') {
  if (typeof proj4 === 'undefined') return geojson;
  if (!proj4.defs[fromCrs]) return geojson;

  const transformCoord = (coord) => {
    const [x, y] = coord;
    const [lon, lat] = proj4(fromCrs, toCrs, [x, y]);
    return [lon, lat];
  };

  function reprojectGeometry(geom) {
    if (!geom) return geom;

    const type = geom.type;

    if (type === 'Point') {
      geom.coordinates = transformCoord(geom.coordinates);
    } else if (type === 'MultiPoint' || type === 'LineString') {
      geom.coordinates = geom.coordinates.map(transformCoord);
    } else if (type === 'MultiLineString' || type === 'Polygon') {
      geom.coordinates = geom.coordinates.map(ring => ring.map(transformCoord));
    } else if (type === 'MultiPolygon') {
      geom.coordinates = geom.coordinates.map(poly => poly.map(ring => ring.map(transformCoord)));
    } else if (type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
      geom.geometries.forEach(g => reprojectGeometry(g));
    }

    return geom;
  }

  function process(obj) {
    if (!obj) return obj;

    if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
      obj.features.forEach(f => {
        if (f.geometry) reprojectGeometry(f.geometry);
      });
    } else if (obj.type === 'Feature' && obj.geometry) {
      reprojectGeometry(obj.geometry);
    } else if (!obj.type && typeof obj === 'object') {
      Object.values(obj).forEach(v => process(v));
    }

    return obj;
  }

  return process(geojson);
}

function maybeReprojectGeoJSON(geojson, srcCrs) {
  if (!srcCrs || srcCrs === 'EPSG:4326') return geojson;

  const sample = getFirstCoordinate(geojson);
  if (sample) {
    const [x, y] = sample;
    if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return geojson;
  }

  return reprojectGeoJSON(geojson, srcCrs, 'EPSG:4326');
}

// ==========================
// Lägg till GeoJSON i kartan
// ==========================
function processGeoJSON(rawGeoJSON, type) {
  let geojson = rawGeoJSON;

  if (!geojson || typeof geojson !== 'object') {
    throw new Error('Ogiltig GeoJSON-struktur.');
  }

  if (!geojson.features) {
    const candidates = Object.values(geojson).filter(
      v => v && typeof v === 'object' && v.type === 'FeatureCollection' && Array.isArray(v.features)
    );
    if (candidates.length > 0) geojson = candidates[0];
  }

  if (!geojson.features || !Array.isArray(geojson.features)) {
    throw new Error("Ogiltig GeoJSON: saknar 'features'-lista.");
  }

  if (!geojson.features.every(f => f.geometry && f.geometry.type === 'Point')) {
    throw new Error('Alla geometrier i lagret måste vara av typen Point.');
  }

  const layer = L.geoJSON(geojson, {
    pointToLayer: function (feature, latlng) {
      return L.marker(latlng, {
        icon: type === 'turbine' ? turbineIcon : houseIcon
      });
    },

    onEachFeature: function (feature, layer) {
      if (type === 'turbine') {
        addTurbineHoverBehavior(feature, layer);
        return;
      }

      if (type === 'residence') {
        layer.on('mouseover', function () {
          if (!turbinesLayer) return;

          const H = parseFloat(document.getElementById('totalhojd').value);
          const maxDist = (!isNaN(H) && H > 0) ? 9 * H : Infinity;

          const resPoint = turf.point(feature.geometry.coordinates);
          const turbines = turbinesLayer.toGeoJSON().features;

          const dists = turbines.map(t => {
            const tPoint = turf.point(t.geometry.coordinates);
            const dist = turf.distance(resPoint, tPoint, { units: 'kilometers' }) * 1000;
            return { feature: t, dist };
          });

          const relevant = dists
            .filter(d => d.dist <= maxDist)
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 2);

          if (relevant.length === 0) return;

          relevant.forEach(n => {
            const line = L.polyline([
              [feature.geometry.coordinates[1], feature.geometry.coordinates[0]],
              [n.feature.geometry.coordinates[1], n.feature.geometry.coordinates[0]]
            ], {
              color: 'orange',
              dashArray: '4',
              weight: 2
            }).addTo(map);

            layer._lines = layer._lines || [];
            layer._lines.push(line);
          });

          const objektId = getResidenceId(feature.properties) || 'Okänt ID';
          const displayedResult = getDisplayedResult();
          const compensationRows = displayedResult?.rows?.filter(row => row.objektiden === objektId) || [];
          const popupLines = relevant.map(n => {
            const turbineId = getTurbineId(n.feature.properties) || 'Verk';
            const match = compensationRows.find(row => row.verk === turbineId && Math.abs(row.avstand - Math.round(n.dist)) <= 1);
            const compensationText = match ? ` – ${formatSEK(match.ersattning)} SEK` : '';
            return `${escapeHtml(turbineId)}: ${Math.round(n.dist)} m${compensationText}`;
          });

          const popupText =
            `<b>Objekt-ID:</b> ${escapeHtml(objektId)}<br>` +
            popupLines.join('<br>');

          layer.bindPopup(popupText).openPopup();
        });

        layer.on('mouseout', function () {
          if (layer._lines) {
            layer._lines.forEach(line => map.removeLayer(line));
            layer._lines = [];
          }
          layer.closePopup();
        });

        layer.on('click', function () {
          const objektId = getResidenceId(feature.properties);
          if (!objektId) return;

          document.querySelectorAll('#resultTable tbody tr').forEach(tr => {
            tr.classList.remove('highlight-row');
          });

          const matchRows = Array.from(document.querySelectorAll('#resultTable tbody tr')).filter(tr => {
            return tr.children[0].textContent === objektId;
          });

          matchRows.forEach((row, index) => {
            row.classList.add('highlight-row');
            if (index === 0) {
              row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          });

          setTimeout(() => {
            matchRows.forEach(row => row.classList.remove('highlight-row'));
          }, 5000);
        });
      }
    }
  });

  if (type === 'turbine') {
    if (turbinesLayer) map.removeLayer(turbinesLayer);
    turbinesLayer = layer;

    const antalVerkEl = document.getElementById('antalVerk');
    if (antalVerkEl) {
      antalVerkEl.textContent = geojson.features.length;
    }

    updateRevenuePreview();

    if (map.hasLayer(mapboxSatellite)) {
      updateTurbineIconsForBaselayer('Mapbox Satellite');
    } else if (map.hasLayer(mapboxStreets)) {
      updateTurbineIconsForBaselayer('Mapbox Streets');
    } else {
      updateTurbineIconsForBaselayer('OpenStreetMap');
    }
  }

  if (type === 'residence') {
    if (residencesLayer) map.removeLayer(residencesLayer);
    residencesLayer = layer;
  }

  layer.addTo(map);

  if (turbinesLayer) {
    map.fitBounds(turbinesLayer.getBounds(), {
      padding: [30, 30],
      maxZoom: 12
    });

    residencesMinZoom = map.getZoom() - 1;
  }

  updateResidenceVisibility();
  autoCalculate();
}

// ==========================
// Intäktspreview
// ==========================
function getTurbineCount() {
  return turbinesLayer ? turbinesLayer.toGeoJSON().features.length : 0;
}

// ==========================
// Uppdaterar readonly-fältet som visar parkens årliga intäkt
// ==========================
function updateRevenuePreview() {
  const revenueEl = document.getElementById('parkRevenueDisplay');
  if (!revenueEl) return;

  const turbineCount = getTurbineCount();

  if (currentMode === 'scenario') {
    const activeDef = getScenarioDefinition(activeScenario);
    const totalRevenue = activeDef.priceSekPerMWh * DEFAULT_SCENARIO_PRODUCTION_GWH * 1000 * turbineCount;
    revenueEl.value = formatSEK(totalRevenue);
    return;
  }

  const inputs = getManualInputs();
  if ([inputs.prisBas, inputs.vaxelkurs, inputs.produktionBas].some(isNaN)) {
    revenueEl.value = '';
    return;
  }

  const priceSek = inputs.prisBas * inputs.vaxelkurs;
  const totalRevenue = priceSek * inputs.produktionBas * 1000 * turbineCount;
  revenueEl.value = formatSEK(totalRevenue);
}

// ==========================
// Beräknar ersättningsrader för ett visst scenario eller manuellt läge
// ==========================
function calculateRowsForScenario({ prisSek, produktion, label, key, mode }, totalhojd) {
  if ([prisSek, produktion, totalhojd].some(isNaN) || totalhojd <= 0) return null;
  if (!turbinesLayer || !residencesLayer) return null;

  const intaktPerVerk = prisSek * produktion * 1000;
  const residences = residencesLayer.toGeoJSON().features;
  const turbines = turbinesLayer.toGeoJSON().features;
  const antalVerk = turbines.length;
  const intaktAnlaggning = intaktPerVerk * antalVerk;
  const rows = [];

  for (const res of residences) {
    const resCoord = res.geometry.coordinates;
    const objektId = getResidenceId(res.properties);

    if (!objektId) {
      console.warn('Bostad utan objekt-id hittades och hoppades över.', res.properties);
      continue;
    }

    const dists = turbines.map(turbine => {
      const dist = turf.distance(
        turf.point(resCoord),
        turf.point(turbine.geometry.coordinates),
        { units: 'kilometers' }
      ) * 1000;

      const promille = getPromilleForDistance(dist, totalhojd);
      const ersattningPre = promille > 0 ? (intaktPerVerk * promille / 1000) : 0;

      return {
        dist,
        promille,
        WTG_Number: getTurbineId(turbine.properties) || '',
        ersattningPre
      };
    });

    const relevanta = dists
      .filter(item => item.promille > 0)
      .sort((a, b) => {
        if (b.ersattningPre !== a.ersattningPre) return b.ersattningPre - a.ersattningPre;
        return a.dist - b.dist;
      })
      .slice(0, 2);

    relevanta.forEach(item => {
      rows.push({
        objektiden: objektId,
        verk: item.WTG_Number,
        avstand: Math.round(item.dist),
        promille: item.promille,
        ersattningPreCap: item.ersattningPre,
        ersattning: item.ersattningPre
      });
    });
  }

  let capFactor = 1;
  let capApplied = false;
  const totalErsPreCap = rows.reduce((sum, row) => sum + (row.ersattning || 0), 0);
  const maxTillaten = intaktAnlaggning * 0.02;

  if (totalErsPreCap > maxTillaten && totalErsPreCap > 0) {
    capFactor = maxTillaten / totalErsPreCap;
    capApplied = true;

    rows.forEach(row => {
      row.ersattning = row.ersattning * capFactor;
    });
  }

  rows.forEach(row => {
    row.ersattning = Math.round(row.ersattning);
  });

  const totalErs = rows.reduce((sum, row) => sum + (row.ersattning || 0), 0);
  const bostader = new Set();
  rows.forEach(row => {
    if (row.ersattning > 0 && row.objektiden) {
      bostader.add(row.objektiden);
    }
  });

  return {
    key,
    label,
    mode,
    prisSek,
    produktion,
    intaktPerVerk,
    intaktAnlaggning,
    totalErsPreCap,
    maxTillaten,
    totalErs,
    capFactor,
    capApplied,
    antalVerk,
    antalBostader: bostader.size,
    rows
  };
}

// ==========================
// Returnerar det resultat som ska visas just nu
// ==========================
function getDisplayedResult() {
  return currentMode === 'scenario' ? scenarioResults[activeScenario] : manualResult;
}

// ==========================
// Kör om beräkningarna när data eller inställningar ändras
// ==========================
function autoCalculate() {
  if (!turbinesLayer || !residencesLayer) {
    updateRevenuePreview();
    return;
  }

  const totalhojd = parseFloat(document.getElementById('totalhojd')?.value);
  if (isNaN(totalhojd) || totalhojd <= 0) return;

  const scenarioConfig = getScenarioConfig();
  scenarioResults.low = calculateRowsForScenario(scenarioConfig.low, totalhojd);
  scenarioResults.base = calculateRowsForScenario(scenarioConfig.base, totalhojd);
  scenarioResults.high = calculateRowsForScenario(scenarioConfig.high, totalhojd);

  const manualInputs = getManualInputs();
  if (![manualInputs.prisBas, manualInputs.vaxelkurs, manualInputs.produktionBas].some(isNaN)) {
    manualResult = calculateRowsForScenario(getManualConfig(), totalhojd);
  } else {
    manualResult = null;
  }

  if (!scenarioResults[activeScenario]) {
    activeScenario = 'base';
  }

  applyCurrentModeResult();
  renderScenarioCards();
  updateRevenuePreview();
}

// ==========================
// Applicerar resultatet som ska synas i tabell och sammanfattning
// ==========================
function applyCurrentModeResult() {
  const result = getDisplayedResult();
  const calculationInfoBox = document.getElementById('calculationInfoBox');

  if (!result) {
    if (calculationInfoBox) {
      calculationInfoBox.style.display = 'none';
    }
    return;
  }

  currentRows = [...result.rows];
  renderTable(currentRows);
  renderTurbineCostTable(currentRows);
  updateSummary(result);
  updateResultsTitle();

  if (calculationInfoBox) {
    calculationInfoBox.style.display = result.rows && result.rows.length > 0 ? 'block' : 'none';
  }
}

// ==========================
// Uppdaterar rubriken i resultatfönstret beroende på vy och läge
// ==========================
function updateResultsTitle(view = 'residence') {
  const resultsTitle = document.getElementById('resultsTitle');
  if (!resultsTitle) return;

  const suffix = currentMode === 'scenario'
    ? `scenario ${scenarioMeta[activeScenario]?.label || 'Bas'}`
    : 'manuellt läge';

  resultsTitle.textContent = view === 'residence'
    ? `Resultat: Närboendeersättning per bostad – ${suffix}`
    : `Resultat: Närboendeersättning per verk – ${suffix}`;
}

// ==========================
// Växlar mellan scenario- och manuellt läge i gränssnittet
// ==========================
function setMode(mode) {
  currentMode = mode;

  const scenarioBtn = document.getElementById('scenarioModeBtn');
  const manualBtn = document.getElementById('manualModeBtn');
  const scenarioControls = document.getElementById('scenarioControls');
  const manualControls = document.getElementById('manualControls');
  if (scenarioBtn) scenarioBtn.classList.toggle('active', mode === 'scenario');
  if (manualBtn) manualBtn.classList.toggle('active', mode === 'manual');
  if (scenarioControls) scenarioControls.style.display = mode === 'scenario' ? 'block' : 'none';
  if (manualControls) manualControls.style.display = mode === 'manual' ? 'block' : 'none';

  applyCurrentModeResult();
  updateRevenuePreview();
}

// ==========================
// Renderar scenariokorten
// ==========================
function renderScenarioCards() {
  const wrap = document.getElementById('scenarioCards');
  if (!wrap) return;

  wrap.innerHTML = '';

  ['low', 'base', 'high'].forEach(key => {
    const result = scenarioResults[key];
    const meta = scenarioMeta[key];

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn-sm text-start ${activeScenario === key ? 'btn-success' : 'btn-outline-secondary'}`;

    if (!result) {
      btn.disabled = true;
      btn.innerHTML = `<strong>${meta.label}</strong><br><span class="small">Väntar på data</span>`;
    } else {
      btn.innerHTML = `
        <strong>${meta.label}</strong><br>
        <span class="small">Elpris: ${formatSEK(result.prisSek)} SEK/MWh</span><br>
        <span class="small">Total ersättning: ${formatSEK(result.totalErs)} SEK</span>
      `;

      btn.addEventListener('click', () => {
        activeScenario = key;

        if (currentMode !== 'scenario') {
          setMode('scenario');
        } else {
          applyCurrentModeResult();
          updateRevenuePreview();
        }

        renderScenarioCards();

        if (resultsOverlayEl) {
          resultsOverlayEl.style.display = 'block';
        }

        const residenceTableWrapper = document.getElementById('residenceTableWrapper');
        const turbineTableWrapper = document.getElementById('turbineTableWrapper');
        const showResidenceResultsBtn = document.getElementById('showResidenceResultsBtn');
        const showTurbineResultsBtn = document.getElementById('showTurbineResultsBtn');

        if (residenceTableWrapper) residenceTableWrapper.style.display = 'block';
        if (turbineTableWrapper) turbineTableWrapper.style.display = 'none';
        if (showResidenceResultsBtn) showResidenceResultsBtn.classList.add('active');
        if (showTurbineResultsBtn) showTurbineResultsBtn.classList.remove('active');

        updateResultsTitle('residence');
      });
    }

    wrap.appendChild(btn);
  });
}

// ==========================
// Skriver sammanfattningen ovanför tabellen
// ==========================
function updateSummary(result) {
  const box = document.getElementById('summaryBox');
  if (!box) return;

  if (!result || !result.rows || result.rows.length === 0) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }

  const genomsnitt = result.antalBostader > 0 ? (result.totalErs / result.antalBostader) : 0;
  const kostnadPerVerk = result.antalVerk > 0 ? (result.totalErs / result.antalVerk) : 0;
  const capStatus = result.capApplied
    ? `Ja, skalfaktor ${result.capFactor.toFixed(3).replace('.', ',')}`
    : 'Nej';

  const heading = currentMode === 'scenario'
    ? `Sammanfattning – scenario ${result.label}`
    : 'Sammanfattning – manuellt läge';
  
  const prisPerKwh = result.prisSek / 1000;
  const prisPerKwhText = prisPerKwh.toLocaleString('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3
  });

  box.innerHTML = `
    <strong>${heading}:</strong><br>
    Schabloniserat elpris: ${formatSEK(result.prisSek)} SEK/MWh (${prisPerKwhText} SEK/kWh)<br>
    Total schablonintäkt för anläggningen: ${formatSEK(result.intaktAnlaggning)} SEK<br>
    Totalt antal berättigade bostäder: ${result.antalBostader}<br>
    Total närboendeersättning: ${formatSEK(result.totalErs)} SEK<br>
    Genomsnittlig närboendeersättning per berättigad bostad: ${formatSEK(genomsnitt)} SEK<br>
    Genomsnittlig närboendeersättning per verk: ${formatSEK(kostnadPerVerk)} SEK<br>
    2 %-tak aktiverat: ${capStatus}
    <span id="capInfoToggle" style="cursor:pointer; margin-left:4px;">ⓘ</span>
    <div id="capInfoDetail" style="display:none; margin-top:4px;">
      Ersättning före tak: ${formatSEK(result.totalErsPreCap)} SEK<br>
      Max tillåten total ersättning: ${formatSEK(result.maxTillaten)} SEK
    </div>
  `;
  box.style.display = 'block';

  const toggle = document.getElementById('capInfoToggle');
  const detail = document.getElementById('capInfoDetail');
  if (toggle && detail) {
    toggle.onclick = () => {
      detail.style.display = (detail.style.display === 'none' || detail.style.display === '') ? 'block' : 'none';
    };
  }
}

// ==========================
// Renderar summerad kostnad per verk
// ==========================
function renderTurbineCostTable(rows) {
  const tbody = document.querySelector('#turbineResultTable tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (!rows || rows.length === 0) return;

  const turbineMap = {};

  rows.forEach(row => {
    if (!row.verk) return;

    if (!turbineMap[row.verk]) {
      turbineMap[row.verk] = {
        verk: row.verk,
        totalErsattning: 0,
        bostader: new Set()
      };
    }

    turbineMap[row.verk].totalErsattning += row.ersattning || 0;
    if (row.objektiden) {
      turbineMap[row.verk].bostader.add(row.objektiden);
    }
  });

  const turbineRows = Object.values(turbineMap).sort((a, b) => b.totalErsattning - a.totalErsattning);

  turbineRows.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(row.verk)}</td>
      <td>${formatSEK(row.totalErsattning)} SEK</td>
      <td>${row.bostader.size}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================
// Renderar tabellen per bostad
// ==========================
function renderTable(data) {
  const tbody = document.querySelector('#resultTable tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  data.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(row.objektiden)}</td>
      <td>${escapeHtml(row.verk)}</td>
      <td>${row.avstand} m</td>
      <td>${row.promille.toString().replace('.', ',')} ‰</td>
      <td>${formatSEK(row.ersattning)}</td>
    `;
    tbody.appendChild(tr);
  });

  const openResultsBtn = document.getElementById('openResultsBtn');
  if (openResultsBtn) {
    openResultsBtn.style.display = data.length > 0 ? 'block' : 'none';
  }

  if (resultsOverlayEl && data.length === 0) {
    resultsOverlayEl.style.display = 'none';
  }

  const calculationInfoBox = document.getElementById('calculationInfoBox');
  if (calculationInfoBox) {
    calculationInfoBox.style.display = data.length > 0 ? 'block' : 'none';
  }
}

// ==========================
// Sortering av tabellen
// ==========================
let sortState = { column: null, asc: true };

function sortCurrentRowsByColumn(colIndex) {
  if (!currentRows || currentRows.length === 0) return;

  const asc = sortState.column === colIndex ? !sortState.asc : true;
  sortState = { column: colIndex, asc };
  const factor = asc ? 1 : -1;

  currentRows.sort((a, b) => {
    let vA, vB;
    switch (colIndex) {
      case 0:
        vA = a.objektiden || '';
        vB = b.objektiden || '';
        return vA.localeCompare(vB, 'sv') * factor;
      case 1:
        vA = a.verk || '';
        vB = b.verk || '';
        return vA.localeCompare(vB, 'sv') * factor;
      case 2:
        vA = a.avstand || 0;
        vB = b.avstand || 0;
        return (vA - vB) * factor;
      case 3:
        vA = a.promille || 0;
        vB = b.promille || 0;
        return (vA - vB) * factor;
      case 4:
        vA = a.ersattning || 0;
        vB = b.ersattning || 0;
        return (vA - vB) * factor;
      default:
        return 0;
    }
  });

  renderTable(currentRows);
}

// ==========================
// Ladda projektdata direkt vid sidstart
// ==========================
async function loadProjectData() {
  try {
    updateRevenuePreview();

    const { project: projectName, layout: layoutId } = getProjectAndLayoutFromUrl();

    if (!projectName) {
      throw new Error('Saknar project-parameter i URL.');
    }

    const safeProjectName = encodeURIComponent(projectName);

    const projectNameEl = document.getElementById('projectName');
    if (projectNameEl) {
      projectNameEl.textContent = projectName;
    }

    const fetchOptions = {
      cache: 'no-store',
      credentials: 'include'
    };

    const turbineUrl = layoutId
      ? `${API_BASE}/project/${safeProjectName}/turbines?layout=${encodeURIComponent(layoutId)}`
      : `${API_BASE}/project/${safeProjectName}/turbines`;

    const [projectResponse, turbineResponse, residenceResponse] = await Promise.all([
      fetch(`${API_BASE}/project/${safeProjectName}`, fetchOptions),
      fetch(turbineUrl, fetchOptions),
      fetch(`${API_BASE}/project/${safeProjectName}/houses`, fetchOptions)
    ]);

    if (
      projectResponse.status === 401 ||
      turbineResponse.status === 401 ||
      residenceResponse.status === 401
    ) {
      window.location.href = '/kompensa/login.html';
      return;
    }

    if (!projectResponse.ok) {
      throw new Error(`Kunde inte läsa projektmetadata för ${projectName}.`);
    }
    if (!turbineResponse.ok) {
      const errorPayload = await turbineResponse.json().catch(() => null);
      throw new Error(errorPayload?.error || `Kunde inte läsa turbiner för projektet ${projectName}.`);
    }
    if (!residenceResponse.ok) {
      throw new Error(`Kunde inte läsa bostäder/resultat för projektet ${projectName}.`);
    }

    const projectMeta = await projectResponse.json();
    let turbinesGeoJSON = await turbineResponse.json();
    let residencesGeoJSON = await residenceResponse.json();

    if (projectMeta?.summary?.turbineCount !== undefined) {
      const antalVerkEl = document.getElementById('antalVerk');
      if (antalVerkEl) {
        antalVerkEl.textContent = projectMeta.summary.turbineCount;
      }
    }

    const detectedElomrade = projectMeta?.elomrade || projectMeta?.projectMeta?.elomrade || 'SE3';
    setElomradeDisplay(detectedElomrade);
    syncManualDefaultsToElomrade();

    const topbarProjectNameEl = document.getElementById('topbarProjectName');
    if (topbarProjectNameEl) {
      topbarProjectNameEl.textContent = projectMeta?.name || projectName;
    }

    turbinesGeoJSON = maybeReprojectGeoJSON(turbinesGeoJSON, detectCrsFromGeoJSON(turbinesGeoJSON));
    residencesGeoJSON = maybeReprojectGeoJSON(residencesGeoJSON, detectCrsFromGeoJSON(residencesGeoJSON));

    processGeoJSON(turbinesGeoJSON, 'turbine');
    processGeoJSON(residencesGeoJSON, 'residence');
  } catch (error) {
    console.error(error);

    const summaryBox = document.getElementById('summaryBox');
    if (summaryBox) {
      summaryBox.style.display = 'block';
      summaryBox.className = 'alert alert-danger py-2 mb-3';
      summaryBox.innerHTML = `
        Projektdata kunde inte laddas.<br>
        Kontrollera att Flask-servern körs och att projektet finns tillgängligt.
      `;
    }
  }
}

// ==========================
// DOMContentLoaded
// ==========================
document.addEventListener('DOMContentLoaded', () => {
  resultsOverlayEl = document.getElementById('resultsOverlay');

  const watchedIds = ['prisBas', 'vaxelkurs', 'produktionBas', 'totalhojd'];
  watchedIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    if (id === 'prisBas') {
      el.addEventListener('input', () => {
        el.dataset.userModified = 'true';
      });
      el.addEventListener('change', () => {
        el.dataset.userModified = 'true';
      });
    }

    el.addEventListener('input', () => {
      updateRevenuePreview();
      autoCalculate();
    });

    el.addEventListener('change', () => {
      updateRevenuePreview();
      autoCalculate();
    });
  });

  const headers = document.querySelectorAll('#resultTable thead th');
  headers.forEach((th, index) => {
    th.style.cursor = 'pointer';
    th.title = 'Klicka för att sortera';
    th.addEventListener('click', event => {
      if (event.target.closest('.info-icon-btn')) return;
      sortCurrentRowsByColumn(index);
    });
  });

  const exportExcelBtn = document.getElementById('exportExcelBtn');
  if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', function () {
      if (typeof XLSX === 'undefined') return;

      const residenceTableWrapper = document.getElementById('residenceTableWrapper');
      const showingResidenceTable = residenceTableWrapper && residenceTableWrapper.style.display !== 'none';
      const table = showingResidenceTable
        ? document.getElementById('resultTable')
        : document.getElementById('turbineResultTable');

      if (!table) return;

      const scenarioOrMode = currentMode === 'scenario' ? activeScenario : 'manual';
      const currentLabel = currentMode === 'scenario' ? (scenarioMeta[activeScenario]?.label || 'Bas') : 'Manuell';
      const sheetName = showingResidenceTable ? `Per bostad ${currentLabel}` : `Per verk ${currentLabel}`;
      const fileName = showingResidenceTable
        ? `kompensa_narboendeersattning_per_bostad_${scenarioOrMode}.xlsx`
        : `kompensa_narboendeersattning_per_verk_${scenarioOrMode}.xlsx`;

      const wb = XLSX.utils.table_to_book(table, { sheet: sheetName });
      XLSX.writeFile(wb, fileName);
    });
  }

  const openResultsBtn = document.getElementById('openResultsBtn');
  const closeResultsBtn = document.getElementById('closeResultsBtn');
  const showResidenceResultsBtn = document.getElementById('showResidenceResultsBtn');
  const showTurbineResultsBtn = document.getElementById('showTurbineResultsBtn');
  const residenceTableWrapper = document.getElementById('residenceTableWrapper');
  const turbineTableWrapper = document.getElementById('turbineTableWrapper');

  function showResidenceTableView() {
    if (residenceTableWrapper) residenceTableWrapper.style.display = 'block';
    if (turbineTableWrapper) turbineTableWrapper.style.display = 'none';

    if (showResidenceResultsBtn) showResidenceResultsBtn.classList.add('active');
    if (showTurbineResultsBtn) showTurbineResultsBtn.classList.remove('active');

    updateResultsTitle('residence');
  }

  function showTurbineTableView() {
    if (residenceTableWrapper) residenceTableWrapper.style.display = 'none';
    if (turbineTableWrapper) turbineTableWrapper.style.display = 'block';

    if (showResidenceResultsBtn) showResidenceResultsBtn.classList.remove('active');
    if (showTurbineResultsBtn) showTurbineResultsBtn.classList.add('active');

    updateResultsTitle('turbine');
  }

  if (showResidenceResultsBtn) {
    showResidenceResultsBtn.addEventListener('click', showResidenceTableView);
  }

  if (showTurbineResultsBtn) {
    showTurbineResultsBtn.addEventListener('click', showTurbineTableView);
  }

  if (openResultsBtn && closeResultsBtn && resultsOverlayEl) {
    openResultsBtn.addEventListener('click', () => {
      const isHidden = resultsOverlayEl.style.display === 'none' || resultsOverlayEl.style.display === '';
      if (isHidden) {
        resultsOverlayEl.style.display = 'block';
        showResidenceTableView();
      } else {
        resultsOverlayEl.style.display = 'none';
      }
    });

    closeResultsBtn.addEventListener('click', () => {
      resultsOverlayEl.style.display = 'none';
    });
  }

  const scenarioModeBtn = document.getElementById('scenarioModeBtn');
  const manualModeBtn = document.getElementById('manualModeBtn');
  if (scenarioModeBtn) {
    scenarioModeBtn.addEventListener('click', () => setMode('scenario'));
  }
  if (manualModeBtn) {
    manualModeBtn.addEventListener('click', () => setMode('manual'));
  }

  const infoIconButtons = document.querySelectorAll('.info-icon-btn');
  infoIconButtons.forEach(button => {
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      const targetId = button.getAttribute('data-info-target');
      const targetBox = document.getElementById(targetId);
      if (!targetBox) return;

      document.querySelectorAll('.info-tooltip-box').forEach(box => {
        if (box !== targetBox) {
          box.style.display = 'none';
        }
      });

      targetBox.style.display = targetBox.style.display === 'block' ? 'none' : 'block';
    });
  });

  document.addEventListener('click', function () {
    document.querySelectorAll('.info-tooltip-box').forEach(box => {
      box.style.display = 'none';
    });
  });

  map.on('zoomend', function () {
    updateResidenceVisibility();
  });

  setMode('scenario');
  renderScenarioCards();
  updateRevenuePreview();
  loadProjectData();
});

