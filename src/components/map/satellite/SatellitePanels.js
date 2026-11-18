import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, ButtonBase, Chip, CircularProgress, FormControlLabel, List, ListItemButton,
  ListItemText, Slider, Stack, Switch, Tab, Tabs, TextField, Tooltip as MuiTooltip, IconButton, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  CloudOutlined as CloudIcon, UploadFileOutlined as UploadIcon, ZoomInMapOutlined as ZoomIcon,
  DeleteOutlineRounded as ClearIcon, CheckRounded as CheckIcon, CloseRounded as CloseIconSmall,
  ImageOutlined as FigureIcon, TableChartOutlined as TableIcon,
} from '@mui/icons-material';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import L from 'leaflet';
import HelpTip from '../../HelpTip';
import ExportButton from '../../ExportButton';
import * as api from './satelliteApi';
import { aoiAreaHa, aoiBbox, parseLatLng, readAoiFile, ringToFeature, outerRing } from './aoi';
import { useIsArabic } from '../../../i18n/shellLabels';

const GROUPS = [
  { key: 'all', label: 'All layers' },
  { key: 'vegetation', label: 'Vegetation' },
  { key: 'water', label: 'Water & moisture' },
  { key: 'soil', label: 'Soil' },
  { key: 'visual', label: 'Band combinations' },
];

const section = { px: 2.5, py: 1.75 };
const label = { fontSize: '0.75rem', fontWeight: 700, letterSpacing: 0, textTransform: 'none', color: 'text.secondary', mb: 1 };

export function NotConfigured({ isAdmin }) {
  return (
    <Box sx={section}>
      <Alert severity="info" sx={{ fontSize: '0.8125rem' }}>
        Satellite imagery is not set up yet.{' '}
        {isAdmin ? <RouterLink to="/admin/api-keys">Settings → API Keys → Satellite imagery</RouterLink> : 'Ask your administrator.'}
      </Alert>
    </Box>
  );
}

export function rampCss(legend) {
  if (!legend?.length) return null;
  const min = legend[0].value;
  const max = legend[legend.length - 1].value;
  return `linear-gradient(90deg, ${legend.map((l) => `${l.color} ${((l.value - min) / (max - min || 1)) * 100}%`).join(', ')})`;
}

/** Index layers: gallery by group, show on map, opacity, legend. */
export function LayersPanel({ sat }) {
  const [group, setGroup] = useState('all');
  const list = sat.indices.filter((i) => group === 'all' || i.group === group);
  return (
    <Box>
      <Box sx={{ ...section, pb: 1 }}>
        <FormControlLabel
          control={<Switch checked={sat.show} onChange={(e) => sat.setShow(e.target.checked)} />}
          label={<Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>Show on map</Typography>}
        />
        <Typography sx={{ ...label, mt: 1.5, mb: 0 }}>Opacity</Typography>
        <Slider size="small" min={0.2} max={1} step={0.05} value={sat.opacity} onChange={(_, v) => sat.setOpacity(v)} aria-label="Opacity" valueLabelDisplay="auto" valueLabelFormat={(v) => `${Math.round(v * 100)}%`} />
      </Box>
      <Tabs value={group} onChange={(_, v) => setGroup(v)} variant="scrollable" scrollButtons="auto" sx={{ px: 1, minHeight: 40, borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minHeight: 40, fontSize: '0.75rem', textTransform: 'none', px: 1.25 } }}>
        {GROUPS.map((g) => <Tab key={g.key} value={g.key} label={g.label} />)}
      </Tabs>
      <Box sx={{ p: 3, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2.5 }}>
        {list.map((i) => {
          const selected = i.key === sat.index;
          const ramp = rampCss(i.legend);
          return (
            <MuiTooltip key={i.key} title={i.description || ''} placement="top" arrow enterDelay={400}>
              <ButtonBase
                onClick={() => { sat.setIndex(i.key); sat.setShow(true); }}
                aria-pressed={selected}
                aria-label={`${i.label}. ${i.description || ''}`}
                sx={(t) => ({
                  position: 'relative', display: 'block', width: '100%', aspectRatio: '16 / 10', borderRadius: 2.5, overflow: 'hidden',
                  backgroundColor: '#2b3a31', backgroundSize: 'cover', backgroundPosition: 'center',
                  boxShadow: selected ? `0 0 0 2px ${t.palette.background.paper}, 0 0 0 4px ${t.palette.primary.main}` : '0 1px 3px rgba(0,0,0,0.18)',
                  transition: 'box-shadow 150ms ease, transform 150ms ease',
                  '& .thumb-img': { transition: 'transform 300ms ease' },
                  '&:hover .thumb-img': { transform: 'scale(1.04)' },
                  '&.Mui-focusVisible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 3 },
                })}
              >
                <Box className="thumb-img" aria-hidden="true" sx={{ position: 'absolute', inset: 0, backgroundSize: 'cover', backgroundPosition: 'center' }}
                  style={{ backgroundImage: `url(${process.env.PUBLIC_URL || ''}/sat-thumbs/${i.key}.webp)${ramp ? `, ${ramp}` : ''}` }} />
                <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(8,18,12,0.78) 100%)' }} />
                <Typography component="span" sx={{ position: 'absolute', insetInline: 10, bottom: ramp ? 12 : 8, color: '#fff', fontSize: '0.8125rem', fontWeight: 600, textAlign: 'start', lineHeight: 1.25, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }} noWrap>
                  {i.label}
                </Typography>
                {ramp && <Box aria-hidden="true" sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4 }} style={{ background: ramp }} />}
                {selected && (
                  <Box aria-hidden="true" sx={{ position: 'absolute', top: 6, insetInlineEnd: 6, width: 22, height: 22, borderRadius: '50%', bgcolor: 'primary.main', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.35)' }}>
                    <CheckIcon sx={{ fontSize: 15 }} />
                  </Box>
                )}
              </ButtonBase>
            </MuiTooltip>
          );
        })}
      </Box>
      {sat.current && (
        <Box sx={{ ...section, pt: 0 }}>
          <Typography sx={label}>Formula</Typography>
          <Typography dir="ltr" sx={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', textAlign: 'end' }} translate="no">{sat.current.formula}</Typography>
          {sat.current.legend && <LegendBar legend={sat.current.legend} sx={{ mt: 1.5 }} />}
        </Box>
      )}
    </Box>
  );
}

export function LegendBar({ legend, sx }) {
  return (
    <Box sx={sx} dir="ltr">
      <Box sx={{ height: 10, borderRadius: 5 }} style={{ background: rampCss(legend) }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5, fontSize: '0.6875rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
        <span>{legend[0].value}</span>
        <span>{legend[Math.floor(legend.length / 2)].value}</span>
        <span>{legend[legend.length - 1].value}</span>
      </Box>
    </Box>
  );
}

function viewBbox(map, sat) {
  const box = sat.aoi ? aoiBbox(sat.aoi) : null;
  if (box) return box;
  const b = map?.getBounds?.();
  return b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : null;
}

function SceneList({ scenes, value, onPick, allowLatest = true }) {
  if (!scenes) return null;
  if (!scenes.length) return <Typography variant="body2" color="text.secondary" sx={{ px: 2.5, py: 1 }}>No scenes match these filters.</Typography>;
  return (
    <List dense disablePadding sx={{ px: 1 }}>
      {allowLatest && (
        <ListItemButton selected={!value} onClick={() => onPick(null)} sx={{ borderRadius: 1 }}>
          <ListItemText primary="Best of the period (least cloudy, most recent)" primaryTypographyProps={{ fontSize: '0.8125rem' }} />
        </ListItemButton>
      )}
      {scenes.map((s) => (
        <ListItemButton key={s.date} selected={value === s.date} onClick={() => onPick(s.date)} sx={{ borderRadius: 1, gap: 1 }}>
          <ListItemText primary={<bdi>{s.date}</bdi>} secondary={`Sentinel-2 L2A · ${s.tiles} tile${s.tiles > 1 ? 's' : ''}`} primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: 600 }} secondaryTypographyProps={{ fontSize: '0.6875rem' }} />
          <Chip size="small" icon={<CloudIcon />} label={`${s.cloud}%`} color={s.cloud <= 10 ? 'success' : s.cloud <= 30 ? 'default' : 'warning'} variant="outlined" />
        </ListItemButton>
      ))}
    </List>
  );
}

function useSceneSearch(sat, mapRef) {
  const [scenes, setScenes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const search = async () => {
    const bbox = viewBbox(mapRef.current, sat);
    if (!bbox) return;
    setBusy(true); setError(null);
    try { setScenes(await api.searchScenes({ bbox, from: sat.from, to: sat.to, maxcc: sat.maxcc })); } catch (e) { setError(e.message); setScenes(null); }
    setBusy(false);
  };
  return { scenes, busy, error, search };
}

/** Imagery date: period, cloud filter, scene search and pick. */
export function DatesPanel({ sat, mapRef }) {
  const s = useSceneSearch(sat, mapRef);
  return (
    <Box>
      <Box sx={section}>
        <Typography sx={label}>Period</Typography>
        <Stack direction="row" spacing={1}>
          <TextField size="small" type="date" label="Start" value={sat.from} onChange={(e) => { sat.setFrom(e.target.value); sat.setScene(null); }} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField size="small" type="date" label="End" value={sat.to} onChange={(e) => { sat.setTo(e.target.value); sat.setScene(null); }} InputLabelProps={{ shrink: true }} fullWidth />
        </Stack>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
          <Typography sx={{ ...label, mb: 0, flexShrink: 0 }}>Cloud ≤</Typography>
          <Slider size="small" min={0} max={100} step={5} value={sat.maxcc} onChange={(_, v) => sat.setMaxcc(v)} aria-label="Maximum cloud cover" sx={{ mx: 1 }} />
          <Chip size="small" icon={<CloudIcon />} label={`${sat.maxcc}%`} />
        </Box>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 1 }}>
          {'Sentinel-2 L2A · '}<bdi>{sat.scene ? `scene ${sat.scene}` : `${sat.from} → ${sat.to}`}</bdi>
        </Typography>
        <Button fullWidth variant="outlined" sx={{ mt: 1.5 }} onClick={s.search} disabled={!sat.status.configured || s.busy} startIcon={s.busy ? <CircularProgress size={16} /> : null}>
          Search scenes
        </Button>
        {s.error && <Alert severity="error" sx={{ mt: 1.5 }}>{s.error}</Alert>}
      </Box>
      <SceneList scenes={s.scenes} value={sat.scene} onPick={(d) => { sat.setScene(d); sat.setShow(true); }} />
    </Box>
  );
}

/** Area of interest: draw, upload, pick a field, go to coordinates; clip / mask. */
const STRUCT_TYPES = [
  { code: 1006, name: 'PIVOT', swatch: { width: 14, height: 14, borderRadius: '50%', border: '2px solid #f2c600', bgcolor: '#9ccc65' } },
  { code: 1007, name: 'Farm Plots', swatch: { width: 15, height: 11, border: '2px solid #4ce600', bgcolor: '#c5e1a5' } },
];
const DRAWN = '#2f5f8a';

/** Index statistics (mean, min, max) of the AOI on the chosen date, or the latest date of the period. */
function useAoiStats(sat) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    if (!sat.status.configured || !sat.wkt || !sat.current || sat.current.visual) { setSt(null); return undefined; }
    let alive = true;
    setSt({ busy: true });
    const from = sat.scene || sat.from;
    const to = sat.scene || sat.to;
    api.getStats({ index: sat.index, geometry: sat.wkt, from, to, maxcc: sat.maxcc })
      .then((rows) => { if (alive) setSt(rows?.length ? { ...rows[rows.length - 1] } : { none: true }); })
      .catch((e) => { if (alive) setSt({ error: e.message }); });
    return () => { alive = false; };
  }, [sat.status.configured, sat.wkt, sat.index, sat.scene, sat.from, sat.to, sat.maxcc, sat.current]); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}

function AoiFacts({ sat, accent }) {
  const isAr = useIsArabic();
  const st = useAoiStats(sat);
  if (!sat.aoi) return null;
  const n = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(2));
  return (
    <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 2, rowGap: 1, p: 1.5, bgcolor: 'action.hover', fontSize: '0.75rem' }}>
      <Typography component="dt" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{isAr ? 'المنطقة' : 'Area'}</Typography>
      <Typography component="dd" sx={{ m: 0, fontSize: '0.75rem', fontWeight: 600 }}>
        {sat.aoi.properties?.name || 'AOI'} · <bdi dir="ltr">{aoiAreaHa(sat.aoi).toLocaleString('en-US', { maximumFractionDigits: 1 })} ha</bdi>
      </Typography>
      <Typography component="dt" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{isAr ? 'التاريخ' : 'Date'}</Typography>
      <Typography component="dd" sx={{ m: 0, fontSize: '0.75rem' }}><bdi dir="ltr">{st?.date || sat.scene || `${sat.from} → ${sat.to}`}</bdi></Typography>
      <Typography component="dt" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{isAr ? 'المصدر' : 'Source'}</Typography>
      <Typography component="dd" sx={{ m: 0, fontSize: '0.75rem' }}><bdi dir="ltr">Sentinel-2 L2A · 10 m</bdi></Typography>
      {sat.current && !sat.current.visual && (
        <>
          <Typography component="dt" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}><bdi dir="ltr">{sat.current.key}</bdi></Typography>
          <Typography component="dd" sx={{ m: 0, fontSize: '0.75rem', fontWeight: 600, color: accent }}>
            {st?.busy ? <CircularProgress size={12} /> : st?.error ? <span style={{ fontWeight: 400 }}>{st.error}</span> : st?.none ? (isAr ? 'لا صورة صافية' : 'No clear image') : (
              <bdi dir="ltr">{n(st?.mean)} <span style={{ fontWeight: 400, color: 'var(--sheet-ink-3)' }}>({n(st?.min)} – {n(st?.max)})</span></bdi>
            )}
          </Typography>
        </>
      )}
    </Box>
  );
}

export function AoiPanel({ sat, mapRef, fields = [], structures = [] }) {
  const isAr = useIsArabic();
  const fileRef = useRef(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [coord, setCoord] = useState('');
  const zoomTo = (feature) => {
    const ring = outerRing(feature);
    if (ring && mapRef.current) mapRef.current.fitBounds(L.latLngBounds(ring.map(([lng, lat]) => [lat, lng])), { padding: [40, 40], maxZoom: 17 });
  };
  const drawn = sat.aoiMode === 'drawn';
  const accent = drawn ? DRAWN : '#1f7a4d';
  const counts = useMemo(() => {
    const c = {}; structures.forEach((s) => { c[s.code] = (c[s.code] || 0) + 1; }); return c;
  }, [structures]);
  const shownStructures = useMemo(() => {
    const q = query.trim().toLowerCase();
    return structures.filter((s) => sat.structTypes.includes(s.code) && (!q || `${s.label} ${s.key}`.toLowerCase().includes(q)));
  }, [structures, sat.structTypes, query]);
  const pickStructure = (s) => {
    const ring = outerRing(s.feature);
    if (!ring) return;
    const f = ringToFeature(ring, s.label);
    sat.setAoi(f); zoomTo(f);
  };
  const toggleType = (code) => sat.setStructTypes((t) => (t.includes(code) ? t.filter((x) => x !== code) : [...t, code]));
  const setMode = (m) => { sat.setAoiMode(m); sat.setDrawing(false); sat.setShow(true); sat.setAoi(m === 'drawn' ? (sat.myAreas.find((a) => a.id === sat.activeArea)?.feature || null) : null); };
  const exportArea = () => {
    if (!sat.aoi) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ type: 'FeatureCollection', features: [sat.aoi] })], { type: 'application/geo+json' }));
    const a = document.createElement('a'); a.href = url; a.download = `${(sat.aoi.properties?.name || 'aoi').replace(/[^\w؀-ۿ-]+/g, '_')}.geojson`; a.click(); URL.revokeObjectURL(url);
  };
  const tab = (on, color) => ({
    height: 40, gap: 1, fontSize: '0.8125rem', fontWeight: on ? 600 : 400, bgcolor: on ? color : 'background.paper', color: on ? '#fff' : 'text.primary',
    '&:hover': { bgcolor: on ? color : 'action.hover' },
  });
  const drawTool = (shape, label, icon) => (
    <ButtonBase key={shape} aria-pressed={sat.drawing === shape} onClick={() => sat.setDrawing(sat.drawing === shape ? false : shape)}
      sx={{ height: 56, flexDirection: 'column', gap: 0.5, fontSize: '0.6875rem', border: 1, borderColor: sat.drawing === shape ? DRAWN : 'divider', bgcolor: sat.drawing === shape ? alpha(DRAWN, 0.1) : 'background.paper', color: sat.drawing === shape ? DRAWN : 'text.primary' }}>
      {icon}{label}
    </ButtonBase>
  );
  return (
    <Box sx={{ ...section, display: 'grid', gap: 2 }}>
      <Box role="tablist" sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', border: 1, borderColor: 'divider' }}>
        <ButtonBase role="tab" aria-selected={!drawn} onClick={() => setMode('structures')} sx={tab(!drawn, '#1f7a4d')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="8" cy="9" r="5" /><rect x="12" y="12" width="9" height="8" /></svg>
          <bdi dir="ltr">Agro_Structures</bdi>
        </ButtonBase>
        <ButtonBase role="tab" aria-selected={drawn} onClick={() => setMode('drawn')} sx={{ ...tab(drawn, DRAWN), borderInlineStart: 1, borderColor: 'divider' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 18 9 5l11 4-4 10z" /></svg>
          {isAr ? 'منطقة أرسمها' : 'Area I draw'}
        </ButtonBase>
      </Box>

      {!drawn ? (
        <>
          <Box role="group" aria-label="Structure_Type" sx={{ display: 'grid', gap: 0.5 }}>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}><bdi dir="ltr">Structure_Type</bdi></Typography>
            {STRUCT_TYPES.map((t) => {
              const on = sat.structTypes.includes(t.code);
              return (
                <Box component="label" key={t.code} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 44, px: 1.5, cursor: 'pointer', border: 1, borderColor: on ? alpha('#1f7a4d', 0.35) : 'divider', bgcolor: on ? alpha('#1f7a4d', 0.07) : 'transparent' }}>
                  <input type="checkbox" checked={on} onChange={() => toggleType(t.code)} style={{ width: 18, height: 18, accentColor: '#1f7a4d', margin: 0 }} />
                  <Box component="span" aria-hidden sx={t.swatch} />
                  <Box component="span" sx={{ flex: 1, fontWeight: 500, fontSize: '0.8125rem' }}><bdi dir="ltr">{t.name}</bdi></Box>
                  <Box component="span" sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}><bdi dir="ltr">{t.code}</bdi></Box>
                  <Box component="span" sx={{ fontSize: '0.75rem', minWidth: 28, textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}>{counts[t.code] || 0}</Box>
                </Box>
              );
            })}
          </Box>
          <FormControlLabel sx={{ m: 0, justifyContent: 'space-between' }} labelPlacement="start"
            control={<Switch checked={sat.structClip} onChange={(e) => { sat.setStructClip(e.target.checked); if (e.target.checked) sat.setShow(true); }} />}
            label={<Typography sx={{ fontSize: '0.8125rem' }}>{isAr ? 'قصّ الصورة على حدود هذه الحقول' : 'Clip the image to these fields'}</Typography>} />
          <Box sx={{ border: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, height: 40, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
              <TextField variant="standard" fullWidth value={query} onChange={(e) => setQuery(e.target.value)} placeholder={isAr ? 'بحث بالاسم أو الرمز' : 'Search name or code'}
                InputProps={{ disableUnderline: true, sx: { fontSize: '0.75rem' } }} inputProps={{ 'aria-label': 'Search fields' }} />
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{shownStructures.length}</Typography>
            </Box>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, maxHeight: 260, overflow: 'auto' }}>
              {shownStructures.length === 0 && (
                <Typography component="li" sx={{ p: 2, fontSize: '0.75rem', color: 'text.secondary' }}>
                  {isAr ? 'لا حقول من هذين النوعين في الطبقات الظاهرة.' : 'No fields of these types in the visible layers.'}
                </Typography>
              )}
              {shownStructures.slice(0, 400).map((s) => {
                const sel = sat.aoi?.properties?.name === s.label;
                const t = STRUCT_TYPES.find((x) => x.code === s.code);
                return (
                  <Box component="li" key={s.key}>
                    <ButtonBase onClick={() => pickStructure(s)} sx={{ width: '100%', justifyContent: 'flex-start', gap: 1.25, px: 1.5, minHeight: 38, textAlign: 'start', bgcolor: sel ? alpha('#1f7a4d', 0.1) : 'transparent', boxShadow: sel ? 'inset -2px 0 0 #1f7a4d' : 'none', '&:hover': { bgcolor: 'action.hover' } }}>
                      <Box component="span" aria-hidden sx={{ ...t?.swatch, width: 11, height: t?.code === 1006 ? 11 : 9 }} />
                      <Box component="span" sx={{ flex: 1, minWidth: 0, fontSize: '0.75rem', fontWeight: sel ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</Box>
                      <Box component="span" sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}><bdi dir="ltr">{s.code2 || ''}</bdi></Box>
                    </ButtonBase>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.75 }}>
            {drawTool('polygon', isAr ? 'مضلع' : 'Polygon', <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 18 9 5l11 4-4 10z" /></svg>)}
            {drawTool('rectangle', isAr ? 'مستطيل' : 'Rectangle', <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6h16v12H4z" /></svg>)}
            {drawTool('circle', isAr ? 'دائرة' : 'Circle', <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8" /></svg>)}
            <ButtonBase onClick={() => fileRef.current?.click()} sx={{ height: 56, flexDirection: 'column', gap: 0.5, fontSize: '0.6875rem', border: 1, borderColor: 'divider' }}>
              <UploadIcon sx={{ fontSize: 20 }} />{isAr ? 'رفع ملف' : 'Upload'}
            </ButtonBase>
            <input ref={fileRef} type="file" accept=".geojson,.json,.kml" hidden onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try { setError(null); const f = await readAoiFile(file); sat.addArea({ ...f, properties: { ...(f.properties || {}), name: file.name.replace(/\.[^.]+$/, '') } }); zoomTo(f); } catch (err) { setError(err.message); }
            }} />
          </Box>
          {sat.drawing && (
            <Typography sx={{ fontSize: '0.75rem', color: DRAWN }}>
              {sat.drawing === 'polygon' ? (isAr ? 'انقر لإضافة النقاط، وأنهِ على النقطة الأولى' : 'Click points; finish on the first point')
                : sat.drawing === 'rectangle' ? (isAr ? 'اسحب لرسم المستطيل' : 'Drag to draw the rectangle') : (isAr ? 'اسحب من المركز لرسم الدائرة' : 'Drag from the centre to draw the circle')}
            </Typography>
          )}
          <Box sx={{ border: 1, borderColor: sat.withStructures ? alpha('#1f7a4d', 0.35) : 'divider', bgcolor: sat.withStructures ? alpha('#1f7a4d', 0.05) : 'transparent' }}>
            <FormControlLabel sx={{ m: 0, px: 1.5, minHeight: 48, width: '100%', justifyContent: 'space-between' }} labelPlacement="start"
              control={<Switch checked={sat.withStructures} onChange={(e) => { sat.setWithStructures(e.target.checked); if (e.target.checked) sat.setShow(true); }} />}
              label={(
                <Box>
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500 }}>{isAr ? 'أظهر حقول Agro_Structures أيضاً' : 'Also show Agro_Structures'}</Typography>
                  <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}>{isAr ? 'المؤشر داخل منطقتي وداخل هذه الحقول' : 'Index inside my area and inside these fields'}</Typography>
                </Box>
              )} />
            {sat.withStructures && (
              <Box role="group" aria-label="Structure_Type" sx={{ display: 'grid', borderTop: 1, borderColor: 'divider' }}>
                {STRUCT_TYPES.map((t) => {
                  const on = sat.structTypes.includes(t.code);
                  return (
                    <Box component="label" key={t.code} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 40, px: 1.5, cursor: 'pointer' }}>
                      <input type="checkbox" checked={on} onChange={() => toggleType(t.code)} style={{ width: 16, height: 16, accentColor: '#1f7a4d', margin: 0 }} />
                      <Box component="span" aria-hidden sx={t.swatch} />
                      <Box component="span" sx={{ flex: 1, fontSize: '0.8125rem' }}><bdi dir="ltr">{t.name}</bdi></Box>
                      <Box component="span" sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}><bdi dir="ltr">{t.code}</bdi></Box>
                      <Box component="span" sx={{ fontSize: '0.75rem', minWidth: 28, textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}>{counts[t.code] || 0}</Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
          <Box sx={{ border: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, height: 40, bgcolor: alpha(DRAWN, 0.08), borderBottom: 1, borderColor: 'divider' }}>
              <Typography sx={{ flex: 1, fontSize: '0.8125rem', fontWeight: 600, color: DRAWN }}>{isAr ? 'مناطقي' : 'My areas'}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{sat.myAreas.length}</Typography>
            </Box>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, maxHeight: 260, overflow: 'auto' }}>
              {sat.myAreas.length === 0 && (
                <Typography component="li" sx={{ p: 2, fontSize: '0.75rem', color: 'text.secondary' }}>
                  {isAr ? 'ارسم منطقة أو ارفع ملفاً. تُحفظ هنا ولا ترتبط بطبقة Agro_Structures.' : 'Draw an area or upload a file. It is kept here, apart from Agro_Structures.'}
                </Typography>
              )}
              {sat.myAreas.map((a) => {
                const sel = a.id === sat.activeArea;
                return (
                  <Box component="li" key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pe: 0.5, minHeight: 44, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 }, bgcolor: sel ? alpha(DRAWN, 0.08) : 'transparent', boxShadow: sel ? `inset -2px 0 0 ${DRAWN}` : 'none', opacity: a.visible ? 1 : 0.6 }}>
                    <IconButton size="small" aria-label={a.visible ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'إظهار' : 'Show')} onClick={() => sat.updateArea(a.id, { visible: !a.visible })} sx={{ color: a.visible ? DRAWN : 'text.disabled' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">{a.visible ? <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6" /> : <path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3 3.6M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4.4-1.1" />}</svg>
                    </IconButton>
                    <Box component="span" aria-hidden sx={{ width: 14, height: 11, border: `2px dashed ${DRAWN}`, bgcolor: sel ? alpha(DRAWN, 0.25) : 'transparent', flexShrink: 0 }} />
                    {renaming === a.id ? (
                      <TextField variant="standard" autoFocus defaultValue={a.name} sx={{ flex: 1, mx: 1 }} inputProps={{ 'aria-label': isAr ? 'اسم المنطقة' : 'Area name', style: { fontSize: '0.8125rem' } }}
                        onBlur={(e) => { sat.updateArea(a.id, { name: e.target.value.trim() || a.name }); setRenaming(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setRenaming(null); }} />
                    ) : (
                      <ButtonBase onClick={() => { sat.selectArea(a.id); zoomTo(a.feature); }} onDoubleClick={() => setRenaming(a.id)}
                        sx={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', gap: 1, px: 1, minHeight: 40, textAlign: 'start' }}>
                        <Box component="span" sx={{ flex: 1, minWidth: 0, fontSize: '0.8125rem', fontWeight: sel ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</Box>
                        <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}><bdi dir="ltr">{aoiAreaHa(a.feature).toLocaleString('en-US', { maximumFractionDigits: 1 })} ha</bdi></Box>
                      </ButtonBase>
                    )}
                    <IconButton size="small" aria-label={isAr ? 'إعادة تسمية' : 'Rename'} onClick={() => setRenaming(a.id)}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>
                    </IconButton>
                    <IconButton size="small" aria-label={isAr ? 'حذف' : 'Delete'} onClick={() => sat.removeArea(a.id)}>
                      <ClearIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                  </Box>
                );
              })}
            </Box>
          </Box>
          <TextField size="small" label={isAr ? 'اذهب إلى إحداثيات (خط العرض، خط الطول)' : 'Go to coordinates (lat, lng)'} placeholder="24.2134, 55.7612" value={coord}
            onChange={(e) => setCoord(e.target.value)} inputProps={{ dir: 'ltr' }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const ll = parseLatLng(coord);
              if (ll && mapRef.current) mapRef.current.setView(ll, 15); else setError(isAr ? 'اكتب الإحداثيات هكذا: خط العرض، خط الطول' : 'Write the coordinates as: latitude, longitude');
            }} />
          {!sat.aoi && (
            <Alert severity="info" icon={false} sx={{ py: 0.5, fontSize: '0.75rem' }}>
              {isAr ? 'يظهر المؤشر داخل المنطقة فقط. ارسمها أو اخترها من «مناطقي».' : 'The index shows only inside the area. Draw it or pick one from My areas.'}
            </Alert>
          )}
        </>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      <AoiFacts sat={sat} accent={accent} />
      {sat.aoi && (
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<ZoomIcon />} onClick={() => zoomTo(sat.aoi)}>{isAr ? 'تكبير إلى المنطقة' : 'Zoom to area'}</Button>
          {drawn && <Button size="small" onClick={exportArea}><bdi dir="ltr">GeoJSON</bdi></Button>}
          {!drawn && <Button size="small" color="inherit" startIcon={<ClearIcon />} onClick={() => sat.setAoi(null)}>{isAr ? 'إلغاء التحديد' : 'Clear'}</Button>}
        </Stack>
      )}
    </Box>
  );
}

/** One side of the compare: its own index layer and its own date. */
function CompareSide({ side, sat, index, onIndex, date, onDate, scenes, busy, onFind, error, hint }) {
  const tone = side === 'A' ? '#1d5c3c' : '#2f6fd0';
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, bgcolor: tone, color: '#fff' }}>
        <Box component="span" sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.18)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>{side}</Box>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#fff', flex: 1 }}>{side === 'A' ? 'Side A' : 'Side B'}</Typography>
        <Typography sx={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.8)' }}>{hint}</Typography>
      </Box>
      <Box sx={{ p: 2, display: 'grid', gap: 1.5 }}>
        <TextField select size="small" label="Index layer" value={index} onChange={(e) => onIndex(e.target.value)} fullWidth
          SelectProps={{ native: true }} InputLabelProps={{ shrink: true }}>
          {sat.indices.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
        </TextField>
        <TextField size="small" type="date" label="Date" fullWidth InputLabelProps={{ shrink: true }}
          value={date || ''} onChange={(e) => onDate(e.target.value || null)}
          helperText={!date && side === 'A' ? `Empty: best image of ${sat.from} → ${sat.to}` : undefined} />
        <Button size="small" variant="outlined" onClick={onFind} disabled={!sat.status.configured || busy}>
          {busy ? 'Searching…' : `Find scenes for side ${side}`}
        </Button>
        {error && <Alert severity="error">{error}</Alert>}
      </Box>
      {scenes && <Box sx={{ borderTop: 1, borderColor: 'divider', maxHeight: 220, overflowY: 'auto' }}><SceneList scenes={scenes} value={date} allowLatest={false} onPick={onDate} /></Box>}
    </Box>
  );
}

/** Change detection: Side A and Side B, each with its own index layer and date, split by a swipe handle. */
export function ComparePanel({ sat, mapRef }) {
  const sA = useSceneSearch(sat, mapRef);
  const sB = useSceneSearch(sat, mapRef);
  const indexB = sat.compare.indexB || sat.index;
  const setB = (patch) => { sat.setCompare((c) => ({ ...c, ...patch, on: true })); sat.setShow(true); };
  return (
    <Box>
      <Box sx={section}>
        <FormControlLabel
          control={<Switch checked={sat.compare.on} onChange={(e) => { sat.setCompare((c) => ({ ...c, on: e.target.checked })); if (e.target.checked) sat.setShow(true); }} />}
          label={<Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>Compare two sides</Typography>}
        />
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}>
          Drag the handle on the map to move between side A and side B.
        </Typography>
      </Box>
      <Box sx={{ px: 2.5, pb: 2.5, display: 'grid', gap: 2 }}>
        <CompareSide side="A" sat={sat} hint={document.documentElement.dir === 'rtl' ? 'right of the handle' : 'left of the handle'}
          index={sat.index} onIndex={(k) => { sat.setIndex(k); sat.setShow(true); }}
          date={sat.scene} onDate={(d) => { sat.setScene(d); sat.setShow(true); }}
          scenes={sA.scenes} busy={sA.busy} onFind={sA.search} error={sA.error} />
        <CompareSide side="B" sat={sat} hint={document.documentElement.dir === 'rtl' ? 'left of the handle' : 'right of the handle'}
          index={indexB} onIndex={(k) => setB({ indexB: k })}
          date={sat.compare.date} onDate={(d) => setB({ date: d })}
          scenes={sB.scenes} busy={sB.busy} onFind={sB.search} error={sB.error} />
      </Box>
    </Box>
  );
}

/** Time series of the index over the AOI. */
export function TimeSeriesPanel({ sat }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const canRun = sat.status.configured && sat.wkt && sat.current && !sat.current.visual;
  const run = async () => {
    setBusy(true); setError(null);
    try { setData(await api.getStats({ index: sat.index, geometry: sat.wkt, from: sat.from, to: sat.to, maxcc: sat.maxcc })); } catch (e) { setError(e.message); }
    setBusy(false);
  };
  const csv = useMemo(() => (data ? ['date,mean,min,max', ...data.map((d) => `${d.date},${d.mean},${d.min},${d.max}`)].join('\n') : ''), [data]);
  return (
    <Box sx={section}>
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
        <bdi translate="no">{sat.current?.label || ''}</bdi>{' · '}<bdi>{`${sat.from} → ${sat.to}`}</bdi>{` · ${sat.aoi?.properties?.name || 'no AOI'}`}
      </Typography>
      {!sat.aoi && <Alert severity="info" sx={{ mt: 1.5 }}>Set an AOI first (draw it, upload it or pick a field).</Alert>}
      {sat.current?.visual && <Alert severity="info" sx={{ mt: 1.5 }}>Choose an index (NDVI, NDWI, NDMI …), not a band combination.</Alert>}
      <Button fullWidth variant="contained" sx={{ mt: 1.5 }} disabled={!canRun || busy} onClick={run} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}>
        Build time series
      </Button>
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      {data && (
        data.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>No clear scenes in this period.</Typography> : (
          <>
            <Box dir="ltr" sx={{ height: 220, mt: 2 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.map((d) => ({ ...d, range: [d.min, d.max] }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={16} />
                  <YAxis tick={{ fontSize: 11 }} width={40} domain={['auto', 'auto']} />
                  <Tooltip />
                  <Area dataKey="range" name="min–max" stroke="none" fill="#2e7d32" fillOpacity={0.15} />
                  <Line dataKey="mean" name="mean" stroke="#1b5e20" strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}><bdi>{`${data.length} scenes`}</bdi></Typography>
              <ExportButton size="small" format="csv" label="Export to CSV" onClick={() => {
                const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                const a = document.createElement('a'); a.href = url; a.download = `${sat.index}_${sat.from}_${sat.to}.csv`; a.click();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
              }} />
            </Box>
          </>
        )
      )}
    </Box>
  );
}

/** What is on the map: source, index, date, filters, AOI. */
export function MetadataPanel({ sat }) {
  const rows = [
    ['Satellite', 'Sentinel-2 L2A (ESA Copernicus)'],
    ['Service', sat.status.service === 'copernicus' ? 'Copernicus Data Space' : 'Sentinel Hub'],
    sat.status.label && ['Configuration', sat.status.label],
    ['Layer', sat.current?.label],
    ['Formula', sat.current?.formula],
    ['Date', sat.scene || `${sat.from} → ${sat.to}`],
    ['Cloud cover ≤', `${sat.maxcc}%`],
    ['Resolution', '10 m (visible, NIR) · 20 m (SWIR)'],
    ['Revisit', '≈ 5 days'],
    ['AOI', sat.aoi ? `${sat.aoi.properties?.name || 'AOI'} · ${aoiAreaHa(sat.aoi).toLocaleString('en-US', { maximumFractionDigits: 2 })} ha` : '—'],
    ['Clip', sat.aoiMode === 'structures' ? (sat.structClip ? `Agro_Structures · ${sat.structTypes.join(', ')}` : 'No')
      : [sat.aoi ? 'My area' : null, sat.withStructures ? `Agro_Structures · ${sat.structTypes.join(', ')}` : null].filter(Boolean).join(' + ') || '—'],
  ].filter(Boolean);
  return (
    <Box component="dl" sx={{ ...section, m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 1 }}>
      {rows.map(([k, v]) => (
        <Box key={k} sx={{ display: 'contents' }}>
          <Typography component="dt" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{k}</Typography>
          <Typography component="dd" sx={{ m: 0, fontSize: '0.8125rem', fontWeight: 500, overflowWrap: 'anywhere' }}><bdi translate="no">{v || '—'}</bdi></Typography>
        </Box>
      ))}
      <Box sx={{ gridColumn: '1 / -1', mt: 1 }}>
        <HelpTip>Images come from the satellite service through the AgroCloud server; the configuration ID stays on the server.</HelpTip>
      </Box>
    </Box>
  );
}

/** PNG of the AOI (or the current view) for the chosen index and date. */
export async function downloadImage(sat, map) {
  const box = sat.aoi ? aoiBbox(sat.aoi) : (() => { const b = map.getBounds(); return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]; })();
  const sw = L.CRS.EPSG3857.project(L.latLng(box[1], box[0]));
  const ne = L.CRS.EPSG3857.project(L.latLng(box[3], box[2]));
  const ratio = (ne.y - sw.y) / (ne.x - sw.x || 1);
  const width = 1024;
  const height = Math.max(64, Math.min(1024, Math.round(width * ratio)));
  const q = new URLSearchParams({
    k: sat.tileKey, LAYERS: 'S2', INDEX: sat.index, BBOX: `${sw.x},${sw.y},${ne.x},${ne.y}`, CRS: 'EPSG:3857',
    WIDTH: String(width), HEIGHT: String(height), TIME: sat.time, MAXCC: String(sat.maxcc), FORMAT: 'image/png',
  });
  if (sat.clip && sat.wkt) q.set('GEOMETRY', sat.wkt);
  const res = await fetch(`${api.WMS_URL}?${q.toString()}`);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sat.index}_${sat.scene || sat.to}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Vertical legend in the map's top-left corner while an index is shown.
 * Position is a plain style (always the physical left), below the zoom buttons
 * or the warning banner when those are in that corner.
 */
export function MapIndexLegend({ sat, top = 12, side = 'left' }) {
  if (!sat.ready || !sat.show || !sat.current?.legend) return null;
  const legend = sat.current.legend;
  const min = legend[0].value;
  const max = legend[legend.length - 1].value;
  const pos = (v) => `${((max - v) / (max - min || 1)) * 100}%`;
  const gradient = `linear-gradient(to top, ${legend.map((l) => `${l.color} ${((l.value - min) / (max - min || 1)) * 100}%`).join(', ')})`;
  return (
    <Box
      role="img"
      aria-label={`${sat.current.label} legend, ${min} to ${max}`}
      style={{ position: 'absolute', [side]: side === 'left' ? 12 : 56, top, zIndex: 1000 }}
      sx={(t) => ({ p: 1, pb: 1.25, borderRadius: 1.5, bgcolor: alpha(t.palette.background.paper, 0.94), boxShadow: 2, border: 1, borderColor: 'divider' })}
    >
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, textAlign: 'center' }} translate="no">{sat.current.label}</Typography>
      <Typography sx={{ fontSize: '0.625rem', color: 'text.secondary', textAlign: 'center', mb: 1, maxWidth: 88 }}><bdi>{sat.scene || sat.to}</bdi></Typography>
      <Box dir="ltr" sx={{ display: 'flex', gap: 0.75, height: 140, mx: 'auto', width: 'fit-content' }}>
        <Box sx={{ width: 12, borderRadius: 6, flexShrink: 0 }} style={{ background: gradient }} />
        <Box sx={{ position: 'relative', width: 34 }}>
          {legend.map((l) => (
            <Typography key={l.value} component="span" sx={{ position: 'absolute', left: 0, transform: 'translateY(-50%)', fontSize: '0.625rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'text.secondary', whiteSpace: 'nowrap' }} style={{ top: pos(l.value) }}>
              {l.value}
            </Typography>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

/** Drag handle for the compare swipe (keyboard: arrows). */
export function CompareSwipe({ sat }) {
  const boxRef = useRef(null);
  if (!sat.ready || !sat.show || !sat.compare.on || !sat.compare.date) return null;
  const rtl = document.documentElement.dir === 'rtl';
  const set = (v) => sat.setCompare((c) => ({ ...c, swipe: Math.min(95, Math.max(5, v)) }));
  const fromEvent = (e) => {
    const r = boxRef.current.parentElement.getBoundingClientRect();
    set(((e.clientX - r.left) / r.width) * 100);
  };
  return (
    <Box ref={boxRef} sx={{ position: 'absolute', top: 0, bottom: 0, left: `${sat.compare.swipe}%`, zIndex: 1000, width: 0 }}>
      <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: -1, width: 2, bgcolor: 'common.white', boxShadow: '0 0 4px rgba(0,0,0,.5)' }} />
      <Box
        role="slider" tabIndex={0} aria-label="Compare dates" aria-valuemin={5} aria-valuemax={95} aria-valuenow={Math.round(sat.compare.swipe)}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (e.buttons === 1) fromEvent(e); }}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft') set(sat.compare.swipe - 2); if (e.key === 'ArrowRight') set(sat.compare.swipe + 2); }}
        sx={(t) => ({
          position: 'absolute', top: '50%', left: -18, width: 36, height: 36, mt: '-18px', borderRadius: '50%', cursor: 'ew-resize',
          bgcolor: 'common.white', color: 'text.primary', display: 'grid', placeItems: 'center', boxShadow: 3, fontSize: 14, fontWeight: 700, userSelect: 'none', touchAction: 'none',
          '&:focus-visible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 2 },
        })}
      >
        ⇆
      </Box>
      <Typography sx={{ position: 'absolute', top: 10, [rtl ? 'right' : 'left']: 8, px: 0.75, borderRadius: 1, bgcolor: 'rgba(0,0,0,.6)', color: '#fff', fontSize: '0.6875rem', whiteSpace: 'nowrap' }}><bdi>{`B · ${(sat.indices.find((i) => i.key === (sat.compare.indexB || sat.index)) || {}).label || sat.compare.indexB || sat.index} · ${sat.compare.date}`}</bdi></Typography>
      <Typography sx={{ position: 'absolute', top: 10, [rtl ? 'left' : 'right']: 8, px: 0.75, borderRadius: 1, bgcolor: 'rgba(0,0,0,.6)', color: '#fff', fontSize: '0.6875rem', whiteSpace: 'nowrap' }}><bdi>{`A · ${sat.current?.label || sat.index} · ${sat.scene || sat.to}`}</bdi></Typography>
    </Box>
  );
}

const PERIODS = [
  { key: '3m', label: '3 months', months: 3 },
  { key: '6m', label: '6 months', months: 6 },
  { key: '1y', label: '1 year', months: 12 },
  { key: '2y', label: '2 years', months: 24 },
  { key: 'custom', label: 'Imagery dates', months: 0 },
];
const iso = (d) => d.toISOString().slice(0, 10);
function periodRange(key, sat) {
  const p = PERIODS.find((x) => x.key === key);
  if (!p || !p.months) return { from: sat.from, to: sat.to };
  const to = new Date(sat.to || Date.now());
  const from = new Date(to);
  from.setMonth(from.getMonth() - p.months);
  return { from: iso(from), to: iso(to) };
}

/** Saves the chart (SVG) as a PNG figure. */
function downloadFigure(container, name) {
  const svg = container?.querySelector('svg.recharts-surface');
  if (!svg) return;
  const box = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', box.width);
  clone.setAttribute('height', box.height);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = box.width * 2; c.height = box.height * 2;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.scale(2, 2); g.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `${name}.png`; a.click();
  };
  img.src = url;
}

/**
 * Time series across the bottom of the map (like LandViewer): index, period,
 * Apply; min–max band with the mean; figure (PNG) and table (CSV) export.
 */
export function TimeSeriesDock({ sat, onClose, onSetAoi }) {
  const [period, setPeriod] = useState('1y');
  const [idx, setIdx] = useState(sat.current && !sat.current.visual ? sat.index : 'NDVI');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const indices = sat.indices.filter((i) => !i.visual);
  const range = periodRange(period, sat);
  const run = async () => {
    if (!sat.wkt) return;
    setBusy(true); setError(null);
    try { setData(await api.getStats({ index: idx, geometry: sat.wkt, from: range.from, to: range.to, maxcc: sat.maxcc })); } catch (e) { setError(e.message); setData(null); }
    setBusy(false);
  };
  const name = `${idx}_${range.from}_${range.to}`;
  const csv = () => {
    const text = ['date,mean,min,max', ...data.map((d) => `${d.date},${d.mean},${d.min},${d.max}`)].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  return (
    <Box role="region" aria-label="Time series" sx={(t) => ({ borderRadius: 1.5, border: 1, borderColor: 'divider', boxShadow: 3, bgcolor: alpha(t.palette.background.paper, 0.97), overflow: 'hidden' })}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, pt: 1.5, pb: 1, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}>
        <TextField select size="small" label="Index" value={idx} onChange={(e) => setIdx(e.target.value)} sx={{ minWidth: 140 }} SelectProps={{ native: true }}>
          {indices.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
        </TextField>
        <TextField select size="small" label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} sx={{ minWidth: 140 }} SelectProps={{ native: true }}>
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </TextField>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}><bdi>{`Sentinel-2 · ${range.from} → ${range.to}`}</bdi></Typography>
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="contained" onClick={run} disabled={!sat.status.configured || !sat.wkt || busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : null}>Apply</Button>
        <MuiTooltip title="Close"><IconButton size="small" aria-label="Close time series" onClick={onClose}><CloseIconSmall /></IconButton></MuiTooltip>
      </Box>
      <Box sx={{ px: 1.25, py: 1 }}>
        {!sat.aoi && (
          <Alert severity="info" sx={{ py: 0 }} action={<Button size="small" onClick={onSetAoi}>Set AOI</Button>}>Set an AOI first (draw it, upload it or pick a field).</Alert>
        )}
        {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
        {sat.aoi && !data && !error && <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>Choose the index and period, then Apply.</Typography>}
        {data && data.length === 0 && <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>No clear scenes in this period.</Typography>}
        {data && data.length > 0 && (
          <>
            <Box ref={chartRef} dir="ltr" sx={{ height: { xs: 120, md: 150 } }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.map((d) => ({ ...d, range: [d.min, d.max] }))} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} width={36} domain={['auto', 'auto']} />
                  <Tooltip />
                  <Area dataKey="range" name="Min – Max" stroke="#3b82c4" strokeOpacity={0.5} fill="#3b82c4" fillOpacity={0.18} />
                  <Line dataKey="mean" name="Mean" stroke="#1b5e20" strokeWidth={2} dot={{ r: 2.5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5, flexWrap: 'wrap' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}><Box sx={{ width: 14, height: 8, bgcolor: 'rgba(59,130,196,.35)', borderRadius: 0.5 }} />Min – Max</Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}><Box sx={{ width: 14, height: 3, bgcolor: '#1b5e20' }} />Mean</Box>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', flex: 1 }}>
                <bdi>{`${data.length} scenes · ${sat.aoi?.properties?.name || 'AOI'} · ${aoiAreaHa(sat.aoi).toLocaleString('en-US', { maximumFractionDigits: 1 })} ha`}</bdi>
              </Typography>
              <Button size="small" startIcon={<FigureIcon />} onClick={() => downloadFigure(chartRef.current, name)}>Figure</Button>
              <Button size="small" startIcon={<TableIcon />} onClick={csv}>Table</Button>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
