import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, ButtonBase, Checkbox, LinearProgress, MenuItem, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { confirmAction } from '../../components/ConfirmDialog';
import { API_BASE, getAuthHeaders } from '../../config/api';
import { ModuleIcon } from '../../config/moduleIcons';
import {
  readWorkbook, similarSheets, autoMap, fillDown, chunkRows, mergeResults, dateSpan, downloadTemplate,
} from '../../utils/excelImport';

/*
 * Import from Excel: years of old sheets for the same forms go into the system in
 * four steps. Every sheet of the workbook is read, columns are matched by name
 * (English or Arabic), a check shows new rows, rows already in the system and
 * rows that cannot be read (with sheet and row), and only then is anything written.
 */

const HAIR = '1px solid rgba(22,40,30,0.07)';
const CARD = { bgcolor: 'background.paper', border: HAIR, borderRadius: '16px' };
const MONO = '"IBM Plex Mono", monospace';
const BATCH = 1500;
const FORM_ICON = { harvests: '/harvest/entry', ecph: '/ecph-entry', ecph_full: '/ecph-entry', fertigation: '/fertigation/entry' };
const ECPH_FILL = ['date', 'time', 'field_name', 'qty_of_water', 'cycle', 'total_water_qty', 'total_water_drip', 'weather_condition', 'irrigation_status'];

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error?.message || `Request failed (${res.status})`);
  return json.data;
}

function Step({ n, title, desc, done, children, action }) {
  return (
    <Box component="section" sx={{ ...CARD, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3, px: { xs: 4, sm: 5 }, py: 4, borderBottom: children ? HAIR : 0 }}>
        <Box sx={{ width: 28, height: 28, borderRadius: '8px', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 13, fontWeight: 600,
          bgcolor: done ? 'primary.main' : 'rgba(22,67,46,0.08)', color: done ? '#fff' : 'primary.dark' }}>
          {done ? <ModuleIcon d="M5 12l4 4 10-10" size={16} stroke={2} /> : n}
        </Box>
        <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
          <Typography component="h2" sx={{ fontSize: 14.5, fontWeight: 600 }}>{title}</Typography>
          {desc ? <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.5 }}>{desc}</Typography> : null}
        </Box>
        {action ? <Box sx={{ ml: 'auto', display: 'flex', justifyContent: 'flex-end' }}>{action}</Box> : null}
      </Box>
      {children ? <Box sx={{ p: { xs: 4, sm: 5 } }}>{children}</Box> : null}
    </Box>
  );
}

function Figure({ label, value, tone }) {
  return (
    <Box sx={{ px: 4, py: 3, borderRadius: '12px', border: HAIR, minWidth: 0 }}>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{label}</Typography>
      <Typography sx={{ mt: 1, fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: tone || 'text.primary' }}>{value}</Typography>
    </Box>
  );
}

export default function HistoricalImport() {
  const [params] = useSearchParams();
  const fileRef = useRef(null);
  const [targets, setTargets] = useState(null);
  const [targetKey, setTargetKey] = useState(params.get('target') || '');
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]);
  const [picked, setPicked] = useState([]);
  const [mapping, setMapping] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [check, setCheck] = useState(null);
  const [done, setDone] = useState(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/imports/targets`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => setTargets(d.success ? d.data || [] : []))
      .catch(() => setTargets([]));
  }, []);

  const target = useMemo(() => (targets || []).find((t) => t.key === targetKey) || null, [targets, targetKey]);
  const rows = useMemo(() => sheets.filter((s) => picked.includes(s.name)).flatMap((s) => s.rows), [sheets, picked]);
  const headers = useMemo(() => {
    const seen = new Set();
    sheets.filter((s) => picked.includes(s.name)).forEach((s) => s.headers.forEach((h) => seen.add(h)));
    return [...seen];
  }, [sheets, picked]);
  const span = useMemo(() => dateSpan(rows, mapping.date), [rows, mapping.date]);
  const missing = target ? target.fields.filter((f) => f.required && !mapping[f.key]) : [];

  useEffect(() => { if (target && headers.length) setMapping(autoMap(target.fields, headers)); }, [target, headers]);
  useEffect(() => { setCheck(null); setDone(null); }, [targetKey, picked, mapping]);

  const openFile = async (f) => {
    if (!f) return;
    setError(''); setBusy(true); setFileName(f.name); setSheets([]); setPicked([]);
    try {
      if (!/\.(xlsx|xlsm|xls|csv)$/i.test(f.name)) throw new Error('Choose an Excel file (.xlsx, .xls) or a CSV file');
      const book = readWorkbook(await f.arrayBuffer());
      if (!book.length) throw new Error('No sheet in this file has data rows');
      setSheets(book);
      setPicked(similarSheets(book));
    } catch (e) {
      setError(e.message || 'Could not read the file');
      setFileName('');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const run = async (dryRun) => {
    if (!target || !rows.length) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const data = rows.map((r) => ({ ...r }));
      if (target.key === 'ecph_full') fillDown(data, ECPH_FILL.map((k) => mapping[k]));
      const keyOf = target.key === 'ecph_full' ? (r) => `${r[mapping.field_name]}|${r[mapping.date]}|${r[mapping.time] || ''}` : null;
      const batches = chunkRows(data, BATCH, keyOf);
      const parts = [];
      for (let i = 0; i < batches.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        parts.push(await post('/imports/execute-json', { rows: batches[i], target: target.key, mapping, dryRun, fileName }));
        setProgress(Math.round(((i + 1) / batches.length) * 100));
      }
      const merged = mergeResults(parts);
      if (dryRun) setCheck(merged); else { setDone(merged); setCheck(null); }
    } catch (e) {
      setError(e.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const result = done || check;
  const s = result?.stats;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 1080 }}>
      <Box>
        <Typography component="h1" sx={{ fontSize: { xs: 22, md: 24 }, fontWeight: 600, letterSpacing: '-0.02em' }}>Import from Excel</Typography>
        <Typography sx={{ mt: 1.5, fontSize: 13.5, color: 'text.secondary', maxWidth: 680, lineHeight: 1.5 }}>
          Bring old records of the same forms into the system: every sheet of a workbook, years at a time. Nothing is written until you confirm, and rows already in the system are skipped
        </Typography>
      </Box>

      {error ? <Alert severity="error" onClose={() => setError('')}>{error}</Alert> : null}

      {/* 1. Form */}
      <Step n={1} done={!!target} title="Which form" desc="The records in the file are entries of this form"
        action={target ? (
          <Button size="small" variant="outlined" onClick={() => downloadTemplate(target)} startIcon={<ModuleIcon d="M12 3v12M8 11l4 4 4-4M4 21h16" size={16} />}>Template</Button>
        ) : null}>
        {!targets ? <LinearProgress /> : targets.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Import is open to the operation manager, agronomists and data-entry staff</Typography>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 3 }}>
            {targets.map((t) => {
              const on = t.key === targetKey;
              return (
                <ButtonBase key={t.key} onClick={() => setTargetKey(t.key)} aria-pressed={on}
                  sx={{ p: 4, gap: 3, borderRadius: '12px', justifyContent: 'flex-start', alignItems: 'flex-start', textAlign: 'start',
                    border: on ? '1.5px solid' : HAIR, borderColor: on ? 'primary.main' : undefined, bgcolor: on ? 'rgba(22,67,46,0.04)' : 'transparent',
                    '&:hover': { borderColor: on ? 'primary.main' : 'rgba(22,40,30,0.16)' }, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}>
                  <Box sx={{ width: 36, height: 36, borderRadius: '10px', display: 'grid', placeItems: 'center', flexShrink: 0, color: 'primary.dark', bgcolor: 'rgba(22,67,46,0.07)' }}>
                    <ModuleIcon path={FORM_ICON[t.key]} size={18} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{t.label}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>{t.fields.filter((f) => f.required).map((f) => f.label).join(' · ')}</Typography>
                  </Box>
                </ButtonBase>
              );
            })}
          </Box>
        )}
        {target ? <Typography sx={{ mt: 4, fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>{target.description}</Typography> : null}
      </Step>

      {/* 2. File and sheets */}
      <Step n={2} done={rows.length > 0} title="File and sheets" desc="Every sheet laid out like the main one is picked; untick a sheet to leave it out">
        <input ref={fileRef} type="file" hidden accept=".xlsx,.xlsm,.xls,.csv" onChange={(e) => openFile(e.target.files?.[0])} />
        <ButtonBase disabled={!target || busy} onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (target) openFile(e.dataTransfer.files?.[0]); }}
          sx={{ width: '100%', minHeight: 96, px: 4, borderRadius: '12px', border: '1.5px dashed', borderColor: drag ? 'primary.main' : 'rgba(22,40,30,0.18)',
            bgcolor: drag ? 'rgba(22,67,46,0.04)' : 'transparent', display: 'flex', gap: 3, opacity: target ? 1 : 0.5 }}>
          <ModuleIcon d="M12 15V3M8 7l4-4 4 4M4 15v5h16v-5" size={22} />
          <Box sx={{ textAlign: 'start' }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{fileName || 'Drop the workbook here or choose a file'}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>{target ? 'Excel (.xlsx, .xls) or CSV, read in your browser' : 'Pick the form first'}</Typography>
          </Box>
        </ButtonBase>
        {busy && !sheets.length ? <LinearProgress sx={{ mt: 4 }} /> : null}
        {sheets.length ? (
          <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {sheets.map((sh) => {
              const on = picked.includes(sh.name);
              return (
                <Box key={sh.name} component="label" sx={{ display: 'flex', alignItems: 'center', gap: 3, px: 2, height: 40, borderRadius: '8px', cursor: 'pointer', '&:hover': { bgcolor: 'rgba(22,40,30,0.035)' } }}>
                  <Checkbox size="small" checked={on} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== sh.name) : [...p, sh.name]))} sx={{ p: 0.5 }} />
                  <Typography sx={{ fontSize: 13.5, fontWeight: 500, flex: 1, minWidth: 0 }} noWrap>{sh.name}</Typography>
                  <Typography sx={{ font: `500 12px ${MONO}`, color: 'text.secondary' }}>{sh.rows.length.toLocaleString('en-US')} rows · {sh.headers.length} columns</Typography>
                </Box>
              );
            })}
            <Typography sx={{ mt: 2, fontSize: 12.5, color: 'text.secondary' }}>
              {rows.length.toLocaleString('en-US')} rows from {picked.length} of {sheets.length} sheets{span ? ` · ${span.min} to ${span.max}` : ''}
            </Typography>
          </Box>
        ) : null}
      </Step>

      {/* 3. Columns */}
      {target && rows.length ? (
        <Step n={3} done={!missing.length} title="Columns" desc="Matched by name in English or Arabic; change any that are wrong">
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {target.fields.map((f) => (
              <Box key={f.key} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2, py: 3, '& + &': { borderTop: '1px solid rgba(22,40,30,0.05)' } }}>
                <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>
                    {f.label}{f.required ? <Box component="span" sx={{ ml: 2, fontSize: 11.5, color: 'warning.dark' }}>required</Box> : null}
                  </Typography>
                  {f.description ? <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>{f.description}</Typography> : null}
                </Box>
                <TextField select size="small" value={mapping[f.key] || ''} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                  sx={{ flex: '0 1 320px', minWidth: 200 }} slotProps={{ htmlInput: { 'aria-label': `Column for ${f.label}` } }}>
                  <MenuItem value=""><Box component="span" sx={{ color: 'text.disabled' }}>Not in the file</Box></MenuItem>
                  {headers.map((h) => <MenuItem key={h} value={h}>{h}</MenuItem>)}
                </TextField>
              </Box>
            ))}
          </Box>
          {rows.length ? (
            <TableContainer sx={{ mt: 4, maxHeight: 240, borderRadius: '12px', border: HAIR }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {target.fields.filter((f) => mapping[f.key]).map((f) => <TableCell key={f.key} sx={{ fontSize: 12, fontWeight: 500, color: 'text.secondary', whiteSpace: 'nowrap' }}>{f.label}</TableCell>)}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.slice(0, 5).map((r) => (
                    <TableRow key={r.__ref}>
                      {target.fields.filter((f) => mapping[f.key]).map((f) => <TableCell key={f.key} sx={{ fontSize: 13, whiteSpace: 'nowrap' }}>{r[mapping[f.key]]}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : null}
        </Step>
      ) : null}

      {/* 4. Check and import */}
      {target && rows.length ? (
        <Step n={4} done={!!done} title="Check, then import" desc="The check reads every row against the system without writing anything"
          action={(
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button variant="outlined" disabled={busy || missing.length > 0} onClick={() => run(true)}>Check file</Button>
              <Button variant="contained" disableElevation disabled={busy || !check || !check.stats.toInsert}
                onClick={async () => {
                  if (!(await confirmAction(`Import ${check.stats.toInsert.toLocaleString('en-US')} new rows into ${target.label}?`, { confirmLabel: 'Import' }))) return;
                  run(false);
                }}>
                {check ? `Import ${check.stats.toInsert.toLocaleString('en-US')} rows` : 'Import'}
              </Button>
            </Box>
          )}>
          {missing.length ? <Typography sx={{ fontSize: 13, color: 'warning.dark' }}>Pick a column for {missing.map((f) => f.label).join(', ')}</Typography> : null}
          {busy ? <Box><LinearProgress variant="determinate" value={progress} /><Typography sx={{ mt: 2, fontSize: 12, color: 'text.secondary' }}>{progress}%</Typography></Box> : null}
          {!busy && !missing.length && !s ? <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Run the check to see how many rows are new</Typography> : null}
          {s ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {done ? <Alert severity="success">{done.demo ? `Demo: ${s.toInsert.toLocaleString('en-US')} rows passed every check. The demo does not store imported rows; the real system writes them` : `Imported ${s.toInsert.toLocaleString('en-US')} rows${s.valvesInserted ? ` and ${s.valvesInserted.toLocaleString('en-US')} valve readings` : ''}`}</Alert> : null}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 3 }}>
                <Figure label="Rows read" value={s.total.toLocaleString('en-US')} />
                <Figure label={done ? 'Imported' : 'New'} value={s.toInsert.toLocaleString('en-US')} tone="#1d6b45" />
                <Figure label="Already in the system" value={s.skipped.toLocaleString('en-US')} />
                <Figure label="Cannot be read" value={s.errorCount.toLocaleString('en-US')} tone={s.errorCount ? '#b42318' : undefined} />
              </Box>
              {s.cropResolution && (s.cropResolution.unresolved > 0) ? (
                <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                  {s.cropResolution.unresolved.toLocaleString('en-US')} rows have no crop: map a crop column or add the field's Crop Rotation first
                </Typography>
              ) : null}
              {s.errors.length ? (
                <TableContainer sx={{ maxHeight: 280, borderRadius: '12px', border: HAIR }}>
                  <Table size="small" stickyHeader>
                    <TableHead><TableRow><TableCell sx={{ width: 220, fontSize: 12, color: 'text.secondary' }}>Where</TableCell><TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>Problem</TableCell></TableRow></TableHead>
                    <TableBody>
                      {s.errors.map((e, i) => (
                        <TableRow key={`${e.row}-${i}`}><TableCell sx={{ font: `500 12px ${MONO}`, whiteSpace: 'nowrap' }}>{e.row}</TableCell><TableCell sx={{ fontSize: 13 }}>{e.reason}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : null}
              {s.errorCount > s.errors.length ? <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>First {s.errors.length} problems shown</Typography> : null}
            </Box>
          ) : null}
        </Step>
      ) : null}
    </Box>
  );
}

