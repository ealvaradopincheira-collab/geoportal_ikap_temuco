# Geoportal Temuco - Catastro de Señalética Vial

Sistema de Información Geográfica (WebGIS) para la visualización y gestión en tiempo real del catastro de señalética vial en la comuna de Temuco.

## Características principales

- **Mapa Interactivo**: Basado en Leaflet.js con capas base de Esri y OSM.
- **Sincronización en Tiempo Real**: Conexión directa con Google Sheets (publicado como CSV) para visualizar datos capturados en terreno mediante Google Forms.
- **Integración de Macrosectores**: Visualización de áreas de interés mediante carga directa de Shapefiles (`.shp` y `.dbf`).
- **Visualización Detallada**: Popups informativos con ID de señalética, fecha de registro, tipo de modificación, observaciones y fotos on-demand.
- **Proyección Automática**: Soporte para coordenadas UTM Zona 18S y WGS84.

## Estructura del Proyecto

- `/css`: Estilos personalizados (Vanilla CSS).
- `/js`: Lógica de la aplicación (`app.js`).
- `/Macrosectores`: Archivos del Shapefile de macrosectores.
- `/assets`: Recursos estáticos (logos, iconos).
- `index.html`: Punto de entrada de la aplicación.

## Instalación y Uso

1. Sube los archivos a cualquier servidor web o servicio de hosting estático (GitHub Pages, Vercel, Netlify).
2. Asegúrate de que la URL de Google Sheets en `js/app.js` sea la correcta.
3. El visor es totalmente responsivo y está optimizado para dispositivos móviles.

## Tecnologías Utilizadas

- [Leaflet.js](https://leafletjs.com/)
- [PapaParse](https://www.papaparse.com/) (CSV Parsing)
- [Proj4js](http://proj4js.org/) (Reproyección)
- [shpjs](https://github.com/calvinmetcalf/shapefile-js) (Shapefile Parsing)
- [Lucide Icons](https://lucide.dev/)

---
Desarrollado para **IKAP Publivial Spa**.
