import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  InputAdornment,
  Typography,
  Box,
} from '@mui/material';
import {
  SearchOutlined as SearchIcon,
  HomeOutlined as HomeIcon,
  ScienceOutlined as ScienceIcon,
  WaterDropOutlined as WaterDropIcon,
  AgricultureOutlined as AgricultureIcon,
  AssessmentOutlined as AssessmentIcon,
  DescriptionOutlined as DescriptionIcon,
  DashboardOutlined as DashboardIcon,
  SettingsOutlined as SettingsIcon,
  LocationOnOutlined as LocationIcon,
  ParkOutlined as ParkIcon,
  Label as LabelIcon,
  SettingsInputComponentOutlined as ValvesIcon,
  CloudQueueOutlined as WeatherIcon,
  MapOutlined as MapIcon,
  SatelliteAltOutlined as RemoteSensingIcon,
  AdminPanelSettingsOutlined as AdminIcon,
  GroupOutlined as UsersIcon,
  HistoryOutlined as HistoryIcon,
} from '@mui/icons-material';
import { useShellLabel, useIsArabic } from '../i18n/shellLabels';

const ALL_COMMANDS = [
  { label: 'Home', path: '/', icon: <HomeIcon />, keywords: 'home landing welcome' },
  { label: 'Summary & Contents', path: '/summary', icon: <DescriptionIcon />, keywords: 'summary contents prototype meeting excel overview' },
  { label: 'EC/PH Entry', path: '/ecph-entry', icon: <ScienceIcon />, keywords: 'ec ph entry readings valve' },
  { label: 'Harvest Entry', path: '/harvest/entry', icon: <AgricultureIcon />, keywords: 'harvest entry yield' },
  { label: 'Harvest Dashboard', path: '/harvest/dashboard', icon: <AssessmentIcon />, keywords: 'harvest analytics chart' },
  { label: 'Harvest Reports', path: '/harvest/reports', icon: <DescriptionIcon />, keywords: 'harvest report pdf excel' },
  { label: 'Fertigation Entry', path: '/fertigation/entry', icon: <WaterDropIcon />, keywords: 'fertigation water fertilizer' },
  { label: 'Irrigation Entry', path: '/irrigation/entry', icon: <WaterDropIcon />, keywords: 'irrigation water pivot nethouse greenhouse open field rc-133' },
  { label: 'Fertigation Dashboard', path: '/fertigation/dashboard', icon: <AssessmentIcon />, keywords: 'fertigation analytics chart water' },
  { label: 'Irrigation Dashboard', path: '/irrigation/dashboard', icon: <AssessmentIcon />, keywords: 'irrigation analytics chart water cycles rc-108' },
  { label: 'Efficiency Dashboard', path: '/efficiency-dashboard', icon: <AssessmentIcon />, keywords: 'efficiency wue water use' },
  { label: 'Weather & Soil Data Entry', path: '/weather-log', icon: <WeatherIcon />, keywords: 'weather soil log temperature humidity moisture' },
  { label: 'Weather Map', path: '/weather-log/map', icon: <MapIcon />, keywords: 'weather map ndvi satellite' },
  { label: 'Remote Sensing', path: '/remote-sensing', icon: <RemoteSensingIcon />, keywords: 'satellite sentinel ndvi remote' },
  { label: 'GIS Map', path: '/gis-map', icon: <MapIcon />, keywords: 'gis map layers arcgis geojson kml shapefile features geometry' },
  { label: 'Dashboard', path: '/dashboard', icon: <DashboardIcon />, keywords: 'dashboard overview summary analytics' },
  { label: 'Zones & Sites', path: '/manage/countries', icon: <LocationIcon />, keywords: 'zones countries sites manage' },
  { label: 'Farm Areas & Crops', path: '/manage/farm-areas', icon: <ParkIcon />, keywords: 'farm areas crops manage' },
  { label: 'Field Types & Names', path: '/manage/field-types', icon: <LabelIcon />, keywords: 'field types names manage' },
  { label: 'Valves Configuration', path: '/manage/valves', icon: <ValvesIcon />, keywords: 'valves config settings' },
  { label: 'Recipes', path: '/manage/recipes', icon: <DescriptionIcon />, keywords: 'recipes fertilizer manage' },
  { label: 'User Management', path: '/admin/users', icon: <UsersIcon />, keywords: 'users admin roles permissions' },
  { label: 'Audit Log', path: '/admin/audit', icon: <HistoryIcon />, keywords: 'audit log history changes' },
  { label: 'Batch Trace', path: '/audit/batch-trace', icon: <SearchIcon />, keywords: 'batch trace traceability complaint harvest investigation' },
  { label: 'PHI Audit Log', path: '/audit/phi-audit-log', icon: <HistoryIcon />, keywords: 'phi audit conflict harvest spray pesticide violation' },
  { label: 'Tasks', path: '/tasks', icon: <DashboardIcon />, keywords: 'tasks kanban board assignment' },
  { label: 'Report Builder', path: '/report-builder', icon: <DescriptionIcon />, keywords: 'report builder export custom' },
  { label: 'Notifications', path: '/notifications', icon: <DashboardIcon />, keywords: 'notifications alerts bell' },
];

function fuzzyMatch(text, query) {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (lower.includes(q)) return true;
  // Simple character-by-character fuzzy
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const L = useShellLabel();
  const isAr = useIsArabic();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return ALL_COMMANDS;
    return ALL_COMMANDS.filter(
      (cmd) => fuzzyMatch(cmd.label, query) || fuzzyMatch(L(cmd.label), query) || fuzzyMatch(cmd.keywords, query)
    );
  }, [query, L]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered]);

  const handleSelect = useCallback(
    (path) => {
      navigate(path);
      setOpen(false);
      setQuery('');
    },
    [navigate]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        handleSelect(filtered[selectedIndex].path);
      }
    },
    [filtered, selectedIndex, handleSelect]
  );

  return (
    <Dialog
      open={open}
      onClose={() => { setOpen(false); setQuery(''); }}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          position: 'fixed',
          top: '15%',
          m: 0,
          borderRadius: '16px',
          maxHeight: '60vh',
          maxWidth: 600,
          boxShadow: '0 30px 80px -20px rgba(22,40,30,0.45), 0 0 0 1px rgba(22,40,30,0.06)',
        },
      }}
      slotProps={{ backdrop: { sx: { backdropFilter: 'blur(3px)', bgcolor: 'rgba(22,40,30,0.22)' } } }}
    >
      <Box sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <TextField
          inputRef={inputRef}
          autoFocus
          fullWidth
          placeholder={isAr ? 'بحث' : 'Search'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          variant="standard"
          InputProps={{
            disableUnderline: true,
            sx: { height: 56, fontSize: 15 },
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <Box component="kbd" sx={{ font: "500 10.5px 'IBM Plex Mono', monospace", px: 1.5, py: 0.25, borderRadius: '5px', border: '1px solid', borderColor: 'divider', color: 'text.secondary' }}>Esc</Box>
              </InputAdornment>
            ),
          }}
        />
      </Box>
      <List sx={{ maxHeight: '50vh', overflow: 'auto', p: 2 }}>
        {filtered.length === 0 ? (
          <ListItem>
            <ListItemText
              primary={
                <Typography color="text.secondary" align="center">
                  No results found
                </Typography>
              }
            />
          </ListItem>
        ) : (
          filtered.map((cmd, idx) => (
            <ListItem key={cmd.path} disablePadding>
              <ListItemButton
                selected={idx === selectedIndex}
                onClick={() => handleSelect(cmd.path)}
                sx={{ borderRadius: '9px', minHeight: 40, '&.Mui-selected': { bgcolor: 'rgba(22,40,30,0.06)' } }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>{cmd.icon}</ListItemIcon>
                <ListItemText
                  primary={L(cmd.label)}
                  primaryTypographyProps={{ fontWeight: idx === selectedIndex ? 600 : 400 }}
                />
                {idx === selectedIndex && (
                  <Typography variant="caption" color="text.secondary">Enter</Typography>
                )}
              </ListItemButton>
            </ListItem>
          ))
        )}
      </List>
      <Box sx={{ display: 'flex', gap: 4, px: 4.5, py: 2.5, borderTop: '1px solid', borderColor: 'divider', fontSize: 11.5, color: 'text.secondary' }}>
        <span>↑↓ {isAr ? 'للتنقل' : 'to move'}</span><span>Enter {isAr ? 'للفتح' : 'to open'}</span><span>Esc {isAr ? 'للإغلاق' : 'to close'}</span>
      </Box>
    </Dialog>
  );
}
