import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { BUILDING_HEIGHT } from './buildings';

const tileUrl = (u) => String(u || '').replace('{s}', 'a').replace('{r}', '');

function boundsOfFc(fcs) {
  let b = null;
  const add = (c) => {
    if (typeof c[0] === 'number') {
      b = b ? [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])] : [c[0], c[1], c[0], c[1]];
    } else c.forEach(add);
  };
  fcs.forEach((fc) => (fc?.features || []).forEach((f) => f.geometry && add(f.geometry.coordinates)));
  return b;
}

/**
 * 3D view of the dashboard map (MapLibre): fields filled by the same colours as the 2D map;
 * protected structures (Nethouse, Greenhouse, Glasshouse, Cravo) raised as 7 m buildings.
 * fields: FeatureCollection with properties { id, name, fill, building, selected }
 * structures: FeatureCollection with properties { label, color, building } (optional)
 */
export default function Map3D({ fields, structures, basemapUrl, opacity = 0.75, onPick }) {
  const box = useRef(null);
  const map = useRef(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current,
      style: {
        version: 8,
        sources: { base: { type: 'raster', tiles: [tileUrl(basemapUrl)], tileSize: 256, maxzoom: 19 } },
        layers: [{ id: 'base', type: 'raster', source: 'base' }],
      },
      pitch: 58,
      bearing: -18,
      maxPitch: 75,
      attributionControl: false,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
    m.on('load', () => {
      m.setLight({ anchor: 'viewport', color: '#ffffff', intensity: 0.35, position: [1.4, 210, 35] });
      m.addSource('fields', { type: 'geojson', data: fields });
      m.addSource('structures', { type: 'geojson', data: structures || { type: 'FeatureCollection', features: [] } });
      // Flat parts first, then the buildings.
      m.addLayer({ id: 'st-flat', type: 'fill', source: 'structures', filter: ['!', ['get', 'building']], paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.25, 'fill-outline-color': ['get', 'color'] } });
      m.addLayer({ id: 'f-flat', type: 'fill', source: 'fields', filter: ['!', ['get', 'building']], paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': opacity } });
      m.addLayer({ id: 'f-line', type: 'line', source: 'fields', paint: { 'line-color': ['case', ['get', 'selected'], '#ffd54f', '#ffffff'], 'line-width': ['case', ['get', 'selected'], 3, 1] } });
      m.addLayer({ id: 'st-3d', type: 'fill-extrusion', source: 'structures', filter: ['get', 'building'], paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': BUILDING_HEIGHT, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.85 } });
      m.addLayer({ id: 'f-3d', type: 'fill-extrusion', source: 'fields', filter: ['get', 'building'], paint: { 'fill-extrusion-color': ['case', ['get', 'selected'], '#ffd54f', ['get', 'fill']], 'fill-extrusion-height': BUILDING_HEIGHT, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.9, 'fill-extrusion-vertical-gradient': true } });
      const b = boundsOfFc([fields, structures]);
      if (b) m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 48, pitch: 58, bearing: -18, duration: 0 });
      const click = (e) => {
        const f = e.features?.[0];
        if (!f) return;
        pickRef.current?.(f.properties.id);
        new maplibregl.Popup({ closeButton: false, offset: 8 }).setLngLat(e.lngLat).setHTML(`<b>${String(f.properties.name || '').replace(/[<>&]/g, '')}</b>`).addTo(m);
      };
      ['f-3d', 'f-flat'].forEach((id) => {
        m.on('click', id, click);
        m.on('mouseenter', id, () => { m.getCanvas().style.cursor = 'pointer'; });
        m.on('mouseleave', id, () => { m.getCanvas().style.cursor = ''; });
      });
    });
    return () => { m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    m.getSource('fields')?.setData(fields);
    m.getSource('structures')?.setData(structures || { type: 'FeatureCollection', features: [] });
    if (m.getLayer('f-flat')) m.setPaintProperty('f-flat', 'fill-opacity', opacity);
  }, [fields, structures, opacity]);

  useEffect(() => {
    const m = map.current;
    const src = m?.getSource?.('base');
    if (src && src.setTiles) src.setTiles([tileUrl(basemapUrl)]);
  }, [basemapUrl]);

  return <div ref={box} style={{ position: 'absolute', inset: 0 }} aria-label="3D field map" role="region" />;
}
