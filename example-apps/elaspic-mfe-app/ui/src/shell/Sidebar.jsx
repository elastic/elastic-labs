import { EuiIcon, EuiSideNav } from '@elastic/eui';
import { useLocation, useNavigate } from 'react-router-dom';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const items = [
    {
      id: 'pics',
      name: 'My pictures',
      icon: <EuiIcon type="image" />,
      isSelected: location.pathname.startsWith('/pics'),
      onClick: () => navigate('/pics'),
    },
    {
      id: 'users',
      name: 'Users',
      icon: <EuiIcon type="users" />,
      isSelected: location.pathname.startsWith('/users'),
      onClick: () => navigate('/users'),
    },
  ];

  return <EuiSideNav mobileTitle="Navigate" items={items} />;
}
