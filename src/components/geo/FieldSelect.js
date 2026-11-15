import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, useMap } from 'react-leaflet';
import {
  TextField, MenuItem, Box, IconButton, InputAdornment, Tooltip, Dialog, DialogTitle, DialogContent,
  ButtonBase, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import {
  MapOutlined as MapIcon, FormatListBulletedOutlined as ListIcon, LegendToggleOutlined as LegendIcon,
  LayersOutlined as BasemapIcon, ZoomOutMapOutlined as FitIcon, SearchOutlined as SearchIcon, CloseOutlined as CloseIcon, MyLocationOutlined as LocateIcon,
} from '@mui/icons-material';
import { MapWorkspace, useMapWorkspace, useBasemap, BasemapList, MapLegend } from '../map/MapPanel';
import { apiRequest } from '../../utils/api';
import { BASEMAPS } from '../../utils/mapBasemaps';
import { MapLifecycle } from '../../utils/leafletSafe';
import { useIsArabic } from '../../i18n/shellLabels';
import { boundsOf } from './geoUtils';

/*
 * Field picker for every form: the field is the system's own map feature
 * (Agro_Structures → KeyID), so the picker shows its KeyID and structure type,
 * and the field can be picked by clicking its real shape on the map.
 */

let cache = null; // { at, promise }
/** Shapes, KeyIDs and subtypes of the organisation (shared by all pickers, 2 minutes). */
export function loadGeo(force = false) {
  if (!force && cache && Date.now() - cache.at < 120000) return cache.promise;
  const promise = Promise.all([apiRequest('/geo/layers'), apiRequest('/geo/model')])
    .then(([layers, model]) => {
      const byId = {};
      (layers?.fields || []).forEach((f) => { byId[f.id] = f; });
      return { byId, subtypes: model?.subtypes || [] };
    })
    .catch(() => ({ byId: {}, subtypes: [] }));
  cache = { at: Date.now(), promise };
  return promise;
}
export function forgetGeo() { cache = null; }

export function useGeo() {
  const [geo, setGeo] = useState(null);
  useEffect(() => { let alive = true; loadGeo().then((g) => { if (alive) setGeo(g); }); return () => { alive = false; }; }, []);
  return geo;
}

const AR_TYPES = {
  Greenhouse: 'بيت محمي', Nethouse: 'بيت شبكي', Glasshouse: 'بيت زجاجي', 'Retractable Roof Houses': 'بيت بسقف متحرك',
  Cravo: 'كرافو', 'Dates Farm': 'مزرعة نخيل', PIVOT: 'محوري', 'Farm Plots': 'قطع زراعية',
};

function subtypeOf(geo, code) {
  return code == null ? null : geo?.subtypes.find((s) => s.class_key === 'field' && Number(s.code) === Number(code)) || null;
}

/** Fit the map to the candidate fields, then to the picked one when the list is used. */
function FitMap({ bounds, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) { try { map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18 }); } catch { /* ignore */ } }
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Map of the candidate fields; clicking a shape (or a row in the Fields panel) picks that field. */
export function FieldMapDialog({ open, onClose, fields, value, onPick }) {
  const isAr = useIsArabic();
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const geo = useGeo();
  const ws = useMapWorkspace('fieldpick.workspace', 'fields');
  const [basemap, setBasemap] = useBasemap('fieldpick.basemap', 'satellite');
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState(null);
  const [fit, setFit] = useState({ key: 0, bounds: null });
  const [me, setMe] = useState(null); // the user's position, to find the field they stand in
  const shaped = useMemo(() => (geo ? fields.filter((f) => geo.byId[f.id]?.geometry) : []), [geo, fields]);
  const fc = useMemo(() => ({
    type: 'FeatureCollection',
    features: shaped.map((f) => ({ type: 'Feature', geometry: geo.byId[f.id].geometry, properties: { id: f.id, name: f.name, key: geo.byId[f.id].key_id, sub: geo.byId[f.id].subtype_code } })),
  }), [shaped, geo]);
  const allBounds = useMemo(() => {
    let b = null;
    fc.features.forEach((f) => {
      const x = boundsOf(f.geometry);
      b = b ? [[Math.min(b[0][0], x[0][0]), Math.min(b[0][1], x[0][1])], [Math.max(b[1][0], x[1][0]), Math.max(b[1][1], x[1][1])]] : x;
    });
    return b;
  }, [fc]);
  useEffect(() => { if (open && allBounds) setFit((v) => ({ key: v.key + 1, bounds: allBounds })); }, [open, allBounds]);

  const typeName = (st) => (st ? (isAr ? (st.name_ar || AR_TYPES[st.name_en] || st.name_en) : st.name_en) : (isAr ? 'بدون نوع' : 'No type'));
  const legend = useMemo(() => {
    const seen = new Map();
    shaped.forEach((f) => { const st = subtypeOf(geo, geo.byId[f.id].subtype_code); const k = st ? st.code : 'none'; if (!seen.has(k)) seen.set(k, st); });
    return [{
      title: isAr ? 'نوع المنشأة (Structure_Type)' : 'Structure type (Structure_Type)',
      items: [...seen.values()].map((st) => ({ color: st?.line_color || '#1f7a4d', label: typeName(st), shape: 'fill' })),
    }, { title: isAr ? 'التحديد' : 'Selection', items: [{ color: '#f2c94c', label: isAr ? 'الحقل المختار' : 'Chosen field', shape: 'line' }] }];
  }, [shaped, geo, isAr]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase();
  const list = fields.filter((f) => !q || f.name.toLowerCase().includes(q) || String(geo?.byId[f.id]?.key_id || '').toLowerCase().includes(q));
  const pick = (id) => { onPick(id); onClose(); };
  const fieldsPanel = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <TextField size="small" fullWidth value={query} onChange={(e) => setQuery(e.target.value)} placeholder={isAr ? 'بحث بالاسم أو KeyID' : 'Search name or KeyID'}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} inputProps={{ 'aria-label': 'Search fields' }} />
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, flex: 1, minHeight: 0, overflow: 'auto' }}>
        {list.map((f) => {
          const g = geo?.byId[f.id];
          const st = subtypeOf(geo, g?.subtype_code);
          const sel = f.id === value;
          return (
            <Box component="li" key={f.id}>
              <ButtonBase onClick={() => pick(f.id)} onMouseEnter={() => setHover(f.id)} onMouseLeave={() => setHover(null)}
                onFocus={() => { setHover(f.id); if (g?.geometry) setFit((v) => ({ key: v.key + 1, bounds: boundsOf(g.geometry) })); }}
                sx={{ width: '100%', justifyContent: 'flex-start', gap: 1.5, px: 2, minHeight: 36, textAlign: 'start', bgcolor: sel ? 'action.selected' : 'transparent', '&:hover': { bgcolor: 'action.hover' } }}>
                <Box component="span" aria-hidden sx={{ width: 10, height: 10, flexShrink: 0, bgcolor: g?.geometry ? (st?.fill_color || '#e8f2ec') : 'transparent', border: `1.5px ${g?.geometry ? 'solid' : 'dashed'} ${st?.line_color || '#9aa39d'}` }} />
                <Box component="span" sx={{ flex: 1, minWidth: 0, fontSize: '0.8125rem', fontWeight: sel ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</Box>
                <Box component="span" sx={{ fontSize: '0.6875rem', color: g?.geometry ? 'text.secondary' : 'text.disabled', flexShrink: 0 }}>
                  {g?.geometry ? <bdi dir="ltr" translate="no">{g.key_id}</bdi> : (isAr ? 'بلا شكل' : 'No shape')}
                </Box>
              </ButtonBase>
            </Box>
          );
        })}
      </Box>
    </Box>
  );

  const bm = BASEMAPS[basemap] || BASEMAPS.satellite;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth fullScreen={isPhone}>
      <DialogTitle sx={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box component="span" sx={{ flex: 1 }}>{isAr ? 'اختر الحقل من الخريطة' : 'Pick the field on the map'}</Box>
        {geo && shaped.length ? (
          <Typography component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
            {isAr ? `${shaped.length} من ${fields.length} حقل على الخريطة` : `${shaped.length} of ${fields.length} fields on the map`}
          </Typography>
        ) : null}
        <IconButton size="small" onClick={onClose} aria-label={isAr ? 'إغلاق' : 'Close'}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0, height: isPhone ? 'auto' : 600, display: 'flex', flexDirection: 'column' }}>
        {!geo ? (
          <Typography sx={{ p: 3, fontSize: '0.875rem', color: 'text.secondary' }}>{isAr ? 'جارٍ التحميل…' : 'Loading…'}</Typography>
        ) : !shaped.length ? (
          <Typography sx={{ p: 3, fontSize: '0.875rem', color: 'text.secondary' }}>
            {isAr ? 'لا أشكال لهذه الحقول بعد. ارسمها أو استوردها من ArcGIS في المناطق والمواقع ← الخريطة.' : 'These fields have no shapes yet. Draw or import them in Zones & Sites → Map.'}
          </Typography>
        ) : (
          <MapWorkspace
            id="fieldpick"
            height={isPhone ? 'calc(100vh - 64px)' : 600}
            workspace={ws}
            label={isAr ? 'أدوات الخريطة' : 'Map tools'}
            tools={[
              { key: 'fields', label: isAr ? 'الحقول' : 'Fields', title: isAr ? 'حقول منطقة المزرعة' : 'Fields of the farm area', icon: <ListIcon />, content: fieldsPanel },
              { key: 'legend', label: isAr ? 'المفتاح' : 'Legend', title: isAr ? 'مفتاح الخريطة' : 'Legend', icon: <LegendIcon />, content: <MapLegend sections={legend} /> },
              { key: 'basemap', label: isAr ? 'خريطة الأساس' : 'Basemap', title: isAr ? 'خريطة الأساس' : 'Basemap', icon: <BasemapIcon />, content: <BasemapList value={basemap} onChange={setBasemap} /> },
              { divider: true, key: 'd1' },
              { key: 'all', label: isAr ? 'عرض الكل' : 'Show all', icon: <FitIcon />, onClick: () => setFit((v) => ({ key: v.key + 1, bounds: allBounds })) },
              ...(typeof navigator !== 'undefined' && navigator.geolocation ? [{
                key: 'locate', label: isAr ? 'موقعي' : 'My location', icon: <LocateIcon />, pressed: !!me,
                onClick: () => navigator.geolocation.getCurrentPosition(
                  (pos) => { const p0 = [pos.coords.latitude, pos.coords.longitude]; setMe(p0); setFit((v) => ({ key: v.key + 1, bounds: [[p0[0] - 0.0015, p0[1] - 0.0015], [p0[0] + 0.0015, p0[1] + 0.0015]] })); },
                  () => setMe(null), { enableHighAccuracy: true, timeout: 10000 },
                ),
              }] : []),
            ]}
          >
            <MapContainer bounds={allBounds} boundsOptions={{ padding: [24, 24], maxZoom: 18 }} attributionControl={false} style={{ height: '100%', width: '100%' }}>
              <MapLifecycle />
              <TileLayer key={basemap} url={bm.url} maxZoom={20} />
              <FitMap bounds={fit.bounds} fitKey={fit.key} />
              {me && <CircleMarker center={me} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1 }} />}
              <GeoJSON
                key={`${value}-${hover}-${fc.features.length}`}
                data={fc}
                style={(f) => {
                  const st = subtypeOf(geo, f.properties.sub);
                  const sel = f.properties.id === value;
                  const hot = f.properties.id === hover;
                  return { color: sel ? '#f2c94c' : hot ? '#ffffff' : (st?.line_color || '#1f7a4d'), weight: sel || hot ? 3 : 1.5, fillColor: st?.fill_color || '#e8f2ec', fillOpacity: sel ? 0.55 : hot ? 0.45 : 0.3 };
                }}
                onEachFeature={(f, lyr) => {
                  lyr.bindTooltip(`${f.properties.key || ''} · ${f.properties.name}`, { sticky: true, direction: 'top' });
                  lyr.on('click', () => pick(f.properties.id));
                }}
              />
            </MapContainer>
          </MapWorkspace>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Drop-in replacement for a field <TextField select>: same props (name, value,
 * onChange, error, helperText, label, sx…) plus `fields` (the candidates).
 */
export default function FieldSelect({
  fields = [], value, onChange, name = 'field', label, error, helperText, disabled, sx, placeholder, onBlur, ...rest
}) {
  const isAr = useIsArabic();
  const geo = useGeo();
  const [mapOpen, setMapOpen] = useState(false);
  const current = fields.find((f) => f.id === value) || null;
  const g = current && geo ? geo.byId[current.id] : null;
  const st = subtypeOf(geo, g?.subtype_code ?? current?.subtypeCode);
  const typeName = st ? (isAr ? (st.name_ar || AR_TYPES[st.name_en] || st.name_en) : st.name_en) : (current?.type || null);
  const key = g?.key_id || current?.keyId || null;
  const anyShape = !!geo && fields.some((f) => geo.byId[f.id]?.geometry);
  const emit = (id) => onChange?.({ target: { name, value: id } });

  const keyLine = current && (key || typeName) ? (
    <Box component="span" sx={{ display: 'inline-flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      {key && <bdi dir="ltr" translate="no" style={{ fontWeight: 600 }}>{key}</bdi>}
      {typeName && <span>{typeName}</span>}
      {g?.area_ha ? <bdi dir="ltr">{Number(g.area_ha).toFixed(2)} ha</bdi> : null}
    </Box>
  ) : null;

  return (
    <>
      <TextField
        fullWidth
        select
        label={label}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        error={error}
        disabled={disabled}
        helperText={error ? helperText : (keyLine || helperText)}
        InputLabelProps={{ shrink: true }}
        SelectProps={{
          displayEmpty: true,
          renderValue: (sel) => {
            if (!sel) return <em>{placeholder || (isAr ? 'اختر الحقل' : 'Select field')}</em>;
            const f = fields.find((x) => x.id === sel);
            return f ? f.name : <em>{placeholder || (isAr ? 'اختر الحقل' : 'Select field')}</em>;
          },
        }}
        InputProps={anyShape ? {
          endAdornment: (
            <InputAdornment position="end" sx={{ mr: 3 }}>
              <Tooltip title={isAr ? 'اختر من الخريطة' : 'Pick on the map'}>
                <span>
                  <IconButton size="small" aria-label={isAr ? 'اختر الحقل من الخريطة' : 'Pick the field on the map'} disabled={disabled}
                    onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setMapOpen(true); }}>
                    <MapIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </InputAdornment>
          ),
        } : undefined}
        sx={sx}
        {...rest}
      >
        {fields.length === 0 && <MenuItem value="" disabled>{isAr ? 'لا حقول بعد' : 'No fields yet'}</MenuItem>}
        {fields.map((f) => {
          const gf = geo?.byId[f.id];
          const s2 = subtypeOf(geo, gf?.subtype_code ?? f.subtypeCode);
          return (
            <MenuItem key={f.id} value={f.id} sx={{ gap: 1.5 }}>
              <Box component="span" aria-hidden sx={{ width: 10, height: 10, flexShrink: 0, bgcolor: gf?.geometry ? (s2?.fill_color || '#e8f2ec') : 'transparent', border: `1.5px ${gf?.geometry ? 'solid' : 'dashed'} ${s2?.line_color || '#9aa39d'}` }} />
              <Box component="span" sx={{ flex: 1, minWidth: 0 }}>{f.name}</Box>
              <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                <bdi dir="ltr" translate="no">{gf?.key_id || f.keyId || ''}</bdi>
                {(s2 || f.type) ? ` · ${s2 ? (isAr ? (s2.name_ar || s2.name_en) : s2.name_en) : f.type}` : ''}
              </Box>
            </MenuItem>
          );
        })}
      </TextField>
      {anyShape && <FieldMapDialog open={mapOpen} onClose={() => setMapOpen(false)} fields={fields} value={value} onPick={emit} />}
    </>
  );
}
