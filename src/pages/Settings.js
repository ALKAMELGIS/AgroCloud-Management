import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { Box, ButtonBase, Button, MenuItem, Skeleton, TextField, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useNotification } from '../contexts/NotificationContext';
import { getShellSections } from '../config/navAreas';
import { ModuleIcon, ICON_PATHS } from '../config/moduleIcons';
import { apiRequest } from '../utils/api';
import { setOrgPrefs } from '../utils/orgPrefs';
import { useShellLabel } from '../i18n/shellLabels';

/*
 * Settings hub: one menu for everything an admin configures. Each entry opens
 * the existing screen inside the right pane; General and Master data are hubs
 * of their own. An entry shows only when the user may open its screen.
 */

const pages = {
  organization: lazy(() => import('./admin/OrganizationSettings')),
  sites: lazy(() => import('./CountriesSitesManagement')),
  seasons: lazy(() => import('./SeasonsManagement')),
  'farm-areas': lazy(() => import('./FarmAreasCropsManagement')),
  'field-types': lazy(() => import('./FieldTypesNamesManagement')),
  products: lazy(() => import('./ipm/ProductCatalog')),
  pests: lazy(() => import('./ipm/PestCatalog')),
  recipes: lazy(() => import('./RecipesManagement')),
  valves: lazy(() => import('./ValvesConfiguration')),
  thresholds: lazy(() => import('./AgronomicReference')),
  inventory: lazy(() => import('./Inventory')),
  users: lazy(() => import('./admin/UserManagement')),
  'field-staff': lazy(() => import('./ipm/FieldStaffManagement')),
  enrollment: lazy(() => import('./admin/Enrollment')),
  integrations: lazy(() => import('./admin/ApiIntegrations')),
  'api-keys': lazy(() => import('./admin/ApiKeys')),
  webhooks: lazy(() => import('./admin/Webhooks')),
  'john-deere': lazy(() => import('./admin/JohnDeereIntegration')),
  audit: lazy(() => import('./admin/AuditLog')),
  backup: lazy(() => import('./admin/DataBackup')),
  import: lazy(() => import('./admin/HistoricalImport')),
  recovery: lazy(() => import('./admin/Recovery')),
  health: lazy(() => import('./admin/SystemHealth')),
  flags: lazy(() => import('./admin/FeatureFlags')),
  platform: lazy(() => import('./admin/PlatformAdmin')),
};

// key, label, the route that decides who may see it, short help
const MASTER = [
  ['farm-areas', 'Farm areas & crops', '/manage/farm-areas', 'Zones, fields and the crop on each', 'Harvest, fertigation, reports'],
  ['field-types', 'Field types & names', '/manage/field-types', 'Nethouse, greenhouse, open field and naming', 'GIS map, sites'],
  ['products', 'Product catalog', '/ipm/product-catalog', 'Pesticides with active ingredient, PHI and REI', 'Pesticide applications, PHI log'],
  ['pests', 'Pest catalog', '/ipm/pest-catalog', 'Pests and diseases with thresholds', 'Scouting reports, spray calendar'],
  ['recipes', 'Recipes', '/manage/recipes', 'Fertigation recipes per crop and stage', 'Fertigation entry'],
  ['valves', 'Valves', '/manage/valves', 'Valves and the fields they water', 'Irrigation entry, pump room'],
  ['thresholds', 'Agronomic reference', '/agronomic-reference', 'EC and pH bands per crop', 'Farm monitor, alerts, assistant'],
  ['inventory', 'Inventory', '/inventory', 'Products and fertilizer in stock', 'Applications, fertigation'],
];

const MENU = [
  { group: 'Workspace', items: [
    { key: 'general', label: 'General', icon: ICON_PATHS.general, route: '/admin/organization', native: true },
    { key: 'organization', label: 'Organization', icon: ICON_PATHS.org, route: '/admin/organization' },
    { key: 'sites', label: 'Zones & sites', icon: ICON_PATHS.sites, route: '/manage/countries' },
    { key: 'seasons', label: 'Seasons', icon: ICON_PATHS.seasons, route: '/manage/seasons' },
  ] },
  { group: 'Data', items: [
    { key: 'master', label: 'Master data', icon: ICON_PATHS.master, native: true, children: MASTER.map((m) => m[0]) },
    { key: 'import', label: 'Import from Excel', icon: ICON_PATHS.import, route: '/admin/import' },
    { key: 'backup', label: 'Data backup', icon: ICON_PATHS.backup, route: '/admin/backup' },
    { key: 'recovery', label: 'Recovery', icon: ICON_PATHS.recovery, route: '/admin/recovery' },
  ] },
  { group: 'People', items: [
    { key: 'users', label: 'Users & roles', icon: ICON_PATHS.users, route: '/admin/users' },
    { key: 'field-staff', label: 'Field staff', icon: ICON_PATHS.staff, route: '/ipm/field-staff' },
    { key: 'enrollment', label: 'Enrollment', icon: ICON_PATHS.enroll, route: '/admin/enrollment' },
  ] },
  { group: 'Integrations', items: [
    { key: 'integrations', label: 'GIS, satellite & weather', icon: ICON_PATHS.gis, route: '/admin/api-integrations' },
    { key: 'api-keys', label: 'AI & API keys', icon: ICON_PATHS.key, route: '/admin/api-keys' },
    { key: 'webhooks', label: 'Webhooks', icon: ICON_PATHS.webhook, route: '/admin/webhooks' },
    { key: 'john-deere', label: 'John Deere', icon: ICON_PATHS.deere, route: '/admin/integrations/john-deere' },
  ] },
  { group: 'System', items: [
    { key: 'audit', label: 'Audit log', icon: ICON_PATHS.audit, route: '/admin/audit' },
    { key: 'health', label: 'System health', icon: ICON_PATHS.health, route: '/admin/health' },
    { key: 'flags', label: 'Feature flags', icon: ICON_PATHS.flag, route: '/admin/feature-flags' },
    { key: 'platform', label: 'Platform admin', icon: ICON_PATHS.platform, route: '/admin/platform' },
  ] },
];

const HAIR = '1px solid rgba(22,40,30,0.07)';
const CARD = { bgcolor: 'background.paper', border: HAIR, borderRadius: '16px' };

const LANGS = [['en', 'English'], ['ar', 'العربية']];
const ZONES = ['Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Muscat', 'Asia/Kuwait', 'Asia/Bahrain', 'Africa/Cairo', 'Europe/London', 'UTC'];
const CURRENCIES = ['AED', 'SAR', 'QAR', 'OMR', 'KWD', 'BHD', 'EGP', 'USD', 'EUR'];
const WEEK = [['saturday', 'Saturday'], ['sunday', 'Sunday'], ['monday', 'Monday']];
const AREA_UNITS = [['m2', 'm² and hectare'], ['dunam', 'Dunam'], ['acre', 'Acre']];
const YIELD_UNITS = [['kg', 'kg'], ['t', 'Tonne']];
const WATER_UNITS = [['m3', 'm³ and litre'], ['gal', 'Gallon']];

function Row({ label, help, children }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 3, px: 5, py: 4, '& + &': { borderTop: '1px solid rgba(22,40,30,0.05)' } }}>
      <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{label}</Typography>
        {help ? <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>{help}</Typography> : null}
      </Box>
      <Box sx={{ flex: '0 1 320px', minWidth: 200 }}>{children}</Box>
    </Box>
  );
}

function Card({ title, desc, children }) {
  return (
    <Box component="section" sx={{ ...CARD, overflow: 'hidden' }}>
      <Box sx={{ px: 5, py: 4, borderBottom: HAIR }}>
        <Typography component="h2" sx={{ fontSize: 14, fontWeight: 600 }}>{title}</Typography>
        {desc ? <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.5 }}>{desc}</Typography> : null}
      </Box>
      {children}
    </Box>
  );
}

function Pick({ value, onChange, options, disabled, label }) {
  return (
    <TextField select fullWidth size="small" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}
      slotProps={{ htmlInput: { 'aria-label': label } }}>
      {options.map((o) => {
        const [v, t] = Array.isArray(o) ? o : [o, o];
        return <MenuItem key={v} value={v}>{t}</MenuItem>;
      })}
    </TextField>
  );
}

function PaneHead({ group, title, desc, actions }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 3 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{group}</Typography>
        <Typography component="h1" sx={{ mt: 1, fontSize: { xs: 22, md: 24 }, fontWeight: 600, letterSpacing: '-0.02em' }}>{title}</Typography>
        {desc ? <Typography sx={{ mt: 1.5, fontSize: 13.5, color: 'text.secondary', maxWidth: 640, lineHeight: 1.5 }}>{desc}</Typography> : null}
      </Box>
      {actions}
    </Box>
  );
}

function GeneralPane() {
  const { user } = useAuth();
  const { allSites, setActiveSiteId } = useActiveSite();
  const notify = useNotification();
  const canEdit = user?.role === 'ceo';
  const [name, setName] = useState('');
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    apiRequest('/organization').then((org) => {
      if (!alive) return;
      const base = { language: 'en', timezone: 'Asia/Dubai', default_currency: 'AED', week_start: 'saturday', units: { area: 'm2', yield: 'kg', water: 'm3' }, report_footer: '', default_site: '', ...(org?.settings || {}) };
      base.units = { area: 'm2', yield: 'kg', water: 'm3', ...(org?.settings?.units || {}) };
      setName(org?.name || '');
      setS(base);
      setSaved(JSON.stringify([org?.name || '', base]));
    }).catch(() => { if (alive) setS({ language: 'en', timezone: 'Asia/Dubai', default_currency: 'AED', week_start: 'saturday', units: { area: 'm2', yield: 'kg', water: 'm3' }, report_footer: '', default_site: '' }); });
    return () => { alive = false; };
  }, []);

  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const setUnit = (k, v) => setS((x) => ({ ...x, units: { ...x.units, [k]: v } }));
  const dirty = s && saved !== JSON.stringify([name, s]);

  const save = async () => {
    setBusy(true);
    try {
      const body = { ...s };
      delete body.logo_url;
      delete body.logo_storage_key;
      await apiRequest('/organization', { method: 'PUT', body: JSON.stringify({ name: name.trim(), settings: body }) });
      if (s.default_site) setActiveSiteId(s.default_site);
      setSaved(JSON.stringify([name, s]));
      setOrgPrefs(body);
      notify.success('Settings saved');
    } catch (e) {
      notify.error(e.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const actions = (
    <Box sx={{ display: 'flex', gap: 2 }}>
      <Button variant="outlined" disabled={!dirty || busy} onClick={() => { const [n, v] = JSON.parse(saved); setName(n); setS(v); }}>Discard</Button>
      <Button variant="contained" disableElevation disabled={!canEdit || !dirty || busy} onClick={save}>Save changes</Button>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <PaneHead group="Workspace" title="General" desc="Defaults that every screen, report and export of this organization uses" actions={actions} />
      {!canEdit ? <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>Only the CEO can change these settings</Typography> : null}
      {!s ? <Skeleton variant="rounded" height={360} sx={{ borderRadius: '16px' }} /> : (
        <>
          <Card title="Organization" desc="Printed in report headers and emails">
            <Row label="Organization name" help="Shown on the login page and PDF reports">
              <TextField fullWidth size="small" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} slotProps={{ htmlInput: { 'aria-label': 'Organization name' } }} />
            </Row>
            <Row label="Default site" help="Opens first after sign-in">
              <Pick label="Default site" value={s.default_site} onChange={(v) => set('default_site', v)} disabled={!canEdit}
                options={[['', 'Last used'], ...(allSites || []).map((x) => [x.id, x.name])]} />
            </Row>
            <Row label="Report footer" help="One line under every PDF page">
              <TextField fullWidth size="small" value={s.report_footer || ''} onChange={(e) => set('report_footer', e.target.value)} disabled={!canEdit} placeholder="Confidential, for internal use" slotProps={{ htmlInput: { 'aria-label': 'Report footer', maxLength: 120 } }} />
            </Row>
          </Card>
          <Card title="Region and language" desc="How dates, money and text appear">
            <Row label="Language" help="Default for everyone until a person picks their own"><Pick label="Language" value={s.language} onChange={(v) => set('language', v)} options={LANGS} disabled={!canEdit} /></Row>
            <Row label="Time zone" help="Used for entries, reminders and the day boundary"><Pick label="Time zone" value={s.timezone} onChange={(v) => set('timezone', v)} options={ZONES.includes(s.timezone) ? ZONES : [s.timezone, ...ZONES]} disabled={!canEdit} /></Row>
            <Row label="Currency" help="Labour cost, inventory and reports"><Pick label="Currency" value={s.default_currency} onChange={(v) => set('default_currency', v)} options={CURRENCIES.includes(s.default_currency) ? CURRENCIES : [s.default_currency, ...CURRENCIES]} disabled={!canEdit} /></Row>
            <Row label="First day of week" help="This week on the dashboard and in entry history"><Pick label="First day of week" value={s.week_start} onChange={(v) => set('week_start', v)} options={WEEK} disabled={!canEdit} /></Row>
          </Card>
          <Card title="Units" desc="Stored in metric, shown in the unit chosen here">
            <Row label="Area" help="Fields, zones and structures"><Pick label="Area unit" value={s.units.area} onChange={(v) => setUnit('area', v)} options={AREA_UNITS} disabled={!canEdit} /></Row>
            <Row label="Yield" help="Home, field map and field panel; entry stays in kg"><Pick label="Yield unit" value={s.units.yield} onChange={(v) => setUnit('yield', v)} options={YIELD_UNITS} disabled={!canEdit} /></Row>
            <Row label="Water" help="Home, field map and field panel; entry stays in m³"><Pick label="Water unit" value={s.units.water} onChange={(v) => setUnit('water', v)} options={WATER_UNITS} disabled={!canEdit} /></Row>
          </Card>
        </>
      )}
    </Box>
  );
}

function MasterPane({ lists, onOpen }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <PaneHead group="Data" title="Master data" desc="The lists every form picks from. One list, one owner, used across Record, Crop protection, Reports and the assistant" />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 3 }}>
        {lists.map(([key, label, route, desc, used]) => (
          <ButtonBase key={key} onClick={() => onOpen(key)}
            sx={{ ...CARD, borderRadius: '14px', p: 4, display: 'flex', alignItems: 'flex-start', gap: 3, textAlign: 'start', justifyContent: 'flex-start',
              transition: 'border-color 150ms ease, box-shadow 150ms ease', '&:hover': { borderColor: 'rgba(22,40,30,0.14)', boxShadow: '0 8px 20px -12px rgba(22,40,30,0.3)' },
              '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}>
            <Box sx={{ width: 40, height: 40, borderRadius: '11px', display: 'grid', placeItems: 'center', color: 'primary.dark', bgcolor: 'rgba(22,67,46,0.07)', flexShrink: 0 }}>
              <ModuleIcon path={route} size={20} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{label}</Typography>
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.5, lineHeight: 1.45 }}>{desc}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.disabled', mt: 2 }}>Used by {used}</Typography>
            </Box>
          </ButtonBase>
        ))}
      </Box>
    </Box>
  );
}

export default function Settings() {
  const { section } = useParams();
  const navigate = useNavigate();
  const L = useShellLabel();
  const { user } = useAuth();

  const allowed = useMemo(() => {
    const set = new Set();
    getShellSections(user).forEach((g) => g.items.forEach((it) => set.add(it.path)));
    return set;
  }, [user]);

  const lists = useMemo(() => MASTER.filter((m) => allowed.has(m[2])), [allowed]);
  const menu = useMemo(() => MENU.map((g) => ({
    ...g,
    items: g.items.filter((it) => (it.key === 'master' ? lists.length > 0 : allowed.has(it.route))),
  })).filter((g) => g.items.length), [allowed, lists]);

  const flat = menu.flatMap((g) => g.items);
  const first = flat[0]?.key;
  const key = section || first;
  const listKeys = lists.map((m) => m[0]);
  const isList = listKeys.includes(key);
  const known = isList || flat.some((it) => it.key === key);

  if (!first) return <Navigate to="/" replace />;
  if (!known) return <Navigate to={`/settings/${first}`} replace />;

  const activeMenu = isList ? 'master' : key;
  const open = (k) => navigate(`/settings/${k}`);
  const Page = pages[key];
  const listMeta = isList ? lists.find((m) => m[0] === key) : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'flex-start', gap: { xs: 4, md: 8 }, maxWidth: 1440 }}>
      {/* Menu: a list on desktop, a picker on phones */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, width: '100%' }}>
        <TextField select fullWidth size="small" value={activeMenu} onChange={(e) => open(e.target.value)} slotProps={{ htmlInput: { 'aria-label': 'Settings section' } }}>
          {menu.flatMap((g) => [
            <MenuItem key={`h-${g.group}`} disabled sx={{ fontSize: 12, opacity: '1 !important', color: 'text.disabled' }}>{L(g.group)}</MenuItem>,
            ...g.items.map((it) => <MenuItem key={it.key} value={it.key}>{L(it.label)}</MenuItem>),
          ])}
        </TextField>
      </Box>
      <Box component="nav" aria-label="Settings"
        sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', gap: 6, width: 248, flexShrink: 0, position: 'sticky', top: 16 }}>
        <Typography component="p" sx={{ px: 3, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{L('Settings')}</Typography>
        {menu.map((g) => (
          <Box key={g.group} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography sx={{ px: 3, pb: 2, fontSize: 12, color: 'text.disabled' }}>{L(g.group)}</Typography>
            {g.items.map((it) => {
              const on = activeMenu === it.key;
              return (
                <ButtonBase key={it.key} onClick={() => open(it.key)} aria-current={on ? 'page' : undefined}
                  sx={{ height: 36, px: 3, gap: 3, borderRadius: '8px', justifyContent: 'flex-start', fontSize: 13, fontWeight: on ? 600 : 500,
                    color: on ? 'text.primary' : 'text.secondary', bgcolor: on ? 'background.paper' : 'transparent',
                    boxShadow: on ? '0 1px 2px rgba(22,40,30,0.08), 0 0 0 1px rgba(22,40,30,0.06)' : 'none',
                    '&:hover': { color: 'text.primary', bgcolor: on ? 'background.paper' : 'rgba(22,40,30,0.045)' },
                    '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 } }}>
                  <Box component="span" sx={{ display: 'inline-flex', color: on ? 'primary.main' : 'inherit' }}><ModuleIcon d={it.icon} size={17} /></Box>
                  <Box component="span" sx={{ flex: 1, minWidth: 0, textAlign: 'start', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{L(it.label)}</Box>
                </ButtonBase>
              );
            })}
          </Box>
        ))}
      </Box>

      <Box component="main" sx={{ flex: 1, minWidth: 0, width: '100%' }}>
        {listMeta ? (
          <ButtonBase onClick={() => open('master')} sx={{ mb: 4, height: 32, px: 2, ml: -2, gap: 1.5, borderRadius: '8px', fontSize: 13, color: 'text.secondary', '&:hover': { color: 'text.primary', bgcolor: 'rgba(22,40,30,0.045)' } }}>
            <ModuleIcon d="M15 6l-6 6 6 6" size={16} />Master data
          </ButtonBase>
        ) : null}
        {key === 'general' ? <GeneralPane /> : key === 'master' ? <MasterPane lists={lists} onOpen={open} /> : (
          <Suspense fallback={<Skeleton variant="rounded" height={420} sx={{ borderRadius: '16px' }} />}>
            {Page ? <Page /> : null}
          </Suspense>
        )}
      </Box>
    </Box>
  );
}
