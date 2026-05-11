/**
 * Geoportal Temuco - Catastro en Tiempo Real
 * Actualización: 11-05-2026 (Fix Geometría, Radio y CORS Drive)
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
let catastroLayer = L.geoJSON(null, {
    style: function(feature) {
        return {
            color: "#3b82f6", 
            weight: 3,
            opacity: 0.8,
            fillColor: "#3b82f6",
            fillOpacity: 0.2
        };
    },
    pointToLayer: function (feature, latlng) {
        return L.circleMarker(latlng, {
            radius: 3, // CORRECCIÓN: Tamaño reducido a 3
            fillColor: "#3b82f6",
            color: "#ffffff",
            weight: 1, // CORRECCIÓN: Borde más fino
            opacity: 1,
            fillOpacity: 0.9
        });
    },
    onEachFeature: function(feature, layer) {
        if (feature.properties && feature.geometry && feature.geometry.coordinates) {
            const props = feature.properties;
            const geomType = feature.geometry.type;
            let coords = feature.geometry.coordinates;
            
            let lng, lat;
            if (geomType === 'Point') {
                lng = coords[0]; lat = coords[1];
            } else if (geomType === 'LineString' || geomType === 'MultiPoint') {
                lng = coords[0][0]; lat = coords[0][1];
            } else if (geomType === 'Polygon' || geomType === 'MultiLineString') {
                lng = coords[0][0][0]; lat = coords[0][0][1];
            } else if (geomType === 'MultiPolygon') {
                lng = coords[0][0][0][0]; lat = coords[0][0][0][1];
            }

            const utm18S = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
            const wgs84 = "EPSG:4326"; 
            let displayUTM = "No disponible";

            if (lng !== undefined && lat !== undefined && typeof proj4 !== 'undefined') {
                try {
                    const utmCoords = proj4(wgs84, utm18S, [lng, lat]);
                    displayUTM = `${utmCoords[0].toFixed(0)} E, ${utmCoords[1].toFixed(0)} N`;
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
                        <div class="detail-item">
                            <strong><i data-lucide="calendar"></i> Fecha:</strong>
                            <span>${Fecha}</span>
                        </div>
                        <div class="detail-item">
                            <strong><i data-lucide="activity"></i> Estado:</strong>
                            <span>${Estado}</span>
                        </div>
                        <div class="detail-item">
                            <strong><i data-lucide="map-pin"></i> Dirección:</strong>
                            <span>${Direccion}</span>
                        </div>
                        <div class="detail-item">
                            <strong><i data-lucide="info"></i> Observaciones:</strong>
                            <p>${Observaciones}</p>
                        </div>
                        <div class="coord-badge">
                            <i data-lucide="map-pin"></i> UTM ${displayUTM}
                        </div>
                    </div>
                </div>
            `;
            
            layer.bindPopup(popupContent, { maxWidth: 300, className: 'custom-popup' });
            
            layer.on('popupopen', () => {
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                }
            });
        }
    }
});

let macrosectoresLayer = L.geoJSON(null, {
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
    initMap();
    initSidebar();
    loadTerritorialData();
    loadMacrosectores();
    loadCatastro();
});

function initMap() {
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    });

    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    map = L.map('map', {
        center: CONFIG.MAP_CENTER,
        zoom: CONFIG.INITIAL_ZOOM,
        layers: [esriWorldImagery]
    });

    const baseMaps = {
        "Terreno (Esri)": esriWorldImagery,
        "Calles (OSM)": osm
    };

    const overlayMaps = {
        "Macrosectores": macrosectoresLayer,
        "Catastro Base": catastroLayer,
        "Catastro en Terreno": markerLayer
    };

    L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);
    markerLayer.addTo(map);
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
        setTimeout(() => {
            map.invalidateSize();
        }, 300);
    });
}

async function loadTerritorialData() {
    console.log("Iniciando solicitud de datos...");
    const timestamp = new Date().getTime();
    const sheetUrl = `${CONFIG.SHEET_CSV_URL}&t=${timestamp}`;
    
    let finalUrl = sheetUrl;
    if (window.location.protocol === 'file:') {
        console.log("Acceso LOCAL detectado. Usando Proxy: corsproxy.io");
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

        if (csvText.includes("<!DOCTYPE html>") || csvText.includes("<html")) {
            throw new Error("El archivo recibido es HTML (posible error de permisos), no un CSV.");
        }

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

function processEntries(data) {
    markerLayer.clearLayers();

    const utm18S = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
    const wgs84 = "EPSG:4326";

    let markerCount = 0;

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

        let finalLat, finalLng;
        let displayUTM = "";

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
            markerCount++;
            let imagesHTML = '';
            if (URL_Antes || URL_Despues) {
                imagesHTML = `
                    <div class="popup-images-grid">
                        ${URL_Antes ? `
                            <div class="img-wrapper">
                                <span class="img-label">Antes</span>
                                <img src="${URL_Antes}" class="popup-image" alt="Antes" onerror="this.src='https://placehold.co/200x150/222/f97316?text=Sin+Foto'" onclick="openImageModal(this.src)">
                            </div>` : ''}
                        ${URL_Despues ? `
                            <div class="img-wrapper">
                                <span class="img-label">Después</span>
                                <img src="${URL_Despues}" class="popup-image" alt="Después" onerror="this.src='https://placehold.co/200x150/222/f97316?text=Sin+Foto'" onclick="openImageModal(this.src)">
                            </div>` : ''}
                    </div>
                `;
            } else if (URL_Generica) {
                imagesHTML = `<img src="${URL_Generica}" class="popup-image" alt="Foto" onerror="this.src='https://placehold.co/400x250/222/f97316?text=Sin+Foto'" onclick="openImageModal(this.src)">`;
            }

            const popupContent = `
                <div class="popup-container">
                    <div class="popup-header">
                        <span class="id-badge">Nº ${NumeroID || 'S/N'}</span>
                        <h4>${Nombre || 'Señalética'}</h4>
                    </div>
                    ${imagesHTML}
                    <div class="popup-details">
                        <div class="detail-item">
                            <strong><i data-lucide="calendar"></i> Fecha:</strong>
                            <span>${Fecha || 'No registrada'}</span>
                        </div>
                        <div class="detail-item">
                            <strong><i data-lucide="wrench"></i> Modificación:</strong>
                            <span>${Modificacion || 'N/A'}</span>
                        </div>
                        <div class="detail-item">
                            <strong><i data-lucide="info"></i> Observaciones:</strong>
                            <p>${Observaciones || '-'}</p>
                        </div>
                        <div class="coord-badge">
                            <i data-lucide="map-pin"></i> UTM ${displayUTM}
                        </div>
                    </div>
                </div>
            `;

            const marker = L.circleMarker([finalLat, finalLng], {
                radius: 8,
                fillColor: "#f97316",
                color: "#fff",
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
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

    if (data.length > 0 && !CONFIG.SHEET_CSV_URL.includes('PLACEHOLDER')) {
        const group = new L.featureGroup(markerLayer.getLayers());
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

function transformDriveUrl(url) {
    if (!url) return '';
    const driveIdRegex = /(?:id=|[?\/]|preview\/|d\/)([\w-]{25,})/;
    const match = url.match(driveIdRegex);

    if (match && match[1]) {
        // CORRECCIÓN: Se agrega el símbolo del dólar para interpolar la variable correctamente
        return `https://lh3.googleusercontent.com/d/$${match[1]}`;
    }
    return url; 
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
        const shpBuffer = await fetch('Macrosectores/MACROSECTORES.shp').then(r => {
            if (!r.ok) throw new Error("No se pudo cargar el archivo .shp");
            return r.arrayBuffer();
        });
        const dbfBuffer = await fetch('Macrosectores/MACROSECTORES.dbf').then(r => {
            if (!r.ok) throw new Error("No se pudo cargar el archivo .dbf");
            return r.arrayBuffer();
        });

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

    } catch (err) {
        console.error("Error al cargar Macrosectores:", err);
    }
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

/**
 * Carga y visualiza el GeoJSON de Catastro Pre-existente
 * CORRECCIÓN: Interceptor que convierte Polígonos a Puntos puros
 */
async function loadCatastro() {
    console.log("Cargando Catastro Pre-existente (GeoJSON)...");
    
    try {
        const response = await fetch('Macrosectores/CATASTRO.geojson');
        if (!response.ok) throw new Error("No se pudo cargar el archivo .geojson");
        
        const rawGeojson = await response.json();
        
        // INTERCEPTOR: Convierte todos los Polígonos y Líneas a Puntos
        const pointGeojson = {
            type: "FeatureCollection",
            features: rawGeojson.features.map(f => {
                if(!f.geometry || !f.geometry.coordinates) return f;
                
                const geomType = f.geometry.type;
                let coords = f.geometry.coordinates;
                let lng = 0, lat = 0;
                
                // Extraer solo la primera coordenada de la geometría
                if (geomType === 'Point') {
                    lng = coords[0]; lat = coords[1];
                } else if (geomType === 'LineString' || geomType === 'MultiPoint') {
                    lng = coords[0][0]; lat = coords[0][1];
                } else if (geomType === 'Polygon' || geomType === 'MultiLineString') {
                    lng = coords[0][0][0]; lat = coords[0][0][1];
                } else if (geomType === 'MultiPolygon') {
                    lng = coords[0][0][0][0]; lat = coords[0][0][0][1];
                }

                // Devolver el elemento modificado como un Punto
                return {
                    type: "Feature",
                    properties: f.properties,
                    geometry: {
                        type: "Point",
                        coordinates: [lng, lat]
                    }
                };
            })
        };
        
        // Cargar los datos transformados a la capa
        catastroLayer.addData(pointGeojson);
        catastroLayer.addTo(map);
        console.log("Catastro convertido a Puntos y cargado exitosamente.");

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
