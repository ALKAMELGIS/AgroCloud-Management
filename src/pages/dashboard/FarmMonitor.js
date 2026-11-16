import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, Chip, Grid, ToggleButton, ToggleButtonGroup,
  Typography, Tooltip, IconButton, CircularProgress,
} from '@mui/material';
import { keyframes } from '@mui/system';
import {
  BugReportOutlined as BugIcon,
  OpacityOutlined as SprayIcon,
  HourglassBottomOutlined as PhiIcon,
  RefreshOutlined as RefreshIcon,
} from '@mui/icons-material';
import { StatusChip } from '../../components/dashboard/clearCharts';
import { STATUS } from '../../theme/formIdentity';
import FieldWeatherStrip from '../../components/dashboard/FieldWeatherStrip';
import DashboardSection from '../../components/dashboard/DashboardSection';

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
function refNow(refDate) {
  const now = new Date();
  if (!refDate) return now;
  const end = new Date(refDate);
  return Number.isNaN(end.getTime()) || end > now ? now : end;
}

function isStale(dateStr, refDate) {
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
const DEFAULT_BANDS = { ec: [1.8, 2.6], ph: [5.5, 6.5] };
const rise = keyframes`from { opacity: 0; transform: translateY(6px); }`;

/** One reading against its band: status, band and where the dot sits (0–100%). */
function meter(value, threshold, fallback, stale) {
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
      <Box sx={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0,1fr) 40px', alignItems: 'center', gap: 1 }}>
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
}) {
  const navigate = useNavigate();
  const [fieldSummary, setFieldSummary] = useState(null);
  const [typeFilter, setTypeFilter] = useState('All');

  const fieldTypes = useMemo(() => {
    const types = new Set();
    (fieldOverview || []).forEach(f => { if (f.field_type_name) types.add(f.field_type_name); });
    return ['All', ...Array.from(types).sort()];
  }, [fieldOverview]);

  const visibleFields = useMemo(() => {
    if (!fieldOverview) return [];
    if (typeFilter === 'All') return fieldOverview;
    return fieldOverview.filter(f => f.field_type_name === typeFilter);
  }, [fieldOverview, typeFilter]);

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
      <Box sx={{ px: { xs: 2, sm: 2.5 }, pt: 2, pb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, mb: 2, flexWrap: 'wrap', fontSize: 12, color: 'text.secondary' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box component="span" sx={{ width: 22, height: 8, borderRadius: 1, bgcolor: BAND_BG }} />
            Target band · dot is the latest reading
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><PhiIcon sx={{ fontSize: 15 }} />PHI days left</Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><BugIcon sx={{ fontSize: 15 }} />Pest found</Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><SprayIcon sx={{ fontSize: 15 }} />Sprayed today</Box>
        </Box>

        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(auto-fill, minmax(156px, 1fr))', sm: 'repeat(auto-fill, minmax(220px, 1fr))' } }}>
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
                display: 'flex', flexDirection: 'column', minWidth: 0,
                transition: 'border-color 150ms ease, box-shadow 150ms ease',
                '&:hover': { borderColor: HEADER_GREEN },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                animation: `${rise} 420ms cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${Math.min(idx, 11) * 40}ms`,
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.75, py: 1.25, bgcolor: selected ? HEADER_GREEN_SELECTED : HEADER_GREEN, color: '#fff' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 14, fontWeight: 600, fontFamily: MONO, lineHeight: 1.3, color: '#fff' }}>{field.name}</Typography>
                  <Typography noWrap sx={{ fontSize: 12, color: 'rgba(255,255,255,0.78)' }}>
                    {[field.crop_name, field.field_type_name].filter(Boolean).join(' · ') || 'No crop set'}
                  </Typography>
                </Box>
                <StatusChip status={overall}>{stale ? (ecphDate ? 'Stale' : 'No data') : STATUS_WORD[overall]}</StatusChip>
              </Box>
              <Box sx={{ p: 1.75, pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>

              <Box sx={{ display: 'grid', gap: 1 }} onClick={openEcph}>
                <MeterRow label="EC out" m={ec} decimals={2} />
                <MeterRow label="pH out" m={ph} decimals={1} />
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 20, flexWrap: 'wrap' }}>
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
              <Typography variant="body1" fontWeight={600}>{Number(fieldSummary.water_this_week || 0).toFixed(1)} m³</Typography>
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
