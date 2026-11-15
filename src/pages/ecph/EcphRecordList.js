import { useMemo, useState } from 'react';
import { Box, Button, ButtonBase, Drawer, IconButton, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { getECColor, getPHColor } from './ecphUtils';

const WARN = '#a3471f';
const num = (v, d) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n !== 0 ? n.toFixed(d) : null;
};
const bad = (v, type) => {
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n === 0) return false;
  const tone = type === 'ec' ? getECColor(n) : getPHColor(n);
  return tone === 'error' || tone === 'warning';
};
const pair = (a, b, d) => [num(a, d), num(b, d)].filter(Boolean).join(' → ') || '—';
const dayLabel = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso || '—';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - d) / 86400000);
  const text = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return diff === 0 ? `Today · ${text}` : diff === 1 ? `Yesterday · ${text}` : text;
};

function Metric({ label, value, warn, borderL, borderT }) {
  return (
    <Box sx={{ px: 1.5, py: 1.25, display: 'grid', gap: 0.25, borderLeft: borderL ? 1 : 0, borderTop: borderT ? 1 : 0, borderColor: 'divider', bgcolor: warn ? alpha(WARN, 0.07) : 'transparent' }}>
      <Typography component="dt" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{label}</Typography>
      <Typography component="dd" sx={{ m: 0, fontSize: '1.0625rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: warn ? WARN : 'text.primary' }}>{value}</Typography>
    </Box>
  );
}

/**
 * Phone view of the saved EC/PH records: one line per record, grouped by day,
 * and a bottom sheet with every value of the record.
 */
export default function EcphRecordList({ entries, fieldName, keyOf, onEdit, onDelete }) {
  const [openIdx, setOpenIdx] = useState(-1);
  const days = useMemo(() => {
    const out = [];
    entries.forEach((e, i) => {
      const last = out[out.length - 1];
      if (last && last.date === e.date) last.rows.push({ e, i });
      else out.push({ date: e.date, rows: [{ e, i }] });
    });
    return out;
  }, [entries]);
  const cur = openIdx >= 0 ? entries[openIdx] : null;

  return (
    <Box>
      {days.map((d) => (
        <Box key={d.date} component="section" aria-label={dayLabel(d.date)}>
          <Box sx={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', bgcolor: 'action.hover' }}>
            <span>{dayLabel(d.date)}</span><span style={{ fontWeight: 400 }}>{d.rows.length}</span>
          </Box>
          {d.rows.map(({ e, i }) => {
            const v = e.valves?.[0] || {};
            const phBad = bad(v.phIn, 'ph') || bad(v.phOut, 'ph');
            const ecBad = bad(v.ecIn, 'ec') || bad(v.ecOut, 'ec');
            const nV = (e.valves || []).length;
            return (
              <ButtonBase key={e.id} onClick={() => setOpenIdx(i)}
                sx={{ width: '100%', justifyContent: 'flex-start', gap: 1.5, minHeight: 64, px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', textAlign: 'start' }}>
                <Box sx={{ flex: 1, minWidth: 0, display: 'grid', gap: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }} noWrap>{fieldName(e.fieldId)}</Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }} noWrap>{[e.time, nV > 1 ? `${nV} valves` : null].filter(Boolean).join(' · ')}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1.75, fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums', flexWrap: 'wrap' }}>
                    <span style={ecBad ? { color: WARN, fontWeight: 600 } : undefined}><Box component="span" sx={{ color: 'text.secondary' }}>EC </Box><bdi dir="ltr">{pair(v.ecIn, v.ecOut, 2)}</bdi></span>
                    <span style={phBad ? { color: WARN, fontWeight: 600 } : undefined}><Box component="span" sx={{ color: 'text.secondary' }}>pH </Box><bdi dir="ltr">{pair(v.phIn, v.phOut, 1)}</bdi></span>
                  </Box>
                </Box>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" style={{ opacity: 0.5, flexShrink: 0 }}><path d="M9 6l6 6-6 6" /></svg>
              </ButtonBase>
            );
          })}
        </Box>
      ))}

      <Drawer anchor="bottom" open={!!cur} onClose={() => setOpenIdx(-1)}
        PaperProps={{ sx: { maxHeight: '85dvh', borderRadius: 0, display: 'flex', flexDirection: 'column' } }}>
        {cur && (
          <>
            <Box aria-hidden sx={{ height: 20, display: 'grid', placeItems: 'center' }}><Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider' }} /></Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 2, pr: 1, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography component="h2" sx={{ fontSize: '1.125rem', fontWeight: 600 }}>{fieldName(cur.fieldId)}</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                  {[dayLabel(cur.date), cur.time].filter(Boolean).join(' · ')}
                  {keyOf(cur.fieldId) && <> · <bdi dir="ltr" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{keyOf(cur.fieldId)}</bdi></>}
                </Typography>
              </Box>
              {onEdit && (
                <IconButton aria-label="Edit" onClick={() => { onEdit(cur); setOpenIdx(-1); }} sx={{ width: 44, height: 44 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>
                </IconButton>
              )}
              {onDelete && (
                <IconButton aria-label="Delete" onClick={() => { onDelete(cur.id); setOpenIdx(-1); }} sx={{ width: 44, height: 44, color: 'error.main' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M7 7l1 12h8l1-12M9 7V4h6v3" /></svg>
                </IconButton>
              )}
              <IconButton aria-label="Close" onClick={() => setOpenIdx(-1)} sx={{ width: 44, height: 44 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </IconButton>
            </Box>
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'grid', gap: 2 }}>
              {(cur.valves || []).map((v, vi) => {
                const cells = [
                  ['EC in', num(v.ecIn, 2), bad(v.ecIn, 'ec')], ['EC out', num(v.ecOut, 2), bad(v.ecOut, 'ec')],
                  ['pH in', num(v.phIn, 1), bad(v.phIn, 'ph')], ['pH out', num(v.phOut, 1), bad(v.phOut, 'ph')],
                  ['Drip (ml)', num(v.dripVolume, 0), false], ['Drain (ml)', num(v.drainVolume, 0), false],
                ];
                return (
                  <Box key={vi} sx={{ display: 'grid', gap: 1 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary' }}>Valve {v.valveNumber || vi + 1}</Typography>
                    <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', border: 1, borderColor: 'divider' }}>
                      {cells.map(([l, val, w], ci) => <Metric key={l} label={l} value={val ?? '—'} warn={w} borderL={ci % 2 === 1} borderT={ci > 1} />)}
                    </Box>
                  </Box>
                );
              })}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 1 }}>
                {[['Water', num(cur.valves?.[0]?.qtyOfWater || cur.qtyOfWater, 2)], ['Cycles', num(cur.valves?.[0]?.cycle || cur.cycle, 0)], ['Total', num(cur.totalWaterQty, 2)]].map(([l, v]) => (
                  <Box key={l}>
                    <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{l}</Typography>
                    <Typography sx={{ fontSize: '0.9375rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{v ?? '—'}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, px: 2, pt: 1.5, pb: 'calc(16px + env(safe-area-inset-bottom))', borderTop: 1, borderColor: 'divider' }}>
              <Button fullWidth variant="outlined" disabled={openIdx <= 0} onClick={() => setOpenIdx((i) => i - 1)} sx={{ height: 48 }}>Previous</Button>
              <Button fullWidth variant="outlined" disabled={openIdx >= entries.length - 1} onClick={() => setOpenIdx((i) => i + 1)} sx={{ height: 48 }}>Next</Button>
            </Box>
          </>
        )}
      </Drawer>
    </Box>
  );
}
