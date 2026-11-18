import { Box, Paper, Typography, Tooltip } from '@mui/material';
import {
  NorthEastRounded as UpIcon,
  SouthEastRounded as DownIcon,
  EastRounded as FlatIcon,
} from '@mui/icons-material';
import { useFormIdentity, STATUS } from '../../theme/formIdentity';
import { StatusChip } from './clearCharts';

/**
 * KPI tile: small label, large tabular value, optional caption. On a form page
 * the first tile (`lead`) carries the form colour.
 * Optional, all small and quiet:
 *  - status: 'good' | 'warn' | 'out' (+ statusText) → icon + word at the top corner
 *  - trend:  { dir: 'up' | 'down' | 'flat', text } → arrow and the change vs the previous period
 *  - gauge:  { lo, hi, value } → thin bar with the target band and a dot for the value
 */
// eslint-disable-next-line no-unused-vars
export default function DashboardStatCard({ title, value, subtitle, color, lead, status, statusText, trend, gauge }) {
  const form = useFormIdentity();
  const TrendIcon = trend ? ({ up: UpIcon, down: DownIcon }[trend.dir] || FlatIcon) : null;
  let g = null;
  if (gauge && Number.isFinite(gauge.value)) {
    const span = gauge.hi - gauge.lo || 1;
    const min = gauge.lo - span * 0.6;
    const max = gauge.hi + span * 0.6;
    const pct = (x) => Math.min(100, Math.max(0, ((x - min) / (max - min)) * 100));
    g = { left: pct(gauge.lo), width: pct(gauge.hi) - pct(gauge.lo), dot: pct(gauge.value) };
  }
  const dotColor = status && status !== 'good' ? (STATUS[status] || STATUS.none).color : '#1f7a4d';
  return (
    <Paper
      variant="outlined"
      sx={{
        height: '100%',
        overflow: 'hidden',
        boxShadow: 1,
        position: 'relative',
        transition: 'border-color 200ms ease',
        '&:hover': { borderColor: 'border.strong' },
        ...(lead && form ? { boxShadow: `inset 4px 0 0 ${form.base}` } : {}),
      }}
    >
      <Box sx={{ px: { xs: 4, sm: 5 }, py: { xs: 3.5, sm: 4.5 }, display: 'flex', flexDirection: 'column', gap: 2, height: '100%', boxSizing: 'border-box' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 22 }}>
          <Typography component="p" sx={{ flex: 1, minWidth: 0, fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary' }} noWrap>
            {title}
          </Typography>
          {status && <StatusChip status={status}>{statusText}</StatusChip>}
        </Box>
        <Box>
          <Typography
            component="p"
            sx={{
              fontSize: { xs: '1.375rem', sm: '1.625rem' },
              fontWeight: 600,
              lineHeight: 1.15,
              letterSpacing: '-0.025em',
              color: 'text.primary',
              fontVariantNumeric: 'tabular-nums',
              wordBreak: 'break-word',
            }}
          >
            {value}
          </Typography>
          {trend && (
            <Tooltip title={trend.tip || ''} arrow disableHoverListener={!trend.tip}>
              <Box component="span" sx={{ mt: 1, display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 12, fontWeight: 600, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                <TrendIcon sx={{ fontSize: 16 }} aria-hidden="true" />
                {trend.text}
                <Box component="span" sx={{ fontWeight: 400, color: 'text.disabled', ml: 0.5 }}>vs last week</Box>
              </Box>
            </Tooltip>
          )}
        </Box>
        {g && (
          <Box dir="ltr" aria-hidden="true" sx={{ position: 'relative', height: 6, borderRadius: 3, bgcolor: 'action.hover' }}>
            <Box style={{ left: `${g.left}%`, width: `${g.width}%` }} sx={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 3, bgcolor: '#d9ece3' }} />
            <Box style={{ left: `${g.dot}%` }} sx={{ position: 'absolute', top: '50%', width: 10, height: 10, ml: '-5px', mt: '-5px', borderRadius: '50%', bgcolor: dotColor, boxShadow: (t) => `0 0 0 2px ${t.palette.background.paper}` }} />
          </Box>
        )}
        {subtitle && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 'auto' }}>{subtitle}</Typography>
        )}
      </Box>
    </Paper>
  );
}
