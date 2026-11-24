import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  EuiButton,
  EuiFieldText,
  EuiForm,
  EuiFormRow,
  EuiSpacer,
} from '@elastic/eui';
import { useAuth } from '../../auth/AuthContext.jsx';
import { AuthFormLayout } from '../../components/AuthFormLayout.jsx';
import { ValidationErrorSummary } from '../../components/ValidationErrorSummary.jsx';
import { ErrorBanner } from '../../components/ErrorBanner.jsx';

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

const FIELD_LABELS = { username: 'Username', password: 'Password' };

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState([]);
  const [apiError, setApiError] = useState(null);

  const validate = () => {
    const next = [];
    if (!username.trim()) next.push({ field: 'username', message: 'the username field is required' });
    else if (!USERNAME_RE.test(username.trim())) {
      next.push({ field: 'username', message: 'the username field contains invalid chars' });
    }
    if (!password) next.push({ field: 'password', message: 'the password field is required' });
    setErrors(next);
    return next.length === 0;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;
    try {
      await login(username.trim(), password);
      navigate('/pics');
    } catch (err) {
      setApiError(err.data?.message || 'We could not sign you in.');
    }
  };

  const fieldError = (field) => errors.find((x) => x.field === field)?.message;

  return (
    <AuthFormLayout title="Sign in to Elaspic">
      <EuiForm component="form" onSubmit={onSubmit}>
        <ValidationErrorSummary errors={errors} fieldLabels={FIELD_LABELS} />
        <EuiFormRow
          label="Username"
          helpText="Letters, numbers, and underscores only."
          isInvalid={!!fieldError('username')}
          error={fieldError('username')}
        >
          <EuiFieldText
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </EuiFormRow>
        <EuiFormRow
          label="Password"
          isInvalid={!!fieldError('password')}
          error={fieldError('password')}
        >
          <EuiFieldText
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </EuiFormRow>
        {apiError && (
          <ErrorBanner title={apiError}>
            <p>Check your username and password, then try again.</p>
          </ErrorBanner>
        )}
        <EuiButton type="submit" fill>
          Sign in
        </EuiButton>
        <EuiSpacer />
        <Link to="/register">Create an account</Link>
      </EuiForm>
    </AuthFormLayout>
  );
}
