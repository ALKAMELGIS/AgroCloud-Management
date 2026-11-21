import { useMemo, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, ButtonBase, Skeleton, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { getShellSections } from '../config/navAreas';
import { AREA_STYLE, ModuleIcon } from '../config/moduleIcons';
import { apiRequest } from '../utils/api';
import { useShellLabel } from '../i18n/shellLabels';
import { displayDay } from '../utils/displayDate';
import { meter, isStale, DEFAULT_BANDS } from './dashboard/FarmMonitor';

/*
 * Home (Option C): the day first, then every place the user can go, grouped the
 * same way as the sidebar. One neutral surface, one accent, generous spacing.
 */

const HAIR = '1px solid rgba(22,40,30,0.07)';
const CARD = { bgcolor: 'background.paper', border: HAIR, borderRadius: '18px' };
const MONO = '"IBM Plex Mono", monospace';
const ALERT = {
  phi: { color: '#b45309', path: 'M6 3h12M6 21h12M7 3v2.5a5 5 0 0 0 10 0V3M7 21v-2.5a5 5 0 0 1 10 0V21' },
  pest: { color: '#b42318', path: 'M9 9.5h6v5.5a3 3 0 0 1-6 0zM10 9.5V8a2 2 0 0 1 4 0v1.5M4 13h5M15 13h5M5.5 8l3.5 2.5M18.5 8L15 10.5' },
  spray: { color: '#1d5fa8', path: 'M6 11h7v10H6zM8 11V8h3v3M11 8h3.5l1.5-2M18 4.5h.01M20 7h.01M18 9.5h.01' },
  ecph: { color: '#0f766e', path: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3' },
};

function Glyph({ k }) {
  return (
    <Box sx={{ width: 34, height: 34, borderRadius: '10px', bgcolor: ALERT[k].color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ALERT[k].path} /></svg>
    </Box>
  );
}

const SETUP_ON_HOME = new Set(['/settings', '/yield-predictions', '/internship', '/internship/grades']);

const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString('en-US') : '–');

function Home() {
  const navigate = useNavigate();
  const L = useShellLabel();
  const { user } = useAuth();
  const role = user?.role;
  const { activeSiteId, activeSite } = useActiveSite();
  const [overview, setOverview] = useState(null);
  const [thresholds, setThresholds] = useState({});
  useEffect(() => {
    let alive = true;
    apiRequest('/agronomic/thresholds').then((list) => {
      const m = {};
      (Array.isArray(list) ? list : []).forEach((t) => { (m[t.cropId] = m[t.cropId] || {})[t.parameter] = t; });
      if (alive) setThresholds(m);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (role === 'intern_student' || role === 'intern_teacher') navigate('/internship', { replace: true });
  }, [role, navigate]);

  useEffect(() => {
    let alive = true;
    setOverview(null);
    apiRequest(`/ipm/field-overview${activeSiteId ? `?site_id=${encodeURIComponent(activeSiteId)}` : ''}`)
      .then((d) => { if (alive) setOverview(Array.isArray(d) ? d : []); })
      .catch(() => { if (alive) setOverview([]); });
    return () => { alive = false; };
  }, [activeSiteId]);

  // What needs a decision today, from the same data as the dashboard and the daily brief.
  const attention = useMemo(() => {
    if (!overview) return null;
    const phi = overview.filter((f) => f.active_phi_count > 0);
    const pest = overview.filter((f) => f.latest_scouting?.id && f.latest_scouting?.status !== 'resolved');
    const spray = overview.filter((f) => f.spray_today);
    // Same rule as Farm Monitor and the field map: a reading outside its band is "Out".
    const high = overview.filter((f) => {
      const stale = isStale(f.latest_ecph?.date);
      const th = thresholds[f.current_crop_id] || {};
      return meter(f.latest_ecph?.ec_out, th.ec_out || th.ec, DEFAULT_BANDS.ec, stale).status === 'out' || meter(f.latest_ecph?.ph_out, th.ph_out || th.ph, DEFAULT_BANDS.ph, stale).status === 'out';
    });
    const rows = [];
    if (phi.length) rows.push({ k: 'phi', title: `Hold harvest · ${phi.map((f) => f.name).slice(0, 2).join(', ')}`, detail: 'Pre-harvest interval still running', value: phi.length, path: '/ipm/pesticide-applications' });
    if (pest.length) rows.push({ k: 'pest', title: `${pest[0].latest_scouting.pest || 'Pest'} · ${pest.map((f) => f.name).slice(0, 2).join(', ')}`, detail: pest[0].latest_scouting.pct ? `${pest[0].latest_scouting.pct}% of plants` : 'Open scouting report', value: pest.length, path: '/ipm/scouting-reports' });
    if (spray.length) rows.push({ k: 'spray', title: `Sprayed today · ${spray.map((f) => f.name).slice(0, 2).join(', ')}`, detail: spray[0].spray_today?.product ? `${spray[0].spray_today.product} · re-entry caution` : 'Re-entry caution', value: spray.length, path: '/ipm/spray-calendar' });
    if (high.length) rows.push({ k: 'ecph', title: `EC / pH out of range · ${high.length} fields`, detail: `Of ${overview.length} fields with readings`, value: high.length, path: '/dashboard' });
    return rows;
  }, [overview, thresholds]);

  const totals = useMemo(() => {
    if (!overview) return null;
    const sum = (k) => overview.reduce((a, f) => a + (Number(f[k]) || 0), 0);
    return [
      { label: 'Fields', value: fmt(overview.length), unit: '' },
      { label: 'Harvest this week', value: fmt(Math.round(sum('harvest_this_week'))), unit: 'kg' },
      { label: 'Water this week', value: fmt(Math.round(sum('water_this_week'))), unit: 'm³' },
      { label: 'Needs attention', value: fmt((attention || []).reduce((a, r) => a + r.value, 0)), unit: 'items' },
    ];
  }, [overview, attention]);

  const groups = useMemo(() => getShellSections(user)
    .map((g) => ({ ...g, items: g.items.filter((it) => it.path !== '/' && it.path !== '/summary') }))
    // Setup: one Settings tile opens the hub with every admin screen; keep only what the hub does not hold.
    .map((g) => (g.label === 'Setup' && g.items.some((it) => it.path === '/settings')
      ? { ...g, items: g.items.filter((it) => SETUP_ON_HOME.has(it.path)) } : g))
    .filter((g) => g.items.length), [user]);
  const [area, setArea] = useState(() => { try { return localStorage.getItem('agro_home_area') || 'All'; } catch { return 'All'; } });
  const pickArea = (a) => { setArea(a); try { localStorage.setItem('agro_home_area', a); } catch { /* private mode */ } };
  const curArea = groups.some((g) => g.label === area) ? area : 'All';
  const shownGroups = curArea === 'All' ? groups : groups.filter((g) => g.label === curArea);

  const today = displayDay();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 1280 }}>
      <Box>
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{today}</Typography>
        <Typography component="h1" sx={{ mt: 1.5, fontSize: { xs: 24, md: 28 }, fontWeight: 600, letterSpacing: '-0.02em' }}>
          {activeSite?.name ? `${activeSite.name} today` : L('Home')}
        </Typography>
      </Box>

      {/* Key figures: one strip, hairline dividers */}
      <Box component="section" aria-label="Key figures" sx={{ ...CARD, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0,1fr))', md: 'repeat(4, minmax(0,1fr))' } }}>
        {(totals || [0, 1, 2, 3]).map((t, i) => (
          <Box key={t.label || i} sx={{ px: { xs: 4, md: 7 }, py: { xs: 4, md: 6 }, borderLeft: { md: i ? HAIR : 0 }, borderTop: { xs: i > 1 ? HAIR : 0, md: 0 }, borderRight: { xs: i % 2 === 0 ? HAIR : 0, md: 0 } }}>
            {totals ? (
              <>
                <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>{t.label}</Typography>
                <Box sx={{ mt: 2.5, display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
                  <Typography component="span" sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 500, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{t.value}</Typography>
                  <Typography component="span" sx={{ fontSize: 13, color: 'text.secondary' }}>{t.unit}</Typography>
                </Box>
              </>
            ) : <Skeleton width="70%" height={56} />}
          </Box>
        ))}
      </Box>

      {/* Needs attention */}
      <Box component="section" aria-label="Needs attention" sx={{ ...CARD, p: { xs: 4, md: 6 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600, flex: 1 }}>Needs attention</Typography>
          <ButtonBase onClick={() => navigate('/daily-brief')} sx={{ fontSize: 13, fontWeight: 600, color: 'primary.main', borderRadius: 1, px: 1.5, py: 1 }}>Daily brief</ButtonBase>
        </Box>
        {!attention ? (
          [0, 1, 2].map((i) => <Skeleton key={i} height={56} />)
        ) : attention.length === 0 ? (
          <Typography sx={{ fontSize: 13.5, color: 'text.secondary', py: 2 }}>Nothing needs a decision today.</Typography>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 6 }}>
            {attention.map((r) => (
              <ButtonBase key={r.k} onClick={() => navigate(r.path)}
                sx={{ display: 'flex', alignItems: 'center', gap: 3.5, px: 2.5, py: 3.5, mx: -2.5, borderRadius: '12px', textAlign: 'start', justifyContent: 'flex-start', '&:hover': { bgcolor: 'rgba(22,40,30,0.035)' } }}>
                <Glyph k={r.k} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600 }}>{r.title}</Typography>
                  <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>{r.detail}</Typography>
                </Box>
                <Typography sx={{ font: `500 13px ${MONO}`, color: 'text.secondary' }}>{r.value}</Typography>
              </ButtonBase>
            ))}
          </Box>
        )}
      </Box>

      {/* Area tabs, then each area's screens as icon tiles */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Box role="tablist" aria-label="Areas"
          sx={{ display: 'flex', gap: 1, p: 1, borderRadius: '12px', bgcolor: 'rgba(22,40,30,0.05)', alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
          {[{ label: 'All' }, ...groups].map((g) => {
            const on = curArea === g.label;
            const st = AREA_STYLE[g.label];
            return (
              <ButtonBase key={g.label} role="tab" aria-selected={on} onClick={() => pickArea(g.label)}
                sx={{ flexShrink: 0, height: 36, px: 4, gap: 2, borderRadius: '9px', fontSize: 13, fontWeight: on ? 600 : 500, color: on ? 'text.primary' : 'text.secondary', bgcolor: on ? 'background.paper' : 'transparent', boxShadow: on ? '0 1px 2px rgba(22,40,30,0.12)' : 'none', '&:hover': { color: 'text.primary' }, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 } }}>
                {st ? <Box component="span" sx={{ width: 8, height: 8, borderRadius: '3px', bgcolor: st.color }} /> : null}
                {L(g.label)}
              </ButtonBase>
            );
          })}
        </Box>

        {shownGroups.map((g) => {
          const st = AREA_STYLE[g.label] || AREA_STYLE.Setup;
          return (
            <Box component="section" key={g.label} aria-label={g.label} sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: '9px', display: 'grid', placeItems: 'center', color: st.color, bgcolor: `${st.color}14`, flexShrink: 0 }}>
                  <ModuleIcon d={st.icon} size={18} />
                </Box>
                <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600 }}>{L(g.label)}</Typography>
                <Typography component="span" sx={{ font: `500 12px ${MONO}`, color: 'text.disabled', ml: 'auto' }}>{g.items.length}</Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 3 }}>
                {g.items.map((it) => (
                  <ButtonBase key={it.path} onClick={() => navigate(it.path)}
                    sx={{ ...CARD, borderRadius: '14px', minHeight: 116, p: 4, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', gap: 3, textAlign: 'start', transition: 'transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease',
                      '&:hover': { transform: 'translateY(-2px)', borderColor: 'rgba(22,40,30,0.14)', boxShadow: '0 8px 20px -12px rgba(22,40,30,0.30)' },
                      '&.Mui-focusVisible': { outline: '2px solid', outlineColor: st.color, outlineOffset: 2 },
                      '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } } }}>
                    <Box sx={{ width: 44, height: 44, borderRadius: '12px', display: 'grid', placeItems: 'center', color: st.color, background: `linear-gradient(160deg, ${st.color}1f, ${st.color}0d)`, boxShadow: `inset 0 0 0 1px ${st.color}2b` }}>
                      <ModuleIcon path={it.path} size={22} />
                    </Box>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{L(it.text)}</Typography>
                  </ButtonBase>
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export default Home;
