import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  Box,
  Typography,
  useTheme,
  useMediaQuery,
  TextField,
  MenuItem,
  Badge,
  Chip,
  Tooltip,
  CircularProgress,
  ButtonBase,
  Collapse,
} from '@mui/material';
import {
  HomeOutlined as HomeIcon,
  ScienceOutlined as ScienceIcon,
  WaterDropOutlined as WaterDropIcon,
  DashboardOutlined as DashboardIcon,
  SettingsOutlined as SettingsIcon,
  AgricultureOutlined as AgricultureIcon,
  AssessmentOutlined as AssessmentIcon,
  DescriptionOutlined as DescriptionIcon,
  LocationOnOutlined as LocationIcon,
  ParkOutlined as ParkIcon,
  LabelOutlined as LabelIcon,
  SettingsInputComponentOutlined as ValvesIcon,
  CloudOutlined as WeatherIcon,
  MapOutlined as MapIcon,
  SatelliteAltOutlined as RemoteSensingIcon,
  AdminPanelSettingsOutlined as AdminIcon,
  GroupOutlined as UsersIcon,
  HistoryOutlined as HistoryIcon,
  AssignmentOutlined as TaskIcon,
  PestControlOutlined as BugReportIcon,
  GpsFixedOutlined as GpsIcon,
  GroupsOutlined as ManpowerIcon,
  EditNoteOutlined as DataEntryIcon,
  Inventory2Outlined as InventoryIcon,
  CalendarMonthOutlined as CalendarIcon,
  YardOutlined as SpaIcon,
  TrendingUpOutlined as TrendingUpIcon,
  SpaOutlined as EcoIcon,
  ViewListOutlined as TemplatesIcon,
  SchoolOutlined as SchoolIcon,
  ElectricBoltOutlined as ElectricBoltIcon,
  SearchOutlined as TraceIcon,
  EditNoteOutlined as ChangeRequestIcon,
  EventNoteOutlined as ActivitySheetIcon,
  ChevronRightRounded as ChevronIcon,
  ForumOutlined as AssistantIcon,
  LogoutOutlined as LogoutIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useActiveSeason } from '../contexts/ActiveSeasonContext';
import { useActAsOrg } from '../contexts/ActAsOrgContext';
import { drawerWidth, getShellSections, RAIL_WIDTH } from '../config/navAreas';
import { INSIGHT_PATHS } from './InsightsMenu';
import usePhiAuditBadgeCount from '../hooks/usePhiAuditBadgeCount';
import useOperatorWorkOrderBadgeCount from '../hooks/useOperatorWorkOrderBadgeCount';
import useChangeRequestBadgeCount from '../hooks/useChangeRequestBadgeCount';
import useManpowerApprovalBadgeCount from '../hooks/useManpowerApprovalBadgeCount';
import BrandLogo from './BrandLogo';
import useOrganizationLogo from '../hooks/useOrganizationLogo';
import { canUploadOrgLogo, uploadOrganizationLogo } from '../utils/organizationLogo';
import { useNotification } from '../contexts/NotificationContext';
import { useShellLabel } from '../i18n/shellLabels';

const PATH_ICONS = {
  '/': HomeIcon,
  '/summary': DescriptionIcon,
  '/daily-brief': AssessmentIcon,
  '/assistant': AssistantIcon,
  '/dashboard': DashboardIcon,
  '/templates': TemplatesIcon,
  '/ecph-entry': ScienceIcon,
  '/fertigation/entry': WaterDropIcon,
  '/irrigation/entry': WaterDropIcon,
  '/harvest/entry': AgricultureIcon,
  '/admin/crop-history': HistoryIcon,
  '/pump-room': ElectricBoltIcon,
  '/harvest/dashboard': AgricultureIcon,
  '/fertigation/dashboard': WaterDropIcon,
  '/efficiency-dashboard': TrendingUpIcon,
  '/fertigation-harvest': AssessmentIcon,
  '/ecph/reports': ScienceIcon,
  '/fertigation/reports': WaterDropIcon,
  '/harvest/reports': AgricultureIcon,
  '/report-builder': DescriptionIcon,
  '/weather-log': WeatherIcon,
  '/weather-log/map': MapIcon,
  '/remote-sensing': RemoteSensingIcon,
  '/gps-tracking': GpsIcon,
  '/gis-map': MapIcon,
  '/audit/batch-trace': TraceIcon,
  '/audit/phi-audit-log': HistoryIcon,
  '/audit/change-requests': ChangeRequestIcon,
  '/ipm/pesticide-applications': BugReportIcon,
  '/ipm/biological-control-record': SpaIcon,
  '/ipm/bumble-bees': EcoIcon,
  '/ipm/product-catalog': InventoryIcon,
  '/ipm/scouting-reports': DescriptionIcon,
  '/ipm/pest-catalog': BugReportIcon,
  '/ipm/spray-calendar': CalendarIcon,
  '/tasks': TaskIcon,
  '/shift-schedule': HistoryIcon,
  '/manpower-record': ManpowerIcon,
  '/manpower-activity-sheet': ActivitySheetIcon,
  '/manage/countries': LocationIcon,
  '/manage/farm-areas': ParkIcon,
  '/manage/field-types': LabelIcon,
  '/manage/valves': ValvesIcon,
  '/manage/recipes': DescriptionIcon,
  '/manage/seasons': CalendarIcon,
  '/inventory': InventoryIcon,
  '/yield-predictions': AgricultureIcon,
  '/agronomic-reference': ScienceIcon,
  '/admin/api-integrations': SettingsIcon,
  '/admin/integrations/john-deere': SettingsIcon,
  '/internship': SchoolIcon,
  '/internship/grades': AssessmentIcon,
  '/admin/users': UsersIcon,
  '/admin/audit': HistoryIcon,
  '/admin/recovery': HistoryIcon,
  '/admin/backup': SettingsIcon,
  '/admin/import': DataEntryIcon,
  '/admin/health': DashboardIcon,
  '/admin/api-keys': SettingsIcon,
  '/admin/webhooks': SettingsIcon,
  '/admin/feature-flags': SettingsIcon,
  '/admin/organization': AdminIcon,
  '/admin/platform': AdminIcon,
  '/admin/enrollment': SchoolIcon,
};

// Section names are stored in capitals (they are also lookup keys); show them in
// sentence case ("Data entry"), keeping acronyms such as IPM.
const KEEP_CAPS = new Set(['IPM', 'GIS', 'AI', 'EC', 'PH', 'PHI', 'API', 'KPI']);
function sentenceCase(text) {
  if (typeof text !== 'string' || text !== text.toUpperCase() || !/[A-Z]/.test(text)) return text;
  return text.split(' ').map((w, i) => {
    if (KEEP_CAPS.has(w)) return w;
    const lower = w.toLowerCase();
    return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
  }).join(' ');
}

// eslint-disable-next-line no-unused-vars
function Sidebar({ open, mobileOpen, onMobileClose, activeNavArea }) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'), { noSsr: true });
  const isDesktop = !isMobile;
  // Desktop "closed" is a slim icon rail, not a hidden menu (Option C shell).
  const rail = isDesktop && !open;
  const L = useShellLabel();
  const { user, logout } = useAuth();
  const { activeSite } = useActiveSite();
  const { activeSeason } = useActiveSeason();
  const siteLine = [activeSite ? [activeSite.zoneName, activeSite.name].filter(Boolean).join(' · ') : null, activeSeason?.name].filter(Boolean).join(' · ');
  const {
    isSuperAdmin,
    actAsOrgId,
    homeOrg,
    activeOrg,
    organizations,
    isActingAsOrg,
    setActAsOrg,
  } = useActAsOrg();
  const notify = useNotification();
  const { logoUrl, refresh: refreshLogo } = useOrganizationLogo();
  const logoInputRef = useRef(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const canUploadLogo = canUploadOrgLogo(user?.role);

  // Summary & Contents and Daily Brief live behind the top-bar "?" menu.
  const sections = getShellSections(user)
    .map((section) => ({ ...section, items: section.items.filter((item) => !INSIGHT_PATHS.has(item.path)) }))
    .filter((section) => section.items.length > 0);
  const phiAuditBadgeCount = usePhiAuditBadgeCount();
  const changeRequestBadgeCount = useChangeRequestBadgeCount();
  const manpowerApprovalBadgeCount = useManpowerApprovalBadgeCount();
  const operatorWorkOrderCount = useOperatorWorkOrderBadgeCount();

  const pathToBadge = {
    '/ipm/pesticide-applications': { count: operatorWorkOrderCount, color: 'error' },
    '/audit/phi-audit-log': { count: phiAuditBadgeCount, color: 'error' },
    '/audit/change-requests': { count: changeRequestBadgeCount, color: 'success' },
    '/manpower-record': { count: manpowerApprovalBadgeCount, color: 'success' },
  };

  const handleNavigation = (path) => {
    navigate(path);
    if (isMobile) onMobileClose();
  };

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const sectionHasActive = (items) => items.some((item) => isActive(item.path));

  // Section groups fold like the reference sidebar; the open/closed choice is remembered per browser.
  const [openGroups, setOpenGroups] = useState(() => {
    try { return JSON.parse(localStorage.getItem('agrocloud_nav_open_v2') || '{}') || {}; } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem('agrocloud_nav_open_v2', JSON.stringify(openGroups)); } catch { /* private mode */ }
  }, [openGroups]);
  const groupOpen = (section) => (openGroups[section.label] ?? section.defaultOpen);
  const toggleSection = (section) => setOpenGroups((c) => ({ ...c, [section.label]: !groupOpen(section) }));
  const openSearch = () => {
    if (isMobile) onMobileClose();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  };

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: (t) => (t.palette.mode === 'dark' ? 'background.paper' : '#fbfbf8') }}>
      <Box sx={{ px: rail ? 0 : 4, height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: rail ? 'center' : 'flex-start', gap: 3 }}>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setLogoUploading(true);
            try {
              await uploadOrganizationLogo(file);
              await refreshLogo();
              notify.success('Organization logo updated');
            } catch (err) {
              notify.error(err.message || 'Could not upload logo');
            } finally {
              setLogoUploading(false);
            }
          }}
        />
        <Tooltip title="Upload organization logo" disableHoverListener={!canUploadLogo}>
          <Box
            onClick={canUploadLogo && !logoUploading ? () => logoInputRef.current?.click() : undefined}
            role={canUploadLogo ? 'button' : undefined}
            aria-label={canUploadLogo ? 'Upload organization logo' : undefined}
            sx={{
              width: 36,
              height: 36,
              borderRadius: '10px',
              boxShadow: '0 0 0 1px rgba(22,40,30,0.08)',
              bgcolor: logoUploading ? 'primary.main' : logoUrl ? 'transparent' : '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              flexShrink: 0,
              overflow: 'hidden',
              cursor: canUploadLogo ? 'pointer' : 'default',
            }}
          >
            {logoUploading ? (
              <CircularProgress size={18} sx={{ color: 'white' }} />
            ) : logoUrl ? (
              <Box
                component="img"
                src={logoUrl}
                alt="Organization logo"
                sx={{ width: 34, height: 34, objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <BrandLogo size={32} />
            )}
          </Box>
        </Tooltip>
        <Box sx={{ display: rail ? 'none' : 'block', minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', color: 'text.primary', letterSpacing: '-0.015em', lineHeight: 1.2 }}>
            {L('AgroCloud')}
          </Typography>
          <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', lineHeight: 1.35 }}>
            {siteLine || L('Elite Agro Cloud')}
          </Typography>
        </Box>
      </Box>

      {isSuperAdmin && !rail && (
        <Box sx={{ px: 4, pt: 4, pb: 1 }}>
          <TextField
            select
            size="small"
            fullWidth
            label="Organization"
            value={actAsOrgId || ''}
            onChange={(e) => setActAsOrg(e.target.value || null)}
            sx={{
              '& .MuiOutlinedInput-root': { bgcolor: 'background.muted' },
              '& .MuiSelect-select': { py: 1, fontSize: '0.8125rem', fontWeight: 600 },
            }}
          >
            <MenuItem value="" sx={{ fontSize: '0.8125rem' }}>
              {homeOrg?.name ? `My org: ${homeOrg.name}` : 'My organization'}
            </MenuItem>
            {organizations
              .filter((o) => o.id !== user?.organizationId)
              .map((org) => (
                <MenuItem key={org.id} value={org.id} sx={{ fontSize: '0.8125rem' }}>
                  {org.name}
                </MenuItem>
              ))}
          </TextField>
          {isActingAsOrg && activeOrg?.name && (
            <Chip
              size="small"
              color="warning"
              label={`Viewing: ${activeOrg.name}`}
              sx={{ mt: 1, width: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
            />
          )}
        </Box>
      )}


      <Box component="nav" aria-label="Main navigation" sx={{ flexGrow: 1, overflow: 'auto', overflowX: 'hidden', pt: 3, pb: 3, px: rail ? 2.5 : 3, overscrollBehavior: 'contain', scrollbarWidth: 'thin' }}>
        <Tooltip title={rail ? L('Search') : ''} placement="right">
          <ListItemButton
            onClick={openSearch}
            aria-label={L('Search')}
            sx={{ minHeight: 36, borderRadius: '9px', px: rail ? 0 : 2.5, justifyContent: rail ? 'center' : 'flex-start', mb: 4, gap: 2.5, color: 'text.secondary', bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#ffffff'), boxShadow: '0 0 0 1px rgba(22,40,30,0.08)', '&:hover .agro-kbd': { opacity: 1 } }}
          >
            <TraceIcon sx={{ fontSize: 17 }} />
            {!rail && <Typography sx={{ fontSize: '0.8125rem', flex: 1 }}>{L('Search')}</Typography>}
            {!rail && (
              <Box component="kbd" className="agro-kbd" sx={{ font: "500 10px 'IBM Plex Mono', monospace", px: 1.25, py: 0.25, borderRadius: '4px', border: '1px solid', borderColor: 'divider', color: 'text.secondary', opacity: 0.8 }}>Ctrl K</Box>
            )}
          </ListItemButton>
        </Tooltip>
        {sections.map((section) => {
          const hasActive = sectionHasActive(section.items);
          const isOpen = rail || hasActive || groupOpen(section);

          return (
            <Box key={section.label} sx={{ mb: rail ? 2 : 5 }}>
              {rail ? (
                <Box sx={{ height: 1, bgcolor: 'divider', mx: 2, mb: 2, display: section === sections[0] ? 'none' : 'block' }} />
              ) : (
              <ButtonBase
                onClick={() => toggleSection(section)}
                aria-expanded={isOpen}
                disabled={hasActive}
                sx={{ width: '100%', justifyContent: 'flex-start', gap: 1, px: 2.5, py: 1, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}
              >
                <Typography
                  component="span"
                  sx={{
                    flex: 1,
                    textAlign: 'start',
                    fontSize: '0.71875rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    letterSpacing: '0.01em',
                    color: hasActive ? 'text.primary' : 'text.disabled',
                  }}
                >
                  {sentenceCase(L(section.label))}
                </Typography>
                {!hasActive && (
                  <ChevronIcon sx={{ fontSize: 16, color: 'text.disabled', transition: 'transform 200ms', transform: isOpen ? 'rotate(90deg)' : (theme.direction === 'rtl' ? 'rotate(180deg)' : 'none') }} />
                )}
              </ButtonBase>
              )}
              <Collapse in={isOpen} timeout={200}>
              <List disablePadding sx={{ mt: 0.5 }}>
                {section.items.map((item) => {
                  const ItemIcon = PATH_ICONS[item.path] || DashboardIcon;
                  const badge = pathToBadge[item.path];
                  return (
                    <SidebarItem
                      key={item.path}
                      item={{ ...item, text: L(item.text), icon: <ItemIcon /> }}
                      active={isActive(item.path)}
                      onNavigate={handleNavigation}
                      badgeCount={badge?.count ?? 0}
                      badgeColor={badge?.color ?? 'error'}
                      rail={rail}
                    />
                  );
                })}
              </List>
              </Collapse>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ px: rail ? 2.5 : 3, py: 3, borderTop: '1px solid', borderColor: 'divider' }}>
        <Tooltip title={rail ? L('Sign out') : ''} placement="right">
          <ListItemButton onClick={() => logout && logout()} aria-label={L('Sign out')} sx={{ minHeight: 36, borderRadius: '9px', px: rail ? 0 : 2.5, justifyContent: rail ? 'center' : 'flex-start', gap: 2.5, color: 'text.secondary' }}>
            <LogoutIcon sx={{ fontSize: 17 }} />
            {!rail && <Typography sx={{ fontSize: '0.8125rem' }}>{L('Sign out')}</Typography>}
          </ListItemButton>
        </Tooltip>
      </Box>
    </Box>
  );

  // Only the drawer for the current screen size is rendered (the menu used to be
  // built twice — phone drawer and desktop panel — on every device). The phone
  // drawer builds its contents when first opened.
  return (
    <>
      {!isDesktop && (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: false }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
        }}
      >
        {drawerContent}
      </Drawer>
      )}

      {isDesktop && (
      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: 'none', md: 'block' },
          width: open ? drawerWidth : RAIL_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            transition: theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
            borderRight: '1px solid rgba(22,40,30,0.07)',
            ...(!open && {
              overflowX: 'hidden',
              transition: theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
              }),
              width: RAIL_WIDTH,
            }),
          },
        }}
      >
        {drawerContent}
      </Drawer>
      )}

    </>
  );
}

function SidebarItem({ item, active, onNavigate, badgeCount = 0, badgeColor = 'error', rail = false }) {
  const button = (
    <ListItemButton
      onClick={() => onNavigate(item.path)}
      aria-current={active ? 'page' : undefined}
      aria-label={rail ? item.text : undefined}
      sx={{
        position: 'relative',
        minHeight: 34,
        borderRadius: '8px',
        px: rail ? 0 : 2.5,
        py: 1,
        gap: 2.75,
        justifyContent: rail ? 'center' : 'flex-start',
        color: active ? 'text.primary' : 'text.secondary',
        transition: 'background-color 150ms ease, color 150ms ease, box-shadow 150ms ease',
        ...(active ? {
          bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.07)' : '#ffffff'),
          boxShadow: (t) => (t.palette.mode === 'dark' ? 'none' : '0 1px 2px rgba(22,40,30,0.08), 0 0 0 1px rgba(22,40,30,0.05)'),
          '&:hover': { bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.09)' : '#ffffff') },
        } : {
          '&:hover': { bgcolor: 'rgba(22,40,30,0.045)', color: 'text.primary' },
        }),
      }}
    >
      <Box component="span" sx={{ display: 'inline-flex', '& .MuiSvgIcon-root': { fontSize: 17, color: active ? 'primary.main' : 'inherit' } }}>
        {badgeCount > 0 && rail ? (
          <Badge variant="dot" color={badgeColor}>{item.icon}</Badge>
        ) : item.icon}
      </Box>
      {!rail && (
        <Typography component="span" sx={{ flex: 1, minWidth: 0, fontSize: '0.8125rem', fontWeight: active ? 600 : 450, letterSpacing: '-0.005em', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
          {item.text}
        </Typography>
      )}
      {!rail && badgeCount > 0 && (
        <Box component="span" sx={{ minWidth: 20, height: 20, px: 1.5, boxSizing: 'border-box', borderRadius: '10px', display: 'inline-grid', placeItems: 'center', fontSize: 11, fontWeight: 600, bgcolor: badgeColor === 'success' ? 'rgba(22,67,46,0.09)' : 'rgba(180,35,24,0.1)', color: badgeColor === 'success' ? 'primary.dark' : 'error.main' }}>
          {badgeCount > 99 ? '99+' : badgeCount}
        </Box>
      )}
    </ListItemButton>
  );
  return (
    <ListItem disablePadding sx={{ mb: 0.5 }}>
      {rail ? <Tooltip title={item.text} placement="right">{button}</Tooltip> : button}
    </ListItem>
  );
}

export default Sidebar;
export { drawerWidth, RAIL_WIDTH };
