import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, CircularProgress } from '@mui/material';

import { StandardChartGrid } from '../../components/dashboard/StandardChart';
import { fertigationCharts } from './standardChartSets';
import { fetchFertigationDashboardData } from './fertigationDashboardAdapter';
import { formatDate, toNumber } from './dashboardUtils';
import DashboardSection from '../../components/dashboard/DashboardSection';
import DashboardStatCard from '../../components/dashboard/DashboardStatCard';
import { excelTableSx, GutterCell } from '../../components/table/ExcelTable';

export default function FertigationDashboard({ fieldId, siteId, dateFrom, dateTo, allFields = [] }) {
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

    fetchFertigationDashboardData(params).then((items) => {
      if (!cancelled) { setData(items || []); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [fieldId, siteId, dateFrom, dateTo]);

  const fieldMap = useMemo(() => {
    const m = {};
    allFields.forEach(f => { m[f.id] = f.name; });
    return m;
  }, [allFields]);

  const stats = useMemo(() => {
    if (data.length === 0) return { count: 0, avgWater: '-', avgFlow: '-', totalFert: '-', avgFreq: '-', avgValves: '-' };
    const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '-';
    const sum = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0).toFixed(1) : '-';

    const waters = data.map(d => toNumber(d.dailyWater)).filter(v => v > 0);
    const flows = data.map(d => toNumber(d.flowRate)).filter(v => v > 0);
    const ferts = data.map(d => toNumber(d.totalFertilizer)).filter(v => v > 0);
    const freqs = data.map(d => toNumber(d.frequency)).filter(v => v > 0);
    const valves = data.map(d => toNumber(d.valvesCount)).filter(v => v > 0);

    return {
      count: data.length,
      avgWater: avg(waters),
      avgFlow: avg(flows),
      totalFert: sum(ferts),
      avgFreq: avg(freqs),
      avgValves: avg(valves),
    };
  }, [data]);

  const standardCharts = useMemo(() => fertigationCharts(data, (e) => fieldMap[e.fieldId] || e.fieldName || e.fieldId), [data, fieldMap]);

  const tableData = useMemo(() => {
    const rows = data.slice(0, 200).map(entry => ({
      date: formatDate(entry.date),
      rawDate: entry.date,
      fieldName: fieldMap[entry.fieldId] || entry.fieldId,
      weekNumber: entry.weekNumber ?? '-',
      flowRate: toNumber(entry.flowRate) || '-',
      frequency: entry.frequency ?? '-',
      valvesCount: entry.valvesCount ?? '-',
      dailyWater: toNumber(entry.dailyWater) || '-',
      totalFertilizer: toNumber(entry.totalFertilizer) || '-',
    }));
    if (!sortConfig.key) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortConfig.key], bv = b[sortConfig.key];
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av || '').localeCompare(String(bv || ''));
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
  }, [data, fieldMap, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  if (loading) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /><Typography sx={{ mt: 1 }}>Loading fertigation data...</Typography></Box>;
  }

  if (data.length === 0) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No fertigation data found for the selected filters.</Typography></Box>;
  }

  return (
    <Box>
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard lead title="Total fertiliser" value={stats.totalFert} subtitle="kg" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Average daily water" value={stats.avgWater} subtitle="m³" />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Average flow rate" value={stats.avgFlow} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Average frequency" value={stats.avgFreq} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Average valves" value={stats.avgValves} />
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <DashboardStatCard title="Entries" value={stats.count} />
        </Grid>
      </Grid>

      <StandardChartGrid charts={standardCharts} />

      <DashboardSection title="Recent entries">
        <TableContainer sx={{ maxHeight: 400 }}>
          <Table size="small" sx={excelTableSx}>
            <TableHead>
              <TableRow>
                <GutterCell />
                {[
                  { key: 'date', label: 'Date' },
                  { key: 'fieldName', label: 'Field' },
                  { key: 'weekNumber', label: 'Week' },
                  { key: 'flowRate', label: 'Flow Rate', numeric: true },
                  { key: 'frequency', label: 'Frequency', numeric: true },
                  { key: 'valvesCount', label: 'Valves', numeric: true },
                  { key: 'dailyWater', label: 'Daily Water (m³)', numeric: true },
                  { key: 'totalFertilizer', label: 'Total Fert (kg)', numeric: true },
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
                  <TableCell>{r.weekNumber}</TableCell>
                  <TableCell className="col-numeric">{r.flowRate}</TableCell>
                  <TableCell className="col-numeric">{r.frequency}</TableCell>
                  <TableCell className="col-numeric">{r.valvesCount}</TableCell>
                  <TableCell className="col-numeric">{r.dailyWater}</TableCell>
                  <TableCell className="col-numeric">{r.totalFertilizer}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {data.length > 200 && (
          <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1, display: 'block' }}>
            Showing 200 of {data.length} entries
          </Typography>
        )}
      </DashboardSection>
    </Box>
  );
}
