import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import {
  Box, Typography, TextField, InputAdornment, MenuItem, Select, FormControl, InputLabel, Button, Alert,
  ButtonBase, Collapse, Divider, Checkbox, FormControlLabel, CircularProgress, useMediaQuery, useTheme,
} from '@mui/material';
import {
  AccountTreeOutlined as TreeIcon, InfoOutlined as InfoIcon, MapOutlined as BasemapIcon,
  PentagonOutlined as PolygonIcon, CropSquareOutlined as RectIcon, RadioButtonUncheckedOutlined as CircleIcon,
  EditLocationAltOutlined as VertexIcon, OpenWithOutlined as MoveIcon, RotateRightOutlined as RotateIcon,
  CenterFocusStrongOutlined as SnapIcon, UndoOutlined as UndoIcon, RedoOutlined as RedoIcon,
  FileUploadOutlined as ImportIcon, DeleteOutlineOutlined as DeleteIcon, SaveOutlined as SaveIcon,
  CloseOutlined as DiscardIcon, SearchOutlined as SearchIcon, ChevronRightRounded as ChevronIcon,
  ExpandMoreRounded as ExpandIcon,
} from '@mui/icons-material';
import { MapWorkspace, useMapWorkspace, useBasemap, BasemapList } from '../map/MapPanel';
import { BASEMAPS } from '../../utils/mapBasemaps';
import { MapLifecycle } from '../../utils/leafletSafe';
import useFillHeight from '../../hooks/useFillHeight';
import { apiRequest } from '../../utils/api';
import { useNotification } from '../../contexts/NotificationContext';
import { useIsArabic } from '../../i18n/shellLabels';
import ArcgisImportDialog from './ArcgisImportDialog';
import { areaHa, boundsOf, circlePolygon, readBoundaryFile, toMultiPolygon, GEO_CLASSES } from './geoUtils';

/**
 * Map editor for zones, sites, farm areas and fields: the system's own shapes,
 * with a permanent KeyID, a subtype and an edit history. Works like an edit
 * session in ArcGIS Pro: pick a feature, draw or modify its shape with snapping,
 * undo / redo, then Save (the server checks the rules) or Discard.
 */

const ACCENT = '#1f7a4d';
const EDIT_STYLE = { color: '#c4761a', weight: 2.5, fillColor: '#c4761a', fillOpacity: 0.15, dashArray: null };
const CLASS_LINE = { zone: { weight: 2, dashArray: '8 6', fillOpacity: 0 }, site: { weight: 2, dashArray: '4 4', fillOpacity: 0.04 }, farm_area: { weight: 1.5, fillOpacity: 0.12 }, field: { weight: 1.5, fillOpacity: 0.35 } };

function multi(g) {
  if (!g) return null;
  return g.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [g.coordinates] } : g;
}

/** Draw / edit tools bound to the Leaflet map (leaflet-geoman). */
function EditLayer({ geometry, mode, snap, onChange, onDrawn }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!map.pm) return;
    map.pm.setGlobalOptions({
      snappable: snap, snapDistance: 18, allowSelfIntersection: false,
      pathOptions: EDIT_STYLE, templineStyle: { color: EDIT_STYLE.color }, hintlineStyle: { color: EDIT_STYLE.color, dashArray: [5, 5] },
    });
  }, [map, snap]);

  // Drawing a new shape.
  useEffect(() => {
    if (!map.pm || !mode?.startsWith('draw-')) return undefined;
    const shape = { 'draw-polygon': 'Polygon', 'draw-rectangle': 'Rectangle', 'draw-circle': 'Circle' }[mode];
    const onCreate = (e) => {
      let g;
      if (e.shape === 'Circle') {
        const c = e.layer.getLatLng();
        g = circlePolygon([c.lng, c.lat], e.layer.getRadius());
      } else {
        g = toMultiPolygon(e.layer.toGeoJSON());
      }
      map.removeLayer(e.layer);
      if (g) onDrawn(g);
    };
    map.on('pm:create', onCreate);
    map.pm.enableDraw(shape, { snappable: snap, snapDistance: 18, continueDrawing: false, finishOn: shape === 'Polygon' ? 'dblclick' : null });
    return () => {
      map.off('pm:create', onCreate);
      try { map.pm.disableDraw(); } catch { /* map gone */ }
    };
  }, [map, mode, snap, onDrawn]);

  // The working shape (being edited).
  useEffect(() => {
    if (!geometry) return undefined;
    const layer = L.geoJSON(geometry, { style: () => EDIT_STYLE });
    layer.addTo(map);
    layerRef.current = layer;
    const collect = () => onChange(toMultiPolygon(layer.toGeoJSON()));
    layer.eachLayer((l) => {
      if (!l.pm) return;
      if (mode === 'edit') l.pm.enable({ snappable: snap, snapDistance: 18, allowSelfIntersection: false });
      if (mode === 'move') l.pm.enableLayerDrag();
      if (mode === 'rotate') l.pm.enableRotate();
      l.on('pm:edit', collect);
      l.on('pm:dragend', collect);
      l.on('pm:rotateend', collect);
    });
    return () => {
      layer.eachLayer((l) => {
        try { l.pm?.disable(); l.pm?.disableLayerDrag(); l.pm?.disableRotate(); } catch { /* ignore */ }
        l.off('pm:edit pm:dragend pm:rotateend');
      });
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, geometry, mode, snap, onChange]);

  return null;
}

/** Fit the map to a shape, keeping it clear of the phone sheet. */
function FitTo({ bounds, fitKey, bottomPad }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    try { map.fitBounds(bounds, { paddingTopLeft: [24, 24], paddingBottomRight: [24, 24 + (bottomPad || 0)], maxZoom: 18 }); } catch { /* ignore */ }
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function GeoEditor({ canEdit, canImport = false }) {
  const notify = useNotification();
  const isAr = useIsArabic();
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [boxRef, height] = useFillHeight({ min: 420 });
  const ws = useMapWorkspace('geo.workspace', 'features');
  const [basemap, setBasemap] = useBasemap('geo.basemap', 'satellite');

  const [layers, setLayers] = useState(null);
  const [model, setModel] = useState({ subtypes: [], domains: [] });
  const [selected, setSelected] = useState(null); // { cls, id }
  const [visible, setVisible] = useState({ zone: true, site: true, farm_area: true, field: true });
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState({});
  const [session, setSession] = useState(null); // { cls, id, original, geometry, undo, redo, operation }
  const [mode, setMode] = useState(null);
  const [snap, setSnap] = useState(true);
  const [check, setCheck] = useState(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState(null);
  const [fit, setFit] = useState({ key: 0, bounds: null });
  const fileRef = useRef(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    const [l, m] = await Promise.all([apiRequest('/geo/layers'), apiRequest('/geo/model')]);
    setLayers(l); setModel(m || { subtypes: [], domains: [] });
    return l;
  }, []);
  const loadAndFit = useCallback(() => {
    load().then((l) => {
      const all = GEO_CLASSES.flatMap((c) => l[c.list] || []).filter((x) => x.geometry);
      if (!all.length) return;
      // Open the branches that already hold drawn shapes, down to farm areas.
      const parents = {};
      GEO_CLASSES.forEach((c) => (l[c.list] || []).forEach((x) => { parents[x.id] = x.parent_id; }));
      const opened = {};
      all.forEach((x) => { let p = parents[x.id]; while (p) { opened[p] = true; p = parents[p]; } });
      setOpen((o) => ({ ...opened, ...o }));
      let b = null;
      all.forEach((x) => { const bb = boundsOf(x.geometry); b = b ? [[Math.min(b[0][0], bb[0][0]), Math.min(b[0][1], bb[0][1])], [Math.max(b[1][0], bb[1][0]), Math.max(b[1][1], bb[1][1])]] : bb; });
      setFit((f) => ({ key: f.key + 1, bounds: b }));
    }).catch((e) => notify.error(e.message));
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadAndFit(); }, [loadAndFit]);

  const byId = useMemo(() => {
    const m = {};
    if (layers) GEO_CLASSES.forEach((c) => (layers[c.list] || []).forEach((x) => { m[x.id] = { ...x, cls: c.key }; }));
    return m;
  }, [layers]);
  const subtypeOf = useCallback((cls, code) => model.subtypes.find((s) => s.class_key === cls && s.code === code), [model]);
  const current = selected ? byId[selected.id] : null;
  const editing = !!session;
  const dirty = editing && JSON.stringify(session.geometry) !== JSON.stringify(session.original);

  const select = (cls, id) => {
    if (dirty && session.id !== id) { notify.warning(isAr ? 'احفظ التعديل أو تجاهله أولاً' : 'Save or discard the edit first'); return; }
    if (editing && session.id !== id) { setSession(null); setMode(null); }
    setSelected({ cls, id });
    setHistory(null);
    const g = byId[id]?.geometry;
    if (g) setFit((f) => ({ key: f.key + 1, bounds: boundsOf(g) }));
    if (ws.active !== 'feature' && (!isPhone || ws.active)) ws.setActive('feature');
  };

  // Live rule check while editing (debounced).
  useEffect(() => {
    if (!session?.geometry) { setCheck(null); return undefined; }
    const g = multi(session.geometry);
    setCheck((c) => ({ ...(c || {}), pending: true, area_ha: areaHa(g) }));
    const t = setTimeout(() => {
      apiRequest(`/geo/${session.cls}/${session.id}/validate`, { method: 'POST', body: JSON.stringify({ geometry: g }) })
        .then((r) => setCheck({ ...r, pending: false }))
        .catch((e) => setCheck({ ok: false, issues: [{ code: 'invalid', message: e.message }], pending: false }));
    }, 400);
    return () => clearTimeout(t);
  }, [session?.geometry, session?.cls, session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = (nextMode) => {
    if (!current) { notify.info(isAr ? 'اختر عنصراً من القائمة أو الخريطة أولاً' : 'Select a feature in the list or on the map first'); return; }
    if (!nextMode.startsWith('draw-') && !(session?.geometry || current.geometry)) {
      notify.info(isAr ? 'هذا العنصر بلا شكل بعد، ارسمه أولاً' : 'This feature has no shape yet: draw it first');
      return;
    }
    setSession((s) => s || { cls: current.cls, id: current.id, original: current.geometry || null, geometry: current.geometry || null, undo: [], redo: [], operation: current.geometry ? 'edit' : 'draw' });
    setMode((m) => (m === nextMode ? null : nextMode));
  };

  const setGeometry = useCallback((g, operation) => {
    setSession((s) => (s ? { ...s, geometry: g, undo: [...s.undo, s.geometry], redo: [], operation: operation || s.operation } : s));
  }, []);
  const onDrawn = useCallback((g) => { setGeometry(g, 'draw'); setMode('edit'); }, [setGeometry]);
  const onChange = useCallback((g) => setGeometry(g), [setGeometry]);
  const undo = () => setSession((s) => (s && s.undo.length ? { ...s, geometry: s.undo[s.undo.length - 1], undo: s.undo.slice(0, -1), redo: [s.geometry, ...s.redo] } : s));
  const redo = () => setSession((s) => (s && s.redo.length ? { ...s, geometry: s.redo[0], redo: s.redo.slice(1), undo: [...s.undo, s.geometry] } : s));
  const discard = () => { setSession(null); setMode(null); setCheck(null); };

  const save = async () => {
    if (!session?.geometry) return;
    if (check && !check.ok) { notify.error(check.issues?.map((i) => i.message).join(' ') || 'Check the shape'); return; }
    setSaving(true);
    try {
      await apiRequest(`/geo/${session.cls}/${session.id}/geometry`, { method: 'PUT', body: JSON.stringify({ geometry: multi(session.geometry), operation: session.operation }) });
      await load();
      notify.success(isAr ? 'تم حفظ الشكل' : 'Shape saved');
      discard();
    } catch (e) {
      notify.error(e.message);
    } finally { setSaving(false); }
  };

  const removeShape = async () => {
    if (!current?.geometry) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(isAr ? `حذف شكل ${current.key_id}؟ السجل والاستمارات تبقى.` : `Delete the shape of ${current.key_id}? The record and its forms stay.`)) return;
    try {
      await apiRequest(`/geo/${current.cls}/${current.id}/geometry`, { method: 'DELETE' });
      await load(); discard();
      notify.success(isAr ? 'تم حذف الشكل' : 'Shape deleted');
    } catch (e) { notify.error(e.message); }
  };

  const changeSubtype = async (code) => {
    try {
      await apiRequest(`/geo/${current.cls}/${current.id}/subtype`, { method: 'PATCH', body: JSON.stringify({ subtypeCode: code === '' ? null : Number(code) }) });
      await load();
    } catch (e) { notify.error(e.message); }
  };

  const importFile = async (file) => {
    if (!file || !current) return;
    try {
      const g = await readBoundaryFile(file);
      if (!g) throw new Error(isAr ? 'لا يوجد مضلع في الملف' : 'No polygon found in the file');
      setSession((s) => s || { cls: current.cls, id: current.id, original: current.geometry || null, geometry: current.geometry || null, undo: [], redo: [], operation: 'import' });
      setGeometry(g, 'import');
      setMode('edit');
      setFit((f) => ({ key: f.key + 1, bounds: boundsOf(g) }));
    } catch (e) { notify.error(e.message || 'Could not read the file'); }
  };

  // Keyboard: Ctrl+Z / Ctrl+Y while editing, Esc leaves the current tool.
  useEffect(() => {
    if (!editing) return undefined;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      if (e.key === 'Escape' && mode) { e.stopPropagation(); setMode(null); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editing, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadHistory = async () => {
    if (!current) return;
    try { setHistory(await apiRequest(`/geo/${current.cls}/${current.id}/history`)); } catch (e) { setHistory([]); }
  };

  // ---- Feature tree ----------------------------------------------------------
  const tree = useMemo(() => {
    if (!layers) return [];
    const q = query.trim().toLowerCase();
    const match = (x) => !q || (x.name || '').toLowerCase().includes(q) || (x.key_id || '').toLowerCase().includes(q);
    const kids = (cls, parentId) => {
      const c = GEO_CLASSES.find((k) => k.key === cls);
      return (layers[c.list] || []).filter((x) => (parentId === null ? true : x.parent_id === parentId));
    };
    const build = (cls, parentId, depth) => {
      const idx = GEO_CLASSES.findIndex((k) => k.key === cls);
      const next = GEO_CLASSES[idx + 1]?.key;
      return kids(cls, parentId).map((x) => {
        const children = next ? build(next, x.id, depth + 1) : [];
        const self = match(x);
        if (!self && !children.length) return null;
        return { ...x, cls, depth, children, drawn: !!x.geometry || children.some((k) => k.drawn) };
      }).filter(Boolean).sort((a, b) => (b.drawn - a.drawn) || String(a.key_id || a.name).localeCompare(String(b.key_id || b.name)));
    };
    return build('zone', null, 0);
  }, [layers, query]);

  const renderNode = (n) => {
    const isOpen = query ? true : !!open[n.id];
    const sel = selected?.id === n.id;
    const st = subtypeOf(n.cls, n.subtype_code);
    return (
      <Box key={n.id} role="treeitem" aria-expanded={n.children.length ? isOpen : undefined} aria-selected={sel}>
        <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: sel ? 'action.selected' : 'transparent', boxShadow: sel ? `inset 2px 0 0 ${ACCENT}` : 'none', '&:hover': { bgcolor: sel ? 'action.selected' : 'action.hover' } }}>
          <Box sx={{ width: 8 + n.depth * 14, flexShrink: 0 }} />
          {n.children.length ? (
            <ButtonBase aria-label={isOpen ? 'Collapse' : 'Expand'} onClick={() => setOpen((o) => ({ ...o, [n.id]: !isOpen }))} sx={{ width: 24, height: 32, color: 'text.secondary' }}>
              {isOpen ? <ExpandIcon fontSize="small" /> : <ChevronIcon fontSize="small" sx={{ transform: (t) => (t.direction === 'rtl' ? 'scaleX(-1)' : 'none') }} />}
            </ButtonBase>
          ) : <Box sx={{ width: 24 }} />}
          <ButtonBase onClick={() => select(n.cls, n.id)} sx={{ flex: 1, minWidth: 0, minHeight: 32, justifyContent: 'flex-start', gap: 1.5, px: 1, textAlign: 'start' }}>
            <Box component="span" aria-hidden sx={{ width: 10, height: 10, flexShrink: 0, bgcolor: n.geometry ? (st?.fill_color || '#e8f2ec') : 'transparent', border: `1.5px solid ${n.geometry ? (st?.line_color || ACCENT) : '#9aa39d'}`, borderStyle: n.geometry ? 'solid' : 'dashed' }} />
            <Box component="span" translate="no" sx={{ fontSize: '0.6875rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}><bdi dir="ltr">{n.key_id || '—'}</bdi></Box>
            <Box component="span" sx={{ fontSize: '0.8125rem', fontWeight: sel ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
              {String(n.name || '').replace(/\s/g, '').toUpperCase() === String(n.key_id || '').toUpperCase() ? '' : n.name}
            </Box>
            <Box component="span" sx={{ fontSize: '0.6875rem', color: n.geometry ? 'text.secondary' : 'text.disabled', fontVariantNumeric: 'tabular-nums', flexShrink: 0, pr: 1 }}>
              {n.geometry ? `${Number(n.area_ha).toFixed(2)} ha` : (isAr ? 'غير مرسوم' : 'Not drawn')}
            </Box>
          </ButtonBase>
        </Box>
        {n.children.length > 0 && (
          <Collapse in={isOpen} unmountOnExit>{n.children.map(renderNode)}</Collapse>
        )}
      </Box>
    );
  };

  const counts = useMemo(() => {
    if (!layers) return { drawn: 0, total: 0 };
    const all = GEO_CLASSES.flatMap((c) => layers[c.list] || []);
    return { drawn: all.filter((x) => x.geometry).length, total: all.length };
  }, [layers]);

  const treePanel = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ p: 2, display: 'grid', gap: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <TextField
          size="small" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={isAr ? 'بحث بالاسم أو KeyID' : 'Search name or KeyID'}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          inputProps={{ 'aria-label': 'Search features' }}
        />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1 }}>
          {GEO_CLASSES.map((c) => (
            <FormControlLabel key={c.key} sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: '0.75rem' } }}
              control={<Checkbox size="small" checked={visible[c.key]} onChange={(e) => setVisible((v) => ({ ...v, [c.key]: e.target.checked }))} sx={{ p: 0.5 }} />}
              label={c.label} />
          ))}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
            {isAr ? `${counts.drawn} مرسوم من ${counts.total}` : `${counts.drawn} of ${counts.total} drawn`}
          </Typography>
          {canImport && (
            <Button size="small" startIcon={<ImportIcon />} onClick={() => setImportOpen(true)} disabled={editing}>
              {isAr ? 'استيراد من ArcGIS' : 'Import from ArcGIS'}
            </Button>
          )}
        </Box>
      </Box>
      <Box role="tree" aria-label="Zones, sites, farm areas and fields" sx={{ flex: 1, minHeight: 0, overflow: 'auto', py: 1 }}>
        {!layers ? <Box sx={{ p: 3 }}><CircularProgress size={20} /></Box> : tree.map(renderNode)}
      </Box>
    </Box>
  );

  const parent = current ? byId[current.parent_id] : null;
  const subtypes = current ? model.subtypes.filter((s) => s.class_key === current.cls) : [];
  const shownArea = editing ? (check?.area_ha ?? areaHa(multi(session.geometry))) : current?.area_ha;
  const featurePanel = !current ? (
    <Typography sx={{ p: 3, fontSize: '0.875rem', color: 'text.secondary' }}>
      {isAr ? 'اختر منطقة أو موقعاً أو منطقة مزرعة أو حقلاً من القائمة أو الخريطة.' : 'Select a zone, site, farm area or field in the list or on the map.'}
    </Typography>
  ) : (
    <Box sx={{ p: 3, display: 'grid', gap: 2.5 }}>
      <Box>
        <Typography component="h2" sx={{ fontSize: '0.9375rem', fontWeight: 600 }}>{current.name}</Typography>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }} translate="no">
          {(isAr ? { zone: 'منطقة', site: 'موقع', farm_area: 'منطقة مزرعة', field: 'حقل' } : { zone: 'Zone', site: 'Site', farm_area: 'Farm area', field: 'Field' })[current.cls]} · KeyID <bdi dir="ltr" style={{ color: 'inherit', fontWeight: 600 }}>{current.key_id || '—'}</bdi>
          {parent ? <> · <bdi dir="ltr">{parent.key_id}</bdi></> : null}
        </Typography>
      </Box>

      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', columnGap: 3, rowGap: 1, fontSize: '0.8125rem' }}>
        <Typography component="dt" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{isAr ? 'المساحة' : 'Area'}</Typography>
        <Typography component="dd" sx={{ m: 0, fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>{shownArea ? `${Number(shownArea).toFixed(4)} ha` : '—'}</Typography>
        <Typography component="dt" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{isAr ? 'الشكل' : 'Shape'}</Typography>
        <Typography component="dd" sx={{ m: 0, fontSize: '0.8125rem' }}>{current.geometry ? (isAr ? 'مرسوم' : 'Drawn') : (isAr ? 'غير مرسوم' : 'Not drawn')}</Typography>
      </Box>

      <FormControl size="small" fullWidth disabled={!canEdit}>
        <InputLabel id="geo-subtype">{isAr ? 'النوع الفرعي' : 'Subtype'}</InputLabel>
        <Select labelId="geo-subtype" label={isAr ? 'النوع الفرعي' : 'Subtype'} value={current.subtype_code ?? ''} onChange={(e) => changeSubtype(e.target.value)}>
          <MenuItem value=""><em>{isAr ? 'بدون' : 'None'}</em></MenuItem>
          {subtypes.map((s) => (
            <MenuItem key={s.code} value={s.code}>
              <Box component="span" aria-hidden sx={{ width: 10, height: 10, mr: 1.5, display: 'inline-block', bgcolor: s.fill_color, border: `1.5px solid ${s.line_color}` }} />
              <bdi dir="ltr" style={{ margin: '0 8px 0 0', color: 'var(--sheet-ink-3)' }}>{s.code}</bdi>{' '}{isAr ? s.name_ar : s.name_en}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {editing && (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <Divider />
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>{isAr ? 'جلسة تعديل' : 'Edit session'}</Typography>
          {check?.pending ? <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{isAr ? 'جارٍ التحقق…' : 'Checking…'}</Typography>
            : check && !check.ok ? (
              <Alert severity="error" sx={{ py: 0.5 }}>{check.issues.map((i) => <div key={i.code + i.message}>{i.message}</div>)}</Alert>
            ) : session.geometry ? (
              <Alert severity="success" sx={{ py: 0.5 }}>{isAr ? 'الشكل صالح: داخل حدوده وبلا تداخل' : 'Valid: inside its parent, no overlap'}</Alert>
            ) : (
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{isAr ? 'ارسم الشكل على الخريطة. انقر نقرتين لإنهاء المضلع.' : 'Draw the shape on the map. Double-click to finish a polygon.'}</Typography>
            )}
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} disabled={!dirty || saving || !session.geometry || check?.pending || (check && !check.ok)} onClick={save}>{isAr ? 'حفظ' : 'Save'}</Button>
            <Button variant="outlined" color="inherit" startIcon={<DiscardIcon />} onClick={discard}>{isAr ? 'تجاهل' : 'Discard'}</Button>
          </Box>
        </Box>
      )}

      {!editing && canEdit && (
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Button variant="contained" startIcon={current.geometry ? <VertexIcon /> : <PolygonIcon />} onClick={() => begin(current.geometry ? 'edit' : 'draw-polygon')}>
            {current.geometry ? (isAr ? 'تعديل الشكل' : 'Edit shape') : (isAr ? 'رسم الشكل' : 'Draw shape')}
          </Button>
          <Button variant="outlined" startIcon={<ImportIcon />} onClick={() => fileRef.current?.click()}>{isAr ? 'رفع حدود' : 'Upload boundary'}</Button>
        </Box>
      )}

      <Divider />
      <Box>
        <ButtonBase onClick={() => (history ? setHistory(null) : loadHistory())} aria-expanded={!!history} sx={{ fontSize: '0.8125rem', color: 'text.secondary', gap: 1 }}>
          {history ? <ExpandIcon fontSize="small" /> : <ChevronIcon fontSize="small" sx={{ transform: (t) => (t.direction === 'rtl' ? 'scaleX(-1)' : 'none') }} />}
          {isAr ? 'سجل التعديلات' : 'Edit history'}
        </ButtonBase>
        {history && (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: 1, p: 0, border: 1, borderColor: 'divider' }}>
            {history.length === 0 && <Box component="li" sx={{ px: 2, py: 1.5, fontSize: '0.75rem', color: 'text.secondary' }}>{isAr ? 'لا تعديلات بعد' : 'No edits yet'}</Box>}
            {history.map((h) => (
              <Box component="li" key={h.id} sx={{ display: 'flex', gap: 2, px: 2, py: 1, fontSize: '0.75rem', '& + &': { borderTop: 1, borderColor: 'divider' } }}>
                <span style={{ flex: 1 }}>{h.operation} · {h.edited_by_name || '—'}</span>
                <bdi dir="ltr" style={{ color: 'var(--sheet-ink-3)' }}>{String(h.edited_at || '').slice(0, 16).replace('T', ' ')}</bdi>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );

  const editDisabled = !canEdit || !current;
  const shapeDisabled = editDisabled || !(session?.geometry || current?.geometry);
  const endTools = canEdit ? [
    { key: 'draw-polygon', label: isAr ? 'مضلع' : 'Polygon', icon: <PolygonIcon />, pressed: mode === 'draw-polygon', disabled: editDisabled, onClick: () => begin('draw-polygon') },
    { key: 'draw-rectangle', label: isAr ? 'مستطيل' : 'Rectangle', icon: <RectIcon />, pressed: mode === 'draw-rectangle', disabled: editDisabled, onClick: () => begin('draw-rectangle') },
    { key: 'draw-circle', label: isAr ? 'دائرة' : 'Circle', icon: <CircleIcon />, pressed: mode === 'draw-circle', disabled: editDisabled, onClick: () => begin('draw-circle') },
    { divider: true, key: 'd1' },
    { key: 'edit', label: isAr ? 'الرؤوس' : 'Vertices', icon: <VertexIcon />, pressed: mode === 'edit', disabled: shapeDisabled, onClick: () => begin('edit') },
    { key: 'move', label: isAr ? 'نقل' : 'Move', icon: <MoveIcon />, pressed: mode === 'move', disabled: shapeDisabled, onClick: () => begin('move') },
    { key: 'rotate', label: isAr ? 'تدوير' : 'Rotate', icon: <RotateIcon />, pressed: mode === 'rotate', disabled: shapeDisabled, onClick: () => begin('rotate') },
    { divider: true, key: 'd2' },
    { key: 'snap', label: isAr ? 'التقاط' : 'Snap', icon: <SnapIcon />, pressed: snap, onClick: () => setSnap((v) => !v) },
    { key: 'undo', label: isAr ? 'تراجع' : 'Undo', icon: <UndoIcon />, disabled: !session?.undo.length, onClick: undo },
    { key: 'redo', label: isAr ? 'إعادة' : 'Redo', icon: <RedoIcon />, disabled: !session?.redo.length, onClick: redo },
    { key: 'import', label: isAr ? 'رفع' : 'Upload', icon: <ImportIcon />, disabled: editDisabled, onClick: () => fileRef.current?.click() },
    { key: 'delete', label: isAr ? 'حذف الشكل' : 'Delete shape', icon: <DeleteIcon />, disabled: editing || !current?.geometry, onClick: removeShape },
    { divider: true, key: 'd3' },
    { key: 'save', label: isAr ? 'حفظ' : 'Save', icon: saving ? <CircularProgress size={18} /> : <SaveIcon />, disabled: !dirty || saving || !session?.geometry || check?.pending || (check && !check.ok), onClick: save },
    { key: 'discard', label: isAr ? 'تجاهل' : 'Discard', icon: <DiscardIcon />, disabled: !editing, onClick: discard },
  ] : null;

  const bm = BASEMAPS[basemap] || BASEMAPS.satellite;
  const styleFor = (cls) => (feature) => {
    const p = feature.properties || {};
    const st = subtypeOf(cls, p.subtype_code);
    const sel = selected?.id === p.id;
    return {
      color: sel ? ACCENT : (st?.line_color || '#1f7a4d'),
      weight: sel ? 3 : CLASS_LINE[cls].weight,
      dashArray: CLASS_LINE[cls].dashArray,
      fillColor: st?.fill_color || '#e8f2ec',
      fillOpacity: CLASS_LINE[cls].fillOpacity,
    };
  };

  return (
    <Box ref={boxRef}>
      <MapWorkspace
        id="geo"
        height={height}
        workspace={ws}
        label={isAr ? 'الطبقات' : 'Layers'}
        tools={[
          { key: 'features', label: isAr ? 'العناصر' : 'Features', title: isAr ? 'المناطق والمواقع والحقول' : 'Zones, sites and fields', icon: <TreeIcon />, content: treePanel },
          { key: 'feature', label: isAr ? 'الخصائص' : 'Attributes', title: current ? current.name : (isAr ? 'الخصائص' : 'Attributes'), icon: <InfoIcon />, content: featurePanel },
          { key: 'basemap', label: isAr ? 'خريطة الأساس' : 'Basemap', title: isAr ? 'خريطة الأساس' : 'Basemap', icon: <BasemapIcon />, content: <BasemapList value={basemap} onChange={setBasemap} /> },
        ]}
        endLabel={isAr ? 'التعديل' : 'Edit'}
        endTools={endTools}
      >
        <Box sx={{ height: '100%', position: 'relative' }}>
          <MapContainer center={[24.2, 55.75]} zoom={14} style={{ height: '100%', width: '100%' }} doubleClickZoom={!mode}>
            <MapLifecycle />
            <TileLayer key={basemap} url={bm.url} attribution={bm.attribution} maxZoom={20} />
            {layers && GEO_CLASSES.filter((c) => visible[c.key]).map((c) => {
              const feats = (layers[c.list] || [])
                .filter((x) => x.geometry && !(session && session.id === x.id))
                .map((x) => ({ type: 'Feature', geometry: x.geometry, properties: { id: x.id, key_id: x.key_id, name: x.name, subtype_code: x.subtype_code } }));
              return (
                <GeoJSON
                  key={`${c.key}-${feats.length}-${selected?.id || ''}-${session?.id || ''}-${JSON.stringify(feats.map((f) => f.properties.subtype_code))}-${layers.__v || ''}`}
                  data={{ type: 'FeatureCollection', features: feats }}
                  style={styleFor(c.key)}
                  onEachFeature={(f, lyr) => {
                    lyr.bindTooltip(`${f.properties.key_id || ''} · ${f.properties.name}`, { sticky: true, direction: 'top', className: 'geo-tip' });
                    lyr.on('click', () => { if (!mode) select(c.key, f.properties.id); });
                  }}
                />
              );
            })}
            {editing && <EditLayer geometry={session.geometry} mode={mode} snap={snap} onChange={onChange} onDrawn={onDrawn} />}
            <FitTo bounds={fit.bounds} fitKey={fit.key} bottomPad={isPhone && ws.active ? Math.round(height * 0.62) : 0} />
          </MapContainer>
          {mode && (
            <Box role="status" sx={{ position: 'absolute', top: 12, left: 0, right: 0, mx: 'auto', width: 'fit-content', zIndex: 1000, bgcolor: 'background.paper', border: 1, borderColor: 'divider', px: 2, py: 1, fontSize: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', maxWidth: 'calc(100% - 120px)' }}>
              {{
                'draw-polygon': isAr ? 'انقر لإضافة النقاط، ونقرتين للإنهاء. Esc للخروج' : 'Click to add points, double-click to finish. Esc to stop',
                'draw-rectangle': isAr ? 'اسحب لرسم المستطيل' : 'Drag to draw the rectangle',
                'draw-circle': isAr ? 'انقر المركز ثم اسحب لنصف القطر' : 'Click the centre, then drag the radius',
                edit: isAr ? 'اسحب النقاط. انقر منتصف الضلع لإضافة نقطة، ونقرة يمين لحذفها' : 'Drag vertices. Click a midpoint to add one, right-click to remove',
                move: isAr ? 'اسحب الشكل لنقله' : 'Drag the shape to move it',
                rotate: isAr ? 'اسحب زاوية لتدوير الشكل' : 'Drag a corner to rotate',
              }[mode]}
              {snap ? (isAr ? ' · الالتقاط مفعّل' : ' · Snapping on') : ''}
            </Box>
          )}
        </Box>
      </MapWorkspace>
      {canImport && <ArcgisImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={loadAndFit} />}
      <input ref={fileRef} type="file" accept=".geojson,.json,.kml,.zip" hidden onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
    </Box>
  );
}
