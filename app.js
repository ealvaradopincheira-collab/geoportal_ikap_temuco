/**
 * Geoportal Temuco - Catastro en Tiempo Real
 * Versión Definitiva: Integración de Mejoras + Conexión Terreno Restaurada
 */

// --- CONFIGURACIÓN ---
const CONFIG = {
    MAP_CENTER: [-38.7359, -72.5904],
    INITIAL_ZOOM: 14,
    SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTM9vKw4CQimv9A7xagyzecSKk9P-_4m7qJ8ykCmP3p9a8CrbMp1Rls_pEoxXFV0gXOpI9AOlMSpygA/pub?output=csv', 
    REFRESH_INTERVAL: 0 
};

// --- VARIABLE GLOBAL DEL MAPA ---
let map;
let markerLayer = L.layerGroup();

// --- ESTADÍSTICAS Y CONTROL ---
const stats = {
    global: { meta: 15000, terreno: 0, base: 0 },
    sectores: {}
};

let sectorChart = null;
let useClustering = false;
let markerClusterTerreno = null;
let markerClusterBase = null;
let layerControl = null;
let baseMaps = {};
let overlayMaps = {};

// 1. CAPA CATASTRO BASE (AZUL SÓLIDO CON BORDE BLANCO)
let catastroLayer = L.geoJSON(null, {
    pointToLayer: function (feature, latlng) {
        return L.circleMarker(latlng, {
            radius: 6,
            fillColor: "#3b82f6",
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillOpacity: 1 // Relleno sólido
        });
    },
    onEachFeature: function(feature, layer) {
        if (feature.properties && feature.geometry && feature.geometry.coordinates) {
            const props = feature.properties;
            let coords = feature.geometry.coordinates;
            let lng = coords[0], lat = coords[1];

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
            const imgURL = keyImg ? props[keyImg] : null;

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

// 2. CAPA MACROSECTORES (POLÍGONOS FANTASMAS PARA PERMITIR CLIC)
let macrosectoresLayer = L.geoJSON(null, {
    interactive: false, // Permite que el clic traspase a los puntos
    style: function(feature) {
        return {
            color: "#f97316",
            weight: 2,
            opacity: 0.8,
            fillColor: "#f97316",
            fillOpacity: 0.1
        };
    },
    onEachFeature: function(feature, layer) {
        if (feature.properties && feature.properties.macrosect) {
            layer.bindTooltip(feature.properties.macrosect, {
                permanent: true,
                direction: 'center',
                className: 'macrosect-label'
            });
        }
    }
});

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    if (typeof L.markerClusterGroup !== 'undefined') {
        markerClusterTerreno = L.markerClusterGroup({ disableClusteringAtZoom: 18 });
        markerClusterBase = L.markerClusterGroup({ disableClusteringAtZoom: 18 });
    }
    
    initMap();
    initSidebar();
    initStatsControl();
    loadTerritorialData();
    loadMacrosectores();
    loadCatastro();
});

function initMap() {
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles © Esri' });

    map = L.map('map', {
        center: CONFIG.MAP_CENTER,
        zoom: CONFIG.INITIAL_ZOOM,
        layers: [esriWorldImagery]
    });

    baseMaps = {
        "Terreno (Esri)": esriWorldImagery,
        "Calles (OSM)": osm
    };

    updateLayerControl();
    markerLayer.addTo(map);
}

function updateLayerControl() {
    if (layerControl) map.removeControl(layerControl);
    
    overlayMaps = {
        "Macrosectores": macrosectoresLayer,
        "Catastro Base": useClustering ? markerClusterBase : catastroLayer,
        "Catastro en Terreno": useClustering ? markerClusterTerreno : markerLayer
    };

    layerControl = L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);
}

function initStatsControl() {
    const toggle = document.getElementById('clusterToggle');
    if (toggle) {
        toggle.addEventListener('change', (e) => {
            useClustering = e.target.checked;
            toggleClustering();
        });
    }
    
    const sectorFilter = document.getElementById('sectorFilter');
    if (sectorFilter) {
        sectorFilter.addEventListener('change', (e) => {
            updateDashboard(e.target.value);
        });
    }
    
    initChart();
}

function toggleClustering() {
    const baseVisible = map.hasLayer(catastroLayer) || (markerClusterBase && map.hasLayer(markerClusterBase));
    const terrenoVisible = map.hasLayer(markerLayer) || (markerClusterTerreno && map.hasLayer(markerClusterTerreno));
    
    map.removeLayer(catastroLayer);
    map.removeLayer(markerLayer);
    if (markerClusterBase) map.removeLayer(markerClusterBase);
    if (markerClusterTerreno) map.removeLayer(markerClusterTerreno);
    
    if (useClustering) {
        if (baseVisible && markerClusterBase) map.addLayer(markerClusterBase);
        if (terrenoVisible && markerClusterTerreno) map.addLayer(markerClusterTerreno);
    } else {
        if (baseVisible) map.addLayer(catastroLayer);
        if (terrenoVisible) map.addLayer(markerLayer);
    }
    
    updateLayerControl();
}

function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    const toggleIcon = document.getElementById('toggleIcon');

    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        if (sidebar.classList.contains('collapsed')) {
            toggleIcon.setAttribute('data-lucide', 'chevron-right');
        } else {
            toggleIcon.setAttribute('data-lucide', 'chevron-left');
        }
        lucide.createIcons();
        setTimeout(() => map.invalidateSize(), 300);
    });
}

async function loadTerritorialData() {
    console.log("Iniciando solicitud de datos de terreno...");
    const timestamp = new Date().getTime();
    const sheetUrl = `${CONFIG.SHEET_CSV_URL}&t=${timestamp}`;
    
    let finalUrl = sheetUrl;
    if (window.location.protocol === 'file:') {
        finalUrl = `https://corsproxy.io/?${encodeURIComponent(sheetUrl)}`;
    }

    try {
        let response = await fetch(finalUrl);
        if (!response.ok && window.location.protocol !== 'file:') {
            finalUrl = `https://corsproxy.io/?${encodeURIComponent(sheetUrl)}`;
            response = await fetch(finalUrl);
        }

        if (!response.ok) throw new Error(`El servidor respondió con código ${response.status}`);
        
        const csvText = await response.text();
        Papa.parse(csvText, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: function(results) {
                processEntries(results.data);
            }
        });

    } catch (err) {
        console.error("FALLO CRÍTICO DE CARGA:", err);
        showDemoData();
    }
}

// LÓGICA RESTAURADA: Mapeo exacto de las columnas de terreno
function processEntries(data) {
    markerLayer.clearLayers();
    if (markerClusterTerreno) markerClusterTerreno.clearLayers();

    stats.global.terreno = 0;
    Object.keys(stats.sectores).forEach(k => stats.sectores[k].terreno = 0);

    const utm18S = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
    const wgs84 = "EPSG:4326";

    data.forEach((row) => {
        const keys = Object.keys(row);
        const colLat = keys.find(k => k.toLowerCase().includes('latitud'));
        const colLng = keys.find(k => k.toLowerCase().includes('longitud'));
        const colX = keys.find(k => k.toLowerCase().includes('este'));
        const colY = keys.find(k => k.toLowerCase().includes('norte'));
        
        const colName = keys.find(k => k.toLowerCase().includes('señalética') || k.toLowerCase().includes('señaletica') || k.toLowerCase().includes('tipo') || k.toLowerCase().includes('nombre') || k.toLowerCase().includes('propietario'));
        const colObs = keys.find(k => k.toLowerCase().includes('observaci') || k.toLowerCase().includes('comentario'));
        
        const colImgBefore = keys.find(k => k.toLowerCase().includes('fotograf') && k.toLowerCase().includes('antes'));
        const colImgAfter = keys.find(k => k.toLowerCase().includes('fotograf') && k.toLowerCase().includes('despues'));
        const colImgGeneric = keys.find(k => k.toLowerCase().includes('foto') || k.toLowerCase().includes('imagen') || k.toLowerCase().includes('fotograf'));

        const colDate = keys.find(k => k.toLowerCase().includes('fecha') || k.toLowerCase().includes('marca temporal') || k.toLowerCase().includes('timestamp'));
        const colMod = keys.find(k => k.toLowerCase().includes('modificaci') || k.toLowerCase().includes('tipo') || k.toLowerCase().includes('trabajo'));
        const colId = keys.find(k => k.toLowerCase().includes('número') || k.toLowerCase().includes('nº') || k.toLowerCase().includes('numero') || k.toLowerCase().includes('señaletica') || k.toLowerCase().includes('código'));

        let valLatRaw = (row[colLat] && String(row[colLat]).trim() !== "") ? row[colLat] : row[colY];
        let valLngRaw = (row[colLng] && String(row[colLng]).trim() !== "") ? row[colLng] : row[colX];
        
        if (valLatRaw === undefined || valLatRaw === null || valLatRaw === "" || 
            valLngRaw === undefined || valLngRaw === null || valLngRaw === "") return;

        let valLat = parseFloat(String(valLatRaw).replace(',', '.'));
        let valLng = parseFloat(String(valLngRaw).replace(',', '.'));

        const Nombre = row[colName];
        const Observaciones = row[colObs];
        const URL_Antes = transformDriveUrl(row[colImgBefore]);
        const URL_Despues = transformDriveUrl(row[colImgAfter]);
        const URL_Generica = transformDriveUrl(row[colImgGeneric]);
        
        const Fecha = row[colDate];
        const Modificacion = row[colMod];
        const NumeroID = row[colId];

        let finalLat, finalLng, displayUTM = "";

        if (Math.abs(valLat) > 1000 || Math.abs(valLng) > 1000) {
            if (typeof proj4 === 'undefined') return;
            displayUTM = `${valLng.toFixed(0)} E, ${valLat.toFixed(0)} N`;
            try {
                const coords = proj4(utm18S, wgs84, [valLng, valLat]);
                finalLng = coords[0];
                finalLat = coords[1];
            } catch (e) {
                return;
            }
        } else {
            finalLat = valLat;
            finalLng = valLng;
            if (typeof proj4 !== 'undefined') {
                try {
                    const utmCoords = proj4(wgs84, utm18S, [valLng, valLat]);
                    displayUTM = `${utmCoords[0].toFixed(0)} E, ${utmCoords[1].toFixed(0)} N`;
                } catch (e) {
                    displayUTM = `${valLat.toFixed(6)}, ${valLng.toFixed(6)}`;
                }
            } else {
                displayUTM = `${valLat.toFixed(6)}, ${valLng.toFixed(6)}`;
            }
        }

        if (!isNaN(finalLat) && !isNaN(finalLng)) {
            const keyMacrozona = keys.find(k => k.toLowerCase().includes('macro') || k.toLowerCase().includes('sector'));
            const macrozona = keyMacrozona ? (row[keyMacrozona] || 'Sin Sector') : 'Sin Sector';
            
            if (!stats.sectores[macrozona]) stats.sectores[macrozona] = { terreno: 0, base: 0 };
            stats.sectores[macrozona].terreno++;
            stats.global.terreno++;

            let imagesHTML = '';
            if (URL_Antes || URL_Despues) {
                imagesHTML = `
                    <div class="popup-images-grid">
                        ${URL_Antes ? `
                        <div class="img-wrapper">
                            <span class="img-label">Antes</span>
                            <img src="${URL_Antes}" class="popup-image" alt="Antes" onerror="this.src='https://placehold.co/400x250/222/f97316?text=Sin+Foto'" onclick="openImageModal(this.src)">
                        </div>` : ''}
                        ${URL_Despues ? `
                        <div class="img-wrapper">
                            <span class="img-label">Después</span>
                            <img src="${URL_Despues}" class="popup-image" alt="Después" onerror="this.src='https://placehold.co/400x250/222/22c55e?text=Sin+Foto'" onclick="openImageModal(this.src)">
                        </div>` : ''}
                    </div>
                `;
            } else if (URL_Generica) {
                imagesHTML = `
                    <div class="popup-images-grid" style="grid-template-columns: 1fr;">
                        <div class="img-wrapper">
                            <span class="img-label">Registro Fotográfico</span>
                            <img src="${URL_Generica}" class="popup-image" alt="Foto" onerror="this.src='https://placehold.co/400x250/222/f97316?text=Sin+Foto'" onclick="openImageModal(this.src)">
                        </div>
                    </div>
                `;
            }

            const popupContent = `
                <div class="popup-container">
                    <div class="popup-header">
                        <span class="id-badge">Nº ${NumeroID || 'S/N'}</span>
                        <h4>${Nombre || 'Punto de Terreno'}</h4>
                    </div>
                    ${imagesHTML}
                    <div class="popup-details">
                        ${Fecha ? `<div class="detail-item"><strong><i data-lucide="calendar"></i> Fecha:</strong><span>${Fecha}</span></div>` : ''}
                        ${Modificacion ? `<div class="detail-item"><strong><i data-lucide="activity"></i> Tipo:</strong><span>${Modificacion}</span></div>` : ''}
                        ${Observaciones ? `<div class="detail-item"><strong><i data-lucide="info"></i> Obs:</strong><p>${Observaciones}</p></div>` : ''}
                        <div class="coord-badge"><i data-lucide="map-pin"></i> UTM ${displayUTM}</div>
                    </div>
                </div>
            `;

            const marker = L.circleMarker([finalLat, finalLng], {
                radius: 8,
                fillColor: "#f97316",
                color: "#ffffff",
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9
            }).bindPopup(popupContent, {
                maxWidth: 300,
                className: 'custom-popup'
            });

            marker.on('popupopen', () => {
                lucide.createIcons();
            });

            markerLayer.addLayer(marker);
        }
    });

    if (markerClusterTerreno) markerClusterTerreno.addLayers(markerLayer.getLayers());

    populateSectorDropdown();
    updateDashboard('ALL');

    if (data.length > 0 && !CONFIG.SHEET_CSV_URL.includes('PLACEHOLDER')) {
        const group = new L.featureGroup(markerLayer.getLayers());
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

// FIX: Interpolación correcta para imágenes de Google Drive
function transformDriveUrl(url) {
    if (!url) return '';
    const match = url.match(/(?:id=|[?\/]|preview\/|d\/)([\w-]{25,})/);
    
    // Solución definitiva usando el endpoint de thumbnail para evitar el bloqueo CORS de Google
    return match ? `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000` : url;
}

function showDemoData() {
    const demoData = [
        {
            Latitud: -38.7359,
            Longitud: -72.5904,
            Nombre_Propietario: "Predio Central Temuco",
            Observaciones: "Inspección de rutina realizada. Todo en orden.",
            URL_Imagen_Drive: "https://drive.google.com/open?id=1WvX8BfS_E0y_u1uX6_k-HkXpC-m8u-Ym"
        }
    ];
    processEntries(demoData);
}

async function loadMacrosectores() {
    try {
        const shpBuffer = await fetch('Macrosectores/MACROSECTORES.shp').then(r => r.arrayBuffer());
        const dbfBuffer = await fetch('Macrosectores/MACROSECTORES.dbf').then(r => r.arrayBuffer());
        const geojson = shp.combine([shp.parseShp(shpBuffer), shp.parseDbf(dbfBuffer)]);
        
        const firstFeature = geojson.features[0];
        if (firstFeature && firstFeature.geometry) {
            let coords = firstFeature.geometry.coordinates[0];
            if (Array.isArray(coords[0])) coords = coords[0]; 
            
            if (Math.abs(coords[0]) > 180) {
                const utm18S = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
                const wgs84 = "EPSG:4326";
                
                geojson.features.forEach(feature => {
                    projectGeometry(feature.geometry, utm18S, wgs84);
                });
            }
        }
        macrosectoresLayer.addData(geojson);
        macrosectoresLayer.addTo(map);

    } catch (err) { console.error("Error al cargar Macrosectores:", err); }
}

function projectGeometry(geometry, from, to) {
    if (geometry.type === 'Point') {
        const coords = proj4(from, to, geometry.coordinates);
        geometry.coordinates = [coords[0], coords[1]];
    } else if (geometry.type === 'LineString' || geometry.type === 'MultiPoint') {
        geometry.coordinates = geometry.coordinates.map(c => {
            const coords = proj4(from, to, c);
            return [coords[0], coords[1]];
        });
    } else if (geometry.type === 'Polygon' || geometry.type === 'MultiLineString') {
        geometry.coordinates = geometry.coordinates.map(ring => {
            return ring.map(c => {
                const coords = proj4(from, to, c);
                return [coords[0], coords[1]];
            });
        });
    } else if (geometry.type === 'MultiPolygon') {
        geometry.coordinates = geometry.coordinates.map(poly => {
            return poly.map(ring => {
                return ring.map(c => {
                    const coords = proj4(from, to, c);
                    return [coords[0], coords[1]];
                });
            });
        });
    }
}

// FIX: Convertir geometrías a puntos y proyectar de UTM a WGS84
async function loadCatastro() {
    console.log("Cargando Catastro Pre-existente (GeoJSON)...");
    try {
        const response = await fetch('Macrosectores/CATASTRO.geojson');
        if (!response.ok) throw new Error("No se pudo cargar el archivo .geojson");
        const rawGeojson = await response.json();
        
        const utm18S = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
        const wgs84 = "EPSG:4326";
        
        const pointGeojson = {
            type: "FeatureCollection",
            features: rawGeojson.features.map(f => {
                if(!f.geometry || !f.geometry.coordinates) return null;
                
                const geomType = f.geometry.type;
                let coords = f.geometry.coordinates;
                let lng = 0, lat = 0;
                
                if (geomType === 'Point') { lng = coords[0]; lat = coords[1]; } 
                else if (geomType === 'LineString' || geomType === 'MultiPoint') { lng = coords[0][0]; lat = coords[0][1]; } 
                else if (geomType === 'Polygon' || geomType === 'MultiLineString') { lng = coords[0][0][0]; lat = coords[0][0][1]; } 
                else if (geomType === 'MultiPolygon') { lng = coords[0][0][0][0]; lat = coords[0][0][0][1]; }

                if (Math.abs(lng) > 180 && typeof proj4 !== 'undefined') {
                    const converted = proj4(utm18S, wgs84, [lng, lat]);
                    lng = converted[0]; lat = converted[1];
                }

                return {
                    type: "Feature",
                    properties: f.properties,
                    geometry: { type: "Point", coordinates: [lng, lat] }
                };
            }).filter(f => f !== null)
        };

        pointGeojson.features.forEach(f => {
            const props = f.properties;
            const keys = Object.keys(props);
            const keyMacrozona = keys.find(k => k.toLowerCase().includes('macro') || k.toLowerCase().includes('sector'));
            const macrozona = keyMacrozona ? (props[keyMacrozona] || 'Sin Sector') : 'Sin Sector';
            
            if (!stats.sectores[macrozona]) stats.sectores[macrozona] = { terreno: 0, base: 0 };
            stats.sectores[macrozona].base++;
            stats.global.base++;
        });

        catastroLayer.addData(pointGeojson);
        if (markerClusterBase) {
            markerClusterBase.clearLayers();
            markerClusterBase.addLayers(catastroLayer.getLayers());
        }
        
        populateSectorDropdown();
        updateDashboard('ALL');

        catastroLayer.addTo(map);

    } catch (err) {
        console.error("Error al cargar Catastro Pre-existente:", err);
    }
}

function openImageModal(src) {
    if (src.includes('placehold.co')) return; 
    let modal = document.getElementById('imageModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'imageModal';
        modal.className = 'image-modal';
        modal.innerHTML = `<img src="" id="imageModalImg" alt="Zoomed Image">`;
        modal.onclick = () => modal.classList.remove('active');
        document.body.appendChild(modal);
    }
    document.getElementById('imageModalImg').src = src;
    modal.classList.add('active');
}

// --- FUNCIONES DE DASHBOARD Y ESTADÍSTICAS ---
function populateSectorDropdown() {
    const select = document.getElementById('sectorFilter');
    if (!select) return;
    
    const currentVal = select.value;
    select.innerHTML = '<option value="ALL">Todos los Sectores</option>';
    
    Object.keys(stats.sectores).sort().forEach(sector => {
        if (sector !== 'Sin Sector' && sector !== 'undefined') {
            const option = document.createElement('option');
            option.value = sector;
            option.textContent = sector;
            select.appendChild(option);
        }
    });
    
    if (stats.sectores[currentVal]) select.value = currentVal;
}

function updateDashboard(sector = 'ALL') {
    const globalEl = document.getElementById('kpi-global-terreno');
    const globalProgress = document.getElementById('kpi-global-progress');
    if (globalEl) globalEl.textContent = stats.global.terreno.toLocaleString();
    if (globalProgress) {
        const pct = Math.min(100, (stats.global.terreno / stats.global.meta) * 100);
        globalProgress.style.width = `${pct}%`;
    }
    
    const baseEl = document.getElementById('kpi-sector-base');
    const terrenoEl = document.getElementById('kpi-sector-terreno');
    
    let baseCount = 0;
    let terrenoCount = 0;
    
    if (sector === 'ALL') {
        baseCount = stats.global.base;
        terrenoCount = stats.global.terreno;
    } else if (stats.sectores[sector]) {
        baseCount = stats.sectores[sector].base;
        terrenoCount = stats.sectores[sector].terreno;
    }
    
    if (baseEl) baseEl.textContent = baseCount.toLocaleString();
    if (terrenoEl) terrenoEl.textContent = terrenoCount.toLocaleString();
    
    updateChart(sector, baseCount, terrenoCount);
}

function initChart() {
    const ctx = document.getElementById('sectorChart');
    if (!ctx) return;
    
    sectorChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Línea Base', 'Levantamiento'],
            datasets: [{
                label: 'Señales',
                data: [0, 0],
                backgroundColor: ['#3b82f6', '#f97316'],
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function updateChart(sector, base, terreno) {
    if (!sectorChart) return;
    sectorChart.data.datasets[0].data = [base, terreno];
    sectorChart.update();
}
