import { useState, useEffect, lazy, Suspense, useRef } from 'react';
import useSocket from '../hooks/useSocket';
import {
  Box,
  Typography,
  Chip,
  Tabs,
  Tab,
  Paper,
  TextField,
  MenuItem,
  Button,
  Collapse,
  Divider,
} from '@mui/material';
import { CloseOutlined as CloseIcon, MapOutlined as MapIcon } from '@mui/icons-material';
import FieldMapPanel from './dashboard/FieldMapPanel';
import { DashboardSkeleton } from '../components/LoadingSkeleton';
import FarmMonitor from './dashboard/FarmMonitor';
import useDashboardData from './dashboard/useDashboardData';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useActiveSeason } from '../contexts/ActiveSeasonContext';
import SiteZoneSelect from '../components/SiteZoneSelect';
import useReadOnlyMode from '../hooks/useReadOnlyMode';
import ReadOnlyBanner from '../components/ReadOnlyBanner';
import { PAGE_KEYS } from '../utils/roleAccess';
import useSeasonListDates from '../hooks/useSeasonListDates';
import PageTitle from '../components/PageTitle';
import { FORM_IDENTITY, FormIdentityProvider } from '../theme/formIdentity';
import { FormTile } from '../components/dashboard/clearCharts';

const EcphDashboard = lazy(() => import('./dashboard/EcphDashboard'));
const FertigationDashboard = lazy(() => import('./dashboard/FertigationDashboard'));
const IrrigationDashboard = lazy(() => import('./dashboard/IrrigationDashboard'));
const HarvestDashboard = lazy(() => import('./dashboard/HarvestDashboard'));

const DEFAULT_FILTERS = {
  dateFrom: '',
  dateTo: '',
  zone: '',
  site: '',
  farmArea: '',
  field: '',
};

const DASHBOARD_TABS = [
  { key: 'ecph', label: 'EC / pH' },
  { key: 'fertigation', label: 'Fertigation' },
  { key: 'irrigation', label: 'Irrigation' },
  { key: 'harvest', label: 'Harvest' },
];

function Dashboard() {
  const readOnly = useReadOnlyMode(PAGE_KEYS.DASHBOARD);
  const {
    startDate: seasonFrom,
    endDate: seasonTo,
    setStartDate: setSeasonFrom,
    setEndDate: setSeasonTo,
    seasonStart,
    seasonEnd,
  } = useSeasonListDates();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedFieldObj, setSelectedFieldObj] = useState(null);
  const [showMap, setShowMap] = useState(() => { try { return localStorage.getItem('agro_dash_map') !== '0'; } catch { return true; } });
  const toggleMap = () => setShowMap((v) => { try { localStorage.setItem('agro_dash_map', v ? '0' : '1'); } catch { /* ignore */ } return !v; });
  const { activeSiteId, setActiveSiteId, countries, allowAllSites, hasSiteAssignment } = useActiveSite();
  const { activeSeasonId, setActiveSeasonId, seasons, isLoaded: seasonLoaded } = useActiveSeason();

  // The dashboard follows the site chosen in the sidebar or in its own header
  // (both use the same selection). "All Sites" clears the site, and a field
  // picked under the previous site is cleared too.
  useEffect(() => {
    const site = activeSiteId || '';
    setFilters((prev) => (prev.site === site ? prev : { ...prev, site, field: '', farmArea: '' }));
    setSelectedFieldObj(null);
  }, [activeSiteId]);

  const statsRef = useRef(null);
  const handleFieldSelect = (field, { scroll = true } = {}) => {
    if (!field) {
      setSelectedFieldObj(null);
      setFilters((prev) => ({ ...prev, field: '', farmArea: '' }));
      return;
    }
    setSelectedFieldObj(field);
    setFilters((prev) => ({ ...prev, field: field.id, farmArea: field.farm_area_id || prev.farmArea }));
    // Bring the chosen field's statistics into view.
    if (scroll) setTimeout(() => statsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
  };

  const {
    isLoading,
    allFields,
    fieldOverview,
    agronomicThresholds,
    weatherByFieldId,
    weatherLoading,
    weatherFetching,
    refreshWeather,
    refresh,
  } = useDashboardData({
    selectedField: filters.field,
    selectedFarmArea: filters.farmArea,
    selectedSite: filters.site,
    startDate: seasonFrom,
    endDate: seasonTo,
  });

  const { subscribe, unsubscribe, on, off } = useSocket();
  useEffect(() => {
    subscribe('dashboard');
    on('data:change', refresh);
    return () => {
      off('data:change', refresh);
      unsubscribe('dashboard');
    };
  }, [subscribe, unsubscribe, on, off, refresh]);

  if (isLoading) return <DashboardSkeleton />;

  const activeForm = FORM_IDENTITY[DASHBOARD_TABS[activeTab]?.key] || FORM_IDENTITY.ecph;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
        <PageTitle>Analytics Dashboard</PageTitle>
        <Box sx={{ flex: 1 }} />
        {hasSiteAssignment && (
          <SiteZoneSelect
            variant="chip"
            countries={countries}
            value={activeSiteId}
            onChange={setActiveSiteId}
            allowAllSites={allowAllSites}
          />
        )}
        {activeSiteId && seasonLoaded && seasons.length > 0 && (
          <TextField
            select
            size="small"
            value={activeSeasonId || ''}
            onChange={(e) => setActiveSeasonId(e.target.value)}
            SelectProps={{ inputProps: { 'aria-label': 'Season' } }}
            sx={{ '& .MuiOutlinedInput-root': { height: 36, borderRadius: 999, fontSize: '0.8125rem', fontWeight: 600 } }}
          >
            {seasons.map((season) => (
              <MenuItem key={season.id} value={season.id} sx={{ fontSize: '0.8125rem' }}>{season.name}</MenuItem>
            ))}
          </TextField>
        )}
      </Box>

      {readOnly && <ReadOnlyBanner message="View only — dashboard data is read-only for your role." />}

      <FarmMonitor
        fieldOverview={fieldOverview}
        onFieldSelect={handleFieldSelect}
        selectedFieldId={filters.field}
        agronomicThresholds={agronomicThresholds}
        onTabSwitch={(tabIndex) => setActiveTab(tabIndex)}
        dateTo={seasonTo}
        weatherByFieldId={weatherByFieldId}
        weatherLoading={weatherLoading}
        weatherFetching={weatherFetching}
        onRefreshWeather={refreshWeather}
      />

      {/* One bar: dates, then the form tabs, then the chosen field and the map switch. */}
      <Paper variant="outlined" sx={{ mb: 4, borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: { xs: 'wrap', md: 'nowrap' }, columnGap: 3, rowGap: 2, px: 3, py: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }}
              value={seasonFrom || ''} onChange={(e) => setSeasonFrom(e.target.value)}
              inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }}
              sx={{ width: 150 }}
            />
            <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }}
              value={seasonTo || ''} onChange={(e) => setSeasonTo(e.target.value)}
              inputProps={{ min: seasonStart || undefined, max: seasonEnd || undefined }}
              sx={{ width: 150 }}
            />
          </Box>
          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            variant="scrollable"
            scrollButtons={false}
            aria-label="Dashboard form"
            sx={{
              order: { xs: 3, md: 0 },
              width: { xs: '100%', md: 'auto' },
              minHeight: 40,
              '& .MuiTabs-indicator': { bgcolor: activeForm.base, height: 3, borderRadius: '3px 3px 0 0' },
            }}
          >
            {DASHBOARD_TABS.map((t) => {
              const f = FORM_IDENTITY[t.key];
              return (
                <Tab
                  key={t.key}
                  label={(
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: f.base }} />
                      {t.label}
                    </Box>
                  )}
                  sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', minHeight: 40, minWidth: 0, px: 3, '&.Mui-selected': { color: f.dark } }}
                />
              );
            })}
          </Tabs>
          <Box sx={{ flex: 1, display: { xs: 'none', md: 'block' } }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ml: { xs: 'auto', md: 0 }, flexShrink: 0 }}>
            {selectedFieldObj ? (
              <Chip
                label={selectedFieldObj.name}
                onDelete={() => handleFieldSelect(null)}
                deleteIcon={<CloseIcon />}
                size="small"
                sx={{ height: 28, fontWeight: 600, bgcolor: 'table.headerBg', color: 'table.headerText', '& .MuiChip-deleteIcon': { color: 'table.headerText' } }}
              />
            ) : (
              <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>All fields</Typography>
            )}
            <Button
              size="small"
              variant={showMap ? 'contained' : 'outlined'}
              color="primary"
              startIcon={<MapIcon sx={{ fontSize: 18 }} />}
              onClick={toggleMap}
              aria-pressed={showMap}
              aria-controls="dashboard-map"
              disableElevation
              sx={{ height: 32, borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3, whiteSpace: 'nowrap' }}
            >
              Map
            </Button>
          </Box>
        </Box>
      </Paper>

      <Collapse in={showMap} unmountOnExit>
        <Box id="dashboard-map">
          <FieldMapPanel
            fieldOverview={fieldOverview}
            allFields={allFields}
            selectedFieldId={filters.field}
            onSelect={(f) => handleFieldSelect(f, { scroll: false })}
            agronomicThresholds={agronomicThresholds}
            dateTo={seasonTo}
          />
        </Box>
      </Collapse>

      <Box ref={statsRef} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5, scrollMarginTop: 96 }}>
        <FormTile form={activeForm} />
        <Box>
          <Typography component="h2" sx={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>{activeForm.name}</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
            {selectedFieldObj ? selectedFieldObj.name : 'All fields'}{seasonFrom || seasonTo ? ` · ${seasonFrom || '…'} → ${seasonTo || '…'}` : ''}
          </Typography>
        </Box>
      </Box>

      <FormIdentityProvider form={activeForm}>
      {activeTab === 0 && (
        <Suspense fallback={<Box sx={{ p: 4, textAlign: 'center' }}><Typography>Loading EC/pH Dashboard...</Typography></Box>}>
          <EcphDashboard
            fieldId={filters.field || ''}
            siteId={filters.site || activeSiteId || ''}
            dateFrom={seasonFrom || ''}
            dateTo={seasonTo || ''}
            allFields={allFields}
          />
        </Suspense>
      )}

      {activeTab === 1 && (
        <Suspense fallback={<Box sx={{ p: 4, textAlign: 'center' }}><Typography>Loading Fertigation Dashboard...</Typography></Box>}>
          <FertigationDashboard
            fieldId={filters.field || ''}
            siteId={filters.site || activeSiteId || ''}
            dateFrom={seasonFrom || ''}
            dateTo={seasonTo || ''}
            allFields={allFields}
          />
        </Suspense>
      )}

      {activeTab === 2 && (
        <Suspense fallback={<Box sx={{ p: 4, textAlign: 'center' }}><Typography>Loading Irrigation Dashboard...</Typography></Box>}>
          <IrrigationDashboard
            fieldId={filters.field || ''}
            siteId={filters.site || activeSiteId || ''}
            dateFrom={seasonFrom || ''}
            dateTo={seasonTo || ''}
            allFields={allFields}
          />
        </Suspense>
      )}

      {activeTab === 3 && (
        <Suspense fallback={<Box sx={{ p: 4, textAlign: 'center' }}><Typography>Loading Harvest Dashboard...</Typography></Box>}>
          <HarvestDashboard
            fieldId={filters.field || ''}
            siteId={filters.site || activeSiteId || ''}
            dateFrom={seasonFrom || ''}
            dateTo={seasonTo || ''}
            allFields={allFields}
          />
        </Suspense>
      )}
      </FormIdentityProvider>
    </Box>
  );
}

export default Dashboard;
