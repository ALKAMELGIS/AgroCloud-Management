import {
  toNum, sum, filterByDateRange, getPreviousPeriod,
  pctChange, formatDelta, topN,
} from '../executiveReportUtils';

function flattenFertigationEntries(entries, fieldInfoMap) {
  const rows = [];
  entries.forEach((entry) => {
    const fieldInfo = fieldInfoMap[entry.fieldId] || {};
    const fieldLabel = entry.fieldName || fieldInfo.name || entry.fieldId;
    const fertilizers = entry.fertilizers || {};
    const fertilizerNames = Object.keys(fertilizers);

    const base = {
      date: entry.date,
      field: fieldLabel,
      fieldId: entry.fieldId,
      recipeName: entry.recipeName || entry.recipe_name || '—',
      dailyWater: toNum(entry.dailyWater),
      totalFertilizer: toNum(entry.totalFertilizer),
      flowRate: toNum(entry.flowRate),
    };

    if (fertilizerNames.length === 0) {
      rows.push({ ...base, fertilizer: null, amount: 0 });
    } else {
      fertilizerNames.forEach((name) => {
        rows.push({ ...base, fertilizer: name, amount: toNum(fertilizers[name]) });
      });
    }
  });
  return rows;
}

function aggregate(entries, fieldInfoMap) {
  const rows = flattenFertigationEntries(entries, fieldInfoMap);
  const uniqueEntries = new Set(entries.map((e) => `${e.date}|${e.fieldId}`)).size;
  const fieldsActive = new Set(entries.map((e) => e.fieldId)).size;

  const totalWater = sum(entries.map((e) => toNum(e.dailyWater)));
  const totalFertilizer = sum(entries.map((e) => toNum(e.totalFertilizer)));

  const fertTotals = {};
  rows.forEach((r) => {
    if (r.fertilizer && r.amount > 0) {
      fertTotals[r.fertilizer] = (fertTotals[r.fertilizer] || 0) + r.amount;
    }
  });

  const byFieldWater = {};
  const byFieldFert = {};
  const recipeCounts = {};
  entries.forEach((e) => {
    const field = fieldInfoMap[e.fieldId]?.name || e.fieldName || e.fieldId;
    byFieldWater[field] = (byFieldWater[field] || 0) + toNum(e.dailyWater);
    byFieldFert[field] = (byFieldFert[field] || 0) + toNum(e.totalFertilizer);
    const recipe = e.recipeName || e.recipe_name || 'Unknown';
    recipeCounts[recipe] = (recipeCounts[recipe] || 0) + 1;
  });

  const daysWithData = new Set(entries.map((e) => (e.date || '').split('T')[0])).size;

  return {
    rows,
    entryCount: uniqueEntries,
    fieldsActive,
    totalWater,
    totalFertilizer,
    avgDailyWater: daysWithData > 0 ? totalWater / daysWithData : null,
    fertTotals,
    byFieldWater,
    byFieldFert,
    recipeCounts,
    daysWithData,
  };
}

function buildTopFive(agg) {
  const fieldWater = Object.entries(agg.byFieldWater)
    .map(([field, total]) => ({ field, total }))
    .sort((a, b) => b.total - a.total);

  const fieldFert = Object.entries(agg.byFieldFert)
    .map(([field, total]) => ({ field, total }))
    .sort((a, b) => b.total - a.total);

  const fertilizers = Object.entries(agg.fertTotals)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const recipes = Object.entries(agg.recipeCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return [
    {
      title: 'Top Fields by Water (m³)',
      items: topN(fieldWater).map((f) => ({
        label: f.field,
        value: f.total.toFixed(1),
        subtitle: 'total water',
      })),
    },
    {
      title: 'Top Fields by Fertilizer (kg)',
      items: topN(fieldFert).map((f) => ({
        label: f.field,
        value: f.total.toFixed(1),
        subtitle: 'total fertilizer',
      })),
    },
    {
      title: 'Top Fertilizers Used (kg)',
      items: topN(fertilizers).map((f) => ({
        label: f.name,
        value: f.total.toFixed(1),
        subtitle: 'total applied',
      })),
    },
    {
      title: 'Most Used Recipes',
      items: topN(recipes).map((r) => ({
        label: r.name,
        value: String(r.count),
        subtitle: 'applications',
      })),
    },
  ];
}

function buildInsights(current, allFieldCount) {
  const insights = [];

  if (current.entryCount === 0) {
    insights.push({ type: 'info', message: 'No fertigation entries recorded for this period.' });
    return insights;
  }

  insights.push({
    type: 'success',
    message: `${current.totalFertilizer.toFixed(0)} kg fertilizer applied via ${current.totalWater.toFixed(1)} m³ fertigation water across ${current.fieldsActive} field(s).`,
  });

  const topFert = Object.entries(current.fertTotals).sort((a, b) => b[1] - a[1])[0];
  if (topFert) {
    const pct = current.totalFertilizer > 0 ? (topFert[1] / current.totalFertilizer) * 100 : 0;
    insights.push({
      type: 'info',
      message: `${topFert[0]} was the leading fertilizer (${pct.toFixed(0)}% of total use).`,
    });
  }

  if (allFieldCount > 0 && current.fieldsActive < allFieldCount) {
    insights.push({
      type: 'warning',
      message: `${allFieldCount - current.fieldsActive} field(s) had no fertigation logs — coverage ${current.fieldsActive}/${allFieldCount}.`,
    });
  }

  if (current.daysWithData > 0 && current.daysWithData < 5) {
    insights.push({
      type: 'warning',
      message: `Fertigation logged on only ${current.daysWithData} day(s) — verify logging frequency meets crop requirements.`,
    });
  }

  return insights;
}

function buildHighlights(current, entries, fieldInfoMap) {
  const out = [];
  if (current.entryCount === 0) return out;
  const fert = Object.entries(current.fertTotals).sort((a, b) => b[1] - a[1]);
  if (fert.length) {
    const [name, v] = fert[0];
    out.push({
      id: 'fert', icon: 'fert', tone: 'info', label: 'Leading fertilizer', value: name,
      note: `${Math.round(v).toLocaleString('en-US')} kg · ${current.totalFertilizer > 0 ? Math.round((v / current.totalFertilizer) * 100) : 0}% of all fertilizer`,
      detail: { title: 'Fertilizer used', items: fert.slice(0, 10).map(([l, val]) => ({ label: l, value: val, unit: 'kg' })) },
    });
  }
  out.push({
    id: 'days', icon: 'calendar', tone: current.daysWithData >= 5 ? 'good' : 'watch', label: 'Days logged', value: String(current.daysWithData),
    note: current.daysWithData >= 5 ? 'Fertigation recorded regularly' : 'Few days logged: check the record',
    detail: { title: 'Recipes used', items: Object.entries(current.recipeCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l, val]) => ({ label: l, value: val, unit: 'entries' })) },
  });
  const scope = Object.entries(fieldInfoMap);
  if (scope.length) {
    const active = new Set(entries.map((e) => e.fieldId));
    const idle = scope.filter(([id]) => !active.has(id)).map(([, f]) => f.name).sort();
    out.push({
      id: 'idle', icon: 'idle', tone: idle.length ? 'watch' : 'good', label: 'Fields without fertigation', value: String(idle.length),
      note: `${scope.length - idle.length} of ${scope.length} fields fed`,
      detail: { title: idle.length ? 'No fertigation in this period' : 'Every field was fed', items: idle.map((n) => ({ label: n })) },
    });
  }
  return out;
}

function buildSummary(current, prevAgg) {
  if (current.entryCount === 0) {
    return 'No fertigation activity was recorded for the selected period.';
  }

  const parts = [
    `${current.entryCount} fertigation application(s) across ${current.fieldsActive} field(s), totalling ${current.totalWater.toFixed(1)} m³ water and ${current.totalFertilizer.toFixed(0)} kg fertilizer.`,
  ];

  if (prevAgg.entryCount > 0) {
    const waterDelta = pctChange(current.totalWater, prevAgg.totalWater);
    if (waterDelta != null && Math.abs(waterDelta) >= 5) {
      parts.push(`Water use ${waterDelta >= 0 ? 'up' : 'down'} ${Math.abs(waterDelta).toFixed(0)}% vs the previous period.`);
    }
  }

  return parts.join(' ');
}

export function buildFertigationExecutiveReport(entries, fieldInfoMap, dateFrom, dateTo) {
  const filtered = filterByDateRange(entries, dateFrom, dateTo);
  const current = aggregate(filtered, fieldInfoMap);
  const allFieldCount = Object.keys(fieldInfoMap).length;

  const prev = getPreviousPeriod(dateFrom, dateTo);
  const prevAgg = aggregate(filterByDateRange(entries, prev.from, prev.to), fieldInfoMap);

  const kpis = [
    {
      icon: 'fertEntry',
      title: 'Applications',
      value: String(current.entryCount),
      subtitle: `${current.fieldsActive} fields`,
      color: '#333',
    },
    {
      icon: 'water',
      title: 'Total Water',
      value: `${current.totalWater.toFixed(1)} m³`,
      delta: formatDelta(pctChange(current.totalWater, prevAgg.totalWater)),
      color: '#1976d2',
    },
    {
      icon: 'fert',
      title: 'Total Fertilizer',
      value: `${current.totalFertilizer.toFixed(0)} kg`,
      delta: formatDelta(pctChange(current.totalFertilizer, prevAgg.totalFertilizer)),
      color: '#1f7a4d',
    },
    {
      icon: 'average',
      title: 'Avg Daily Water',
      value: current.avgDailyWater != null ? `${current.avgDailyWater.toFixed(1)} m³` : '—',
      subtitle: 'on logged days',
      color: '#2f6aa8',
    },
  ];

  return {
    kpis,
    summary: buildSummary(current, prevAgg),
    insights: buildInsights(current, allFieldCount),
    highlights: buildHighlights(current, filtered, fieldInfoMap),
    topFive: buildTopFive(current),
    hasData: current.entryCount > 0,
  };
}
