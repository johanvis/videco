// ==========================
// Initiera kartan
// ==========================
let map = L.map('map').setView([62.0, 15.0], 5);
L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

// ==========================
// Bakgrundskartor
// ==========================

// OpenStreetMap som gratis fallback
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
});

// Mapbox Streets
const mapboxStreets = L.tileLayer(
  'https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}',
  {
    attribution: '© Mapbox © OpenStreetMap',
    tileSize: 512,
    zoomOffset: -1,
    id: 'mapbox/streets-v12',
    accessToken: 'pk.eyJ1IjoiZ2lzam9oYW4iLCJhIjoiY21ub2UxaHB3MXg2eTJycXRxYXg2OTg3NSJ9.OdyF-gw55kaOot9eHxVjNA'
  }
);

// Mapbox Satellite
const mapboxSatellite = L.tileLayer(
  'https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}',
  {
    attribution: '© Mapbox © OpenStreetMap',
    tileSize: 512,
    zoomOffset: -1,
    id: 'mapbox/satellite-streets-v12',
    accessToken: 'pk.eyJ1IjoiZ2lzam9oYW4iLCJhIjoiY21ub2UxaHB3MXg2eTJycXRxYXg2OTg3NSJ9.OdyF-gw55kaOot9eHxVjNA'
  }
);

// Låt Mapbox Satellite vara standard i demo
osm.addTo(map);

// Lagerkontroll
const baseMaps = {
  'Mapbox Satellite': mapboxSatellite,
  'Mapbox Streets': mapboxStreets,
  'OpenStreetMap': osm
};

L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

let turbinesLayer, residencesLayer;
let currentRows = [];

// För 2 %-tak
let capFactor = 1;
let capApplied = false;

// ==========================
// proj4 – definiera SWEREF vi stödjer
// ==========================
if (typeof proj4 !== "undefined") {
  if (!proj4.defs["EPSG:3006"]) {
    proj4.defs(
      "EPSG:3006",
      "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
    );
  }
}

// ==========================
// Ikoner
// ==========================
const turbineIcon = L.icon({
  iconUrl: 'icons/turbine.png',
  iconSize: [26, 26],
  iconAnchor: [13, 13]
});

const houseIcon = L.icon({
  iconUrl: 'icons/house.png',
  iconSize: [26, 26],
  iconAnchor: [13, 13]
});

const houseAffectedIcon = L.icon({
  iconUrl: 'icons/house_affected.png',
  iconSize: [26, 26],
  iconAnchor: [13, 13]
});

// ==========================
// Hjälpfunktioner
// ==========================
function setStatus(id, text, className) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = className;
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
  const id = props["objektiden"] ?? props["objektidentitet"];
  if (id === undefined || id === null) return null;
  return id.toString().trim();
}

function getTurbineId(props) {
  if (!props) return null;
  const id = props["WTG_Number"] ?? props["TEXT"] ?? props["VERKID"];
  if (id === undefined || id === null) return null;
  return id.toString().trim();
}

// ==========================
// Hoverbeteende för verk
// ==========================
function addTurbineHoverBehavior(feature, layer) {
  layer.on("mouseover", function () {
    const H = parseFloat(document.getElementById("totalhojd").value);
    if (isNaN(H) || H <= 0) return;

    const center = layer.getLatLng();
    const multipliers = [5, 6, 7, 8, 9];
    const opacities = [0.35, 0.25, 0.18, 0.12, 0.06];

    layer._rings = [];

    multipliers.forEach((m, idx) => {
      const circle = L.circle(center, {
        radius: m * H,
        color: '#007bff',
        weight: 1,
        fillColor: '#007bff',
        fillOpacity: opacities[idx],
        dashArray: idx === 0 ? null : "4"
      }).addTo(map);
      layer._rings.push(circle);
    });

    if (residencesLayer) {
      const residences = residencesLayer.getLayers();
      layer._originalIcons = new Map();

      residences.forEach(resLayer => {
        if (!resLayer.getLatLng) return;
        const d = map.distance(center, resLayer.getLatLng());
        const promille = getPromilleForDistance(d, H);

        if (promille > 0) {
          if (!layer._originalIcons.has(resLayer)) {
            layer._originalIcons.set(resLayer, resLayer.getIcon());
          }
          resLayer.setIcon(houseAffectedIcon);
        }
      });
    }
  });

  layer.on("mouseout", function () {
    if (layer._rings) {
      layer._rings.forEach(c => map.removeLayer(c));
      layer._rings = [];
    }

    if (layer._originalIcons) {
      layer._originalIcons.forEach((icon, resLayer) => {
        resLayer.setIcon(icon);
      });
      layer._originalIcons.clear();
    }
  });

  layer.on("click", function () {
    const wtg = getTurbineId(feature.properties);
    if (!wtg) return;

    const rows = Array.from(document.querySelectorAll("#resultTable tbody tr"));
    if (!rows.length) return;

    rows.forEach(tr => tr.classList.remove("highlight-row"));

    const matching = rows.filter(tr => tr.children[1].textContent.trim() === wtg);
    if (matching.length === 0) return;

    matching.forEach((tr, idx) => {
      tr.classList.add("highlight-row");
      if (idx === 0) tr.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    setTimeout(() => {
      matching.forEach(tr => tr.classList.remove("highlight-row"));
    }, 10000);
  });
}

// ==========================
// Trigger på formulärfält
// ==========================
["prisMWh", "vaxelkurs", "produktion", "totalhojd"].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", () => {
    updateIntaktPerVerk();
    autoCalculate();
  });
});

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
    if (t === "Point") return c;
    if (t === "MultiPoint" || t === "LineString") return c[0];
    if (t === "MultiLineString" || t === "Polygon") return c[0] && c[0][0];
    if (t === "MultiPolygon") return c[0] && c[0][0] && c[0][0][0];
    if (t === "GeometryCollection" && Array.isArray(geom.geometries)) {
      for (const g of geom.geometries) {
        const res = fromGeom(g);
        if (res) return res;
      }
    }
    return null;
  }

  if (geojson.type === "FeatureCollection" && Array.isArray(geojson.features) && geojson.features.length > 0) {
    return fromGeom(geojson.features[0].geometry);
  } else if (geojson.type === "Feature") {
    return fromGeom(geojson.geometry);
  } else if (!geojson.type && typeof geojson === "object") {
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
  const name = (props.name || "").toString().toUpperCase();

  if (name.includes("3006") || (name.includes("SWEREF") && name.includes("TM"))) {
    return "EPSG:3006";
  }
  return null;
}

function reprojectGeoJSON(geojson, fromCrs, toCrs = "EPSG:4326") {
  if (typeof proj4 === "undefined") return geojson;
  if (!proj4.defs[fromCrs]) return geojson;

  const transformCoord = (coord) => {
    const [x, y] = coord;
    const [lon, lat] = proj4(fromCrs, toCrs, [x, y]);
    return [lon, lat];
  };

  function reprojectGeometry(geom) {
    if (!geom) return geom;
    const type = geom.type;

    if (type === "Point") {
      geom.coordinates = transformCoord(geom.coordinates);
    } else if (type === "MultiPoint" || type === "LineString") {
      geom.coordinates = geom.coordinates.map(transformCoord);
    } else if (type === "MultiLineString" || type === "Polygon") {
      geom.coordinates = geom.coordinates.map(ring => ring.map(transformCoord));
    } else if (type === "MultiPolygon") {
      geom.coordinates = geom.coordinates.map(poly => poly.map(ring => ring.map(transformCoord)));
    } else if (type === "GeometryCollection" && Array.isArray(geom.geometries)) {
      geom.geometries.forEach(g => reprojectGeometry(g));
    }
    return geom;
  }

  function process(obj) {
    if (!obj) return obj;
    if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
      obj.features.forEach(f => { if (f.geometry) reprojectGeometry(f.geometry); });
    } else if (obj.type === "Feature" && obj.geometry) {
      reprojectGeometry(obj.geometry);
    } else if (!obj.type && typeof obj === "object") {
      Object.values(obj).forEach(v => process(v));
    }
    return obj;
  }

  return process(geojson);
}

function maybeReprojectGeoJSON(geojson, srcCrs) {
  if (!srcCrs || srcCrs === "EPSG:4326") return geojson;

  const sample = getFirstCoordinate(geojson);
  if (sample) {
    const [x, y] = sample;
    if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return geojson;
  }

  return reprojectGeoJSON(geojson, srcCrs, "EPSG:4326");
}

// ==========================
// Lägg till GeoJSON i kartan
// ==========================
function processGeoJSON(rawGeoJSON, type) {
  let geojson = rawGeoJSON;

  if (!geojson || typeof geojson !== "object") {
    throw new Error("Ogiltig GeoJSON-struktur.");
  }

  if (!geojson.features) {
    const candidates = Object.values(geojson).filter(
      v => v && typeof v === "object" && v.type === "FeatureCollection" && Array.isArray(v.features)
    );
    if (candidates.length > 0) geojson = candidates[0];
  }

  if (!geojson.features || !Array.isArray(geojson.features)) {
    throw new Error("Ogiltig GeoJSON: saknar 'features'-lista.");
  }

  if (!geojson.features.every(f => f.geometry && f.geometry.type === "Point")) {
    throw new Error("Alla geometrier i lagret måste vara av typen Point.");
  }

  const layer = L.geoJSON(geojson, {
    pointToLayer: function (feature, latlng) {
      return L.marker(latlng, {
        icon: type === "turbine" ? turbineIcon : houseIcon
      });
    },
    onEachFeature: function (feature, layer) {
      if (type === "turbine") {
        addTurbineHoverBehavior(feature, layer);
        return;
      }

      if (type === "residence") {
        layer.on("mouseover", function () {
          if (!turbinesLayer) return;

          const H = parseFloat(document.getElementById("totalhojd").value);
          const maxDist = (!isNaN(H) && H > 0) ? 9 * H : Infinity;

          const resPoint = turf.point(feature.geometry.coordinates);
          const turbines = turbinesLayer.toGeoJSON().features;

          const dists = turbines.map(t => {
            const tPoint = turf.point(t.geometry.coordinates);
            const dist = turf.distance(resPoint, tPoint, { units: "kilometers" }) * 1000;
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

          const objektId = getResidenceId(feature.properties) || "Okänt ID";
          const popupText = `<b>Objekt-ID:</b> ${objektId}<br>` +
            relevant.map(n => `${getTurbineId(n.feature.properties) || "Verk"}: ${Math.round(n.dist)} m`).join("<br>");

          layer.bindPopup(popupText).openPopup();
        });

        layer.on("mouseout", function () {
          if (layer._lines) {
            layer._lines.forEach(line => map.removeLayer(line));
            layer._lines = [];
          }
          layer.closePopup();
        });

        layer.on("click", function () {
          const objektId = getResidenceId(feature.properties);
          if (!objektId) return;

          document.querySelectorAll("#resultTable tbody tr").forEach(tr => {
            tr.classList.remove("highlight-row");
          });

          const matchRows = Array.from(document.querySelectorAll("#resultTable tbody tr")).filter(tr => {
            return tr.children[0].textContent === objektId;
          });

          matchRows.forEach((row, index) => {
            row.classList.add("highlight-row");
            if (index === 0) row.scrollIntoView({ behavior: "smooth", block: "center" });
          });

          setTimeout(() => {
            matchRows.forEach(row => row.classList.remove("highlight-row"));
          }, 5000);
        });
      }
    }
  });

  if (type === "turbine") {
    if (turbinesLayer) map.removeLayer(turbinesLayer);
    turbinesLayer = layer;

    const antalVerkEl = document.getElementById("antalVerk");
    if (antalVerkEl) antalVerkEl.textContent = geojson.features.length;

    updateIntaktPerVerk();
  }

  if (type === "residence") {
    if (residencesLayer) map.removeLayer(residencesLayer);
    residencesLayer = layer;
  }

  layer.addTo(map);

  if (turbinesLayer) {
    map.fitBounds(turbinesLayer.getBounds(), {
      padding: [30, 30],
      maxZoom: 14
    });
  }

  autoCalculate();
}

// ==========================
// Intäkt per verk
// ==========================
function updateIntaktPerVerk() {
  const pris = parseFloat(document.getElementById("prisMWh").value);
  const kurs = parseFloat(document.getElementById("vaxelkurs").value);
  const produktion = parseFloat(document.getElementById("produktion").value);

  if (!isNaN(pris) && !isNaN(kurs) && !isNaN(produktion)) {
    const intakt = pris * kurs * produktion * 1000;
    document.getElementById("intaktPerVerk").value = intakt.toLocaleString("sv-SE", {
      maximumFractionDigits: 0
    });
  } else {
    document.getElementById("intaktPerVerk").value = "";
  }
}

// ==========================
// Automatisk kalkyl
// ==========================
function autoCalculate() {
  if (!turbinesLayer || !residencesLayer) return;

  const pris = parseFloat(document.getElementById("prisMWh").value);
  const vaxel = parseFloat(document.getElementById("vaxelkurs").value);
  const produktion = parseFloat(document.getElementById("produktion").value);
  const totalhojd = parseFloat(document.getElementById("totalhojd").value);

  if ([pris, vaxel, produktion, totalhojd].some(isNaN) || totalhojd <= 0) return;

  const intaktPerVerk = pris * vaxel * produktion * 1000;

  const residences = residencesLayer.toGeoJSON().features;
  const turbines = turbinesLayer.toGeoJSON().features;

  const antalVerk = turbines.length;
  const intaktAnlaggning = intaktPerVerk * antalVerk;

  const rows = [];

  for (const res of residences) {
    const resCoord = res.geometry.coordinates;
    const objektId = getResidenceId(res.properties);

    if (!objektId) {
      console.warn("Bostad utan objekt-id hittades och hoppades över.", res.properties);
      continue;
    }

    const dists = turbines.map(turbine => {
      const dist = turf.distance(
        turf.point(resCoord),
        turf.point(turbine.geometry.coordinates),
        { units: "kilometers" }
      ) * 1000;

      const promille = getPromilleForDistance(dist, totalhojd);
      const ersattningPre = promille > 0 ? (intaktPerVerk * promille / 1000) : 0;

      return {
        dist,
        promille,
        WTG_Number: getTurbineId(turbine.properties) || "",
        ersattningPre
      };
    });

    const relevanta = dists
      .filter(e => e.promille > 0)
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

  capFactor = 1;
  capApplied = false;

  if (rows.length > 0) {
    const totalErsPreCap = rows.reduce((sum, r) => sum + r.ersattning, 0);
    const maxTillaten = intaktAnlaggning * 0.02;

    if (totalErsPreCap > maxTillaten && totalErsPreCap > 0) {
      capFactor = maxTillaten / totalErsPreCap;
      capApplied = true;

      rows.forEach(r => {
        r.ersattning = r.ersattning * capFactor;
      });
    }
  }

  rows.forEach(r => {
    r.ersattning = Math.round(r.ersattning);
  });

  currentRows = rows;
  renderTable(currentRows);
  renderTurbineCostTable(currentRows);
  updateSummary(currentRows);
}

function updateSummary(rows) {
  const box = document.getElementById("summaryBox");
  if (!box) return;

  if (!rows || rows.length === 0) {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }

  const totalErs = rows.reduce((sum, r) => sum + (r.ersattning || 0), 0);

  const idSet = new Set();
  rows.forEach(r => {
    if (r.ersattning > 0 && r.objektiden) idSet.add(r.objektiden);
  });

  const antalBost = idSet.size;
  const genomsnitt = antalBost > 0 ? (totalErs / antalBost) : 0;

  let capText = "";
  if (capApplied && capFactor < 1) {
    const faktorText = capFactor.toFixed(3).replace('.', ',');
    capText = `
      <br><strong>Obs:</strong> 2 %-taket har aktiverats. Skalfaktor: ${faktorText}
      <span id="capInfoToggle" style="cursor:pointer; margin-left:4px;">ⓘ</span>
      <div id="capInfoDetail" style="display:none; margin-top:4px;">
        Den totala ersättningen översteg 2 procent av anläggningens intäkter,
        därför har samtliga ersättningar skalats ned proportionellt.
      </div>`;
  }

  box.innerHTML = `
    <strong>Sammanfattning:</strong><br>
    Totalt antal berättigade bostäder: ${antalBost}<br>
    Totalt ersättningsbelopp: ${totalErs.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} SEK<br>
    Genomsnittlig ersättning per berättigad bostad: ${Math.round(genomsnitt).toLocaleString("sv-SE")} SEK
    ${capText}
  `;
  box.style.display = "block";

  const toggle = document.getElementById("capInfoToggle");
  const detail = document.getElementById("capInfoDetail");
  if (toggle && detail) {
    toggle.onclick = () => {
      detail.style.display = (detail.style.display === "none" || detail.style.display === "") ? "block" : "none";
    };
  }
}

function renderTurbineCostTable(rows) {
  const tbody = document.querySelector("#turbineResultTable tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

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

  const turbineRows = Object.values(turbineMap)
    .sort((a, b) => b.totalErsattning - a.totalErsattning);

  turbineRows.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.verk}</td>
      <td>${row.totalErsattning.toLocaleString("sv-SE")} SEK</td>
      <td>${row.bostader.size}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTable(data) {
  const tbody = document.querySelector("#resultTable tbody");
  tbody.innerHTML = "";

  data.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.objektiden}</td>
      <td>${row.verk}</td>
      <td>${row.avstand} m</td>
      <td>${row.promille.toString().replace('.', ',')} ‰</td>
      <td>${row.ersattning.toLocaleString("sv-SE")}</td>
    `;
    tbody.appendChild(tr);
  });

  const openResultsBtn = document.getElementById("openResultsBtn");
  const resultsOverlay = document.getElementById("resultsOverlay");

  if (openResultsBtn) {
    openResultsBtn.style.display = data.length > 0 ? "block" : "none";
  }

  if (resultsOverlay && data.length === 0) {
    resultsOverlay.style.display = "none";
  }
}

// ==========================
// Sortering av tabellen
// ==========================
let sortState = { column: null, asc: true };

function sortCurrentRowsByColumn(colIndex) {
  if (!currentRows || currentRows.length === 0) return;

  const asc = (sortState.column === colIndex) ? !sortState.asc : true;
  sortState = { column: colIndex, asc };
  const factor = asc ? 1 : -1;

  currentRows.sort((a, b) => {
    let vA, vB;
    switch (colIndex) {
      case 0:
        vA = a.objektiden || "";
        vB = b.objektiden || "";
        return vA.localeCompare(vB, "sv") * factor;
      case 1:
        vA = a.verk || "";
        vB = b.verk || "";
        return vA.localeCompare(vB, "sv") * factor;
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
// Ladda demo-data direkt vid sidstart
// ==========================
async function loadDemoData() {
  try {
    updateIntaktPerVerk();

    const [turbineResponse, residenceResponse] = await Promise.all([
      fetch("data/turbines.geojson", { cache: "no-store" }),
      fetch("data/houses.geojson", { cache: "no-store" })
    ]);

    if (!turbineResponse.ok) {
      throw new Error("Kunde inte läsa data/turbines.geojson");
    }
    if (!residenceResponse.ok) {
      throw new Error("Kunde inte läsa data/houses.geojson");
    }

    let turbinesGeoJSON = await turbineResponse.json();
    let residencesGeoJSON = await residenceResponse.json();

    turbinesGeoJSON = maybeReprojectGeoJSON(turbinesGeoJSON, detectCrsFromGeoJSON(turbinesGeoJSON));
    residencesGeoJSON = maybeReprojectGeoJSON(residencesGeoJSON, detectCrsFromGeoJSON(residencesGeoJSON));

    processGeoJSON(turbinesGeoJSON, "turbine");
    processGeoJSON(residencesGeoJSON, "residence");
  } catch (error) {
    console.error(error);

    const summaryBox = document.getElementById("summaryBox");
    if (summaryBox) {
      summaryBox.style.display = "block";
      summaryBox.className = "alert alert-danger py-2 mb-3";
      summaryBox.innerHTML = `
        Demo-data kunde inte laddas.<br>
        Kontrollera att följande filer finns i <code>/demo/data/</code>:<br>
        <code>turbines.geojson</code> och <code>houses.geojson</code>.
      `;
    }
  }
}

// ==========================
// DOMContentLoaded
// ==========================
document.addEventListener("DOMContentLoaded", () => {
  const headers = document.querySelectorAll("#resultTable thead th");
  headers.forEach((th, index) => {
    th.style.cursor = "pointer";
    th.title = "Klicka för att sortera";
    th.addEventListener("click", () => {
      sortCurrentRowsByColumn(index);
    });
  });

 const exportExcelBtn = document.getElementById("exportExcelBtn");
if (exportExcelBtn) {
  exportExcelBtn.addEventListener("click", function () {
    if (typeof XLSX === "undefined") return;

    const residenceTableWrapper = document.getElementById("residenceTableWrapper");
    const turbineTableWrapper = document.getElementById("turbineTableWrapper");

    const showingResidenceTable =
      residenceTableWrapper && residenceTableWrapper.style.display !== "none";

    const table = showingResidenceTable
      ? document.getElementById("resultTable")
      : document.getElementById("turbineResultTable");

    if (!table) return;

    const sheetName = showingResidenceTable ? "Per bostad" : "Per verk";
    const fileName = showingResidenceTable
      ? "kompensa_resultat_per_bostad.xlsx"
      : "kompensa_resultat_per_verk.xlsx";

    const wb = XLSX.utils.table_to_book(table, { sheet: sheetName });
    XLSX.writeFile(wb, fileName);
  });
}

  const openResultsBtn = document.getElementById("openResultsBtn");
  const closeResultsBtn = document.getElementById("closeResultsBtn");
  const resultsOverlay = document.getElementById("resultsOverlay");
  const showResidenceResultsBtn = document.getElementById("showResidenceResultsBtn");
  const showTurbineResultsBtn = document.getElementById("showTurbineResultsBtn");
  const residenceTableWrapper = document.getElementById("residenceTableWrapper");
  const turbineTableWrapper = document.getElementById("turbineTableWrapper");
  const resultsTitle = document.getElementById("resultsTitle");

  function showResidenceTableView() {
  if (residenceTableWrapper) residenceTableWrapper.style.display = "block";
  if (turbineTableWrapper) turbineTableWrapper.style.display = "none";
  if (resultsTitle) resultsTitle.textContent = "Resultat: Ersättning per bostad";

  if (showResidenceResultsBtn) showResidenceResultsBtn.style.display = "none";
  if (showTurbineResultsBtn) showTurbineResultsBtn.style.display = "inline-block";
}

function showTurbineTableView() {
  if (residenceTableWrapper) residenceTableWrapper.style.display = "none";
  if (turbineTableWrapper) turbineTableWrapper.style.display = "block";
  if (resultsTitle) resultsTitle.textContent = "Resultat: Kostnad per verk";

  if (showResidenceResultsBtn) showResidenceResultsBtn.style.display = "inline-block";
  if (showTurbineResultsBtn) showTurbineResultsBtn.style.display = "none";
}

if (showResidenceResultsBtn) {
  showResidenceResultsBtn.addEventListener("click", showResidenceTableView);
}

if (showTurbineResultsBtn) {
  showTurbineResultsBtn.addEventListener("click", showTurbineTableView);
}

  if (openResultsBtn && closeResultsBtn && resultsOverlay) {
  openResultsBtn.addEventListener("click", () => {
    const isHidden =
      resultsOverlay.style.display === "none" ||
      resultsOverlay.style.display === "";

    if (isHidden) {
      resultsOverlay.style.display = "block";
      showResidenceTableView();
    } else {
      resultsOverlay.style.display = "none";
    }
  });

  closeResultsBtn.addEventListener("click", () => {
    resultsOverlay.style.display = "none";
  });
  
}
const infoIconButtons = document.querySelectorAll(".info-icon-btn");

infoIconButtons.forEach(button => {
  button.addEventListener("click", function (event) {
    event.stopPropagation();

    const targetId = button.getAttribute("data-info-target");
    const targetBox = document.getElementById(targetId);
    if (!targetBox) return;

    document.querySelectorAll(".info-tooltip-box").forEach(box => {
      if (box !== targetBox) {
        box.style.display = "none";
      }
    });

    targetBox.style.display =
      targetBox.style.display === "block" ? "none" : "block";
  });
});

document.addEventListener("click", function () {
  document.querySelectorAll(".info-tooltip-box").forEach(box => {
    box.style.display = "none";
  });
});

updateIntaktPerVerk();
loadDemoData();
});
