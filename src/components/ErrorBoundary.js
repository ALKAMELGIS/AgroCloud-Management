import { Component } from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { ErrorOutlineOutlined as ErrorIcon, RefreshOutlined as RefreshIcon } from '@mui/icons-material';
import { captureException } from '../utils/sentry';

/**
 * Saved view settings per page. A setting saved by an older version can break a
 * page after an update, so on a crash these are cleared once and the page retried.
 */
const PAGE_SETTINGS = [
  { route: /gis-map/, keys: (k) => k.startsWith('gis.') || k === 'agrocloud_gis_satellite' },
  { route: /dashboard/, keys: (k) => k.startsWith('agro_chart_') || k === 'agro_dash_map' || k.startsWith('fieldpick.') },
];

function currentRoute() {
  return `${window.location.pathname || ''}${window.location.hash || ''}`;
}

/** Clear the saved settings of the current page, once per session per page. True when cleared. */
function healPageSettings() {
  try {
    const route = currentRoute();
    const page = PAGE_SETTINGS.find((x) => x.route.test(route));
    if (!page) return false;
    const flag = `agro_heal_${page.route.source}`;
    if (sessionStorage.getItem(flag)) return false;
    sessionStorage.setItem(flag, '1');
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) { const k = localStorage.key(i); if (k && page.keys(k)) keys.push(k); }
    keys.forEach((k) => localStorage.removeItem(k));
    return keys.length > 0;
  } catch { return false; }
}

/**
 * Global error boundary – catches unhandled React errors and shows a
 * friendly fallback instead of a white screen.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // After an update, a page opened earlier asks for code files that no longer
    // exist. Reload once to fetch the new version instead of showing an error.
    const msg = `${error?.name || ''} ${error?.message || ''}`;
    if (/ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed/i.test(msg)) {
      try {
        const last = Number(sessionStorage.getItem('agro_chunk_reload') || 0);
        if (Date.now() - last > 30000) {
          sessionStorage.setItem('agro_chunk_reload', String(Date.now()));
          window.location.reload();
          return;
        }
      } catch { /* storage blocked: show the normal message */ }
    }
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, errorInfo);
    if (healPageSettings()) {
      this.setState({ hasError: false, error: null, errorInfo: null });
      return;
    }
    this.setState({ errorInfo });
    captureException(error, { componentStack: errorInfo?.componentStack });
  }

  handleReset = () => {
    try {
      const page = PAGE_SETTINGS.find((x) => x.route.test(currentRoute()));
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) { const k = localStorage.key(i); if (k && (!page || page.keys(k))) keys.push(k); }
      if (page) keys.forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            p: 3,
          }}
        >
          <Paper
            elevation={3}
            sx={{
              p: 5,
              maxWidth: 520,
              textAlign: 'center',
              borderRadius: 2,
            }}
          >
            <ErrorIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
            <Typography variant="h5" gutterBottom fontWeight={600}>
              Something went wrong
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              An unexpected error occurred. You can try refreshing the page or
              click the button below to retry.
            </Typography>
            {this.state.error && process.env.NODE_ENV !== 'development' && (
              <Typography component="p" sx={{ mb: 3, fontSize: 12, color: 'text.disabled', fontFamily: 'var(--font-mono, ui-monospace, monospace)', wordBreak: 'break-word' }}>
                {String(this.state.error?.message || this.state.error).slice(0, 200)}
              </Typography>
            )}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  mb: 2,
                  bgcolor: 'background.muted',
                  textAlign: 'left',
                  maxHeight: 200,
                  overflow: 'auto',
                }}
              >
                <Typography
                  variant="caption"
                  component="pre"
                  sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono, ui-monospace, monospace)', color: 'error.dark' }}
                >
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </Typography>
              </Paper>
            )}
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<RefreshIcon />}
                onClick={this.handleRetry}
              >
                Try Again
              </Button>
              <Button
                variant="outlined"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
              {PAGE_SETTINGS.some((x) => x.route.test(currentRoute())) && (
                <Button variant="text" onClick={this.handleReset}>
                  Reset page settings
                </Button>
              )}
            </Box>
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
