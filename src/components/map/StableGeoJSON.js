import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * A GeoJSON layer that is created once per dataset (`dataKey`) and then only
 * restyled. Re-creating a layer on every hover or selection (a changing React
 * key) re-projects its shapes, and when that happens during a zoom or pan
 * animation the shapes land in the wrong place and look like they move off
 * their fields. Styles, labels and handlers update in place here.
 *
 * style(feature)   -> Leaflet path options
 * label(feature)   -> null | { html, permanent, direction, className, sticky }
 * popup(feature)   -> null | html string (built when opened)
 * onClick / onHover(feature | null)
 */
/** Hide permanent labels that would overlap one drawn before them (like ArcGIS label placement). */
function declutterLabels(layer) {
  const placed = [];
  layer.eachLayer((lyr) => {
    const tip = lyr.getTooltip && lyr.getTooltip();
    const el = tip && tip.options.permanent && tip.getElement && tip.getElement();
    if (!el) return;
    el.style.visibility = '';
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const hit = placed.some((p) => r.left < p.right + 2 && r.right > p.left - 2 && r.top < p.bottom + 1 && r.bottom > p.top - 1);
    if (hit) el.style.visibility = 'hidden'; else placed.push(r);
  });
}

export default function StableGeoJSON({ data, dataKey, style, label, popup, onClick, onHover, interactive = true, declutter = false }) {
  const map = useMap();
  const layerRef = useRef(null);
  const props = useRef({});
  props.current = { style, label, popup, onClick, onHover };

  useEffect(() => {
    if (!data) return undefined;
    const layer = L.geoJSON(data, {
      interactive,
      style: (ft) => (props.current.style ? props.current.style(ft) : {}),
      onEachFeature: (ft, lyr) => {
        if (!interactive) return;
        lyr.on('click', (e) => { if (e.originalEvent) L.DomEvent.stopPropagation(e); props.current.onClick?.(ft, lyr); });
        lyr.on('mouseover', () => props.current.onHover?.(ft));
        lyr.on('mouseout', () => props.current.onHover?.(null));
        if (props.current.popup) lyr.bindPopup(() => props.current.popup?.(ft) || '');
      },
    }).addTo(map);
    layerRef.current = layer;
    const tidy = () => { if (declutter) declutterLabels(layer); };
    map.on('zoomend moveend', tidy);
    return () => { map.off('zoomend moveend', tidy); map.removeLayer(layer); layerRef.current = null; };
  }, [map, dataKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restyle and relabel in place after every render (cheap; only changed labels are rebound).
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.eachLayer((lyr) => {
      const ft = lyr.feature;
      if (style && lyr.setStyle) lyr.setStyle(style(ft));
      const lb = label ? label(ft) : null;
      const sig = lb ? `${lb.permanent ? 1 : 0}|${lb.className || ''}|${lb.html}` : '';
      if (lyr._agroLabel === sig) return;
      lyr._agroLabel = sig;
      lyr.unbindTooltip();
      if (lb) {
        lyr.bindTooltip(lb.html, {
          permanent: !!lb.permanent, sticky: !lb.permanent && lb.sticky !== false, direction: lb.direction || 'center',
          className: lb.className || '', interactive: false, opacity: 1,
        });
      }
    });
    if (declutter) requestAnimationFrame(() => { if (layerRef.current === layer) declutterLabels(layer); });
  });

  return null;
}
