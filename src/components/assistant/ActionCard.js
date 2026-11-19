import { useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import {
  AddTaskRounded as TaskIcon, CheckCircleRounded as DoneIcon, BlockRounded as CancelledIcon, ErrorOutlineRounded as FailedIcon,
} from '@mui/icons-material';
import * as api from './aiApi';

const STATUS = {
  done: { icon: DoneIcon, color: 'success.main', text: 'Done' },
  cancelled: { icon: CancelledIcon, color: 'text.secondary', text: 'Cancelled' },
  failed: { icon: FailedIcon, color: 'error.main', text: 'Failed' },
  expired: { icon: CancelledIcon, color: 'text.secondary', text: 'Expired — ask again' },
};

/**
 * A change the assistant proposed. Nothing happens until the user presses Confirm;
 * the server then runs it with the user's own permissions and writes the audit log.
 */
export default function ActionCard({ artifact }) {
  const [card, setCard] = useState(artifact);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const pending = card.status === 'pending';
  const st = STATUS[card.status];

  const decide = async (what) => {
    setBusy(what);
    setError(null);
    try {
      const out = await (what === 'confirm' ? api.confirmAction(card.id) : api.cancelAction(card.id));
      setCard((c) => ({ ...c, status: out.status, result: out.result }));
    } catch (e) {
      setError(e.message);
      if (/already|older than/.test(e.message)) setCard((c) => ({ ...c, status: /older/.test(e.message) ? 'expired' : c.status }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Box
      role="group"
      aria-label={card.title}
      sx={(t) => ({
        mt: 1.5, p: 2, borderRadius: '12px', bgcolor: 'background.paper',
        boxShadow: `0 0 0 1px ${pending ? alpha(t.palette.primary.main, 0.35) : t.palette.divider}`,
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.25 }}>
        <Box sx={(t) => ({ width: 28, height: 28, borderRadius: '8px', display: 'grid', placeItems: 'center', bgcolor: alpha(t.palette.primary.main, 0.1), color: 'primary.main', flexShrink: 0 })}>
          <TaskIcon sx={{ fontSize: 16 }} />
        </Box>
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, flex: 1, minWidth: 0 }}>{card.title}</Typography>
        {st ? (
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: st.color, fontSize: '0.75rem', fontWeight: 500 }}>
            <st.icon sx={{ fontSize: 16 }} />{st.text}
          </Box>
        ) : null}
      </Box>
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 0.5, fontSize: '0.8125rem' }}>
        {(card.lines || []).map(([k, v]) => (
          <Box key={k} sx={{ display: 'contents' }}>
            <Box component="dt" sx={{ color: 'text.secondary' }}>{k}</Box>
            <Box component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{v}</Box>
          </Box>
        ))}
      </Box>
      {pending ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.75 }}>
          <Button size="small" variant="contained" disableElevation onClick={() => decide('confirm')} disabled={Boolean(busy)}
            startIcon={busy === 'confirm' ? <CircularProgress size={14} color="inherit" /> : null} sx={{ minHeight: 34 }}>
            Confirm
          </Button>
          <Button size="small" onClick={() => decide('cancel')} disabled={Boolean(busy)} sx={{ minHeight: 34, color: 'text.secondary' }}>
            Cancel
          </Button>
          <Typography sx={{ ml: 'auto', fontSize: '0.75rem', color: 'text.secondary' }}>Nothing changes until you confirm</Typography>
        </Box>
      ) : null}
      {card.status === 'done' && card.result?.link ? (
        <Button component={RouterLink} to={card.result.link} size="small" sx={{ mt: 1.25, px: 0 }}>Open in Tasks</Button>
      ) : null}
      {error ? <Typography sx={{ mt: 1, fontSize: '0.75rem', color: 'error.main' }}>{error}</Typography> : null}
    </Box>
  );
}
