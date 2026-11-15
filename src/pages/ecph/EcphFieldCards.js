import { useMemo, useState } from 'react';
import { Box, ButtonBase, IconButton, InputBase, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

const GREEN = '#1f7a4d';
const WARN = '#c2591f';

/** One labelled number box: 44px tall, decimal keypad, tinted when out of range. */
function NumBox({ label, value, onChange, warn, readOnly, placeholder = '0.00', idPrefix }) {
  return (
    <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.75rem', color: 'text.secondary', minWidth: 0 }}>
      {label}
      <InputBase
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value.replace(',', '.'))}
        readOnly={readOnly}
        placeholder={placeholder}
        inputProps={{ inputMode: 'decimal', 'aria-label': `${idPrefix} ${label}`, enterKeyHint: 'next' }}
        sx={{
          height: 44, px: 1.5, fontSize: '0.9375rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums',
          border: warn ? `1.5px solid ${WARN}` : 1, borderColor: warn ? WARN : 'divider',
          bgcolor: warn ? alpha(WARN, 0.07) : 'background.paper', color: 'text.primary',
          '&.Mui-focused': { borderColor: GREEN, boxShadow: `inset 0 0 0 1px ${GREEN}` },
        }}
      />
    </Box>
  );
}

const filled = (r) => r.valveNumber && r.dripVolume;

/**
 * Phone entry: one card per field. The open card holds its valves as labelled
 * boxes in two columns; closed cards show where they stand. Same rows and
 * handlers as the sheet, so saving works the same way.
 */
export default function EcphFieldCards({ rows, keyOf, isFarmPlot, updateRow, addValveRow, removeRow, cellColor, readOnly }) {
  const fields = useMemo(() => {
    const out = [];
    rows.forEach((r, idx) => {
      const last = out[out.length - 1];
      if (last && last.fieldId === r.fieldId) last.items.push({ r, idx });
      else out.push({ fieldId: r.fieldId, name: r.fieldName, items: [{ r, idx }] });
    });
    return out;
  }, [rows]);
  const [open, setOpen] = useState(() => fields[0]?.fieldId || null);

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      {fields.map((f) => {
        const first = f.items[0];
        const done = f.items.filter(({ r }) => filled(r)).length;
        const warn = f.items.some(({ r }) => ['ecIn', 'ecOut', 'phIn', 'phOut'].some((k) => cellColor(r.fieldId, k.startsWith('ec') ? 'ec' : 'ph', r[k])));
        const dot = warn ? { bgcolor: WARN } : done ? { bgcolor: '#2f8a57' } : { border: '1.5px solid', borderColor: 'text.disabled' };
        const isOpen = open === f.fieldId;
        const status = `${done ? `${done}/${f.items.length}` : f.items.length} ${f.items.length === 1 ? 'valve' : 'valves'}`;
        if (!isOpen) {
          return (
            <ButtonBase key={f.fieldId} onClick={() => setOpen(f.fieldId)}
              sx={{ justifyContent: 'flex-start', gap: 1.25, minHeight: 56, px: 1.75, border: 1, borderColor: 'divider', bgcolor: 'background.paper', textAlign: 'start' }}>
              <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, ...dot }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>{f.name}</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{status}{first.r.time ? ` · ${first.r.time}` : ''}</Typography>
              </Box>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" style={{ opacity: 0.6 }}><path d="M9 6l6 6-6 6" /></svg>
            </ButtonBase>
          );
        }
        return (
          <Box key={f.fieldId} component="section" aria-label={f.name} sx={{ border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minHeight: 52, pl: 1.75, pr: 1, borderBottom: 1, borderColor: 'divider' }}>
              <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, ...dot }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>{f.name}</Typography>
                {keyOf(f.fieldId) && <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', fontFamily: "'IBM Plex Mono', monospace" }}><bdi dir="ltr">{keyOf(f.fieldId)}</bdi></Typography>}
              </Box>
              <InputBase value={first.r.time || ''} onChange={(e) => updateRow(first.idx, 'time', e.target.value)} readOnly={readOnly}
                placeholder="Time" inputProps={{ 'aria-label': `${f.name} time` }}
                sx={{ width: 96, height: 36, px: 1, border: 1, borderColor: 'divider', fontSize: '0.8125rem' }} />
            </Box>

            <Box sx={{ p: 1.75, display: 'grid', gap: 2 }}>
              {f.items.map(({ r, idx }, i) => {
                const c = (k, kind) => !!cellColor(r.fieldId, kind, r[k]);
                const p = `${f.name} valve ${i + 1}`;
                return (
                  <Box key={r._key} sx={{ display: 'grid', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography component="label" sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 1 }}>
                        Valve
                        <InputBase value={r.valveNumber || ''} onChange={(e) => updateRow(idx, 'valveNumber', e.target.value)} readOnly={readOnly}
                          placeholder="#" inputProps={{ inputMode: 'numeric', 'aria-label': `${p} number` }}
                          sx={{ width: 52, height: 32, px: 1, border: 1, borderColor: 'divider', fontSize: '0.875rem', fontWeight: 600 }} />
                      </Typography>
                      <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
                      {i > 0 && !readOnly && (
                        <IconButton aria-label={`Remove ${p}`} onClick={() => removeRow(idx)} sx={{ width: 40, height: 40 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                        </IconButton>
                      )}
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px 10px' }}>
                      <NumBox idPrefix={p} label="EC in" value={r.ecIn} warn={c('ecIn', 'ec')} readOnly={readOnly} onChange={(v) => updateRow(idx, 'ecIn', v)} />
                      {!isFarmPlot && <NumBox idPrefix={p} label="EC out" value={r.ecOut} warn={c('ecOut', 'ec')} readOnly={readOnly} onChange={(v) => updateRow(idx, 'ecOut', v)} />}
                      <NumBox idPrefix={p} label="pH in" value={r.phIn} warn={c('phIn', 'ph')} readOnly={readOnly} onChange={(v) => updateRow(idx, 'phIn', v)} />
                      {!isFarmPlot && <NumBox idPrefix={p} label="pH out" value={r.phOut} warn={c('phOut', 'ph')} readOnly={readOnly} onChange={(v) => updateRow(idx, 'phOut', v)} />}
                      <NumBox idPrefix={p} label="Drip (ml)" placeholder="0" value={r.dripVolume} readOnly={readOnly} onChange={(v) => updateRow(idx, 'dripVolume', v)} />
                      {!isFarmPlot && <NumBox idPrefix={p} label="Drain (ml)" placeholder="0" value={r.drainVolume} readOnly={readOnly} onChange={(v) => updateRow(idx, 'drainVolume', v)} />}
                    </Box>
                  </Box>
                );
              })}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px 10px' }}>
                <NumBox idPrefix={f.name} label="Water (m³)" placeholder="0.0" value={first.r.qtyOfWater} readOnly={readOnly} onChange={(v) => updateRow(first.idx, 'qtyOfWater', v)} />
                <NumBox idPrefix={f.name} label="Cycles" placeholder="0" value={first.r.cycle} readOnly={readOnly} onChange={(v) => updateRow(first.idx, 'cycle', v)} />
              </Box>
            </Box>

            {!readOnly && (
              <ButtonBase onClick={() => addValveRow(f.fieldId, f.name)}
                sx={{ width: '100%', height: 44, gap: 0.75, borderTop: 1, borderColor: 'divider', color: GREEN, fontSize: '0.8125rem', fontWeight: 500 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                Add valve
              </ButtonBase>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
