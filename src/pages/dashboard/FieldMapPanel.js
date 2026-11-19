import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import StableGeoJSON from '../../components/map/StableGeoJSON';
import L from 'leaflet';
import {
  Autocomplete, Box, Button, ButtonBase, Checkbox, Chip, Collapse, GlobalStyles, IconButton, MenuItem, Paper, Slider, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import {
  LayersOutlined as LayersIcon, FilterAltOffOutlined as ClearIcon, MoreHorizRounded as MoreIcon, ZoomInMapRounded as ZoomLayerIcon,
} from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import { useGeo } from '../../components/geo/FieldSelect';
import { boundsOf } from '../../components/geo/geoUtils';
import { BasemapSwitcher, useBasemap } from '../../components/map/MapPanel';
import { BASEMAPS } from '../../utils/mapBasemaps';
import { MapLifecycle } from '../../utils/leafletSafe';
import { flyAndFlash } from '../../components/map/mapFlash';
import { STATUS } from '../../theme/formIdentity';
import { meter, isStale, DEFAULT_BANDS } from './FarmMonitor';

/*
 * Field map beside the data, like a map visual in a BI report: every field is
 * filled by its status for the chosen measure, the list ranks the fields by
 * value, and a click on either one filters the whole dashboard.
 */

const MONO = '"IBM Plex Mono", monospace';
const FILL = { good: '#2f9e5b', warn: '#e3a21a', out: '#d64533', none: '#9aa39c' };
const RANK = { out: 3, warn: 2, good: 1, none: 0 };
const WORD = { good: 'In range', warn: 'Watch', out: 'Out', none: 'No data' };
const MEASURES = [
  { key: 'status', label: 'Status' },
  { key: 'ec', label: 'EC out', unit: 'mS/cm', decimals: 2 },
  { key: 'ph', label: 'pH out', unit: '', decimals: 1 },
];

function FitOnce({ bounds, sig }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) { try { map.fitBounds(bounds, { padding: [32, 32], maxZoom: 18 }); } catch { /* ignore */ } }
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function FocusFlash({ value, geometry }) {
  const map = useMap();
  useEffect(() => {
    if (!value || !geometry) return undefined;
    const ring = geometry.type === 'Polygon' ? geometry.coordinates?.[0] : geometry.coordinates?.[0]?.[0];
    const t = setTimeout(() => { try { flyAndFlash(map, ring); } catch { /* ignore */ } }, 120);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/* ---------- label settings, like ArcGIS Online "Labels" ---------- */
const LABEL_COLORS = ['#ffffff', '#13201a', '#ffd54f', '#7fd3ff', '#ff8a80', '#b9f6ca'];
// Single quotes only: these go inside a style="" attribute.
const LABEL_FONTS = { sans: 'Inter, sans-serif', mono: "'IBM Plex Mono', monospace", serif: 'Georgia, serif' };
const FIELD_LABEL_CONTENT = [['name_value', 'Name · value'], ['name', 'Name'], ['code', 'Farm_Code'], ['crop', 'Crop'], ['value', 'Value']];
const STRUCT_LABEL_CONTENT = [['code', 'Farm_Code'], ['name', 'Farm_Name'], ['key', 'ZONE_ID-Farm_Code'], ['type', 'Structure type']];
const DEFAULT_LAYERS = {
  show: { fields: true, alerts: true, structures: false },
  opacity: { fields: 0.55, structures: 0.35 },
  label: {
    fields: { show: true, content: 'name_value', size: 11, color: '#ffffff', style: 'box', font: 'mono', onlyData: true },
    structures: { show: false, content: 'code', size: 10, color: '#ffffff', style: 'halo', font: 'sans' },
  },
};
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function labelHtml(text, ls) {
  const dark = ['#13201a'].includes(ls.color);
  const deco = ls.style === 'box'
    ? `background:${dark ? 'rgba(255,255,255,.88)' : 'rgba(17,32,25,.78)'};padding:2px 6px;border-radius:4px`
    : ls.style === 'halo' ? `text-shadow:0 0 2px ${dark ? '#fff' : '#000'},0 0 2px ${dark ? '#fff' : '#000'},0 0 4px ${dark ? '#fff' : '#000'}` : '';
  return `<span style="display:inline-block;white-space:nowrap;font:600 ${ls.size}px/1.25 ${LABEL_FONTS[ls.font] || LABEL_FONTS.sans};color:${ls.color};${deco}">${esc(text)}</span>`;
}

/** Arcgis renderer classes -> { value: { label, color } } */
function typesFromMeta(meta) {
  const out = {};
  const r = meta?.drawingInfo?.renderer;
  const rgba = (c) => (Array.isArray(c) ? `rgb(${c[0]},${c[1]},${c[2]})` : null);
  (r?.uniqueValueGroups || []).forEach((g) => (g.classes || []).forEach((c) => (c.values || []).forEach((v) => {
    out[String(Array.isArray(v) ? v[0] : v)] = { label: c.label, color: rgba(c.symbol?.color) || '#7fd3ff' };
  })));
  (r?.uniqueValueInfos || []).forEach((u) => { out[String(u.value)] = { label: u.label, color: rgba(u.symbol?.color) || '#7fd3ff' }; });
  (meta?.types || []).forEach((t) => { if (!out[String(t.id)]) out[String(t.id)] = { label: t.name, color: '#7fd3ff' }; });
  return out;
}

function MapGrab({ mapRef }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; return () => { mapRef.current = null; }; }, [map, mapRef]);
  return null;
}

/** One row of the Layers list with its "..." settings, like the ArcGIS Online layer list. */
function LayerRow({ name, count, on, onToggle, open, onOpen, onZoom, opacity, onOpacity, label, onLabel, contentOptions }) {
  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
        <Checkbox size="small" checked={on} onChange={onToggle} sx={{ p: 1 }} inputProps={{ 'aria-label': name }} />
        <Typography sx={{ fontSize: 13, flex: 1, minWidth: 0 }} noWrap>{name}{count != null && <Box component="span" sx={{ color: 'text.secondary', fontFamily: MONO, ml: 1 }}>{count}</Box>}</Typography>
        {(onZoom || onOpacity || onLabel) && (
          <IconButton size="small" onClick={onOpen} aria-expanded={open} aria-label={`${name} options`} sx={{ bgcolor: open ? 'action.selected' : 'transparent' }}><MoreIcon fontSize="small" /></IconButton>
        )}
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ pl: 2, pr: 1, pb: 3, display: 'grid', gap: 2 }}>
          {onZoom && <Button size="small" startIcon={<ZoomLayerIcon />} onClick={onZoom} sx={{ justifyContent: 'flex-start', textTransform: 'none' }}>Zoom to layer</Button>}
          {onOpacity && (
            <Box>
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Transparency · {Math.round((1 - opacity) * 100)}%</Typography>
              <Slider size="small" min={0} max={0.95} step={0.05} value={1 - opacity} onChange={(_, v) => onOpacity(1 - v)} aria-label="Transparency" />
            </Box>
          )}
          {onLabel && (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>Labels</Typography>
                <Switch size="small" checked={label.show} onChange={() => onLabel({ show: !label.show })} inputProps={{ 'aria-label': `${name} labels` }} />
              </Box>
              {label.show && (
                <>
                  <TextField select size="small" label="Label text" value={label.content} onChange={(e) => onLabel({ content: e.target.value })}>
                    {contentOptions.map(([k, t]) => <MenuItem key={k} value={k} sx={{ fontSize: 13 }}>{t}</MenuItem>)}
                  </TextField>
                  <Box>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Size · {label.size}px</Typography>
                    <Slider size="small" min={8} max={20} step={1} value={label.size} onChange={(_, v) => onLabel({ size: v })} aria-label="Label size" />
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', width: 40 }}>Color</Typography>
                    {LABEL_COLORS.map((c) => (
                      <ButtonBase key={c} onClick={() => onLabel({ color: c })} aria-label={`Label colour ${c}`} aria-pressed={label.color === c}
                        sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: c, border: '1px solid rgba(0,0,0,0.25)', boxShadow: label.color === c ? '0 0 0 2px #fff, 0 0 0 4px #1d5c3c' : 'none' }} />
                    ))}
                  </Box>
                  <ToggleButtonGroup size="small" exclusive value={label.style} onChange={(_, v) => v && onLabel({ style: v })} aria-label="Label style"
                    sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontSize: 12, flex: 1, py: 0.5 } }}>
                    <ToggleButton value="box">Box</ToggleButton><ToggleButton value="halo">Halo</ToggleButton><ToggleButton value="plain">Plain</ToggleButton>
                  </ToggleButtonGroup>
                  <ToggleButtonGroup size="small" exclusive value={label.font} onChange={(_, v) => v && onLabel({ font: v })} aria-label="Label font"
                    sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontSize: 12, flex: 1, py: 0.5 } }}>
                    <ToggleButton value="sans">Sans</ToggleButton><ToggleButton value="mono">Mono</ToggleButton><ToggleButton value="serif">Serif</ToggleButton>
                  </ToggleButtonGroup>
                  {label.onlyData !== undefined && (
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography sx={{ fontSize: 12, flex: 1 }}>Only fields with readings</Typography>
                      <Switch size="small" checked={label.onlyData} onChange={() => onLabel({ onlyData: !label.onlyData })} />
                    </Box>
                  )}
                  <Box sx={{ p: 2, borderRadius: 1, bgcolor: '#5b6b5f', textAlign: 'center' }} dangerouslySetInnerHTML={{ __html: labelHtml('NH 07 · 2.28', label) }} />
                </>
              )}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

/** A slicer, like in a BI report: pick one or more values, empty = all. */
function Slicer({ label, options, value, onChange, width = 170 }) {
  return (
    <Autocomplete
      multiple size="small" options={options} value={value} onChange={(_, v) => onChange(v)} limitTags={1} disableCloseOnSelect
      getLimitTagsText={(n) => `+${n}`}
      renderTags={(v, getTagProps) => v.map((o, i) => <Chip {...getTagProps({ index: i })} key={o} label={o} size="small" sx={{ height: 20, fontSize: 11, maxWidth: 90, my: '0 !important' }} />)}
      renderOption={(props, o, { selected }) => (
        <li {...props} key={o} style={{ fontSize: 13, paddingTop: 2, paddingBottom: 2 }}><Checkbox size="small" checked={selected} sx={{ p: 0.5, mr: 1 }} />{o}</li>
      )}
      renderInput={(params) => <TextField {...params} label={label} placeholder={value.length ? '' : 'All'} InputLabelProps={{ shrink: true }} />}
      sx={{ width, '& .MuiInputBase-root': { minHeight: 36, py: '1px !important', fontSize: 13 } }}
    />
  );
}

function centerOf(g) {
  const b = boundsOf(g);
  return [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
}

const pin = (html, bg) => L.divIcon({
  className: '',
  html: `<div style="display:flex;gap:2px;transform:translate(-50%,-150%)">${html.map((h) => `<span style="display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:${bg};color:#fff;font:600 11px/1 Inter,sans-serif;box-shadow:0 0 0 2px #fff,0 1px 4px rgba(0,0,0,.4)">${h}</span>`).join('')}</div>`,
  iconSize: [0, 0],
});

export default function FieldMapPanel({ fieldOverview = [], allFields = [], selectedFieldId, onSelect, onFilterChange, agronomicThresholds, dateTo }) {
  const geo = useGeo();
  const [measure, setMeasure] = useState(() => { try { return localStorage.getItem('agro_dash_measure') || 'status'; } catch { return 'status'; } });
  useEffect(() => { try { localStorage.setItem('agro_dash_measure', measure); } catch { /* ignore */ } }, [measure]);
  const [basemap, setBasemap] = useBasemap('dash.basemap', 'satellite');
  const [hover, setHover] = useState(null);
  const [f, setF] = useState({ zone: [], type: [], crop: [], status: [], code: [] });
  const setFilter = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const anyFilter = Object.values(f).some((v) => v.length);
  const [cfg, setCfg] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem('agro_dash_layers_v2') || 'null');
      if (v) return { show: { ...DEFAULT_LAYERS.show, ...v.show }, opacity: { ...DEFAULT_LAYERS.opacity, ...v.opacity }, label: { fields: { ...DEFAULT_LAYERS.label.fields, ...v.label?.fields }, structures: { ...DEFAULT_LAYERS.label.structures, ...v.label?.structures } } };
    } catch { /* ignore */ }
    return DEFAULT_LAYERS;
  });
  useEffect(() => { try { localStorage.setItem('agro_dash_layers_v2', JSON.stringify(cfg)); } catch { /* ignore */ } }, [cfg]);
  const toggleLayer = (k) => setCfg((c) => ({ ...c, show: { ...c.show, [k]: !c.show[k] } }));
  const setOpacity = (k) => (v) => setCfg((c) => ({ ...c, opacity: { ...c.opacity, [k]: v } }));
  const setLabel = (k) => (patch) => setCfg((c) => ({ ...c, label: { ...c.label, [k]: { ...c.label[k], ...patch } } }));
  const [layersOpen, setLayersOpen] = useState(false);
  const [settingsFor, setSettingsFor] = useState(null);
  const mapRef = useRef(null);
  // Agro_Structures: the layer and its type classes load at once (slicer options); features when shown.
  const [structLayer, setStructLayer] = useState(null); // { id, types }
  const [structs, setStructs] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await apiRequest('/gis/layers');
        const lyr = (Array.isArray(list) ? list : []).find((l) => /arcgis/i.test(l.sourceType || '') || /structure/i.test(l.name || ''));
        if (!lyr) return;
        let meta = null;
        try { meta = await apiRequest(`/gis/layers/${lyr.id}/metadata`); } catch { /* optional */ }
        if (alive) setStructLayer({ id: lyr.id, name: lyr.name, types: typesFromMeta(meta) });
      } catch { /* no layer */ }
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!cfg.show.structures || structs || !structLayer) return undefined;
    let alive = true;
    apiRequest(`/gis/layers/${structLayer.id}/features`).then((fc) => { if (alive) setStructs(fc && fc.features ? fc : { features: [] }); })
      .catch(() => { if (alive) setStructs({ features: [] }); });
    return () => { alive = false; };
  }, [cfg.show.structures, structs, structLayer]);
  const fieldInfo = useMemo(() => Object.fromEntries((allFields || []).map((x) => [x.id, x])), [allFields]);

  const thresholds = useMemo(() => {
    const m = {};
    (agronomicThresholds || []).forEach((t) => { (m[t.cropId] = m[t.cropId] || {})[t.parameter] = t; });
    return m;
  }, [agronomicThresholds]);

  // One row per field: its EC / pH meters, the worst status and its shape.
  const allRows = useMemo(() => (fieldOverview || []).map((f) => {
    const th = thresholds[f.current_crop_id] || {};
    const stale = isStale(f.latest_ecph?.date, dateTo);
    const ec = meter(f.latest_ecph?.ec_out, th.ec_out || th.ec, DEFAULT_BANDS.ec, stale);
    const ph = meter(f.latest_ecph?.ph_out, th.ph_out || th.ph, DEFAULT_BANDS.ph, stale);
    const worst = RANK[ec.status] >= RANK[ph.status] ? ec.status : ph.status;
    const info = fieldInfo[f.id] || {};
    const zone = String(info.gisZoneId || info.gis_zone_id || f.zone_name || '').toUpperCase() || '—';
    const code = String(info.gisFarmCode || info.gis_farm_code || '') || '—';
    return {
      field: f, ec, ph, status: stale ? 'none' : worst, geometry: geo?.byId[f.id]?.geometry || null, key: geo?.byId[f.id]?.key_id,
      zone, code, type: f.field_type_name || '—', crop: f.crop_name || '—',
      phi: f.active_phi_count > 0, pest: !!(f.latest_scouting?.id && f.latest_scouting?.status !== 'resolved'), spray: !!f.spray_today,
    };
  }), [fieldOverview, thresholds, dateTo, geo, fieldInfo]);
  const opts = useMemo(() => {
    const u = (k) => [...new Set(allRows.map((r) => r[k]))].filter((x) => x && x !== '—').sort();
    const types = new Set(u('type'));
    Object.values(structLayer?.types || {}).forEach((t) => t.label && types.add(t.label));
    return { zone: u('zone'), type: [...types].sort(), crop: u('crop'), code: u('code') };
  }, [allRows, structLayer]);

  const statusOf = (r) => (measure === 'ec' ? r.ec.status : measure === 'ph' ? r.ph.status : r.status);
  // Slicers filter the map, the counts and the list together.
  const rows = allRows.filter((r) => (!f.zone.length || f.zone.includes(r.zone)) && (!f.type.length || f.type.includes(r.type))
    && (!f.crop.length || f.crop.includes(r.crop)) && (!f.code.length || f.code.includes(r.code))
    && (!f.status.length || f.status.includes(WORD[statusOf(r)])));
  const m = MEASURES.find((x) => x.key === measure);
  const valueText = (r) => {
    if (measure === 'status') return WORD[r.status];
    const v = measure === 'ec' ? r.ec.value : r.ph.value;
    return Number.isFinite(v) ? v.toFixed(m.decimals) : '–';
  };

  // Report the sliced fields so the analyses below follow the same filters (cross-filter).
  const sliceKey = anyFilter ? rows.map((r) => r.field.id).join(',') : '';
  useEffect(() => { if (onFilterChange) onFilterChange(sliceKey ? sliceKey.split(',') : (anyFilter ? [] : null)); }, [sliceKey, anyFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (onFilterChange) onFilterChange(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ranked = useMemo(() => [...rows].sort((a, b) => {
    if (measure === 'status') return RANK[b.status] - RANK[a.status] || a.field.name.localeCompare(b.field.name);
    const va = measure === 'ec' ? a.ec.value : a.ph.value;
    const vb = measure === 'ec' ? b.ec.value : b.ph.value;
    return (Number.isFinite(vb) ? vb : -Infinity) - (Number.isFinite(va) ? va : -Infinity);
  }), [rows, measure]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = { good: 0, warn: 0, out: 0, none: 0 };
    rows.forEach((r) => { c[statusOf(r)] += 1; });
    return c;
  }, [rows, measure]); // eslint-disable-line react-hooks/exhaustive-deps

  const shaped = rows.filter((r) => r.geometry);
  const fc = useMemo(() => ({
    type: 'FeatureCollection',
    features: shaped.map((r) => ({ type: 'Feature', geometry: r.geometry, properties: { id: r.field.id } })),
  }), [shaped]); // eslint-disable-line react-hooks/exhaustive-deps
  const bounds = useMemo(() => {
    let b = null;
    fc.features.forEach((f) => {
      const x = boundsOf(f.geometry);
      b = b ? [[Math.min(b[0][0], x[0][0]), Math.min(b[0][1], x[0][1])], [Math.max(b[1][0], x[1][0]), Math.max(b[1][1], x[1][1])]] : x;
    });
    return b;
  }, [fc]);
  const byId = useMemo(() => Object.fromEntries(rows.map((r) => [r.field.id, r])), [rows]);
  const pick = (r) => onSelect(selectedFieldId === r.field.id ? null : r.field);

  // Scale for the ranked bars (value measures only).
  const vals = rows.map((r) => (measure === 'ec' ? r.ec.value : r.ph.value)).filter(Number.isFinite);
  const band = measure === 'ec' ? rows[0]?.ec : measure === 'ph' ? rows[0]?.ph : null;
  const lo = Math.min(...vals, band?.lo ?? Infinity);
  const hi = Math.max(...vals, band?.hi ?? -Infinity);
  const scaleMin = lo - (hi - lo) * 0.15;
  const pct = (v) => Math.max(2, Math.min(100, ((v - scaleMin) / ((hi - scaleMin) || 1)) * 100));

  const bm = BASEMAPS[basemap] || BASEMAPS.satellite;
  if (!allRows.length) return null;
  const stType = (pr) => structLayer?.types?.[String(pr?.Structure_Type)] || { label: String(pr?.Structure_Type ?? ''), color: '#7fd3ff' };
  const structFc = structs ? { type: 'FeatureCollection', features: structs.features.filter((x) => x.geometry
    && (!f.zone.length || f.zone.includes(String(x.properties?.ZONE_ID || '').toUpperCase()))
    && (!f.type.length || f.type.includes(stType(x.properties).label))) } : null;
  const fl = cfg.label.fields;
  const sl = cfg.label.structures;
  const fieldLabelText = (r) => ({ name_value: `${r.field.name} · ${valueText(r)}`, name: r.field.name, code: r.code, crop: r.crop, value: valueText(r) }[fl.content] || r.field.name);
  const structLabelText = (pr) => ({ code: pr.Farm_Code, name: pr.Farm_Name || pr.Farm_Code, key: `${pr.ZONE_ID || ''}-${pr.Farm_Code || ''}`, type: stType(pr).label }[sl.content] || pr.Farm_Code || '');
  const zoomTo = (fcx) => {
    const map = mapRef.current;
    if (!map || !fcx?.features?.length) return;
    try { map.fitBounds(L.geoJSON(fcx).getBounds(), { padding: [24, 24], maxZoom: 18 }); } catch { /* ignore */ }
  };

  return (
    <Paper variant="outlined" sx={{ mb: 4, borderRadius: 3, overflow: 'hidden' }}>
      <GlobalStyles styles={{
        '.leaflet-tooltip.agro-field-label': {
          background: 'rgba(17,32,25,0.78)', color: '#fff', border: 0, boxShadow: 'none', borderRadius: 4,
          padding: '2px 6px', fontSize: 11, fontWeight: 600, fontFamily: MONO, whiteSpace: 'nowrap',
        },
        '.leaflet-tooltip.agro-field-label::before': { display: 'none' },
        '.leaflet-tooltip.agro-lbl': { background: 'transparent', border: 0, boxShadow: 'none', padding: 0 },
        '.leaflet-tooltip.agro-lbl::before': { display: 'none' },
      }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, px: 4, py: 2.5, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}>
        <Box sx={{ width: 4, height: 18, borderRadius: 1, bgcolor: '#1d5c3c' }} />
        <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600 }}>Field map</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Filters and clicks here filter every analysis below</Typography>
        <Box sx={{ flex: 1 }} />
        <ToggleButtonGroup size="small" exclusive value={measure} onChange={(_, v) => v && setMeasure(v)} aria-label="Colour fields by"
          sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontSize: 12, fontWeight: 600, px: 3, py: 0.75 } }}>
          {MEASURES.map((x) => <ToggleButton key={x.key} value={x.key}>{x.label}</ToggleButton>)}
        </ToggleButtonGroup>
      </Box>

      <Box role="group" aria-label="Filters" sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 4, py: 2.5, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap', bgcolor: 'background.muted' }}>
        <Slicer label="ZONE_ID" options={opts.zone} value={f.zone} onChange={setFilter('zone')} width={140} />
        <Slicer label="Farm_Code" options={opts.code} value={f.code} onChange={setFilter('code')} width={190} />
        <Slicer label="Structure type" options={opts.type} value={f.type} onChange={setFilter('type')} />
        <Slicer label="Crop" options={opts.crop} value={f.crop} onChange={setFilter('crop')} />
        <Slicer label="Status" options={['In range', 'Watch', 'Out', 'No data']} value={f.status} onChange={setFilter('status')} width={150} />
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{rows.length} of {allRows.length} fields</Typography>
        <Button size="small" startIcon={<ClearIcon />} disabled={!anyFilter} onClick={() => setF({ zone: [], type: [], crop: [], status: [], code: [] })} sx={{ textTransform: 'none' }}>Clear</Button>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) minmax(0,1fr)' } }}>
        {/* Map: half of the width */}
        <Box sx={{ position: 'relative', height: { xs: 340, md: 460 }, borderRight: { lg: 1 }, borderBottom: { xs: 1, lg: 0 }, borderColor: 'divider', bgcolor: '#dfe3dd' }}>
          {shaped.length ? (
            <MapContainer bounds={bounds} boundsOptions={{ padding: [32, 32], maxZoom: 18 }} attributionControl={false} style={{ height: '100%', width: '100%' }}>
              <MapLifecycle />
              <TileLayer key={basemap} url={bm.url} maxNativeZoom={bm.maxNativeZoom || 19} maxZoom={21} />
              {bm.overlay && <TileLayer key={`${basemap}-labels`} url={bm.overlay} maxNativeZoom={bm.maxNativeZoom || 19} maxZoom={21} zIndex={2} />}
              <FitOnce bounds={bounds} sig={fc.features.map((f) => f.properties.id).join(',')} />
              <FocusFlash value={selectedFieldId} geometry={selectedFieldId ? byId[selectedFieldId]?.geometry : null} />
              <MapGrab mapRef={mapRef} />
              {cfg.show.structures && structFc && (
                <StableGeoJSON
                  data={structFc}
                  dataKey={`st-${structFc.features.length}-${f.zone.join()}-${f.type.join()}`}
                  style={(ft) => {
                    const t = stType(ft.properties);
                    return { color: t.color, weight: 1.2, fillColor: t.color, fillOpacity: cfg.opacity.structures * 0.5, opacity: Math.min(1, cfg.opacity.structures + 0.4) };
                  }}
                  label={sl.show ? (ft) => ({ html: labelHtml(structLabelText(ft.properties || {}), sl), permanent: true, className: 'agro-lbl' }) : (ft) => ({ html: labelHtml(`${(ft.properties || {}).Farm_Name || ''} · ${stType(ft.properties).label}`, { ...sl, style: 'box', size: 11 }), permanent: false, className: 'agro-lbl' })}
                />
              )}
              {cfg.show.fields && (
                <StableGeoJSON
                  data={fc}
                  dataKey={fc.features.map((x) => x.properties.id).join(',')}
                  style={(ft) => {
                    const r = byId[ft.properties.id];
                    if (!r) return {};
                    const sel = ft.properties.id === selectedFieldId;
                    const hot = ft.properties.id === hover;
                    const op = cfg.opacity.fields;
                    return { color: sel ? '#ffd54f' : '#ffffff', weight: sel ? 3.5 : hot ? 2.5 : 1.5, fillColor: FILL[statusOf(r)], fillOpacity: sel ? Math.min(1, op + 0.2) : hot ? Math.min(1, op + 0.15) : op };
                  }}
                  label={(ft) => {
                    const r = byId[ft.properties.id];
                    if (!r) return null;
                    const permanent = fl.show && (!fl.onlyData || r.status !== 'none' || r.field.id === selectedFieldId);
                    return { html: labelHtml(fieldLabelText(r), permanent ? fl : { ...fl, style: 'box', size: 11 }), permanent, className: 'agro-lbl' };
                  }}
                  popup={(ft) => {
                    const r = byId[ft.properties.id];
                    return r ? `<b>${esc(r.field.name)}</b> · ${esc(r.zone)}-${esc(r.code)}<br/>EC out ${Number.isFinite(r.ec.value) ? r.ec.value.toFixed(2) : '–'} · pH out ${Number.isFinite(r.ph.value) ? r.ph.value.toFixed(1) : '–'}<br/>${WORD[r.status]}` : '';
                  }}
                  onHover={(ft) => setHover(ft ? ft.properties.id : null)}
                  onClick={(ft) => { const r = byId[ft.properties.id]; if (r) pick(r); }}
                />
              )}
              {cfg.show.alerts && shaped.filter((r) => r.phi || r.pest || r.spray).map((r) => {
                const marks = [r.phi && 'P', r.pest && '!', r.spray && 'S'].filter(Boolean);
                return <Marker key={`al-${r.field.id}`} position={centerOf(r.geometry)} interactive={false} icon={pin(marks, r.pest ? '#c0392b' : '#6a46b8')} />;
              })}
            </MapContainer>
          ) : (
            <Typography sx={{ p: 4, fontSize: 13, color: 'text.secondary' }}>
              {geo ? 'These fields have no shapes yet. Link them to Agro_Structures (Farm_Code) or draw them in Zones & Sites → Map.' : 'Loading map…'}
            </Typography>
          )}
          {shaped.length > 0 && <BasemapSwitcher value={basemap} onChange={setBasemap} side="right" />}
          {shaped.length > 0 && (
            <Box onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
              sx={{ position: 'absolute', top: 12, right: 56, zIndex: 1001, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1.5 }}>
              <ButtonBase onClick={() => setLayersOpen((o) => !o)} aria-expanded={layersOpen} aria-label="Map layers" title="Map layers"
                sx={{ height: 34, px: 2.5, gap: 1.5, borderRadius: 1, fontSize: 12.5, fontWeight: 600, bgcolor: layersOpen ? 'primary.main' : 'background.paper', color: layersOpen ? 'primary.contrastText' : 'text.primary', border: '1px solid rgba(0,0,0,0.2)', boxShadow: '0 1px 5px rgba(0,0,0,0.3)' }}>
                <LayersIcon sx={{ fontSize: 18 }} />Layers
              </ButtonBase>
              {layersOpen && (
                <Box sx={{ width: 300, maxHeight: 340, overflowY: 'auto', bgcolor: 'background.paper', borderRadius: 2, boxShadow: '0 6px 24px rgba(0,0,0,0.28)', py: 1, px: 2 }}>
                  <LayerRow name="Fields (status fill)" count={fc.features.length} on={cfg.show.fields} onToggle={() => toggleLayer('fields')}
                    open={settingsFor === 'fields'} onOpen={() => setSettingsFor((x) => (x === 'fields' ? null : 'fields'))}
                    onZoom={() => zoomTo(fc)} opacity={cfg.opacity.fields} onOpacity={setOpacity('fields')}
                    label={fl} onLabel={setLabel('fields')} contentOptions={FIELD_LABEL_CONTENT} />
                  <LayerRow name="Alerts (PHI · pest · spray)" on={cfg.show.alerts} onToggle={() => toggleLayer('alerts')} />
                  {structLayer && (
                    <LayerRow name={structLayer.name || 'Agro_Structures'} count={cfg.show.structures ? (structFc ? structFc.features.length : '…') : null}
                      on={cfg.show.structures} onToggle={() => toggleLayer('structures')}
                      open={settingsFor === 'structures'} onOpen={() => setSettingsFor((x) => (x === 'structures' ? null : 'structures'))}
                      onZoom={structFc ? () => zoomTo(structFc) : null} opacity={cfg.opacity.structures} onOpacity={setOpacity('structures')}
                      label={sl} onLabel={setLabel('structures')} contentOptions={STRUCT_LABEL_CONTENT} />
                  )}
                </Box>
              )}
            </Box>
          )}
          {/* Legend */}
          <Box sx={{ position: 'absolute', left: 12, bottom: 12, zIndex: 1000, display: 'flex', gap: 3, px: 3, py: 1.5, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.94)', boxShadow: 1, flexWrap: 'wrap' }}>
            {['good', 'warn', 'out', 'none'].map((s) => (
              <Box key={s} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontSize: 12 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: 0.75, bgcolor: FILL[s], border: '1px solid rgba(0,0,0,0.15)' }} />
                {WORD[s]} <Box component="span" sx={{ fontFamily: MONO, color: 'text.secondary' }}>{counts[s]}</Box>
              </Box>
            ))}
            {cfg.show.structures && structFc && [...new Set(structFc.features.map((x) => stType(x.properties).label))].slice(0, 6).map((lb) => {
              const t = Object.values(structLayer?.types || {}).find((x) => x.label === lb);
              return (
                <Box key={`st-${lb}`} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontSize: 12 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: 0.75, border: `2px solid ${t?.color || '#7fd3ff'}` }} />{lb}
                </Box>
              );
            })}
            {cfg.show.alerts && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontSize: 12, color: 'text.secondary' }}>
                <b style={{ color: '#6a46b8' }}>P</b> PHI <b style={{ color: '#c0392b', marginLeft: 4 }}>!</b> Pest <b style={{ color: '#6a46b8', marginLeft: 4 }}>S</b> Sprayed
              </Box>
            )}
          </Box>
        </Box>

        {/* Ranked fields: the other half */}
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: { lg: 460 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: 1, borderColor: 'divider' }}>
            {['good', 'warn', 'out', 'none'].map((s, i) => (
              <Box key={s} sx={{ px: 4, py: 3, borderLeft: i ? 1 : 0, borderColor: 'divider' }}>
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: FILL[s] }} />{WORD[s]}
                </Typography>
                <Typography sx={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>{counts[s]}</Typography>
              </Box>
            ))}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', px: 4, pt: 3, pb: 1.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{measure === 'status' ? 'Fields by status' : `Fields by ${m.label}`}</Typography>
            {band && measure !== 'status' && (
              <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>Target {band.lo}–{band.hi}{m.unit ? ` ${m.unit}` : ''}</Typography>
            )}
          </Box>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, px: 2, pb: 2, overflowY: 'auto', flex: 1 }}>
            {ranked.map((r) => {
              const s = statusOf(r);
              const sel = r.field.id === selectedFieldId;
              const v = measure === 'ec' ? r.ec.value : measure === 'ph' ? r.ph.value : null;
              return (
                <Box component="li" key={r.field.id}>
                  <ButtonBase onClick={() => pick(r)} onMouseEnter={() => setHover(r.field.id)} onMouseLeave={() => setHover(null)} aria-pressed={sel}
                    sx={{ width: '100%', display: 'grid', gridTemplateColumns: '88px minmax(0,1fr) 64px', alignItems: 'center', columnGap: 3, px: 2, height: 44, borderRadius: 1.5, textAlign: 'start',
                      bgcolor: sel ? 'rgba(29,92,60,0.10)' : hover === r.field.id ? 'action.hover' : 'transparent', boxShadow: sel ? 'inset 3px 0 0 #1d5c3c' : 'none' }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, fontFamily: MONO }}>{r.field.name}</Typography>
                      <Typography noWrap sx={{ fontSize: 11, color: 'text.secondary' }}>{r.field.crop_name || (r.geometry ? r.key || '' : 'No shape')}</Typography>
                    </Box>
                    {measure === 'status' ? (
                      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', fontSize: 12, color: 'text.secondary', fontFamily: MONO }}>
                        <Tooltip title="EC out"><span style={{ color: r.ec.status === 'good' || r.ec.status === 'none' ? undefined : STATUS[r.ec.status].color }}>EC {Number.isFinite(r.ec.value) ? r.ec.value.toFixed(2) : '–'}</span></Tooltip>
                        <Tooltip title="pH out"><span style={{ color: r.ph.status === 'good' || r.ph.status === 'none' ? undefined : STATUS[r.ph.status].color }}>pH {Number.isFinite(r.ph.value) ? r.ph.value.toFixed(1) : '–'}</span></Tooltip>
                      </Box>
                    ) : (
                      <Box dir="ltr" sx={{ position: 'relative', height: 14, borderRadius: 1, bgcolor: 'action.hover' }}>
                        {band && <Box style={{ left: `${pct(band.lo)}%`, width: `${pct(band.hi) - pct(band.lo)}%` }} sx={{ position: 'absolute', top: 0, bottom: 0, bgcolor: '#d9ece3' }} />}
                        {Number.isFinite(v) && <Box style={{ width: `${pct(v)}%` }} sx={{ position: 'absolute', left: 0, top: 3, bottom: 3, borderRadius: '0 3px 3px 0', bgcolor: FILL[s], transition: 'width 300ms ease' }} />}
                      </Box>
                    )}
                    <Typography sx={{ fontSize: 13, fontWeight: 600, textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color: s === 'good' || s === 'none' ? 'text.primary' : STATUS[s].color }}>
                      {measure === 'status' ? WORD[s] : valueText(r)}
                    </Typography>
                  </ButtonBase>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}
