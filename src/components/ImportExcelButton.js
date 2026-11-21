import { Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ModuleIcon } from '../config/moduleIcons';

// Same roles as the import endpoint (backend historicalImport.routes.ts).
const IMPORT_ROLES = ['operation_manager', 'worker', 'agronomist'];

/** Opens Import from Excel with this form already picked. */
export default function ImportExcelButton({ target, sx }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  if (!IMPORT_ROLES.includes(user?.role)) return null;
  return (
    <Button variant="outlined" size="small" onClick={() => navigate(`/admin/import?target=${target}`)}
      startIcon={<ModuleIcon d="M12 15V3M8 7l4-4 4 4M4 15v5h16v-5" size={16} />} sx={{ flexShrink: 0, ...sx }}>
      Import from Excel
    </Button>
  );
}
