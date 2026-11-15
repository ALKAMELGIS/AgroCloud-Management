import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TableSortLabel, CircularProgress, IconButton,
} from '@mui/material';
import { ChevronLeftOutlined as ChevronLeft, ChevronRightOutlined as ChevronRight } from '@mui/icons-material';
import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts';
import { listRecipesAll } from '../../utils/backendApi';
import { fetchFertigationDashboardData } from './fertigationDashboardAdapter';
import { formatDate, toNumber } from './dashboardUtils';
import DashboardSection, { DashboardChartBody } from '../../components/dashboard/DashboardSection';
import DashboardStatCard from '../../components/dashboard/DashboardStatCard';
import { excelTableSx, GutterCell } from '../../components/table/ExcelTable';
import { CHART_TOOLTIP } from '../../components/dashboard/dashboardChartTheme';
import {
  RankBars, ShareBar, byWeek, gridProps, lineProps, useFormColors, xAxisProps, yAxisProps,
} from '../../components/dashboard/clearCharts';

export default function FertigationDashboard({ fieldId, siteId, dateFrom, dateTo, allFields = [] }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: 'date', dir: 'desc' });
  const [recipes, setRecipes] = useState([]);
  const form = useFormColors();
  const [chartOffset, setChartOffset] = useState(-1);

  useEffect(() => {
    listRecipesAll().then(items => setRecipes(items || [])).catch(() => {});
  }, []);

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

  const recipeMap = useMemo(() => {
    const m = {};
    recipes.forEach(r => { m[r.id] = r.name; });
    return m;
  }, [recipes]);

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

  const allTrendData = useMemo(() => {
    const byDate = {};
    data.forEach(entry => {
      const d = (entry.date || '').toString().split('T')[0];
      if (!d) return;
      if (!byDate[d]) byDate[d] = { water: [], fert: [], flow: [] };
      const w = toNumber(entry.dailyWater);
      if (w > 0) byDate[d].water.push(w);
      const f = toNumber(entry.totalFertilizer);
      if (f > 0) byDate[d].fert.push(f);
      const fl = toNumber(entry.flowRate);
      if (fl > 0) byDate[d].flow.push(fl);
    });
    const avg = (arr) => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null;
    const sum = (arr) => arr.length ? parseFloat(arr.reduce((a, b) => a + b, 0).toFixed(2)) : null;
    return Object.keys(byDate).sort().map(d => ({
      date: formatDate(d),
      dailyWater: sum(byDate[d].water),
      totalFertilizer: sum(byDate[d].fert),
      flowRate: avg(byDate[d].flow),
    }));
  }, [data]);

  const FERT_VISIBLE = 30;
  const fertEffectiveOffset = chartOffset < 0 ? Math.max(0, allTrendData.length - FERT_VISIBLE) : chartOffset;
  const trendData = allTrendData.slice(fertEffectiveOffset, fertEffectiveOffset + FERT_VISIBLE);
  const fertCanGoLeft = fertEffectiveOffset > 0;
  const fertCanGoRight = fertEffectiveOffset + FERT_VISIBLE < allTrendData.length;

  const fertCompositionData = useMemo(() => {
    const totals = {};
    data.forEach(entry => {
      if (entry.fertilizers && typeof entry.fertilizers === 'object') {
        Object.entries(entry.fertilizers).forEach(([name, qty]) => {
          const val = toNumber(qty);
          if (val > 0) totals[name] = (totals[name] || 0) + val;
        });
      }
    });
    return Object.entries(totals)
      .map(([name, total]) => ({ name, total: parseFloat(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);
  }, [data]);

  const recipeUsageData = useMemo(() => {
    const counts = {};
    data.forEach(entry => {
      if (entry.recipeId) {
        const name = recipeMap[entry.recipeId] || entry.recipeId;
        counts[entry.recipeId] = (counts[entry.recipeId] || { count: 0, name });
        counts[entry.recipeId].count += 1;
        if (recipeMap[entry.recipeId]) counts[entry.recipeId].name = recipeMap[entry.recipeId];
      }
    });
    return Object.values(counts)
      .map(r => ({ name: r.name, count: r.count }))
      .sort((a, b) => b.count - a.count);
  }, [data, recipeMap]);

  const fertPerFieldData = useMemo(() => {
    if (fieldId) return { chartData: [], fertNames: [] };
    const byField = {};
    const allFertNames = new Set();
    data.forEach(entry => {
      const name = fieldMap[entry.fieldId] || entry.fieldId;
      if (!byField[name]) byField[name] = {};
      if (entry.fertilizers && typeof entry.fertilizers === 'object') {
        Object.entries(entry.fertilizers).forEach(([fName, qty]) => {
          const val = toNumber(qty);
          if (val > 0) {
            byField[name][fName] = (byField[name][fName] || 0) + val;
            allFertNames.add(fName);
          }
        });
      }
    });
    const fertNames = [...allFertNames].sort();
    const chartData = Object.entries(byField).map(([field, ferts]) => {
      const row = { name: field };
      fertNames.forEach(fn => { row[fn] = parseFloat((ferts[fn] || 0).toFixed(2)); });
      return row;
    }).sort((a, b) => a.name.localeCompare(b.name));
    return { chartData, fertNames };
  }, [data, fieldId, fieldMap]);

  const weeklyData = useMemo(() => byWeek(data.map((e) => ({ date: e.date, value: toNumber(e.totalFertilizer) }))), [data]);

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

      <DashboardSection title="Fertiliser by day · kg">
        <DashboardChartBody
          height={300}
          footer={allTrendData.length > FERT_VISIBLE ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 1 }}>
              <IconButton disabled={!fertCanGoLeft} onClick={() => setChartOffset(Math.max(0, fertEffectiveOffset - 7))} size="small" aria-label="Previous">
                <ChevronLeft />
              </IconButton>
              <Typography variant="caption" color="text.secondary">
                {trendData[0]?.date} — {trendData[trendData.length - 1]?.date}
              </Typography>
              <IconButton disabled={!fertCanGoRight} onClick={() => setChartOffset(Math.min(allTrendData.length - FERT_VISIBLE, fertEffectiveOffset + 7))} size="small" aria-label="Next">
                <ChevronRight />
              </IconButton>
            </Box>
          ) : null}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <RTooltip contentStyle={CHART_TOOLTIP} cursor={{ fill: form.pale }} />
              <Bar dataKey="totalFertilizer" name="Fertiliser (kg)" fill={form.base} radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={800} />
            </BarChart>
          </ResponsiveContainer>
        </DashboardChartBody>
      </DashboardSection>

      <Grid container spacing={2} sx={{ mb: { xs: 4, md: 5 } }}>
        {fertCompositionData.length > 0 && (
          <Grid size={{ xs: 12, lg: 6 }}>
            <DashboardSection title="Which fertilisers · kg" sx={{ mb: 0, height: '100%' }}>
              <Box sx={{ p: { xs: 3, sm: 4 } }}>
                <RankBars items={fertCompositionData.map((r) => ({ label: r.name, value: r.total }))} showShare />
              </Box>
            </DashboardSection>
          </Grid>
        )}
        {!fieldId && fertPerFieldData.chartData.length > 0 && (
          <Grid size={{ xs: 12, lg: 6 }}>
            <DashboardSection title="Fertiliser per field · kg" sx={{ mb: 0, height: '100%' }}>
              <Box sx={{ p: { xs: 3, sm: 4 } }}>
                <RankBars items={fertPerFieldData.chartData.map((row) => ({
                  label: String(row.name),
                  value: Math.round(fertPerFieldData.fertNames.reduce((t, fn) => t + (Number(row[fn]) || 0), 0) * 10) / 10,
                }))} />
              </Box>
            </DashboardSection>
          </Grid>
        )}
      </Grid>

      <Grid container spacing={2} sx={{ mb: { xs: 4, md: 5 } }}>
        {weeklyData.length > 0 && (
          <Grid size={{ xs: 12, lg: recipeUsageData.length > 0 ? 7 : 12 }}>
            <DashboardSection title="Fertiliser by week · kg" sx={{ mb: 0, height: '100%' }}>
              <DashboardChartBody height={280}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="week" {...xAxisProps} />
                    <YAxis {...yAxisProps} />
                    <RTooltip contentStyle={CHART_TOOLTIP} cursor={{ fill: form.pale }} />
                    <Bar dataKey="value" name="Fertiliser (kg)" radius={[4, 4, 0, 0]} maxBarSize={44} animationDuration={800}>
                      {weeklyData.map((_, i) => <Cell key={i} fill={i === weeklyData.length - 1 ? form.dark : form.light} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </DashboardChartBody>
            </DashboardSection>
          </Grid>
        )}
        {recipeUsageData.length > 0 && (
          <Grid size={{ xs: 12, lg: weeklyData.length > 0 ? 5 : 12 }}>
            <DashboardSection title="Recipes used · entries" sx={{ mb: 0, height: '100%' }}>
              <Box sx={{ p: { xs: 3, sm: 4 } }}>
                <ShareBar items={recipeUsageData.map((r) => ({ label: r.name, value: r.count }))} />
              </Box>
            </DashboardSection>
          </Grid>
        )}
      </Grid>

      <DashboardSection title="Water by day · m³">
        <DashboardChartBody height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <RTooltip contentStyle={CHART_TOOLTIP} />
              <Line {...lineProps} dataKey="dailyWater" name="Water (m³)" stroke={form.base} />
            </LineChart>
          </ResponsiveContainer>
        </DashboardChartBody>
      </DashboardSection>

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
