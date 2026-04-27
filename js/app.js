/**
 * Geoportal Temuco - Catastro en Tiempo Real
 * Integración Leaflet + Google Sheets + Google Drive
 */

// --- CONFIGURACIÓN ---
const CONFIG = {
    MAP_CENTER: [-38.7359, -72.5904],
    INITIAL_ZOOM: 14,
    // URL del Google Sheet publicado como CSV. 
    // Para probar, se puede usar un archivo local o una URL de ejemplo.
    SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTM9vKw4CQimv9A7xagyzecSKk9P-_4m7qJ8ykCmP3p9a8CrbMp1Rls_pEoxXFV0gXOpI9AOlMSpygA/pub?output=csv', 
    REFRESH_INTERVAL: 0 // set to > 0 if auto-refresh is desired (ms)
};

// --- VARIABLE GLOBAL DEL MAPA ---
let map;
let markerLayer = L.layerGroup();
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
});

function initMap() {
    // Mapas Base
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    });

    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    // Inicializar Mapa
    map = L.map('map', {
        center: CONFIG.MAP_CENTER,
        zoom: CONFIG.INITIAL_ZOOM,
        layers: [esriWorldImagery] // Default layer
    });

    // Control de Capas
    const baseMaps = {
        "Terreno (Esri)": esriWorldImagery,
        "Calles (OSM)": osm
    };

    const overlayMaps = {
        "Macrosectores": macrosectoresLayer,
        "Catastro en Terreno": markerLayer
    };

    L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(map);
    
    // Add marker layer to map by default
    markerLayer.addTo(map);
}

function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    const toggleIcon = document.getElementById('toggleIcon');

    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        
        // Actualizar icono (Lucide)
        if (sidebar.classList.contains('collapsed')) {
            toggleIcon.setAttribute('data-lucide', 'chevron-right');
        } else {
            toggleIcon.setAttribute('data-lucide', 'chevron-left');
        }
        lucide.createIcons();

        // Reajustar tamaño del mapa después de la animación
        setTimeout(() => {
            map.invalidateSize();
        }, 300);
    });
}

/**
 * Función principal de carga de datos
 */
async function loadTerritorialData() {
    console.log("Iniciando solicitud de datos...");

    // Añadir un cache-buster para evitar versiones obsoletas de Google Sheets
    const timestamp = new Date().getTime();
    const sheetUrl = `${CONFIG.SHEET_CSV_URL}&t=${timestamp}`;
    
    // URL Final (con Proxy si es local)
    let finalUrl = sheetUrl;
    if (window.location.protocol === 'file:') {
        console.log("Acceso LOCAL detectado. Usando Proxy: corsproxy.io");
        finalUrl = `https://corsproxy.io/?${encodeURIComponent(sheetUrl)}`;
    }

    console.log("URL de descarga:", finalUrl);

    try {
        const response = await fetch(finalUrl);
        if (!response.ok) throw new Error(`El servidor respondió con código ${response.status}`);
        
        const csvText = await response.text();
        console.log("Contenido recibido. Primeros caracteres:", csvText.substring(0, 80));

        if (csvText.includes("<!DOCTYPE html>") || csvText.includes("<html")) {
            throw new Error("El archivo recibido es HTML (posible error de permisos), no un CSV.");
        }

        Papa.parse(csvText, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: function(results) {
                console.log(`Parseo completado. Filas encontradas: ${results.data.length}`);
                processEntries(results.data);
            }
        });

    } catch (err) {
        console.error("FALLO CRÍTICO DE CARGA:", err);
        console.log("Cargando datos de respaldo (Demo)...");
        showDemoData();
    }
}

/**
 * Procesa cada fila del CSV para crear marcadores
 */
function processEntries(data) {
    // Limpiar marcadores existentes
    markerLayer.clearLayers();

    // Definir proyección UTM Zona 18 Sur (Chile - Temuco)
    const utm18S = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
    const wgs84 = "EPSG:4326";

    let markerCount = 0;

    data.forEach((row, index) => {
        // Mapeo dinámico de columnas (busca palabras clave en los encabezados)
        const keys = Object.keys(row);
        const colLat = keys.find(k => k.toLowerCase().includes('latitud'));
        const colLng = keys.find(k => k.toLowerCase().includes('longitud'));
        const colX = keys.find(k => k.toLowerCase().includes('este'));
        const colY = keys.find(k => k.toLowerCase().includes('norte'));
        
        const colName = keys.find(k => k.toLowerCase().includes('nombre') || k.toLowerCase().includes('propietario'));
        const colObs = keys.find(k => k.toLowerCase().includes('observaci') || k.toLowerCase().includes('comentario'));
        
        const colImgBefore = keys.find(k => k.toLowerCase().includes('fotograf') && k.toLowerCase().includes('antes'));
        const colImgAfter = keys.find(k => k.toLowerCase().includes('fotograf') && k.toLowerCase().includes('despues'));
        const colImgGeneric = keys.find(k => k.toLowerCase().includes('foto') || k.toLowerCase().includes('imagen') || k.toLowerCase().includes('fotograf'));

        const colDate = keys.find(k => k.toLowerCase().includes('fecha') || k.toLowerCase().includes('marca temporal') || k.toLowerCase().includes('timestamp'));
        const colMod = keys.find(k => k.toLowerCase().includes('modificaci') || k.toLowerCase().includes('tipo') || k.toLowerCase().includes('trabajo'));
        const colId = keys.find(k => k.toLowerCase().includes('número') || k.toLowerCase().includes('nº') || k.toLowerCase().includes('numero') || k.toLowerCase().includes('señaletica') || k.toLowerCase().includes('código'));

        // Priorizar coordenadas: ESTE/NORTE (UTM) o LAT/LNG
        // Buscamos un valor que no esté vacío
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

            // DETECTAR FORMATO (UTM vs WGS84)
            if (Math.abs(valLat) > 1000 || Math.abs(valLng) > 1000) {
                if (typeof proj4 === 'undefined') {
                    console.error("Proj4 no cargado.");
                    return;
                }
                try {
                    // Conversión de UTM 18S a WGS84
                    // IMPORTANTE: Proj4 espera [X, Y] -> [Este, Norte]
                    const coords = proj4(utm18S, wgs84, [valLng, valLat]);
                    finalLng = coords[0];
                    finalLat = coords[1];
                } catch (e) {
                    console.error("Error en conversión UTM:", e);
                    return;
                }
            } else {
                finalLat = valLat;
                finalLng = valLng;
            }

        if (!isNaN(finalLat) && !isNaN(finalLng)) {
            markerCount++;

            // Construir sección de imágenes (Antes y Después)
            let imagesHTML = '';
            if (URL_Antes || URL_Despues) {
                imagesHTML = `
                    <div class="popup-images-grid">
                        ${URL_Antes ? `
                            <div class="img-wrapper">
                                <span class="img-label">Antes</span>
                                <img src="${URL_Antes}" class="popup-image" alt="Antes" onerror="this.src='https://placehold.co/200x150/222/f97316?text=Sin+Foto'">
                            </div>` : ''}
                        ${URL_Despues ? `
                            <div class="img-wrapper">
                                <span class="img-label">Después</span>
                                <img src="${URL_Despues}" class="popup-image" alt="Después" onerror="this.src='https://placehold.co/200x150/222/f97316?text=Sin+Foto'">
                            </div>` : ''}
                    </div>
                `;
            } else if (URL_Generica) {
                imagesHTML = `<img src="${URL_Generica}" class="popup-image" alt="Foto" onerror="this.src='https://placehold.co/400x250/222/f97316?text=Sin+Foto'">`;
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
                            <i data-lucide="map-pin"></i> ${finalLat.toFixed(6)}, ${finalLng.toFixed(6)}
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

    console.log(`Marcadores creados: ${markerCount}`);

    if (markerCount === 0 && data.length > 0) {
        alert("Atención: Se recibieron datos de la planilla, pero no se pudieron procesar las coordenadas. Revisa el formato de Latitud/Longitud.");
    }

    // Si hay datos, ajustar la vista (opcional)
    if (data.length > 0 && !CONFIG.SHEET_CSV_URL.includes('PLACEHOLDER')) {
        const group = new L.featureGroup(markerLayer.getLayers());
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

/**
 * Transforma: https://drive.google.com/open?id=ID_DEL_ARCHIVO
 * A: https://drive.google.com/uc?export=view&id=ID_DEL_ARCHIVO
 */
function transformDriveUrl(url) {
    if (!url) return '';
    
    // Regex para capturar el ID de diferentes formatos de URL de Drive
    const driveIdRegex = /(?:id=|[?\/]|preview\/|d\/)([\w-]{25,})/;
    const match = url.match(driveIdRegex);

    if (match && match[1]) {
        // Formato más robusto para embeber imágenes de Google Drive (evita bloqueos de CORS/Cookies)
        return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }

    return url; // Retorna original si no coincide
}

/**
 * Función de respaldo (Demo) en caso de que no haya CSV conectado
 */
function showDemoData() {
    const demoData = [
        {
            Latitud: -38.7359,
            Longitud: -72.5904,
            Nombre_Propietario: "Predio Central Temuco",
            Observaciones: "Inspección de rutina realizada. Todo en orden.",
            URL_Imagen_Drive: "https://drive.google.com/open?id=1WvX8BfS_E0y_u1uX6_k-HkXpC-m8u-Ym"
        },
        {
            Latitud: -38.7400,
            Longitud: -72.6000,
            Nombre_Propietario: "Sector Av. Alemania",
            Observaciones: "Necesita mantenimiento de cercado perimetral.",
            URL_Imagen_Drive: "https://drive.google.com/open?id=1Z-0I4Z_S0y_u1uX6_k-HkXpC-m8u-Z1"
        }
    ];
    processEntries(demoData);
}

/**
 * Carga y visualiza el shapefile de Macrosectores
 */
async function loadMacrosectores() {
    console.log("Cargando Macrosectores...");
    
    try {
        // Cargar archivos .shp y .dbf
        const shpBuffer = await fetch('Macrosectores/MACROSECTORES.shp').then(r => {
            if (!r.ok) throw new Error("No se pudo cargar el archivo .shp");
            return r.arrayBuffer();
        });
        const dbfBuffer = await fetch('Macrosectores/MACROSECTORES.dbf').then(r => {
            if (!r.ok) throw new Error("No se pudo cargar el archivo .dbf");
            return r.arrayBuffer();
        });

        // Parsear y combinar
        const geojson = shp.combine([shp.parseShp(shpBuffer), shp.parseDbf(dbfBuffer)]);
        
        // Detectar si necesita proyección (UTM Zona 18S)
        // Tomamos el primer punto de la primera geometría
        const firstFeature = geojson.features[0];
        if (firstFeature && firstFeature.geometry) {
            let coords = firstFeature.geometry.coordinates[0];
            if (Array.isArray(coords[0])) coords = coords[0]; // Manejar MultiPolygon
            
            // Si la coordenada X es > 180, asumimos que es UTM
            if (Math.abs(coords[0]) > 180) {
                console.log("Detectadas coordenadas UTM. Proyectando a WGS84...");
                const utm18S = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
                const wgs84 = "EPSG:4326";
                
                geojson.features.forEach(feature => {
                    projectGeometry(feature.geometry, utm18S, wgs84);
                });
            }
        }

        macrosectoresLayer.addData(geojson);
        macrosectoresLayer.addTo(map);
        console.log("Macrosectores cargados exitosamente.");

    } catch (err) {
        console.error("Error al cargar Macrosectores:", err);
    }
}

/**
 * Función auxiliar para proyectar geometrías recursivamente
 */
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
