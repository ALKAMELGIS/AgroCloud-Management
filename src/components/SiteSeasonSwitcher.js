import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Chip,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ButtonBase,
  Popover,
} from '@mui/material';
import { PlaceOutlined as PlaceIcon, UnfoldMoreRounded as UnfoldIcon } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useActiveSeason } from '../contexts/ActiveSeasonContext';
import SiteZoneSelect from './SiteZoneSelect';
import { useNotification } from '../contexts/NotificationContext';
import { canManageSeasons } from '../utils/roleAccess';
import { apiRequest } from '../utils/api';
import { isSeasonLocked, farmTodayYmd, toSeasonYmd } from '../utils/seasonListDates';
import InfoNote from './InfoNote';

const END_SEASON_CONFIRM = 'END SEASON';

/**
 * Site and season live in the top bar as one quiet switcher ("MH · Site 1 · 2025-2026").
 * The pickers and the season actions open in a small popover, so the sidebar is only navigation.
 */
export default function SiteSeasonSwitcher() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const notify = useNotification();
  const [anchor, setAnchor] = useState(null);
  const { activeSiteId, activeSite, setActiveSiteId, countries, allowAllSites, hasSiteAssignment } = useActiveSite();
  const { activeSeasonId, activeSeason, setActiveSeasonId, seasons, isLoaded: seasonLoaded, reloadSeasons } = useActiveSeason();
  const canEndSeason = canManageSeasons(user);
  const [endSeasonOpen, setEndSeasonOpen] = useState(false);
  const [endConfirm, setEndConfirm] = useState('');
  const [endDate, setEndDate] = useState(() => farmTodayYmd());
  const [endingSeason, setEndingSeason] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [requestingReopen, setRequestingReopen] = useState(false);

  const handleEndSeason = async () => {
    if (!activeSeasonId || endConfirm !== END_SEASON_CONFIRM) return;
    const startDate = toSeasonYmd(activeSeason?.start_date ?? activeSeason?.startDate);
    const today = farmTodayYmd();
    if (!endDate || (startDate && endDate < startDate) || endDate > today) return;
    setEndingSeason(true);
    try {
      const result = await apiRequest(`/seasons/${activeSeasonId}/close`, {
        method: 'POST',
        body: JSON.stringify({ confirmation: END_SEASON_CONFIRM, endDate }),
      });
      reloadSeasons();
      setEndSeasonOpen(false);
      setEndConfirm('');
      notify.success(`${result?.closed?.name || 'Season'} closed.`);
    } catch (err) {
      notify.error(err.message || 'Could not end the season');
    } finally {
      setEndingSeason(false);
    }
  };

  const handleRequestReopen = async () => {
    if (!activeSeasonId || !reopenReason.trim()) return;
    setRequestingReopen(true);
    try {
      await apiRequest(`/seasons/${activeSeasonId}/reopen-request`, {
        method: 'POST',
        body: JSON.stringify({ reason: reopenReason.trim() }),
      });
      reloadSeasons();
      setReopenOpen(false);
      setReopenReason('');
      notify.success('Reopen requested. An auditor will review it.');
    } catch (err) {
      notify.error(err.message || 'Could not request a reopen');
    } finally {
      setRequestingReopen(false);
    }
  };

  const seasonStartDate = toSeasonYmd(activeSeason?.start_date ?? activeSeason?.startDate);
  const farmToday = farmTodayYmd();
  const endDateBackdated = Boolean(endDate && endDate < farmToday);
  const endDateInvalid = !endDate
    || (seasonStartDate && endDate < seasonStartDate)
    || endDate > farmToday;


  const hasSites = (countries || []).some((c) => c.sites?.length) || !hasSiteAssignment;
  if (!hasSites) return null;

  const siteText = activeSite
    ? [activeSite.zoneCode || activeSite.zone_code || activeSite.zoneName, activeSite.name].filter(Boolean).join(' · ')
    : (activeSiteId ? 'Site' : 'All sites');
  const seasonText = activeSeason?.name || '';
  const locked = activeSeason && activeSeason.status && activeSeason.status !== 'open';

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        aria-label={`Site and season: ${siteText}${seasonText ? `, ${seasonText}` : ''}`}
        sx={{
          height: 36,
          px: 2.5,
          gap: 2,
          borderRadius: '9px',
          minWidth: 0,
          maxWidth: { xs: 168, sm: 320 },
          color: 'text.primary',
          bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#ffffff'),
          boxShadow: '0 0 0 1px rgba(22,40,30,0.08)',
          transition: 'box-shadow 150ms ease',
          '&:hover': { boxShadow: '0 0 0 1px rgba(22,40,30,0.16)' },
          '&.Mui-focusVisible': { boxShadow: (t) => `0 0 0 2px ${t.palette.primary.main}` },
        }}
      >
        <PlaceIcon sx={{ fontSize: 16, color: 'primary.main', flexShrink: 0 }} />
        <Typography component="span" noWrap sx={{ fontSize: '0.8125rem', fontWeight: 500, minWidth: 0 }}>
          {siteText}
        </Typography>
        {seasonText ? (
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-flex' }, alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <Box component="span" sx={{ width: '1px', height: 16, bgcolor: 'divider' }} />
            <Typography component="span" noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {seasonText}
            </Typography>
            {locked ? <Box component="span" title={String(activeSeason.status).replace(/_/g, ' ')} sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'warning.main' }} /> : null}
          </Box>
        ) : null}
        <UnfoldIcon sx={{ fontSize: 16, color: 'text.secondary', flexShrink: 0 }} />
      </ButtonBase>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { mt: 2, width: 300, p: 4, borderRadius: '12px', boxShadow: '0 12px 32px rgba(22,40,30,0.12), 0 0 0 1px rgba(22,40,30,0.06)' } } }}
      >
          <SiteZoneSelect
            countries={countries}
            value={activeSiteId}
            onChange={setActiveSiteId}
            allowAllSites={allowAllSites}
            noAssignmentMessage={!hasSiteAssignment ? 'No site assigned — contact your manager.' : undefined}
          />
          {activeSiteId ? (
            <>
            <Typography component="span" sx={{ display: 'block', fontSize: '0.6875rem', color: 'text.secondary', mt: 1.5, mb: 0.5, px: 0.25 }}>
              Season
            </Typography>
            <TextField
              select
              size="small"
              fullWidth
              value={seasonLoaded ? (activeSeasonId || '') : ''}
              onChange={(e) => setActiveSeasonId(e.target.value)}
              disabled={!seasonLoaded || seasons.length === 0}
              SelectProps={{ inputProps: { 'aria-label': 'Season' } }}
              sx={{
                '& .MuiOutlinedInput-root': { bgcolor: 'background.muted', height: 36, borderRadius: 1.25 },
                '& .MuiSelect-select': { py: 0.75, fontSize: '0.8125rem', fontWeight: 600 },
              }}
            >
              {seasons.length === 0 ? (
                <MenuItem value="" sx={{ fontSize: '0.8125rem' }}>
                  {seasonLoaded ? 'No seasons' : 'Loading…'}
                </MenuItem>
              ) : seasons.map((season) => (
                <MenuItem key={season.id} value={season.id} sx={{ fontSize: '0.8125rem' }}>
                  {season.name}
                  {season.status && season.status !== 'open' ? ` (${String(season.status).replace(/_/g, ' ')})` : ''}
                </MenuItem>
              ))}
            </TextField>
            {seasonLoaded && canEndSeason && !seasons.some((season) => season.status === 'open') ? (
              <Button
                size="small"
                variant="text"
                fullWidth
                sx={{ mt: 0.5, fontSize: '0.75rem', fontWeight: 600 }}
                onClick={() => { setAnchor(null); navigate('/manage/seasons'); }}
              >
                Start a season
              </Button>
            ) : null}
            {seasonLoaded && seasons.length === 0 && !canEndSeason ? (
              <Button
                size="small"
                variant="text"
                fullWidth
                sx={{ mt: 0.5, fontSize: '0.75rem', fontWeight: 600 }}
                onClick={() => { setAnchor(null); navigate('/manage/seasons'); }}
              >
                Open Seasons
              </Button>
            ) : null}
            </>
          ) : null}
          {activeSiteId && canEndSeason && activeSeason?.status === 'open' ? (
            <Button
              size="small"
              color="warning"
              variant="outlined"
              fullWidth
              sx={{ mt: 1.5, fontSize: '0.75rem', fontWeight: 600 }}
              onClick={() => {
                setEndConfirm('');
                setEndDate(farmTodayYmd());
                setEndSeasonOpen(true);
                setAnchor(null);
              }}
            >
              End season
            </Button>
          ) : null}
          {activeSiteId && canEndSeason && activeSeason?.status === 'closed' && isSeasonLocked(activeSeason) ? (
            <Button
              size="small"
              color="primary"
              variant="outlined"
              fullWidth
              sx={{ mt: 1.5, fontSize: '0.75rem', fontWeight: 600 }}
              onClick={() => { setReopenReason(''); setReopenOpen(true); setAnchor(null); }}
            >
              Request reopen
            </Button>
          ) : null}
          {activeSiteId && activeSeason?.status === 'reopen_pending' ? (
            <Chip
              size="small"
              color="warning"
              label="Reopen requested"
              sx={{ mt: 1.5, width: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
            />
          ) : null}
      </Popover>

      <Dialog open={endSeasonOpen} onClose={() => !endingSeason && setEndSeasonOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>End {activeSeason?.name || 'this season'}?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This closes the year for the whole site. Everything still growing is uprooted with
            reason &quot;Season closed&quot;. Harvest, sprays, irrigation and manpower stay. Nothing is deleted.
            The year stays on screen until you start a new season. If you start a new year by
            mistake, you cannot reopen this one until you end the new year first.
          </Alert>
          <TextField
            label="End date"
            type="date"
            size="small"
            fullWidth
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: seasonStartDate || undefined, max: farmToday }}
            helperText="Keep today, or pick an earlier last day. This date is stored on the year and used to uproot what is still growing."
            sx={{ mb: 2 }}
          />
          {endDateBackdated ? (
            <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
              Harvest, sprays and other records after {endDate} stay in the app, but this
              year will no longer cover those days in the sidebar range.
            </InfoNote>
          ) : null}
          <Typography variant="body2" sx={{ mb: 1 }}>
            Type <strong>{END_SEASON_CONFIRM}</strong> to confirm.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={endConfirm}
            onChange={(e) => setEndConfirm(e.target.value)}
            placeholder={END_SEASON_CONFIRM}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEndSeasonOpen(false)} disabled={endingSeason}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleEndSeason}
            disabled={endingSeason || endConfirm !== END_SEASON_CONFIRM || endDateInvalid}
          >
            {endingSeason ? 'Ending…' : 'End season'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={reopenOpen} onClose={() => !requestingReopen && setReopenOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Request reopen of {activeSeason?.name || 'this season'}?</DialogTitle>
        <DialogContent>
          <InfoNote mode="line" severity="info" sx={{ mb: 2 }}>
            An auditor must approve this. Only plantings uprooted as &quot;Season closed&quot; come back.
            Cycle uproots stay finished. Writes stay blocked until the auditor approves.
          </InfoNote>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            label="Reason"
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReopenOpen(false)} disabled={requestingReopen}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleRequestReopen}
            disabled={requestingReopen || !reopenReason.trim()}
          >
            {requestingReopen ? 'Submitting…' : 'Request reopen'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
