/*
 * One icon per screen, drawn for what the screen does (24 px grid, 1.6 stroke,
 * no fill). Each area has one colour; a screen's tile takes its area's colour.
 */

export const AREA_STYLE = {
  Overview: { color: '#16432e', icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
  Monitor: { color: '#0f766e', icon: 'M3 12h4l3-8 4 16 3-8h4' },
  Record: { color: '#1d5fa8', icon: 'M5 3h10l4 4v14H5zM15 3v4h4M8 12h8M8 16h5' },
  'Crop protection': { color: '#b4501f', icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4' },
  Reports: { color: '#6a46b8', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  Team: { color: '#8a6d1d', icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 1 0 0-6M22 21c0-3-2-5-5-5' },
  Setup: { color: '#4b5650', icon: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M16 4v4M10 10v4M18 16v4' },
};

const P = {
  home: AREA_STYLE.Overview.icon,
  summary: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6',
  brief: 'M12 4a8 8 0 1 0 8 8M12 4v8h8M15 3.5A8 8 0 0 1 20.5 9',
  dashboard: 'M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z',
  assistant: 'M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z',
  notify: 'M6 9a6 6 0 0 1 12 0c0 6 2 8 2 8H4s2-2 2-8M10 20a2 2 0 0 0 4 0',
  harvest: 'M3 10h18l-2 10H5zM7 10l3-6M17 10l-3-6M9 14v3M15 14v3',
  fert: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11zM12 11v6M9 14h6',
  irrig: 'M3 7h18M7 7v3M12 7v3M17 7v3M7 14c0 1.5-1 2.5-1 3.5a1 1 0 0 0 2 0c0-1-1-2-1-3.5zM12 14c0 1.5-1 2.5-1 3.5a1 1 0 0 0 2 0c0-1-1-2-1-3.5zM17 14c0 1.5-1 2.5-1 3.5a1 1 0 0 0 2 0c0-1-1-2-1-3.5z',
  eff: 'M4 18a8 8 0 1 1 16 0M12 18l4-6M8 18h8',
  ratio: 'M12 4v16M5 8h14M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0zM8 20h8',
  weather: 'M8 17h9a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 8 17zM9 21l1-2M13 21l1-2',
  wmap: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  rs: 'M7 4l4 4-3 3-4-4zM13 10l4 4-3 3-4-4zM10 7l4 4M16 17l3 3M17 6a4 4 0 0 1 1 4',
  gps: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  gis: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  tmpl: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM15 16h4M17 14v4',
  ecph: 'M9 3h6M10 3v6L5 18a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 14h9',
  tank: 'M6 6c0-1.5 2.7-3 6-3s6 1.5 6 3v12c0 1.5-2.7 3-6 3s-6-1.5-6-3zM6 6c0 1.5 2.7 3 6 3s6-1.5 6-3M6 12c0 1.5 2.7 3 6 3s6-1.5 6-3',
  valve: 'M2 12h6M16 12h6M8 8l8 8M8 16l8-8M12 4v4M9 4h6',
  hentry: 'M3 11h14l-1.5 9h-11zM7 11l2.5-5M13 11l-2.5-5M17 15l4-4-2-2-4 4v2z',
  rotate: 'M20 12a8 8 0 1 1-3-6.3M20 4v5h-5M12 8c-2 0-3 1.5-3 3.5S11 15 12 16c1-1 3-2.5 3-4.5S14 8 12 8z',
  pump: 'M4 20h16M6 20v-6h8v6M10 14V8h4M14 10h4v4M12 4v4',
  recipe: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h3',
  inventory: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
  import: 'M12 15V3M8 7l4-4 4 4M4 15v5h16v-5',
  recovery: 'M4 12a8 8 0 1 0 3-6.3M4 4v5h5M12 8v4l3 2',
  spray: 'M8 8h7v12H8zM11 8V5h3M14 5h2M18 4l2-1M18 6h3M18 8l2 1',
  bio: 'M12 7a6 6 0 0 1 6 6v2a6 6 0 0 1-12 0v-2a6 6 0 0 1 6-6zM12 7v14M9 4l1.5 3M15 4l-1.5 3',
  bee: 'M12 8a4 5 0 1 1 0 10 4 5 0 0 1 0-10zM8 12h8M8 15h8M12 8V5M9 9C6 7 3 8 4 10s4 1 5 0M15 9c3-2 6-1 5 1s-4 1-5 0',
  bottle: 'M10 3h4v3l2 3v11H8V9l2-3zM8 13h8',
  scout: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-6-6M8 9a2 2 0 1 1 4 0v2a2 2 0 1 1-4 0z',
  pestcat: 'M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h12M12 7a2 2 0 0 1 2 2v2a2 2 0 0 1-4 0V9a2 2 0 0 1 2-2z',
  scal: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M12 12c0 1.5-1.5 2.7-1.5 4a1.5 1.5 0 0 0 3 0c0-1.3-1.5-2.5-1.5-4z',
  staff: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21c0-4 3-6 7-6s7 2 7 6M9 15l3 3 3-3',
  batch: 'M4 6v12M7 6v12M10 6v12M14 6v12M16 6v12M20 6v12',
  phi: 'M7 3h10M7 21h10M8 3c0 5 8 6 8 9s-8 4-8 9M16 3c0 5-8 6-8 9',
  change: 'M4 7h12l-3-3M20 17H8l3 3',
  rep: 'M6 3h9l4 4v14H6zM9 17v-3M12 17v-6M15 17v-4',
  builder: 'M4 4h16v6H4zM4 14h7v6H4zM14 14h6v6h-6z',
  tasks: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  shift: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  manpower: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M16 4h5M16 8h5M18 12h3',
  sheet: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M9 14l2 2 4-4',
  cost: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15 9c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.8 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v1.5M12 16.5V18',
  sites: 'M3 21h18M5 21V8l7-5 7 5v13M10 21v-6h4v6',
  areas: 'M12 21V9M12 9c0-3 2.5-6 7-6 0 4.5-3 7-7 6zM12 13c0-2.5-2-4.5-6-4.5 0 3.5 2 5 6 4.5',
  types: 'M3 21h18M5 21V10l7-6 7 6v11M9 21v-5h6v5',
  seasons: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M8 13h3M8 16h6',
  yield: 'M4 20h16M6 16l4-5 3 3 5-7M15 7h3v3',
  agro: 'M4 18h16M6 18V9M12 18V5M18 18v-6M3 12h18',
  api: 'M8 6l-5 6 5 6M16 6l5 6-5 6M14 4l-4 16',
  deere: 'M3 17h4l2-6h6l2 6h4M7 17a2 2 0 1 0 4 0M15 17a3 3 0 1 0 6 0M9 11V7h5',
  school: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6',
  grade: 'M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2 8 12.7 4 8.8 9.5 8z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M19 8v6M16 11h6',
  audit: 'M9 4h6M10 4v3M5 7h14v14H5zM9 12h6M9 16h4',
  backup: 'M4 7c0-2 3.6-3 8-3s8 1 8 3v10c0 2-3.6 3-8 3s-8-1-8-3zM4 7c0 2 3.6 3 8 3s8-1 8-3M12 13v5M10 16l2 2 2-2',
  health: 'M3 12h4l2-4 3 8 2-4h7',
  key: 'M15 9a4 4 0 1 1-3.5 6L4 22l-2-2 1-1 2 2 1-1-2-2 5.5-5.5A4 4 0 0 1 15 9z',
  webhook: 'M12 4a4 4 0 0 1 2 7.5L16 15M8 20a4 4 0 0 1-1.5-7.7L8.5 9M20 17a4 4 0 0 1-7 2H8',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  org: 'M4 21V5h10v16M14 9h6v12M7 9h4M7 13h4M7 17h4M4 21h16',
  platform: 'M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01',
  enroll: 'M15 4h5v5M20 4l-7 7M4 8V20h12v-4M8 12h4',
  settings: AREA_STYLE.Setup.icon,
  master: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  general: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
};

const BY_PATH = {
  '/': P.home, '/summary': P.summary, '/daily-brief': P.brief, '/dashboard': P.dashboard, '/assistant': P.assistant,
  '/notifications': P.notify, '/templates': P.tmpl, '/ecph-entry': P.ecph, '/fertigation/entry': P.tank,
  '/irrigation/entry': P.valve, '/harvest/entry': P.hentry, '/admin/crop-history': P.rotate, '/pump-room': P.pump,
  '/harvest/dashboard': P.harvest, '/fertigation/dashboard': P.fert, '/irrigation/dashboard': P.irrig,
  '/efficiency-dashboard': P.eff, '/fertigation-harvest': P.ratio, '/ecph/reports': P.rep, '/fertigation/reports': P.rep,
  '/harvest/reports': P.rep, '/report-builder': P.builder, '/weather-log': P.weather, '/weather-log/map': P.wmap,
  '/remote-sensing': P.rs, '/gps-tracking': P.gps, '/gis-map': P.gis,
  '/ipm/pesticide-applications': P.spray, '/ipm/biological-control-record': P.bio, '/ipm/bumble-bees': P.bee,
  '/ipm/product-catalog': P.bottle, '/ipm/scouting-reports': P.scout, '/ipm/pest-catalog': P.pestcat,
  '/ipm/spray-calendar': P.scal, '/ipm/field-staff': P.staff, '/audit/batch-trace': P.batch,
  '/audit/phi-audit-log': P.phi, '/audit/change-requests': P.change,
  '/tasks': P.tasks, '/shift-schedule': P.shift, '/manpower-record': P.manpower, '/manpower-activity-sheet': P.sheet,
  '/manpower-cost': P.cost, '/manage/countries': P.sites, '/manage/farm-areas': P.areas, '/manage/field-types': P.types,
  '/manage/valves': P.valve, '/manage/recipes': P.recipe, '/manage/seasons': P.seasons, '/inventory': P.inventory,
  '/yield-predictions': P.yield, '/agronomic-reference': P.agro, '/admin/api-integrations': P.api,
  '/admin/integrations/john-deere': P.deere, '/internship': P.school, '/internship/grades': P.grade,
  '/admin/users': P.users, '/admin/audit': P.audit, '/admin/recovery': P.recovery, '/admin/backup': P.backup,
  '/admin/import': P.import, '/admin/health': P.health, '/admin/api-keys': P.key, '/admin/webhooks': P.webhook,
  '/admin/feature-flags': P.flag, '/admin/organization': P.org, '/admin/platform': P.platform,
  '/admin/enrollment': P.enroll, '/settings': P.settings,
};

export const ICON_PATHS = P;

export function iconPathFor(path) {
  if (BY_PATH[path]) return BY_PATH[path];
  if (path && path.startsWith('/settings')) return P.settings;
  return P.dashboard;
}

/** Stroke icon drawn for one screen. `d` overrides the lookup by route. */
export function ModuleIcon({ path, d, size = 18, stroke = 1.6, ...rest }) {
  return (
    <svg className="mod-ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      <path d={d || iconPathFor(path)} />
    </svg>
  );
}

const shade = (hex, f) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
let uid = 0;

/**
 * Icon with depth, no box: a soft tinted body, a darker extruded copy behind,
 * a lit gradient stroke on top and a cast shadow. Inside an element with the
 * class "icon3d-host" it lifts and tilts on hover and keyboard focus.
 */
export function Icon3D({ path, d, color = '#16432e', size = 36 }) {
  const id = `i3d${(uid += 1)}`;
  const shape = d || iconPathFor(path);
  return (
    <span className="icon3d" aria-hidden="true" style={{ width: size, height: size, '--i3d': color }}>
      <svg width={size} height={size} viewBox="-1 -1 26 26" fill="none" focusable="false">
        <defs>
          <linearGradient id={`${id}s`} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0" stopColor={shade(color, 0.45)} />
            <stop offset="0.55" stopColor={color} />
            <stop offset="1" stopColor={shade(color, -0.35)} />
          </linearGradient>
          <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={shade(color, 0.7)} stopOpacity="0.55" />
            <stop offset="1" stopColor={color} stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <g className="icon3d-depth" transform="translate(0.7 1.1)">
          <path d={shape} stroke={shade(color, -0.45)} strokeOpacity="0.32" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <path d={shape} fill={`url(#${id}f)`} stroke="none" />
        <path d={shape} stroke={`url(#${id}s)`} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        <path d={shape} stroke="#fff" strokeOpacity="0.55" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round" transform="translate(-0.35 -0.45)" />
      </svg>
    </span>
  );
}
