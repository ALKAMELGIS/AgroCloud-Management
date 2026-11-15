import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Checkbox, FormControlLabel, Typography, Box, Alert, CircularProgress,
} from '@mui/material';
import { apiRequest } from '../../utils/api';
import { useIsArabic } from '../../i18n/shellLabels';

const SUB_NAME = { 1: ['Greenhouse', 'بيت محمي'], 2: ['Nethouse', 'بيت شبكي'], 3: ['Open field', 'حقل مكشوف'], 4: ['Pivot', 'محوري'], 5: ['Nursery bed', 'مشتل'], none: ['No subtype', 'بدون نوع'] };

/**
 * One-time copy of the shapes of the linked ArcGIS layer into AgroCloud.
 * "Check" is a dry run on the server (nothing saved); "Import" saves.
 */
export default function ArcgisImportDialog({ open, onClose, onDone }) {
  const isAr = useIsArabic();
  const [overwrite, setOverwrite] = useState(false);
  const [buildParents, setBuildParents] = useState(true);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) { setReport(null); setError(''); } }, [open]);

  const run = async (dryRun) => {
    setBusy(true); setError('');
    try {
      const r = await apiRequest('/geo/import/arcgis', { method: 'POST', body: JSON.stringify({ dryRun, overwrite, buildParents }) });
      setReport(r);
      if (!dryRun) onDone?.(r);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const row = (label, value) => (
    <>
      <Typography component="dt" sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{label}</Typography>
      <Typography component="dd" sx={{ m: 0, fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </>
  );

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem' }}>{isAr ? 'استيراد الأشكال من ArcGIS' : 'Import shapes from ArcGIS'}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
          {isAr
            ? 'ينسخ أشكال الحقول المربوطة بطبقة ArcGIS (ZONE_ID + Farm_Code) إلى النظام مرة واحدة. بعدها تُعدَّل هنا، والطبقة لا تتغير.'
            : 'Copies the shapes of fields linked to the ArcGIS layer (ZONE_ID + Farm_Code) into AgroCloud once. After that they are edited here; the layer is not changed.'}
        </Typography>
        <Box sx={{ display: 'grid' }}>
          <FormControlLabel control={<Checkbox size="small" checked={buildParents} onChange={(e) => { setBuildParents(e.target.checked); setReport(null); }} />}
            label={<Typography sx={{ fontSize: '0.8125rem' }}>{isAr ? 'ارسم حدود مناطق المزرعة والمواقع والمناطق الفارغة من محتواها' : 'Outline empty farm areas, sites and zones from what lies inside them'}</Typography>} />
          <FormControlLabel control={<Checkbox size="small" checked={overwrite} onChange={(e) => { setOverwrite(e.target.checked); setReport(null); }} />}
            label={<Typography sx={{ fontSize: '0.8125rem' }}>{isAr ? 'استبدل الحقول المرسومة سابقاً' : 'Replace fields that already have a shape'}</Typography>} />
        </Box>
        {error && <Alert severity="error" sx={{ py: 0.5 }}>{error}</Alert>}
        {report && (
          <Box sx={{ border: 1, borderColor: 'divider', p: 2, display: 'grid', gap: 1.5 }}>
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>
              {report.dryRun ? (isAr ? 'نتيجة الفحص (لم يُحفظ شيء)' : 'Check result (nothing saved)') : (isAr ? 'تم الاستيراد' : 'Imported')}
            </Typography>
            <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', columnGap: 3, rowGap: 0.5 }}>
              {row(isAr ? 'حقول مربوطة بالطبقة' : 'Fields linked to the layer', report.candidates)}
              {row(isAr ? 'تُستورد' : 'Imported', report.imported)}
              {row(isAr ? 'مرسومة سابقاً، تُترك' : 'Already drawn, kept', report.skippedExisting)}
              {report.repaired > 0 && row(isAr ? 'أشكال صُححت' : 'Shapes repaired', report.repaired)}
              {buildParents && row(isAr ? 'حدود مناطق مزرعة / مواقع / مناطق' : 'Farm area / site / zone outlines', `${report.parents.farm_area} / ${report.parents.site} / ${report.parents.zone}`)}
              {Object.entries(report.bySubtype || {}).map(([k, n]) => row((SUB_NAME[k] || [k, k])[isAr ? 1 : 0], n))}
            </Box>
            {report.overlaps?.length > 0 && (
              <Alert severity="warning" sx={{ py: 0.5 }}>
                {isAr ? 'حدود متداخلة، عدّلها في الخريطة: ' : 'Overlapping outlines to fix on the map: '}<bdi dir="ltr">{report.overlaps.join(', ')}</bdi>
              </Alert>
            )}
            {report.candidates === 0 && (
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                {isAr ? 'لا حقول مربوطة. اربط الطبقة أولاً من تبويب إعداد GIS (فحص ثم حفظ وربط).' : 'No linked fields. Link the layer first in the GIS configuration tab (Check, then Save and link).'}
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button color="inherit" onClick={onClose} disabled={busy}>{report && !report.dryRun ? (isAr ? 'إغلاق' : 'Close') : (isAr ? 'إلغاء' : 'Cancel')}</Button>
        {!(report && !report.dryRun) && (
          <>
            <Button variant="outlined" onClick={() => run(true)} disabled={busy}>{isAr ? 'فحص' : 'Check'}</Button>
            <Button variant="contained" onClick={() => run(false)} disabled={busy || !report || report.imported + report.parents.farm_area + report.parents.site + report.parents.zone === 0}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}>
              {isAr ? 'استيراد' : 'Import'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
