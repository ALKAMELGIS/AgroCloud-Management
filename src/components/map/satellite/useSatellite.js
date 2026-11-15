import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from './satelliteApi';
import { aoiToWkt } from './aoi';

const KEY = 'agrocloud_gis_satellite';
const AREAS_KEY = 'agrocloud_my_aois';
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));

function readSaved() {
  try { return JSON.parse(window.localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

/** Shared state of the satellite tools on GIS Map. */
export default function useSatellite() {
  const saved = useMemo(readSaved, []);
  const [status, setStatus] = useState({ loaded: false, configured: false });
  const [indices, setIndices] = useState([]);
  const [tileKey, setTileKey] = useState(null);
  const [index, setIndex] = useState(saved.index || 'NDVI');
  const [from, setFrom] = useState(saved.from || daysAgo(30));
  const [to, setTo] = useState(saved.to || iso(new Date()));
  const [maxcc, setMaxcc] = useState(saved.maxcc ?? 20);
  const [opacity, setOpacity] = useState(saved.opacity ?? 0.85);
  const [show, setShow] = useState(Boolean(saved.show));
  const [scene, setScene] = useState(null); // one acquisition date, or null = best of the period
  const [aoi, setAoi] = useState(saved.aoi || null);
  const [clip, setClip] = useState(Boolean(saved.clip));
  const [drawing, setDrawing] = useState(false);
  const [compare, setCompare] = useState({ on: false, date: null, swipe: 50 });
  // AOI comes from one of two sources: the system's own fields (Agro_Structures,
  // only PIVOT 1006 and Farm Plots 1007), or areas the user draws (their own layer).
  const [aoiMode, setAoiMode] = useState(saved.aoiMode === 'drawn' ? 'drawn' : 'structures');
  const [structTypes, setStructTypes] = useState(Array.isArray(saved.structTypes) ? saved.structTypes : [1006, 1007]);
  const [structClip, setStructClip] = useState(saved.structClip ?? true);
  // "Area I draw" can also show the index inside the Agro_Structures fields (PIVOT, Farm Plots).
  const [withStructures, setWithStructures] = useState(saved.withStructures ?? false);
  const [myAreas, setMyAreas] = useState(() => {
    try { const v = JSON.parse(window.localStorage.getItem(AREAS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const [activeArea, setActiveArea] = useState(saved.activeArea || null);

  useEffect(() => {
    try { window.localStorage.setItem(KEY, JSON.stringify({ index, from, to, maxcc, opacity, show, aoi, clip, aoiMode, structTypes, structClip, withStructures, activeArea })); } catch { /* ignore */ }
  }, [index, from, to, maxcc, opacity, show, aoi, clip, aoiMode, structTypes, structClip, withStructures, activeArea]);
  useEffect(() => {
    try { window.localStorage.setItem(AREAS_KEY, JSON.stringify(myAreas)); } catch { /* ignore */ }
  }, [myAreas]);

  useEffect(() => {
    let alive = true;
    api.getStatus().then((s) => { if (alive) setStatus({ loaded: true, configured: Boolean(s?.configured), service: s?.service, label: s?.label }); })
      .catch(() => { if (alive) setStatus({ loaded: true, configured: false }); });
    api.getIndices().then((list) => { if (alive && Array.isArray(list)) setIndices(list); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // A signed key for map tiles, renewed before it expires (12 h).
  useEffect(() => {
    if (!status.configured) return undefined;
    let timer;
    const load = () => api.getTileKey().then((k) => {
      setTileKey(k?.key || null);
      const ms = k?.expiresAt ? new Date(k.expiresAt).getTime() - Date.now() - 10 * 60000 : 3600000;
      timer = setTimeout(load, Math.max(ms, 60000));
    }).catch(() => setTileKey(null));
    load();
    return () => clearTimeout(timer);
  }, [status.configured]);

  const current = indices.find((i) => i.key === index) || null;
  const time = scene ? `${scene}/${scene}` : `${from}/${to}`;
  const wkt = useMemo(() => (aoi ? aoiToWkt(aoi) : null), [aoi]);
  const clearAoi = useCallback(() => { setAoi(null); setClip(false); setActiveArea(null); }, []);

  // My areas: add (and make it the AOI), select, show / hide, rename, delete.
  const addArea = useCallback((feature) => {
    const id = `a${Date.now().toString(36)}`;
    const given = feature?.properties?.name;
    const ar = typeof document !== 'undefined' && document.documentElement.lang === 'ar';
    const name = given && given !== 'Drawn AOI' ? given : `${ar ? 'منطقة' : 'Area'} ${myAreas.length + 1}`;
    const f = { ...feature, properties: { ...(feature.properties || {}), name } };
    setMyAreas((list) => [...list, { id, name, feature: f, visible: true }]);
    setActiveArea(id); setAoi(f); setClip(true);
  }, [myAreas.length]);
  const selectArea = useCallback((id) => {
    const a = myAreas.find((x) => x.id === id);
    if (!a) return;
    setActiveArea(id); setAoi(a.feature);
  }, [myAreas]);
  const updateArea = useCallback((id, patch) => {
    setMyAreas((list) => list.map((a) => (a.id === id ? { ...a, ...patch, feature: patch.name ? { ...a.feature, properties: { ...a.feature.properties, name: patch.name } } : a.feature } : a)));
  }, []);
  const removeArea = useCallback((id) => {
    setMyAreas((list) => list.filter((a) => a.id !== id));
    if (activeArea === id) { setActiveArea(null); setAoi(null); setClip(false); }
  }, [activeArea]);

  return {
    status, indices, current, tileKey,
    index, setIndex, from, setFrom, to, setTo, maxcc, setMaxcc, opacity, setOpacity, show, setShow,
    scene, setScene, time, aoi, setAoi, clearAoi, wkt, clip, setClip, drawing, setDrawing, compare, setCompare,
    aoiMode, setAoiMode, structTypes, setStructTypes, structClip, setStructClip, withStructures, setWithStructures,
    myAreas, activeArea, addArea, selectArea, updateArea, removeArea,
    ready: status.configured && Boolean(tileKey),
  };
}
