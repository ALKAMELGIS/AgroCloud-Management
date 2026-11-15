import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { WMS_URL } from './satelliteApi';
import { ringToFeature, allRings, circleFeature } from './aoi';

function ensurePane(map, name, zIndex) {
  const pane = map.getPane(name) || map.createPane(name);
  pane.style.zIndex = String(zIndex);
  pane.style.pointerEvents = 'none';
  return pane;
}

function wmsLayer(sat, time, pane) {
  const opts = {
    layers: 'S2', format: 'image/png', transparent: true, version: '1.3.0', tileSize: 512, maxZoom: 20,
    k: sat.tileKey, index: sat.index, time, maxcc: sat.maxcc, opacity: sat.opacity, pane,
  };
  // Drawn areas clip on the server (GEOMETRY); Agro_Structures fields clip on the map (pane clip-path).
  if (sat.aoiMode === 'drawn' && sat.clip && sat.wkt) opts.geometry = sat.wkt;
  return L.tileLayer.wms(WMS_URL, opts);
}

/**
 * Inside the Leaflet map: the satellite image (index), the second date for the
 * compare swipe, the AOI outline and the AOI drawing tool.
 * Satellite panes sit under the GIS layers so fields stay clickable on top.
 */
export default function SatelliteMapLayers({ sat, clipFeatures = null }) {
  const map = useMap();
  const swipeRef = useRef(sat.compare.swipe);
  swipeRef.current = sat.compare.swipe;

  // Main image.
  useEffect(() => {
    if (!sat.ready || !sat.show) return undefined;
    ensurePane(map, 'satellite', 350);
    const layer = wmsLayer(sat, sat.time, 'satellite').addTo(map);
    return () => { layer.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sat.ready, sat.show, sat.tileKey, sat.index, sat.time, sat.maxcc, sat.clip, sat.wkt, sat.aoiMode]);

  // Opacity changes without reloading tiles.
  useEffect(() => {
    map.eachLayer((l) => { if (l.wmsParams && l.options.pane?.startsWith('satellite')) l.setOpacity(sat.opacity); });
  }, [map, sat.opacity]);

  // Compare: the second date on its own pane, clipped by the swipe position.
  useEffect(() => {
    if (!sat.ready || !sat.show || !sat.compare.on || !sat.compare.date) return undefined;
    const pane = ensurePane(map, 'satellite-compare', 351);
    const layer = wmsLayer(sat, `${sat.compare.date}/${sat.compare.date}`, 'satellite-compare').addTo(map);
    const rtl = document.documentElement.dir === 'rtl';
    const clipPane = () => {
      const size = map.getSize();
      const nw = map.containerPointToLayerPoint([0, 0]);
      const se = map.containerPointToLayerPoint(size);
      const split = nw.x + (size.x * swipeRef.current) / 100;
      // Date B on the right side of the handle (left side in Arabic).
      pane.style.clip = rtl
        ? `rect(${nw.y}px, ${split}px, ${se.y}px, ${nw.x}px)`
        : `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${split}px)`;
    };
    clipPane();
    map.on('move zoom resize', clipPane);
    const onSwipe = () => clipPane();
    window.addEventListener('agrocloud:satellite-swipe', onSwipe);
    return () => {
      map.off('move zoom resize', clipPane);
      window.removeEventListener('agrocloud:satellite-swipe', onSwipe);
      layer.remove();
      pane.style.clip = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sat.ready, sat.show, sat.compare.on, sat.compare.date, sat.tileKey, sat.index, sat.maxcc, sat.clip, sat.wkt, sat.aoiMode]);

  useEffect(() => { window.dispatchEvent(new Event('agrocloud:satellite-swipe')); }, [sat.compare.swipe]);

  // Agro_Structures mode: show the image only inside the chosen fields (PIVOT, Farm Plots).
  // The satellite panes get a CSS clip-path drawn from the fields' shapes in layer pixels,
  // redrawn after each zoom; fields outside the view (with a margin) are skipped.
  useEffect(() => {
    const on = sat.aoiMode === 'structures' && sat.structClip && sat.show && clipFeatures;
    const panes = ['satellite', 'satellite-compare'].map((n) => map.getPane(n)).filter(Boolean);
    if (!on) { panes.forEach((p) => { p.style.clipPath = ''; }); return undefined; }
    const draw = () => {
      const view = map.getBounds().pad(0.5);
      let d = '';
      clipFeatures.forEach((f) => {
        allRings(f).forEach((ring) => {
          if (!ring || ring.length < 4) return;
          if (!ring.some(([lng, lat]) => view.contains([lat, lng]))) return;
          ring.forEach(([lng, lat], i) => {
            const pt = map.latLngToLayerPoint([lat, lng]);
            d += `${i ? 'L' : 'M'}${Math.round(pt.x)} ${Math.round(pt.y)}`;
          });
          d += 'Z';
        });
      });
      const value = d ? `path('${d}')` : 'path("M0 0Z")';
      ['satellite', 'satellite-compare'].forEach((n) => { const p = map.getPane(n); if (p) p.style.clipPath = value; });
    };
    draw();
    map.on('zoomend moveend viewreset layeradd', draw);
    return () => {
      map.off('zoomend moveend viewreset layeradd', draw);
      ['satellite', 'satellite-compare'].forEach((n) => { const p = map.getPane(n); if (p) p.style.clipPath = ''; });
    };
  }, [map, sat.aoiMode, sat.structClip, sat.show, clipFeatures]);

  // AOI outline (the chosen field, or the active drawn area).
  useEffect(() => {
    if (!sat.aoi) return undefined;
    const color = sat.aoiMode === 'drawn' ? '#2f5f8a' : '#ffd400';
    const layer = L.geoJSON(sat.aoi, { style: { color, weight: 2.5, dashArray: '6 4', fill: false }, interactive: false }).addTo(map);
    return () => { layer.remove(); };
  }, [map, sat.aoi, sat.aoiMode]);

  // My areas: every visible one, outlined (the active one is drawn above).
  useEffect(() => {
    if (sat.aoiMode !== 'drawn') return undefined;
    const shown = sat.myAreas.filter((a) => a.visible && a.id !== sat.activeArea);
    if (!shown.length) return undefined;
    const layer = L.geoJSON({ type: 'FeatureCollection', features: shown.map((a) => a.feature) }, {
      style: { color: '#2f5f8a', weight: 1.5, dashArray: '5 5', fillColor: '#2f5f8a', fillOpacity: 0.08 }, interactive: false,
    }).addTo(map);
    return () => { layer.remove(); };
  }, [map, sat.aoiMode, sat.myAreas, sat.activeArea]);

  // Draw on the map (leaflet-draw, loaded on demand): polygon, rectangle or circle.
  useEffect(() => {
    if (!sat.drawing) return undefined;
    const shape = typeof sat.drawing === 'string' ? sat.drawing : 'polygon';
    let handler = null;
    let cancelled = false;
    let onCreated = null;
    (async () => {
      window.L = L;
      try { await import('leaflet-draw'); } catch { sat.setDrawing(false); return; }
      if (cancelled || !L.Draw?.Polygon) return;
      const style = { color: '#2f5f8a', weight: 2 };
      handler = shape === 'rectangle' ? new L.Draw.Rectangle(map, { shapeOptions: style, showArea: false })
        : shape === 'circle' ? new L.Draw.Circle(map, { shapeOptions: style, showRadius: true })
          : new L.Draw.Polygon(map, { allowIntersection: false, showArea: true, shapeOptions: style });
      onCreated = (e) => {
        let feature;
        if (shape === 'circle') {
          const c = e.layer.getLatLng();
          feature = circleFeature([c.lng, c.lat], e.layer.getRadius(), 'Drawn AOI');
        } else {
          const ring = e.layer.getLatLngs()[0].map((ll) => [ll.lng, ll.lat]);
          feature = ringToFeature(ring, 'Drawn AOI');
        }
        if (sat.aoiMode === 'drawn' && sat.addArea) sat.addArea(feature); else sat.setAoi(feature);
        sat.setDrawing(false);
      };
      map.on(L.Draw.Event.CREATED, onCreated);
      handler.enable();
    })();
    return () => {
      cancelled = true;
      if (onCreated && L.Draw?.Event) map.off(L.Draw.Event.CREATED, onCreated);
      if (handler) handler.disable();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sat.drawing]);

  return null;
}
