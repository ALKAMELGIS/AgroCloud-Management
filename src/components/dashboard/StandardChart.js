import { useMemo, useState } from 'react';
import {
  Box, Typography, IconButton, Popover, Switch, FormControlLabel, ToggleButton, ToggleButtonGroup, Tooltip,
} from '@mui/material';
import { TuneOutlined as TuneIcon } from '@mui/icons-material';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, ScatterChart, Scatter,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip as RTooltip, ReferenceArea, ReferenceLine, LabelList,
} from 'recharts';
import { CHART_TOOLTIP } from './dashboardChartTheme';
import { gridProps, xAxisProps, yAxisProps, useFormColors } from './clearCharts';

/*
 * One card per standard chart: Line / time series, Pie / share, Bar / ranked,
 * Bar / comparison, Bar / columns, Scatter plot. Each card has a settings
 * button: colour palette, the alternate chart type, values on/off, legend on/off.
 * Choices are kept per chart on this device.
 */

function hue(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
/** Degrees between two colours' hues; used so the form colour never sits next to a near-twin. */
function hueGap(a, b) { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d); }

export const PALETTES = {
  form: { label: 'Form colour', colors: (f) => [f.base, ...['#c4701c', '#4b7bd6', '#1c7c4f', '#8a63c9', '#c2507a'].filter((c) => hueGap(c, f.base) > 40).slice(0, 4), '#5f6a63'] },
  agro: { label: 'AgroCloud', colors: () => ['#1c7c4f', '#4b7bd6', '#c4701c', '#8a63c9', '#c2507a', '#5f6a63'] },
  ocean: { label: 'Ocean', colors: () => ['#1d5c96', '#2a9d8f', '#c98b16', '#7b5cc4', '#c2507a', '#5f6a63'] },
  earth: { label: 'Earth', colors: () => ['#a0521d', '#2f6db5', '#3f8f3a', '#b23a6f', '#7a6a3a', '#5f6a63'] },
  contrast: { label: 'High contrast', colors: () => ['#000000', '#e69f00', '#0072b2', '#009e73', '#cc79a7', '#7a7a7a'] },
};

const KIND_LABEL = {
  line: 'Line · time series',
  pie: 'Pie · share',
  rank: 'Bar · ranked',
  compare: 'Bar · comparison',
  columns: 'Bar · columns',
  scatter: 'Scatter plot',
};

/** Which type each chart can switch to from its settings. */
const ALTERNATE = { line: 'columns', columns: 'line', pie: 'rank', rank: 'pie', compare: 'line' };

const MONO = '"IBM Plex Mono", monospace';
const fmt = (v, d = 1) => (Number.isFinite(v) ? Number(v.toFixed(d)).toLocaleString() : '–');
/** Short labels on bars: 12,870 → 12.9k, so neighbouring values never overlap. */
const fmtC = (v) => (!Number.isFinite(v) ? '' : Math.abs(v) >= 1000 ? `${Number((v / 1000).toFixed(1))}k` : fmt(v, v < 10 ? 1 : 0));

function readPrefs(id) {
  try { return JSON.parse(localStorage.getItem(`agro_chart_${id}`) || '{}') || {}; } catch { return {}; }
}
function writePrefs(id, p) {
  try { localStorage.setItem(`agro_chart_${id}`, JSON.stringify(p)); } catch { /* private mode */ }
}

/** Least-squares line and R² for scatter points [{x, y}]. */
export function linearFit(points) {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  points.forEach((p) => { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; });
  if (!sxx || !syy) return null;
  const slope = sxy / sxx;
  const r2 = (sxy * sxy) / (sxx * syy);
  const xs = points.map((p) => p.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  return { slope, r2, line: [{ x: x0, y: my + slope * (x0 - mx) }, { x: x1, y: my + slope * (x1 - mx) }] };
}

function Legend({ items }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 1 }}>
      {items.map((it) => (
        <Box key={it.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 11.5, color: 'text.secondary' }}>
          {it.band ? <Box component="span" sx={{ width: 14, height: 9, bgcolor: it.color, borderRadius: 0.5 }} />
            : it.dashed ? <Box component="span" sx={{ width: 14, borderTop: `2px dashed ${it.color}` }} />
              : it.dot ? <Box component="span" sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: it.color }} />
                : <Box component="span" sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: it.color }} />}
          {it.label}
        </Box>
      ))}
    </Box>
  );
}

function Settings({ anchor, onClose, prefs, setPrefs, alt, fixedColors, form }) {
  const pal = prefs.palette || 'form';
  return (
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { p: 2, width: 248, borderRadius: 2 } } }}>
      {!fixedColors && (
        <>
          <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>Colours</Typography>
          <Box sx={{ display: 'grid', gap: 0.5, mb: 2 }}>
            {Object.entries(PALETTES).map(([key, p]) => (
              <Box key={key} component="button" type="button" onClick={() => setPrefs({ ...prefs, palette: key })}
                aria-pressed={pal === key}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1, p: 0.75, borderRadius: 1.5, cursor: 'pointer', font: 'inherit',
                  border: '1px solid', borderColor: pal === key ? 'text.primary' : 'divider', bgcolor: 'background.paper', textAlign: 'start',
                }}>
                <Box sx={{ display: 'flex', gap: '2px' }}>
                  {p.colors(form).slice(0, 5).map((c) => <Box key={c} sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: c }} />)}
                </Box>
                <Typography sx={{ fontSize: 12 }}>{p.label}</Typography>
              </Box>
            ))}
          </Box>
        </>
      )}
      {alt && (
        <>
          <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>Chart type</Typography>
          <ToggleButtonGroup size="small" exclusive fullWidth value={prefs.alt ? 'alt' : 'main'}
            onChange={(e, v) => v && setPrefs({ ...prefs, alt: v === 'alt' })} sx={{ mb: 2 }}>
            <ToggleButton value="main" sx={{ textTransform: 'none', fontSize: 12 }}>{alt.main}</ToggleButton>
            <ToggleButton value="alt" sx={{ textTransform: 'none', fontSize: 12 }}>{alt.other}</ToggleButton>
          </ToggleButtonGroup>
        </>
      )}
      <FormControlLabel sx={{ display: 'flex', m: 0, justifyContent: 'space-between' }} labelPlacement="start"
        control={<Switch size="small" checked={prefs.values !== false} onChange={(e) => setPrefs({ ...prefs, values: e.target.checked })} />}
        label={<Typography sx={{ fontSize: 12 }}>Show values</Typography>} />
      <FormControlLabel sx={{ display: 'flex', m: 0, justifyContent: 'space-between' }} labelPlacement="start"
        control={<Switch size="small" checked={prefs.legend !== false} onChange={(e) => setPrefs({ ...prefs, legend: e.target.checked })} />}
        label={<Typography sx={{ fontSize: 12 }}>Show legend</Typography>} />
    </Popover>
  );
}

/**
 * spec:
 *  id, kind, title, unit
 *  line / columns:  data [{ x, <key>… }], series [{ key, name, compare? }], band? [lo, hi]
 *  compare:         data [{ x, <key>… }], series (2: previous, current)
 *  pie / rank:      data [{ name, value }], target?, colors? (fixed, e.g. status)
 *  scatter:         data [{ x, y, group }], xLabel, yLabel
 */
export default function StandardChart({ spec, height = 250 }) {
  const form = useFormColors();
  const [prefs, setPrefsState] = useState(() => readPrefs(spec.id));
  const [anchor, setAnchor] = useState(null);
  const setPrefs = (p) => { setPrefsState(p); writePrefs(spec.id, p); };

  const altKind = ALTERNATE[spec.kind] && !(spec.kind === 'compare' && !spec.data?.length) ? ALTERNATE[spec.kind] : null;
  const kind = prefs.alt && altKind ? altKind : spec.kind;
  const palette = (PALETTES[prefs.palette] || PALETTES.form).colors(form);
  const showValues = prefs.values !== false;
  const showLegend = prefs.legend !== false;
  const empty = !spec.data || spec.data.length === 0;

  const body = useMemo(() => {
    if (empty) return null;
    const anim = { animationDuration: 900, animationEasing: 'ease-out' };
    const series = spec.series || [{ key: 'value', name: spec.title }];

    if (kind === 'line') {
      const isCompareSrc = spec.kind === 'compare';
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={spec.data} margin={{ top: 14, right: 44, left: 0, bottom: 0 }}>
            {spec.band && <ReferenceArea y1={spec.band[0]} y2={spec.band[1]} fill={form.pale} fillOpacity={1} ifOverflow="hidden" />}
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="x" {...xAxisProps} />
            <YAxis {...yAxisProps} domain={['auto', 'auto']} />
            <RTooltip contentStyle={CHART_TOOLTIP} />
            {series.map((s, i) => (
              <Line key={s.key} dataKey={s.key} name={s.name} type="monotone" connectNulls
                stroke={palette[isCompareSrc ? (i === 0 ? 1 : 0) : i]} strokeWidth={i === series.length - 1 ? 2.6 : 2}
                dot={isCompareSrc ? { r: 3 } : false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} {...anim}>
                {showValues && !isCompareSrc && (
                  <LabelList dataKey={s.key} content={({ x, y, value, index }) => (index === spec.data.length - 1 && Number.isFinite(value) ? (
                    <text x={x + 6} y={y - 8} fontSize={11} fontWeight={600} fill="#13201a" fontFamily={MONO}>{fmt(value, 2)}</text>
                  ) : null)} />
                )}
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (kind === 'columns' || kind === 'compare') {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={spec.data} margin={{ top: 18, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
            {spec.band && <ReferenceArea y1={spec.band[0]} y2={spec.band[1]} fill={form.pale} fillOpacity={1} ifOverflow="hidden" />}
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="x" {...xAxisProps} interval="preserveStartEnd" />
            <YAxis {...yAxisProps} />
            <RTooltip contentStyle={CHART_TOOLTIP} cursor={{ fill: form.pale }} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} radius={[4, 4, 0, 0]} maxBarSize={spec.kind === 'compare' ? 30 : 34}
                fill={palette[spec.kind === 'compare' ? (i === 0 ? 1 : 0) : i]} {...anim} animationBegin={i * 120}>
                {showValues && spec.data.length <= 14 && (
                  <LabelList dataKey={s.key} position="top" fontSize={10.5} fill="#4d5a52" fontFamily={MONO}
                    formatter={fmtC} />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (kind === 'pie') {
      const colors = spec.colors || palette;
      const total = spec.data.reduce((s, d) => s + d.value, 0) || 1;
      return (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0,1fr) minmax(0,1fr)' }, alignItems: 'center', gap: 1, height: '100%' }}>
          <Box sx={{ height: { xs: 180, sm: '100%' }, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={spec.data} dataKey="value" nameKey="name" innerRadius="0%" outerRadius="92%" stroke="#fff" strokeWidth={2}
                  startAngle={90} endAngle={-270} {...anim}
                  label={showValues ? ({ cx, cy, midAngle, outerRadius, percent }) => {
                    if (percent < 0.07) return null;
                    const r = outerRadius * 0.62, rad = Math.PI / 180;
                    return (
                      <text x={cx + r * Math.cos(-midAngle * rad)} y={cy + r * Math.sin(-midAngle * rad)} fill="#fff"
                        fontSize={12} fontWeight={600} textAnchor="middle" dominantBaseline="central">{`${Math.round(percent * 100)}%`}</text>
                    );
                  } : false} labelLine={false}>
                  {spec.data.map((d, i) => <Cell key={d.name} fill={colors[i % colors.length]} />)}
                </Pie>
                <RTooltip contentStyle={CHART_TOOLTIP} />
              </PieChart>
            </ResponsiveContainer>
          </Box>
          {showLegend && (
            <Box sx={{ display: 'grid', gap: 0.75, alignContent: 'center' }}>
              {spec.data.map((d, i) => (
                <Box key={d.name} sx={{ display: 'grid', gridTemplateColumns: '10px minmax(0,1fr)', columnGap: 1, alignItems: 'start' }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: colors[i % colors.length], mt: 0.5 }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 500 }}>{d.name}</Typography>
                    <Typography sx={{ fontSize: 11, color: 'text.secondary', fontFamily: MONO }}>
                      {fmt(d.value, 1)}{spec.unit ? ` ${spec.unit}` : ''} · {Math.round((d.value / total) * 100)}%
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      );
    }

    if (kind === 'rank') {
      const rows = [...spec.data].sort((a, b) => b.value - a.value).slice(0, 10);
      const colorOf = (d, i) => {
        if (spec.colors) return spec.colors[spec.data.indexOf(d) % spec.colors.length];
        if (spec.target != null) return d.value > spec.target ? palette[1] : palette[0];
        return i === 0 ? form.dark : palette[0];
      };
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid horizontal={false} stroke={gridProps.stroke} />
            <XAxis type="number" {...xAxisProps} />
            <YAxis type="category" dataKey="name" {...yAxisProps} width={74} tick={{ fontSize: 11, fill: '#13201a', fontFamily: MONO }} />
            <RTooltip contentStyle={CHART_TOOLTIP} cursor={{ fill: form.pale }} />
            {spec.target != null && <ReferenceLine x={spec.target} stroke="#13201a" strokeDasharray="4 4" ifOverflow="extendDomain" />}
            <Bar dataKey="value" name={spec.unit || spec.title} radius={[0, 4, 4, 0]} {...anim}>
              {rows.map((d, i) => <Cell key={d.name} fill={colorOf(d, i)} />)}
              {showValues && (
                <LabelList dataKey="value" position="right" fontSize={11} fill="#13201a" fontFamily={MONO}
                  formatter={(v) => (v < 10 ? fmt(v, 2) : fmtC(v))} />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (kind === 'scatter') {
      const groups = [...new Set(spec.data.map((d) => d.group || 'All'))];
      const fit = linearFit(spec.data);
      return (
        <Box sx={{ position: 'relative', height: '100%' }}>
          {fit && (
            <Typography sx={{ position: 'absolute', right: 8, top: 0, fontSize: 11, color: 'text.secondary', fontFamily: MONO, zIndex: 1 }}>
              Trend · R² {fit.r2.toFixed(2)}
            </Typography>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid {...gridProps} />
              <XAxis type="number" dataKey="x" name={spec.xLabel} {...xAxisProps} domain={['auto', 'auto']} />
              <YAxis type="number" dataKey="y" name={spec.yLabel} {...yAxisProps} domain={['auto', 'auto']} />
              <ZAxis range={[46, 46]} />
              <RTooltip contentStyle={CHART_TOOLTIP} cursor={{ strokeDasharray: '3 3' }} />
              {groups.map((g, i) => (
                <Scatter key={g} name={g} data={spec.data.filter((d) => (d.group || 'All') === g)} fill={palette[i % palette.length]}
                  fillOpacity={0.85} {...anim} animationBegin={i * 120} />
              ))}
              {fit && <Scatter data={fit.line} line={{ stroke: '#13201a', strokeDasharray: '5 5', strokeWidth: 1.5 }} shape={() => null} legendType="none" isAnimationActive={false} />}
            </ScatterChart>
          </ResponsiveContainer>
        </Box>
      );
    }
    return null;
  }, [empty, kind, spec, palette, showValues, showLegend, form]);

  const legendItems = useMemo(() => {
    if (empty || !showLegend) return null;
    if (kind === 'pie') return null;
    if (kind === 'scatter') {
      const groups = [...new Set(spec.data.map((d) => d.group || 'All'))];
      return groups.length > 1 ? groups.map((g, i) => ({ label: g, color: palette[i % palette.length], dot: true })) : null;
    }
    if (kind === 'rank') {
      return spec.target != null ? [
        { label: `Target ${spec.target}`, color: '#13201a', dashed: true },
        { label: 'Above target', color: palette[1] },
      ] : null;
    }
    const series = spec.series || [];
    const items = series.map((s, i) => ({
      label: s.name,
      color: palette[spec.kind === 'compare' ? (i === 0 ? 1 : 0) : i],
    }));
    if (spec.band) items.unshift({ label: `Target ${spec.band[0]}–${spec.band[1]}`, color: form.pale, band: true });
    return items.length ? items : null;
  }, [empty, showLegend, kind, spec, palette, form]);

  const short = (k) => KIND_LABEL[k].split(' · ')[0];
  const altLabels = altKind ? { main: short(spec.kind), other: short(altKind) } : null;

  return (
    <Box sx={{
      bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2,
      p: { xs: 1.75, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 1, height: '100%', minWidth: 0,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="span" sx={{
            display: 'inline-block', fontSize: 10.5, fontWeight: 600, color: form.dark, bgcolor: form.pale,
            px: 0.75, py: 0.25, borderRadius: 1, mb: 0.5, letterSpacing: 0,
          }}>{KIND_LABEL[kind]}</Typography>
          <Typography component="h3" sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{spec.title}</Typography>
        </Box>
        <Tooltip title="Chart settings">
          <IconButton size="small" aria-label={`Settings: ${spec.title}`} onClick={(e) => setAnchor(e.currentTarget)}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
            <TuneIcon sx={{ fontSize: 17 }} />
          </IconButton>
        </Tooltip>
      </Box>
      {legendItems && <Legend items={legendItems} />}
      <Box dir="ltr" sx={{ height, minWidth: 0 }}>
        {empty ? (
          <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', fontSize: 13, border: '1px dashed', borderColor: 'divider', borderRadius: 1.5 }}>
            {spec.emptyText || 'No data in this range'}
          </Box>
        ) : body}
      </Box>
      {spec.unit && kind !== 'pie' && (
        <Typography sx={{ fontSize: 11, color: 'text.secondary', fontFamily: MONO }}>
          {kind === 'scatter' ? `↑ ${spec.yLabel} · ${spec.xLabel} →` : spec.unit}
        </Typography>
      )}
      <Settings anchor={anchor} onClose={() => setAnchor(null)} prefs={prefs} setPrefs={setPrefs}
        alt={altLabels} fixedColors={Boolean(spec.colors)} form={form} />
    </Box>
  );
}

/** Responsive grid of standard chart cards: 3 across on wide screens, 2 on tablets, 1 on phones. */
export function StandardChartGrid({ charts }) {
  return (
    <Box sx={{
      display: 'grid', gap: 2, mb: { xs: 4, md: 5 },
      gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(2, minmax(0,1fr))', xl: 'repeat(3, minmax(0,1fr))' },
    }}>
      {charts.map((c) => <StandardChart key={c.id} spec={c} />)}
    </Box>
  );
}

