import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, Chip, Grid, ToggleButton, ToggleButtonGroup,
  Typography, Tooltip, IconButton, CircularProgress, Popover, useMediaQuery, InputBase,
} from '@mui/material';
import { keyframes } from '@mui/system';
import {
  BugReportOutlined as BugIcon,
  OpacityOutlined as SprayIcon,
  HourglassBottomOutlined as PhiIcon,
  RefreshOutlined as RefreshIcon,
  ChevronRightRounded as ChevronIcon,
  UnfoldMoreRounded as UnfoldIcon,
  CheckRounded as CheckIcon,
  SearchRounded as SearchIcon,
} from '@mui/icons-material';
import { StatusChip } from '../../components/dashboard/clearCharts';
import { STATUS } from '../../theme/formIdentity';
import FieldWeatherStrip from '../../components/dashboard/FieldWeatherStrip';
import DashboardSection from '../../components/dashboard/DashboardSection';
import { showQty } from '../../utils/orgPrefs';

function getEcPhColor(value, threshold) {
  if (value == null) return '#9e9e9e';
  if (!threshold) return '#9e9e9e';
  const v = Number(value);
  if (isNaN(v)) return '#9e9e9e';
  const wMin = threshold.warningMin != null ? Number(threshold.warningMin) : null;
  const wMax = threshold.warningMax != null ? Number(threshold.warningMax) : null;
  const cMin = threshold.criticalMin != null ? Number(threshold.criticalMin) : null;
  const cMax = threshold.criticalMax != null ? Number(threshold.criticalMax) : null;
  if (wMin == null && wMax == null && cMin == null && cMax == null) return '#9e9e9e';
  // Critical check first (red wins)
  if (cMin != null && v < cMin) return '#f44336';
  if (cMax != null && v > cMax) return '#f44336';
  // Warning check (yellow/orange)
  if (wMin != null && v < wMin) return '#ff9800';
  if (wMax != null && v > wMax) return '#ff9800';
  return '#4caf50';
}

/** "Now" for this view: today, or the end of the chosen range when it lies in the past. */
export function refNow(refDate) {
  const now = new Date();
  if (!refDate) return now;
  const end = new Date(refDate);
  return Number.isNaN(end.getTime()) || end > now ? now : end;
}

export function isStale(dateStr, refDate) {
  if (!dateStr) return true;
  const d = new Date(dateStr);
  const ref = refNow(refDate);
  return (ref - d) / (1000 * 60 * 60 * 24) > 3;
}


const MONO = '"IBM Plex Mono", monospace';
const BAND_BG = '#d9ece3';
/** Card header: dark field green with white text; a deeper shade marks the selected field. */
const HEADER_GREEN = '#1d5c3c';
const HEADER_GREEN_SELECTED = '#123f28';
const STATUS_WORD = { good: 'In range', warn: 'Watch', out: 'Out', none: 'No data' };
/** Used when no target is set for the crop: the same bands as the EC/pH dashboard. */
export const DEFAULT_BANDS = { ec: [1.8, 2.6], ph: [5.5, 6.5] };
const rise = keyframes`from { opacity: 0; transform: translateY(6px); }`;

/** One reading against its band: status, band and where the dot sits (0–100%). */
export function meter(value, threshold, fallback, stale) {
  const v = value == null || value === '' ? NaN : Number(value);
  const lo = threshold?.warningMin != null ? Number(threshold.warningMin) : fallback[0];
  const hi = threshold?.warningMax != null ? Number(threshold.warningMax) : fallback[1];
  const span = hi - lo || 1;
  const min = lo - span * 0.6, max = hi + span * 0.6;
  const pct = (x) => Math.min(100, Math.max(0, ((x - min) / (max - min)) * 100));
  let status = 'none';
  if (Number.isFinite(v) && !stale) {
    const color = threshold ? getEcPhColor(v, threshold) : null;
    if (color === '#f44336') status = 'out';
    else if (color === '#ff9800') status = 'warn';
    else if (color === '#4caf50') status = 'good';
    else if (v < lo || v > hi) status = 'out';
    else if (v <= lo + span * 0.1 || v >= hi - span * 0.1) status = 'warn';
    else status = 'good';
  }
  return { value: v, status, bandLeft: pct(lo), bandWidth: pct(hi) - pct(lo), dot: Number.isFinite(v) ? pct(v) : null, lo, hi };
}

function MeterRow({ label, m, decimals }) {
  const ink = m.status === 'none' ? 'text.secondary' : m.status === 'good' ? 'text.primary' : STATUS[m.status].color;
  const dot = m.status === 'none' ? '#9aa39c' : m.status === 'good' ? '#1f7a4d' : STATUS[m.status].color;
  return (
    <Tooltip title={`${label} ${Number.isFinite(m.value) ? m.value.toFixed(decimals) : '–'} · target ${m.lo}–${m.hi}`} arrow>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0,1fr) 44px', alignItems: 'center', columnGap: 3 }}>
        <Typography noWrap sx={{ fontSize: 11, color: 'text.secondary', minWidth: 44 }}>{label}</Typography>
        <Box dir="ltr" sx={{ position: 'relative', height: 8, borderRadius: 1, bgcolor: 'action.hover' }}>
          <Box style={{ left: `${m.bandLeft}%`, width: `${m.bandWidth}%` }} sx={{ position: 'absolute', top: 0, bottom: 0, bgcolor: BAND_BG, borderRadius: 1 }} />
          {m.dot != null && (
            <Box style={{ left: `${m.dot}%` }} sx={{
              position: 'absolute', top: '50%', width: 12, height: 12, ml: '-6px', mt: '-6px', borderRadius: '50%',
              bgcolor: dot, boxShadow: (t) => `0 0 0 2px ${t.palette.background.paper}`,
              transition: 'left 400ms ease',
            }} />
          )}
        </Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, fontFamily: MONO, textAlign: 'right', color: ink, fontVariantNumeric: 'tabular-nums' }}>
          {Number.isFinite(m.value) ? m.value.toFixed(decimals) : '–'}
        </Typography>
      </Box>
    </Tooltip>
  );
}

/** "Today", "Yesterday", "4 d ago" for the latest EC/pH reading. */
function readingAge(dateStr, refDate) {
  if (!dateStr) return 'No EC/pH reading';
  const ref = refNow(refDate);
  const days = Math.floor((ref - new Date(dateStr)) / 86400000);
  if (days <= 0) return 'Read today';
  if (days === 1) return 'Read yesterday';
  return `Read ${days} d ago`;
}

const RANK = { out: 3, warn: 2, good: 1, none: 0 };
const GROUPS = [
  { key: 'out', label: 'Out of range' },
  { key: 'warn', label: 'Watch' },
  { key: 'good', label: 'In range' },
  { key: 'none', label: 'No recent reading' },
];
const STATUS_DOT = { out: STATUS.out.color, warn: STATUS.warn.color, good: '#1f7a4d', none: '#9aa39c' };

/** Each field with its EC/pH meters, overall status and alerts, worst first. */
function rankFields(fields, thresholdMap, dateTo) {
  return fields.map((field) => {
    const th = thresholdMap[field.current_crop_id] || {};
    const stale = isStale(field.latest_ecph?.date, dateTo);
    const ec = meter(field.latest_ecph?.ec_out, th.ec_out || th.ec, DEFAULT_BANDS.ec, stale);
    const ph = meter(field.latest_ecph?.ph_out, th.ph_out || th.ph, DEFAULT_BANDS.ph, stale);
    const worst = RANK[ec.status] >= RANK[ph.status] ? ec.status : ph.status;
    const alerts = [
      field.active_phi_count > 0 && 'PHI',
      field.latest_scouting?.id && field.latest_scouting?.status !== 'resolved' && (field.latest_scouting.pest || 'Pest'),
      field.spray_today && 'Sprayed',
    ].filter(Boolean).join(' · ');
    return { field, ec, ph, overall: stale ? 'none' : worst, stale, alerts, crop: [field.crop_name, field.field_type_name].filter(Boolean).join(' · ') };
  }).sort((a, b) => RANK[b.overall] - RANK[a.overall] || String(a.field.name).localeCompare(String(b.field.name)));
}

/** One-line reason for a group, e.g. "EC high on 3 · pH high on 5 · 1 with pest". */
function groupSummary(rows, withReadings) {
  const parts = [];
  if (withReadings) {
    const side = (m, dir) => m.status !== 'good' && m.status !== 'none' && (dir === 'hi' ? m.value > (m.lo + m.hi) / 2 : m.value <= (m.lo + m.hi) / 2);
    [['EC', 'ec'], ['pH', 'ph']].forEach(([name, k]) => {
      const hi = rows.filter((r) => side(r[k], 'hi')).length;
      const lo = rows.filter((r) => side(r[k], 'lo')).length;
      if (hi) parts.push(`${name} high on ${hi}`);
      if (lo) parts.push(`${name} low on ${lo}`);
    });
  }
  const pests = rows.filter((r) => r.field.latest_scouting?.id && r.field.latest_scouting?.status !== 'resolved').length;
  const phi = rows.filter((r) => r.field.active_phi_count > 0).length;
  if (pests) parts.push(`${pests} with pest`);
  if (phi) parts.push(`${phi} in PHI`);
  return parts.join(' · ');
}

const COLS = '84px minmax(0,1fr) 64px 56px minmax(96px,150px)';
const QUICK = [
  ['All', () => true],
  ['EC', (r) => r.ec.status === 'out' || r.ec.status === 'warn'],
  ['pH', (r) => r.ph.status === 'out' || r.ph.status === 'warn'],
  ['Pest', (r) => !!(r.field.latest_scouting?.id && r.field.latest_scouting?.status !== 'resolved')],
  ['PHI', (r) => r.field.active_phi_count > 0],
];

/** Desktop: one button per status in a row; each opens a floating droplist, so the page never grows. */
function FieldStatusGroups({ rows, dateTo, selectedId, onPick }) {
  const [open, setOpen] = useState(null); // { key, el }
  const [q, setQ] = useState('');
  const [quick, setQuick] = useState('All');
  const num = (m, d) => (Number.isFinite(m.value) ? m.value.toFixed(d) : '–');
  const tone = (m) => (m.status === 'out' ? STATUS.out.color : m.status === 'warn' ? STATUS.warn.color : 'text.primary');
  const groups = GROUPS.map((g) => ({ ...g, list: rows.filter((r) => r.overall === g.key) })).filter((g) => g.list.length);
  const cur = open ? groups.find((g) => g.key === open.key) : null;
  const test = (QUICK.find(([k]) => k === quick) || QUICK[0])[1];
  const shown = cur ? cur.list.filter((r) => test(r) && (!q || `${r.field.name} ${r.crop}`.toLowerCase().includes(q.toLowerCase()))) : [];
  const close = () => setOpen(null);
  return (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { sm: `repeat(${groups.length}, minmax(0,1fr))` }, gap: 3 }}>
        {groups.map((g) => {
          const on = open?.key === g.key;
          const summary = groupSummary(g.list, g.key === 'out' || g.key === 'warn') || (g.key === 'good' ? 'Within target' : 'No reading in the last 3 days');
          return (
            <Box key={g.key} component="button" type="button" aria-haspopup="dialog" aria-expanded={on}
              onClick={(e) => { setQ(''); setQuick('All'); setOpen(on ? null : { key: g.key, el: e.currentTarget }); }}
              sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gridTemplateRows: 'auto auto', alignItems: 'center', columnGap: 3, rowGap: 1,
                minHeight: 72, px: 4, py: 3, border: 0, borderRadius: '12px', bgcolor: 'background.paper', font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'start',
                boxShadow: on ? `0 0 0 2px ${STATUS_DOT[g.key]}55` : '0 0 0 1px rgba(19,32,26,0.1)', transition: 'box-shadow 150ms ease',
                '&:hover': { boxShadow: on ? `0 0 0 2px ${STATUS_DOT[g.key]}77` : '0 0 0 1px rgba(19,32,26,0.2)' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}>
              <StatusChip status={g.key}>{g.label}</StatusChip>
              <Typography component="span" sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums', justifySelf: 'start' }}>{g.list.length}</Typography>
              <ChevronIcon sx={{ fontSize: 18, color: 'text.secondary', transform: on ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform 150ms ease' }} />
              <Typography component="span" noWrap sx={{ gridColumn: '1 / -1', fontSize: 12.5, color: 'text.secondary', minWidth: 0 }}>{summary}</Typography>
            </Box>
          );
        })}
      </Box>
      <Popover open={Boolean(cur)} anchorEl={open?.el} onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { 'aria-label': cur?.label, sx: { mt: 2, width: 640, maxWidth: 'calc(100vw - 32px)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 16px 40px rgba(22,40,30,0.16), 0 0 0 1px rgba(22,40,30,0.07)' } } }}>
        {cur ? (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 3, borderBottom: 1, borderColor: 'divider' }}>
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, height: 34, px: 2.5, borderRadius: '8px', bgcolor: 'background.muted' }}>
                <SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <InputBase autoFocus placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} sx={{ fontSize: 13, flex: 1 }} inputProps={{ 'aria-label': 'Search fields' }} />
              </Box>
              <Box role="radiogroup" aria-label="Show" sx={{ display: 'flex', gap: 0.5 }}>
                {QUICK.map(([k]) => (
                  <Box key={k} component="button" type="button" role="radio" aria-checked={quick === k} onClick={() => setQuick(k)}
                    sx={{ height: 30, px: 2.5, border: 0, borderRadius: '8px', font: 'inherit', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      bgcolor: quick === k ? '#16432e' : 'transparent', color: quick === k ? '#ffffff' : 'text.secondary', '&:hover': { color: quick === k ? '#ffffff' : 'text.primary' } }}>
                    {k}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box role="row" sx={{ display: 'grid', gridTemplateColumns: COLS, columnGap: 4, px: 4, py: 1.75, bgcolor: 'background.muted', fontSize: 11.5, color: 'text.secondary' }}>
              {['Field', 'Crop · type', 'EC out', 'pH out', 'Alerts'].map((h, i) => <Box role="columnheader" key={h} sx={{ textAlign: i === 2 || i === 3 ? 'right' : 'left' }}>{h}</Box>)}
            </Box>
            <Box role="table" aria-label={cur.label} sx={{ maxHeight: 320, overflowY: 'auto' }}>
              {shown.map((r) => {
                const sel = selectedId === r.field.id;
                return (
                  <Box role="row" key={r.field.id} tabIndex={0} aria-selected={sel} onClick={() => { onPick(r.field, { keep: true }); close(); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(r.field, { keep: true }); close(); } }}
                    sx={{ display: 'grid', gridTemplateColumns: COLS, columnGap: 4, alignItems: 'center', minHeight: 40, px: 4, borderTop: '1px solid', borderColor: 'divider', fontSize: 13, cursor: 'pointer',
                      bgcolor: sel ? 'rgba(22,67,46,0.07)' : 'transparent', boxShadow: sel ? 'inset 3px 0 0 #16432e' : 'none',
                      '&:hover': { bgcolor: sel ? 'rgba(22,67,46,0.09)' : 'action.hover' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}>
                    <Box role="cell" sx={{ fontFamily: MONO, fontWeight: 600 }}>{r.field.name}</Box>
                    <Box role="cell" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.crop || '—'}</Box>
                    <Box role="cell" sx={{ textAlign: 'right', fontFamily: MONO, fontWeight: r.ec.status === 'out' ? 600 : 400, color: tone(r.ec) }}>{num(r.ec, 2)}</Box>
                    <Box role="cell" sx={{ textAlign: 'right', fontFamily: MONO, fontWeight: r.ph.status === 'out' ? 600 : 400, color: tone(r.ph) }}>{num(r.ph, 1)}</Box>
                    <Box role="cell" sx={{ color: r.alerts ? 'text.primary' : 'text.disabled', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.alerts || '—'}</Box>
                  </Box>
                );
              })}
              {!shown.length ? <Typography sx={{ px: 4, py: 4, fontSize: 13, color: 'text.secondary' }}>No field matches</Typography> : null}
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 4, py: 2.5, borderTop: 1, borderColor: 'divider', fontSize: 12, color: 'text.secondary' }}>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{shown.length} of {cur.list.length} fields</span>
              <span>Click a field to select it on the map</span>
            </Box>
          </Box>
        ) : null}
      </Popover>
    </>
  );
}

/** Phone: pick one field from a grouped droplist and see its card. */
function FieldPicker({ rows, dateTo, selectedId, onPick }) {
  const [anchor, setAnchor] = useState(null);
  const [localId, setLocalId] = useState(null);
  const current = rows.find((r) => r.field.id === (selectedId || localId)) || rows[0];
  if (!current) return null;
  const dot = (s, size = 8) => <Box component="span" sx={{ width: size, height: size, borderRadius: '50%', bgcolor: STATUS_DOT[s], flexShrink: 0 }} />;
  const label = GROUPS.reduce((m, g) => ({ ...m, [g.key]: g.label }), {});
  return (
    <Box>
      <Box component="button" type="button" aria-haspopup="listbox" aria-expanded={Boolean(anchor)} onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: 2.5, px: 3.5, border: 0, borderRadius: '10px', bgcolor: 'background.paper', boxShadow: '0 0 0 1px rgba(22,40,30,0.12)', font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'start' }}>
        {dot(current.overall)}
        <Box component="span" sx={{ fontFamily: MONO, fontWeight: 600, fontSize: 13 }}>{current.field.name}</Box>
        <Typography component="span" noWrap sx={{ fontSize: 13, color: 'text.secondary', minWidth: 0, flex: 1 }}>{current.crop}</Typography>
        <UnfoldIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
      </Box>
      <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { mt: 1.5, width: anchor?.offsetWidth, maxHeight: 360, p: 1, borderRadius: '12px' } } }}>
        <Box role="listbox" aria-label="Field">
          {GROUPS.map((g) => {
            const list = rows.filter((r) => r.overall === g.key);
            if (!list.length) return null;
            return (
              <Box key={g.key} role="group" aria-label={g.label}>
                <Typography sx={{ px: 2.5, pt: 2.5, pb: 1, fontSize: 11, color: 'text.secondary' }}>{g.label} · {list.length}</Typography>
                {list.map((r) => {
                  const on = r.field.id === current.field.id;
                  return (
                    <Box component="button" type="button" role="option" aria-selected={on} key={r.field.id}
                      onClick={() => { setLocalId(r.field.id); setAnchor(null); onPick(r.field, { keep: true }); }}
                      sx={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 2.5, px: 2.5, border: 0, borderRadius: '8px', bgcolor: on ? 'rgba(22,67,46,0.06)' : 'transparent', font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'start', '&:hover': { bgcolor: 'action.hover' } }}>
                      {dot(r.overall, 7)}
                      <Box component="span" sx={{ fontFamily: MONO, fontSize: 12.5, width: 64 }}>{r.field.name}</Box>
                      <Typography component="span" noWrap sx={{ fontSize: 13, color: 'text.secondary', flex: 1, minWidth: 0 }}>{r.crop}</Typography>
                      {on ? <CheckIcon sx={{ fontSize: 16, color: 'primary.main' }} /> : null}
                    </Box>
                  );
                })}
              </Box>
            );
          })}
        </Box>
      </Popover>
      <Box sx={{ mt: 3, p: 4, borderRadius: '12px', border: '1px solid', borderColor: 'divider', display: 'grid', gap: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <StatusChip status={current.overall}>{current.stale ? (current.field.latest_ecph?.date ? 'Stale' : 'No data') : label[current.overall]}</StatusChip>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', ml: 'auto' }}>{readingAge(current.field.latest_ecph?.date, dateTo)}</Typography>
        </Box>
        <MeterRow label="EC out" m={current.ec} decimals={2} />
        <MeterRow label="pH out" m={current.ph} decimals={1} />
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Alerts: <Box component="span" sx={{ color: 'text.primary' }}>{current.alerts || 'none'}</Box></Typography>
      </Box>
    </Box>
  );
}

/** Field status list: droplists by status on wide screens, a field picker on the phone. */
function FieldStatusTable({ fields, thresholdMap, dateTo, selectedId, onPick }) {
  const phone = useMediaQuery((t) => t.breakpoints.down('sm'));
  const rows = useMemo(() => rankFields(fields, thresholdMap, dateTo), [fields, thresholdMap, dateTo]);
  return phone
    ? <FieldPicker rows={rows} dateTo={dateTo} selectedId={selectedId} onPick={onPick} />
    : <FieldStatusGroups rows={rows} dateTo={dateTo} selectedId={selectedId} onPick={onPick} />;
}

export default function FarmMonitor({
  fieldOverview,
  onFieldSelect,
  selectedFieldId,
  agronomicThresholds,
  onTabSwitch,
  dateTo,
  weatherByFieldId = {},
  weatherLoading = false,
  weatherFetching = false,
  onRefreshWeather,
  fieldIds = null,
}) {
  const navigate = useNavigate();
  const [fieldSummary, setFieldSummary] = useState(null);
  const [typeFilter, setTypeFilter] = useState('All');
  // Many fields read better as a table; few fields as cards. The choice is remembered.
  const [view, setView] = useState(() => { try { return localStorage.getItem('agro_fm_view') || 'auto'; } catch { return 'auto'; } });
  const pickView = (v) => { setView(v); try { localStorage.setItem('agro_fm_view', v); } catch { /* ignore */ } };

  const fieldTypes = useMemo(() => {
    const types = new Set();
    (fieldOverview || []).forEach(f => { if (f.field_type_name) types.add(f.field_type_name); });
    return ['All', ...Array.from(types).sort()];
  }, [fieldOverview]);

  const visibleFields = useMemo(() => {
    if (!fieldOverview) return [];
    const sliced = fieldIds ? fieldOverview.filter((f) => fieldIds.includes(f.id)) : fieldOverview;
    if (typeFilter === 'All') return sliced;
    return sliced.filter(f => f.field_type_name === typeFilter);
  }, [fieldOverview, typeFilter, fieldIds]);

  const thresholdMap = useMemo(() => {
    const map = {};
    (agronomicThresholds || []).forEach(t => {
      if (!map[t.cropId]) map[t.cropId] = {};
      map[t.cropId][t.parameter] = {
        warningMin: t.warningMin, warningMax: t.warningMax,
        criticalMin: t.criticalMin, criticalMax: t.criticalMax,
      };
    });
    return map;
  }, [agronomicThresholds]);

  const handleTypeChange = (_, value) => {
    if (!value) return;
    setTypeFilter(value);
    if (fieldSummary && value !== 'All' && fieldSummary.field_type_name !== value) {
      setFieldSummary(null);
      if (onFieldSelect) onFieldSelect(null);
    }
  };

  if (!fieldOverview || fieldOverview.length === 0) return null;

  return (
    <DashboardSection
      title="Farm Monitor"
      action={(
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {onRefreshWeather && (
            <Tooltip title="Refresh weather from OpenWeatherMap" arrow describeChild>
              <span>
                <IconButton
                  size="small"
                  onClick={onRefreshWeather}
                  disabled={weatherFetching}
                  aria-label="Refresh weather from OpenWeatherMap"
                  sx={{ color: 'inherit' }}
                >
                  {weatherFetching ? (
                    <CircularProgress size={18} sx={{ color: 'inherit' }} />
                  ) : (
                    <RefreshIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          )}
          <ToggleButtonGroup
            value={view === 'auto' ? ((fieldOverview || []).length > 8 ? 'table' : 'cards') : view}
            exclusive
            onChange={(_, v) => v && pickView(v)}
            size="small"
            aria-label="Farm Monitor view"
            sx={{ '& .MuiToggleButton-root': { color: 'inherit', borderColor: 'rgba(255,255,255,0.35)', textTransform: 'none', px: 1.5, py: 0.25, fontSize: '0.75rem', '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.22)', color: 'inherit' } } }}
          >
            <ToggleButton value="table">Table</ToggleButton>
            <ToggleButton value="cards">Cards</ToggleButton>
          </ToggleButtonGroup>
          {fieldTypes.length > 2 && (
            <ToggleButtonGroup
              value={typeFilter}
              exclusive
              onChange={handleTypeChange}
              size="small"
              sx={{
                '& .MuiToggleButton-root': {
                  color: 'inherit',
                  borderColor: 'rgba(255,255,255,0.35)',
                  textTransform: 'none',
                  px: 1.5,
                  py: 0.25,
                  fontSize: '0.75rem',
                  '&.Mui-selected': {
                    bgcolor: 'rgba(255,255,255,0.22)',
                    color: 'inherit',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.28)' },
                  },
                },
              }}
            >
              {fieldTypes.map((t) => (
                <ToggleButton key={t} value={t}>{t}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}
        </Box>
      )}
    >
      <Box sx={{ p: { xs: 4, sm: 5 } }}>
        {(view === 'table' || (view === 'auto' && visibleFields.length > 8)) ? (
          <FieldStatusTable
            fields={visibleFields}
            thresholdMap={thresholdMap}
            dateTo={dateTo}
            selectedId={selectedFieldId || fieldSummary?.id}
            onPick={(field, opts) => {
              const deselect = !opts?.keep && (selectedFieldId || fieldSummary?.id) === field.id;
              setFieldSummary(deselect ? null : field);
              if (onFieldSelect) onFieldSelect(deselect ? null : field);
            }}
          />
        ) : (
        <Box sx={{ display: 'grid', gap: { xs: 3, md: 4 }, gridTemplateColumns: { xs: 'repeat(auto-fill, minmax(160px, 1fr))', sm: 'repeat(auto-fill, minmax(240px, 1fr))' } }}>
        {visibleFields.map((field, idx) => {
          const hasPHI = field.active_phi_count > 0;
          const refDateObj = refNow(dateTo);
          const phiDays = hasPHI
            ? Math.max(0, Math.ceil((new Date(field.nearest_phi_end) - refDateObj) / (1000 * 60 * 60 * 24)))
            : 0;
          const hasUnresolvedPest = field.latest_scouting?.id && field.latest_scouting?.status !== 'resolved';
          const sprayedToday = !!field.spray_today;

          const cropThresholds = thresholdMap[field.current_crop_id] || {};
          const ecphDate = field.latest_ecph?.date;
          const stale = isStale(ecphDate, dateTo);
          const ec = meter(field.latest_ecph?.ec_out, cropThresholds.ec_out || cropThresholds.ec, DEFAULT_BANDS.ec, stale);
          const ph = meter(field.latest_ecph?.ph_out, cropThresholds.ph_out || cropThresholds.ph, DEFAULT_BANDS.ph, stale);
          const rank = { out: 3, warn: 2, good: 1, none: 0 };
          const worst = rank[ec.status] >= rank[ph.status] ? ec.status : ph.status;
          const overall = stale ? 'none' : worst;
          const selected = (selectedFieldId || fieldSummary?.id) === field.id;
          const openEcph = (e) => {
            e.stopPropagation();
            if (onFieldSelect) onFieldSelect(field);
            if (onTabSwitch) onTabSwitch(0);
          };

          return (
            <Box
              key={`${field.id}-${idx}`}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              onClick={() => {
                const deselect = (selectedFieldId || fieldSummary?.id) === field.id;
                setFieldSummary(deselect ? null : field);
                if (onFieldSelect) onFieldSelect(deselect ? null : field);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
              sx={{
                cursor: 'pointer', borderRadius: 2, bgcolor: 'background.paper', overflow: 'hidden',
                border: '1px solid', borderColor: selected ? HEADER_GREEN : 'divider',
                boxShadow: selected ? `0 0 0 2px ${HEADER_GREEN}` : 'none',
                display: 'flex', flexDirection: 'column', minWidth: 0, userSelect: 'none',
                transition: 'border-color 150ms ease, box-shadow 150ms ease',
                '&:hover': { borderColor: HEADER_GREEN },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                animation: `${rise} 420ms cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${Math.min(idx, 11) * 40}ms`,
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 4, py: 3, bgcolor: selected ? HEADER_GREEN_SELECTED : HEADER_GREEN, color: '#fff' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 14, fontWeight: 600, fontFamily: MONO, lineHeight: 1.3, color: '#fff' }}>{field.name}</Typography>
                  <Typography noWrap sx={{ fontSize: 12, color: 'rgba(255,255,255,0.78)' }}>
                    {[field.crop_name, field.field_type_name].filter(Boolean).join(' · ') || 'No crop set'}
                  </Typography>
                </Box>
                <StatusChip status={overall}>{stale ? (ecphDate ? 'Stale' : 'No data') : STATUS_WORD[overall]}</StatusChip>
              </Box>
              <Box sx={{ px: 4, pt: 3.5, pb: 3, display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>

              <Box sx={{ display: 'grid', gap: 2.5 }} onClick={openEcph}>
                <MeterRow label="EC out" m={ec} decimals={2} />
                <MeterRow label="pH out" m={ph} decimals={1} />
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, height: 28, mt: 'auto', pt: 2.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography sx={{ fontSize: 11, color: 'text.secondary', flex: 1, minWidth: 0 }} noWrap>
                  {readingAge(ecphDate, dateTo)}
                </Typography>
                {hasPHI && phiDays > 0 && (
                  <Tooltip title={`Pre-harvest interval: clear to harvest in ${phiDays} day${phiDays === 1 ? '' : 's'}`} arrow>
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: 11, fontWeight: 600, color: phiDays <= 1 ? STATUS.warn.color : STATUS.out.color }}>
                      <PhiIcon sx={{ fontSize: 15 }} />{phiDays}d
                    </Box>
                  </Tooltip>
                )}
                {hasUnresolvedPest && (
                  <Tooltip title={`Pest: ${field.latest_scouting.pest || 'Unresolved'} (${field.latest_scouting.pct || 0}%)`} arrow>
                    <IconButton size="small" aria-label="Open scouting report" sx={{ p: 0.25, color: STATUS.out.color }}
                      onClick={(e) => { e.stopPropagation(); navigate(`/ipm/scouting-reports?highlight=${field.latest_scouting.id}`); }}>
                      <BugIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
                {sprayedToday && (
                  <Tooltip title={`Sprayed: ${field.spray_today.product || 'Application'}`} arrow>
                    <IconButton size="small" aria-label="Open spray record" sx={{ p: 0.25, color: 'text.secondary' }}
                      onClick={(e) => { e.stopPropagation(); navigate(`/ipm/pesticide-applications?highlight=${field.spray_today.id}`); }}>
                      <SprayIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
              {(weatherByFieldId[field.id] || weatherLoading) && (
                <FieldWeatherStrip weather={weatherByFieldId[field.id]} loading={weatherLoading && !weatherByFieldId[field.id]} />
              )}
              </Box>
            </Box>
          );
        })}
        </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', columnGap: 5, rowGap: 2, mt: 5, pt: 4, borderTop: '1px solid', borderColor: 'divider', flexWrap: 'wrap', fontSize: 12, color: 'text.secondary' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box component="span" sx={{ width: 22, height: 8, borderRadius: 1, bgcolor: BAND_BG }} />
            Target band · dot is the latest reading
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><PhiIcon sx={{ fontSize: 15 }} />PHI days left</Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><BugIcon sx={{ fontSize: 15 }} />Pest found</Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><SprayIcon sx={{ fontSize: 15 }} />Sprayed today</Box>
        </Box>

      {/* Field Summary Popup */}
      {fieldSummary && (
        <Card variant="outlined" sx={{ mt: 2, overflow: 'hidden', borderColor: 'table.gridline' }}>
          <Box
            sx={{
              bgcolor: HEADER_GREEN,
              color: '#fff',
              px: 2,
              py: 1,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap',
            }}
          >
            <Typography variant="subtitle1" fontWeight={600} sx={{ color: '#fff' }}>
              {fieldSummary.name} · summary
            </Typography>
            <Chip
              label={fieldSummary.active_phi_count > 0 ? 'PHI Active' : 'Clear'}
              size="small"
              sx={{
                bgcolor: fieldSummary.active_phi_count > 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.22)',
                color: 'inherit',
                fontWeight: 600,
              }}
            />
          </Box>
          <Box sx={{ p: 2 }}>
          {fieldSummary.active_phi_count > 0 && fieldSummary.nearest_phi_end && (
            <Typography variant="caption" display="block" color="error.main" sx={{ mb: 1.5, fontWeight: 600 }}>
              Clear to Harvest: {new Date(fieldSummary.nearest_phi_end).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </Typography>
          )}
          <Grid container spacing={3}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary">EC In</Typography>
              <Typography variant="body1" fontWeight={600}>
                {fieldSummary.latest_ecph?.ec_in != null ? Number(fieldSummary.latest_ecph.ec_in).toFixed(2) : '-'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary">EC Out</Typography>
              <Typography variant="body1" fontWeight={600}>
                {fieldSummary.latest_ecph?.ec_out != null ? Number(fieldSummary.latest_ecph.ec_out).toFixed(2) : '-'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary">pH In</Typography>
              <Typography variant="body1" fontWeight={600}>
                {fieldSummary.latest_ecph?.ph_in != null ? Number(fieldSummary.latest_ecph.ph_in).toFixed(2) : '-'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary">pH Out</Typography>
              <Typography variant="body1" fontWeight={600}>
                {fieldSummary.latest_ecph?.ph_out != null ? Number(fieldSummary.latest_ecph.ph_out).toFixed(2) : '-'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary">Harvest (7d)</Typography>
              <Typography variant="body1" fontWeight={600}>{Number(fieldSummary.harvest_this_week || 0).toFixed(1)} kg</Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary">Water (7d)</Typography>
              <Typography variant="body1" fontWeight={600}>{(() => { const w = showQty(Number(fieldSummary.water_this_week || 0), 'water', { decimals: 1 }); return `${w.text} ${w.unit}`; })()}</Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary">Latest Scouting</Typography>
              <Typography variant="body1" fontWeight={600}>
                {fieldSummary.latest_scouting?.pest
                  ? `${fieldSummary.latest_scouting.pest} (${fieldSummary.latest_scouting.pct}%)`
                  : 'None'}
              </Typography>
            </Grid>
            {fieldSummary.last_bumble_bee_inspection && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" color="text.secondary">Latest Bumble Bee Inspection</Typography>
                <Typography variant="body1" fontWeight={600}>
                  {new Date(String(fieldSummary.last_bumble_bee_inspection.inspection_date).split('T')[0]).toLocaleDateString()}
                  {' · '}
                  {fieldSummary.last_bumble_bee_inspection.total_boxes ?? 0} boxes
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  100%: {fieldSummary.last_bumble_bee_inspection.boxes_100 ?? 0}
                  {' · '}80%: {fieldSummary.last_bumble_bee_inspection.boxes_80 ?? 0}
                  {' · '}60%: {fieldSummary.last_bumble_bee_inspection.boxes_60 ?? 0}
                  {' · '}40%: {fieldSummary.last_bumble_bee_inspection.boxes_40 ?? 0}
                  {' · '}20%: {fieldSummary.last_bumble_bee_inspection.boxes_20 ?? 0}
                  {' · '}0%: {fieldSummary.last_bumble_bee_inspection.boxes_0 ?? 0}
                </Typography>
              </Grid>
            )}
            <Grid size={12}>
              <Typography variant="caption" color="text.secondary">Current Weather</Typography>
              <FieldWeatherStrip
                weather={weatherByFieldId[fieldSummary.id]}
                loading={weatherLoading && !weatherByFieldId[fieldSummary.id]}
                variant="detail"
              />
              {!weatherLoading && !weatherByFieldId[fieldSummary.id] && (
                <Typography variant="body2" color="text.secondary">No live weather (check coordinates or API key)</Typography>
              )}
            </Grid>
          </Grid>
          </Box>
        </Card>
      )}
      </Box>
    </DashboardSection>
  );
}
