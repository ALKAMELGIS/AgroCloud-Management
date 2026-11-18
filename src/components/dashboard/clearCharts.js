import { Box, Typography } from '@mui/material';
import { keyframes } from '@mui/system';
import { CHART_GRID, CHART_TICK } from './dashboardChartTheme';
import { FORM_IDENTITY, STATUS, COMPARE_GREY, useFormIdentity } from '../../theme/formIdentity';

/*
 * Clear chart pieces shared by every form dashboard. One accent per chart (the
 * form colour), comparisons in grey, status only with a word and an icon.
 */

const grow = keyframes`from { transform: scaleX(0); }`;
const pop = keyframes`from { transform: scale(0); opacity: 0; }`;
const motion = { '@media (prefers-reduced-motion: reduce)': { animation: 'none' } };

/** recharts props: quiet horizontal grid, muted ticks, no axis lines. */
export const gridProps = { vertical: false, stroke: CHART_GRID };
export const xAxisProps = { tick: { fontSize: 11, fill: CHART_TICK }, axisLine: { stroke: CHART_GRID }, tickLine: false, minTickGap: 16 };
export const yAxisProps = { tick: { fontSize: 11, fill: CHART_TICK }, axisLine: false, tickLine: false, width: 48 };
export const lineProps = { type: 'monotone', strokeWidth: 2.5, dot: false, activeDot: { r: 5, strokeWidth: 2, stroke: '#fff' }, connectNulls: true, animationDuration: 900 };
export const compareLineProps = { ...lineProps, stroke: COMPARE_GREY, strokeWidth: 2, strokeDasharray: '5 5' };

/** The current form's colours, falling back to EC/pH so charts never go colourless. */
export function useFormColors() {
  return useFormIdentity() || FORM_IDENTITY.ecph;
}

function Icon({ d, size = 12, width = 2.4 }) {
  return (
    <Box component="svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" sx={{ flexShrink: 0 }}>
      <path d={d} />
    </Box>
  );
}

/** Filled status badge: shape + glyph differ per status, so it never relies on colour. */
const BADGE = {
  good: { shape: 'circle', glyph: 'M7.5 12.2l3 3 6-6.4' },
  warn: { shape: 'tri', glyph: 'M12 9.6v3.6M12 16.4h.01' },
  out: { shape: 'oct', glyph: 'M12 7.6v5M12 16.2h.01' },
  none: { shape: 'circle', glyph: 'M8 12h8' },
};
function StatusBadge({ status, color, size = 14 }) {
  const b = BADGE[status] || BADGE.none;
  return (
    <Box component="svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" sx={{ flexShrink: 0, display: 'block' }}>
      {b.shape === 'tri' && <path d="M10.3 3.4a2 2 0 0 1 3.4 0l8.4 14.6A2 2 0 0 1 20.4 21H3.6a2 2 0 0 1-1.7-3z" fill={color} />}
      {b.shape === 'oct' && <path d="M8.1 2h7.8a2 2 0 0 1 1.4.6l4.1 4.1a2 2 0 0 1 .6 1.4v7.8a2 2 0 0 1-.6 1.4l-4.1 4.1a2 2 0 0 1-1.4.6H8.1a2 2 0 0 1-1.4-.6l-4.1-4.1A2 2 0 0 1 2 15.9V8.1a2 2 0 0 1 .6-1.4l4.1-4.1A2 2 0 0 1 8.1 2z" fill={color} />}
      {b.shape === 'circle' && <circle cx="12" cy="12" r="10" fill={color} />}
      <path d={b.glyph} fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </Box>
  );
}

/** Status pill: shaped badge + word on a pale pill with a hairline edge. */
export function StatusChip({ status = 'none', children }) {
  const s = STATUS[status] || STATUS.none;
  return (
    <Box component="span" sx={{
      display: 'inline-flex', alignItems: 'center', gap: 1.5, height: 22, pl: 1, pr: 2.5, borderRadius: '999px',
      fontSize: 11.5, fontWeight: 600, letterSpacing: '0.01em', lineHeight: 1, whiteSpace: 'nowrap',
      color: s.color, bgcolor: s.bg, boxShadow: `inset 0 0 0 1px ${s.color}26`,
    }}>
      <StatusBadge status={status} color={s.color} />{children || s.label}
    </Box>
  );
}

/** Form badge: the form's icon on its pale tile. */
export function FormTile({ form, size = 40 }) {
  const f = form || FORM_IDENTITY.ecph;
  return (
    <Box sx={{ width: size, height: size, borderRadius: 2.5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: f.pale, color: f.dark }}>
      <Icon d={f.icon} size={Math.round(size * 0.52)} width={1.6} />
    </Box>
  );
}

/** Small legend row: [{ label, color, dashed }] */
export function ChartLegend({ items }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 1.5 }}>
      {items.map((it) => (
        <Box key={it.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, color: 'text.secondary' }}>
          {it.band ? (
            <Box component="span" sx={{ width: 16, height: 10, borderRadius: 0.5, bgcolor: it.color }} />
          ) : it.dashed ? (
            <Box component="span" sx={{ width: 16, borderTop: `2px dashed ${it.color}` }} />
          ) : (
            <Box component="span" sx={{ width: 16, height: 3, borderRadius: 1, bgcolor: it.color }} />
          )}
          {it.label}
        </Box>
      ))}
    </Box>
  );
}

/**
 * Ranked horizontal bars, biggest first. The top bar is the form's dark shade,
 * the rest its main colour, negatives red. Replaces pies and rainbow bars.
 * items: [{ label, value, display?, sub? }]
 */
export function RankBars({ items, format = (v) => v.toLocaleString(), showShare = false, limit = 12 }) {
  const f = useFormColors();
  const rows = [...items].filter((r) => Number.isFinite(r.value)).sort((a, b) => b.value - a.value).slice(0, limit);
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
  const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0) || 1;
  if (!rows.length) return <Typography variant="body2" color="text.secondary">No data in this range</Typography>;
  return (
    <Box sx={{ display: 'grid', gap: 1.25 }}>
      {rows.map((r, i) => (
        <Box key={r.label} sx={{ display: 'grid', gridTemplateColumns: { xs: '84px minmax(0,1fr) 72px', sm: '140px minmax(0,1fr) 112px' }, alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: 13, fontWeight: 500 }}>{r.label}</Typography>
            {r.sub && <Typography noWrap sx={{ fontSize: 11, color: 'text.secondary' }}>{r.sub}</Typography>}
          </Box>
          <Box sx={{ height: 18, bgcolor: 'action.hover', borderRadius: '0 4px 4px 0' }}>
            <Box sx={{
              height: '100%', width: `${(Math.abs(r.value) / max) * 100}%`, minWidth: 2,
              bgcolor: r.value < 0 ? STATUS.out.color : i === 0 ? f.dark : f.base,
              borderRadius: '0 4px 4px 0', transformOrigin: 'left',
              animation: `${grow} 700ms cubic-bezier(.2,.8,.2,1) both`, animationDelay: `${120 + i * 60}ms`, ...motion,
            }} />
          </Box>
          <Typography sx={{ fontSize: 12, fontWeight: 500, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: '"IBM Plex Mono", monospace' }}>
            {r.display ?? format(r.value)}
            {showShare && <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}> · {Math.round((Math.max(0, r.value) / total) * 100)}%</Box>}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/**
 * One row per field: the target band shaded, last period as a hollow grey dot,
 * this period as a solid dot, and a plain verdict. Replaces slope charts.
 * rows: [{ label, prev, now }]  band: [lo, hi]
 */
export function BandRows({ rows, band, min, max, decimals = 1, unit = '' }) {
  const f = useFormColors();
  const [lo, hi] = band;
  const pos = (v) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`;
  const ticks = [];
  const step = (max - min) / 3;
  for (let k = 0; k <= 3; k += 1) ticks.push(min + k * step);
  const live = rows.filter((r) => Number.isFinite(r.now));
  if (!live.length) return <Typography variant="body2" color="text.secondary">No readings in this range</Typography>;
  const verdict = (r) => {
    const out = r.now > hi || r.now < lo;
    const margin = (hi - lo) * 0.1;
    const edge = !out && (r.now >= hi - margin || r.now <= lo + margin);
    const d = Number.isFinite(r.prev) ? r.now - r.prev : 0;
    const dir = Math.abs(d) < (hi - lo) * 0.05 ? 'steady' : d > 0 ? 'rising' : 'falling';
    return { status: out ? 'out' : edge ? 'warn' : 'good', text: out ? `${dir} · out` : edge ? `${dir} · near edge` : dir };
  };
  const cols = { xs: '76px minmax(0,1fr) 96px', sm: '120px minmax(0,1fr) 168px' };
  return (
    <Box>
      <ChartLegend items={[
        { label: `Target ${lo}–${hi}${unit ? ` ${unit}` : ''}`, color: f.mid, band: true },
      ]} />
      <Box sx={{ display: 'flex', gap: 2, mt: -0.5, mb: 1.5, fontSize: 12, color: 'text.secondary' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}><Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${COMPARE_GREY}`, boxSizing: 'border-box' }} />Previous 7 days</Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}><Box component="span" sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: f.base }} />Last 7 days</Box>
      </Box>
      {live.map((r, i) => {
        const v = verdict(r);
        const hasPrev = Number.isFinite(r.prev);
        const a = hasPrev ? Math.min(r.prev, r.now) : r.now;
        const b = hasPrev ? Math.max(r.prev, r.now) : r.now;
        const bad = v.status === 'out';
        return (
          <Box key={r.label} sx={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', gap: 1.5, minHeight: 40 }}>
            <Typography noWrap sx={{ fontSize: 13, fontWeight: 600 }}>{r.label}</Typography>
            <Box dir="ltr" sx={{ position: 'relative', height: 40 }}>
              <Box style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} sx={{ position: 'absolute', top: 0, bottom: 0, bgcolor: f.pale }} />
              <Box sx={{ position: 'absolute', left: 0, right: 0, top: '50%', height: '1px', bgcolor: 'divider' }} />
              {hasPrev && (
                <Box style={{ left: pos(a), width: `calc(${pos(b)} - ${pos(a)})`, transformOrigin: r.now >= r.prev ? 'left' : 'right' }} sx={{
                  position: 'absolute', top: 'calc(50% - 1.5px)', height: 3,
                  bgcolor: bad ? '#e8a198' : f.light,
                  animation: `${grow} 600ms ease both`, animationDelay: `${200 + i * 70}ms`, ...motion,
                }} />
              )}
              {hasPrev && (
                <Box style={{ left: pos(r.prev), margin: '-6px 0 0 -6px' }} sx={{ position: 'absolute', top: '50%', width: 12, height: 12, boxSizing: 'border-box', borderRadius: '50%', border: `2px solid ${COMPARE_GREY}`, bgcolor: 'background.paper' }} />
              )}
              <Box style={{ left: pos(r.now), margin: '-8px 0 0 -8px' }} sx={{
                position: 'absolute', top: '50%', width: 16, height: 16, borderRadius: '50%',
                bgcolor: bad ? STATUS.out.color : f.base, boxShadow: (t) => `0 0 0 2px ${t.palette.background.paper}`,
                animation: `${pop} 400ms ease both`, animationDelay: `${600 + i * 70}ms`, ...motion,
              }} />
            </Box>
            <Box sx={{ justifySelf: 'end' }}><StatusChip status={v.status}>{`${r.now.toFixed(decimals)} · ${v.text}`}</StatusChip></Box>
          </Box>
        );
      })}
      <Box sx={{ display: 'grid', gridTemplateColumns: cols, gap: 1.5, mt: 0.5, pt: 0.75, borderTop: '1px solid', borderColor: 'divider' }}>
        <span />
        <Box dir="ltr" sx={{ position: 'relative', height: 18 }}>
          {ticks.map((t, k) => (
            <Typography key={k} component="span" style={{ left: pos(t), transform: k === 0 ? 'none' : k === 3 ? 'translateX(-100%)' : 'translateX(-50%)' }} sx={{
              position: 'absolute',
              fontSize: 11, color: 'text.secondary', fontFamily: '"IBM Plex Mono", monospace',
            }}>{t.toFixed(decimals)}</Typography>
          ))}
        </Box>
        <span />
      </Box>
    </Box>
  );
}

/** Parts of one whole as a single 100% bar with a legend (replaces pies). items: [{ label, value }] */
export function ShareBar({ items, format = (v) => v.toLocaleString() }) {
  const f = useFormColors();
  const parts = [...items].filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const top = parts.slice(0, 3);
  const rest = parts.slice(3).reduce((s, x) => s + x.value, 0);
  const shown = rest > 0 ? [...top, { label: 'Other', value: rest }] : top;
  const total = shown.reduce((s, x) => s + x.value, 0) || 1;
  const colors = [f.dark, f.base, f.light, f.mid];
  const ink = ['#fff', '#fff', '#13201a', '#13201a'];
  if (!shown.length) return <Typography variant="body2" color="text.secondary">No data in this range</Typography>;
  return (
    <Box>
      <Box sx={{ display: 'flex', gap: '2px', height: 36, borderRadius: 1.5, overflow: 'hidden' }}>
        {shown.map((p, i) => {
          const pct = (p.value / total) * 100;
          return (
            <Box key={p.label} sx={{
              flex: `${p.value} 1 0`, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 600, color: ink[i], bgcolor: colors[i], transformOrigin: 'left',
              animation: `${grow} 600ms ease both`, animationDelay: `${150 + i * 80}ms`, ...motion,
            }}>{pct >= 8 ? `${Math.round(pct)}%` : ''}</Box>
          );
        })}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0,1fr))' }, gap: 1, mt: 2 }}>
        {shown.map((p, i) => (
          <Box key={p.label} sx={{ display: 'grid', gridTemplateColumns: '12px minmax(0,1fr) auto', alignItems: 'center', gap: 1, fontSize: 13 }}>
            <Box component="span" sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: colors[i] }} />
            <Typography noWrap sx={{ fontSize: 13 }}>{p.label}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {format(p.value)} · {Math.round((p.value / total) * 100)}%
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** Sum values into Monday-starting weeks. points: [{ date: 'YYYY-MM-DD…', value }] → [{ week, value }] */
export function byWeek(points) {
  const acc = {};
  points.forEach(({ date, value }) => {
    const d = (date || '').toString().slice(0, 10);
    if (!d || !Number.isFinite(value)) return;
    const t = new Date(`${d}T00:00:00Z`);
    const dow = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dow);
    const k = t.toISOString().slice(0, 10);
    acc[k] = (acc[k] || 0) + value;
  });
  return Object.keys(acc).sort().map((k) => ({
    week: new Date(`${k}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    value: Math.round(acc[k] * 10) / 10,
  }));
}
