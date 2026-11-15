import { useEffect, useMemo, useRef } from 'react';
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

/*
 * Satellite tiles clipped to fields inside each tile: the image is drawn on a
 * canvas through the fields' outlines, so the clip is exact at every zoom level
 * and moves with the tiles while zooming and panning (no lag, no offset).
 */
const ClippedWMS = L.TileLayer.WMS.extend({
  createTile(coords, done) {
    const size = this.getTileSize();
    const canvas = document.createElement('canvas');
    canvas.width = size.x; canvas.height = size.y;
    const img = new Image();
    const draw = () => {
      const ctx = canvas.getContext('2d');
      const origin = coords.scaleBy(size);
      const nw = this._map.unproject(origin, coords.z);
      const se = this._map.unproject(origin.add(size), coords.z);
      const tb = L.latLngBounds(se, nw);
      ctx.beginPath();
      let any = false;
      (this.options.clipShapes || []).forEach((sh) => {
        if (!sh.bounds.intersects(tb)) return;
        sh.rings.forEach((ring) => {
          ring.forEach(([lng, lat], i) => {
            const pt = this._map.project([lat, lng], coords.z).subtract(origin);
            if (i) ctx.lineTo(pt.x, pt.y); else ctx.moveTo(pt.x, pt.y);
          });
          ctx.closePath();
          any = true;
        });
      });
      if (any) { ctx.save(); ctx.clip(); ctx.drawImage(img, 0, 0, size.x, size.y); ctx.restore(); }
      done(null, canvas);
    };
    img.onload = draw;
    img.onerror = () => done(null, canvas);
    canvas._img = img;
    img.src = this.getTileUrl(coords);
    return canvas;
  },
  // Leaflet's own version drops every tile of another zoom whose <img> is not
  // "complete"; a canvas has no such flag, so it dropped the loaded tiles too and
  // the image blinked out at each zoom step. Only tiles still loading are dropped.
  _abortLoading() {
    Object.keys(this._tiles).forEach((key) => {
      const t = this._tiles[key];
      if (t.coords.z === this._tileZoom || t.loaded) return;
      if (t.el._img) { t.el._img.onload = null; t.el._img.onerror = null; t.el._img.src = ''; }
      L.DomUtil.remove(t.el);
      delete this._tiles[key];
      this.fire('tileabort', { tile: t.el, coords: t.coords });
    });
  },
});

/** Outlines and bounds of the clip fields, prepared once per change. */
function clipShapes(features) {
  return (features || []).map((f) => {
    const rings = allRings(f).filter((r) => r && r.length > 3);
    if (!rings.length) return null;
    const pts = rings.flat();
    return { rings, bounds: L.latLngBounds(pts.map(([lng, lat]) => [lat, lng])) };
  }).filter(Boolean);
}

function wmsLayer(sat, time, pane, shapes) {
  const opts = {
    layers: 'S2', format: 'image/png', transparent: true, version: '1.3.0', tileSize: 512, maxZoom: 20,
    // Satellite tiles take a second or more: keep the loaded ones on screen while zooming,
    // and ask for the new level only once the zoom settles (no blank frames, no wasted requests).
    updateWhenZooming: false, keepBuffer: 4,
    k: sat.tileKey, index: sat.index, time, maxcc: sat.maxcc, opacity: sat.opacity, pane,
  };
  // Drawn areas clip on the server (GEOMETRY); Agro_Structures fields clip inside each tile.
  // A drawn area always clips: the index shows only inside it.
  if (sat.aoiMode === 'drawn' && sat.wkt) opts.geometry = sat.wkt;
  if (shapes) return new ClippedWMS(WMS_URL, { ...opts, clipShapes: shapes });
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
  const shapes = useMemo(() => (sat.aoiMode === 'structures' && sat.structClip && clipFeatures ? clipShapes(clipFeatures) : null),
    [sat.aoiMode, sat.structClip, clipFeatures]);
  swipeRef.current = sat.compare.swipe;

  // Main image.
  useEffect(() => {
    if (!sat.ready || !sat.show) return undefined;
    // "Area I draw": nothing until an area is drawn (or picked from My areas).
    if (sat.aoiMode === 'drawn' && !sat.wkt) return undefined;
    ensurePane(map, 'satellite', 350);
    const layer = wmsLayer(sat, sat.time, 'satellite', shapes).addTo(map);
    return () => { layer.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sat.ready, sat.show, sat.tileKey, sat.index, sat.time, sat.maxcc, sat.clip, sat.wkt, sat.aoiMode, shapes]);

  // Opacity changes without reloading tiles.
  useEffect(() => {
    map.eachLayer((l) => { if (l.wmsParams && l.options.pane?.startsWith('satellite')) l.setOpacity(sat.opacity); });
  }, [map, sat.opacity]);

  // Compare: the second date on its own pane, clipped by the swipe position.
  useEffect(() => {
    if (!sat.ready || !sat.show || !sat.compare.on || !sat.compare.date) return undefined;
    if (sat.aoiMode === 'drawn' && !sat.wkt) return undefined;
    const pane = ensurePane(map, 'satellite-compare', 351);
    const layer = wmsLayer(sat, `${sat.compare.date}/${sat.compare.date}`, 'satellite-compare', shapes).addTo(map);
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
  }, [map, sat.ready, sat.show, sat.compare.on, sat.compare.date, sat.tileKey, sat.index, sat.maxcc, sat.clip, sat.wkt, sat.aoiMode, shapes]);

  useEffect(() => { window.dispatchEvent(new Event('agrocloud:satellite-swipe')); }, [sat.compare.swipe]);

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
