import { Navigate, useLocation } from 'react-router-dom';
import { EuiLoadingSpinner } from '@elastic/eui';
import { useAuth } from '../auth/AuthContext.jsx';

export function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <EuiLoadingSpinner size="xl" />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}
