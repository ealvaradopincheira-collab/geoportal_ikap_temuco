/**
 * Geoportal Temuco - Versión 5.0 Certificada
 */

const CONFIG = {
    MAP_CENTER: [-38.7359, -72.5904],
    INITIAL_ZOOM: 14,
    SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTM9vKw4CQimv9A7xagyzecSKk9P-_4m7qJ8ykCmP3p9a8CrbMp1Rls_pEoxXFV0gXOpI9AOlMSpygA/pub?output=csv'
};

let map, sectorChart, layerControl;
let stats = { global: { meta: 15000, terreno: 0, base: 0 }, sectores: {} };
let markerLayer = L.layerGroup();
let catastroLayer = L.geoJSON(null);
let macrosectoresLayer = L.geoJSON(null);

// Lógica de Pestañas (FIX: ReferenceError)
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    const targetBtn = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
    if(targetBtn) targetBtn.classList.add('active');
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
    map = L.map('map', { center: CONFIG.MAP_CENTER, zoom: CONFIG.INITIAL_ZOOM, layers: [esri], zoomControl: false });
    L.control.zoom({ position: 'topright' }).addTo(map);
    
    markerLayer.addTo(map);
    catastroLayer = L.geoJSON(null, {
        pointToLayer: (f, l) => L.circleMarker(l, { radius: 6, fillColor: "#3b82f6", color: "#fff", weight: 2, fillOpacity: 1 })
    }).addTo(map);

    layerControl = L.control.layers({ "Satélite": esri }, { "Macrosectores": macrosectoresLayer, "Catastro Base": catastroLayer, "Terreno": markerLayer }, { collapsed: false }).addTo(map);
}

function initStatsControl() {
    document.getElementById('sectorFilter').addEventListener('change', (e) => updateDashboard(e.target.value));
    const ctx = document.getElementById('sectorChart');
    sectorChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['Base', 'Levantado'], datasets: [{ data: [0, 0], backgroundColor: ['#3b82f6', '#f97316'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
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

// Detección de Columnas de Macrozona (FIX: Métricas en 0)
function getMacrozona(props_or_row) {
    const keys = Object.keys(props_or_row);
    const key = keys.find(k => k.toUpperCase().trim() === 'MACROSECTOR' || k.toLowerCase().includes('macro'));
    return key ? (props_or_row[key] || 'Sin Sector') : 'Sin Sector';
}

async function loadTerritorialData() {
    const response = await fetch(CONFIG.SHEET_CSV_URL + '&t=' + Date.now());
    const csvText = await response.text();
    Papa.parse(csvText, {
        header: true,
        complete: (results) => {
            results.data.forEach(row => {
                const sector = getMacrozona(row);
                if (!stats.sectores[sector]) stats.sectores[sector] = { base: 0, terreno: 0 };
                stats.sectores[sector].terreno++;
                stats.global.terreno++;
                
                // Lógica simplificada de marcador para el ejemplo
                if(row.Latitud) L.circleMarker([row.Latitud, row.Longitud], { radius: 8, fillColor: "#f97316", color: "#fff", weight: 2, fillOpacity: 0.8 }).addTo(markerLayer);
            });
            populateDropdown();
            updateDashboard();
        }
    });
}

async function loadCatastro() {
    const response = await fetch('Macrosectores/CATASTRO.geojson');
    const data = await response.json();
    data.features.forEach(f => {
        const sector = getMacrozona(f.properties);
        if (!stats.sectores[sector]) stats.sectores[sector] = { base: 0, terreno: 0 };
        stats.sectores[sector].base++;
        stats.global.base++;
    });
    catastroLayer.addData(data);
    updateDashboard();
}

function populateDropdown() {
    const select = document.getElementById('sectorFilter');
    Object.keys(stats.sectores).sort().forEach(s => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = s;
        select.appendChild(opt);
    });
}

function initSidebar() {
    document.getElementById('sidebarToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
        setTimeout(() => map.invalidateSize(), 300);
    });
}
