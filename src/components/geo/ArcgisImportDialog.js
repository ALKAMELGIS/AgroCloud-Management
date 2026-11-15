import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Checkbox, FormControlLabel, Typography, Box, Alert,
  CircularProgress, TextField, useMediaQuery, useTheme,
} from '@mui/material';
import { apiRequest } from '../../utils/api';
import { useIsArabic } from '../../i18n/shellLabels';

const AR_TYPES = {
  Greenhouse: 'بيت محمي', Nethouse: 'بيت شبكي', Glasshouse: 'بيت زجاجي', 'Retractable Roof Houses': 'بيت بسقف متحرك',
  Cravo: 'كرافو', 'Dates Farm': 'مزرعة نخيل', PIVOT: 'محوري', 'Farm Plots': 'قطع زراعية',
};

/**
 * Full import of the ArcGIS structures layer into the system's own geodatabase:
 *   ZONE_ID → zone · ZONE_ID + Site_Code / SITE → site · Structure_Type → farm area
 *   and subtype · ZONE_ID + Farm_Code → field (KeyID ZONE_ID-Farm_Code).
 * "Check" runs the whole import on the server and rolls it back; "Import" saves it.
 */
export default function ArcgisImportDialog({ open, onClose, onDone }) {
  const isAr = useIsArabic();
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [url, setUrl] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [buildParents, setBuildParents] = useState(true);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) { setReport(null); setError(''); } }, [open]);
  const reset = () => setReport(null);

  const run = async (dryRun) => {
    setBusy(true); setError('');
    try {
      const r = await apiRequest('/geo/import/arcgis', {
        method: 'POST', body: JSON.stringify({ url: url.trim() || null, dryRun, overwrite, buildParents }),
      });
      setReport(r);
      if (!dryRun) onDone?.(r);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const done = report && !report.dryRun;
  const changes = report ? report.zones.created + report.sites.created + report.farmAreas.created + report.fields.created
    + report.fields.moved + report.fields.rekeyed + report.shapes.imported + report.parents.farm_area + report.parents.site + report.parents.zone : 0;
  const n = (v) => Number(v || 0).toLocaleString(isAr ? 'ar-AE' : 'en-US');
  const line = (label, a, b) => (
    <Box component="tr" key={label}>
      <Box component="th" scope="row" sx={{ textAlign: 'start', fontWeight: 400, color: 'text.secondary', py: 0.75, pr: 2 }}>{label}</Box>
      <Box component="td" sx={{ textAlign: 'end', fontVariantNumeric: 'tabular-nums', py: 0.75, px: 1 }}>{a}</Box>
      <Box component="td" sx={{ textAlign: 'end', fontVariantNumeric: 'tabular-nums', py: 0.75, px: 1, color: 'text.secondary' }}>{b}</Box>
    </Box>
  );
  const iss = report?.issues;
  const problems = iss ? [
    iss.missingKeys ? (isAr ? `${n(iss.missingKeys)} بلا ZONE_ID أو Farm_Code (تُترك)` : `${n(iss.missingKeys)} without ZONE_ID or Farm_Code (skipped)`) : null,
    iss.noGeometry ? (isAr ? `${n(iss.noGeometry)} بلا شكل (تُترك)` : `${n(iss.noGeometry)} without a shape (skipped)`) : null,
    iss.duplicates?.length ? (isAr ? `${n(iss.duplicates.length)} مفتاح مكرر، أُضيف للثاني ProjectCode أو رقمه: ${iss.duplicates.slice(0, 8).join(', ')}` : `${n(iss.duplicates.length)} duplicate keys, the second one gets its ProjectCode or number: ${iss.duplicates.slice(0, 8).join(', ')}`) + (iss.duplicates.length > 8 ? ' …' : '') : null,
    iss.unknownStructure?.length ? (isAr ? `أنواع غير معروفة (منطقة باسمها، بلا نوع فرعي): ${iss.unknownStructure.join(', ')}` : `Unknown types (own farm area, no subtype): ${iss.unknownStructure.join(', ')}`) : null,
  ].filter(Boolean) : [];

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth fullScreen={isPhone}>
      <DialogTitle sx={{ fontSize: '1rem' }}>{isAr ? 'استيراد كامل من ArcGIS' : 'Full import from ArcGIS'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2.5, alignContent: 'start' }}>
        <Box component="ol" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, fontSize: '0.8125rem', color: 'text.secondary', '& b': { color: 'text.primary', fontWeight: 600 }, '& bdi': { whiteSpace: 'nowrap' } }}>
          <li><bdi dir="ltr"><b translate="no">ZONE_ID</b></bdi> {isAr ? '← المنطقة' : '→ zone'}</li>
          <li><bdi dir="ltr"><b translate="no">ZONE_ID + Site_Code / SITE</b></bdi> {isAr ? '← الموقع،' : '→ site;'} <bdi dir="ltr" translate="no">Not Applicable</bdi> {isAr ? '← «غير مخصص»' : '→ "Unassigned"'}</li>
          <li><bdi dir="ltr"><b translate="no">Structure_Type</b></bdi> {isAr ? '← منطقة المزرعة والنوع الفرعي' : '→ farm area and subtype'}</li>
          <li><bdi dir="ltr"><b translate="no">ZONE_ID + Farm_Code</b></bdi> {isAr ? '← الحقل، KeyID مثل' : '→ field; KeyID such as'} <bdi dir="ltr" translate="no">MH-GH-01</bdi></li>
        </Box>

        <TextField
          size="small" label={isAr ? 'رابط الطبقة' : 'Layer link'} value={url} onChange={(e) => { setUrl(e.target.value); reset(); }}
          placeholder="https://…/FeatureServer/21" inputProps={{ dir: 'ltr', spellCheck: false }}
          helperText={isAr ? 'اتركه فارغاً لاستخدام الطبقة المحفوظة في إعداد GIS' : 'Leave empty to use the layer saved in GIS configuration'}
        />

        <Box sx={{ display: 'grid' }}>
          <FormControlLabel control={<Checkbox size="small" checked={buildParents} onChange={(e) => { setBuildParents(e.target.checked); reset(); }} />}
            label={<Typography sx={{ fontSize: '0.8125rem' }}>{isAr ? 'ارسم حدود مناطق المزرعة والمواقع والمناطق مما بداخلها' : 'Outline farm areas, sites and zones from what lies inside them'}</Typography>} />
          <FormControlLabel control={<Checkbox size="small" checked={overwrite} onChange={(e) => { setOverwrite(e.target.checked); reset(); }} />}
            label={<Typography sx={{ fontSize: '0.8125rem' }}>{isAr ? 'استبدل الأشكال التي عُدّلت في النظام' : 'Replace shapes edited in AgroCloud'}</Typography>} />
        </Box>

        {error && <Alert severity="error" sx={{ py: 0.5 }}>{error}</Alert>}
        {busy && !report && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontSize: '0.8125rem', color: 'text.secondary' }}>
            <CircularProgress size={16} /> {isAr ? 'قراءة الطبقة وفحصها…' : 'Reading and checking the layer…'}
          </Box>
        )}

        {report && (
          <Box sx={{ border: 1, borderColor: 'divider', p: 2, display: 'grid', gap: 1.5 }}>
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>
              {done ? (isAr ? 'تم الاستيراد' : 'Imported') : (isAr ? 'نتيجة الفحص، لم يُحفظ شيء' : 'Check result, nothing saved')}
              <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}> · {n(report.features)} {isAr ? 'عنصر' : 'features'}</Box>
            </Typography>
            {report.layer?.source && (
              <Typography sx={{ fontSize: '0.75rem', color: report.layer.source === 'sample' ? 'warning.dark' : 'text.secondary' }}>
                {{
                  live: isAr ? 'المصدر: الطبقة على ArcGIS Online مباشرة' : 'Source: the layer on ArcGIS Online, live',
                  copy: isAr ? 'المصدر: نسخة من الطبقة محفوظة مع التطبيق (15 نوفمبر 2026)، لأن ArcGIS غير متاح من هنا' : 'Source: copy of the layer shipped with the app (15 Nov 2026); ArcGIS is not reachable from here',
                  sample: isAr ? 'تنبيه: ArcGIS غير متاح، هذه أشكال نموذجية وليست الطبقة' : 'Warning: ArcGIS is not reachable; these are sample shapes, not the layer',
                }[report.layer.source]}
              </Typography>
            )}
            <Box component="table" sx={{ borderCollapse: 'collapse', fontSize: '0.8125rem', width: '100%', '& tr + tr > *': { borderTop: 1, borderColor: 'divider' } }}>
              <Box component="thead">
                <Box component="tr">
                  <Box component="th" />
                  <Box component="th" scope="col" sx={{ textAlign: 'end', fontWeight: 600, fontSize: '0.75rem', px: 1, pb: 0.5 }}>{isAr ? 'جديد' : 'New'}</Box>
                  <Box component="th" scope="col" sx={{ textAlign: 'end', fontWeight: 600, fontSize: '0.75rem', px: 1, pb: 0.5 }}>{isAr ? 'موجود' : 'Existing'}</Box>
                </Box>
              </Box>
              <Box component="tbody">
                {line(isAr ? 'المناطق' : 'Zones', n(report.zones.created), n(report.zones.matched))}
                {line(isAr ? 'المواقع' : 'Sites', n(report.sites.created), n(report.sites.matched))}
                {line(isAr ? 'مناطق المزرعة' : 'Farm areas', n(report.farmAreas.created), n(report.farmAreas.matched))}
                {line(isAr ? 'الحقول' : 'Fields', n(report.fields.created), n(report.fields.matched + report.fields.adopted))}
              </Box>
            </Box>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, fontSize: '0.8125rem' }}>
              <li>{isAr ? `${n(report.shapes.imported)} شكل حقل يُستورد` : `${n(report.shapes.imported)} field shapes imported`}
                {report.shapes.keptEdited ? (isAr ? `، ${n(report.shapes.keptEdited)} معدّل في النظام يُترك` : `, ${n(report.shapes.keptEdited)} edited in AgroCloud kept`) : ''}
                {report.shapes.repaired ? (isAr ? `، ${n(report.shapes.repaired)} صُحح` : `, ${n(report.shapes.repaired)} repaired`) : ''}</li>
              {report.fields.adopted > 0 && <li>{isAr ? `${n(report.fields.adopted)} حقل مُدخل يدوياً رُبط بالطبقة بالاسم` : `${n(report.fields.adopted)} hand-entered fields linked by name`}{report.fields.rekeyed ? (isAr ? ` وأخذ KeyID الطبقة` : ', given the layer KeyID') : ''}</li>}
              {report.fields.moved > 0 && <li>{isAr ? `${n(report.fields.moved)} حقل نُقل إلى منطقة نوعه` : `${n(report.fields.moved)} fields moved to the farm area of their type`}</li>}
              {buildParents && <li>{isAr ? `حدود: ${n(report.parents.farm_area)} منطقة مزرعة، ${n(report.parents.site)} موقع، ${n(report.parents.zone)} منطقة` : `Outlines: ${n(report.parents.farm_area)} farm areas, ${n(report.parents.site)} sites, ${n(report.parents.zone)} zones`}</li>}
              {iss?.noFarmCode > 0 && <li>{isAr ? `${n(iss.noFarmCode)} بلا Farm_Code ← KeyID من Farm_Name (أو ProjectCode)` : `${n(iss.noFarmCode)} without Farm_Code → KeyID from Farm_Name (or ProjectCode)`}</li>}
              {iss?.noZone > 0 && <li>{isAr ? `${n(iss.noZone)} بلا ZONE_ID ← منطقة لكل دولة: ` : `${n(iss.noZone)} without ZONE_ID → one zone per country: `}
                {Object.entries(iss.noZoneByCountry || {}).map(([k, v]) => `${k} ${n(v)}`).join(isAr ? '، ' : ', ')}
                {iss.countryFromLocation ? (isAr ? ` (الدولة لـ ${n(iss.countryFromLocation)} من موقع الشكل لأنها فارغة)` : ` (country of ${n(iss.countryFromLocation)} taken from where the shape lies, as it is empty)`) : ''}</li>}
              {iss?.notApplicable > 0 && <li>{isAr ? `${n(iss.notApplicable)} بلا موقع (Not Applicable) ← موقع «غير مخصص»` : `${n(iss.notApplicable)} without a site (Not Applicable) → "Unassigned" site`}</li>}
            </Box>
            {Object.keys(report.bySubtype || {}).length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {Object.entries(report.bySubtype).map(([code, s]) => (
                  <Box key={code} sx={{ fontSize: '0.75rem', border: 1, borderColor: 'divider', px: 1, py: 0.25 }}>
                    {isAr ? (AR_TYPES[s.name] || s.name) : s.name} <bdi style={{ color: 'var(--sheet-ink-3)' }}>{n(s.count)}</bdi>
                  </Box>
                ))}
              </Box>
            )}
            {problems.length > 0 && (
              <Alert severity="warning" sx={{ py: 0.5 }}>{problems.map((t) => <div key={t}>{t}</div>)}</Alert>
            )}
            {report.overlaps?.length > 0 && (
              <Alert severity="info" sx={{ py: 0.5 }}>
                {isAr ? 'حدود متداخلة، عدّلها في الخريطة: ' : 'Overlapping outlines to fix on the map: '}<bdi dir="ltr">{report.overlaps.join(', ')}</bdi>
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button color="inherit" onClick={onClose} disabled={busy}>{done ? (isAr ? 'إغلاق' : 'Close') : (isAr ? 'إلغاء' : 'Cancel')}</Button>
        {!done && (
          <>
            <Button variant="outlined" onClick={() => run(true)} disabled={busy}>{isAr ? 'فحص' : 'Check'}</Button>
            <Button variant="contained" onClick={() => run(false)} disabled={busy || !report || changes === 0}
              startIcon={busy && report ? <CircularProgress size={16} color="inherit" /> : null}>
              {isAr ? 'استيراد' : 'Import'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
