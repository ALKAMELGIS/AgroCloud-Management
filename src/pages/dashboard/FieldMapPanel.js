import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  Autocomplete, Box, Button, ButtonBase, Checkbox, Chip, FormControlLabel, GlobalStyles, Paper, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { LayersOutlined as LayersIcon, FilterAltOffOutlined as ClearIcon } from '@mui/icons-material';
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

export default function FieldMapPanel({ fieldOverview = [], allFields = [], selectedFieldId, onSelect, agronomicThresholds, dateTo }) {
  const geo = useGeo();
  const [measure, setMeasure] = useState(() => { try { return localStorage.getItem('agro_dash_measure') || 'status'; } catch { return 'status'; } });
  useEffect(() => { try { localStorage.setItem('agro_dash_measure', measure); } catch { /* ignore */ } }, [measure]);
  const [basemap, setBasemap] = useBasemap('dash.basemap', 'satellite');
  const [hover, setHover] = useState(null);
  const [f, setF] = useState({ zone: [], type: [], crop: [], status: [], code: [] });
  const setFilter = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const anyFilter = Object.values(f).some((v) => v.length);
  const [layers, setLayers] = useState(() => {
    try { return { fields: true, labels: true, alerts: true, structures: false, ...JSON.parse(localStorage.getItem('agro_dash_layers') || '{}') }; } catch { return { fields: true, labels: true, alerts: true, structures: false }; }
  });
  useEffect(() => { try { localStorage.setItem('agro_dash_layers', JSON.stringify(layers)); } catch { /* ignore */ } }, [layers]);
  const [layersOpen, setLayersOpen] = useState(false);
  const [structs, setStructs] = useState(null); // Agro_Structures features (loaded when the layer is turned on)
  useEffect(() => {
    if (!layers.structures || structs) return;
    let alive = true;
    (async () => {
      try {
        const list = await apiRequest('/gis/layers');
        const lyr = (Array.isArray(list) ? list : []).find((l) => /arcgis/i.test(l.sourceType || '') || /structure/i.test(l.name || ''));
        if (!lyr) { if (alive) setStructs({ features: [] }); return; }
        const fc = await apiRequest(`/gis/layers/${lyr.id}/features`);
        if (alive) setStructs(fc && fc.features ? fc : { features: [] });
      } catch { if (alive) setStructs({ features: [] }); }
    })();
    return () => { alive = false; };
  }, [layers.structures, structs]);
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
    return { zone: u('zone'), type: u('type'), crop: u('crop'), code: u('code') };
  }, [allRows]);

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
  const structFc = structs ? { type: 'FeatureCollection', features: structs.features.filter((x) => x.geometry && (!f.zone.length || f.zone.includes(String(x.properties?.ZONE_ID || '').toUpperCase()))) } : null;
  const LAYERS = [['fields', 'Fields (status fill)'], ['labels', 'Field labels'], ['alerts', 'Alerts (PHI · pest · spray)'], ['structures', 'Agro_Structures (ArcGIS)']];

  return (
    <Paper variant="outlined" sx={{ mb: 4, borderRadius: 3, overflow: 'hidden' }}>
      <GlobalStyles styles={{
        '.leaflet-tooltip.agro-field-label': {
          background: 'rgba(17,32,25,0.78)', color: '#fff', border: 0, boxShadow: 'none', borderRadius: 4,
          padding: '2px 6px', fontSize: 11, fontWeight: 600, fontFamily: MONO, whiteSpace: 'nowrap',
        },
        '.leaflet-tooltip.agro-field-label::before': { display: 'none' },
      }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, px: 4, py: 2.5, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}>
        <Box sx={{ width: 4, height: 18, borderRadius: 1, bgcolor: '#1d5c3c' }} />
        <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600 }}>Field map</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Click a field on the map or in the list to filter the dashboard</Typography>
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
              {layers.structures && structFc && (
                <GeoJSON key={`st-${structFc.features.length}-${f.zone.join()}`} data={structFc}
                  style={() => ({ color: '#7fd3ff', weight: 1, fillOpacity: 0.04, dashArray: '3 3' })}
                  onEachFeature={(ft, lyr) => { const pr = ft.properties || {}; lyr.bindTooltip(`${pr.Farm_Name || pr.Farm_Code || ''} · ${pr.ZONE_ID || ''}-${pr.Farm_Code || ''}`, { sticky: true }); }} />
              )}
              {layers.fields && (
              <GeoJSON
                key={`${measure}-${selectedFieldId}-${hover}-${fc.features.length}-${layers.labels}-${rows.length}`}
                data={fc}
                style={(f) => {
                  const r = byId[f.properties.id];
                  const sel = f.properties.id === selectedFieldId;
                  const hot = f.properties.id === hover;
                  return { color: sel ? '#ffd54f' : '#ffffff', weight: sel ? 3.5 : hot ? 2.5 : 1.5, fillColor: FILL[statusOf(r)], fillOpacity: sel ? 0.75 : hot ? 0.7 : 0.55 };
                }}
                onEachFeature={(f, lyr) => {
                  const r = byId[f.properties.id];
                  const tip = `<b>${r.field.name}</b><br/>EC out ${Number.isFinite(r.ec.value) ? r.ec.value.toFixed(2) : '–'} · pH out ${Number.isFinite(r.ph.value) ? r.ph.value.toFixed(1) : '–'}<br/>${WORD[r.status]}`;
                  if (layers.labels) lyr.bindTooltip(`${r.field.name} · ${valueText(r)}`, { permanent: true, direction: 'center', className: 'agro-field-label' });
                  else lyr.bindTooltip(`${r.field.name} · ${valueText(r)}`, { sticky: true, className: 'agro-field-label' });
                  lyr.bindPopup(tip);
                  lyr.on('mouseover', () => setHover(r.field.id));
                  lyr.on('mouseout', () => setHover(null));
                  lyr.on('click', () => pick(r));
                }}
              />
              )}
              {layers.alerts && shaped.filter((r) => r.phi || r.pest || r.spray).map((r) => {
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
              sx={{ position: 'absolute', top: 12, right: 56, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1.5 }}>
              <ButtonBase onClick={() => setLayersOpen((o) => !o)} aria-expanded={layersOpen} aria-label="Map layers" title="Map layers"
                sx={{ height: 34, px: 2.5, gap: 1.5, borderRadius: 1, fontSize: 12.5, fontWeight: 600, bgcolor: layersOpen ? 'primary.main' : 'background.paper', color: layersOpen ? 'primary.contrastText' : 'text.primary', border: '1px solid rgba(0,0,0,0.2)', boxShadow: '0 1px 5px rgba(0,0,0,0.3)' }}>
                <LayersIcon sx={{ fontSize: 18 }} />Layers
              </ButtonBase>
              {layersOpen && (
                <Box sx={{ width: 240, bgcolor: 'background.paper', borderRadius: 2, boxShadow: '0 6px 24px rgba(0,0,0,0.28)', py: 1.5, px: 3 }}>
                  {LAYERS.map(([k, label]) => (
                    <FormControlLabel key={k} sx={{ display: 'flex', m: 0, '& .MuiFormControlLabel-label': { fontSize: 13 } }}
                      control={<Checkbox size="small" checked={!!layers[k]} onChange={() => setLayers((x) => ({ ...x, [k]: !x[k] }))} sx={{ p: 1 }} />}
                      label={k === 'structures' && layers.structures && !structs ? `${label} · loading…` : k === 'structures' && structFc ? `${label} · ${structFc.features.length}` : label} />
                  ))}
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
            {layers.alerts && (
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
