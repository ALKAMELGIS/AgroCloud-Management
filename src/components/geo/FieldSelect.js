import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import {
  TextField, MenuItem, Box, IconButton, InputAdornment, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { MapOutlined as MapIcon } from '@mui/icons-material';
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

/** Map of the candidate fields; clicking a shape picks that field. */
export function FieldMapDialog({ open, onClose, fields, value, onPick }) {
  const isAr = useIsArabic();
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const geo = useGeo();
  const shaped = useMemo(() => (geo ? fields.filter((f) => geo.byId[f.id]?.geometry) : []), [geo, fields]);
  const fc = useMemo(() => ({
    type: 'FeatureCollection',
    features: shaped.map((f) => ({ type: 'Feature', geometry: geo.byId[f.id].geometry, properties: { id: f.id, name: f.name, key: geo.byId[f.id].key_id, sub: geo.byId[f.id].subtype_code } })),
  }), [shaped, geo]);
  const bounds = useMemo(() => {
    let b = null;
    fc.features.forEach((f) => {
      const x = boundsOf(f.geometry);
      b = b ? [[Math.min(b[0][0], x[0][0]), Math.min(b[0][1], x[0][1])], [Math.max(b[1][0], x[1][0]), Math.max(b[1][1], x[1][1])]] : x;
    });
    return b;
  }, [fc]);
  const bm = BASEMAPS.satellite;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isPhone}>
      <DialogTitle sx={{ fontSize: '1rem' }}>{isAr ? 'اختر الحقل من الخريطة' : 'Pick the field on the map'}</DialogTitle>
      <DialogContent sx={{ p: 0, height: isPhone ? 'auto' : 520, display: 'flex', flexDirection: 'column' }}>
        {!geo ? (
          <Typography sx={{ p: 3, fontSize: '0.875rem', color: 'text.secondary' }}>{isAr ? 'جارٍ التحميل…' : 'Loading…'}</Typography>
        ) : !shaped.length ? (
          <Typography sx={{ p: 3, fontSize: '0.875rem', color: 'text.secondary' }}>
            {isAr ? 'لا أشكال لهذه الحقول بعد. ارسمها أو استوردها من ArcGIS في المناطق والمواقع ← الخريطة.' : 'These fields have no shapes yet. Draw or import them in Zones & Sites → Map.'}
          </Typography>
        ) : (
          <Box sx={{ flex: 1, minHeight: 360 }}>
            <MapContainer bounds={bounds} boundsOptions={{ padding: [24, 24], maxZoom: 18 }} style={{ height: '100%', width: '100%' }}>
              <MapLifecycle />
              <TileLayer url={bm.url} attribution={bm.attribution} maxZoom={20} />
              <GeoJSON
                key={`${value}-${fc.features.length}`}
                data={fc}
                style={(f) => {
                  const st = subtypeOf(geo, f.properties.sub);
                  const sel = f.properties.id === value;
                  return { color: sel ? '#f2c94c' : (st?.line_color || '#1f7a4d'), weight: sel ? 3 : 1.5, fillColor: st?.fill_color || '#e8f2ec', fillOpacity: sel ? 0.55 : 0.3 };
                }}
                onEachFeature={(f, lyr) => {
                  lyr.bindTooltip(`${f.properties.key || ''} · ${f.properties.name}`, { sticky: true, direction: 'top' });
                  lyr.on('click', () => { onPick(f.properties.id); onClose(); });
                }}
              />
            </MapContainer>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5, justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
          {geo && shaped.length ? (isAr ? `${shaped.length} من ${fields.length} حقل على الخريطة` : `${shaped.length} of ${fields.length} fields on the map`) : ''}
        </Typography>
        <Button color="inherit" onClick={onClose}>{isAr ? 'إغلاق' : 'Close'}</Button>
      </DialogActions>
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
