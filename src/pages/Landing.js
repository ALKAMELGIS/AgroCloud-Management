import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Button, Typography, Link } from '@mui/material';
import { keyframes } from '@mui/system';
import BrandLogo from '../components/BrandLogo';
import { useAuth } from '../contexts/AuthContext';

/*
 * Public landing page: the first screen of the online link. Quiet chrome, the
 * real product as the one bright element, and the form colours as the signature.
 */

const INK = '#13201a';
const SEC = '#4d5a52';
const MUTED = '#76827a';
const LINE = 'rgba(19, 32, 26, 0.09)';
const BG = '#f5f6f3';
const ACCENT = '#1f7a4d';

const rise = keyframes`from { opacity: 0; transform: translateY(24px); }`;
const motion = (delay = 0) => ({
  animation: `${rise} 0.7s cubic-bezier(.2,.8,.2,1) both`,
  animationDelay: `${delay}ms`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
});

const T = {
  en: {
    signIn: 'Sign in',
    openDemo: 'Open the demo',
    openSystem: 'Open the system',
    headline: 'Every reading from every field, in one place',
    sub: 'Record EC/pH, fertigation, irrigation and harvest in the field, read each form as clear charts, and follow every structure on the map.',
    formsTitle: 'One colour for each form',
    forms: [
      ['EC / pH', 'In and out, against the target band', '#0e8a87'],
      ['Fertigation', 'Fertiliser by field, recipe and week', '#6d4fc2'],
      ['Irrigation', 'Water and cycles by day and field', '#2f6fd0'],
      ['Harvest', 'Kilograms by field, crop and grade', '#c9562a'],
      ['Crop rotation', 'What grew where, season by season', '#2b8a3e'],
      ['Pump room', 'Readings from every pump room', '#5b6b75'],
    ],
    f1Title: 'Built for the field',
    f1Body: 'Each field is a card on the phone. Fill the readings, save them all at once, and keep working where the signal drops; entries are sent when the phone is back online.',
    f2Title: 'Maps and satellite',
    f2Body: 'Greenhouses, pivots and farm plots from the ArcGIS layer, with Sentinel-2 indexes like NDVI and moisture clipped to each structure or to an area you draw.',
    f3Title: 'Your data, where you work',
    f3Body: 'Each form has its own path for ArcGIS, Power BI or Excel, with its own read key, so other systems read the same records without copying them by hand.',
    ctaTitle: 'See it with your own fields',
    demoNote: 'The demo runs in your browser with sample readings.',
    rights: 'AgroCloud Management',
    lang: 'العربية',
  },
  ar: {
    signIn: 'تسجيل الدخول',
    openDemo: 'افتح النسخة التجريبية',
    openSystem: 'افتح النظام',
    headline: 'كل قراءة من كل حقل، في مكان واحد',
    sub: 'سجّل EC/pH والتسميد والري والحصاد من الحقل، واقرأ كل استمارة برسوم واضحة، وتابع كل منشأة على الخريطة.',
    formsTitle: 'لون خاص لكل استمارة',
    forms: [
      ['EC / pH', 'الداخل والخارج مقابل النطاق المستهدف', '#0e8a87'],
      ['التسميد', 'السماد حسب الحقل والوصفة والأسبوع', '#6d4fc2'],
      ['الري', 'المياه والدورات حسب اليوم والحقل', '#2f6fd0'],
      ['الحصاد', 'الكيلوغرامات حسب الحقل والمحصول والدرجة', '#c9562a'],
      ['الدورة الزراعية', 'ماذا زُرع وأين، موسماً بعد موسم', '#2b8a3e'],
      ['غرفة المضخات', 'قراءات كل غرفة مضخات', '#5b6b75'],
    ],
    f1Title: 'مصمم للعمل في الحقل',
    f1Body: 'كل حقل بطاقة على الهاتف. أدخل القراءات واحفظها دفعة واحدة، واستمر في العمل عند انقطاع الشبكة؛ تُرسل الإدخالات عند عودة الاتصال.',
    f2Title: 'الخرائط والأقمار الصناعية',
    f2Body: 'البيوت المحمية والـ Pivot وقطع المزرعة من طبقة ArcGIS، مع مؤشرات Sentinel-2 مثل NDVI والرطوبة مقصوصة على كل منشأة أو على منطقة ترسمها.',
    f3Title: 'بياناتك حيث تعمل',
    f3Body: 'لكل استمارة مسار خاص بها لـ ArcGIS وPower BI وExcel بمفتاح قراءة خاص، فتقرأ الأنظمة الأخرى السجلات نفسها دون نسخها يدوياً.',
    ctaTitle: 'جرّبه على حقولك',
    demoNote: 'النسخة التجريبية تعمل في متصفحك بقراءات تجريبية.',
    rights: 'AgroCloud Management',
    lang: 'English',
  },
};

const asset = (name) => `${process.env.PUBLIC_URL || ''}/landing/${name}`;

function Feature({ title, body, children, flip }) {
  return (
    <Box sx={{
      display: 'grid', gap: { xs: 3, md: 8 }, alignItems: 'center',
      gridTemplateColumns: { xs: '1fr', md: flip ? '1.1fr 1fr' : '1fr 1.1fr' },
    }}>
      <Box sx={{ order: { xs: 0, md: flip ? 1 : 0 }, maxWidth: 480 }}>
        <Typography component="h3" sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 600, color: INK, mb: 1.5, lineHeight: 1.25 }}>{title}</Typography>
        <Typography sx={{ fontSize: 16, color: SEC, lineHeight: 1.65 }}>{body}</Typography>
      </Box>
      <Box sx={{ order: { xs: 1, md: flip ? 0 : 1 } }}>{children}</Box>
    </Box>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const { isAuthenticated, login } = useAuth();
  const [opening, setOpening] = useState(false);
  const isAr = (i18n.language || '').startsWith('ar');
  const t = T[isAr ? 'ar' : 'en'];
  const lang = isAr ? 'ar' : 'en';
  const isDemo = typeof window !== 'undefined' && window.__AGRO_DEMO__ === true;

  const switchLanguage = () => {
    const code = isAr ? 'en' : 'ar';
    try { localStorage.setItem('agro_lang_picked', '1'); } catch { /* storage blocked */ }
    i18n.changeLanguage(code);
    document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = code;
  };

  const openDemo = async () => {
    setOpening(true);
    try {
      await login('demo@agrocloud.test', 'demo1234');
      navigate('/', { replace: true });
    } finally {
      setOpening(false);
    }
  };

  const primary = isAuthenticated
    ? { label: t.openSystem, onClick: () => navigate('/') }
    : isDemo
      ? { label: t.openDemo, onClick: openDemo }
      : { label: t.signIn, onClick: () => navigate('/login') };
  const showSignInLink = !isAuthenticated && isDemo;

  const btn = {
    height: 44, px: 2.5, borderRadius: '10px', textTransform: 'none', fontSize: 15, fontWeight: 500, boxShadow: 'none',
    '&:hover': { boxShadow: 'none' },
  };

  return (
    <Box dir={isAr ? 'rtl' : 'ltr'} sx={{ minHeight: '100vh', bgcolor: BG, color: INK }}>
      <Box component="header" sx={{ borderBottom: `1px solid ${LINE}`, bgcolor: 'rgba(245,246,243,0.92)', position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(8px)' }}>
        <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, md: 4 }, height: 64, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: 1, minWidth: 0 }}>
            <BrandLogo size={30} />
            <Typography sx={{ fontWeight: 600, fontSize: 17, whiteSpace: 'nowrap' }} translate="no">AgroCloud</Typography>
          </Box>
          <Link component="button" type="button" lang={isAr ? 'en' : 'ar'} onClick={switchLanguage} underline="hover"
            sx={{ color: SEC, fontSize: 14, fontWeight: 500 }}>{t.lang}</Link>
          {showSignInLink && (
            <Link component="button" type="button" onClick={() => navigate('/login')} underline="hover"
              sx={{ color: INK, fontSize: 14, fontWeight: 500, display: { xs: 'none', sm: 'inline' } }}>{t.signIn}</Link>
          )}
          <Button variant="contained" onClick={primary.onClick} disabled={opening}
            sx={{ ...btn, height: 38, px: 2, fontSize: 14, bgcolor: INK, '&:hover': { bgcolor: '#26352d', boxShadow: 'none' } }}>
            {primary.label}
          </Button>
        </Box>
      </Box>

      <Box role="main">
        <Box component="section" sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, md: 4 }, pt: { xs: 6, md: 10 } }}>
          <Box sx={{ maxWidth: 760, ...motion(0) }}>
            <Typography component="h1" sx={{
              fontSize: { xs: 34, sm: 44, md: 56 }, lineHeight: 1.08, fontWeight: 600,
              letterSpacing: isAr ? 0 : '-0.02em', color: INK,
            }}>
              {t.headline}
            </Typography>
            <Typography sx={{ mt: 2.5, fontSize: { xs: 16, md: 19 }, lineHeight: 1.6, color: SEC, maxWidth: 620 }}>{t.sub}</Typography>
            <Box sx={{ mt: 4, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <Button variant="contained" onClick={primary.onClick} disabled={opening}
                sx={{ ...btn, bgcolor: ACCENT, '&:hover': { bgcolor: '#165c3a', boxShadow: 'none' } }}>
                {primary.label}
              </Button>
              {showSignInLink && (
                <Button variant="outlined" onClick={() => navigate('/login')}
                  sx={{ ...btn, color: INK, borderColor: 'rgba(19,32,26,0.2)', '&:hover': { borderColor: INK, bgcolor: 'transparent' } }}>
                  {t.signIn}
                </Button>
              )}
            </Box>
            {isDemo && !isAuthenticated && (
              <Typography sx={{ mt: 1.5, fontSize: 13, color: MUTED }}>{t.demoNote}</Typography>
            )}
          </Box>

          <Box sx={{ mt: { xs: 6, md: 8 }, ...motion(200) }}>
            <Box sx={{
              borderRadius: { xs: '12px', md: '16px' }, overflow: 'hidden', bgcolor: '#fff',
              border: `1px solid ${LINE}`, boxShadow: '0 24px 60px -24px rgba(19,32,26,0.25), 0 2px 6px rgba(19,32,26,0.05)',
            }}>
              <Box sx={{ height: 36, display: 'flex', alignItems: 'center', gap: 0.75, px: 1.75, borderBottom: `1px solid ${LINE}`, bgcolor: '#fafbf9' }} dir="ltr">
                {['#0e8a87', '#6d4fc2', '#2f6fd0', '#c9562a'].map((c) => (
                  <Box key={c} sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: c }} />
                ))}
              </Box>
              <Box component="img" src={asset(`dashboard-${lang}.webp`)} alt={isAr ? 'لوحة تحليلات EC/pH في AgroCloud' : 'The EC/pH dashboard in AgroCloud'}
                width={1920} height={1200} sx={{ display: 'block', width: '100%', height: 'auto' }} />
            </Box>
          </Box>
        </Box>

        <Box component="section" sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, md: 4 }, pt: { xs: 9, md: 14 } }}>
          <Typography component="h2" sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 600, mb: { xs: 3, md: 4 } }}>{t.formsTitle}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, borderTop: `1px solid ${LINE}` }}>
            {t.forms.map(([name, line, color]) => (
              <Box key={name} sx={{ py: 2.5, pe: 3, borderBottom: `1px solid ${LINE}`, display: 'flex', gap: 1.5, alignItems: 'baseline' }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, flexShrink: 0, transform: 'translateY(-1px)' }} />
                <Box>
                  <Typography sx={{ fontSize: 16, fontWeight: 600 }}>{name}</Typography>
                  <Typography sx={{ fontSize: 14, color: SEC, mt: 0.25 }}>{line}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>

        <Box component="section" sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, md: 4 }, pt: { xs: 9, md: 14 }, display: 'grid', gap: { xs: 9, md: 14 } }}>
          <Feature title={t.f1Title} body={t.f1Body}>
            <Box sx={{ display: 'flex', justifyContent: 'center', bgcolor: '#e9ece7', borderRadius: '16px', pt: { xs: 4, md: 6 }, px: 2, overflow: 'hidden', height: { xs: 360, md: 440 } }}>
              <Box component="img" src={asset(`phone-${lang}.webp`)} alt={isAr ? 'إدخال EC/pH على الهاتف' : 'EC/pH entry on a phone'} loading="lazy"
                width={585} height={996}
                sx={{ width: { xs: 240, md: 290 }, height: 'auto', alignSelf: 'flex-start', borderRadius: '28px 28px 0 0', border: '6px solid #13201a', borderBottom: 0, bgcolor: '#fff' }} />
            </Box>
          </Feature>
          <Feature flip title={t.f2Title} body={t.f2Body}>
            <Box dir="ltr" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, p: 2, bgcolor: '#fff', border: `1px solid ${LINE}`, borderRadius: '16px' }}>
              {[
                ['NDVI', ['#d73027', '#fdae61', '#fee08b', '#a6d96a', '#1a9850']],
                ['NDMI', ['#cc4c02', '#fee391', '#c7e9b4', '#2c7fb8', '#253494']],
                ['BSI', ['#1a9850', '#91cf60', '#fee08b', '#fc8d59', '#d73027']],
              ].map(([name, ramp]) => (
                <Box key={name} sx={{ border: `1px solid ${LINE}`, borderRadius: '10px', p: 1.5 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 1 }} translate="no">{name}</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', height: 10, borderRadius: '3px', overflow: 'hidden' }}>
                    {ramp.map((c) => <Box key={c} sx={{ bgcolor: c }} />)}
                  </Box>
                </Box>
              ))}
              <Box sx={{ gridColumn: '1 / -1', mt: 1, fontFamily: 'var(--font-mono)', fontSize: 12, color: SEC, display: 'grid', gap: 0.5 }}>
                {['Agro_Structures · 1006 PIVOT', 'Agro_Structures · 1007 Farm Plots', 'Sentinel-2 L2A · clipped to AOI'].map((r) => (
                  <Box key={r} sx={{ py: 0.75, borderTop: `1px solid ${LINE}` }}>{r}</Box>
                ))}
              </Box>
            </Box>
          </Feature>
          <Feature title={t.f3Title} body={t.f3Body}>
            <Box dir="ltr" sx={{ bgcolor: '#fff', border: `1px solid ${LINE}`, borderRadius: '16px', p: 2, display: 'grid', gap: 1 }}>
              {[['EC / pH', '#0e8a87', 'feeds/ecph.geojson'], ['Fertigation', '#6d4fc2', 'feeds/fertigation.csv'], ['Harvest', '#c9562a', 'feeds/harvest.csv']].map(([n, c, path]) => (
                <Box key={n} sx={{ display: 'grid', gridTemplateColumns: '10px 110px 1fr', gap: 1.5, alignItems: 'center', p: 1.25, borderRadius: '10px', bgcolor: '#fafbf9', border: `1px solid ${LINE}` }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c }} />
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }} translate="no">{n}</Typography>
                  <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: SEC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/api/v1/{path}</Typography>
                </Box>
              ))}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', pt: 0.5 }}>
                {['ArcGIS', 'Power BI', 'Excel'].map((x) => (
                  <Box key={x} component="span" sx={{ fontSize: 12, fontWeight: 500, color: SEC, px: 1.25, py: 0.5, borderRadius: '6px', border: `1px solid ${LINE}` }}>{x}</Box>
                ))}
              </Box>
            </Box>
          </Feature>
        </Box>

        <Box component="section" sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, md: 4 }, py: { xs: 9, md: 14 } }}>
          <Box sx={{ bgcolor: INK, color: '#fff', borderRadius: '20px', px: { xs: 3, md: 6 }, py: { xs: 5, md: 7 }, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3 }}>
            <Typography component="h2" sx={{ fontSize: { xs: 26, md: 34 }, fontWeight: 600, flex: '1 1 320px', lineHeight: 1.2, color: '#fff' }}>{t.ctaTitle}</Typography>
            <Button variant="contained" onClick={primary.onClick} disabled={opening}
              sx={{ ...btn, bgcolor: '#f5f6f3', color: INK, '&:hover': { bgcolor: '#fff', boxShadow: 'none' } }}>
              {primary.label}
            </Button>
          </Box>
        </Box>
      </Box>

      <Box component="footer" sx={{ borderTop: `1px solid ${LINE}` }}>
        <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, md: 4 }, py: 3, display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <BrandLogo size={20} />
          <Typography sx={{ fontSize: 13, color: MUTED }} translate="no">{t.rights} · {new Date().getFullYear()}</Typography>
        </Box>
      </Box>
    </Box>
  );
}
