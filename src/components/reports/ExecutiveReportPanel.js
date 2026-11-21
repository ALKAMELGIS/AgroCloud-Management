import { useState } from 'react';
import {
  Box, ButtonBase, Paper, Typography, Grid, TextField, Button, List, ListItem, ListItemText, Chip,
} from '@mui/material';
import {
  AssessmentOutlined as ReportIcon,
  PrintOutlined as PrintIcon,
} from '@mui/icons-material';
import { ModuleIcon, ICON_PATHS } from '../../config/moduleIcons';
import { formatPeriodLabel } from '../../utils/executiveReportUtils';
import InfoNote from '../InfoNote';

const P = ICON_PATHS;
/* Drawn for what each figure measures (24 px grid, stroke). */
const ICONS = {
  harvest: P.harvest, calendar: P.seasons, field: P.areas, average: 'M4 19h16M4 15l4-4 4 3 4-6 4 3M4 5v14',
  grade: P.grade, crop: P.areas, trendUp: 'M3 17l6-6 4 4 8-8M15 7h6v6', trendDown: 'M3 7l6 6 4-4 8 8M15 17h6v-6',
  idle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12h8', ecph: P.ecph, ec: 'M13 3L5 14h6l-1 7 8-11h-6z', ph: 'M9 3h6M10 3v6L5 18a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8',
  drain: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11zM9 15h6', target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  water: P.irrig, alert: 'M12 3l10 18H2zM12 10v5M12 18h.01', fert: P.fert, fertEntry: P.tank,
};
const TONE = {
  good: { fg: '#1d6b45', bg: 'rgba(29,107,69,0.08)', word: 'On track' },
  watch: { fg: '#9a5b0e', bg: 'rgba(183,121,31,0.10)', word: 'Watch' },
  alert: { fg: '#b42318', bg: 'rgba(180,35,24,0.08)', word: 'Act' },
  info: { fg: '#1d5fa8', bg: 'rgba(29,95,168,0.08)', word: 'Note' },
};
const HAIR = '1px solid rgba(22,40,30,0.08)';
const num = (v, d = 0) => (typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 }) : v);

function KpiCard({ title, value, subtitle, delta, color = '#1f7a4d', icon }) {
  // "+29.7% vs prev period" -> "+30%"; a change under 1% reads as steady.
  const pct = typeof delta === 'string' ? parseFloat(delta) : NaN;
  const shown = Number.isFinite(pct) ? (Math.abs(pct) < 1 ? 'Steady' : `${pct > 0 ? '+' : ''}${Math.round(pct)}%`) : null;
  const up = Number.isFinite(pct) && pct >= 1;
  const down = Number.isFinite(pct) && pct <= -1;
  return (
    <Box sx={{ height: '100%', p: 4, borderRadius: '14px', bgcolor: 'background.paper', border: HAIR, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, minWidth: 0 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: '9px', display: 'grid', placeItems: 'center', flexShrink: 0, color, bgcolor: `${color}14` }}>
          <ModuleIcon d={ICONS[icon] || ICONS.average} size={17} />
        </Box>
        <Typography noWrap sx={{ fontSize: 12.5, color: 'text.secondary', minWidth: 0 }}>{title}</Typography>
      </Box>
      <Box>
        <Typography sx={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
        <Typography sx={{ mt: 1, fontSize: 12, color: 'text.secondary', minHeight: 18 }}>
          {shown ? <Box component="span" sx={{ fontWeight: 600, color: up ? '#1d6b45' : down ? '#b42318' : 'text.secondary', mr: 1.5 }}>{shown}</Box> : null}
          {subtitle || (shown ? 'vs previous period' : '')}
        </Typography>
      </Box>
    </Box>
  );
}

function HighlightCard({ h, open, onToggle }) {
  const t = TONE[h.tone] || TONE.info;
  const has = h.detail && h.detail.items && h.detail.items.length > 0;
  return (
    <ButtonBase onClick={has ? onToggle : undefined} disabled={!has} aria-expanded={has ? open : undefined}
      sx={{ width: '100%', height: '100%', p: 4, borderRadius: '14px', bgcolor: 'background.paper', textAlign: 'start',
        border: open ? `1.5px solid ${t.fg}` : HAIR, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 3,
        transition: 'border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease',
        '&:hover': has ? { boxShadow: '0 10px 24px -14px rgba(22,40,30,0.35)', transform: 'translateY(-1px)' } : {},
        '&.Mui-focusVisible': { outline: '2px solid', outlineColor: t.fg, outlineOffset: 2 },
        '&.Mui-disabled': { opacity: 1 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, minHeight: 40 }}>
        <Box sx={{ width: 36, height: 36, borderRadius: '10px', display: 'grid', placeItems: 'center', flexShrink: 0, color: t.fg, bgcolor: t.bg }}>
          <ModuleIcon d={ICONS[h.icon] || ICONS.average} size={19} />
        </Box>
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary', flex: 1, minWidth: 0 }}>{h.label}</Typography>
        <Box component="span" sx={{ fontSize: 11.5, fontWeight: 600, color: t.fg, bgcolor: t.bg, px: 2, py: 0.5, borderRadius: '999px', flexShrink: 0 }}>{t.word}</Box>
      </Box>
      <Typography sx={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{h.value}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, mt: 'auto' }}>
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.45, flex: 1 }}>{h.note}</Typography>
        {has ? (
          <Box component="span" sx={{ display: 'inline-flex', color: 'text.secondary', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }}>
            <ModuleIcon d="M6 9l6 6 6-6" size={16} />
          </Box>
        ) : null}
      </Box>
    </ButtonBase>
  );
}

function HighlightDetail({ h }) {
  const t = TONE[h.tone] || TONE.info;
  const items = h.detail.items;
  const max = Math.max(...items.map((i) => (typeof i.value === 'number' ? i.value : 0)), 0);
  return (
    <Box sx={{ mt: 3, p: { xs: 4, sm: 5 }, borderRadius: '14px', bgcolor: 'background.paper', border: HAIR }}>
      <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 3 }}>{h.detail.title}</Typography>
      {max > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map((i) => (
            <Box key={i.label} sx={{ display: 'grid', gridTemplateColumns: 'minmax(96px, 200px) 1fr auto', alignItems: 'center', gap: 3 }}>
              <Typography noWrap sx={{ fontSize: 13 }}>{i.label}</Typography>
              <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(22,40,30,0.06)', overflow: 'hidden' }}>
                <Box sx={{ width: `${Math.max(2, ((i.value || 0) / max) * 100)}%`, height: '100%', borderRadius: 3, bgcolor: t.fg, opacity: 0.85 }} />
              </Box>
              <Typography sx={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: 80, textAlign: 'end' }}>
                {num(i.value, i.decimals || 0)}{i.unit ? <Box component="span" sx={{ color: 'text.secondary', ml: 1 }}>{i.unit}</Box> : null}
              </Typography>
            </Box>
          ))}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          {items.map((i) => (
            <Box key={i.label} component="span" sx={{ fontSize: 12.5, px: 2.5, py: 1, borderRadius: '8px', bgcolor: 'rgba(22,40,30,0.05)' }}>{i.label}</Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function Highlights({ list }) {
  const [openId, setOpenId] = useState(null);
  const open = list.find((h) => h.id === openId);
  return (
    <Box component="section" aria-label="Highlights" sx={{ mb: 3, '@media print': { display: 'none' } }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: `repeat(${Math.min(4, list.length)}, minmax(0, 1fr))` }, gap: 3 }}>
        {list.map((h) => <HighlightCard key={h.id} h={h} open={openId === h.id} onToggle={() => setOpenId((x) => (x === h.id ? null : h.id))} />)}
      </Box>
      {open ? <HighlightDetail h={open} /> : null}
    </Box>
  );
}

export default function ExecutiveReportPanel({
  title,
  report,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  siteName,
}) {
  const periodLabel = formatPeriodLabel(dateFrom, dateTo);

  const handlePrint = () => {
    window.print();
  };

  if (!report) return null;

  return (
    <Box className="executive-report-panel" sx={{ '@media print': { p: 0 } }}>
      <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, mb: 3, bgcolor: 'background.muted', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <ReportIcon color="primary" />
              Executive Report
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {title}{siteName ? ` · ${siteName}` : ''} · {periodLabel}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', '@media print': { display: 'none' } }}>
            <TextField
              size="small" label="From" type="date" value={dateFrom}
              onChange={(e) => onDateFromChange(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
            />
            <TextField
              size="small" label="To" type="date" value={dateTo}
              onChange={(e) => onDateToChange(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
            />
            <Button variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint} size="small">
              Print
            </Button>
          </Box>
        </Box>
      </Paper>

      {!report.hasData ? (
        <InfoNote mode="line" severity="info">No data found for the selected date range. Adjust the dates or check that entries exist.</InfoNote>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${Math.min(4, report.kpis.length)}, minmax(0, 1fr))` }, gap: 3, mb: 3 }}>
            {report.kpis.map((kpi) => <KpiCard key={kpi.title} {...kpi} />)}
          </Box>

          {report.highlights?.length ? <Highlights list={report.highlights} /> : null}

          <Box sx={{ mb: 3, px: { xs: 4, sm: 5 }, py: 4, borderRadius: '14px', bgcolor: 'background.paper', border: HAIR, display: 'flex', gap: 3, alignItems: 'flex-start' }}>
            <Box sx={{ color: 'text.secondary', mt: 0.25, flexShrink: 0 }}><ModuleIcon d={ICON_PATHS.summary} size={18} /></Box>
            <Box>
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mb: 1 }}>In short</Typography>
              <Typography sx={{ fontSize: 14, lineHeight: 1.6 }}>{report.summary}</Typography>
              {/* Printed copy keeps the written findings; on screen they are the cards above. */}
              <Box component="ul" sx={{ display: 'none', '@media print': { display: 'block' }, m: 0, mt: 2, pl: 5 }}>
                {report.insights.map((i) => <li key={i.message}>{i.message}</li>)}
              </Box>
            </Box>
          </Box>

          <Grid container spacing={2}>
            {report.topFive.map((section) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={section.title}>
                <Paper elevation={0} sx={{ p: 2, height: '100%', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                    {section.title}
                  </Typography>
                  {section.items.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">No data</Typography>
                  ) : (
                    <List dense disablePadding>
                      {section.items.map((item, idx) => (
                        <ListItem key={`${item.label}-${idx}`} disableGutters sx={{ py: 0.75, borderBottom: idx < section.items.length - 1 ? 1 : 0, borderColor: 'divider' }}>
                          <Chip
                            label={idx + 1}
                            size="small"
                            sx={{ mr: 1.5, minWidth: 28, height: 24, fontWeight: 700, bgcolor: idx === 0 ? 'primary.main' : 'background.muted', color: idx === 0 ? 'primary.contrastText' : 'text.primary' }}
                          />
                          <ListItemText
                            primary={item.label == null || item.label === '' || item.label === 'undefined' ? 'Unnamed' : item.label}
                            secondary={item.subtitle}
                            primaryTypographyProps={{ fontWeight: 600, fontSize: '0.875rem' }}
                            secondaryTypographyProps={{ fontSize: '0.75rem' }}
                          />
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap', ml: 1 }}>
                            {item.value}
                          </Typography>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Paper>
              </Grid>
            ))}
          </Grid>
        </>
      )}
    </Box>
  );
}
