/**
 * Geoportal Temuco - v6.0.0
 * Integración Completa: Estadísticas, Clustering y GeoJSON
 */

const CONFIG = {
    MAP_CENTER: [-38.7359, -72.5904],
    INITIAL_ZOOM: 14,
    SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTM9vKw4CQimv9A7xagyzecSKk9P-_4m7qJ8ykCmP3p9a8CrbMp1Rls_pEoxXFV0gXOpI9AOlMSpygA/pub?output=csv'
};

let map, sectorChart, layerControl;
let stats = { global: { meta: 15000, terreno: 0, base: 0 }, sectores: {} };
let markerLayer = L.layerGroup();
let clusterLayer = L.markerClusterGroup({ disableClusteringAtZoom: 18 });
let catastroLayer = L.geoJSON(null);
let macrosectoresLayer = L.geoJSON(null);
let useClustering = false;

// --- LÓGICA DE PESTAÑAS ---
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    const btn = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
    if(btn) btn.classList.add('active');
    if(tabId === 'tab-stats' && sectorChart) sectorChart.resize();
};

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initSidebar();
    initStatsControl();
    loadTerritorialData();
    loadMacrosectores();
    loadCatastro();
});

function initMap() {
    const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');

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
        interactive: false,
        style: () => ({ color: "#f97316", weight: 2, fillOpacity: 0.1 })
    }).addTo(map);

    markerLayer.addTo(map);

    layerControl = L.control.layers(
        { "Satélite": esri, "Calles": osm }, 
        { "Macrosectores": macrosectoresLayer, "Catastro Base": catastroLayer, "Terreno": markerLayer }, 
        { collapsed: false }
    ).addTo(map);
}

function initStatsControl() {
    document.getElementById('sectorFilter').addEventListener('change', (e) => updateDashboard(e.target.value));
    document.getElementById('clusterToggle').addEventListener('change', (e) => {
        useClustering = e.target.checked;
        toggleClustering();
    });

    const ctx = document.getElementById('sectorChart');
    sectorChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['Base', 'Levantado'], datasets: [{ data: [0, 0], backgroundColor: ['#3b82f6', '#f97316'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function toggleClustering() {
    if (useClustering) {
        map.removeLayer(markerLayer);
        clusterLayer.clearLayers();
        clusterLayer.addLayers(markerLayer.getLayers());
        map.addLayer(clusterLayer);
    } else {
        map.removeLayer(clusterLayer);
        map.addLayer(markerLayer);
    }
}

function getMacrozona(item) {
    const keys = Object.keys(item);
    const key = keys.find(k => k.toUpperCase().trim() === 'MACROSECTOR' || k.toLowerCase().includes('macro'));
    return key ? (item[key] || 'Sin Sector') : 'Sin Sector';
}

async function loadTerritorialData() {
    const response = await fetch(CONFIG.SHEET_CSV_URL + '&t=' + Date.now());
    const csvText = await response.text();
    Papa.parse(csvText, {
        header: true,
        complete: (results) => {
            results.data.forEach(row => {
                if(!row.Latitud || !row.Longitud) return;
                const sector = getMacrozona(row);
                if (!stats.sectores[sector]) stats.sectores[sector] = { base: 0, terreno: 0 };
                stats.sectores[sector].terreno++;
                stats.global.terreno++;
                
                L.circleMarker([row.Latitud, row.Longitud], { radius: 8, fillColor: "#f97316", color: "#fff", weight: 2, fillOpacity: 0.8 }).addTo(markerLayer);
            });
            populateDropdown();
            updateDashboard();
        }
    });
}

async function loadMacrosectores() {
    try {
        const shpBuf = await fetch('Macrosectores/MACROSECTORES.shp').then(r => r.arrayBuffer());
        const dbfBuf = await fetch('Macrosectores/MACROSECTORES.dbf').then(r => r.arrayBuffer());
        const geojson = shp.combine([shp.parseShp(shpBuf), shp.parseDbf(dbfBuf)]);
        macrosectoresLayer.addData(geojson);
    } catch (e) { console.error("Error cargando Macrosectores", e); }
}

async function loadCatastro() {
    try {
        const response = await fetch('Macrosectores/CATASTRO.geojson');
        const data = await response.json();
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

            const sector = getMacrozona(f.properties);
            if (!stats.sectores[sector]) stats.sectores[sector] = { base: 0, terreno: 0 };
            stats.sectores[sector].base++;
            stats.global.base++;

            return { type: "Feature", properties: f.properties, geometry: { type: "Point", coordinates: [lng, lat] } };
        });

        catastroLayer.addData({ type: "FeatureCollection", features: points });
        updateDashboard();
    } catch (e) { console.error("Error cargando Catastro", e); }
}

function updateDashboard(sector = 'ALL') {
    const data = sector === 'ALL' ? stats.global : (stats.sectores[sector] || { base: 0, terreno: 0 });
    document.getElementById('kpi-global-terreno').textContent = stats.global.terreno.toLocaleString();
    document.getElementById('kpi-sector-base').textContent = data.base.toLocaleString();
    document.getElementById('kpi-sector-terreno').textContent = data.terreno.toLocaleString();
    
    const progress = (stats.global.terreno / stats.global.meta) * 100;
    document.getElementById('kpi-global-progress').style.width = `${Math.min(100, progress)}%`;
    
    sectorChart.data.datasets[0].data = [data.base, data.terreno];
    sectorChart.update();
}

function populateDropdown() {
    const select = document.getElementById('sectorFilter');
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
        document.getElementById('toggleIcon').setAttribute('data-lucide', sidebar.classList.contains('collapsed') ? 'chevron-right' : 'chevron-left');
        lucide.createIcons();
        setTimeout(() => map.invalidateSize(), 300);
    });
}
