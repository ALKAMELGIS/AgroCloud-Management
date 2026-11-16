import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, CircularProgress } from '@mui/material';

import { listHarvestsAll } from '../../utils/backendApi';
import { StandardChartGrid } from '../../components/dashboard/StandardChart';
import { harvestCharts } from './standardChartSets';
import { formatDate, toNumber } from './dashboardUtils';
import DashboardSection from '../../components/dashboard/DashboardSection';
import DashboardStatCard from '../../components/dashboard/DashboardStatCard';
import { excelTableSx, GutterCell } from '../../components/table/ExcelTable';

export default function HarvestDashboard({ fieldId, siteId, dateFrom, dateTo, allFields = [] }) {
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

    listHarvestsAll(params).then((items) => {
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
    if (data.length === 0) return { count: 0, totalKg: '0', avgPerEntry: '0', topCrop: '-' };
    const total = data.reduce((sum, d) => sum + toNumber(d.totalQuantity), 0);
    const cropTotals = {};
    data.forEach(d => {
      (d.varieties || []).forEach(v => {
        const name = v.variety || 'Unknown';
        cropTotals[name] = (cropTotals[name] || 0) + toNumber(v.quantity);
      });
    });
    const topCrop = Object.entries(cropTotals).sort((a, b) => b[1] - a[1])[0];

    return {
      count: data.length,
      totalKg: total.toLocaleString(undefined, { maximumFractionDigits: 1 }),
      avgPerEntry: (total / data.length).toFixed(1),
      topCrop: topCrop ? topCrop[0] : '-',
    };
  }, [data]);

  const standardCharts = useMemo(() => harvestCharts(data, (e) => fieldMap[e.fieldId] || e.fieldName || e.fieldId), [data, fieldMap]);

  const tableData = useMemo(() => {
    const rows = data.slice(0, 200).map(entry => {
      const varieties = entry.varieties || [];
      const mainVariety = varieties.length > 0 ? varieties[0] : {};
      return {
        date: formatDate(entry.date),
        rawDate: entry.date,
        fieldName: fieldMap[entry.fieldId] || entry.fieldName || entry.fieldId,
        cropName: mainVariety.variety || '-',
        quantity: toNumber(entry.totalQuantity),
        grade: mainVariety.grade || '-',
      };
    });
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
    return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /><Typography sx={{ mt: 1 }}>Loading harvest data...</Typography></Box>;
  }

  if (data.length === 0) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No harvest data found for the selected filters.</Typography></Box>;
  }

  return (
    <Box>
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <DashboardStatCard lead title="Total harvest" value={`${stats.totalKg} kg`} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <DashboardStatCard title="Entries" value={stats.count} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <DashboardStatCard title="Average per entry" value={`${stats.avgPerEntry} kg`} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <DashboardStatCard title="Top crop" value={stats.topCrop} />
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
                  { key: 'cropName', label: 'Crop / Variety' },
                  { key: 'quantity', label: 'Quantity (kg)', numeric: true },
                  { key: 'grade', label: 'Grade' },
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
                  <TableCell>{r.cropName}</TableCell>
                  <TableCell className="col-numeric">{r.quantity.toLocaleString()}</TableCell>
                  <TableCell>{r.grade}</TableCell>
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
