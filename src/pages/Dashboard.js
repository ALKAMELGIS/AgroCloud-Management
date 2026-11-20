import { useState, useEffect, useMemo, lazy, Suspense, useRef } from 'react';
import useSocket from '../hooks/useSocket';
import {
  Box,
  Typography,
  Chip,
  Paper,
  TextField,
  MenuItem,
  Button,
  Collapse,
} from '@mui/material';
import { CloseOutlined as CloseIcon, MapOutlined as MapIcon } from '@mui/icons-material';
import FieldMapPanel, { EMPTY_SLICE, STATUS_WORDS, fieldFacets, facetOptions, sliceIdsOf } from './dashboard/FieldMapPanel';
import { PeriodButton, BarSlicer, FormSegments } from './dashboard/BarControls';
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
  const [visitedTabs, setVisitedTabs] = useState([0]);
  useEffect(() => { setVisitedTabs((v) => (v.includes(activeTab) ? v : [...v, activeTab])); }, [activeTab]);
  const [selectedFieldObj, setSelectedFieldObj] = useState(null);
  const [formStats, setFormStats] = useState({}); // per-field totals each form dashboard reports, for the map
 // fields left by the map slicers (null = all)
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

  // Slicers live in the bar, so they filter every analysis with or without the map open.
  const [slice, setSlice] = useState(EMPTY_SLICE);
  const facets = useMemo(() => fieldFacets(fieldOverview, allFields, agronomicThresholds, seasonTo), [fieldOverview, allFields, agronomicThresholds, seasonTo]);
  const sliceOpts = useMemo(() => facetOptions(facets), [facets]);
  const sliceIds = useMemo(() => sliceIdsOf(facets, slice), [facets, slice]);

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
        {/* Site and season live in the sidebar on desktop; phones keep them here. */}
        <Box sx={{ display: { xs: 'flex', md: 'none' }, gap: 1, flexWrap: 'wrap' }}>
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
      </Box>

      {readOnly && <ReadOnlyBanner message="View only — dashboard data is read-only for your role." />}

      <FarmMonitor
        fieldOverview={fieldOverview}
        fieldIds={sliceIds}
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

      {/* One line: period · form · slicers · map. Labels sit inside the controls. */}
      <Paper variant="outlined" sx={{ mb: 4, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: { xs: 'wrap', lg: 'nowrap' }, gap: 2, px: 2, py: 2.5 }}>
          <PeriodButton from={seasonFrom} to={seasonTo} onFrom={setSeasonFrom} onTo={setSeasonTo} min={seasonStart} max={seasonEnd} />
          <FormSegments tabs={DASHBOARD_TABS} value={activeTab} onChange={setActiveTab} identity={FORM_IDENTITY} />
          <Box role="group" aria-label="Filters" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, ml: { lg: 'auto' }, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
            <BarSlicer label="Zone" options={sliceOpts.zone} value={slice.zone} onChange={(v) => setSlice((x) => ({ ...x, zone: v }))} />
            <BarSlicer label="Type" options={sliceOpts.type} value={slice.type} onChange={(v) => setSlice((x) => ({ ...x, type: v }))} />
            <BarSlicer label="Crop" options={sliceOpts.crop} value={slice.crop} onChange={(v) => setSlice((x) => ({ ...x, crop: v }))} />
            <BarSlicer label="Status" options={STATUS_WORDS} value={slice.status} onChange={(v) => setSlice((x) => ({ ...x, status: v }))} />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ml: 'auto', flexShrink: 0 }}>
            {selectedFieldObj ? (
              <Chip
                label={selectedFieldObj.name}
                onDelete={() => handleFieldSelect(null)}
                deleteIcon={<CloseIcon />}
                size="small"
                sx={{ height: 28, fontWeight: 600, bgcolor: 'table.headerBg', color: 'table.headerText', '& .MuiChip-deleteIcon': { color: 'table.headerText' } }}
              />
            ) : null}
            <Button
              size="small"
              variant={showMap ? 'contained' : 'outlined'}
              color="primary"
              startIcon={<MapIcon sx={{ fontSize: 18 }} />}
              onClick={toggleMap}
              aria-pressed={showMap}
              aria-controls="dashboard-map"
              disableElevation
              sx={{ height: 36, borderRadius: '9px', textTransform: 'none', fontWeight: 600, px: 2.5, minWidth: 0, whiteSpace: 'nowrap' }}
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
            slice={slice}
            onSliceChange={setSlice}
            agronomicThresholds={agronomicThresholds}
            dateTo={seasonTo}
            form={DASHBOARD_TABS[activeTab].key}
            formStats={formStats[DASHBOARD_TABS[activeTab].key]}
          />
        </Box>
      </Collapse>

      <Box ref={statsRef} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5, scrollMarginTop: 96 }}>
        <FormTile form={activeForm} />
        <Box>
          <Typography component="h2" sx={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>{activeForm.name}</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
            {selectedFieldObj ? selectedFieldObj.name : sliceIds ? `${sliceIds.length} filtered fields` : 'All fields'}{seasonFrom || seasonTo ? ` · ${seasonFrom || '…'} → ${seasonTo || '…'}` : ''}
          </Typography>
        </Box>
      </Box>

      <FormIdentityProvider form={activeForm}>
      {/* Tabs stay mounted once opened: switching back is instant, with no reload or jump. */}
      {[
        [0, EcphDashboard, 'EC/pH'], [1, FertigationDashboard, 'Fertigation'], [2, IrrigationDashboard, 'Irrigation'], [3, HarvestDashboard, 'Harvest'],
      ].filter(([i]) => visitedTabs.includes(i)).map(([i, Comp, name]) => (
        <Box key={i} hidden={activeTab !== i}
          sx={{ display: activeTab === i ? 'block' : 'none', animation: activeTab === i ? 'agroTabIn 200ms ease both' : 'none',
            '@keyframes agroTabIn': { from: { opacity: 0 }, to: { opacity: 1 } }, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }}>
          <Suspense fallback={<Box sx={{ minHeight: 600, p: 4, textAlign: 'center' }}><Typography color="text.secondary">Loading {name}…</Typography></Box>}>
            <Comp
              fieldId={filters.field || ''}
              fieldIds={sliceIds}
              siteId={filters.site || activeSiteId || ''}
              dateFrom={seasonFrom || ''}
              dateTo={seasonTo || ''}
              allFields={allFields}
              onFieldStats={(m) => setFormStats((x) => ({ ...x, [DASHBOARD_TABS[i].key]: m }))}
            />
          </Suspense>
        </Box>
      ))}
      </FormIdentityProvider>
    </Box>
  );
}

export default Dashboard;
