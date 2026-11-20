import { useMemo, useState } from 'react';
import { Box, ButtonBase, Checkbox, InputBase, Popover, TextField, Typography } from '@mui/material';
import { KeyboardArrowDownRounded as ChevronIcon, CalendarTodayOutlined as CalIcon, SearchRounded as SearchIcon } from '@mui/icons-material';
import { displayDate } from '../../utils/displayDate';

/** One control style for the dashboard bar: 36px, label inside, a set value is tinted. */
const controlSx = (on) => ({
  height: 36, px: 2.5, gap: 1.25, borderRadius: '9px', flexShrink: 0, whiteSpace: 'nowrap',
  fontSize: 13, fontWeight: on ? 600 : 500, color: 'text.primary',
  bgcolor: on ? 'rgba(29,92,60,0.06)' : 'background.paper',
  boxShadow: on ? 'inset 0 0 0 1px rgba(29,92,60,0.35)' : 'inset 0 0 0 1px rgba(19,32,26,0.12)',
  '&:hover': { boxShadow: on ? 'inset 0 0 0 1px rgba(29,92,60,0.5)' : 'inset 0 0 0 1px rgba(19,32,26,0.22)' },
  '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
});
const paperSx = { mt: 1.5, borderRadius: '12px', boxShadow: '0 12px 32px rgba(22,40,30,0.14), 0 0 0 1px rgba(22,40,30,0.06)' };

/** "1 Sep 2025 – 31 Dec 2026" as one button; From / To open below it. */
export function PeriodButton({ from, to, onFrom, onTo, min, max }) {
  const [anchor, setAnchor] = useState(null);
  return (
    <>
      <ButtonBase onClick={(e) => setAnchor(e.currentTarget)} aria-haspopup="dialog" aria-expanded={Boolean(anchor)} aria-label={`Period: ${displayDate(from)} to ${displayDate(to)}`} sx={controlSx(false)}>
        <CalIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
        <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{from ? displayDate(from) : 'Start'} – {to ? displayDate(to) : 'Today'}</Box>
      </ButtonBase>
      <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} slotProps={{ paper: { sx: { ...paperSx, p: 4, display: 'flex', gap: 3 } } }}>
        <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={from || ''} onChange={(e) => onFrom(e.target.value)} inputProps={{ min: min || undefined, max: max || undefined }} sx={{ width: 160 }} />
        <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={to || ''} onChange={(e) => onTo(e.target.value)} inputProps={{ min: min || undefined, max: max || undefined }} sx={{ width: 160 }} />
      </Popover>
    </>
  );
}

/** A slicer as one compact button ("Zone MH ▾"); the list opens below with search and checkboxes. Empty = all. */
export function BarSlicer({ label, options, value, onChange }) {
  const [anchor, setAnchor] = useState(null);
  const [q, setQ] = useState('');
  const on = value.length > 0;
  const summary = !on ? 'All' : value.length === 1 ? value[0] : `${value.length} selected`;
  const shown = useMemo(() => options.filter((o) => String(o).toLowerCase().includes(q.toLowerCase())), [options, q]);
  const toggle = (o) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <>
      <ButtonBase onClick={(e) => { setQ(''); setAnchor(e.currentTarget); }} aria-haspopup="listbox" aria-expanded={Boolean(anchor)} aria-label={`${label}: ${summary}`} sx={controlSx(on)}>
        <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>{label}</Box>
        <Box component="span" title={value.join(', ') || undefined} sx={{ maxWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</Box>
        <ChevronIcon sx={{ fontSize: 16, color: 'text.secondary', mr: -1 }} />
      </ButtonBase>
      <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} slotProps={{ paper: { sx: { ...paperSx, width: 240, p: 1 } } }}>
        {options.length > 6 ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mx: 1, mb: 1, px: 2, height: 34, borderRadius: '8px', bgcolor: 'background.muted' }}>
            <SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <InputBase autoFocus placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} sx={{ fontSize: 13, flex: 1 }} inputProps={{ 'aria-label': `Search ${label}` }} />
          </Box>
        ) : null}
        <Box role="listbox" aria-multiselectable="true" aria-label={label} sx={{ maxHeight: 280, overflowY: 'auto' }}>
          {shown.map((o) => {
            const sel = value.includes(o);
            return (
              <ButtonBase key={o} role="option" aria-selected={sel} onClick={() => toggle(o)}
                sx={{ width: '100%', justifyContent: 'flex-start', gap: 1.5, minHeight: 34, px: 1.5, borderRadius: '8px', fontSize: 13, fontWeight: sel ? 600 : 400, '&:hover': { bgcolor: 'action.hover' }, '@media (pointer: coarse)': { minHeight: 44 } }}>
                <Checkbox size="small" checked={sel} tabIndex={-1} sx={{ p: 0.5 }} />
                <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o}</Box>
              </ButtonBase>
            );
          })}
          {!shown.length ? <Typography sx={{ px: 2, py: 2, fontSize: 13, color: 'text.secondary' }}>No match</Typography> : null}
        </Box>
        {on ? (
          <Box sx={{ borderTop: 1, borderColor: 'divider', mt: 1, pt: 1 }}>
            <ButtonBase onClick={() => onChange([])} sx={{ width: '100%', justifyContent: 'flex-start', minHeight: 32, px: 2, borderRadius: '8px', fontSize: 12.5, color: 'primary.main', fontWeight: 500 }}>Clear {label}</ButtonBase>
          </Box>
        ) : null}
      </Popover>
    </>
  );
}

/** Form switch as a segmented control (one tab per form, with its colour dot). */
export function FormSegments({ tabs, value, onChange, identity }) {
  return (
    <Box role="tablist" aria-label="Dashboard form" sx={{ display: 'flex', gap: 0.5, p: 0.75, borderRadius: '10px', bgcolor: 'background.muted', flexShrink: 1, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none', maxWidth: '100%' }}>
      {tabs.map((t, i) => {
        const on = value === i;
        const f = identity[t.key];
        return (
          <ButtonBase key={t.key} role="tab" aria-selected={on} onClick={() => onChange(i)}
            sx={{ height: 30, px: 2.5, gap: 1.75, borderRadius: '7px', fontSize: 13, fontWeight: on ? 600 : 500, whiteSpace: 'nowrap',
              color: on ? 'text.primary' : 'text.secondary', bgcolor: on ? 'background.paper' : 'transparent',
              boxShadow: on ? '0 1px 2px rgba(19,32,26,0.1), 0 0 0 1px rgba(19,32,26,0.05)' : 'none',
              '&:hover': { color: 'text.primary' }, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' } }}>
            <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: f.base }} />
            {t.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}
