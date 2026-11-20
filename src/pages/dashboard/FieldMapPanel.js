import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip as LTooltip, useMap } from 'react-leaflet';
import StableGeoJSON from '../../components/map/StableGeoJSON';
import L from 'leaflet';
import {
  Autocomplete, Box, Button, ButtonBase, Checkbox, Collapse, GlobalStyles, IconButton, MenuItem, Paper, Slider, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
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
import { STATUS, FORM_IDENTITY } from '../../theme/formIdentity';
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
/* Each form colours the same map by its own measure (sequential, in the form colour). */
const FORM_MEASURES = {
  ecph: MEASURES,
  fertigation: [
    { key: 'fert', label: 'Fertilizer', unit: 'kg', decimals: 0, seq: true, get: (x) => x?.fert },
    { key: 'fwater', label: 'Water / day', unit: 'm³', decimals: 1, seq: true, get: (x) => x?.waterAvg },
  ],
  irrigation: [
    { key: 'iwater', label: 'Water', unit: 'm³', decimals: 0, seq: true, get: (x) => x?.water },
    { key: 'freq', label: 'Cycles / day', unit: '', decimals: 1, seq: true, get: (x) => x?.freqAvg },
  ],
  harvest: [
    { key: 'kg', label: 'Harvest', unit: 'kg', decimals: 0, seq: true, get: (x) => x?.kg },
    { key: 'hn', label: 'Entries', unit: '', decimals: 0, seq: true, get: (x) => x?.n },
  ],
};
const BIN_KEYS = ['b0', 'b1', 'b2', 'b3', 'b4'];
const mix = (hex, t) => {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `#${c.map((v) => Math.round(255 + (v - 255) * t).toString(16).padStart(2, '0')).join('')}`;
};
const fmtNum = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–');

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

/** A slicer, like in a BI report: pick one or more values, empty = all. Stays one line high. */
function Slicer({ label, options, value, onChange, width = 170 }) {
  const [open, setOpen] = useState(false);
  const summary = value.length === 0 ? '' : value.length === 1 ? value[0] : `${value.length} selected`;
  return (
    <Autocomplete
      multiple size="small" options={options} value={value} onChange={(_, v) => onChange(v)} disableCloseOnSelect
      open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)}
      renderTags={() => (summary ? (
        <Box component="span" title={value.join(', ')} sx={{ pl: 1, fontSize: 13, fontWeight: 600, color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: width - 76 }}>
          {summary}
        </Box>
      ) : null)}
      ListboxProps={{ sx: { maxHeight: 280, py: 0.5, '& .MuiAutocomplete-option': { minHeight: 32, px: 2, fontSize: 13 } } }}
      slotProps={{ paper: { sx: { mt: 1, borderRadius: 2, boxShadow: '0 8px 28px rgba(0,0,0,0.18)', minWidth: 200 } } }}
      renderOption={(props, o, { selected }) => {
        const { key, ...rest } = props;
        return (
          <li key={o} {...rest}>
            <Checkbox size="small" checked={selected} sx={{ p: 0.5, mr: 1.5 }} />
            <Box component="span" sx={{ fontWeight: selected ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o}</Box>
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={summary ? '' : open ? 'Search…' : 'All'} InputLabelProps={{ shrink: true }}
          inputProps={{ ...params.inputProps, style: { minWidth: summary && !open ? 0 : 40, width: summary && !open ? 0 : undefined, padding: summary && !open ? 0 : undefined } }} />
      )}
      sx={{
        width,
        '& .MuiInputBase-root': { height: 40, flexWrap: 'nowrap', py: '0 !important', fontSize: 13, bgcolor: value.length ? 'rgba(29,92,60,0.06)' : 'background.paper' },
        '& .MuiOutlinedInput-notchedOutline': { borderColor: value.length ? 'rgba(29,92,60,0.45)' : undefined },
      }}
    />
  );
}

function centerOf(g) {
  const b = boundsOf(g);
  return [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
}

/* Alert icons: crop-safety signs for protected cultivation, one colour each, never colour alone. */
const ALERTS = {
  phi: { label: 'Pre-harvest interval', short: 'PHI', color: '#b45309', path: 'M6 3h12M6 21h12M7 3v2.5a5 5 0 0 0 10 0V3M7 21v-2.5a5 5 0 0 1 10 0V21' },
  pest: { label: 'Pest found', short: 'Pest', color: '#b42318', path: 'M9 9.5h6v5.5a3 3 0 0 1-6 0zM10 9.5V8a2 2 0 0 1 4 0v1.5M4 13h5M15 13h5M5.5 8l3.5 2.5M18.5 8L15 10.5M5.5 19l3.5-2.5M18.5 19L15 16.5' },
  spray: { label: 'Sprayed today', short: 'Sprayed', color: '#1d5fa8', path: 'M6 11h7v10H6zM8 11V8h3v3M11 8h3.5l1.5-2M18 4.5h.01M20 7h.01M18 9.5h.01M20.5 11.5h.01' },
};
const alertSvg = (k, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ALERTS[k].path}"/></svg>`;
function AlertGlyph({ k, size = 18 }) {
  return (
    <Box component="span" sx={{ width: size, height: size, borderRadius: '50%', bgcolor: ALERTS[k].color, display: 'inline-grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 0 0 1.5px #fff' }}>
      <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ALERTS[k].path} /></svg>
    </Box>
  );
}
const alertIcon = (keys) => L.divIcon({
  className: 'agro-alert',
  html: `<div class="agro-alert-chip">${keys.map((k) => `<span class="agro-alert-dot" style="background:${ALERTS[k].color}">${alertSvg(k)}</span>`).join('')}</div>`,
  iconSize: [0, 0],
});

export const EMPTY_SLICE = { zone: [], type: [], crop: [], status: [], code: [] };
export const STATUS_WORDS = ['In range', 'Watch', 'Out', 'No data'];

/** Zone, Farm_Code, type, crop and status of every field: the values the slicers filter on. */
export function fieldFacets(fieldOverview, allFields, agronomicThresholds, dateTo) {
  const info = Object.fromEntries((allFields || []).map((x) => [x.id, x]));
  const th = {};
  (agronomicThresholds || []).forEach((t) => { (th[t.cropId] = th[t.cropId] || {})[t.parameter] = t; });
  return (fieldOverview || []).map((f) => {
    const t = th[f.current_crop_id] || {};
    const stale = isStale(f.latest_ecph?.date, dateTo);
    const ec = meter(f.latest_ecph?.ec_out, t.ec_out || t.ec, DEFAULT_BANDS.ec, stale);
    const ph = meter(f.latest_ecph?.ph_out, t.ph_out || t.ph, DEFAULT_BANDS.ph, stale);
    const worst = RANK[ec.status] >= RANK[ph.status] ? ec.status : ph.status;
    const i = info[f.id] || {};
    return {
      id: f.id,
      zone: String(i.gisZoneId || i.gis_zone_id || f.zone_name || '').toUpperCase() || '—',
      code: String(i.gisFarmCode || i.gis_farm_code || '') || '—',
      type: f.field_type_name || '—',
      crop: f.crop_name || '—',
      status: WORD[stale ? 'none' : worst],
    };
  });
}

export function facetOptions(facets) {
  const u = (k) => [...new Set(facets.map((r) => r[k]))].filter((x) => x && x !== '—').sort();
  return { zone: u('zone'), type: u('type'), crop: u('crop'), code: u('code') };
}

/** The ids left after the slicers, or null when no slicer is set (= all fields). */
export function sliceIdsOf(facets, f) {
  if (!Object.values(f).some((v) => v.length)) return null;
  return facets.filter((r) => (!f.zone.length || f.zone.includes(r.zone)) && (!f.type.length || f.type.includes(r.type))
    && (!f.crop.length || f.crop.includes(r.crop)) && (!f.code.length || f.code.includes(r.code))
    && (!f.status.length || f.status.includes(r.status))).map((r) => r.id);
}

export default function FieldMapPanel({ fieldOverview = [], allFields = [], selectedFieldId, onSelect, onFilterChange, agronomicThresholds, dateTo, form = 'ecph', formStats = null, slice = null, onSliceChange = null }) {
  const geo = useGeo();
  const measures = FORM_MEASURES[form] || MEASURES;
  const [measureBy, setMeasureBy] = useState(() => { try { return JSON.parse(localStorage.getItem('agro_dash_measure_v2') || '{}'); } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem('agro_dash_measure_v2', JSON.stringify(measureBy)); } catch { /* ignore */ } }, [measureBy]);
  const measure = measures.some((x) => x.key === measureBy[form]) ? measureBy[form] : measures[0].key;
  const setMeasure = (v) => setMeasureBy((x) => ({ ...x, [form]: v }));
  const formColor = (FORM_IDENTITY[form] || FORM_IDENTITY.ecph).base;
  const [basemap, setBasemap] = useBasemap('dash.basemap', 'satellite');
  const [hover, setHover] = useState(null);
  // Slicers can be owned by the page (the dashboard bar) or by this panel.
  const [ownF, setOwnF] = useState(EMPTY_SLICE);
  const controlled = Boolean(slice && onSliceChange);
  const f = controlled ? slice : ownF;
  const setF = controlled ? onSliceChange : setOwnF;
  const setFilter = (k) => (v) => setF({ ...f, [k]: v });
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
      phiEnd: f.nearest_phi_end, pestName: f.latest_scouting?.pest, sprayProduct: f.spray_today?.product,
    };
  }), [fieldOverview, thresholds, dateTo, geo, fieldInfo]);
  const opts = useMemo(() => {
    const u = (k) => [...new Set(allRows.map((r) => r[k]))].filter((x) => x && x !== '—').sort();
    const types = new Set(u('type'));
    Object.values(structLayer?.types || {}).forEach((t) => t.label && types.add(t.label));
    return { zone: u('zone'), type: [...types].sort(), crop: u('crop'), code: u('code') };
  }, [allRows, structLayer]);

  const mDef = measures.find((x) => x.key === measure) || measures[0];
  const isSeq = !!mDef.seq;
  const numOf = (r) => (measure === 'ec' ? r.ec.value : measure === 'ph' ? r.ph.value : isSeq ? Number(mDef.get(formStats?.[r.field.id])) : NaN);
  // Five quantile classes for form measures, like a choropleth.
  const breaks = (() => {
    if (!isSeq) return null;
    const v = allRows.map(numOf).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
    if (!v.length) return null;
    const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
    return { min: v[0], max: v[v.length - 1], cuts: [q(0.2), q(0.4), q(0.6), q(0.8)] };
  })();
  const binOf = (val) => {
    if (!breaks || !Number.isFinite(val) || val <= 0) return 'none';
    const i = breaks.cuts.findIndex((c) => val < c);
    return BIN_KEYS[i === -1 ? 4 : i];
  };
  const binColor = (k) => mix(formColor, [0.22, 0.4, 0.6, 0.8, 1][BIN_KEYS.indexOf(k)]);
  const fillOf = (k) => FILL[k] || (k.startsWith('b') ? binColor(k) : FILL.none);
  const binRange = (k) => {
    if (!breaks) return '';
    const i = BIN_KEYS.indexOf(k);
    const lo = i === 0 ? breaks.min : breaks.cuts[i - 1];
    const hi = i === 4 ? breaks.max : breaks.cuts[i];
    return `${fmtNum(lo, mDef.decimals)}–${fmtNum(hi, mDef.decimals)}`;
  };
  const wordOf = (k) => WORD[k] || binRange(k);
  const statusOf = (r) => (measure === 'ec' ? r.ec.status : measure === 'ph' ? r.ph.status : isSeq ? binOf(numOf(r)) : r.status);
  // Slicers filter the map, the counts and the list together.
  const rows = allRows.filter((r) => (!f.zone.length || f.zone.includes(r.zone)) && (!f.type.length || f.type.includes(r.type))
    && (!f.crop.length || f.crop.includes(r.crop)) && (!f.code.length || f.code.includes(r.code))
    && (!f.status.length || f.status.includes(WORD[r.status])));
  const m = mDef;
  const valueText = (r) => {
    if (measure === 'status') return WORD[r.status];
    const v = numOf(r);
    if (isSeq) return Number.isFinite(v) && v > 0 ? `${fmtNum(v, m.decimals)}${m.unit ? ` ${m.unit}` : ''}` : '–';
    return Number.isFinite(v) ? v.toFixed(m.decimals) : '–';
  };

  // Report the sliced fields so the analyses below follow the same filters (cross-filter).
  const sliceKey = anyFilter ? rows.map((r) => r.field.id).join(',') : '';
  useEffect(() => { if (onFilterChange && !controlled) onFilterChange(sliceKey ? sliceKey.split(',') : (anyFilter ? [] : null)); }, [sliceKey, anyFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (onFilterChange && !controlled) onFilterChange(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ranked = useMemo(() => [...rows].sort((a, b) => {
    if (measure === 'status') return RANK[b.status] - RANK[a.status] || a.field.name.localeCompare(b.field.name);
    const va = numOf(a);
    const vb = numOf(b);
    return (Number.isFinite(vb) ? vb : -Infinity) - (Number.isFinite(va) ? va : -Infinity);
  }), [rows, measure, formStats]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = { good: 0, warn: 0, out: 0, none: 0, b0: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
    rows.forEach((r) => { c[statusOf(r)] += 1; });
    return c;
  }, [rows, measure, formStats]); // eslint-disable-line react-hooks/exhaustive-deps
  const legendKeys = isSeq ? [...BIN_KEYS, 'none'] : ['good', 'warn', 'out', 'none'];
  // Summary cards: status counts for EC/pH, totals for the other forms.
  const seqVals = isSeq ? rows.map((r) => ({ r, v: numOf(r) })).filter((x) => Number.isFinite(x.v) && x.v > 0) : [];
  const seqTotal = seqVals.reduce((a, x) => a + x.v, 0);
  const seqTop = seqVals.reduce((a, x) => (!a || x.v > a.v ? x : a), null);
  const cards = isSeq ? [
    { k: 'tot', label: mDef.key === 'fwater' || mDef.key === 'freq' ? 'Average' : 'Total', value: mDef.key === 'fwater' || mDef.key === 'freq' ? fmtNum(seqVals.length ? seqTotal / seqVals.length : NaN, mDef.decimals) : fmtNum(seqTotal, mDef.decimals), unit: mDef.unit, dot: formColor },
    { k: 'avg', label: 'Per field', value: fmtNum(seqVals.length ? seqTotal / seqVals.length : NaN, mDef.decimals), unit: mDef.unit, dot: mix(formColor, 0.6) },
    { k: 'top', label: 'Highest', value: seqTop ? seqTop.r.field.name : '–', unit: seqTop ? fmtNum(seqTop.v, mDef.decimals) : '', dot: mix(formColor, 0.8) },
    { k: 'n', label: 'Fields with data', value: `${seqVals.length}`, unit: `of ${rows.length}`, dot: FILL.none },
  ] : ['good', 'warn', 'out', 'none'].map((k) => ({ k, label: WORD[k], value: String(counts[k]), dot: FILL[k] }));

  const shaped = rows.filter((r) => r.geometry);
  const fc = useMemo(() => ({
    type: 'FeatureCollection',
    features: shaped.map((r) => ({ type: 'Feature', geometry: r.geometry, properties: { id: r.field.id } })),
  }), [shaped]); // eslint-disable-line react-hooks/exhaustive-deps
  const allShaped = allRows.filter((r) => r.geometry);
  const bounds = useMemo(() => {
    let b = null;
    // Nothing drawn among the filtered fields: keep the map on the whole site.
    (fc.features.length ? fc.features : allShaped.map((r) => ({ geometry: r.geometry }))).forEach((f) => {
      const x = boundsOf(f.geometry);
      b = b ? [[Math.min(b[0][0], x[0][0]), Math.min(b[0][1], x[0][1])], [Math.max(b[1][0], x[1][0]), Math.max(b[1][1], x[1][1])]] : x;
    });
    return b;
  }, [fc]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => Object.fromEntries(rows.map((r) => [r.field.id, r])), [rows]);
  const pick = (r) => onSelect(selectedFieldId === r.field.id ? null : r.field);

  // Scale for the ranked bars (value measures only).
  const vals = rows.map(numOf).filter(Number.isFinite);
  const band = measure === 'ec' ? rows[0]?.ec : measure === 'ph' ? rows[0]?.ph : null;
  const lo = isSeq ? 0 : Math.min(...vals, band?.lo ?? Infinity);
  const hi = Math.max(...vals, band?.hi ?? -Infinity);
  const scaleMin = isSeq ? 0 : lo - (hi - lo) * 0.15;
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
        '.agro-alert-chip': {
          position: 'absolute', left: 0, bottom: 10, transform: 'translateX(-50%)', display: 'flex', gap: 3, padding: 3,
          borderRadius: 999, background: 'rgba(255,255,255,0.96)', boxShadow: '0 2px 8px rgba(0,0,0,0.35)', cursor: 'pointer',
          transition: 'transform 150ms ease',
        },
        '.agro-alert-chip::after': {
          content: '""', position: 'absolute', left: '50%', bottom: -6, marginLeft: -6, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid rgba(255,255,255,0.96)',
        },
        '.agro-alert:hover .agro-alert-chip': { transform: 'translateX(-50%) scale(1.12)' },
        '.agro-alert-dot': { width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center' },
        '.leaflet-tooltip.agro-alert-tip': { fontSize: 12, lineHeight: 1.6, padding: '6px 10px', borderRadius: 6 },
        '.leaflet-tooltip.agro-alert-tip svg': { verticalAlign: '-2px', marginRight: 4 },
        '.leaflet-tooltip.agro-lbl': { background: 'transparent', border: 0, boxShadow: 'none', padding: 0 },
        '.leaflet-tooltip.agro-lbl::before': { display: 'none' },
      }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, px: 4, py: 2.5, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}>
        <Box sx={{ width: 4, height: 18, borderRadius: 1, bgcolor: '#1d5c3c' }} />
        <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600 }}>Field map</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Filters and clicks here filter every analysis below</Typography>
        <Box sx={{ flex: 1 }} />
        <ToggleButtonGroup size="small" exclusive value={measure} onChange={(_, v) => v && setMeasure(v)} aria-label="Colour fields by"
          sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontSize: 12, fontWeight: 600, px: 3, py: 0.75 }, '& .Mui-selected': { color: `${(FORM_IDENTITY[form] || FORM_IDENTITY.ecph).dark} !important` } }}>
          {measures.map((x) => <ToggleButton key={x.key} value={x.key}>{x.label}</ToggleButton>)}
        </ToggleButtonGroup>
      </Box>

      <Box role="group" aria-label="Filters" sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 4, py: 2.5, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap', bgcolor: 'background.muted' }}>
        {!controlled ? <Slicer label="ZONE_ID" options={opts.zone} value={f.zone} onChange={setFilter('zone')} width={140} /> : null}
        <Slicer label="Farm_Code" options={opts.code} value={f.code} onChange={setFilter('code')} width={190} />
        {!controlled ? (
          <>
            <Slicer label="Structure type" options={opts.type} value={f.type} onChange={setFilter('type')} />
            <Slicer label="Crop" options={opts.crop} value={f.crop} onChange={setFilter('crop')} />
            <Slicer label="Status" options={STATUS_WORDS} value={f.status} onChange={setFilter('status')} width={150} />
          </>
        ) : <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Zone, type, crop and status are in the bar above</Typography>}
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{rows.length} of {allRows.length} fields</Typography>
        <Button size="small" startIcon={<ClearIcon />} disabled={!anyFilter} onClick={() => setF(EMPTY_SLICE)} sx={{ textTransform: 'none' }}>Clear</Button>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1fr) minmax(0,1fr)' } }}>
        {/* Map: half of the width */}
        <Box sx={{ position: 'relative', height: { xs: 340, md: 460 }, borderRight: { lg: 1 }, borderBottom: { xs: 1, lg: 0 }, borderColor: 'divider', bgcolor: '#dfe3dd' }}>
          {allShaped.length ? (
            <MapContainer bounds={bounds} boundsOptions={{ padding: [32, 32], maxZoom: 18 }} attributionControl={false} style={{ height: '100%', width: '100%' }}>
              <MapLifecycle />
              <TileLayer key={basemap} url={bm.url} maxNativeZoom={bm.maxNativeZoom || 19} maxZoom={21} />
              {bm.overlay && <TileLayer key={`${basemap}-labels`} url={bm.overlay} maxNativeZoom={bm.maxNativeZoom || 19} maxZoom={21} zIndex={2} />}
              <FitOnce bounds={bounds} sig={fc.features.map((f) => f.properties.id).join(',')} />
              <FocusFlash value={selectedFieldId} geometry={selectedFieldId ? byId[selectedFieldId]?.geometry : null} />
              <MapGrab mapRef={mapRef} />
              {cfg.show.structures && structFc && (
                <StableGeoJSON
                  declutter
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
                  declutter
                  data={fc}
                  dataKey={fc.features.map((x) => x.properties.id).join(',')}
                  style={(ft) => {
                    const r = byId[ft.properties.id];
                    if (!r) return {};
                    const sel = ft.properties.id === selectedFieldId;
                    const hot = ft.properties.id === hover;
                    const op = cfg.opacity.fields;
                    return { color: sel ? '#ffd54f' : '#ffffff', weight: sel ? 3.5 : hot ? 2.5 : 1.5, fillColor: fillOf(statusOf(r)), fillOpacity: sel ? Math.min(1, op + 0.2) : hot ? Math.min(1, op + 0.15) : op };
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
                const keys = ['phi', 'pest', 'spray'].filter((k) => r[k]);
                const days = r.phiEnd ? Math.max(0, Math.ceil((new Date(r.phiEnd) - Date.now()) / 86400000)) : null;
                const lines = [
                  r.phi && `${alertSvg('phi', 12).replace('#fff', ALERTS.phi.color)} PHI${days != null ? ` · ${days} d left` : ''} · no harvest`,
                  r.pest && `${alertSvg('pest', 12).replace('#fff', ALERTS.pest.color)} Pest${r.pestName ? ` · ${esc(r.pestName)}` : ''}`,
                  r.spray && `${alertSvg('spray', 12).replace('#fff', ALERTS.spray.color)} Sprayed${r.sprayProduct ? ` · ${esc(r.sprayProduct)}` : ''}`,
                ].filter(Boolean);
                return (
                  <Marker key={`al-${r.field.id}`} position={centerOf(r.geometry)} icon={alertIcon(keys)} zIndexOffset={500}
                    eventHandlers={{ click: () => pick(r) }}>
                    <LTooltip direction="auto" offset={[0, -24]} className="agro-alert-tip">
                      <div dangerouslySetInnerHTML={{ __html: `<b>${esc(r.field.name)}</b><br/>${lines.join('<br/>')}` }} />
                    </LTooltip>
                  </Marker>
                );
              })}
            </MapContainer>
          ) : (
            <Typography sx={{ p: 4, fontSize: 13, color: 'text.secondary' }}>
              {geo ? 'These fields have no shapes yet. Link them to Agro_Structures (Farm_Code) or draw them in Zones & Sites → Map.' : 'Loading map…'}
            </Typography>
          )}
          {allShaped.length > 0 && shaped.length === 0 && (
            <Box sx={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, px: 3, py: 1.5, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.95)', boxShadow: 1, fontSize: 12.5, maxWidth: '70%', textAlign: 'center' }}>
              The filtered fields have no drawn shape. Link them by Farm_Code or draw them in Zones &amp; Sites → Map.
            </Box>
          )}
          {allShaped.length > 0 && <BasemapSwitcher value={basemap} onChange={setBasemap} side="right" />}
          {allShaped.length > 0 && (
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
            {isSeq && <Box sx={{ fontSize: 12, fontWeight: 600, mr: -1 }}>{m.label}{m.unit ? ` (${m.unit})` : ''}</Box>}
            {legendKeys.map((s) => (
              <Box key={s} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontSize: 12 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: 0.75, bgcolor: fillOf(s), border: '1px solid rgba(0,0,0,0.15)' }} />
                <Box component="span" sx={{ fontFamily: isSeq && s !== 'none' ? MONO : undefined }}>{wordOf(s)}</Box> <Box component="span" sx={{ fontFamily: MONO, color: 'text.secondary' }}>{counts[s]}</Box>
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
                {['phi', 'pest', 'spray'].map((k) => (
                  <Box key={k} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mr: 1.5 }}><AlertGlyph k={k} size={16} />{ALERTS[k].short}</Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>

        {/* Ranked fields: the other half */}
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: { lg: 460 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: 1, borderColor: 'divider' }}>
            {cards.map((c, i) => (
              <Box key={c.k} sx={{ px: 4, py: 3, borderLeft: i ? 1 : 0, borderColor: 'divider', minWidth: 0 }}>
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c.dot }} />{c.label}
                </Typography>
                <Typography noWrap sx={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>
                  {c.value}{c.unit ? <Box component="span" sx={{ fontSize: 12, fontWeight: 500, color: 'text.secondary', ml: 1 }}>{c.unit}</Box> : null}
                </Typography>
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
              const v = measure === 'status' ? null : numOf(r);
              return (
                <Box component="li" key={r.field.id}>
                  <ButtonBase onClick={() => pick(r)} onMouseEnter={() => setHover(r.field.id)} onMouseLeave={() => setHover(null)} aria-pressed={sel}
                    sx={{ width: '100%', display: 'grid', gridTemplateColumns: isSeq ? '88px minmax(0,1fr) 96px' : '88px minmax(0,1fr) 64px', alignItems: 'center', columnGap: 3, px: 2, height: 44, borderRadius: 1.5, textAlign: 'start',
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
                        {Number.isFinite(v) && <Box style={{ width: `${pct(v)}%` }} sx={{ position: 'absolute', left: 0, top: 3, bottom: 3, borderRadius: '0 3px 3px 0', bgcolor: fillOf(s), transition: 'width 300ms ease' }} />}
                      </Box>
                    )}
                    <Typography sx={{ fontSize: 13, fontWeight: 600, textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color: s === 'good' || s === 'none' || !STATUS[s] ? 'text.primary' : STATUS[s].color }}>
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
