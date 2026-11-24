import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EuiAvatar,
  EuiCard,
  EuiFlexGrid,
  EuiFlexItem,
  EuiPageHeader,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ErrorBanner } from '../../components/ErrorBanner.jsx';

export default function UsersList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);

  const load = () =>
    api
      .users()
      .then(({ data }) => {
        setUsers(data.filter((u) => u.id !== user?.id));
        setError(null);
      })
      .catch(() => setError('We could not load the user list.'));

  useEffect(() => {
    load();
  }, [user?.id]);

  return (
    <>
      <EuiPageHeader pageTitle="Users" />
      <EuiSpacer />
      {error && (
        <ErrorBanner title={error} onRetry={load}>
          <p>There may be a temporary connection issue.</p>
        </ErrorBanner>
      )}
      {!error && users.length === 0 && (
        <EuiText color="subdued">
          <p>No other users yet.</p>
        </EuiText>
      )}
      {!error && users.length > 0 && (
        <EuiFlexGrid columns={3} gutterSize="m">
          {users.map((u) => (
            <EuiFlexItem key={u.id}>
              <EuiCard
                title={u.username}
                icon={<EuiAvatar size="l" name={u.username} />}
                onClick={() => navigate(`/users/${u.id}`)}
              />
            </EuiFlexItem>
          ))}
        </EuiFlexGrid>
      )}
    </>
  );
}
