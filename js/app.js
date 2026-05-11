/**
 * Geoportal Temuco - Catastro en Tiempo Real
 * Versión Final: 11-05-2026
 */

const CONFIG = {
    MAP_CENTER: [-38.7359, -72.5904],
    INITIAL_ZOOM: 14,
    SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTM9vKw4CQimv9A7xagyzecSKk9P-_4m7qJ8ykCmP3p9a8CrbMp1Rls_pEoxXFV0gXOpI9AOlMSpygA/pub?output=csv', 
    REFRESH_INTERVAL: 0 
};

let map;
let markerLayer = L.layerGroup();

// CAPA CATASTRO (PUNTOS)
let catastroLayer = L.geoJSON(null, {
    style: function(feature) {
        return { color: "#3b82f6", weight: 3, opacity: 0.8, fillColor: "#3b82f6", fillOpacity: 0.2 };
    },
    pointToLayer: function (feature, latlng) {
        return L.circleMarker(latlng, { radius: 3, fillColor: "#3b82f6", color: "#ffffff", weight: 1, opacity: 1, fillOpacity: 0.9 });
    },
    onEachFeature: function(feature, layer) {
        if (feature.properties && feature.geometry && feature.geometry.coordinates) {
            const props = feature.properties;
            let lng = feature.geometry.coordinates[0], lat = feature.geometry.coordinates[1];
            const utm18S = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
            const wgs84 = "EPSG:4326"; 
            let displayUTM = "No disponible";

            if (lng !== undefined && lat !== undefined && typeof proj4 !== 'undefined') {
                try {
                    if (Math.abs(lng) < 180) {
                        const utmCoords = proj4(wgs84, utm18S, [lng, lat]);
                        displayUTM = `${utmCoords[0].toFixed(0)} E, ${utmCoords[1].toFixed(0)} N`;
                    } else {
                        displayUTM = `${lng.toFixed(0)} E, ${lat.toFixed(0)} N`;
                    }
                } catch (e) {
                    displayUTM = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                }
            }

            const keys = Object.keys(props);
            const findKey = (terms) => keys.find(k => {
                const cleanKey = k.toLowerCase().trim();
                return terms.some(t => cleanKey.includes(t));
            });

            const keyId = findKey(['codigo de', 'código de', 'codigo']);
            const keyNombre = findKey(['señal', 'tipo', 'nombre', 'calle']);
            const keyFecha = findKey(['fecha', 'date']);
            const keyEstado = findKey(['estado', 'status']);
            const keyObs = findKey(['observaci', 'comentari']);
            const keyDir = findKey(['direcci', 'ubicaci']);
            const keyImg = findKey(['foto', 'imagen']);

            const NumeroID = keyId ? props[keyId] : (props.id || 'S/N');
            const Nombre = keyNombre ? props[keyNombre] : 'Elemento';
            const Fecha = keyFecha ? props[keyFecha] : 'No registrada';
            const Estado = keyEstado ? props[keyEstado] : 'N/A';
            const Observaciones = keyObs ? props[keyObs] : '-';
            const Direccion = keyDir ? props[keyDir] : '';
            const imgURL = keyImg ? transformDriveUrl(props[keyImg]) : null;

            let imagesHTML = '';
            if (imgURL) {
                imagesHTML = `
                    <div class="popup-images-grid" style="grid-template-columns: 1fr;">
                        <div class="img-wrapper">
                            <span class="img-label">Registro</span>
                            <img src="${imgURL}" class="popup-image" alt="Foto" onerror="this.src='https://placehold.co/400x250/222/3b82f6?text=Sin+Foto'" onclick="openImageModal(this.src)">
                        </div>
                    </div>`;
            }

            const popupContent = `
                <div class="popup-container catastro-popup">
                    <div class="popup-header">
                        <span class="id-badge">Nº ${NumeroID}</span>
                        <h4>${Nombre}</h4>
                    </div>
                    ${imagesHTML}
                    <div class="popup-details">
                        <div class="detail-item"><strong><i data-lucide="calendar"></i> Fecha:</strong><span>${Fecha}</span></div>
                        <div class="detail-item"><strong><i data-lucide="activity"></i> Estado:</strong><span>${Estado}</span></div>
                        <div class="detail-item"><strong><i data-lucide="map-pin"></i> Dirección:</strong><span>${Direccion}</span></div>
                        <div class="detail-item"><strong><i data-lucide="info"></i> Observaciones:</strong><p>${Observaciones}</p></div>
                        <div class="coord-badge"><i data-lucide="map-pin"></i> UTM ${displayUTM}</div>
                    </div>
                </div>
            `;
            
            layer.bindPopup(popupContent, { maxWidth: 300, className: 'custom-popup' });
            layer.on('popupopen', () => { if (typeof lucide !== 'undefined') lucide.createIcons(); });
        }
    }
});

// CAPA MACROSECTORES (POLÍGONOS)
let macrosectoresLayer = L.geoJSON(null, {
    interactive: false, // ¡ESTA ES LA MAGIA QUE DEJA PASAR EL CLIC!
    style: function(feature) {
        return { color: "#f97316", weight: 2, opacity: 0.8, fillColor: "#f97316", fillOpacity: 0.1 };
    },
    onEachFeature: function(feature, layer) {
        if (feature.properties && feature.properties.macrosect) {
            layer.bindTooltip(feature.properties.macrosect, { permanent: true, direction: 'center', className: 'macrosect-label' });
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initSidebar();
    loadTerritorialData();
    loadMacrosectores();
    loadCatastro();
});

function initMap() {
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri'
    });

    map = L.map('map', { center: CONFIG.MAP_CENTER, zoom: CONFIG.INITIAL_ZOOM, layers: [esriWorldImagery] });
    const baseMaps = { "Terreno (Esri)": esriWorldImagery, "Calles (OSM)": osm };
    const overlayMaps = { "Macrosectores": macrosectoresLayer, "Catastro Base": catastroLayer, "Catastro en Terreno": markerLayer };

    L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);
    markerLayer.addTo(map);
}

function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    const toggleIcon = document.getElementById('toggleIcon');
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        toggleIcon.setAttribute('data-lucide', sidebar.classList.contains('collapsed') ? 'chevron-right' : 'chevron-left');
        lucide.createIcons();
        setTimeout(() => map.invalidateSize(), 300);
    });
}

async function loadTerritorialData() {
    const timestamp = new Date().getTime();
    const sheetUrl = `${CONFIG.SHEET_CSV_URL}&t=${timestamp}`;
    let finalUrl = window.location.protocol === 'file:' ? `https://corsproxy.io/?${encodeURIComponent(sheetUrl)}` : sheetUrl;

    try {
        let response = await fetch(finalUrl);
        if (!response.ok) throw new Error("Fallo en la carga");
        const csvText = await response.text();
        Papa.parse(csvText, { header: true, dynamicTyping: true, skipEmptyLines: true, complete: (results) => processEntries(results.data) });
    } catch (err) { console.error("Error:", err); }
}

function processEntries(data) {
    markerLayer.clearLayers();
    const utm18S = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
    const wgs84 = "EPSG:4326";

    data.forEach((row) => {
        const keys = Object.keys(row);
        const colLat = keys.find(k => k.toLowerCase().includes('latitud'));
        const colLng = keys.find(k => k.toLowerCase().includes('longitud'));
        const colX = keys.find(k => k.toLowerCase().includes('este'));
        const colY = keys.find(k => k.toLowerCase().includes('norte'));
        
        let valLatRaw = (row[colLat] && String(row[colLat]).trim() !== "") ? row[colLat] : row[colY];
        let valLngRaw = (row[colLng] && String(row[colLng]).trim() !== "") ? row[colLng] : row[colX];
        if (!valLatRaw || !valLngRaw) return;

        let valLat = parseFloat(String(valLatRaw).replace(',', '.'));
        let valLng = parseFloat(String(valLngRaw).replace(',', '.'));

        let finalLat, finalLng, displayUTM = "";
        if (Math.abs(valLat) > 1000) {
            const coords = proj4(utm18S, wgs84, [valLng, valLat]);
            finalLng = coords[0]; finalLat = coords[1];
            displayUTM = `${valLng.toFixed(0)} E, ${valLat.toFixed(0)} N`;
        } else {
            finalLat = valLat; finalLng = valLng;
            const utm = proj4(wgs84, utm18S, [valLng, valLat]);
            displayUTM = `${utm[0].toFixed(0)} E, ${utm[1].toFixed(0)} N`;
        }

        const popupContent = `
            <div class="popup-container">
                <div class="popup-header"><span class="id-badge">Nº ${row[keys.find(k => k.toLowerCase().includes('código'))] || 'S/N'}</span><h4>${row[keys.find(k => k.toLowerCase().includes('tipo'))] || 'Señalética'}</h4></div>
                <div class="popup-details">
                    <div class="detail-item"><strong><i data-lucide="calendar"></i> Fecha:</strong><span>${row[keys.find(k => k.toLowerCase().includes('fecha'))] || 'S/F'}</span></div>
                    <div class="coord-badge"><i data-lucide="map-pin"></i> UTM ${displayUTM}</div>
                </div>
            </div>`;

        L.circleMarker([finalLat, finalLng], { radius: 8, fillColor: "#f97316", color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.8 })
            .bindPopup(popupContent, { maxWidth: 300, className: 'custom-popup' })
            .on('popupopen', () => lucide.createIcons())
            .addTo(markerLayer);
    });
}

function transformDriveUrl(url) {
    if (!url) return '';
    const match = url.match(/(?:id=|[?\/]|preview\/|d\/)([\w-]{25,})/);
    return match ? `https://lh3.googleusercontent.com/d/$${match[1]}` : url;
}

async function loadMacrosectores() {
    try {
        const shpBuffer = await fetch('Macrosectores/MACROSECTORES.shp').then(r => r.arrayBuffer());
        const dbfBuffer = await fetch('Macrosectores/MACROSECTORES.dbf').then(r => r.arrayBuffer());
        const geojson = shp.combine([shp.parseShp(shpBuffer), shp.parseDbf(dbfBuffer)]);
        
        if (Math.abs(geojson.features[0].geometry.coordinates[0][0][0]) > 180) {
            const utm18S = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
            geojson.features.forEach(f => projectGeometry(f.geometry, utm18S, "EPSG:4326"));
        }
        macrosectoresLayer.addData(geojson).addTo(map);
    } catch (err) { console.error(err); }
}

function projectGeometry(geometry, from, to) {
    const proj = (c) => { const r = proj4(from, to, [c[0], c[1]]); return [r[0], r[1]]; };
    if (geometry.type === 'Polygon') geometry.coordinates = geometry.coordinates.map(r => r.map(proj));
    else if (geometry.type === 'MultiPolygon') geometry.coordinates = geometry.coordinates.map(p => p.map(r => r.map(proj)));
}

async function loadCatastro() {
    try {
        const response = await fetch('Macrosectores/CATASTRO.geojson');
        const rawGeojson = await response.json();
        const utm18S = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
        const wgs84 = "EPSG:4326";
        
        const pointGeojson = {
            type: "FeatureCollection",
            features: rawGeojson.features.map(f => {
                if(!f.geometry) return null;
                let coords = f.geometry.type === 'Point' ? f.geometry.coordinates : 
                             f.geometry.type === 'LineString' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
                if (Array.isArray(coords[0])) coords = coords[0];

                let lng = coords[0], lat = coords[1];
                if (Math.abs(lng) > 180) {
                    const conv = proj4(utm18S, wgs84, [lng, lat]);
                    lng = conv[0]; lat = conv[1];
                }
                return { type: "Feature", properties: f.properties, geometry: { type: "Point", coordinates: [lng, lat] } };
            }).filter(f => f !== null)
        };
        catastroLayer.addData(pointGeojson).addTo(map);
    } catch (err) { console.error(err); }
}

function openImageModal(src) {
    if (src.includes('placehold.co')) return;
    let modal = document.getElementById('imageModal') || Object.assign(document.createElement('div'), { id: 'imageModal', className: 'image-modal', onclick: function(){this.classList.remove('active')} });
    modal.innerHTML = `<img src="${src}">`;
    if (!document.getElementById('imageModal')) document.body.appendChild(modal);
    modal.classList.add('active');
}
