import L from 'leaflet';

/* A short glowing flash where the map lands, so the picked place is easy to see. */
let flashCss = false;
function ensureFlashCss() {
  if (flashCss || typeof document === 'undefined') return;
  flashCss = true;
  const st = document.createElement('style');
  st.textContent = `
@keyframes agroFlashShape { 0%,100% { stroke-opacity: 1; fill-opacity: .28 } 50% { stroke-opacity: .35; fill-opacity: .05 } }
@keyframes agroFlashRing { 0% { transform: scale(.4); opacity: .95 } 100% { transform: scale(2.6); opacity: 0 } }
.agro-flash-shape { animation: agroFlashShape .7s ease-in-out 4; filter: drop-shadow(0 0 6px #fff59d) drop-shadow(0 0 14px #ffd54f); }
.agro-flash-pin { position: relative; width: 24px; height: 24px; }
.agro-flash-pin i { position: absolute; inset: 0; border-radius: 50%; border: 3px solid #ffd54f; box-shadow: 0 0 12px 2px rgba(255,213,79,.9); animation: agroFlashRing 1.2s ease-out infinite; }
.agro-flash-pin i:nth-child(2) { animation-delay: .4s } .agro-flash-pin i:nth-child(3) { animation-delay: .8s }
.agro-flash-pin b { position: absolute; left: 7px; top: 7px; width: 10px; height: 10px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 3px #ffb300, 0 0 14px 4px rgba(255,213,79,.95); }
@media (prefers-reduced-motion: reduce) { .agro-flash-shape, .agro-flash-pin i { animation: none } }`;
  document.head.appendChild(st);
}

/** Fly to a ring ([lng, lat] pairs) and flash it for a few seconds. */
export function flyAndFlash(map, ring) {
  if (!map || !ring || !ring.length) return;
  ensureFlashCss();
  const latlngs = ring.map(([lng, lat]) => [lat, lng]);
  const bounds = L.latLngBounds(latlngs);
  const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const flash = () => {
    const shape = L.polygon(latlngs, { color: '#ffd54f', weight: 4, fillColor: '#fff59d', fillOpacity: 0.28, className: 'agro-flash-shape', interactive: false }).addTo(map);
    const pin = L.marker(bounds.getCenter(), { interactive: false, keyboard: false, icon: L.divIcon({ className: '', html: '<div class="agro-flash-pin"><i></i><i></i><i></i><b></b></div>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(map);
    setTimeout(() => { map.removeLayer(shape); map.removeLayer(pin); }, 3600);
  };
  const opts = { padding: [48, 48], maxZoom: 17 };
  if (reduce) { map.fitBounds(bounds, opts); flash(); return; }
  map.once('moveend', flash);
  map.flyToBounds(bounds, { ...opts, duration: 1.1 });
}
