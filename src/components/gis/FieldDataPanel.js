import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, ButtonBase, CircularProgress, IconButton, Typography } from '@mui/material';
import {
  CloseRounded as CloseIcon, ChevronRightRounded as ChevronIcon, OpenInNewRounded as OpenIcon,
  HourglassBottomRounded as PhiIcon, ArrowBackRounded as BackIcon,
} from '@mui/icons-material';
import { apiRequest } from '../../utils/api';
import { displayDate } from '../../utils/displayDate';
import { showQty, useOrgPrefs } from '../../utils/orgPrefs';

/*
 * Field data panel (GIS map → View field data). One field, linked by ZONE_ID + Farm_Code:
 * an overview of its key figures, then every form with records on it. Pick a form to see
 * its latest records and open it.
 */

const MONO = '"IBM Plex Mono", monospace';
const BAND = { ec: [1.8, 2.6], ph: [5.5, 6.5] };
const SKIP = /(^id$|_id$|^organization|^created|^updated|^deleted|_by$|uuid|geometry|^photos?$|^attachments?$|^lines?$|^comments?$|^metadata$|^gis_|^source_)/i;
// Stored units of known record fields; yield and water show in the organization's units.
const KIND = { total_quantity: 'yield', quantity: 'yield', quantity_kg: 'yield', water_m3: 'water', volume_m3: 'water' };
const UNITS = { area_ha: 'ha' };

const human = (k) => {
  const t = String(k).replace(/_/g, ' ').replace(/\b(ec|ph|phi|kg|m3)\b/gi, (m) => ({ ec: 'EC', ph: 'pH', phi: 'PHI', kg: 'kg', m3: 'm³' }[m.toLowerCase()]));
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const fmt = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(s)) return displayDate(s.slice(0, 10));
  if (/^-?\d+(\.\d+)?$/.test(s)) return fmt(Number(s));
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};
/** Up to `n` meaningful values of a record: numbers first, then short text. */
function keyValues(values, n = 4, prefs) {
  if (!values) return [];
  const entries = Object.entries(values).filter(([k, v]) => !SKIP.test(k) && !/date$/i.test(k) && fmt(v) !== null);
  const num = entries.filter(([, v]) => typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v)));
  const txt = entries.filter((e) => !num.includes(e) && String(e[1]).length <= 40);
  return [...num, ...txt].slice(0, n).map(([k, v]) => {
    if (KIND[k] && Number.isFinite(Number(v))) { const q = showQty(v, KIND[k], { p: prefs }); return { k, label: human(k), value: q.text, unit: q.unit }; }
    return { k, label: human(k), value: fmt(v), unit: k === 'cost' ? (prefs?.default_currency || 'AED') : (UNITS[k] || '') };
  });
}

function Stat({ label, value, unit, sub, tone }) {
  return (
    <Box sx={{ p: 3, borderRadius: '12px', bgcolor: 'background.paper', boxShadow: '0 0 0 1px rgba(20,33,26,0.08)' }}>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{label}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1 }}>
        <Typography sx={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', color: tone || 'text.primary' }}>{value}</Typography>
        {unit ? <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{unit}</Typography> : null}
      </Box>
      {sub ? <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>{sub}</Typography> : null}
    </Box>
  );
}

export default function FieldDataPanel({ fieldId, summary, onClose, embedded = false }) {
  const navigate = useNavigate();
  const prefs = useOrgPrefs();
  const hv = showQty(Number(summary?.harvest?.totalKg || 0), 'yield', { decimals: 0, p: prefs });
  const wv = showQty(Number(summary?.water?.totalM3 || 0), 'water', { decimals: 0, p: prefs });
  const [data, setData] = useState(null); // { zone_id, farm_code, forms }
  const [formId, setFormId] = useState(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setFormId(null);
    apiRequest(`/fields/${fieldId}/forms?records=20`)
      .then((r) => { if (live) setData(r?.data || r || { forms: [] }); })
      .catch((e) => { if (live) setData({ forms: [], error: e.message }); });
    return () => { live = false; };
  }, [fieldId]);

  const f = summary?.field || {};
  const forms = useMemo(() => [...(data?.forms || [])].sort((a, b) => (b.record_count || 0) - (a.record_count || 0)), [data]);
  const form = forms.find((x) => x.form_id === formId) || null;
  const total = forms.reduce((a, x) => a + (x.record_count || 0), 0);
  const ec = summary?.ecph || {};
  const out = (v, [lo, hi]) => Number.isFinite(Number(v)) && (Number(v) < lo || Number(v) > hi);
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '–');
  const keyLine = [data?.zone_id || f.zoneCode, data?.farm_code].filter(Boolean).join(' · ');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: embedded ? '100%' : undefined, bgcolor: '#f6f7f3' }}>
      {/* Header */}
      <Box sx={{ px: embedded ? 4 : 5, pt: embedded ? 3 : 4, pb: 3.5, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {!embedded ? <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Field</Typography> : null}
            <Typography component="h2" sx={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', mt: 0.5 }} noWrap>{f.name || '…'}</Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }} noWrap>
              {[f.siteName, f.farmAreaName, f.area ? `${f.area} ha` : null].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
          {onClose ? <IconButton onClick={onClose} aria-label="Close" size="small" sx={{ mt: -0.5, mr: -1.5 }}><CloseIcon /></IconButton> : null}
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 2.5 }}>
          {f.cropName ? <Box sx={{ px: 2, py: 0.75, borderRadius: '7px', bgcolor: 'rgba(29,107,69,0.09)', color: '#1d6b45', fontSize: 12, fontWeight: 600 }}>{f.cropName}{f.varietyName ? ` · ${f.varietyName}` : ''}</Box> : null}
          {keyLine ? <Box title="ZONE_ID · Farm_Code" sx={{ px: 2, py: 0.75, borderRadius: '7px', bgcolor: '#eef0eb', color: 'text.secondary', fontSize: 12, fontFamily: MONO }}>{keyLine}</Box> : null}
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', p: 4, display: 'grid', gap: 4, alignContent: 'start' }}>
        {(summary?.activePhi || []).map((p, i) => (
          <Box key={i} role="status" sx={{ display: 'flex', alignItems: 'center', gap: 2.5, p: 3, borderRadius: '12px', bgcolor: '#fdf3e2', color: '#8a4b06' }}>
            <PhiIcon sx={{ fontSize: 20 }} />
            <Box sx={{ fontSize: 13 }}><b>No harvest · PHI {p.daysRemaining} d left</b><br />{p.productName} · until {displayDate(String(p.phiEndDate).slice(0, 10))}</Box>
          </Box>
        ))}

        {!form ? (
          <>
            {/* Key figures */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
              <Stat label="Harvest · 30 days" value={hv.text} unit={hv.unit} sub={`${summary?.harvest?.count || 0} entries`} />
              <Stat label="Water · 30 days" value={wv.text} unit={wv.unit} />
              <Stat label="EC out · 7-day avg" value={num(ec.avgEcOut, 2)} unit="mS/cm" sub={`In ${num(ec.avgEcIn, 2)} · target 1.8–2.6`} tone={out(ec.avgEcOut, BAND.ec) ? '#b42318' : undefined} />
              <Stat label="pH out · 7-day avg" value={num(ec.avgPhOut, 1)} sub={`In ${num(ec.avgPhIn, 1)} · target 5.5–6.5`} tone={out(ec.avgPhOut, BAND.ph) ? '#b42318' : undefined} />
            </Box>

            {/* Forms linked to the field */}
            <Box sx={{ borderRadius: '12px', bgcolor: 'background.paper', boxShadow: '0 0 0 1px rgba(20,33,26,0.08)', overflow: 'hidden' }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, px: 4, py: 3, borderBottom: 1, borderColor: 'divider' }}>
                <Typography component="h3" sx={{ fontSize: 14, fontWeight: 600 }}>Forms on this field</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', fontFamily: MONO }}>{data ? `${forms.length} · ${total.toLocaleString('en-US')} records` : ''}</Typography>
              </Box>
              {!data ? <Box sx={{ p: 4 }}><CircularProgress size={18} aria-label="Loading forms" /></Box> : null}
              {data && !forms.length ? <Typography sx={{ p: 4, fontSize: 13, color: 'text.secondary' }}>{data.error || 'No form has records on this field yet.'}</Typography> : null}
              {forms.map((x) => (
                <ButtonBase key={x.form_id} onClick={() => setFormId(x.form_id)}
                  sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 3, px: 4, minHeight: 52, textAlign: 'start', '& + &': { borderTop: '1px solid', borderColor: 'divider' }, '&:hover': { bgcolor: 'action.hover' } }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 500 }} noWrap>{x.title_en}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Last {x.last_record_date ? displayDate(String(x.last_record_date).slice(0, 10)) : '–'}</Typography>
                  </Box>
                  <Typography sx={{ fontFamily: MONO, fontSize: 13, color: 'text.secondary' }}>{(x.record_count || 0).toLocaleString('en-US')}</Typography>
                  <ChevronIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                </ButtonBase>
              ))}
            </Box>
          </>
        ) : (
          /* One form: its latest records */
          <Box sx={{ borderRadius: '12px', bgcolor: 'background.paper', boxShadow: '0 0 0 1px rgba(20,33,26,0.08)', overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 2.5, borderBottom: 1, borderColor: 'divider' }}>
              <IconButton size="small" onClick={() => setFormId(null)} aria-label="Back to all forms"><BackIcon fontSize="small" /></IconButton>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography component="h3" sx={{ fontSize: 14, fontWeight: 600 }} noWrap>{form.title_en}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{(form.record_count || 0).toLocaleString('en-US')} records · latest {form.records?.length || 0} shown</Typography>
              </Box>
              {form.ui_route ? (
                <Button size="small" endIcon={<OpenIcon sx={{ fontSize: 16 }} />} onClick={() => navigate(form.ui_route)} sx={{ textTransform: 'none', fontWeight: 600 }}>Open</Button>
              ) : null}
            </Box>
            {(form.records || []).map((r) => {
              const kv = keyValues(r.values, 4, prefs);
              return (
                <Box key={r.record_id} sx={{ px: 4, py: 3, '& + &': { borderTop: '1px solid', borderColor: 'divider' } }}>
                  <Typography sx={{ fontFamily: MONO, fontSize: 12, color: 'text.secondary', mb: 1.5 }}>{r.record_date ? displayDate(String(r.record_date).slice(0, 10)) : '–'}</Typography>
                  <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                    {kv.map((x) => (
                      <Box key={x.k} sx={{ minWidth: 0 }}>
                        <Typography component="dt" sx={{ fontSize: 11.5, color: 'text.secondary' }} noWrap>{x.label}</Typography>
                        <Typography component="dd" sx={{ m: 0, fontSize: 13.5, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }} noWrap>{x.value}{x.unit ? <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400, fontSize: 12 }}> {x.unit}</Box> : null}</Typography>
                      </Box>
                    ))}
                    {!kv.length ? <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>No values</Typography> : null}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
}
