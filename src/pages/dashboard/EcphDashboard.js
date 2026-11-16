import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, CircularProgress } from '@mui/material';

import { listEcphAll } from '../../utils/backendApi';
import { StandardChartGrid } from '../../components/dashboard/StandardChart';
import { ecphCharts } from './standardChartSets';
import { formatDate, toNumber } from './dashboardUtils';
import DashboardSection from '../../components/dashboard/DashboardSection';
import DashboardStatCard from '../../components/dashboard/DashboardStatCard';
import { excelTableSx, GutterCell } from '../../components/table/ExcelTable';

import { BandRows } from '../../components/dashboard/clearCharts';

/** Default targets for drain water out of the root zone; shaded on the charts. */
export const ECPH_TARGETS = { ecOut: [1.8, 2.6], phOut: [5.5, 6.5] };

/** Mean of the last 7 days vs the 7 days before, per field, counted back from the latest reading. */
function lastTwoWeeksByField(rows, key) {
  const dates = rows.map((r) => (r.rawDate || '').toString().slice(0, 10)).filter(Boolean).sort();
  if (!dates.length) return [];
  const end = new Date(`${dates[dates.length - 1]}T00:00:00Z`).getTime();
  const day = 86400000;
  const acc = {};
  rows.forEach((r) => {
    const v = r[key];
    if (!(v > 0)) return;
    const t = new Date(`${(r.rawDate || '').toString().slice(0, 10)}T00:00:00Z`).getTime();
    const age = Math.floor((end - t) / day);
    if (age < 0 || age > 13) return;
    const f = (acc[r.fieldName] = acc[r.fieldName] || { now: [], prev: [] });
    (age < 7 ? f.now : f.prev).push(v);
  });
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  return Object.entries(acc)
    .map(([label, f]) => ({ label: String(label), now: mean(f.now), prev: mean(f.prev) }))
    .filter((r) => Number.isFinite(r.now))
    .sort((a, b) => b.now - a.now);
}

export default function EcphDashboard({ fieldId, siteId, dateFrom, dateTo, allFields = [] }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: 'date', dir: 'desc' });
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = {};
    if (siteId) params.site_id = siteId;
    if (fieldId) params.field_id = fieldId;
    if (dateFrom) params.start_date = dateFrom;
    if (dateTo) params.end_date = dateTo;

    listEcphAll(params).then((items) => {
      if (!cancelled) { setData(items || []); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [fieldId, siteId, dateFrom, dateTo]);

  const fieldMap = useMemo(() => {
    const m = {};
    allFields.forEach(f => { m[f.id] = f.name; });
    return m;
  }, [allFields]);

  const flatReadings = useMemo(() => {
    const rows = [];
    data.forEach(entry => {
      const valves = entry.valveReadings || entry.valves || [];
      const fieldName = fieldMap[entry.fieldId] || entry.fieldName || entry.fieldId;
      valves.forEach(v => {
        rows.push({
          date: formatDate(entry.date),
          rawDate: entry.date,
          time: entry.time || '',
          fieldName,
          fieldId: entry.fieldId,
          valve: v.valveNumber ?? v.valve_number,
          ecIn: toNumber(v.ecIn ?? v.ec_in),
          ecOut: toNumber(v.ec ?? v.ecOut ?? v.ec_out),
          phIn: toNumber(v.phIn ?? v.ph_in),
          phOut: toNumber(v.ph ?? v.phOut ?? v.ph_out),
          dripVol: toNumber(v.dripVolume ?? v.drip_volume),
          drainVol: toNumber(v.drain ?? v.drainVolume ?? v.drain_volume),
          percentDrain: toNumber(v.percentDrain ?? v.percent_drain),
        });
      });
    });
    return rows;
  }, [data, fieldMap]);

  const stats = useMemo(() => {
    if (flatReadings.length === 0) return { ecIn: '-', ecOut: '-', phIn: '-', phOut: '-', drain: '-', count: 0 };
    const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '-';
    const ecIns = flatReadings.map(r => r.ecIn).filter(v => v > 0);
    const ecOuts = flatReadings.map(r => r.ecOut).filter(v => v > 0);
    const phIns = flatReadings.map(r => r.phIn).filter(v => v > 0);
    const phOuts = flatReadings.map(r => r.phOut).filter(v => v > 0);
    const drains = flatReadings.map(r => r.percentDrain).filter(v => v > 0);
    return {
      ecIn: avg(ecIns), ecOut: avg(ecOuts),
      phIn: avg(phIns), phOut: avg(phOuts),
      drain: drains.length ? ((parseFloat(avg(drains)) * 100).toFixed(1) + '%') : '-',
      count: data.length,
    };
  }, [flatReadings, data.length]);

  const standardCharts = useMemo(() => ecphCharts(flatReadings, ECPH_TARGETS), [flatReadings]);

  const phByField = useMemo(() => (fieldId ? [] : lastTwoWeeksByField(flatReadings, 'phOut')), [flatReadings, fieldId]);
  const ecByField = useMemo(() => (fieldId ? [] : lastTwoWeeksByField(flatReadings, 'ecOut')), [flatReadings, fieldId]);
  const bandRange = (rows, band, pad) => {
    const vals = rows.flatMap((r) => [r.now, r.prev]).filter(Number.isFinite);
    const lo = Math.min(band[0] - pad, ...vals), hi = Math.max(band[1] + pad, ...vals);
    return [Math.floor(lo * 2) / 2, Math.ceil(hi * 2) / 2];
  };

  const tableData = useMemo(() => {
    const rows = flatReadings.slice(0, 200);
    if (!sortConfig.key) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortConfig.key], bv = b[sortConfig.key];
      const cmp = typeof av === 'number' ? av - bv : String(av || '').localeCompare(String(bv || ''));
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
  }, [flatReadings, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  if (loading) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /><Typography sx={{ mt: 1 }}>Loading EC/pH data...</Typography></Box>;
  }

  if (data.length === 0) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No EC/pH data found for the selected filters.</Typography></Box>;
  }

  return (
    <Box>
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard lead title="EC out" value={stats.ecOut} subtitle={`mS/cm · target ${ECPH_TARGETS.ecOut.join('–')}`} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="pH out" value={stats.phOut} subtitle={`target ${ECPH_TARGETS.phOut.join('–')}`} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="EC in" value={stats.ecIn} subtitle="mS/cm" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="pH in" value={stats.phIn} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Drain" value={stats.drain} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Entries" value={stats.count} />
        </Grid>
      </Grid>

      {phByField.length > 0 && (
        <Grid container spacing={2} sx={{ mb: { xs: 4, md: 5 } }}>
          <Grid size={{ xs: 12, lg: 6 }}>
            <DashboardSection title="Is pH out in the target band?" sx={{ mb: 0, height: '100%' }}>
              <Box sx={{ p: { xs: 3, sm: 4 } }}>
                <BandRows rows={phByField} band={ECPH_TARGETS.phOut} min={bandRange(phByField, ECPH_TARGETS.phOut, 0.5)[0]} max={bandRange(phByField, ECPH_TARGETS.phOut, 0.5)[1]} decimals={1} />
              </Box>
            </DashboardSection>
          </Grid>
          <Grid size={{ xs: 12, lg: 6 }}>
            <DashboardSection title="Is EC out in the target band?" sx={{ mb: 0, height: '100%' }}>
              <Box sx={{ p: { xs: 3, sm: 4 } }}>
                <BandRows rows={ecByField} band={ECPH_TARGETS.ecOut} min={bandRange(ecByField, ECPH_TARGETS.ecOut, 0.4)[0]} max={bandRange(ecByField, ECPH_TARGETS.ecOut, 0.4)[1]} decimals={2} unit="mS/cm" />
              </Box>
            </DashboardSection>
          </Grid>
        </Grid>
      )}

      <StandardChartGrid charts={standardCharts} />

      <DashboardSection title="Recent readings">
        {/* No readings: a message instead of an empty header with a scrollbar under it. */}
        {tableData.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 4, py: 6, textAlign: 'center' }}>
            No readings for this period and site
          </Typography>
        ) : (
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table size="small" sx={excelTableSx}>
            <TableHead>
              <TableRow>
                <GutterCell />
                {[
                  { key: 'date', label: 'Date' },
                  { key: 'fieldName', label: 'Field' },
                  { key: 'valve', label: 'Valve', numeric: true },
                  { key: 'ecIn', label: 'EC In', numeric: true },
                  { key: 'ecOut', label: 'EC Out', numeric: true },
                  { key: 'phIn', label: 'pH In', numeric: true },
                  { key: 'phOut', label: 'pH Out', numeric: true },
                  { key: 'dripVol', label: 'Drip Vol', numeric: true },
                  { key: 'drainVol', label: 'Drain Vol', numeric: true },
                  { key: 'percentDrain', label: '% Drain', numeric: true },
                ].map((col) => (
                  <TableCell key={col.key} className={col.numeric ? 'col-numeric' : undefined}>
                    <TableSortLabel
                      active={sortConfig.key === col.key}
                      direction={sortConfig.key === col.key ? sortConfig.dir : 'asc'}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {tableData.map((r, i) => (
                <TableRow key={i} hover>
                  <GutterCell index={i + 1} />
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.fieldName}</TableCell>
                  <TableCell className="col-numeric">{r.valve}</TableCell>
                  <TableCell className="col-numeric">{r.ecIn || '-'}</TableCell>
                  <TableCell className="col-numeric">{r.ecOut || '-'}</TableCell>
                  <TableCell className="col-numeric">{r.phIn || '-'}</TableCell>
                  <TableCell className="col-numeric">{r.phOut || '-'}</TableCell>
                  <TableCell className="col-numeric">{r.dripVol || '-'}</TableCell>
                  <TableCell className="col-numeric">{r.drainVol || '-'}</TableCell>
                  <TableCell className="col-numeric">{r.percentDrain ? `${(r.percentDrain * 100).toFixed(1)}%` : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        )}
        {flatReadings.length > 200 && (
          <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, display: 'block' }}>
            Showing 200 of {flatReadings.length} readings
          </Typography>
        )}
      </DashboardSection>
    </Box>
  );
}
