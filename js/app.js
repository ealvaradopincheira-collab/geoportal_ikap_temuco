/**
 * Geoportal Temuco - Catastro en Tiempo Real
 * Integración Leaflet + Google Sheets + Google Drive
 */

// --- CONFIGURACIÓN ---
const CONFIG = {
    MAP_CENTER: [-38.7359, -72.5904],
    INITIAL_ZOOM: 14,
    SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTM9vKw4CQimv9A7xagyzecSKk9P-_4m7qJ8ykCmP3p9a8CrbMp1Rls_pEoxXFV0gXOpI9AOlMSpygA/pub?output=csv', 
    REFRESH_INTERVAL: 0 
    // Intentar detectar si estamos en GitHub o Local
    IS_GITHUB: window.location.hostname.includes('github.io'),
    IS_LOCAL: window.location.protocol === 'file:'
};

// --- VARIABLE GLOBAL DEL MAPA ---
let map;
let markerLayer = L.layerGroup();

// --- SISTEMA DE AVISOS ---
function showNotification(msg, type = 'info') {
    const banner = document.createElement('div');
    banner.className = `notification-banner ${type}`;
    banner.innerHTML = `<i data-lucide="${type === 'error' ? 'alert-circle' : 'info'}"></i> <span>${msg}</span>`;
    document.body.appendChild(banner);
    lucide.createIcons();
    setTimeout(() => banner.classList.add('active'), 100);
    setTimeout(() => {
        banner.classList.remove('active');
        setTimeout(() => banner.remove(), 500);
    }, 5000);
}

// --- CAPA CATASTRO (BLUE HALOS) ---
let catastroLayer = L.geoJSON(null, {
    pointToLayer: function (feature, latlng) {
        // Efecto de halo azul translúcido con núcleo sólido
        const icon = L.divIcon({
            className: 'custom-div-icon',
            html: '<div class="catastro-marker-halo"><div class="catastro-marker-core"></div></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
        return L.marker(latlng, { icon: icon });
    },
    style: function(feature) {
        // Para polígonos (si los hay)
        return {
            color: "#3b82f6",
            weight: 2,
            opacity: 0.6,
            fillColor: "#3b82f6",
            fillOpacity: 0.1
        };
    },
    onEachFeature: function(feature, layer) {
        if (feature.properties) {
            const props = feature.properties;
            const NumeroID = props.id || props['codigo de'];
            const Nombre = props.tipo || props.señaletic;
            const Fecha = props.fecha;
            const Estado = props.estado;
            const Observaciones = props.observacia;

            const popupContent = `
                <div class="popup-container catastro-popup">
                    <div class="popup-header">
                        <span class="status-tag">Existente</span>
                        <div class="id-sub">ID: ${NumeroID || 'S/N'}</div>
                        <h4>${Nombre || 'Señalética Base'}</h4>
                    </div>
                    <div class="popup-details">
                        <div class="detail-item">
                            <i data-lucide="calendar"></i>
                            <div class="detail-content">
                                <span class="detail-label">Fecha</span>
                                <span class="detail-value">${Fecha || 'No registrada'}</span>
                            </div>
                        </div>
                        <div class="detail-item">
                            <i data-lucide="activity"></i>
                            <div class="detail-content">
                                <span class="detail-label">Estado</span>
                                <span class="detail-value">${Estado || 'N/A'}</span>
                            </div>
                        </div>
                        <div class="detail-item">
                            <i data-lucide="info"></i>
                            <div class="detail-content">
                                <span class="detail-label">Observaciones</span>
                                <span class="detail-value">${Observaciones || '-'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            layer.bindPopup(popupContent, { maxWidth: 300, className: 'custom-popup' });
            layer.on('popupopen', () => lucide.createIcons());
        }
    }
});

// --- CAPA MACROSECTORES ---
let macrosectoresLayer = L.geoJSON(null, {
    style: function(feature) {
        return {
            color: "#f97316",
            weight: 1.5,
            opacity: 0.4,
            fillColor: "#f97316",
            fillOpacity: 0.05,
            dashArray: '5, 5'
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
    initMap();
    initSidebar();
    loadTerritorialData();
    loadMacrosectores();
    loadCatastro();

    if (CONFIG.IS_LOCAL) {
        showNotification("Modo Local detectado: El catastro y macrosectores podrían no cargar por restricciones del navegador. Usa un servidor local o GitHub Pages.", "error");
    }
});

function initMap() {
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    });

    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
    });

    map = L.map('map', {
        center: CONFIG.MAP_CENTER,
        zoom: CONFIG.INITIAL_ZOOM,
        layers: [esriWorldImagery],
        zoomControl: false // Lo añadiremos manualmente a la derecha
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    const baseMaps = {
        "Satelital": esriWorldImagery,
        "Calles": osm
    };

    const overlayMaps = {
        "Macrosectores": macrosectoresLayer,
        "Catastro Base": catastroLayer,
        "Levantamiento Terreno": markerLayer
    };

    L.control.layers(baseMaps, overlayMaps, { collapsed: false, position: 'topright' }).addTo(map);
    
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
        setTimeout(() => map.invalidateSize(), 400);
    });
}

async function loadTerritorialData() {
    const timestamp = new Date().getTime();
    const sheetUrl = `${CONFIG.SHEET_CSV_URL}&t=${timestamp}`;
    let finalUrl = sheetUrl;
    if (window.location.protocol === 'file:') {
        finalUrl = `https://corsproxy.io/?${encodeURIComponent(sheetUrl)}`;
    }

    try {
        const response = await fetch(finalUrl);
        if (!response.ok) throw new Error("Network response was not ok");
        const csvText = await response.text();

        Papa.parse(csvText, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => processEntries(results.data)
        });
    } catch (err) {
        console.error("Fallo de carga:", err);
        showDemoData();
    }
}

function processEntries(data) {
    markerLayer.clearLayers();
    const utm18S = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
    const wgs84 = "WGS84";

    data.forEach((row) => {
        const keys = Object.keys(row);
        const colLat = keys.find(k => k.toLowerCase().includes('latitud'));
        const colLng = keys.find(k => k.toLowerCase().includes('longitud'));
        const colX = keys.find(k => k.toLowerCase().includes('este'));
        const colY = keys.find(k => k.toLowerCase().includes('norte'));
        
        const colName = keys.find(k => k.toLowerCase().includes('nombre') || k.toLowerCase().includes('propietario'));
        const colObs = keys.find(k => k.toLowerCase().includes('observaci') || k.toLowerCase().includes('comentario'));
        
        const colImgBefore = keys.find(k => k.toLowerCase().includes('fotograf') && k.toLowerCase().includes('antes'));
        const colImgAfter = keys.find(k => k.toLowerCase().includes('fotograf') && k.toLowerCase().includes('despues'));
        const colImgGeneric = keys.find(k => k.toLowerCase().includes('foto') || k.toLowerCase().includes('imagen'));

        const colDate = keys.find(k => k.toLowerCase().includes('fecha') || k.toLowerCase().includes('marca temporal'));
        const colMod = keys.find(k => k.toLowerCase().includes('modificaci') || k.toLowerCase().includes('tipo'));
        const colId = keys.find(k => k.toLowerCase().includes('número') || k.toLowerCase().includes('código'));

        let valLatRaw = (row[colLat] && String(row[colLat]).trim() !== "") ? row[colLat] : row[colY];
        let valLngRaw = (row[colLng] && String(row[colLng]).trim() !== "") ? row[colLng] : row[colX];
        
        if (!valLatRaw || !valLngRaw) return;

        let valLat = parseFloat(String(valLatRaw).replace(',', '.'));
        let valLng = parseFloat(String(valLngRaw).replace(',', '.'));

        let finalLat, finalLng, displayUTM = "";

        if (Math.abs(valLat) > 1000) {
            displayUTM = `${valLng.toFixed(0)} E, ${valLat.toFixed(0)} N`;
            const coords = proj4(utm18S, wgs84, [valLng, valLat]);
            finalLng = coords[0]; finalLat = coords[1];
        } else {
            finalLat = valLat; finalLng = valLng;
            try {
                const utmCoords = proj4(wgs84, utm18S, [valLng, valLat]);
                displayUTM = `${utmCoords[0].toFixed(0)} E, ${utmCoords[1].toFixed(0)} N`;
            } catch (e) { displayUTM = `${valLat.toFixed(6)}, ${valLng.toFixed(6)}`; }
        }

        if (!isNaN(finalLat) && !isNaN(finalLng)) {
            const URL_Antes = transformDriveUrl(row[colImgBefore]);
            const URL_Despues = transformDriveUrl(row[colImgAfter]);
            const URL_Generica = transformDriveUrl(row[colImgGeneric]);

            let imagesHTML = '';
            if (URL_Antes || URL_Despues) {
                imagesHTML = `
                    <div class="popup-images-grid">
                        ${URL_Antes ? `<div class="img-wrapper"><span class="img-label">Antes</span><img src="${URL_Antes}" class="popup-image" onclick="openImageModal(this.src)"></div>` : ''}
                        ${URL_Despues ? `<div class="img-wrapper"><span class="img-label">Después</span><img src="${URL_Despues}" class="popup-image" onclick="openImageModal(this.src)"></div>` : ''}
                    </div>
                `;
            } else if (URL_Generica) {
                imagesHTML = `<div class="img-wrapper" style="height: 200px;"><img src="${URL_Generica}" class="popup-image" onclick="openImageModal(this.src)"></div>`;
            }

            const popupContent = `
                <div class="popup-container">
                    <div class="popup-header">
                        <span class="status-tag">Nuevo Registro</span>
                        <div class="id-sub">ID: ${row[colId] || 'S/N'}</div>
                        <h4>${row[colName] || 'Señalética'}</h4>
                    </div>
                    ${imagesHTML}
                    <div class="popup-details">
                        <div class="detail-item">
                            <i data-lucide="calendar"></i>
                            <div class="detail-content">
                                <span class="detail-label">Fecha</span>
                                <span class="detail-value">${row[colDate] || 'No registrada'}</span>
                            </div>
                        </div>
                        <div class="detail-item">
                            <i data-lucide="wrench"></i>
                            <div class="detail-content">
                                <span class="detail-label">Modificación</span>
                                <span class="detail-value">${row[colMod] || 'N/A'}</span>
                            </div>
                        </div>
                        <div class="detail-item">
                            <i data-lucide="info"></i>
                            <div class="detail-content">
                                <span class="detail-label">Observaciones</span>
                                <span class="detail-value">${row[colObs] || '-'}</span>
                            </div>
                        </div>
                        <div class="coord-badge">
                            <i data-lucide="map-pin" style="width: 12px; height: 12px;"></i> UTM ${displayUTM}
                        </div>
                    </div>
                </div>
            `;

            // Puntos de Terreno (Naranja): Vibrantes, más pequeños, sombra sutil
            const marker = L.circleMarker([finalLat, finalLng], {
                radius: 6,
                fillColor: "#f97316",
                color: "#ffffff",
                weight: 1.5,
                opacity: 1,
                fillOpacity: 1,
                className: 'terreno-marker'
            }).bindPopup(popupContent, { maxWidth: 300, className: 'custom-popup' });

            marker.on('popupopen', () => lucide.createIcons());
            markerLayer.addLayer(marker);
        }
    });

    if (data.length > 0 && !CONFIG.SHEET_CSV_URL.includes('PLACEHOLDER')) {
        const group = new L.featureGroup(markerLayer.getLayers());
        if (group.getLayers().length > 0) map.fitBounds(group.getBounds().pad(0.2));
    }
}

async function loadMacrosectores() {
    try {
        const shpBuffer = await fetch('Macrosectores/MACROSECTORES.shp').then(r => r.arrayBuffer());
        const dbfBuffer = await fetch('Macrosectores/MACROSECTORES.dbf').then(r => r.arrayBuffer());
        const geojson = shp.combine([shp.parseShp(shpBuffer), shp.parseDbf(dbfBuffer)]);
        macrosectoresLayer.addData(geojson).addTo(map);
    } catch (err) { console.error("Error Macrosectores:", err); }
}

async function loadCatastro() {
    try {
        const response = await fetch('Macrosectores/CATASTRO.geojson');
        const geojson = await response.json();
        catastroLayer.addData(geojson).addTo(map);
    } catch (err) { console.error("Error Catastro:", err); }
}

function transformDriveUrl(url) {
    if (!url) return '';
    const match = url.match(/(?:id=|[?\/]|preview\/|d\/)([\w-]{25,})/);
    return match ? `https://lh3.googleusercontent.com/d/${match[1]}` : url;
}

function openImageModal(src) {
    let modal = document.getElementById('imageModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'imageModal';
        modal.className = 'image-modal';
        modal.innerHTML = `<img src="" id="imageModalImg">`;
        modal.onclick = () => modal.classList.remove('active');
        document.body.appendChild(modal);
    }
    document.getElementById('imageModalImg').src = src;
    modal.classList.add('active');
}

function showDemoData() {
    const demoData = [{ Latitud: -38.7359, Longitud: -72.5904, Nombre_Propietario: "Demo", Observaciones: "Sistema activo" }];
    processEntries(demoData);
}
