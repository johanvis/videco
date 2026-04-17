// ==========================
// Initiera kartan
// ==========================
let map = L.map('map').setView([62.0, 15.0], 5);
L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let turbinesLayer, residencesLayer;
let currentRows = [];

// För 2 %-tak
let capFactor = 1;      // skalfaktor (1 = inget tak, < 1 = nedskalning)
let capApplied = false; // true om 2 %-taket slog till

// ==========================
// proj4 – definiera SWEREF vi stödjer
// ==========================
if (typeof proj4 !== "undefined") {
  // SWEREF 99 TM – EPSG:3006
  if (!proj4.defs["EPSG:3006"]) {
    proj4.defs(
      "EPSG:3006",
      "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
    );
  }

  // Här kan du lägga till fler SWEREF-varianter senare om du vill, t.ex:
  // proj4.defs("EPSG:3007", "..."); osv.
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

const houseZ1Icon = L.icon({
  iconUrl: 'icons/house_affected.png',
  iconSize: [26, 26],
  iconAnchor: [13, 13]
});

const houseZ2Icon = L.icon({
  iconUrl: 'icons/house_affected.png',
  iconSize: [26, 26],
  iconAnchor: [13, 13]
});

const houseZ3Icon = L.icon({
  iconUrl: 'icons/house_affected.png',
  iconSize: [26, 26],
  iconAnchor: [13, 13]
});

const houseZ4Icon = L.icon({
  iconUrl: 'icons/house_affected.png',
  iconSize: [26, 26],
  iconAnchor: [13, 13]
});

const houseZ5Icon = L.icon({
  iconUrl: 'icons/house_affected.png',
  iconSize: [26, 26],
  iconAnchor: [13, 13]
});

// ==========================
// Juridiskt korrekt promille – enligt lagrådsremiss (12 §)
// ==========================
function getPromilleForDistance(distMeters, H) {
  if (!H || isNaN(H) || H <= 0) return 0;

  if (distMeters <= 5 * H) return 2.5;
  if (distMeters <= 6 * H) return 2.0;
  if (distMeters <= 7 * H) return 1.5;
  if (distMeters <= 8 * H) return 1.0;
  if (distMeters <= 9 * H) return 0.5;

  return 0;
}
// ==========================
// Hjälpfunktion: hämta bostadens ID (stöd för flera fältnamn)
// ==========================
function getResidenceId(props) {
  if (!props) return null;

  // Stödjer båda varianterna som förekommer internt
  const id = props["objektiden"] ?? props["objektidentitet"];

  if (id === undefined || id === null) return null;
  return id.toString().trim();
}
// ==========================
// Hjälpfunktion: hämta vindkraftverkets ID (stöd för flera fältnamn)
// ==========================
function getTurbineId(props) {
  if (!props) return null;

  // Stödjer både standardfältet och alternativt TEXT-fält
  const id = props["WTG_Number"] ?? props["TEXT"];

  if (id === undefined || id === null) return null;
  return id.toString().trim();
}

// ==========================
// Hjälpfunktion: zonringar runt ett verk + ikonfärgning + klick
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
      const radius = m * H; // meter
      const circle = L.circle(center, {
        radius: radius,
        color: '#007bff',
        weight: 1,
        fillColor: '#007bff',
        fillOpacity: opacities[idx],
        dashArray: idx === 0 ? null : "4"
      }).addTo(map);
      layer._rings.push(circle);
    });

    // Zonfärgning av bostadshus inom 9H
    if (residencesLayer && H > 0) {
      const residences = residencesLayer.getLayers();
      layer._originalIcons = new Map();

      residences.forEach(resLayer => {
        if (!resLayer.getLatLng) return;
        const resLatLng = resLayer.getLatLng();

        const d = map.distance(center, resLatLng); // meter
        const promille = getPromilleForDistance(d, H);

        if (promille > 0) {
          // Spara originalikon
          if (!layer._originalIcons.has(resLayer)) {
            layer._originalIcons.set(resLayer, resLayer.getIcon());
          }

          let newIcon = houseIcon;
          if (promille === 2.5) newIcon = houseZ1Icon;
          else if (promille === 2.0) newIcon = houseZ2Icon;
          else if (promille === 1.5) newIcon = houseZ3Icon;
          else if (promille === 1.0) newIcon = houseZ4Icon;
          else if (promille === 0.5) newIcon = houseZ5Icon;

          resLayer.setIcon(newIcon);
        }
      });
    }
  });

  layer.on("mouseout", function () {
    if (layer._rings) {
      layer._rings.forEach(c => map.removeLayer(c));
      layer._rings = [];
    }

    // Återställ bostadshus-ikoner
    if (layer._originalIcons) {
      layer._originalIcons.forEach((icon, resLayer) => {
        resLayer.setIcon(icon);
      });
      layer._originalIcons.clear();
    }
  });

  // Klick på verk: highlighta alla rader i tabellen för det verket
  layer.on("click", function () {
    const wtg = getTurbineId(feature.properties);
    if (!wtg) return;

    const rows = Array.from(document.querySelectorAll("#resultTable tbody tr"));
    if (!rows.length) return;

    rows.forEach(tr => tr.classList.remove("highlight-row"));

    const matching = rows.filter(tr => {
      const cellText = tr.children[2].textContent.trim();
      return cellText === wtg;
    });

    if (matching.length === 0) return;

    matching.forEach((tr, idx) => {
      tr.classList.add("highlight-row");
      if (idx === 0) {
        tr.scrollIntoView({ behavior: "smooth", block: "center" });
      }
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

// Plocka ut första koordinaten för att kolla “ser det ut som lat/lon?”
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

// Detektera CRS från GeoJSON (crs-objekt)
function detectCrsFromGeoJSON(geojson) {
  if (!geojson || !geojson.crs) return null;
  const props = geojson.crs.properties || {};
  const name = (props.name || "").toString().toUpperCase();

  if (name.includes("3006") || name.includes("SWEREF") && name.includes("TM")) {
    return "EPSG:3006";
  }

  return null;
}

// Detektera CRS från .prj-text (shapefile)
function detectCrsFromPrjText(prjText) {
  if (!prjText) return null;
  const txt = prjText.toUpperCase();

  if (txt.includes("3006") || (txt.includes("SWEREF") && txt.includes("TM"))) {
    return "EPSG:3006";
  }

  return null;
}

// Reprojektera GeoJSON med proj4
function reprojectGeoJSON(geojson, fromCrs, toCrs = "EPSG:4326") {
  if (typeof proj4 === "undefined") {
    console.warn("proj4 är inte laddat – skippar reprojektion.");
    return geojson;
  }

  if (!proj4.defs[fromCrs]) {
    console.warn("Ingen proj4-definition för " + fromCrs + " – skippar reprojektion.");
    return geojson;
  }

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
      geom.coordinates = geom.coordinates.map(poly =>
        poly.map(ring => ring.map(transformCoord))
      );
    } else if (type === "GeometryCollection" && Array.isArray(geom.geometries)) {
      geom.geometries.forEach(g => reprojectGeometry(g));
    }
    return geom;
  }

  function process(obj) {
    if (!obj) return obj;
    if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
      obj.features.forEach(f => {
        if (f.geometry) reprojectGeometry(f.geometry);
      });
    } else if (obj.type === "Feature" && obj.geometry) {
      reprojectGeometry(obj.geometry);
    } else if (!obj.type && typeof obj === "object") {
      Object.values(obj).forEach(v => process(v));
    }
    return obj;
  }

  return process(geojson);
}

// Wrapper: reprojicera om det verkligen behövs
function maybeReprojectGeoJSON(geojson, srcCrs) {
  if (!srcCrs || srcCrs === "EPSG:4326") return geojson;

  const sample = getFirstCoordinate(geojson);
  if (sample) {
    const [x, y] = sample;
    // Om det redan ser ut som lat/lon (deg), skippa reprojektion
    if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
      return geojson;
    }
  }

  return reprojectGeoJSON(geojson, srcCrs, "EPSG:4326");
}

// ==========================
// Filuppladdning (stöd för GeoJSON, Shapefile .zip, KML/KMZ + reprojektion)
// ==========================
document.getElementById("turbineFile").addEventListener("change", (event) => {
  if (event.target.files[0]) {
    handleFileUpload(event.target.files[0], "turbine");
  }
});

document.getElementById("residenceFile").addEventListener("change", (event) => {
  if (event.target.files[0]) {
    handleFileUpload(event.target.files[0], "residence");
  }
});

// Allmän filhanterare
function handleFileUpload(file, type) {
  const name = file.name.toLowerCase();

  if (name.endsWith(".geojson") || name.endsWith(".json")) {
    // GeoJSON
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        let geojson = JSON.parse(e.target.result);
        const srcCrs = detectCrsFromGeoJSON(geojson);
        geojson = maybeReprojectGeoJSON(geojson, srcCrs);
        processGeoJSON(geojson, type);
      } catch (err) {
        alert("Ogiltig GeoJSON-fil.");
        console.error(err);
      }
    };
    reader.readAsText(file);

  } else if (name.endsWith(".zip")) {
  // Zippad Shapefile (via FileReader + JSZip + shpjs)
  const reader = new FileReader();

  reader.onload = function (e) {
    const arrayBuffer = e.target.result;

    JSZip.loadAsync(arrayBuffer)
      .then(zip => {
        // Försök hitta .prj för att detektera CRS
        const prjName = Object.keys(zip.files).find(fn =>
          fn.toLowerCase().endsWith(".prj")
        );
        if (!prjName) {
          return { srcCrs: null, arrayBuffer };
        }

        return zip.files[prjName].async("string").then(prjText => ({
          srcCrs: detectCrsFromPrjText(prjText),
          arrayBuffer
        }));
      })
      .then(({ srcCrs, arrayBuffer }) => {
        // Läsa shapefilen med shpjs från samma ArrayBuffer
        return shp(arrayBuffer).then(geojson => {
          const out = maybeReprojectGeoJSON(geojson, srcCrs);
          processGeoJSON(out, type);
        });
      })
      .catch(err => {
        console.error("Fel vid läsning av shapefile (.zip):", err);
        alert("Kunde inte läsa shapefile (.zip). Kontrollera att zip-filen innehåller .shp, .dbf, .shx och gärna .prj.");
      });
  };

  reader.readAsArrayBuffer(file);

  } else if (name.endsWith(".kml")) {
    // KML → GeoJSON (KML är alltid WGS84)
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const text = e.target.result;
        const parser = new DOMParser();
        const kmlDoc = parser.parseFromString(text, "application/xml");
        const geojson = toGeoJSON.kml(kmlDoc);
        // KML är redan WGS84 – ingen reprojektion
        processGeoJSON(geojson, type);
      } catch (err) {
        console.error("Fel vid läsning av KML:", err);
        alert("Kunde inte läsa KML-fil.");
      }
    };
    reader.readAsText(file);

  } else if (name.endsWith(".kmz")) {
    // KMZ (zippad KML) → GeoJSON
    const reader = new FileReader();
    reader.onload = function (e) {
      JSZip.loadAsync(e.target.result)
        .then(zip => {
          const kmlFileName = Object.keys(zip.files).find(fn => fn.toLowerCase().endsWith(".kml"));
          if (!kmlFileName) {
            throw new Error("Ingen .kml-fil hittades i KMZ-arkivet.");
          }
          return zip.files[kmlFileName].async("string");
        })
        .then(kmlText => {
          const parser = new DOMParser();
          const kmlDoc = parser.parseFromString(kmlText, "application/xml");
          const geojson = toGeoJSON.kml(kmlDoc);
          processGeoJSON(geojson, type);
        })
        .catch(err => {
          console.error("Fel vid läsning av KMZ:", err);
          alert("Kunde inte läsa KMZ-fil (zippad KML).");
        });
    };
    reader.readAsArrayBuffer(file);

  } else {
    alert("Filformatet stöds inte. Ladda upp GeoJSON (.geojson/.json), zippad Shapefile (.zip) eller KML/KMZ (.kml/.kmz).");
  }
}

// ==========================
// Gemensam funktion: ta emot GeoJSON-objekt och lägga till i kartan
// ==========================
function processGeoJSON(rawGeoJSON, type) {
  // shpjs kan returnera antingen en FeatureCollection eller ett objekt med flera lager.
  let geojson = rawGeoJSON;

  if (!geojson || typeof geojson !== "object") {
    alert("Ogiltig GeoJSON-struktur.");
    return;
  }

  // Om det inte finns .features men vi har ett objekt med delmängder, försök ta första FeatureCollection
  if (!geojson.features) {
    const candidates = Object.values(geojson).filter(
      v => v && typeof v === "object" && v.type === "FeatureCollection" && Array.isArray(v.features)
    );
    if (candidates.length > 0) {
      geojson = candidates[0];
    }
  }

  if (!geojson.features || !Array.isArray(geojson.features)) {
    alert("Ogiltig GeoJSON: saknar 'features'-lista.");
    return;
  }

  // Vi kräver punkter
  if (!geojson.features.every(f => f.geometry && f.geometry.type === "Point")) {
    alert("Alla geometrier i lagret måste vara av typen 'Point'.");
    return;
  }

  const layer = L.geoJSON(geojson, {
    pointToLayer: function (feature, latlng) {
      return L.marker(latlng, {
        icon: type === "turbine" ? turbineIcon : houseIcon
      });
    },
    onEachFeature: function (feature, layer) {

      // Turbiner
      if (type === "turbine") {
        addTurbineHoverBehavior(feature, layer);
        return;
      }

      // Bostäder
      if (type === "residence") {

        // Hovra: linjer till närmaste 2 verk (inom 8H)
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
            relevant.map(n =>
              `${getTurbineId(n.feature.properties) || "Verk"}: ${Math.round(n.dist)} m`
            ).join("<br>");

          layer.bindPopup(popupText).openPopup();
        });

        // Ta bort linjer + popup vid mouseout
        layer.on("mouseout", function () {
          if (layer._lines) {
            layer._lines.forEach(line => map.removeLayer(line));
            layer._lines = [];
          }
          layer.closePopup();
        });

        // Klick: highlighta rader i tabellen för detta objektiden
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
            if (index === 0) {
              row.scrollIntoView({ behavior: "smooth", block: "center" });
            }
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

    const statusEl = document.getElementById("turbineStatus");
    if (statusEl) {
      statusEl.textContent = "Korrekt fil ✔️";
      statusEl.style.color = "green";
    }
    const antalVerkEl = document.getElementById("antalVerk");
    if (antalVerkEl) {
      antalVerkEl.textContent = geojson.features.length;
    }

    updateIntaktPerVerk();
  }

  if (type === "residence") {
    if (residencesLayer) map.removeLayer(residencesLayer);
    residencesLayer = layer;
  }

  layer.addTo(map);
  map.fitBounds(layer.getBounds());

  autoCalculate();
}

// ==========================
// Beräkning: intäkt per verk (schablon)
// ==========================
function updateIntaktPerVerk() {
  const pris = parseFloat(document.getElementById("prisMWh").value);
  const kurs = parseFloat(document.getElementById("vaxelkurs").value);
  const produktion = parseFloat(document.getElementById("produktion").value);

  if (!isNaN(pris) && !isNaN(kurs) && !isNaN(produktion)) {
    const intakt = pris * kurs * produktion * 1000; // GWh -> MWh
    document.getElementById("intaktPerVerk").value = intakt.toLocaleString("sv-SE", {
      maximumFractionDigits: 0
    });
  } else {
    document.getElementById("intaktPerVerk").value = "";
  }
}

// ==========================
// Automatisk kalkyl (huvudlogik + 2 %-tak)
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
    const fastighet = res.properties["fastighet"] || "";

    if (!objektId) {
     alert("Bostadslagret saknar ID-fält. Verktyget kräver 'objektiden' eller 'objektidentitet'.");
     return;
    }

    const dists = turbines.map(turbine => {
      const tCoord = turbine.geometry.coordinates;
      const dist = turf.distance(
        turf.point(resCoord),
        turf.point(tCoord),
        { units: "kilometers" }
       ) * 1000; // km --> meter
      

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
        fastighet,
        verk: item.WTG_Number,
        avstand: Math.round(item.dist),
        promille: item.promille,
        ersattningPreCap: item.ersattningPre,
        ersattning: item.ersattningPre // kommer ev. skalas
      });
    });
  }

  // 2 %-tak på anläggningens intäkter
  capFactor = 1;
  capApplied = false;

  if (rows.length > 0) {
    let totalErs = rows.reduce((sum, r) => sum + r.ersattning, 0);
    const maxTillaten = intaktAnlaggning * 0.02;

    if (totalErs > maxTillaten && totalErs > 0) {
      const faktor = maxTillaten / totalErs;
      capFactor = faktor;
      capApplied = true;

      rows.forEach(r => {
        r.ersattning = r.ersattning * faktor;
      });
    }
  }

  // Avrunda efter eventuell skalning
  rows.forEach(r => {
    r.ersattning = Math.round(r.ersattning);
  });

  currentRows = rows;

  renderTable(currentRows);
  updateSummary(currentRows, intaktAnlaggning);
}

// ==========================
// Sammanfattning ovanför tabellen
// ==========================
function updateSummary(rows, intaktAnlaggning) {
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
    if (r.ersattning > 0 && r.objektiden) {
      idSet.add(r.objektiden);
    }
  });

  const antalBost = idSet.size;
  const genomsnitt = antalBost > 0 ? (totalErs / antalBost) : 0;

  let capText = "";
  if (capApplied && capFactor < 1) {
    const faktorText = capFactor.toFixed(3).replace('.', ',');

    capText =
      `<br><strong>Obs:</strong> 2 %-taket har aktiverats. Skalfaktor: ${faktorText}
       <span id="capInfoToggle" style="cursor:pointer; margin-left:4px;">ⓘ</span>
       <div id="capInfoDetail" style="display:none; margin-top:4px;">
         Systemet innehåller ett tak som innebär att den totala vindkraftsersättningen
         inte får överstiga 2&nbsp;% av anläggningens intäkter. Om summan av alla
         beräknade ersättningar blir högre än detta tak, skalas samtliga belopp
         ned proportionellt med samma faktor så att totalen motsvarar som mest 2&nbsp;%.
         <br>
         <a href="https://www.regeringen.se/contentassets/ee63dd88fd5c4e45bf66d6be429ffcbd/intaktsdelning-fran-vindkraftsanlaggningar--kompletterande-promemoria-till-betankandet-vardet-av-vinden-sou-202318.pdf"
            target="_blank">
           Läs mer i Klimat- och näringslivsdepartementets promemoria.
         </a>
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

  // Koppla klick på ⓘ (om den finns)
  const toggle = document.getElementById("capInfoToggle");
  const detail = document.getElementById("capInfoDetail");
  if (toggle && detail) {
    toggle.onclick = () => {
      detail.style.display = (detail.style.display === "none" || detail.style.display === "") ? "block" : "none";
    };
  }
}

// ==========================
// Tabell-rendering
// ==========================
function renderTable(data) {
  const tbody = document.querySelector("#resultTable tbody");
  tbody.innerHTML = "";

  data.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.objektiden}</td>
      <td>${row.fastighet}</td>
      <td>${row.verk}</td>
      <td>${row.avstand} m</td>
      <td>${row.promille.toString().replace('.', ',')} ‰</td>
      <td>${row.ersattning.toLocaleString("sv-SE")}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("resultatContainer").style.display =
    data.length > 0 ? "block" : "none";
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
      case 0: // Objekt-ID
        vA = a.objektiden || "";
        vB = b.objektiden || "";
        return vA.localeCompare(vB, "sv") * factor;
      case 1: // Fastighet
        vA = a.fastighet || "";
        vB = b.fastighet || "";
        return vA.localeCompare(vB, "sv") * factor;
      case 2: // Vindkraftsnummer
        vA = a.verk || "";
        vB = b.verk || "";
        return vA.localeCompare(vB, "sv") * factor;
      case 3: // Avstånd
        vA = a.avstand || 0;
        vB = b.avstand || 0;
        return (vA - vB) * factor;
      case 4: // Promille
        vA = a.promille || 0;
        vB = b.promille || 0;
        return (vA - vB) * factor;
      case 5: // Ersättning i SEK
        vA = a.ersattning || 0;
        vB = b.ersattning || 0;
        return (vA - vB) * factor;
      default:
        return 0;
    }
  });

  renderTable(currentRows);
}

// Koppla klick-event till tabellhuvudet
document.addEventListener("DOMContentLoaded", () => {
  const headers = document.querySelectorAll("#resultTable thead th");
  headers.forEach((th, index) => {
    th.style.cursor = "pointer";
    th.title = "Klicka för att sortera";

    th.addEventListener("click", () => {
      sortCurrentRowsByColumn(index);
    });
  });
});

// ==========================
// Nedladdning till Excel
// ==========================
document.getElementById("downloadExcel").addEventListener("click", function () {
  const table = document.getElementById("resultTable");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.table_to_sheet(table);
  XLSX.utils.book_append_sheet(wb, ws, "Ersättning");
  XLSX.writeFile(wb, "ersattning_per_bostad.xlsx");
});