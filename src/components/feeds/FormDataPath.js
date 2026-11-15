import { useMemo, useState } from 'react';
import {
  Box, Button, ButtonBase, Dialog, DialogContent, IconButton, MenuItem, TextField, Typography, Alert, Tooltip, CircularProgress,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { apiRequest } from '../../utils/api';
import { API_BASE } from '../../config/api';
import { useAuth } from '../../contexts/AuthContext';
import { INTEGRATION_ADMIN_ROLES } from '../../utils/roleAccess';
import { useMasterData } from '../../utils/useMasterData';

const GREEN = '#1f7a4d';
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export const LinkGlyph = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" aria-hidden="true">
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </svg>
);
const CopyGlyph = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="9" y="9" width="11" height="11" /><path d="M5 15V4h11" /></svg>
);
const OpenGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></svg>
);

/** The public address of the feeds: the API base, or a placeholder when this build has no server (demo). */
export function feedBase(demo) {
  const local = /localhost|127\.0\.0\.1/.test(API_BASE) && typeof window !== 'undefined' && !/localhost|127\.0\.0\.1/.test(window.location.hostname);
  return demo || local ? 'https://[your-server]/api/v1' : API_BASE.replace(/\/$/, '');
}

export const SYNC_LABEL = { off: 'Off', save: 'Every 5 min', hourly: 'Hourly', daily: 'Daily' };

export function useFeeds() {
  return useQuery({ queryKey: ['feeds'], queryFn: () => apiRequest('/feeds'), staleTime: 30000 });
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function PathRow({ label, value, action, onCopied }) {
  const [done, setDone] = useState(false);
  return (
    <Box sx={{ display: 'flex', gap: 1, minWidth: 0 }}>
      <TextField value={value} size="small" fullWidth InputProps={{ readOnly: true, sx: { fontFamily: MONO, fontSize: '0.75rem', bgcolor: 'action.hover' } }}
        inputProps={{ 'aria-label': label, dir: 'ltr', onFocus: (e) => e.target.select() }} />
      <Button variant={action ? 'contained' : 'outlined'} disableElevation startIcon={<CopyGlyph />} sx={{ flexShrink: 0, minWidth: 92 }}
        onClick={async () => { if (await copy(value)) { setDone(true); onCopied?.(); setTimeout(() => setDone(false), 1500); } }}>
        {done ? 'Copied' : 'Copy'}
      </Button>
    </Box>
  );
}

/** The dialog body, also used per row in the Data feeds tab. */
export function FormPathPanel({ form, onClose }) {
  const { user } = useAuth();
  const isAdmin = INTEGRATION_ADMIN_ROLES.includes(user?.role);
  const qc = useQueryClient();
  const { data: feeds, isLoading, error } = useFeeds();
  const { data: master } = useMasterData();
  const feed = useMemo(() => (Array.isArray(feeds) ? feeds.find((f) => f.form === form) : null), [feeds, form]);
  const demo = !!feed?.demo;
  const [format, setFormat] = useState('csv');
  const [keyid, setKeyid] = useState('');
  const [newKey, setNewKey] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const keyOptions = useMemo(() => {
    if (!feed) return [];
    const sites = (master?.countries || []).flatMap((c) => c.sites || []);
    const keys = feed.linkBy === 'site'
      ? sites.map((s) => s.keyId || s.key_id)
      : sites.flatMap((s) => (s.farmAreas || []).flatMap((a) => (a.fields || []).map((f) => f.keyId || f.key_id)));
    return [...new Set(keys.filter(Boolean))].sort();
  }, [feed, master]);

  if (isLoading) return <Box sx={{ p: 4, display: 'grid', placeItems: 'center' }}><CircularProgress size={24} /></Box>;
  if (error || !feed) return <Alert severity="error" sx={{ m: 2 }}>{error?.message || 'This form has no data path.'}</Alert>;

  const base = feedBase(demo);
  const path = `${base}/feeds/${form}.${format}${keyid ? `?keyid=${encodeURIComponent(keyid)}` : ''}`;
  const run = async (name, fn, ok) => {
    setBusy(name); setMsg(null);
    try { const r = await fn(); if (ok) setMsg({ type: 'success', text: ok(r) }); qc.invalidateQueries({ queryKey: ['feeds'] }); } catch (e) { setMsg({ type: 'error', text: e.message }); }
    setBusy(null);
  };
  const origin = feed.linkBy === 'field' ? 'Agro_Structures' : 'Sites';
  const originKey = feed.linkBy === 'field' ? 'ID 21 · GlobalID' : 'Site KeyID';
  const destKey = feed.linkBy === 'field' ? 'STRUCT_GLOBALID · KEYID' : 'SITE_KEYID';

  return (
    <Box sx={{ display: 'grid', gap: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: 'action.hover', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.8125rem' }}>{origin}</Typography>
          <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', fontFamily: MONO }}>{originKey}</Typography>
        </Box>
        <Box aria-hidden sx={{ flex: 1, minWidth: 60, display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ flex: 1, height: '1px', bgcolor: GREEN }} />
          <Box component="span" sx={{ px: 1, py: 0.25, border: `1px solid ${GREEN}`, color: GREEN, fontSize: '0.6875rem', fontWeight: 600 }}><bdi dir="ltr">1 : N</bdi></Box>
          <Box sx={{ flex: 1, height: '1px', bgcolor: GREEN }} />
        </Box>
        <Box sx={{ minWidth: 0, textAlign: 'end' }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.8125rem' }}>{feed.label} records</Typography>
          <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', fontFamily: MONO }}>{destKey}</Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.8125rem', flex: 1 }}>ArcGIS Online · related table</Typography>
          {feed.arcgisTableUrl && (
            <Typography sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '0.75rem', color: 'text.secondary' }}>
              <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: feed.lastError ? 'error.main' : feed.syncMode === 'off' ? 'text.disabled' : '#2f8a57' }} />
              {feed.lastSyncedAt ? `Synced ${new Date(feed.lastSyncedAt).toLocaleString()}` : 'Not synced yet'} · {SYNC_LABEL[feed.syncMode]}
            </Typography>
          )}
        </Box>
        {feed.arcgisTableUrl ? (
          <Box sx={{ display: 'flex', gap: 1, minWidth: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}><PathRow label="ArcGIS path" value={feed.arcgisTableUrl} action /></Box>
            <Button variant="outlined" href={feed.arcgisTableUrl} target="_blank" rel="noopener noreferrer" endIcon={<OpenGlyph />} sx={{ flexShrink: 0 }}>Open</Button>
          </Box>
        ) : (
          <Alert severity="info" icon={false} sx={{ fontSize: '0.75rem' }}>
            No ArcGIS table yet. {isAdmin ? 'Create it inside the Agro_Structures service, or paste the link of a table you made.' : 'Ask the CEO or operation manager to create it.'}
          </Alert>
        )}
        {feed.lastError && <Alert severity="error" sx={{ fontSize: '0.75rem' }}>{feed.lastError}</Alert>}
        {isAdmin && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {!feed.arcgisTableUrl && (
              <Button size="small" variant="contained" disableElevation disabled={!!busy}
                onClick={() => run('create', () => apiRequest(`/feeds/${form}/arcgis-table`, { method: 'POST' }), (r) => `Table ${r.id} created`)}>
                {busy === 'create' ? 'Creating…' : 'Create table in ArcGIS'}
              </Button>
            )}
            {feed.arcgisTableUrl && (
              <Button size="small" variant="outlined" disabled={!!busy}
                onClick={() => run('sync', () => apiRequest(`/feeds/${form}/sync`, { method: 'POST' }), (r) => `${r.added} records sent to ArcGIS`)}>
                {busy === 'sync' ? 'Syncing…' : 'Sync now'}
              </Button>
            )}
            <TextField select size="small" label="Sync" value={feed.syncMode} sx={{ minWidth: 140 }} disabled={!!busy || !feed.arcgisTableUrl}
              onChange={(e) => run('mode', () => apiRequest(`/feeds/${form}`, { method: 'PUT', body: JSON.stringify({ syncMode: e.target.value }) }))}>
              {Object.entries(SYNC_LABEL).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
            </TextField>
          </Box>
        )}
        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
          In ArcGIS Pro run Create Relationship Class once: origin {origin} ({feed.linkBy === 'field' ? 'GlobalID' : 'Site KeyID'}), destination this table ({feed.linkBy === 'field' ? 'STRUCT_GLOBALID' : 'SITE_KEYID'}), one to many. The popup of each shape then lists its records.
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gap: 1 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.8125rem' }}>Power BI · Excel · other systems</Typography>
        <Box role="tablist" aria-label="Format" sx={{ display: 'flex', width: 'max-content', border: 1, borderColor: 'divider' }}>
          {['csv', 'geojson', 'json'].map((f) => (
            <ButtonBase key={f} role="tab" aria-selected={format === f} onClick={() => setFormat(f)}
              sx={{ height: 32, px: 1.75, fontSize: '0.75rem', fontWeight: 500, bgcolor: format === f ? 'text.primary' : 'background.paper', color: format === f ? 'background.paper' : 'text.primary' }}>
              {f === 'csv' ? 'CSV' : f === 'geojson' ? 'GeoJSON' : 'JSON'}
            </ButtonBase>
          ))}
        </Box>
        <PathRow label="Feed path" value={path} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0,1fr) minmax(0,1fr)' }, gap: 1.5 }}>
          <TextField select size="small" label="Records of" value={keyid} onChange={(e) => setKeyid(e.target.value)} InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true, MenuProps: { PaperProps: { sx: { maxHeight: 320 } } } }}>
            <MenuItem value="">All {feed.linkBy === 'field' ? 'fields' : 'sites'}</MenuItem>
            {keyOptions.map((k) => <MenuItem key={k} value={k} sx={{ fontFamily: MONO, fontSize: '0.75rem' }}>{k}</MenuItem>)}
          </TextField>
          <Box sx={{ display: 'grid', gap: 0.5 }}>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Header for Power BI</Typography>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.75rem' }}>
              <bdi dir="ltr">X-API-Key: {feed.keys?.[0] ? `${feed.keys[0].key_prefix}••••` : 'no key yet'}</bdi>
            </Typography>
          </Box>
        </Box>
        {newKey && (
          <Alert severity="warning" sx={{ fontSize: '0.75rem', '& .MuiAlert-message': { width: '100%', minWidth: 0 } }}>
            Copy this key now. It is shown only once.
            <Box sx={{ mt: 1 }}><PathRow label="New key" value={newKey} action /></Box>
          </Alert>
        )}
        {isAdmin && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button size="small" variant="outlined" disabled={!!busy}
              onClick={() => run('key', async () => { const k = await apiRequest(`/feeds/${form}/keys`, { method: 'POST' }); setNewKey(k.key); return k; })}>
              {busy === 'key' ? 'Creating…' : 'New read key'}
            </Button>
            {(feed.keys || []).map((k) => (
              <Tooltip key={k.id} title={k.last_used ? `Last used ${new Date(k.last_used).toLocaleString()}` : 'Not used yet'}>
                <Button size="small" color="error" disabled={!!busy}
                  onClick={() => run('revoke', () => apiRequest(`/feeds/keys/${k.id}`, { method: 'DELETE' }), () => 'Key revoked')}>
                  Revoke <bdi dir="ltr">{k.key_prefix}••••</bdi>
                </Button>
              </Tooltip>
            ))}
          </Box>
        )}
      </Box>

      {msg && <Alert severity={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pt: 1.5, borderTop: 1, borderColor: 'divider', fontSize: '0.75rem', color: 'text.secondary', flexWrap: 'wrap' }}>
        <span>Read only · {feed.records ?? '—'} records · {feed.includeNames ? 'staff names included' : 'staff names not shared'}</span>
        <Box sx={{ flex: 1 }} />
        {onClose && <Button size="small" component={RouterLink} to="/manage/countries?tab=feeds" onClick={onClose}>All form paths</Button>}
      </Box>
    </Box>
  );
}

export function FormPathDialog({ form, label, open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="form-path-title"
      PaperProps={{ sx: { m: { xs: 1, sm: 4 }, width: { xs: 'calc(100% - 16px)', sm: undefined } } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 3, py: 2, borderBottom: 1, borderColor: 'divider' }}>
        <LinkGlyph size={20} color={GREEN} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id="form-path-title" component="h2" sx={{ fontWeight: 600, fontSize: '1rem' }}>Data path · {label}</Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Read-only links to this form's records</Typography>
        </Box>
        <IconButton aria-label="Close" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </IconButton>
      </Box>
      <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5 }}>
        {open && <FormPathPanel form={form} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/** The "Path" button for a form's page header. Managers and up only. */
export default function FormPathButton({ form, label, sx }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!['ceo', 'farm_manager', 'operation_manager'].includes(user?.role)) return null;
  return (
    <>
      <Button variant="outlined" size="small" startIcon={<LinkGlyph />} onClick={() => setOpen(true)}
        sx={{ flexShrink: 0, borderColor: alpha(GREEN, 0.6), color: GREEN, ...sx }}>
        Path
      </Button>
      <FormPathDialog form={form} label={label} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
