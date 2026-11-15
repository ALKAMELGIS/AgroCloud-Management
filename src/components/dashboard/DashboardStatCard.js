import { Box, Paper, Typography } from '@mui/material';
import { useFormIdentity } from '../../theme/formIdentity';

/**
 * KPI tile: small label, large tabular value, optional caption. On a form page
 * the first tile (`lead`) carries the form colour; `color` is kept for old callers
 * but no longer paints anything, so tiles never compete with the charts.
 */
// eslint-disable-next-line no-unused-vars
export default function DashboardStatCard({ title, value, subtitle, color, lead }) {
  const form = useFormIdentity();
  return (
    <Paper
      variant="outlined"
      sx={{
        height: '100%',
        overflow: 'hidden',
        boxShadow: 1,
        position: 'relative',
        transition: 'border-color 200ms ease',
        '&:hover': { borderColor: 'border.strong' },
        ...(lead && form ? { boxShadow: `inset 4px 0 0 ${form.base}` } : {}),
      }}
    >
      <Box sx={{ px: { xs: 4, sm: 5 }, py: { xs: 3.5, sm: 4.5 } }}>
        <Typography
          component="p"
          sx={{
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'none',
            letterSpacing: 0,
            color: 'text.secondary',
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          {title}
        </Typography>
        <Typography
          component="p"
          sx={{
            fontSize: { xs: '1.375rem', sm: '1.625rem' },
            fontWeight: 600,
            lineHeight: 1.15,
            letterSpacing: '-0.025em',
            color: 'text.primary',
            fontVariantNumeric: 'tabular-nums',
            wordBreak: 'break-word',
          }}
        >
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>{subtitle}</Typography>
        )}
      </Box>
    </Paper>
  );
}
