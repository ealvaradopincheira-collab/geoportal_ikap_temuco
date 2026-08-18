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
            pane: 'catastroBasePane',
            radius: 6,
            fillColor: "#3b82f6",
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillOpacity: 1 // Relleno sólido
        });
    },
    onEachFeature: function (feature, layer) {
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
    pane: 'macrosectoresPane',
    interactive: false, // Permite que el clic traspase a los puntos
    filter: function (feature) {
        if (feature.properties) {
            const name = String(feature.properties.macrosect || '').toUpperCase();
            // Ocultar Macrosector Ñielol y sus variantes de codificación
            if (name.includes('IELOL') || name.includes('ÑIELOL') || name.includes('NIELOL')) {
                return false;
            }
        }
        return true;
    },
    style: function (feature) {
        return {
            color: "#f97316",
            weight: 2,
            opacity: 0.8,
            fillColor: "#f97316",
            fillOpacity: 0.1
        };
    },
    onEachFeature: function (feature, layer) {
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

let baseLayerEsri;
let baseLayerOsm;

function initMap() {
    baseLayerOsm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
    baseLayerEsri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles © Esri' });

    map = L.map('map', {
        center: CONFIG.MAP_CENTER,
        zoom: CONFIG.INITIAL_ZOOM,
        layers: [baseLayerEsri],
        zoomControl: false // Desactivamos el predeterminado
    });

    // Panes personalizados para garantizar orden y visibilidad de capas
    map.createPane('macrosectoresPane');
    map.getPane('macrosectoresPane').style.zIndex = 400;

    map.createPane('catastroBasePane');
    map.getPane('catastroBasePane').style.zIndex = 450;

    map.createPane('terrenoPane');
    map.getPane('terrenoPane').style.zIndex = 500;

    // Lo movemos a la derecha para que no estorbe a la barra lateral
    L.control.zoom({ position: 'topright' }).addTo(map);

    markerLayer.addTo(map);
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');
    const btn = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
    if (btn) btn.classList.add('active');

    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Si la pestaña es la de estadísticas, redimensionar el gráfico
    if (tabId === 'tab-stats' && sectorChart) {
        setTimeout(() => sectorChart.resize(), 100);
    }
}

function setBaseMap(type) {
    document.querySelectorAll('.basemap-btn').forEach(btn => btn.classList.remove('active'));
    if (type === 'esri') {
        if (map.hasLayer(baseLayerOsm)) map.removeLayer(baseLayerOsm);
        if (!map.hasLayer(baseLayerEsri)) map.addLayer(baseLayerEsri);
        const btn = document.getElementById('btnBaseEsri');
        if (btn) btn.classList.add('active');
    } else if (type === 'osm') {
        if (map.hasLayer(baseLayerEsri)) map.removeLayer(baseLayerEsri);
        if (!map.hasLayer(baseLayerOsm)) map.addLayer(baseLayerOsm);
        const btn = document.getElementById('btnBaseOsm');
        if (btn) btn.classList.add('active');
    }
}

function toggleLayer(layerKey, isVisible) {
    if (layerKey === 'terreno') {
        if (isVisible) {
            if (useClustering) {
                if (markerClusterTerreno && !map.hasLayer(markerClusterTerreno)) map.addLayer(markerClusterTerreno);
            } else {
                if (!map.hasLayer(markerLayer)) map.addLayer(markerLayer);
            }
        } else {
            if (markerClusterTerreno && map.hasLayer(markerClusterTerreno)) map.removeLayer(markerClusterTerreno);
            if (map.hasLayer(markerLayer)) map.removeLayer(markerLayer);
        }
    } else if (layerKey === 'base') {
        if (isVisible) {
            if (useClustering) {
                if (markerClusterBase && !map.hasLayer(markerClusterBase)) map.addLayer(markerClusterBase);
            } else {
                if (!map.hasLayer(catastroLayer)) map.addLayer(catastroLayer);
            }
        } else {
            if (markerClusterBase && map.hasLayer(markerClusterBase)) map.removeLayer(markerClusterBase);
            if (map.hasLayer(catastroLayer)) map.removeLayer(catastroLayer);
        }
    } else if (layerKey === 'macro') {
        if (isVisible) {
            if (!map.hasLayer(macrosectoresLayer)) map.addLayer(macrosectoresLayer);
        } else {
            if (map.hasLayer(macrosectoresLayer)) map.removeLayer(macrosectoresLayer);
        }
    }
}

function toggleClustering(enabled) {
    useClustering = (enabled !== undefined) ? enabled : (document.getElementById('clusterToggle') ? document.getElementById('clusterToggle').checked : false);

    const isTerrenoActive = document.getElementById('layerToggleTerreno') ? document.getElementById('layerToggleTerreno').checked : true;
    const isBaseActive = document.getElementById('layerToggleBase') ? document.getElementById('layerToggleBase').checked : true;

    // Remover de ambos modos
    if (map.hasLayer(catastroLayer)) map.removeLayer(catastroLayer);
    if (map.hasLayer(markerLayer)) map.removeLayer(markerLayer);
    if (markerClusterBase && map.hasLayer(markerClusterBase)) map.removeLayer(markerClusterBase);
    if (markerClusterTerreno && map.hasLayer(markerClusterTerreno)) map.removeLayer(markerClusterTerreno);

    // Montar según el modo
    if (useClustering) {
        if (isBaseActive && markerClusterBase) map.addLayer(markerClusterBase);
        if (isTerrenoActive && markerClusterTerreno) map.addLayer(markerClusterTerreno);
    } else {
        if (isBaseActive) map.addLayer(catastroLayer);
        if (isTerrenoActive) map.addLayer(markerLayer);
    }
}

function updateLayerCounts() {
    const elTerreno = document.getElementById('layer-count-terreno');
    if (elTerreno) elTerreno.textContent = `${stats.global.terreno} registros`;

    const elBase = document.getElementById('layer-count-base');
    if (elBase) elBase.textContent = `${stats.global.base.toLocaleString()} registros`;
}

function initStatsControl() {
    const sectorFilter = document.getElementById('sectorFilter');
    if (sectorFilter) {
        sectorFilter.addEventListener('change', (e) => {
            updateDashboard(e.target.value);
        });
    }

    initChart();
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
    console.log("Iniciando solicitud de datos de terreno en vivo...");
    const timestamp = new Date().getTime();
    const sheetUrl = `${CONFIG.SHEET_CSV_URL}&t=${timestamp}`;

    const parseCsvText = (csvText) => {
        if (!csvText || csvText.trim().startsWith('<!DOCTYPE') || csvText.trim().startsWith('<html')) {
            throw new Error('La respuesta recibida no es un CSV válido.');
        }
        Papa.parse(csvText, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: function (results) {
                console.log(`Datos de terreno procesados: ${results.data.length} filas.`);
                processEntries(results.data);
            }
        });
    };

    try {
        const response = await fetch(sheetUrl, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        const csvText = await response.text();
        parseCsvText(csvText);
    } catch (err) {
        console.warn("Fetch directo falló, usando Papa.parse con download:", err);
        Papa.parse(sheetUrl, {
            download: true,
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: function (results) {
                if (results.data && results.data.length > 0) {
                    console.log(`Datos de terreno cargados vía Papa.parse: ${results.data.length} filas.`);
                    processEntries(results.data);
                } else {
                    console.error("Papa.parse no obtuvo registros válidos.");
                }
            },
            error: function (pErr) {
                console.error("FALLO CRÍTICO DE CARGA DE TERRENO:", pErr);
            }
        });
    }
}

// LÓGICA RESTAURADA Y ROBUSTA: Mapeo exacto y auto-corrección de coordenadas
function processEntries(data) {
    markerLayer.clearLayers();
    if (markerClusterTerreno) markerClusterTerreno.clearLayers();

    stats.global.terreno = 0;
    Object.keys(stats.sectores).forEach(k => stats.sectores[k].terreno = 0);

    const utm18S = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
    const wgs84 = "EPSG:4326";

    const parseNum = (val) => {
        if (val === undefined || val === null || String(val).trim() === "") return null;
        const num = parseFloat(String(val).replace(',', '.'));
        return isNaN(num) ? null : num;
    };

    const isUrl = (val) => {
        if (!val || typeof val !== 'string') return false;
        return val.includes('http://') || val.includes('https://') || val.includes('drive.google.com');
    };

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

        // 1. Detección Inteligente de URLs de Fotos en cualquier columna de la fila
        const rowUrls = [];
        keys.forEach(k => {
            const val = row[k];
            if (isUrl(val)) {
                rowUrls.push(String(val).trim());
            }
        });

        let URL_Antes = null;
        let URL_Despues = null;
        let URL_Generica = null;

        if (isUrl(row[colImgBefore])) URL_Antes = transformDriveUrl(row[colImgBefore]);
        if (isUrl(row[colImgAfter])) URL_Despues = transformDriveUrl(row[colImgAfter]);

        if (!URL_Antes && !URL_Despues) {
            if (rowUrls.length >= 2) {
                URL_Antes = transformDriveUrl(rowUrls[0]);
                URL_Despues = transformDriveUrl(rowUrls[1]);
            } else if (rowUrls.length === 1) {
                URL_Generica = transformDriveUrl(rowUrls[0]);
            }
        } else if (!URL_Antes && rowUrls.length === 1) {
            URL_Generica = URL_Despues;
            URL_Despues = null;
        }

        // 2. Detección Inteligente de Coordenadas (UTM o WGS84)
        let finalLat = null;
        let finalLng = null;
        let displayUTM = "No disponible";

        // Recolectar todos los números de la fila
        const allNumbers = [];
        keys.forEach(k => {
            const num = parseNum(row[k]);
            if (num !== null) allNumbers.push(num);
        });

        let detectedUtmE = null;
        let detectedUtmN = null;

        let rawX = parseNum(colLng ? row[colLng] : row[colX]);
        let rawY = parseNum(colLat ? row[colLat] : row[colY]);
        const numImgBefore = parseNum(row[colImgBefore]);
        const numImgAfter = parseNum(row[colImgAfter]);

        // Prioridad 1: Coordenadas en columnas estándar X/Y
        if (rawX && rawY && rawX > 100000 && rawY > 1000000) {
            detectedUtmE = rawX;
            detectedUtmN = rawY;
        }
        // Prioridad 2: Coordenadas UTM desfasadas en columnas de fotos
        else if (numImgBefore && numImgAfter && numImgBefore > 100000 && numImgAfter > 1000000) {
            detectedUtmE = numImgBefore;
            detectedUtmN = numImgAfter;
        }
        // Prioridad 3: Buscar par UTM (Este ~600k-850k, Norte ~5.6M-5.9M) en cualquier columna
        else {
            for (let i = 0; i < allNumbers.length; i++) {
                for (let j = 0; j < allNumbers.length; j++) {
                    if (allNumbers[i] >= 600000 && allNumbers[i] <= 850000 && allNumbers[j] >= 5600000 && allNumbers[j] <= 5900000) {
                        detectedUtmE = allNumbers[i];
                        detectedUtmN = allNumbers[j];
                        break;
                    }
                }
                if (detectedUtmE) break;
            }
        }

        if (detectedUtmE && detectedUtmN && typeof proj4 !== 'undefined') {
            try {
                displayUTM = `${detectedUtmE.toFixed(0)} E, ${detectedUtmN.toFixed(0)} N`;
                const coords = proj4(utm18S, wgs84, [detectedUtmE, detectedUtmN]);
                finalLng = coords[0];
                finalLat = coords[1];
            } catch (e) {}
        }

        // Prioridad 4: Si no hubo UTM, buscar par WGS84 (Lat ~-39 a -37, Lng ~-74 a -71)
        if (finalLat === null || finalLng === null) {
            let detectedLat = null;
            let detectedLng = null;

            if (rawX && rawY && Math.abs(rawX) <= 180 && Math.abs(rawY) <= 180) {
                detectedLat = (rawY < -30 && rawY > -50) ? rawY : rawX;
                detectedLng = (rawX < -60 && rawX > -80) ? rawX : rawY;
            } else {
                for (let i = 0; i < allNumbers.length; i++) {
                    for (let j = 0; j < allNumbers.length; j++) {
                        if (allNumbers[i] >= -40 && allNumbers[i] <= -37 && allNumbers[j] >= -74 && allNumbers[j] <= -71) {
                            detectedLat = allNumbers[i];
                            detectedLng = allNumbers[j];
                            break;
                        }
                    }
                    if (detectedLat) break;
                }
            }

            if (detectedLat && detectedLng) {
                finalLat = detectedLat;
                finalLng = detectedLng;
                if (typeof proj4 !== 'undefined') {
                    try {
                        const utmCoords = proj4(wgs84, utm18S, [finalLng, finalLat]);
                        displayUTM = `${utmCoords[0].toFixed(0)} E, ${utmCoords[1].toFixed(0)} N`;
                    } catch (e) {
                        displayUTM = `${finalLat.toFixed(6)}, ${finalLng.toFixed(6)}`;
                    }
                }
            }
        }

        // Validar que el punto sea válido y esté dentro de la Región / Chile
        if (finalLat !== null && finalLng !== null && !isNaN(finalLat) && !isNaN(finalLng)) {
            if (finalLat < -60 || finalLat > -15 || finalLng < -80 || finalLng > -60) {
                return;
            }

            const colMacro = keys.find(k => k.toLowerCase().includes('macrosect') || k.toLowerCase().includes('sector'));
            const macrozona = colMacro ? (row[colMacro] || 'Sin Sector') : 'Sin Sector';

            if (!stats.sectores[macrozona]) stats.sectores[macrozona] = { terreno: 0, base: 0 };
            stats.sectores[macrozona].terreno++;
            stats.global.terreno++;

            const Nombre = row[colName];
            const Observaciones = row[colObs];

            const Fecha = row[colDate];
            const Modificacion = row[colMod];
            const NumeroID = row[colId];

            const colEmail = keys.find(k => k.toLowerCase().includes('correo') || k.toLowerCase().includes('email'));
            const colWorker = keys.find(k => k.toLowerCase().includes('trabajador') || k.toLowerCase().includes('cuadrilla') || k.toLowerCase().includes('grupo'));

            const Email = colEmail && row[colEmail] ? String(row[colEmail]).trim() : '';
            const Trabajador = colWorker && row[colWorker] ? String(row[colWorker]).trim() : '';

            let grupoEtiqueta = '';
            if (Email) {
                const elow = Email.toLowerCase();
                if (elow === 'ikap.temuco@gmail.com') grupoEtiqueta = 'ADMIN (IKAP)';
                else if (elow === 'ealvaradopincheira@gmail.com') grupoEtiqueta = 'ADMIN (Elías Alvarado)';
                else if (elow.includes('g1') || elow.includes('grupo 1') || elow.includes('mantenciontemucog1')) grupoEtiqueta = 'GRUPO 1';
                else if (elow.includes('g2') || elow.includes('grupo 2') || elow.includes('mantenciontemucog2')) grupoEtiqueta = 'GRUPO 2';
                else if (elow.includes('g3') || elow.includes('grupo 3') || elow.includes('mantenciontemucog3')) grupoEtiqueta = 'GRUPO 3';
                else if (elow.includes('g4') || elow.includes('grupo 4') || elow.includes('mantenciontemucog4')) grupoEtiqueta = 'GRUPO 4';
            }
            if (!grupoEtiqueta && Trabajador) {
                grupoEtiqueta = Trabajador;
            }

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
                        ${grupoEtiqueta ? `<div class="detail-item"><strong><i data-lucide="users"></i> Cuadrilla:</strong><span>${grupoEtiqueta} ${Email ? `<small style="color:var(--text-muted); font-size:0.75rem;">(${Email})</small>` : ''}</span></div>` : ''}
                        ${Modificacion ? `<div class="detail-item"><strong><i data-lucide="activity"></i> Tipo:</strong><span>${Modificacion}</span></div>` : ''}
                        ${Observaciones ? `<div class="detail-item"><strong><i data-lucide="info"></i> Obs:</strong><p>${Observaciones}</p></div>` : ''}
                        <div class="coord-badge"><i data-lucide="map-pin"></i> UTM ${displayUTM}</div>
                    </div>
                </div>
            `;

            const marker = L.circleMarker([finalLat, finalLng], {
                pane: 'terrenoPane',
                radius: 8,
                fillColor: "#f97316",
                color: "#ffffff",
                weight: 2,
                opacity: 1,
                fillOpacity: 0.95
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
    updateLayerCounts();

    const isTerrenoActive = document.getElementById('layerToggleTerreno') ? document.getElementById('layerToggleTerreno').checked : true;
    if (isTerrenoActive) {
        if (!useClustering) {
            if (!map.hasLayer(markerLayer)) map.addLayer(markerLayer);
        } else if (markerClusterTerreno && !map.hasLayer(markerClusterTerreno)) {
            map.addLayer(markerClusterTerreno);
        }
    }

    if (markerLayer.getLayers().length > 0 && !CONFIG.SHEET_CSV_URL.includes('PLACEHOLDER')) {
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
        const isMacroActive = document.getElementById('layerToggleMacro') ? document.getElementById('layerToggleMacro').checked : true;
        if (isMacroActive) {
            macrosectoresLayer.addTo(map);
        }

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
                if (!f.geometry || !f.geometry.coordinates) return null;

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
            const colMacro = keys.find(k => k.toLowerCase().includes('macrosect') || k.toLowerCase().includes('sector'));
            const macrozona = colMacro ? (props[colMacro] || 'Sin Sector') : 'Sin Sector';

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
        updateLayerCounts();

        const isBaseActive = document.getElementById('layerToggleBase') ? document.getElementById('layerToggleBase').checked : true;
        if (isBaseActive) {
            if (!useClustering) {
                if (!map.hasLayer(catastroLayer)) catastroLayer.addTo(map);
            } else if (markerClusterBase && !map.hasLayer(markerClusterBase)) {
                map.addLayer(markerClusterBase);
            }
        }

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
        const sUpper = sector.toUpperCase();
        if (sector !== 'Sin Sector' && sector !== 'undefined' && !sUpper.includes('IELOL') && !sUpper.includes('ÑIELOL') && !sUpper.includes('NIELOL')) {
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
