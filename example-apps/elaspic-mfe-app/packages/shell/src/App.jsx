import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { EuiLoadingSpinner } from '@elastic/eui';
import { Shell } from './shell/Shell.jsx';
import { RequireAuth } from './shell/RequireAuth.jsx';

const LoginPage = lazy(() => import('@elaspic/mfe-identity/LoginPage'));
const RegisterPage = lazy(() => import('@elaspic/mfe-identity/RegisterPage'));
const PicsRoutes = lazy(() => import('@elaspic/mfe-pics/PicsRoutes'));
const UsersRoutes = lazy(() => import('@elaspic/mfe-users/UsersRoutes'));
const ErrorPageRoute = lazy(() => import('./pages/ErrorPageRoute.jsx'));

function Lazy({ children }) {
  return <Suspense fallback={<EuiLoadingSpinner size="xl" />}>{children}</Suspense>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Shell />}>
        <Route index element={<Navigate to="/login" replace />} />
        <Route
          path="login"
          element={
            <Lazy>
              <LoginPage />
            </Lazy>
          }
        />
        <Route
          path="register"
          element={
            <Lazy>
              <RegisterPage />
            </Lazy>
          }
        />
        <Route
          path="pics/*"
          element={
            <RequireAuth>
              <Lazy>
                <PicsRoutes />
              </Lazy>
            </RequireAuth>
          }
        />
        <Route
          path="users/*"
          element={
            <RequireAuth>
              <Lazy>
                <UsersRoutes />
              </Lazy>
            </RequireAuth>
          }
        />
        <Route
          path="error/:code"
          element={
            <Lazy>
              <ErrorPageRoute />
            </Lazy>
          }
        />
        <Route path="*" element={<Navigate to="/error/404" replace />} />
      </Route>
    </Routes>
  );
}