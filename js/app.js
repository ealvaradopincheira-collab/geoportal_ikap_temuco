/**
 * Geoportal Temuco - v6.3.0
 * Corrección de Rutas y Función de Imágenes
 */

// 1. Funciones de Interfaz (Definidas Globalmente)
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    
    const targetBtn = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
    if (targetBtn) targetBtn.classList.add('active');
    
    if (tabId === 'tab-stats' && window.sectorChart) {
        setTimeout(() => window.sectorChart.resize(), 100);
    }
};

// 2. Configuración
const CONFIG = {
    MAP_CENTER: [-38.7359, -72.5904],
    INITIAL_ZOOM: 14,
    SHEET_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTM9vKw4CQimv9A7xagyzecSKk9P-_4m7qJ8ykCmP3p9a8CrbMp1Rls_pEoxXFV0gXOpI9AOlMSpygA/pub?output=csv'
};

let map, layerControl;
window.sectorChart = null;
let stats = { global: { meta: 15000, terreno: 0, base: 0 }, sectores: {} };
let markerLayer = L.layerGroup();
let clusterLayer = L.markerClusterGroup({ disableClusteringAtZoom: 18 });
let catastroLayer = L.geoJSON(null);
let macrosectoresLayer = L.geoJSON(null);
let useClustering = false;

// 3. Inicialización al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initSidebar();
    initStatsControl();
    loadTerritorialData();
    loadMacrosectores();
    loadCatastro();
});

function initMap() {
    const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri' });
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM' });

    map = L.map('map', { 
        center: CONFIG.MAP_CENTER, 
        zoom: CONFIG.INITIAL_ZOOM, 
        layers: [esri],
        zoomControl: false 
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    catastroLayer = L.geoJSON(null, {
        pointToLayer: (f, l) => L.circleMarker(l, { radius: 6, fillColor: "#3b82f6", color: "#fff", weight: 2, fillOpacity: 1 })
    }).addTo(map);

    macrosectoresLayer = L.geoJSON(null, {
        style: () => ({ color: "#f97316", weight: 2, fillOpacity: 0.1, interactive: false })
    }).addTo(map);

    markerLayer.addTo(map);
    layerControl = L.control.layers({ "Satélite": esri, "Calles": osm }, { "Macrosectores": macrosectoresLayer, "Catastro Base": catastroLayer, "Terreno": markerLayer }, { collapsed: false }).addTo(map);
}

function getMacrozona(item) {
    const keys = Object.keys(item);
    const key = keys.find(k => k.toUpperCase().trim() === 'MACROSECTOR' || k.toLowerCase().includes('macro'));
    return key ? (item[key] || 'Sin Sector') : 'Sin Sector';
}

async function loadTerritorialData() {
    try {
        const response = await fetch(CONFIG.SHEET_URL + '&t=' + Date.now());
        const csvText = await response.text();
        Papa.parse(csvText, {
            header: true,
            complete: (results) => {
                results.data.forEach(row => {
                    const lat = parseFloat(row.Latitud);
                    const lng = parseFloat(row.Longitud);
                    if (isNaN(lat)) return;

                    const sec = getMacrozona(row);
                    if (!stats.sectores[sec]) stats.sectores[sec] = { base: 0, terreno: 0 };
                    stats.sectores[sec].terreno++;
                    stats.global.terreno++;
                    
                    L.circleMarker([lat, lng], { radius: 8, fillColor: "#f97316", color: "#fff", weight: 2, fillOpacity: 0.8 }).addTo(markerLayer);
                });
                populateDropdown();
                updateDashboard();
            }
        });
    } catch (e) { console.error("Error en datos de terreno", e); }
}

async function loadMacrosectores() {
    try {
        const s = await fetch('Macrosectores/MACROSECTORES.shp').then(r => r.arrayBuffer());
        const d = await fetch('Macrosectores/MACROSECTORES.dbf').then(r => r.arrayBuffer());
        macrosectoresLayer.addData(shp.combine([shp.parseShp(s), shp.parseDbf(d)]));
    } catch(e) { console.error("Error cargando Macrosectores", e); }
}

async function loadCatastro() {
    try {
        const res = await fetch('Macrosectores/CATASTRO.geojson');
        const data = await res.json();
        const utm18S = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
        const wgs84 = "EPSG:4326";

        const points = data.features.map(f => {
            let coords = f.geometry.type === 'Point' ? f.geometry.coordinates : f.geometry.coordinates[0][0];
            if (Array.isArray(coords[0])) coords = coords[0];
            let [lng, lat] = coords;

            if (Math.abs(lng) > 180) {
                const conv = proj4(utm18S, wgs84, [lng, lat]);
                lng = conv[0]; lat = conv[1];
            }
            
            const sec = getMacrozona(f.properties);
            if (!stats.sectores[sec]) stats.sectores[sec] = { base: 0, terreno: 0 };
            stats.sectores[sec].base++;
            stats.global.base++;
            
            return { type: "Feature", properties: f.properties, geometry: { type: "Point", coordinates: [lng, lat] } };
        });

        catastroLayer.addData({ type: "FeatureCollection", features: points });
        updateDashboard();
    } catch(e) { console.error("Error cargando Catastro Base", e); }
}

function initStatsControl() {
    const ctx = document.getElementById('sectorChart');
    if (ctx) {
        window.sectorChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: ['Base', 'Levantado'], datasets: [{ data: [0, 0], backgroundColor: ['#3b82f6', '#f97316'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }
    
    document.getElementById('sectorFilter').addEventListener('change', (e) => updateDashboard(e.target.value));
    
    document.getElementById('clusterToggle').addEventListener('change', (e) => {
        useClustering = e.target.checked;
        if(useClustering) { 
            map.removeLayer(markerLayer); 
            clusterLayer.clearLayers(); 
            clusterLayer.addLayers(markerLayer.getLayers()); 
            map.addLayer(clusterLayer); 
        } else { 
            map.removeLayer(clusterLayer); 
            map.addLayer(markerLayer); 
        }
    });
}

function updateDashboard(sector = 'ALL') {
    const data = sector === 'ALL' ? stats.global : (stats.sectores[sector] || { base: 0, terreno: 0 });
    
    const globalEl = document.getElementById('kpi-global-terreno');
    if (globalEl) globalEl.textContent = stats.global.terreno.toLocaleString();
    
    document.getElementById('kpi-sector-base').textContent = data.base.toLocaleString();
    document.getElementById('kpi-sector-terreno').textContent = data.terreno.toLocaleString();
    
    const progress = (stats.global.terreno / 15000) * 100;
    document.getElementById('kpi-global-progress').style.width = `${Math.min(100, progress)}%`;
    
    if (window.sectorChart) {
        window.sectorChart.data.datasets[0].data = [data.base, data.terreno];
        window.sectorChart.update();
    }
}

function populateDropdown() {
    const select = document.getElementById('sectorFilter');
    if (!select) return;
    select.innerHTML = '<option value="ALL">Todos los Sectores</option>';
    Object.keys(stats.sectores).sort().forEach(s => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = s;
        select.appendChild(opt);
    });
}

function initSidebar() {
    document.getElementById('sidebarToggle').addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('collapsed');
        const icon = document.getElementById('toggleIcon');
        icon.setAttribute('data-lucide', sidebar.classList.contains('collapsed') ? 'chevron-right' : 'chevron-left');
        lucide.createIcons();
        setTimeout(() => map.invalidateSize(), 300);
    });
}

function transformDriveUrl(url) {
    if (!url) return '';
    const match = url.match(/(?:id=|[?\/]|preview\/|d\/)([\w-]{25,})/);
    // CORREGIDO: Uso de backticks y signo pesos para la variable
    return match ? `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000` : url;
}
