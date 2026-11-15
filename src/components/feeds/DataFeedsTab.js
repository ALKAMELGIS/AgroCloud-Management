import { useState } from 'react';
import { Alert, Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import { useFeeds, feedBase, SYNC_LABEL, FormPathDialog, LinkGlyph } from './FormDataPath';

const GREEN = '#1f7a4d';
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const COLS = 'minmax(160px, 1.1fr) 72px minmax(120px, 0.8fr) minmax(220px, 2fr) 110px 130px 92px';

function tableNo(url) {
  const m = /FeatureServer\/(\d+)/i.exec(url || '');
  return m ? `FeatureServer/${m[1]}` : null;
}

/** Settings › Zones & Sites › Data feeds: every form's path, ArcGIS table, sync and keys. */
export default function DataFeedsTab() {
  const { data: feeds, isLoading, error } = useFeeds();
  const [open, setOpen] = useState(null);
  const [copied, setCopied] = useState(null);
  if (isLoading) return <Box sx={{ p: 6, display: 'grid', placeItems: 'center' }}><CircularProgress size={24} /></Box>;
  if (error) return <Alert severity="error">{error.message}</Alert>;
  const list = Array.isArray(feeds) ? feeds : [];
  const base = feedBase(list.some((f) => f.demo));
  const copy = async (form, text) => { try { await navigator.clipboard.writeText(text); setCopied(form); setTimeout(() => setCopied(null), 1500); } catch { /* ignore */ } };

  return (
    <Box sx={{ display: 'grid', gap: 2, px: { xs: 0, md: 0 } }}>
      <Box role="table" aria-label="Form data paths" sx={{ border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Box role="row" sx={{ display: { xs: 'none', lg: 'grid' }, gridTemplateColumns: COLS, gap: 1.5, alignItems: 'center', height: 40, px: 2, borderBottom: 1, borderColor: 'divider', fontSize: '0.75rem', color: 'text.secondary' }}>
          {['Form', 'Relation', 'ArcGIS table', 'Path · CSV', 'Sync', 'Read key', ''].map((h) => <span role="columnheader" key={h}>{h}</span>)}
        </Box>
        {list.map((f) => {
          const path = `${base}/feeds/${f.form}.csv`;
          return (
            <Box role="row" key={f.form} sx={{
              display: 'grid', gap: { xs: 1, lg: 1.5 }, alignItems: 'center', px: 2, py: { xs: 1.5, lg: 1 }, minHeight: 56,
              gridTemplateColumns: { xs: 'minmax(0,1fr) auto', lg: COLS },
              borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 },
            }}>
              <Box role="cell" sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 500, fontSize: '0.8125rem' }}>{f.label}</Typography>
                <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}>{f.records ?? '—'} records</Typography>
              </Box>
              <Box role="cell" sx={{ justifySelf: { xs: 'end', lg: 'start' } }}>
                <Box component="span" sx={{ px: 1, py: 0.25, border: `1px solid ${GREEN}`, color: GREEN, fontSize: '0.6875rem', fontWeight: 600 }}><bdi dir="ltr">1 : N</bdi></Box>
              </Box>
              <Box role="cell" sx={{ display: { xs: f.arcgisTableUrl ? 'block' : 'none', lg: 'block' }, gridColumn: { xs: '1 / -1', lg: 'auto' }, fontFamily: MONO, fontSize: '0.75rem', color: tableNo(f.arcgisTableUrl) ? 'text.primary' : 'text.secondary' }}>
                <Box component="span" sx={{ display: { lg: 'none' }, fontFamily: 'inherit', color: 'text.secondary' }}>ArcGIS: </Box>
                {tableNo(f.arcgisTableUrl) || 'not created'}
              </Box>
              <Box role="cell" sx={{ minWidth: 0, fontFamily: MONO, fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <bdi dir="ltr">{path.replace(base, '')}</bdi>
              </Box>
              <Box role="cell" sx={{ display: { xs: f.arcgisTableUrl ? 'flex' : 'none', lg: 'flex' }, alignItems: 'center', gap: 0.75, fontSize: '0.75rem', color: 'text.secondary' }}>
                <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, ...(f.lastError ? { bgcolor: 'error.main' } : f.arcgisTableUrl && f.syncMode !== 'off' ? { bgcolor: '#2f8a57' } : { border: '1.5px solid', borderColor: 'text.disabled' }) }} />
                {f.arcgisTableUrl ? SYNC_LABEL[f.syncMode] : 'Off'}
              </Box>
              <Box role="cell" sx={{ display: { xs: f.keys?.[0] ? 'block' : 'none', lg: 'block' }, fontFamily: MONO, fontSize: '0.75rem', color: 'text.secondary', justifySelf: { xs: 'end', lg: 'start' } }}>
                <bdi dir="ltr">{f.keys?.[0] ? `${f.keys[0].key_prefix}••••` : '—'}</bdi>
              </Box>
              <Box role="cell" sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                <Tooltip title={copied === f.form ? 'Copied' : 'Copy path'}>
                  <IconButton aria-label={`Copy path of ${f.label}`} onClick={() => copy(f.form, path)} sx={{ border: 1, borderColor: 'divider', borderRadius: 0, color: GREEN, width: 40, height: 40 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="9" y="9" width="11" height="11" /><path d="M5 15V4h11" /></svg>
                  </IconButton>
                </Tooltip>
                <IconButton aria-label={`Manage ${f.label}`} onClick={() => setOpen(f)} sx={{ border: 1, borderColor: 'divider', borderRadius: 0, color: 'text.primary', width: 40, height: 40 }}><LinkGlyph /></IconButton>
              </Box>
            </Box>
          );
        })}
      </Box>
      {open && <FormPathDialog form={open.form} label={open.label} open onClose={() => setOpen(null)} />}
    </Box>
  );
}
