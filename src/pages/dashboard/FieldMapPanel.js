import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { Box, ButtonBase, GlobalStyles, Paper, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
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

export default function FieldMapPanel({ fieldOverview = [], selectedFieldId, onSelect, agronomicThresholds, dateTo }) {
  const geo = useGeo();
  const [measure, setMeasure] = useState(() => { try { return localStorage.getItem('agro_dash_measure') || 'status'; } catch { return 'status'; } });
  useEffect(() => { try { localStorage.setItem('agro_dash_measure', measure); } catch { /* ignore */ } }, [measure]);
  const [basemap, setBasemap] = useBasemap('dash.basemap', 'satellite');
  const [hover, setHover] = useState(null);

  const thresholds = useMemo(() => {
    const m = {};
    (agronomicThresholds || []).forEach((t) => { (m[t.cropId] = m[t.cropId] || {})[t.parameter] = t; });
    return m;
  }, [agronomicThresholds]);

  // One row per field: its EC / pH meters, the worst status and its shape.
  const rows = useMemo(() => (fieldOverview || []).map((f) => {
    const th = thresholds[f.current_crop_id] || {};
    const stale = isStale(f.latest_ecph?.date, dateTo);
    const ec = meter(f.latest_ecph?.ec_out, th.ec_out || th.ec, DEFAULT_BANDS.ec, stale);
    const ph = meter(f.latest_ecph?.ph_out, th.ph_out || th.ph, DEFAULT_BANDS.ph, stale);
    const worst = RANK[ec.status] >= RANK[ph.status] ? ec.status : ph.status;
    return { field: f, ec, ph, status: stale ? 'none' : worst, geometry: geo?.byId[f.id]?.geometry || null, key: geo?.byId[f.id]?.key_id };
  }), [fieldOverview, thresholds, dateTo, geo]);

  const statusOf = (r) => (measure === 'ec' ? r.ec.status : measure === 'ph' ? r.ph.status : r.status);
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
  }), [rows, measure]);

  const counts = useMemo(() => {
    const c = { good: 0, warn: 0, out: 0, none: 0 };
    rows.forEach((r) => { c[statusOf(r)] += 1; });
    return c;
  }, [rows, measure]); // eslint-disable-line react-hooks/exhaustive-deps

  const shaped = rows.filter((r) => r.geometry);
  const fc = useMemo(() => ({
    type: 'FeatureCollection',
    features: shaped.map((r) => ({ type: 'Feature', geometry: r.geometry, properties: { id: r.field.id } })),
  }), [shaped]);
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
  if (!rows.length) return null;

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
              <GeoJSON
                key={`${measure}-${selectedFieldId}-${hover}-${fc.features.length}`}
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
                  lyr.bindTooltip(`${r.field.name} · ${valueText(r)}`, { permanent: true, direction: 'center', className: 'agro-field-label' });
                  lyr.bindPopup(tip);
                  lyr.on('mouseover', () => setHover(r.field.id));
                  lyr.on('mouseout', () => setHover(null));
                  lyr.on('click', () => pick(r));
                }}
              />
            </MapContainer>
          ) : (
            <Typography sx={{ p: 4, fontSize: 13, color: 'text.secondary' }}>
              {geo ? 'These fields have no shapes yet. Link them to Agro_Structures (Farm_Code) or draw them in Zones & Sites → Map.' : 'Loading map…'}
            </Typography>
          )}
          {shaped.length > 0 && <BasemapSwitcher value={basemap} onChange={setBasemap} side="right" />}
          {/* Legend */}
          <Box sx={{ position: 'absolute', left: 12, bottom: 12, zIndex: 1000, display: 'flex', gap: 3, px: 3, py: 1.5, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.94)', boxShadow: 1, flexWrap: 'wrap' }}>
            {['good', 'warn', 'out', 'none'].map((s) => (
              <Box key={s} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontSize: 12 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: 0.75, bgcolor: FILL[s], border: '1px solid rgba(0,0,0,0.15)' }} />
                {WORD[s]} <Box component="span" sx={{ fontFamily: MONO, color: 'text.secondary' }}>{counts[s]}</Box>
              </Box>
            ))}
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
