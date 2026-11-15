import { Box } from '@mui/material';

/** The company mark (public/brand-logo.png, transparent background). */
export default function BrandLogo({ size = 32, sx }) {
  return (
    <Box component="img" src={`${process.env.PUBLIC_URL || ''}/brand-logo.png`} alt="AgroCloud"
      sx={{ width: size, height: size, objectFit: 'contain', display: 'block', ...sx }} />
  );
}
