import {
  EuiButtonEmpty,
  EuiHeader,
  EuiHeaderSection,
  EuiHeaderSectionItem,
  EuiIcon,
} from '@elastic/eui';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <EuiHeader position="fixed">
      <EuiHeaderSection grow={false}>
        <EuiHeaderSectionItem>
          <EuiButtonEmpty onClick={() => navigate('/pics')} flush="both">
            <EuiIcon type="logoElastic" size="xl" />
            <strong style={{ marginLeft: 8 }}>Elastic</strong>
          </EuiButtonEmpty>
        </EuiHeaderSectionItem>
      </EuiHeaderSection>
      <EuiHeaderSection side="right" grow={false}>
        <EuiHeaderSectionItem>
          <span style={{ marginRight: 12 }}>{user?.username}</span>
          <EuiButtonEmpty onClick={onLogout} size="s">
            Log out
          </EuiButtonEmpty>
        </EuiHeaderSectionItem>
      </EuiHeaderSection>
    </EuiHeader>
  );
}
