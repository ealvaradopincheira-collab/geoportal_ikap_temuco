#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Procesador de Chat de WhatsApp - Cuadrilla G1 (Acrílica Fernando & Pedro G)
Geoportal IKAP - Catastro Temuco

Funcionalidad:
1. Lee y parsea el archivo de chat de WhatsApp 'Chat de WhatsApp con G1 acrilica Fernando  Pedro G.txt'.
2. Agrupa por Jornada (Fecha / Día).
3. Identifica eventos de terreno delimitados por el envío de ubicaciones de Google Maps.
4. Asocia las imágenes correspondientes a cada punto (Prioridad: Foto Antes y Foto Después).
5. Filtra y excluye estrictamente fotos de taller, compras de insumos o mensajes sin pin de Maps.
6. Exporta a CSV ('data/datos_terreno_g1.csv') y GeoJSON ('data/datos_terreno_g1.geojson').
"""

import os
import re
import csv
import json
from datetime import datetime
from collections import defaultdict

# --- CONFIGURACIÓN DE RUTAS ---
BASE_DIR = r"C:\Users\ealva\Desktop\Proyectos Antigravity\Geoportal IKAP"
CHAT_DIR = os.path.join(BASE_DIR, "Datos Grupos Terreno", "Chat de WhatsApp con G1 acrilica Fernando  Pedro G")
CHAT_FILE = os.path.join(CHAT_DIR, "Chat de WhatsApp con G1 acrilica Fernando  Pedro G.txt")
DATA_OUT_DIR = os.path.join(BASE_DIR, "data")
CSV_OUT = os.path.join(DATA_OUT_DIR, "datos_terreno_g1.csv")
GEOJSON_OUT = os.path.join(DATA_OUT_DIR, "datos_terreno_g1.geojson")

os.makedirs(DATA_OUT_DIR, exist_ok=True)

# Expresiones regulares
MSG_REGEX = re.compile(
    r'^(\d{1,2}/\d{1,2}/\d{4}),\s*(\d{1,2}:\d{2}(?:\s*[\u202f\s]*(?:a\.\s*m\.|p\.\s*m\.|AM|PM))?)\s*-\s*([^:]+):\s*(.*)$'
)
IMG_REGEX = re.compile(r'(IMG-\d{8}-WA\d+\.jpg)')
MAPS_REGEX = re.compile(r'(https?://(?:maps\.google\.com|maps\.app\.goo\.gl|goo\.gl/maps)[^\s\n\r]+)')
COORD_REGEX = re.compile(r'[?&]q=([-+]?\d+\.\d+),([-+]?\d+\.\d+)')

def parse_datetime(date_str, time_str):
    """Parsea fecha y hora del formato WhatsApp a objeto datetime."""
    clean_time = time_str.replace('\u202f', ' ').replace('.', '').strip().lower()
    clean_time = re.sub(r'([ap])\s+m', r'\1m', clean_time)
    
    parts = [int(p) for p in date_str.split('/')]
    day, month, year = parts[0], parts[1], parts[2]
    
    for fmt in ["%d/%m/%Y %I:%M %p", "%d/%m/%Y %H:%M"]:
        try:
            return datetime.strptime(f"{day}/{month}/{year} {clean_time}", fmt)
        except Exception:
            pass
    return None

def parse_chat_messages(file_path):
    """Lee y estructura los mensajes línea por línea."""
    with open(file_path, 'r', encoding='utf-8') as f:
        raw_lines = f.readlines()
        
    messages = []
    current_msg = None
    
    for line in raw_lines:
        m = MSG_REGEX.match(line)
        if m:
            if current_msg:
                messages.append(current_msg)
            date, time_str, sender, content = m.groups()
            dt = parse_datetime(date, time_str)
            current_msg = {
                'date': date,
                'time_str': time_str,
                'datetime': dt,
                'sender': sender.strip(),
                'text': content,
                'images': IMG_REGEX.findall(content),
                'maps': MAPS_REGEX.findall(content)
            }
        else:
            if current_msg:
                current_msg['text'] += "\n" + line.strip()
                current_msg['images'].extend(IMG_REGEX.findall(line))
                current_msg['maps'].extend(MAPS_REGEX.findall(line))
                
    if current_msg:
        messages.append(current_msg)
        
    return messages

def extract_intervention_points(messages):
    """
    Agrupa los mensajes por día y segmenta en puntos de intervención georreferenciados.
    Asocia fotos de 'Antes' y 'Después'.
    Excluye estrictamente eventos sin coordenadas de Maps.
    """
    by_day = defaultdict(list)
    for msg in messages:
        by_day[msg['date']].append(msg)
        
    all_points = []
    point_seq = 1
    
    def date_key(d):
        p = [int(x) for x in d.split('/')]
        return (p[2], p[1], p[0])

    for date_str in sorted(by_day.keys(), key=date_key):
        day_msgs = by_day[date_str]
        
        clusters = []
        current_cluster = {
            'date': date_str,
            'coords': None,
            'maps_url': None,
            'pre_images': [],
            'post_images': [],
            'all_images': [],
            'notes': [],
            'dt_start': None,
            'dt_end': None,
            'senders': set(),
            'found_pin': False
        }
        
        for msg in day_msgs:
            found_coords = None
            found_url = None
            if msg['maps']:
                for url in msg['maps']:
                    m_coord = COORD_REGEX.search(url)
                    if m_coord:
                        lat, lng = float(m_coord.group(1)), float(m_coord.group(2))
                        if -40.0 <= lat <= -37.0 and -74.0 <= lng <= -71.0:
                            found_coords = (lat, lng)
                            found_url = url
                            break
            
            if found_coords:
                if current_cluster['coords'] and (current_cluster['all_images'] or current_cluster['notes']):
                    clusters.append(current_cluster)
                    current_cluster = {
                        'date': date_str,
                        'coords': None,
                        'maps_url': None,
                        'pre_images': [],
                        'post_images': [],
                        'all_images': [],
                        'notes': [],
                        'dt_start': None,
                        'dt_end': None,
                        'senders': set(),
                        'found_pin': False
                    }
                
                current_cluster['coords'] = found_coords
                current_cluster['maps_url'] = found_url
                current_cluster['found_pin'] = True
                if not current_cluster['dt_start']:
                    current_cluster['dt_start'] = msg['datetime']
                current_cluster['dt_end'] = msg['datetime']
                
            if msg['images']:
                for img in msg['images']:
                    if img not in current_cluster['all_images']:
                        current_cluster['all_images'].append(img)
                        if not current_cluster['found_pin']:
                            current_cluster['pre_images'].append(img)
                        else:
                            current_cluster['post_images'].append(img)
                            
                if not current_cluster['dt_start']:
                    current_cluster['dt_start'] = msg['datetime']
                current_cluster['dt_end'] = msg['datetime']
                
            clean_txt = msg['text']
            for img in msg['images']:
                clean_txt = clean_txt.replace(f"{img} (archivo adjunto)", "").replace(img, "")
            clean_txt = re.sub(r'https?://[^\s]+', '', clean_txt).strip()
            
            ignore_phrases = ["<multimedia omitido>", "se eliminó este mensaje.", "comprar la batería", "auto planet"]
            if clean_txt and not any(ign in clean_txt.lower() for ign in ignore_phrases):
                current_cluster['notes'].append(f"{msg['sender']}: {clean_txt}")
                current_cluster['senders'].add(msg['sender'])
                if not current_cluster['dt_start']:
                    current_cluster['dt_start'] = msg['datetime']
                current_cluster['dt_end'] = msg['datetime']
                
        if current_cluster['coords'] and (current_cluster['all_images'] or current_cluster['notes']):
            clusters.append(current_cluster)
            
        for c in clusters:
            if c['coords'] is not None:
                lat, lng = c['coords']
                
                foto_antes = ""
                foto_despues = ""
                
                if len(c['all_images']) == 1:
                    foto_antes = c['all_images'][0]
                elif len(c['all_images']) >= 2:
                    if c['pre_images'] and c['post_images']:
                        foto_antes = c['pre_images'][0]
                        foto_despues = c['post_images'][-1]
                    else:
                        foto_antes = c['all_images'][0]
                        foto_despues = c['all_images'][-1]
                
                date_iso = ""
                time_iso = ""
                if c['dt_start']:
                    date_iso = c['dt_start'].strftime("%Y-%m-%d")
                    time_iso = c['dt_start'].strftime("%H:%M")
                else:
                    parts = [int(x) for x in c['date'].split('/')]
                    date_iso = f"{parts[2]:04d}-{parts[1]:02d}-{parts[0]:02d}"
                    time_iso = "12:00"
                    
                point_id = f"G1-{date_iso.replace('-', '')}-{point_seq:04d}"
                point_seq += 1
                
                # Resumen de observaciones
                clean_notes = [n.replace('\n', ' ').replace('\r', '').strip() for n in c['notes'] if n.strip()]
                obs_text = " | ".join(clean_notes) if clean_notes else "Registro en terreno"
                if len(obs_text) > 300:
                    obs_text = obs_text[:297] + "..."
                    
                dims = []
                for n in c['notes']:
                    dim_match = re.findall(r'\b(?:\d{2}\s*x\s*\d{2}|\d{2}\s*x\s*1\s*metro|D\s*\d{2})\b', n, re.IGNORECASE)
                    dims.extend(dim_match)
                dims_str = ", ".join(set(dims)) if dims else ""

                point_record = {
                    'id': point_id,
                    'nombre': 'Señalética Vial',
                    'fecha': date_iso,
                    'fecha_display': c['date'],
                    'hora': time_iso,
                    'lat': lat,
                    'lng': lng,
                    'cuadrilla': "GRUPO 1",
                    'tipo': "Mantención de Señalética",
                    'foto_antes': foto_antes,
                    'foto_despues': foto_despues,
                    'total_fotos': len(c['all_images']),
                    'observaciones': "",
                    'maps_url': c['maps_url']
                }
                
                all_points.append(point_record)
                
    return all_points

def export_csv(points, out_path):
    """Exporta los puntos a CSV con el esquema estándar de la planilla maestra."""
    fieldnames = [
        "Marca temporal",
        "Número de Señalética",
        "Fecha",
        "Hora",
        "Cuadrilla",
        "Latitud",
        "Longitud",
        "Fotografía (Antes)",
        "Fotografía (Después)",
        "Tipo de Modificación",
        "Observaciones"
    ]
    
    with open(out_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        
        for p in points:
            path_antes = f"Datos Grupos Terreno/Chat de WhatsApp con G1 acrilica Fernando  Pedro G/{p['foto_antes']}" if p['foto_antes'] else ""
            path_despues = f"Datos Grupos Terreno/Chat de WhatsApp con G1 acrilica Fernando  Pedro G/{p['foto_despues']}" if p['foto_despues'] else ""
            
            writer.writerow({
                "Marca temporal": f"{p['fecha']} {p['hora']}:00",
                "Número de Señalética": p['id'],
                "Fecha": p['fecha'],
                "Hora": p['hora'],
                "Cuadrilla": p['cuadrilla'],
                "Latitud": f"{p['lat']:.6f}",
                "Longitud": f"{p['lng']:.6f}",
                "Fotografía (Antes)": path_antes,
                "Fotografía (Después)": path_despues,
                "Tipo de Modificación": p['tipo'],
                "Observaciones": p['observaciones']
            })
            
    print(f"[OK] CSV exportado con {len(points)} puntos en: {out_path}")

def export_geojson(points, out_path):
    """Exporta los puntos a GeoJSON estándar para Leaflet sin textos de chat."""
    features = []
    for p in points:
        path_antes = f"Datos Grupos Terreno/Chat de WhatsApp con G1 acrilica Fernando  Pedro G/{p['foto_antes']}" if p['foto_antes'] else ""
        path_despues = f"Datos Grupos Terreno/Chat de WhatsApp con G1 acrilica Fernando  Pedro G/{p['foto_despues']}" if p['foto_despues'] else ""
        
        feat = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [p['lng'], p['lat']]
            },
            "properties": {
                "id": p['id'],
                "nombre": p['nombre'],
                "fecha": p['fecha'],
                "fecha_display": p['fecha_display'],
                "hora": p['hora'],
                "cuadrilla": p['cuadrilla'],
                "tipo": p['tipo'],
                "foto_antes": path_antes,
                "foto_despues": path_despues,
                "nombre_foto_antes": p['foto_antes'],
                "nombre_foto_despues": p['foto_despues'],
                "total_fotos": p['total_fotos'],
                "observaciones": p['observaciones']
            }
        }
        features.append(feat)
        
    geojson_data = {
        "type": "FeatureCollection",
        "features": features
    }
    
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(geojson_data, f, ensure_ascii=False, indent=2)
        
    print(f"[OK] GeoJSON exportado con {len(features)} features en: {out_path}")

def main():
    print("Iniciando procesamiento de chat G1...")
    messages = parse_chat_messages(CHAT_FILE)
    print(f"Total mensajes parseados: {len(messages)}")
    
    points = extract_intervention_points(messages)
    print(f"Total puntos georreferenciados válidos: {len(points)}")
    
    by_date = defaultdict(int)
    for p in points:
        by_date[p['fecha_display']] += 1
        
    print("\n--- Resumen de Puntos por Jornada ---")
    for d, count in sorted(by_date.items(), key=lambda x: [int(v) for v in x[0].split('/')[::-1]]):
        print(f"  {d:<12}: {count:>3} puntos")
        
    export_csv(points, CSV_OUT)
    export_geojson(points, GEOJSON_OUT)
    print("\n[Éxito] Procesamiento completado.")

if __name__ == "__main__":
    main()
